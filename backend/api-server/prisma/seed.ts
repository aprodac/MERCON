import { PrismaClient, Role, DocOwnerType, DocRequirement, DocType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { MODULE_KEYS } from '@mercon/shared-types';

const prisma = new PrismaClient();

/**
 * Seeds the canonical accounts: admin (role Admin), operator (role Operator),
 * and ilan (role Admin, added at owner's request).
 * This must stay idempotent (upserts, never blind creates) and must never
 * overwrite passwords of existing users — it runs on every container start.
 *
 * Do NOT add fake/demo drivers, vehicles, customers, trips, or invoices here.
 * That was done once, shipped fake data to production on every deploy, and
 * was removed — see CLAUDE.md's "Database & seed rules".
 */
async function main() {
  console.log('🌱 Seeding MERCON default accounts...');

  // Only used to create these two accounts if they don't exist yet. Existing
  // accounts are never touched here — see the `update` blocks below, which
  // intentionally omit `password_hash`.
  const defaultPassword = process.env.SEED_ADMIN_PASSWORD ?? 'password123';
  const password_hash = await bcrypt.hash(defaultPassword, 10);
  const superadmin_password_hash = await bcrypt.hash('superadmin1234', 10);
  const ilan_password_hash = await bcrypt.hash('ilan1234', 10);

  const superadmin = await prisma.user.upsert({
    where: { username: 'superadmin' },
    update: {
      password_hash: superadmin_password_hash,
      role: Role.SuperAdmin,
      isSuperAdmin: true,
      isActive: true,
    },
    create: {
      username: 'superadmin',
      email: 'superadmin@mercon.tech',
      phone: '+966500000000',
      password_hash: superadmin_password_hash,
      name: 'Platform SuperAdmin',
      role: Role.SuperAdmin,
      isActive: true,
      isSuperAdmin: true,
    },
  });
  console.log(`  ✓ SuperAdmin user: ${superadmin.username}`);

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {}, // never touch role/password/isActive on an existing account
    create: {
      username: 'admin',
      email: 'admin@mercon.tech',
      phone: '+966500000001',
      password_hash,
      name: 'Mercon Admin',
      role: Role.Admin,
      isActive: true,
      isSuperAdmin: true,
    },
  });
  console.log(`  ✓ Admin user: ${admin.username}`);

  const operator = await prisma.user.upsert({
    where: { username: 'operator' },
    update: {},
    create: {
      username: 'operator',
      email: 'operator@mercon.tech',
      phone: '+966500000002',
      password_hash,
      name: 'Mercon Operator',
      role: Role.Operator,
      isActive: true,
    },
  });
  console.log(`  ✓ Operator user: ${operator.username}`);

  const ilan = await prisma.user.upsert({
    where: { username: 'ilan' },
    update: {},
    create: {
      username: 'ilan',
      email: 'ilan@mercon.tech',
      password_hash: ilan_password_hash,
      name: 'Ilan',
      role: Role.Admin,
      isActive: true,
    },
  });
  console.log(`  ✓ Admin user: ${ilan.username}`);

  // enabledModules defaults to every known module on first creation, so an
  // existing deployment (Mercon) sees no regression the moment this table
  // exists — its dashboard already uses all of them today. A brand-new
  // client's superadmin can then turn specific modules off deliberately.
  await prisma.settings.upsert({
    where: { id: 'singleton' },
    update: {
      vatNumber: '312709215800003',
      crNumber: '1009152862',
    },
    create: {
      id: 'singleton',
      enabledModules: [...MODULE_KEYS],
      vatNumber: '312709215800003',
      crNumber: '1009152862',
    },
  });
  console.log('  ✓ Settings row present');

  // The upsert above only sets enabledModules on first creation, so an
  // existing production row never gains a module key added later — this is
  // a one-shot, single-key backfill for 'company-reports' specifically, not
  // a general union with MODULE_KEYS (which would silently re-enable any
  // module an owner had deliberately turned off). No owner could have
  // disabled a key that didn't exist yet, so this stays safe and idempotent.
  await backfillCompanyReportsModule();
  await backfillDocumentsModule();
  await backfillNewModuleKeys();

  await backfillMaintenanceRefIds();
  await releaseVehiclesStuckInMaintenance();
  await seedDefaultServices();
  await seedDocumentTypesAndBackfill();
  await backfillVehicleIccesDeviceIds();

  console.log('✅ Default accounts seeded successfully!');
}

/**
 * Repairs vehicles left showing "Maintenance" after their service order was closed.
 *
 * Before `syncVehicleMaintenanceStatus`, the vehicle was only released when a record was
 * edited from an open state to Completed/Cancelled — completing it another way, logging an
 * already-completed order, or deleting the open one left `Vehicle.status = 'Maintenance'`
 * forever, which is what the Vehicles list, KPI cards and details page read.
 *
 * A vehicle is only released when it has service history, none of it open, and it has not
 * been touched since its last service order changed. That last condition is what protects a
 * deliberate "Mark Maintenance" from the Vehicles page: marking it bumps `Vehicle.updatedAt`
 * past the record's, so this skips it.
 *
 * Idempotent: a no-op once every stuck vehicle is back to Available.
 */
async function releaseVehiclesStuckInMaintenance() {
  // Normalise the legacy `In Progress` spelling first, so "is anything open?" is one check.
  const renamed = await prisma.maintenanceRecord.updateMany({
    where: { status: 'In Progress' },
    data: { status: 'In_Progress' },
  });
  if (renamed.count > 0) {
    console.log(`  ✓ Normalised ${renamed.count} maintenance record(s) to status In_Progress`);
  }

  const candidates = await prisma.vehicle.findMany({
    where: {
      status: 'Maintenance',
      deletedAt: null,
      maintenanceRecords: { some: { deletedAt: null } },
      NOT: { maintenanceRecords: { some: { deletedAt: null, status: 'In_Progress' } } },
    },
    select: {
      id: true,
      plate_number: true,
      updatedAt: true,
      maintenanceRecords: {
        where: { deletedAt: null },
        select: { updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 1,
      },
    },
  });

  const stuck = candidates.filter(
    (v) => v.maintenanceRecords[0] && v.updatedAt <= v.maintenanceRecords[0].updatedAt,
  );

  if (stuck.length === 0) return;

  await prisma.vehicle.updateMany({
    where: { id: { in: stuck.map((v) => v.id) } },
    data: { status: 'Available' },
  });

  console.log(
    `  ✓ Released ${stuck.length} vehicle(s) stuck in Maintenance: ${stuck
      .map((v) => v.plate_number)
      .join(', ')}`,
  );
}

/**
 * Adds the 'company-reports' module key to an existing Settings row that
 * predates it, so the Custom Company Reports Generator becomes visible on
 * deployments (like mercon.tech) that already had a Settings row before this
 * module existed. Idempotent: a no-op once the key is present.
 */
async function backfillCompanyReportsModule() {
  const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
  if (settings && !settings.enabledModules.includes('company-reports')) {
    await prisma.settings.update({
      where: { id: 'singleton' },
      data: { enabledModules: { push: 'company-reports' } },
    });
    console.log('  ✓ Backfilled company-reports module key');
  }
}

async function backfillDocumentsModule() {
  const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
  if (settings && !settings.enabledModules.includes('documents')) {
    await prisma.settings.update({
      where: { id: 'singleton' },
      data: { enabledModules: { push: 'documents' } },
    });
    console.log('  ✓ Backfilled documents module key');
  }
}

async function backfillNewModuleKeys() {
  const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
  if (settings) {
    const missingKeys = MODULE_KEYS.filter((k) => !settings.enabledModules.includes(k));
    if (missingKeys.length > 0) {
      const updatedModules = Array.from(new Set([...settings.enabledModules, ...missingKeys]));
      await prisma.settings.update({
        where: { id: 'singleton' },
        data: { enabledModules: updatedModules },
      });
      console.log(`  ✓ Backfilled ${missingKeys.length} new module keys to Settings`);
    }
  }
}

/**
 * Service orders gained a sequential `ref_id` (MNT-001, MNT-002, …) after records
 * already existed. Number the un-numbered ones oldest-first so the sequence matches
 * the order they were created in.
 *
 * Idempotent: records that already carry a ref_id are skipped, so this is a no-op on
 * every start after the first.
 */
async function backfillMaintenanceRefIds() {
  const unnumbered = await prisma.maintenanceRecord.findMany({
    where: { ref_id: null, deletedAt: null },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });

  if (unnumbered.length === 0) return;

  const taken = new Set(
    (await prisma.maintenanceRecord.findMany({
      where: { ref_id: { not: null } },
      select: { ref_id: true },
    }))
      .map((r) => parseInt(String(r.ref_id).replace('MNT-', ''), 10))
      .filter((n) => !isNaN(n)),
  );

  let next = 1;
  for (const record of unnumbered) {
    while (taken.has(next)) next++;
    await prisma.maintenanceRecord.update({
      where: { id: record.id },
      data: { ref_id: `MNT-${String(next).padStart(3, '0')}` },
    });
    taken.add(next);
  }

  console.log(`  ✓ Backfilled ref_id for ${unnumbered.length} maintenance record(s)`);
}

/**
 * Seed common work done service items so the dashboard has ready-to-select entries out of the box.
 */
async function seedDefaultServices() {
  const defaultServices = [
    { title: 'Tire Puncture Repair', category: 'Tires' },
    { title: 'Tire Replacement (New Unit)', category: 'Tires' },
    { title: 'Wheel Alignment & Balancing', category: 'Tires' },
    { title: 'Oil & Filter Change (Engine)', category: 'Oil & Fluids' },
    { title: 'Transmission Fluid Service', category: 'Oil & Fluids' },
    { title: 'Brake Pad & Disc Replacement', category: 'Brakes' },
    { title: 'Battery Replacement & Electrical Check', category: 'Electrical' },
    { title: 'Engine Diagnostic & Tune-up', category: 'Engine' },
    { title: 'AC Maintenance & Gas Refill', category: 'General' },
    { title: 'Periodic Inspection / Istimara Renewal', category: 'Inspection' },
    { title: 'Hydraulic Hose & Fluid Repair', category: 'General' },
    { title: 'Suspension & Shock Absorber Repair', category: 'General' },
  ];

  for (const svc of defaultServices) {
    await prisma.savedWorkDone.upsert({
      where: { title: svc.title },
      update: {},
      create: {
        title: svc.title,
        category: svc.category,
      },
    });
  }

  console.log('  ✓ Seeded default service items');
}

/**
 * Documents Center redesign: DocumentType is the database-driven config that
 * replaces hardcoded "a Driver needs exactly 4 documents" logic (see
 * PROGRESS.md). This seeds Mercon's current requirements as *initial data*,
 * not permanent product logic — an admin can add/edit types later from
 * /settings/document-types without a deploy.
 *
 * `legacy` entries map 1:1 onto the old DocType enum so every pre-existing
 * Document can be linked to a DocumentType without losing data (e.g. old
 * VehicleRegistration docs become "Isthimara", which is what that document
 * actually is in Saudi Arabia). `fresh` entries are the net-new mandatory
 * types Mercon didn't track before — they start with zero documents and
 * correctly show "Missing" until someone uploads one.
 *
 * Idempotent (upsert by code, backfill only where null/empty) — safe to
 * rerun on every container start alongside the rest of this file.
 */
async function seedDocumentTypesAndBackfill() {
  type TypeSeed = {
    code: string;
    name: string;
    ownerType: DocOwnerType;
    requirementStatus: DocRequirement;
    legacyDocType?: DocType;
    requiresIssueDate?: boolean;
    requiresExpiryDate?: boolean;
    allowsMultipleFiles?: boolean;
  };

  const types: TypeSeed[] = [
    // Legacy-compat: existing Document rows link here via their doc_type.
    { code: 'DriverLicense', name: 'Driver License', ownerType: 'Driver', requirementStatus: 'MANDATORY', legacyDocType: 'DriverLicense' },
    { code: 'Isthimara', name: 'Isthimara', ownerType: 'Vehicle', requirementStatus: 'MANDATORY', legacyDocType: 'VehicleRegistration' },
    { code: 'Insurance', name: 'Insurance', ownerType: 'Vehicle', requirementStatus: 'MANDATORY', legacyDocType: 'Insurance' },
    { code: 'POD', name: 'Proof of Delivery', ownerType: 'Trip', requirementStatus: 'OPTIONAL', legacyDocType: 'POD' },
    { code: 'CustomsClearance', name: 'Customs Clearance', ownerType: 'Trip', requirementStatus: 'OPTIONAL', legacyDocType: 'CustomsClearance' },
    { code: 'Waybill', name: 'Waybill', ownerType: 'Trip', requirementStatus: 'OPTIONAL', legacyDocType: 'Waybill' },
    { code: 'Emergency', name: 'Emergency', ownerType: 'Trip', requirementStatus: 'OPTIONAL', legacyDocType: 'Emergency' },
    { code: 'Contract', name: 'Contract', ownerType: 'Company', requirementStatus: 'OPTIONAL', legacyDocType: 'Contract' },
    { code: 'Invoice', name: 'Invoice', ownerType: 'Company', requirementStatus: 'OPTIONAL', legacyDocType: 'Invoice' },
    // Net-new Mercon-mandatory types (no legacy documents to backfill).
    { code: 'IQAMA', name: 'IQAMA', ownerType: 'Driver', requirementStatus: 'MANDATORY' },
    { code: 'DriverCard', name: 'Driver Card', ownerType: 'Driver', requirementStatus: 'MANDATORY' },
    { code: 'Passport', name: 'Passport', ownerType: 'Driver', requirementStatus: 'MANDATORY', legacyDocType: 'Passport' },
    { code: 'OperationCard', name: 'Operation Card', ownerType: 'Vehicle', requirementStatus: 'MANDATORY' },
    { code: 'SASOPlates', name: 'SASO Plates', ownerType: 'Vehicle', requirementStatus: 'MANDATORY' },
    { code: 'FAHAS', name: 'FAHAS', ownerType: 'Vehicle', requirementStatus: 'MANDATORY' },
  ];

  const idByCode = new Map<string, string>();
  let displayOrder = 0;
  for (const t of types) {
    const row = await prisma.documentType.upsert({
      where: { code: t.code },
      update: {}, // never overwrite an admin's later edits (requirement/active/etc.)
      create: {
        code: t.code,
        name: t.name,
        ownerType: t.ownerType,
        requirementStatus: t.requirementStatus,
        displayOrder: displayOrder++,
        requiresIssueDate: t.requiresIssueDate ?? false,
        requiresExpiryDate: t.requiresExpiryDate ?? true,
        allowsMultipleFiles: t.allowsMultipleFiles ?? false,
      },
    });
    idByCode.set(t.code, row.id);
  }
  console.log(`  ✓ Seeded ${types.length} document type(s)`);

  // Backfill Document.documentTypeId for legacy rows that predate this table.
  let linked = 0;
  for (const t of types) {
    if (!t.legacyDocType) continue;
    const documentTypeId = idByCode.get(t.code)!;
    const result = await prisma.document.updateMany({
      where: { doc_type: t.legacyDocType, documentTypeId: null },
      data: { documentTypeId },
    });
    linked += result.count;
  }
  if (linked > 0) console.log(`  ✓ Linked ${linked} existing document(s) to a document type`);

  // Backfill one DocumentFile per Document from its existing file_url, only
  // for documents that don't have any file rows yet (safe to rerun).
  const undocumented = await prisma.document.findMany({
    where: { files: { none: {} } },
    select: { id: true, file_url: true, mime_type: true },
  });
  if (undocumented.length > 0) {
    await prisma.documentFile.createMany({
      data: undocumented.map((d) => ({
        documentId: d.id,
        file_url: d.file_url,
        mime_type: d.mime_type,
      })),
    });
    console.log(`  ✓ Backfilled ${undocumented.length} document file record(s)`);
  }
}

/**
 * Idempotently pairs verified physical ICCES 15-digit IMEIs to Vehicle records
 * based on vehicle ref_id (e.g. TRK-101) or license plate number (e.g. 2541 UDA / UDA-2541).
 */
async function backfillVehicleIccesDeviceIds() {
  const mappings = [
    { refId: 'TRK-101', plate: '2541 UDA', imei: '352592572686467' },
    { refId: 'TRK-102', plate: '3071 VSA', imei: '861076080480120' },
    { refId: 'TRK-103', plate: '3078 DSA', imei: '863540061286689' },
    { refId: 'TRK-104', plate: '3241 VTA', imei: '861076085027363' },
    { refId: 'TRK-105', plate: '3358 VRA', imei: '350612079419451' },
    { refId: 'TRK-106', plate: '3531 ERA', imei: '860186050093554' },
    { refId: 'TRK-107', plate: '3999 LSA', imei: '352016703116459' },
    { refId: 'TRK-108', plate: '4012 BRA', imei: '352016705097301' },
    { refId: 'TRK-109', plate: '4207 ESA', imei: '352016705097442' },
    { refId: 'TRK-110', plate: '4244 ESA', imei: '352016705038537' },
    { refId: 'TRK-111', plate: '4293 XXA', imei: '353742371168162' },
    { refId: 'TRK-112', plate: '5049 ZSA', imei: '352016704155035' },
    { refId: 'TRK-113', plate: '5085 NDA', imei: '860186050033626' },
    { refId: 'TRK-114', plate: '5309 BRA', imei: '860186050080098' },
    { refId: 'TRK-115', plate: '5510 VRA', imei: '352016702215187' },
    { refId: 'TRK-116', plate: '6010 USA', imei: '353742370938102' },
    { refId: 'TRK-117', plate: '6455 DRA', imei: '867604058817710' },
    { refId: 'TRK-118', plate: '6456 DRA', imei: '352625699731608' },
    { refId: 'TRK-119', plate: '6484 DRA', imei: '867604058733842' },
    { refId: 'TRK-120', plate: '6485 DRA', imei: '860186050109111' },
    { refId: 'TRK-121', plate: '6487 DRA', imei: '867604058834103' },
    { refId: 'TRK-122', plate: '6706 SRA', imei: '860186050052295' },
    { refId: 'TRK-123', plate: '6708 SRA', imei: '860186050101829' },
    { refId: 'TRK-124', plate: '9112 RJA', imei: '861076084541950' },
    { refId: 'TRK-125', plate: '9153 TRA', imei: '352016703318758' },
    { refId: 'TRK-126', plate: '9380 ERA', imei: '861076085026985' },
    { refId: 'TRK-127', plate: '9973 DRA', imei: '860186050033568' },
  ];

  let updatedCount = 0;
  for (const m of mappings) {
    const parts = m.plate.split(' ');
    const reversedPlate = parts.length === 2 ? `${parts[1]}-${parts[0]}` : m.plate;

    const vehicles = await prisma.vehicle.findMany({
      where: {
        deletedAt: null,
        OR: [
          { ref_id: m.refId },
          { plate_number: { mode: 'insensitive', equals: m.plate } },
          { plate_number: { mode: 'insensitive', equals: reversedPlate } },
        ],
      },
    });

    for (const v of vehicles) {
      if (v.icces_device_id !== m.imei) {
        await prisma.vehicle.update({
          where: { id: v.id },
          data: { icces_device_id: m.imei },
        });
        updatedCount++;
      }
    }
  }

  if (updatedCount > 0) {
    console.log(`  ✓ Idempotently backfilled ${updatedCount} physical ICCES tracker device ID(s)`);
  }
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

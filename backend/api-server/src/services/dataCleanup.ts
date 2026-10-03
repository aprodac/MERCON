/**
 * Data cleanup — the SuperAdmin "Clean up data" page (Settings). Clears test
 * and demo data from a dev / staging deployment in one go: every trip (live and
 * in the Recycle bin) with its stops, GPS, charges and photos; chosen customers
 * and drivers; test locations; finance transactions.
 *
 * Only allowed when the database name contains "dev" or ALLOW_DATA_CLEANUP=true,
 * so it can't be used on production by accident. Files are not erased: they
 * are moved into `<uploads>/_removed/<time>/`, so photos can be put back.
 */
import fs from 'fs';
import path from 'path';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { getUploadDir } from '../middlewares/upload';
import { logger } from '../utils/logger';

const RUNNING_OR_OPEN = ['Draft', 'Scheduled', 'Loading', 'InTransit', 'Delayed'];
const FINANCE_TABLES = [
  'JournalLine', 'JournalEntry', 'InvoiceLine', 'InvoicePayment', 'CreditNoteLine', 'CreditNote',
  'AdvanceApplication', 'Advance', 'Invoice', 'BillLine', 'BillPayment', 'Bill', 'BankReconciliation',
  'DriverSettlementLine', 'DriverSettlement', 'AccountClosingBalance', 'Expense',
];

/** Looks like something made for testing: "CLAUDE TEST pickup", "ZZ QA Driver", "Claude2 PushTest". */
const TEST_NAME = /(^|[\s_-])(zz|qa|test|demo|dummy|sample)([\s_-]|$)|pushtest|claude/i;
/** The demo seeder's customers use +966 50 111 000x. */
const DEMO_PHONE = /^\+?9665011100\d{2}$/;

export class CleanupError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function cleanupAllowed(): Promise<{ allowed: boolean; database: string }> {
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  const allowed = /dev/i.test(db) || process.env.ALLOW_DATA_CLEANUP === 'true';
  return { allowed, database: db };
}

async function rowsIn(table: string): Promise<number> {
  const [{ exists }] = await prisma.$queryRawUnsafe<{ exists: string | null }[]>(`SELECT to_regclass('"${table}"')::text AS exists`);
  if (!exists) return 0;
  const [{ n }] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "${table}"`);
  return Number(n);
}

/** Everything the page shows before anything is removed. */
export async function previewCleanup() {
  const { allowed, database } = await cleanupAllowed();

  const [liveTrips, binTrips, stops, gps, charges, tripDocs, tripFiles] = await Promise.all([
    prisma.trip.count({ where: { deletedAt: null } }),
    prisma.trip.count({ where: { deletedAt: { not: null } } }),
    prisma.tripStop.count(),
    prisma.tripLocation.count(),
    prisma.tripCharge.count(),
    prisma.document.count({ where: { entity_type: { in: ['Trip', 'TripStop'] } } }),
    prisma.documentFile.count({ where: { document: { entity_type: { in: ['Trip', 'TripStop'] } } } }),
  ]);

  const finance: Record<string, number> = {};
  for (const t of ['Invoice', 'Bill', 'Expense', 'DriverSettlement', 'JournalEntry', 'Advance']) finance[t] = await rowsIn(t);

  const customers = await prisma.customer.findMany({
    where: { deletedAt: null },
    orderBy: { name: 'asc' },
    select: {
      id: true, name: true, contact_phone: true,
      _count: { select: { trips: true, quotations: true, locations: true } },
    },
  });
  const drivers = await prisma.driver.findMany({
    where: { deletedAt: null },
    orderBy: { first_name: 'asc' },
    select: { id: true, first_name: true, last_name: true, phone_primary: true, _count: { select: { trips: true } } },
  });
  const locations = await prisma.location.findMany({
    where: { OR: [{ deletedAt: { not: null } }] },
    select: { id: true, name: true, deletedAt: true, customer: { select: { name: true } } },
  });
  const allLocations = await prisma.location.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, customer: { select: { name: true } }, _count: { select: { quotationStops: true } } },
  });

  return {
    allowed,
    database,
    trips: { live: liveTrips, inRecycleBin: binTrips, stops, gpsPoints: gps, charges, documents: tripDocs, extraFiles: tripFiles },
    finance,
    customers: customers.map((c) => {
      const reason = TEST_NAME.test(c.name) ? 'Test name' : DEMO_PHONE.test(String(c.contact_phone).replace(/\s/g, '')) ? 'Demo phone number' : null;
      return {
        id: c.id, name: c.name, phone: c.contact_phone,
        trips: c._count.trips, quotations: c._count.quotations, locations: c._count.locations,
        suggested: Boolean(reason), reason,
      };
    }),
    drivers: drivers.map((d) => {
      const name = `${d.first_name} ${d.last_name ?? ''}`.trim();
      return { id: d.id, name, phone: d.phone_primary, trips: d._count.trips, suggested: TEST_NAME.test(name), reason: TEST_NAME.test(name) ? 'Test name' : null };
    }),
    locations: [
      ...allLocations
        .filter((l) => TEST_NAME.test(l.name))
        .map((l) => ({ id: l.id, name: l.name, customer: l.customer?.name ?? null, quotations: l._count.quotationStops, reason: 'Test name' })),
      ...locations.map((l) => ({ id: l.id, name: l.name, customer: l.customer?.name ?? null, quotations: 0, reason: 'In the Recycle bin' })),
    ],
  };
}

export interface CleanupRequest {
  allTrips: boolean;
  finance: boolean;
  customerIds: string[];
  driverIds: string[];
  locationIds: string[];
  /** Must equal the database name — typed by the person on the page. */
  confirm: string;
}

const uuidList = (ids: unknown): string[] =>
  Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)) : [];

/** Removes what was chosen; returns what went. */
export async function runCleanup(input: CleanupRequest, userId: string | null) {
  const { allowed, database } = await cleanupAllowed();
  if (!allowed) throw new CleanupError(403, `Clean up is switched off on "${database}" (not a dev database).`);
  if (String(input.confirm ?? '').trim() !== database) throw new CleanupError(400, `Type the database name "${database}" to confirm.`);

  const customerIds = uuidList(input.customerIds);
  const driverIds = uuidList(input.driverIds);
  const locationIds = uuidList(input.locationIds);
  const allTrips = input.allTrips === true;
  // Invoices and settlements are built from trips — removing every trip takes them too.
  const finance = input.finance === true || allTrips;
  if (!allTrips && !finance && !customerIds.length && !driverIds.length && !locationIds.length) {
    throw new CleanupError(400, 'Nothing is selected.');
  }

  if (!allTrips) {
    const [custTrips, drvTrips] = await Promise.all([
      customerIds.length ? prisma.trip.count({ where: { customerId: { in: customerIds } } }) : 0,
      driverIds.length ? prisma.trip.count({ where: { OR: [{ driverId: { in: driverIds } }, { co_driver_id: { in: driverIds } }] } }) : 0,
    ]);
    if (custTrips || drvTrips) {
      throw new CleanupError(409, `The chosen ${custTrips ? 'customers' : 'drivers'} still have ${custTrips || drvTrips} trips. Tick "All trips" too.`);
    }
  }
  if (!allTrips && driverIds.length) {
    const open = await prisma.trip.count({ where: { status: { in: RUNNING_OR_OPEN as any }, OR: [{ driverId: { in: driverIds } }] } });
    if (open) throw new CleanupError(409, 'A chosen driver is on an open trip.');
  }

  // The files to move once the database change has committed.
  const docWhere: Prisma.DocumentWhereInput[] = [];
  if (allTrips) docWhere.push({ entity_type: { in: ['Trip', 'TripStop'] } });
  if (customerIds.length) docWhere.push({ entity_type: 'Customer', entity_id: { in: customerIds } });
  if (driverIds.length) docWhere.push({ entity_type: 'Driver', entity_id: { in: driverIds } });
  const docs = docWhere.length
    ? await prisma.document.findMany({ where: { OR: docWhere }, select: { id: true, file_url: true, files: { select: { file_url: true } } } })
    : [];
  const docIds = docs.map((d) => d.id);
  const fileUrls = Array.from(new Set(docs.flatMap((d) => [d.file_url, ...d.files.map((f) => f.file_url)]).filter(Boolean)));

  const counts: Record<string, number> = {};
  await prisma.$transaction(async (tx) => {
    const exec = (sql: string, ...params: unknown[]) => tx.$executeRawUnsafe(sql, ...params);

    if (docIds.length) {
      await exec(`DELETE FROM "DocumentFile" WHERE "documentId" = ANY($1::uuid[])`, docIds);
      counts.documents = await exec(`DELETE FROM "Document" WHERE id = ANY($1::uuid[])`, docIds);
    }
    if (allTrips || driverIds.length) {
      counts.notifications = await exec(
        `DELETE FROM "Notification" WHERE ($1 AND entity_type IN ('Trip','TripStop')) OR "driverId" = ANY($2::uuid[])`,
        allTrips, driverIds,
      );
    }

    if (finance) {
      const present: string[] = [];
      for (const t of FINANCE_TABLES) {
        const [{ exists }] = await tx.$queryRawUnsafe<{ exists: string | null }[]>(`SELECT to_regclass('"${t}"')::text AS exists`);
        if (exists) present.push(`"${t}"`);
      }
      counts.invoices = await rowsIn('Invoice');
      if (present.length) await exec(`TRUNCATE ${present.join(', ')} CASCADE`);
    }
    if (allTrips) {
      counts.trips = await tx.trip.count();
      await exec(`TRUNCATE "Trip" CASCADE`);
    }

    if (customerIds.length || locationIds.length) {
      // Quotations of the removed customers, and any quotation that stops at a removed location.
      const quotationIds = (
        await tx.$queryRawUnsafe<{ id: string }[]>(
          `SELECT DISTINCT q.id FROM "Quotation" q LEFT JOIN "QuotationStop" s ON s."quotationId" = q.id
            WHERE q."customerId" = ANY($1::uuid[]) OR s."locationId" = ANY($2::uuid[])`,
          customerIds, locationIds,
        )
      ).map((r) => r.id);
      await exec(`DELETE FROM "SurchargeRule" WHERE "customerId" = ANY($1::uuid[]) OR "quotationId" = ANY($2::uuid[])`, customerIds, quotationIds);
      counts.quotations = await exec(`DELETE FROM "Quotation" WHERE id = ANY($1::uuid[])`, quotationIds);
      await exec(`DELETE FROM "ReportTemplate" WHERE "customerId" = ANY($1::uuid[])`, customerIds);
      counts.locations = await exec(`DELETE FROM "Location" WHERE id = ANY($1::uuid[]) OR "customerId" = ANY($2::uuid[])`, locationIds, customerIds);
      counts.customers = await exec(`DELETE FROM "Customer" WHERE id = ANY($1::uuid[])`, customerIds);
    }

    if (driverIds.length) {
      const users = (await tx.driver.findMany({ where: { id: { in: driverIds } }, select: { userId: true } }))
        .map((d) => d.userId)
        .filter((u): u is string => Boolean(u));
      await exec(`UPDATE "Document" SET "executorDriverId" = NULL WHERE "executorDriverId" = ANY($1::uuid[])`, driverIds);
      counts.drivers = await exec(`DELETE FROM "Driver" WHERE id = ANY($1::uuid[])`, driverIds);
      if (users.length) await exec(`UPDATE "User" SET "deletedAt" = NOW(), "isActive" = false WHERE id = ANY($1::uuid[])`, users);
    }

    if (allTrips) {
      await exec(`UPDATE "Driver" SET status = 'Available' WHERE status = 'OnTrip'`);
      await exec(`UPDATE "Vehicle" SET status = 'Available' WHERE status = 'OnTrip'`);
    }
  }, { timeout: 120_000, maxWait: 10_000 });

  // Files: moved aside, never erased here.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  let moved = 0;
  const holdDir = path.join(getUploadDir(), '_removed', stamp);
  for (const url of fileUrls) {
    const name = path.basename(url.split('/uploads/').pop() ?? '');
    if (!name || name === '.' || name === '..') continue;
    for (const dir of Array.from(new Set([getUploadDir(), path.resolve(process.cwd(), 'uploads'), path.resolve('/tmp/uploads')]))) {
      const from = path.join(dir, name);
      if (!fs.existsSync(from)) continue;
      try {
        fs.mkdirSync(holdDir, { recursive: true });
        fs.renameSync(from, path.join(holdDir, name));
        moved++;
      } catch (err) {
        logger.warn({ err, file: from }, '[DataCleanup] Could not move file');
      }
      break;
    }
  }

  logger.warn({ userId, database, allTrips, finance, customers: customerIds.length, drivers: driverIds.length, locations: locationIds.length, counts, moved }, '[DataCleanup] Data removed');
  return { database, counts, filesMoved: moved, filesFolder: moved ? holdDir : null };
}

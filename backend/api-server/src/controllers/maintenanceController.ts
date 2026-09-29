import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { DOCUMENT_LIST_SELECT, DOCUMENT_FILES_SELECT } from '../utils/documentSelect';
import { generateRefId } from '../utils/refId';
import { logger } from '../utils/logger';
import { syncVehicleMaintenanceStatus, ACTIVE_MAINTENANCE_STATUSES } from '../utils/vehicleMaintenanceStatus';
import { syncSingleMaintenanceExpense } from '../utils/syncMaintenanceExpense';
import { buildSearchAnd } from '../utils/search';
import { itemsProblem, orderTotals, type ItemInput } from '../services/maintenance/engine';

/** Fields the maintenance ledger search bar looks at. */
const MAINTENANCE_SEARCH_FIELDS = [
  'ref_id',
  'workshop_name',
  'invoice_number',
  'remarks',
  'work_done',
  'vehicle.plate_number',
  'vehicle.ref_id',
];

/** Service orders are numbered MNT-001, MNT-002, … and gaps are refilled on delete. */
const MAINTENANCE_REF_PREFIX = 'MNT';
const MAINTENANCE_REF_PAD = 3;

export const nextMaintenanceRefId = () =>
  generateRefId(
    MAINTENANCE_REF_PREFIX,
    () => prisma.maintenanceRecord.findMany({ where: { deletedAt: null }, select: { ref_id: true } }),
    { padLength: MAINTENANCE_REF_PAD },
  );

/** Midnight today, used to reject back-dated / far-future scheduling. */
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Dates arrive as `''`, `null`, `undefined` or an ISO/`YYYY-MM-DD` string. Anything
 * that is not a real date must become `null` — handing Prisma an empty string or an
 * Invalid Date throws and surfaces as a bare 500.
 */
const toDate = (value?: string | Date | null): Date | null => {
  if (value === undefined || value === null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
};

export const getMaintenanceRecords = async (req: Request, res: Response) => {
  try {
    const { vehicle_id, status, maintenance_type, system, search, page = '1', per_page = '50' } = req.query;

    const pageNumber = parseInt(page as string);
    const limit = parseInt(per_page as string);
    const skip = (pageNumber - 1) * limit;

    const whereClause: any = { deletedAt: null };

    if (vehicle_id && vehicle_id !== 'all') {
      whereClause.vehicleId = vehicle_id as string;
    }

    if (status && status !== 'all') {
      // Legacy rows stored the open state as `In Progress` (space) before the enum
      // settled on `In_Progress` — filtering must return both.
      whereClause.status =
        status === 'In_Progress' ? { in: ACTIVE_MAINTENANCE_STATUSES } : (status as string);
    }

    if (maintenance_type && maintenance_type !== 'all') {
      whereClause.maintenance_type = maintenance_type as string;
    }

    if (system && system !== 'all') {
      whereClause.system = system as string;
    }

    const searchAnd = buildSearchAnd(search, MAINTENANCE_SEARCH_FIELDS);
    if (searchAnd.length > 0) {
      whereClause.AND = searchAnd;
    }

    const [records, total, allRecordsForKpi] = await Promise.all([
      prisma.maintenanceRecord.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: [{ start_date: 'desc' }, { service_date: 'desc' }],
        include: {
          vehicle: {
            select: {
              id: true,
              plate_number: true,
              ref_id: true,
              asset_type: true,
              status: true,
              current_odometer: true,
            },
          },
          items: { select: { kind: true, description: true, amount: true }, orderBy: { sort_order: 'asc' } },
        },
      }),
      prisma.maintenanceRecord.count({ where: whereClause }),
      prisma.maintenanceRecord.findMany({
        where: { deletedAt: null, ...(vehicle_id && vehicle_id !== 'all' ? { vehicleId: vehicle_id as string } : {}) },
        select: { cost: true, status: true, maintenance_type: true },
      }),
    ]);

    const totalCost = allRecordsForKpi.reduce((sum, r) => sum + Number(r.cost || 0), 0);
    const activeCount = allRecordsForKpi.filter((r) => r.status === 'In_Progress' || r.status === 'In Progress').length;
    const scheduledCount = allRecordsForKpi.filter((r) => r.status === 'Scheduled').length;
    const completedCount = allRecordsForKpi.filter((r) => r.status === 'Completed').length;
    const renewalCost = allRecordsForKpi
      .filter((r) => r.maintenance_type === 'Renewal')
      .reduce((sum, r) => sum + Number(r.cost || 0), 0);

    res.json({
      success: true,
      data: records,
      kpis: {
        total_cost: totalCost,
        active_count: activeCount,
        scheduled_count: scheduledCount,
        completed_count: completedCount,
        renewal_cost: renewalCost,
      },
      meta: {
        page: pageNumber,
        per_page: limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch maintenance records' },
    });
  }
};

/**
 * Fetch saved workshops from database merged with historical workshop names from service orders.
 */
export const getWorkshops = async (_req: Request, res: Response) => {
  try {
    const [savedWorkshops, records] = await Promise.all([
      prisma.savedWorkshop.findMany({
        where: { deletedAt: null, isActive: true },
        orderBy: { name: 'asc' },
      }),
      prisma.maintenanceRecord.findMany({
        where: { deletedAt: null, workshop_name: { not: '' } },
        select: { workshop_name: true, workshop_contact: true, start_date: true },
        orderBy: { start_date: 'desc' },
      }),
    ]);

    const workshopsMap = new Map<
      string,
      {
        id?: string;
        name: string;
        contact: string | null;
        address: string | null;
        notes: string | null;
        is_saved: boolean;
        order_count: number;
        last_used?: Date | string;
      }
    >();

    for (const sw of savedWorkshops) {
      workshopsMap.set(sw.name.toLowerCase(), {
        id: sw.id,
        name: sw.name,
        contact: sw.contact_phone ?? null,
        address: sw.address ?? null,
        notes: sw.notes ?? null,
        is_saved: true,
        order_count: 0,
      });
    }

    for (const record of records) {
      const name = record.workshop_name?.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const existing = workshopsMap.get(key);
      if (existing) {
        existing.order_count += 1;
        if (!existing.last_used) existing.last_used = record.start_date;
        if (!existing.contact && record.workshop_contact) existing.contact = record.workshop_contact;
      } else {
        workshopsMap.set(key, {
          name,
          contact: record.workshop_contact ?? null,
          address: null,
          notes: null,
          is_saved: false,
          order_count: 1,
          last_used: record.start_date,
        });
      }
    }

    res.json({ success: true, data: Array.from(workshopsMap.values()) });
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch workshops');
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch workshops' },
    });
  }
};

export const createSavedWorkshop = async (req: Request, res: Response) => {
  try {
    const { name, contact_phone, address, notes } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Workshop name is required' },
      });
    }

    const trimmedName = name.trim();
    const workshop = await prisma.savedWorkshop.upsert({
      where: { name: trimmedName },
      update: {
        contact_phone: contact_phone?.trim() || null,
        address: address?.trim() || null,
        notes: notes?.trim() || null,
        deletedAt: null,
        isActive: true,
      },
      create: {
        name: trimmedName,
        contact_phone: contact_phone?.trim() || null,
        address: address?.trim() || null,
        notes: notes?.trim() || null,
        created_by: (req as any).user?.id,
      },
    });

    res.status(201).json({ success: true, data: workshop });
  } catch (error) {
    logger.error({ err: error }, 'Failed to create saved workshop');
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to save workshop' },
    });
  }
};

export const deleteSavedWorkshop = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await prisma.savedWorkshop.delete({
      where: { id },
    });
    res.json({ success: true, message: 'Saved workshop permanently deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Failed to delete saved workshop');
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to delete workshop' },
    });
  }
};

/**
 * Some entries in the workshop picker aren't SavedWorkshop rows at all —
 * they're just a name someone typed directly into a past maintenance record.
 * There's no id to delete, so "deleting" one here means scrubbing that name
 * (and its contact) off every past record that used it.
 */
export const clearWorkshopNameFromHistory = async (req: Request, res: Response) => {
  try {
    const name = ((req.query.name as string) || '').trim();
    if (!name) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Workshop name is required' },
      });
    }

    const savedMatch = await prisma.savedWorkshop.findFirst({
      where: { deletedAt: null, name: { equals: name, mode: 'insensitive' } },
    });
    if (savedMatch) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'This is a saved workshop — delete it by id instead.' },
      });
    }

    const result = await prisma.maintenanceRecord.updateMany({
      where: { deletedAt: null, workshop_name: { equals: name, mode: 'insensitive' } },
      data: { workshop_name: '', workshop_contact: null },
    });

    res.json({ success: true, message: `Cleared "${name}" from ${result.count} maintenance record(s)` });
  } catch (error) {
    logger.error({ err: error }, 'Failed to clear workshop name from history');
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to clear workshop name' },
    });
  }
};

export const getSavedWorkItems = async (_req: Request, res: Response) => {
  try {
    const items = await prisma.savedWorkDone.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: [{ category: 'asc' }, { title: 'asc' }],
    });

    res.json({ success: true, data: items });
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch saved work items');
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch work items' },
    });
  }
};

export const createSavedWorkItem = async (req: Request, res: Response) => {
  try {
    const { title, category } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Work item title is required' },
      });
    }

    const trimmedTitle = title.trim();
    const item = await prisma.savedWorkDone.upsert({
      where: { title: trimmedTitle },
      update: {
        category: category?.trim() || 'General',
        deletedAt: null,
        isActive: true,
      },
      create: {
        title: trimmedTitle,
        category: category?.trim() || 'General',
        created_by: (req as any).user?.id,
      },
    });

    res.status(201).json({ success: true, data: item });
  } catch (error) {
    logger.error({ err: error }, 'Failed to create saved work item');
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to save work item' },
    });
  }
};

export const deleteSavedWorkItem = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await prisma.savedWorkDone.delete({
      where: { id },
    });
    res.json({ success: true, message: 'Saved work item permanently deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Failed to delete saved work item');
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to delete work item' },
    });
  }
};

const findMaintenanceRecordByIdOrRef = async (idOrRef: string) => {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrRef);
  return prisma.maintenanceRecord.findFirst({
    where: {
      OR: isUuid ? [{ id: idOrRef }, { ref_id: idOrRef }] : [{ ref_id: idOrRef }],
      deletedAt: null,
    },
    include: {
      vehicle: true,
      items: { orderBy: { sort_order: 'asc' }, include: { servicePlan: { select: { id: true, task: true } } } },
    },
  });
};

export const getMaintenanceRecordById = async (req: Request, res: Response) => {
  try {
    const recordId = req.params.id as string;
    const record = await findMaintenanceRecordByIdOrRef(recordId);

    if (!record) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Maintenance record not found' },
      });
    }

    const documents = await prisma.document.findMany({
      where: { entity_type: 'MaintenanceRecord', entity_id: record.id, deletedAt: null },
      select: DOCUMENT_LIST_SELECT,
    });

    res.json({
      success: true,
      data: {
        ...record,
        documents,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch maintenance record details' },
    });
  }
};

const maintenanceSchema = z.object({
  vehicle_id: z.string().uuid(),
  workshop_name: z.string().min(1, 'Workshop name is required'),
  workshop_contact: z.string().optional().nullable(),
  maintenance_type: z.enum(['Routine', 'Repair', 'Inspection', 'Renewal', 'Emergency']),
  system: z.enum(['engine', 'axles', 'air_system', 'brakes', 'tires', 'electrical', 'others']).optional().nullable().default('others'),
  status: z.enum(['Scheduled', 'In_Progress', 'Completed', 'Cancelled']).default('Completed'),
  start_date: z.string().or(z.date()).optional(),
  end_date: z.string().or(z.date()).optional().nullable(),
  service_date: z.string().or(z.date()).optional(),
  work_done: z.string().optional().nullable(),
  odometer_reading: z.union([z.string(), z.number()]).transform((v) => parseFloat(v as string)),
  cost: z.union([z.string(), z.number()]).optional().transform((v) => (v ? parseFloat(v as string) : 0)),
  invoice_number: z.string().optional().nullable(),
  invoice_url: z.string().optional().nullable(),
  next_service_due: z.string().or(z.date()).optional().nullable(),
  remarks: z.string().optional().nullable(),
  /** Cost lines before VAT; when sent, `cost` is worked out from them (+ vat_amount). */
  items: z
    .array(
      z.object({
        kind: z.enum(['part', 'labour', 'other']).default('other'),
        description: z.string().trim().min(1).max(300),
        quantity: z.union([z.string(), z.number()]).transform((v) => parseFloat(v as string)),
        unit_price: z.union([z.string(), z.number()]).transform((v) => parseFloat(v as string)),
        service_plan_id: z.string().uuid().optional().nullable(),
      }),
    )
    .max(100)
    .optional(),
  vat_amount: z.union([z.string(), z.number()]).optional().nullable().transform((v) => (v === '' || v == null ? 0 : parseFloat(v as string))),
  payment_status: z.enum(['Paid', 'Pending']).optional(),
  payment_account_id: z.string().uuid().optional().nullable(),
  expected_end_date: z.string().or(z.date()).optional().nullable(),
});

type ItemsIn = NonNullable<z.infer<typeof maintenanceSchema>['items']>;
const toItemInputs = (items: ItemsIn): ItemInput[] =>
  items.map((i) => ({ kind: i.kind, description: i.description, quantity: i.quantity, unit_price: i.unit_price, servicePlanId: i.service_plan_id ?? null }));

/** A "paid from" account must be an active bank or cash account. */
async function paymentAccountProblem(accountId?: string | null): Promise<string | null> {
  if (!accountId) return null;
  const bank = await prisma.bankAccount.findFirst({ where: { accountId, deletedAt: null, isActive: true } });
  return bank ? null : 'Paid from must be an active bank or cash account.';
}

/**
 * Shared date rules for a service order. Returns an error message, or null when the
 * window is coherent.
 *
 * `enforceNotBackdated` is only applied on create: an existing record legitimately
 * holds old dates, and editing an unrelated field must not fail because of them.
 */
function validateDateWindow({
  startDateVal,
  endDateVal,
  nextServiceDueVal,
  enforceNotBackdated,
}: {
  startDateVal: Date | null;
  endDateVal: Date | null;
  nextServiceDueVal: Date | null;
  enforceNotBackdated: boolean;
}): string | null {
  const today = startOfToday();

  if (enforceNotBackdated && startDateVal && startDateVal < today) {
    return 'Start date cannot be in the past — a service order starts today or later.';
  }

  if (startDateVal && endDateVal && endDateVal < startDateVal) {
    return 'End date cannot be before the start date.';
  }

  if (enforceNotBackdated && endDateVal && endDateVal < today) {
    return 'End date cannot be in the past.';
  }

  if (nextServiceDueVal && startDateVal && nextServiceDueVal < startDateVal) {
    return 'Next service due cannot be before the start date.';
  }

  return null;
}

export const createMaintenanceRecord = async (req: Request, res: Response) => {
  try {
    const parseResult = maintenanceSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parseResult.error.issues[0].message,
          details: parseResult.error.format(),
        },
      });
    }

    const {
      vehicle_id,
      workshop_name,
      workshop_contact,
      maintenance_type,
      system,
      status,
      start_date,
      end_date,
      service_date,
      work_done,
      odometer_reading,
      cost,
      invoice_number,
      invoice_url,
      next_service_due,
      remarks,
      items,
      vat_amount,
      payment_status,
      payment_account_id,
      expected_end_date,
    } = parseResult.data;

    // Cost lines: from the request, or the single cost as one line (older clients send only cost)
    const itemInputs: ItemInput[] = items
      ? toItemInputs(items)
      : Number(cost) > 0
        ? [{ kind: 'other', description: work_done?.trim() || maintenance_type, quantity: 1, unit_price: Number(cost) }]
        : [];
    const vatVal = items ? Number(vat_amount) || 0 : 0;
    const linesProblem = itemsProblem(itemInputs, vatVal) ?? (await paymentAccountProblem(payment_account_id));
    if (linesProblem) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: linesProblem } });
    }
    const totals = orderTotals(itemInputs, vatVal);

    const startDateVal = toDate(start_date) ?? toDate(service_date) ?? new Date();
    const serviceDateVal = toDate(service_date) ?? startDateVal;
    const endDateVal = toDate(end_date) ?? (status === 'Completed' ? serviceDateVal : null);
    const nextServiceDueVal = toDate(next_service_due);

    const dateError = validateDateWindow({
      startDateVal,
      endDateVal,
      nextServiceDueVal,
      // A new open or scheduled order starts today or later; a completed one is history being
      // logged (it sets when a planned service was last done), so it may be in the past.
      enforceNotBackdated: status !== 'Completed',
    });
    if (dateError) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: dateError },
      });
    }

    const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicle_id, deletedAt: null } });
    if (!vehicle) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Selected vehicle does not exist.' },
      });
    }

    // ref_id is unique; two operators saving at the same instant can pick the same
    // number, so retry on collision rather than failing the save.
    let record;
    for (let attempt = 0; ; attempt++) {
      try {
        record = await prisma.maintenanceRecord.create({
          data: {
            ref_id: await nextMaintenanceRefId(),
            vehicleId: vehicle_id,
            workshop_name,
            workshop_contact: workshop_contact || null,
            maintenance_type,
            system: system || 'others',
            status: status || 'Completed',
            start_date: startDateVal,
            end_date: endDateVal,
            service_date: serviceDateVal,
            work_done: work_done || null,
            odometer_reading: Number.isFinite(odometer_reading) ? odometer_reading : 0,
            cost: totals.total,
            vat_amount: totals.vat,
            payment_status: payment_status || 'Paid',
            paymentAccountId: payment_account_id || null,
            expected_end_date: toDate(expected_end_date),
            items: {
              create: totals.lines.map((l) => ({
                kind: l.kind,
                description: l.description.trim(),
                quantity: l.quantity,
                unit_price: l.unit_price,
                amount: l.amount,
                servicePlanId: l.servicePlanId || null,
                sort_order: l.sort_order,
              })),
            },
            invoice_number: invoice_number || null,
            invoice_url: invoice_url || null,
            next_service_due: nextServiceDueVal,
            remarks: remarks || null,
            created_by: (req as any).user?.id,
          },
          include: {
            vehicle: true,
          },
        });
        break;
      } catch (err: any) {
        if (err?.code === 'P2002' && attempt < 4) {
          logger.warn({ err }, `Maintenance ref_id collision. Retrying attempt ${attempt + 1}...`);
          continue;
        }
        throw err;
      }
    }

    // Keep the vehicle in step with its service orders: an open order puts it in the
    // workshop, logging an already-completed one releases it if nothing else is open.
    await syncVehicleMaintenanceStatus(vehicle_id);
    await syncSingleMaintenanceExpense(record.id);

    if (status === 'Completed' && odometer_reading > vehicle.current_odometer) {
      await prisma.vehicle.update({
        where: { id: vehicle_id },
        data: { current_odometer: odometer_reading },
      });
    }

    res.status(201).json({ success: true, data: record });
  } catch (error) {
    logger.error({ err: error }, 'Failed to create maintenance record');
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to create maintenance record' },
    });
  }
};

export const updateMaintenanceRecord = async (req: Request, res: Response) => {
  try {
    const recordId = req.params.id as string;
    const updateSchema = maintenanceSchema.partial();
    const parseResult = updateSchema.safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parseResult.error.issues[0].message,
          details: parseResult.error.format(),
        },
      });
    }

    const existing = await findMaintenanceRecordByIdOrRef(recordId);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Maintenance record not found' },
      });
    }

    const data: any = { ...parseResult.data };

    // Cost lines replace the order's lines; a bare `cost` (older clients) becomes one line
    let newLines: ReturnType<typeof orderTotals> | null = null;
    if (data.items !== undefined || data.cost !== undefined || data.vat_amount !== undefined) {
      const current = await prisma.maintenanceItem.findMany({ where: { recordId: existing.id }, orderBy: { sort_order: 'asc' } });
      const itemInputs: ItemInput[] = data.items
        ? toItemInputs(data.items)
        : data.cost !== undefined
          ? Number(data.cost) > 0
            ? [{ kind: 'other', description: (data.work_done ?? existing.work_done)?.trim() || existing.maintenance_type, quantity: 1, unit_price: Number(data.cost) }]
            : []
          : current.map((c) => ({ kind: c.kind as ItemInput['kind'], description: c.description, quantity: Number(c.quantity), unit_price: Number(c.unit_price), servicePlanId: c.servicePlanId }));
      const vatVal = data.vat_amount !== undefined ? Number(data.vat_amount) || 0 : data.items ? 0 : Number(existing.vat_amount);
      const problem = itemsProblem(itemInputs, vatVal);
      if (problem) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: problem } });
      newLines = orderTotals(itemInputs, vatVal);
      data.cost = newLines.total;
      data.vat_amount = newLines.vat;
    }
    delete data.items;
    for (const k of ['cost', 'vat_amount', 'payment_account_id', 'expected_end_date']) if (data[k] === undefined) delete data[k];
    if (data.payment_account_id !== undefined) {
      const problem = await paymentAccountProblem(data.payment_account_id);
      if (problem) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: problem } });
      data.paymentAccountId = data.payment_account_id || null;
      delete data.payment_account_id;
    }
    if (data.expected_end_date !== undefined) data.expected_end_date = toDate(data.expected_end_date);

    // Empty strings mean "clear this date". `service_date` and `start_date` are
    // non-nullable in the schema, so an empty value there means "leave untouched".
    for (const field of ['start_date', 'service_date'] as const) {
      if (field in data) {
        const parsed = toDate(data[field]);
        if (parsed) data[field] = parsed;
        else delete data[field];
      }
    }
    for (const field of ['end_date', 'next_service_due'] as const) {
      if (field in data) data[field] = toDate(data[field]);
    }

    if (data.vehicle_id) {
      data.vehicleId = data.vehicle_id;
      delete data.vehicle_id;
    }

    const dateError = validateDateWindow({
      startDateVal: data.start_date ?? existing.start_date,
      endDateVal: 'end_date' in data ? data.end_date : existing.end_date,
      nextServiceDueVal: 'next_service_due' in data ? data.next_service_due : existing.next_service_due,
      enforceNotBackdated: false,
    });
    if (dateError) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: dateError },
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (newLines) {
        await tx.maintenanceItem.deleteMany({ where: { recordId: existing.id } });
        if (newLines.lines.length) {
          await tx.maintenanceItem.createMany({
            data: newLines.lines.map((l) => ({
              recordId: existing.id,
              kind: l.kind,
              description: l.description.trim(),
              quantity: l.quantity,
              unit_price: l.unit_price,
              amount: l.amount,
              servicePlanId: l.servicePlanId || null,
              sort_order: l.sort_order,
            })),
          });
        }
      }
      return tx.maintenanceRecord.update({
        where: { id: existing.id },
        data: { ...data, updated_by: (req as any).user?.id },
        include: { vehicle: true, items: { orderBy: { sort_order: 'asc' } } },
      });
    });

    // Handle Vehicle status transitions and odometer updates
    if (updated.vehicleId) {
      await syncVehicleMaintenanceStatus(updated.vehicleId);
      // Moving the order to another vehicle can leave the old one stuck in the workshop.
      if (existing.vehicleId !== updated.vehicleId) {
        await syncVehicleMaintenanceStatus(existing.vehicleId);
      }

      if (data.odometer_reading && updated.vehicle) {
        if (data.odometer_reading > updated.vehicle.current_odometer) {
          await prisma.vehicle.update({
            where: { id: updated.vehicleId },
            data: { current_odometer: data.odometer_reading },
          });
        }
      }
    }

    await syncSingleMaintenanceExpense(updated.id);

    res.json({ success: true, data: updated });
  } catch (error) {
    logger.error({ err: error }, 'Failed to update maintenance record');
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to update maintenance record' },
    });
  }
};

/**
 * Closes every open service order on a vehicle and puts it back on the road.
 *
 * This is what "Return to service" on the Vehicles page calls. Doing it here (rather than
 * writing `Vehicle.status = 'Available'` straight from the UI) keeps the two modules
 * telling the same story: the workshop record is closed, so the vehicle is out of the
 * workshop — instead of a vehicle that says Available next to a service order that still
 * says In Progress.
 */
export const returnVehicleToService = async (req: Request, res: Response) => {
  try {
    const vehicleId = req.params.vehicleId as string;

    const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, deletedAt: null } });
    if (!vehicle) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Vehicle not found' },
      });
    }

    const openOrders = await prisma.maintenanceRecord.findMany({
      where: { vehicleId, deletedAt: null, status: { in: ACTIVE_MAINTENANCE_STATUSES } },
      select: { id: true, end_date: true },
    });

    const now = new Date();
    for (const order of openOrders) {
      await prisma.maintenanceRecord.update({
        where: { id: order.id },
        data: {
          status: 'Completed',
          end_date: order.end_date ?? now,
          updated_by: (req as any).user?.id,
        },
      });
      await syncSingleMaintenanceExpense(order.id);
    }

    await syncVehicleMaintenanceStatus(vehicleId);

    res.json({
      success: true,
      data: { closed_orders: openOrders.length },
      message:
        openOrders.length > 0
          ? `Closed ${openOrders.length} open service order(s) and returned the vehicle to service`
          : 'Vehicle returned to service',
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to return vehicle to service');
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to return vehicle to service' },
    });
  }
};

export const deleteMaintenanceRecord = async (req: Request, res: Response) => {
  try {
    const recordId = req.params.id as string;
    const existing = await findMaintenanceRecordByIdOrRef(recordId);

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Maintenance record not found' },
      });
    }

    await prisma.maintenanceRecord.delete({
      where: { id: existing.id }
    });

    // Deleting the order that put the vehicle in the workshop must let it out again.
    await syncVehicleMaintenanceStatus(existing.vehicleId);
    await syncSingleMaintenanceExpense(existing.id);

    res.json({ success: true, message: 'Maintenance record deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Failed to delete maintenance record');
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to delete maintenance record' },
    });
  }
};

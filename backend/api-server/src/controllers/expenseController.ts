import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { generateRefId } from '../utils/refId';
import { logger } from '../utils/logger';
import { expenseLinkProblem, FIXED_COST_EXPENSE_CATEGORIES } from '@mercon/shared-types';
import { buildExpenseWhere, expenseOrderBy, filterDate, previousRange, summarizeExpenses } from '../utils/expenseSummary';


/** What an expense shows of its trip. */
const TRIP_SELECT = { id: true, ref_id: true, status: true, is_third_party: true, vehicleId: true, driverId: true, deletedAt: true } as const;

/** Expenses are numbered EXP-001, EXP-002, … and gaps are refilled on delete. */
const EXPENSE_REF_PREFIX = 'EXP';
const EXPENSE_REF_PAD = 3;

export const nextExpenseRefId = () =>
  generateRefId(
    EXPENSE_REF_PREFIX,
    () => prisma.expense.findMany({ where: { deletedAt: null }, select: { ref_id: true } }),
    { padLength: EXPENSE_REF_PAD },
  );

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

import { syncAllMaintenanceRecordsToExpenses } from '../utils/syncMaintenanceExpense';

export const getExpenses = async (req: Request, res: Response) => {
  try {
    // Ensure all active vehicle maintenance records are mirrored in the Expenses ledger
    await syncAllMaintenanceRecordsToExpenses();

    const { page = '1', per_page = '50', sort } = req.query;

    const pageNumber = parseInt(page as string);
    const limit = parseInt(per_page as string);
    const skip = (pageNumber - 1) * limit;

    const whereClause = buildExpenseWhere(req.query);

    const [records, total, kpiTotals] = await Promise.all([
      prisma.expense.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: expenseOrderBy(sort),
        include: {
          driver: { select: { id: true, first_name: true, last_name: true, ref_id: true, deletedAt: true } },
          vehicle: { select: { id: true, plate_number: true, ref_id: true, deletedAt: true } },
          trip: { select: TRIP_SELECT },
        },
      }),
      prisma.expense.count({ where: whereClause }),
      // KPI totals across every expense, summed in the database. This used to
      // read every non-deleted expense row into Node and reduce over it — on
      // EVERY page of EVERY expense list request, including each keystroke of a
      // search — so the whole table was scanned and shipped just to produce
      // four numbers.
      prisma.expense.groupBy({
        by: ['status', 'category'],
        where: { deletedAt: null },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);

    const SALARY_CATEGORIES = new Set(['Salary', 'Salary Advance']);
    let totalAmount = 0;
    let paidAmount = 0;
    let pendingAmount = 0;
    let salaryAmount = 0;
    let kpiCount = 0;
    for (const row of kpiTotals) {
      const sum = Number(row._sum.amount ?? 0);
      totalAmount += sum;
      kpiCount += row._count._all;
      if (row.status === 'Paid') paidAmount += sum;
      if (row.status === 'Pending') pendingAmount += sum;
      if (row.category && SALARY_CATEGORIES.has(row.category)) salaryAmount += sum;
    }

    res.json({
      success: true,
      data: records,
      kpis: {
        total_amount: totalAmount,
        paid_amount: paidAmount,
        pending_amount: pendingAmount,
        salary_amount: salaryAmount,
        total_count: kpiCount,
      },
      meta: {
        page: pageNumber,
        per_page: limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch expenses');
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch expenses' },
    });
  }
};

const findExpenseByIdOrRef = async (idOrRef: string) => {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrRef);
  return prisma.expense.findFirst({
    where: {
      OR: isUuid ? [{ id: idOrRef }, { ref_id: idOrRef }] : [{ ref_id: idOrRef }],
      deletedAt: null,
    },
    include: {
      driver: { select: { id: true, first_name: true, last_name: true, ref_id: true, deletedAt: true } },
      vehicle: { select: { id: true, plate_number: true, ref_id: true, deletedAt: true } },
      trip: { select: TRIP_SELECT },
    },
  });
};

/**
 * Totals for the expenses page header, over the same filters as the list: spend, paid and
 * pending, by category, by month, truck / driver / overhead split, top payees, and the spend of
 * the previous equal-length period when a date range is given.
 */
export const getExpenseSummary = async (req: Request, res: Response) => {
  try {
    const where = buildExpenseWhere(req.query);
    const from = filterDate(req.query.date_from);
    const to = filterDate(req.query.date_to, true);
    const [rows, previous] = await Promise.all([
      prisma.expense.findMany({
        where,
        select: { amount: true, status: true, category: true, expense_date: true, vehicleId: true, driverId: true, tripId: true, payee: true },
      }),
      from && to
        ? (() => {
            const p = previousRange(from, to);
            return prisma.expense.aggregate({
              where: { ...buildExpenseWhere(req.query, { withDates: false }), expense_date: { gte: p.from, lte: p.to } },
              _sum: { amount: true },
            });
          })()
        : Promise.resolve(null),
    ]);
    res.json({ success: true, data: summarizeExpenses(rows, { from, to }, previous ? Number(previous._sum.amount ?? 0) : null) });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to summarise expenses');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

export const getExpenseById = async (req: Request, res: Response) => {
  try {
    const record = await findExpenseByIdOrRef(req.params.id as string);
    if (!record) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Expense not found' },
      });
    }
    res.json({ success: true, data: record });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch expense details' },
    });
  }
};

type LinkResult = { ok: true; tripId: string | null; vehicleId: string | null; driverId: string | null } | { ok: false; message: string };

/**
 * The links an expense will carry, checked against the category rules. A trip brings its own truck
 * and driver (they are copied, so truck P&L keeps counting the cost). A truck's recurring cost of the
 * same kind (e.g. insurance set up in Vehicle cost setup) can't also be recorded as an expense.
 */
async function resolveExpenseLinks(input: {
  category: string;
  status: string;
  tripId: string | null;
  vehicleId: string | null;
  driverId: string | null;
  expenseDate: Date;
}): Promise<LinkResult> {
  let { vehicleId, driverId } = input;
  let tripIsThirdParty = false;
  if (input.tripId) {
    const trip = await prisma.trip.findFirst({ where: { id: input.tripId, deletedAt: null }, select: { is_third_party: true, vehicleId: true, driverId: true } });
    if (!trip) return { ok: false, message: 'Selected trip does not exist.' };
    tripIsThirdParty = trip.is_third_party;
    vehicleId = trip.vehicleId;
    driverId = trip.driverId;
  }
  const problem = expenseLinkProblem({ category: input.category, status: input.status, tripId: input.tripId, vehicleId, driverId, tripIsThirdParty });
  if (problem) return { ok: false, message: problem };

  if (driverId && !input.tripId) {
    const driver = await prisma.driver.findFirst({ where: { id: driverId, deletedAt: null }, select: { id: true } });
    if (!driver) return { ok: false, message: 'Selected driver does not exist.' };
  }
  if (vehicleId) {
    const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, deletedAt: null }, select: { id: true, plate_number: true } });
    if (!vehicle && !input.tripId) return { ok: false, message: 'Selected vehicle does not exist.' };
    const category = input.category.trim();
    if (vehicle && FIXED_COST_EXPENSE_CATEGORIES.includes(category)) {
      const fixed = await prisma.vehicleFixedCost.findFirst({
        where: {
          vehicleId,
          deletedAt: null,
          category: { equals: category, mode: 'insensitive' },
          start_date: { lte: input.expenseDate },
          OR: [{ end_date: null }, { end_date: { gte: input.expenseDate } }],
        },
        select: { id: true },
      });
      if (fixed) {
        return {
          ok: false,
          message: `${vehicle.plate_number} already has ${category.toLowerCase()} set up as a recurring cost in Vehicle cost setup, so its P&L counts it there. Record it without the truck, or change the cost setup.`,
        };
      }
    }
  }
  return { ok: true, tripId: input.tripId, vehicleId, driverId };
}

const expenseSchema = z.object({
  category: z.string().min(1, 'Category is required'),
  status: z.enum(['Paid', 'Pending']).default('Paid'),
  driver_id: z.string().uuid().optional().nullable(),
  vehicle_id: z.string().uuid().optional().nullable(),
  trip_id: z.string().uuid().optional().nullable(),
  payee: z.string().optional().nullable(),
  amount: z.union([z.string(), z.number()]).transform((v) => parseFloat(v as string)),
  currency: z.string().optional(),
  expense_date: z.string().or(z.date()).optional(),
  payment_method: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  bill_issued_date: z.string().or(z.date()).optional().nullable(),
  bill_paid_date: z.string().or(z.date()).optional().nullable(),
});

export const createExpense = async (req: Request, res: Response) => {
  try {
    const parseResult = expenseSchema.safeParse(req.body);
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
      category, status, driver_id, vehicle_id, trip_id, payee, amount, currency, expense_date,
      payment_method, description, bill_issued_date, bill_paid_date,
    } = parseResult.data;

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Amount must be a positive number.' },
      });
    }

    const expenseDate = toDate(expense_date) ?? new Date();
    const links = await resolveExpenseLinks({
      category,
      status: status || 'Paid',
      tripId: trip_id || null,
      vehicleId: vehicle_id || null,
      driverId: driver_id || null,
      expenseDate,
    });
    if (!links.ok) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: links.message } });
    }

    // ref_id is unique; two operators saving at the same instant can pick the same
    // number, so retry on collision rather than failing the save.
    let record;
    for (let attempt = 0; ; attempt++) {
      try {
        record = await prisma.expense.create({
          data: {
            ref_id: await nextExpenseRefId(),
            category,
            status: status || 'Paid',
            driverId: links.driverId,
            vehicleId: links.vehicleId,
            tripId: links.tripId,
            payee: payee || null,
            amount,
            currency: currency || 'SAR',
            expense_date: expenseDate,
            payment_method: payment_method || null,
            description: description || null,
            bill_issued_date: toDate(bill_issued_date),
            bill_paid_date: toDate(bill_paid_date),
            created_by: (req as any).user?.id,
          },
          include: {
            driver: { select: { id: true, first_name: true, last_name: true, ref_id: true, deletedAt: true } },
            vehicle: { select: { id: true, plate_number: true, ref_id: true, deletedAt: true } },
            trip: { select: TRIP_SELECT },
          },
        });
        break;
      } catch (err: any) {
        if (err?.code === 'P2002' && attempt < 4) {
          logger.warn({ err }, `Expense ref_id collision. Retrying attempt ${attempt + 1}...`);
          continue;
        }
        throw err;
      }
    }

    res.status(201).json({ success: true, data: record });
  } catch (error) {
    logger.error({ err: error }, 'Failed to create expense');
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to create expense' },
    });
  }
};

export const updateExpense = async (req: Request, res: Response) => {
  try {
    const updateSchema = expenseSchema.partial();
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

    const existing = await findExpenseByIdOrRef(req.params.id as string);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Expense not found' },
      });
    }

    const data: any = { ...parseResult.data };

    // Check the links as they will be after the update, not just the fields sent
    const nextDate = 'expense_date' in data ? toDate(data.expense_date) ?? existing.expense_date : existing.expense_date;
    const links = await resolveExpenseLinks({
      category: data.category ?? existing.category,
      status: data.status ?? existing.status,
      tripId: 'trip_id' in data ? data.trip_id || null : existing.tripId,
      vehicleId: 'vehicle_id' in data ? data.vehicle_id || null : existing.vehicleId,
      driverId: 'driver_id' in data ? data.driver_id || null : existing.driverId,
      expenseDate: nextDate,
    });
    if (!links.ok) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: links.message } });
    }
    delete data.trip_id;
    delete data.driver_id;
    delete data.vehicle_id;
    data.tripId = links.tripId;
    data.vehicleId = links.vehicleId;
    data.driverId = links.driverId;

    if ('amount' in data && (!Number.isFinite(data.amount) || data.amount <= 0)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Amount must be a positive number.' },
      });
    }

    if ('expense_date' in data) {
      const parsed = toDate(data.expense_date);
      if (parsed) data.expense_date = parsed;
      else delete data.expense_date;
    }

    // Both nullable, unlike expense_date — an empty value here means "clear
    // it", not "leave the existing one alone".
    if ('bill_issued_date' in data) data.bill_issued_date = toDate(data.bill_issued_date);
    if ('bill_paid_date' in data) data.bill_paid_date = toDate(data.bill_paid_date);

    const updated = await prisma.expense.update({
      where: { id: existing.id },
      data: {
        ...data,
        updated_by: (req as any).user?.id,
      },
      include: {
        driver: { select: { id: true, first_name: true, last_name: true, ref_id: true, deletedAt: true } },
        vehicle: { select: { id: true, plate_number: true, ref_id: true, deletedAt: true } },
        trip: { select: TRIP_SELECT },
      },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    logger.error({ err: error }, 'Failed to update expense');
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to update expense' },
    });
  }
};

export const deleteExpense = async (req: Request, res: Response) => {
  try {
    const existing = await findExpenseByIdOrRef(req.params.id as string);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Expense not found' },
      });
    }

    await prisma.expense.delete({
      where: { id: existing.id }
    });

    res.json({ success: true, message: 'Expense permanently deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Failed to delete expense');
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to delete expense' },
    });
  }
};

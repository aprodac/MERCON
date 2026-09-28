import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { generateRefId } from '../utils/refId';
import { logger } from '../utils/logger';
import { VEHICLE_REQUIRED_EXPENSE_CATEGORIES } from '@mercon/shared-types';
import { buildSearchAnd } from '../utils/search';

/** Fields the expenses ledger search bar looks at. */
const EXPENSE_SEARCH_FIELDS = [
  'ref_id',
  'category',
  'payee',
  'description',
  'driver.first_name',
  'driver.last_name',
  'vehicle.plate_number',
];

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

    const { category, status, driver_id, vehicle_id, date_from, date_to, search, page = '1', per_page = '50' } = req.query;

    const pageNumber = parseInt(page as string);
    const limit = parseInt(per_page as string);
    const skip = (pageNumber - 1) * limit;

    const whereClause: any = { deletedAt: null };

    if (category && category !== 'all') {
      whereClause.category = category as string;
    }

    if (status && status !== 'all') {
      whereClause.status = status as string;
    }

    if (driver_id && driver_id !== 'all') {
      whereClause.driverId = driver_id as string;
    }

    if (vehicle_id && vehicle_id !== 'all') {
      whereClause.vehicleId = vehicle_id as string;
    }

    if (date_from || date_to) {
      whereClause.expense_date = {};
      if (date_from) whereClause.expense_date.gte = toDate(date_from as string) ?? undefined;
      if (date_to) whereClause.expense_date.lte = toDate(date_to as string) ?? undefined;
    }

    const searchAnd = buildSearchAnd(search, EXPENSE_SEARCH_FIELDS);
    if (searchAnd.length > 0) {
      whereClause.AND = searchAnd;
    }

    const [records, total, kpiTotals] = await Promise.all([
      prisma.expense.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: [{ expense_date: 'desc' }],
        include: {
          driver: { select: { id: true, first_name: true, last_name: true, ref_id: true, deletedAt: true } },
          vehicle: { select: { id: true, plate_number: true, ref_id: true, deletedAt: true } },
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
    },
  });
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

/**
 * Truck-only categories must name the truck, or Vehicle P&L can't count them.
 * Not enforced while Pending — a placeholder only knows its category yet.
 */
const needsVehicle = (category: string | null | undefined) =>
  VEHICLE_REQUIRED_EXPENSE_CATEGORIES.includes((category || '').trim());
const vehicleRequiredMessage = (category: string) => `Choose the vehicle this ${category.toLowerCase()} expense is for.`;

const expenseSchema = z.object({
  category: z.string().min(1, 'Category is required'),
  status: z.enum(['Paid', 'Pending']).default('Paid'),
  driver_id: z.string().uuid().optional().nullable(),
  vehicle_id: z.string().uuid().optional().nullable(),
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
      category, status, driver_id, vehicle_id, payee, amount, currency, expense_date,
      payment_method, description, bill_issued_date, bill_paid_date,
    } = parseResult.data;

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Amount must be a positive number.' },
      });
    }

    if (status !== 'Pending' && needsVehicle(category) && !vehicle_id) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: vehicleRequiredMessage(category) } });
    }

    if (driver_id) {
      const driver = await prisma.driver.findFirst({ where: { id: driver_id, deletedAt: null } });
      if (!driver) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Selected driver does not exist.' },
        });
      }
    }

    if (vehicle_id) {
      const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicle_id, deletedAt: null } });
      if (!vehicle) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Selected vehicle does not exist.' },
        });
      }
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
            driverId: driver_id || null,
            vehicleId: vehicle_id || null,
            payee: payee || null,
            amount,
            currency: currency || 'SAR',
            expense_date: toDate(expense_date) ?? new Date(),
            payment_method: payment_method || null,
            description: description || null,
            bill_issued_date: toDate(bill_issued_date),
            bill_paid_date: toDate(bill_paid_date),
            created_by: (req as any).user?.id,
          },
          include: {
            driver: { select: { id: true, first_name: true, last_name: true, ref_id: true, deletedAt: true } },
            vehicle: { select: { id: true, plate_number: true, ref_id: true, deletedAt: true } },
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

    // Check the expense as it will be after the update, not just the fields sent
    const nextCategory = data.category ?? existing.category;
    const nextVehicle = 'vehicle_id' in data ? data.vehicle_id : existing.vehicleId;
    const nextStatus = data.status ?? existing.status;
    if (nextStatus !== 'Pending' && needsVehicle(nextCategory) && !nextVehicle) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: vehicleRequiredMessage(nextCategory) } });
    }

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

    if ('driver_id' in data) {
      data.driverId = data.driver_id || null;
      delete data.driver_id;
    }
    if ('vehicle_id' in data) {
      data.vehicleId = data.vehicle_id || null;
      delete data.vehicle_id;
    }

    const updated = await prisma.expense.update({
      where: { id: existing.id },
      data: {
        ...data,
        updated_by: (req as any).user?.id,
      },
      include: {
        driver: { select: { id: true, first_name: true, last_name: true, ref_id: true, deletedAt: true } },
        vehicle: { select: { id: true, plate_number: true, ref_id: true, deletedAt: true } },
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

import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { generateRefId } from '../utils/refId';
import { logger } from '../utils/logger';
import { expenseLinkProblem, FIXED_COST_EXPENSE_CATEGORIES } from '@mercon/shared-types';
import { buildExpenseWhere, expenseOrderBy, filterDate, previousRange, summarizeExpenses } from '../utils/expenseSummary';
import { expenseLedgerStatus, inLedgerExpenseIds, syncExpenseLedger } from '../utils/expenseLedger';


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

    const posted = await inLedgerExpenseIds(records.map((r) => r.id));
    res.json({
      success: true,
      data: records.map((r) => ({ ...r, ledger_posted: posted.has(r.id) })),
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
  /** Bank or cash GL account a paid expense came out of. */
  payment_account_id: z.string().uuid().optional().nullable(),
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
      payment_method, description, bill_issued_date, bill_paid_date, payment_account_id,
    } = parseResult.data;

    const paymentProblem = await checkPaymentAccount(payment_account_id);
    if (paymentProblem) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: paymentProblem } });
    }

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
            paymentAccountId: payment_account_id || null,
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

    // Post to the ledger; the expense is saved either way, the result says if it didn't post
    const ledger = await syncExpenseLedger(record!.id, (req as any).user?.id);
    res.status(201).json({ success: true, data: { ...record, ledger_posted: ledger.entries.length > 0 }, ledger });
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
    if ('payment_account_id' in data) {
      const paymentProblem = await checkPaymentAccount(data.payment_account_id);
      if (paymentProblem) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: paymentProblem } });
      }
      data.paymentAccountId = data.payment_account_id || null;
      delete data.payment_account_id;
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

    const ledger = await syncExpenseLedger(updated.id, (req as any).user?.id);
    res.json({ success: true, data: { ...updated, ledger_posted: ledger.entries.length > 0 }, ledger });
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
    // Reverses anything it had posted (dated today, so closed periods keep their figures)
    await syncExpenseLedger(existing.id, (req as any).user?.id);

    res.json({ success: true, message: 'Expense permanently deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Failed to delete expense');
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to delete expense' },
    });
  }
};

/** A paid expense's "paid from" must be a bank or cash account (Finance → Bank & cash). */
async function checkPaymentAccount(id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  const bank = await prisma.bankAccount.findFirst({ where: { accountId: id, deletedAt: null }, include: { account: true } });
  if (!bank || !bank.account.isActive || bank.account.deletedAt || !bank.account.is_postable) return 'Choose a bank or cash account that is active.';
  return null;
}

/* ─── Ledger ─────────────────────────────────────────────────────────────── */

/** GET /expenses/:id/ledger: what is posted for the expense, what it should post, and any problem. */
export const getExpenseLedger = async (req: Request, res: Response) => {
  try {
    const existing = await findExpenseByIdOrRef(req.params.id as string);
    if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Expense not found' } });
    const status = await expenseLedgerStatus(existing.id);
    const accountIds = [...new Set(status.planned.flatMap((p) => p.lines.map((l) => l.accountId)))];
    const accounts = await prisma.account.findMany({ where: { id: { in: accountIds } }, select: { id: true, account_code: true, name: true } });
    res.json({ success: true, data: { ...status, accounts } });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to read expense ledger');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

/** POST /expenses/:id/ledger: post (or repost) now. */
export const postExpenseLedger = async (req: Request, res: Response) => {
  try {
    const existing = await findExpenseByIdOrRef(req.params.id as string);
    if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Expense not found' } });
    const result = await syncExpenseLedger(existing.id, (req as any).user?.id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to post expense');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

/**
 * POST /expenses/ledger/post-unposted: post the expenses matching the list filters that have no
 * ledger entry yet (at most 500 per call). Returns how many posted and why the others didn't.
 * `fallback_payment_account_id` fills in "paid from" on paid expenses that were saved without one.
 */
export const postUnpostedExpenses = async (req: Request, res: Response) => {
  try {
    const { fallback_payment_account_id: fallbackRaw, ...filters } = req.body ?? {};
    const fallback = typeof fallbackRaw === 'string' && fallbackRaw ? fallbackRaw : null;
    const fallbackProblem = await checkPaymentAccount(fallback);
    if (fallbackProblem) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: fallbackProblem } });
    const where = buildExpenseWhere(filters);
    const candidates = await prisma.expense.findMany({ where, select: { id: true, ref_id: true }, orderBy: { expense_date: 'asc' }, take: 2000 });
    const posted = await inLedgerExpenseIds(candidates.map((c) => c.id));
    const todo = candidates.filter((c) => !posted.has(c.id)).slice(0, 500);
    let done = 0;
    const problems = new Map<string, { message: string; count: number; example: string }>();
    for (const c of todo) {
      if (fallback) await prisma.expense.updateMany({ where: { id: c.id, status: 'Paid', paymentAccountId: null }, data: { paymentAccountId: fallback } });
      const r = await syncExpenseLedger(c.id, (req as any).user?.id);
      if (r.entries.length > 0 && !r.problem) done += 1;
      else if (r.problem) {
        // One line per month for missing periods, not one per day.
        const month = r.problem.match(/^No open accounting period covers (\d{4}-\d{2})-\d{2}/)?.[1];
        const key = month ? `No open accounting period for ${month}. Open it in Finance → Accounting periods.` : r.problem;
        const p = problems.get(key) ?? { message: key, count: 0, example: c.ref_id ?? c.id };
        p.count += 1;
        problems.set(key, p);
      }
    }
    res.json({ success: true, data: { considered: todo.length, posted: done, remaining: candidates.length - posted.size - todo.length, problems: [...problems.values()] } });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to post unposted expenses');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

/** GET /expenses/ledger/setup: the category → account map, the default, payables, and what isn't posted. */
export const getExpenseLedgerSetup = async (_req: Request, res: Response) => {
  try {
    const s = await prisma.settings.findUnique({ where: { id: 'singleton' } });
    const ids = (await prisma.expense.findMany({ where: { deletedAt: null }, select: { id: true } })).map((e) => e.id);
    const posted = await inLedgerExpenseIds(ids);
    res.json({
      success: true,
      data: {
        enabled: Boolean(s?.defaultExpenseAccountId),
        default_expense_account_id: s?.defaultExpenseAccountId ?? null,
        category_accounts: (s?.expenseAccountMap as Record<string, string> | null) ?? {},
        payable_account_id: s?.defaultPayableAccountId ?? null,
        unposted_count: ids.length - posted.size,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

const setupSchema = z.object({
  default_expense_account_id: z.string().uuid().nullable(),
  category_accounts: z.record(z.string().min(1), z.string().uuid()),
  /** Accounts payable, used by to-pay expenses (the same account bills use). */
  payable_account_id: z.string().uuid().nullable().optional(),
});

/** PUT /expenses/ledger/setup (Admin): which accounts expenses post to. */
export const updateExpenseLedgerSetup = async (req: Request, res: Response) => {
  try {
    const parsed = setupSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
    const { default_expense_account_id, category_accounts, payable_account_id } = parsed.data;
    const expenseIds = [...new Set([default_expense_account_id, ...Object.values(category_accounts)].filter((x): x is string => Boolean(x)))];
    const accounts = await prisma.account.findMany({ where: { id: { in: expenseIds } } });
    const bad = expenseIds.find((id) => {
      const a = accounts.find((x) => x.id === id);
      return !a || a.account_type !== 'Expense' || !a.is_postable || !a.isActive || a.deletedAt;
    });
    if (bad) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Every expense account must be an active, postable account of type Expense.' } });
    if (payable_account_id) {
      const ap = await prisma.account.findUnique({ where: { id: payable_account_id } });
      if (!ap || ap.account_type !== 'Liability' || !ap.is_postable || !ap.isActive || ap.deletedAt) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Accounts payable must be an active, postable Liability account.' } });
      }
    }
    await prisma.settings.update({
      where: { id: 'singleton' },
      data: {
        defaultExpenseAccountId: default_expense_account_id,
        expenseAccountMap: category_accounts,
        ...(payable_account_id !== undefined ? { defaultPayableAccountId: payable_account_id } : {}),
        updated_by: (req as any).user?.id,
      },
    });
    res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to save expense ledger setup');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

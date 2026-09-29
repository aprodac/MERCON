/**
 * Expense list filters and the summary the expenses page shows above the list. Pure functions,
 * so the arithmetic is tested without a database.
 */
import { buildSearchAnd } from './search';

/** Fields the expenses ledger search bar looks at. */
export const EXPENSE_SEARCH_FIELDS = [
  'ref_id',
  'category',
  'payee',
  'description',
  'driver.first_name',
  'driver.last_name',
  'vehicle.plate_number',
];

export interface ExpenseQuery {
  category?: unknown;
  status?: unknown;
  driver_id?: unknown;
  vehicle_id?: unknown;
  payment_method?: unknown;
  /** 'vehicle' (has a truck), 'driver' (has a driver), 'overhead' (neither). */
  linked?: unknown;
  date_from?: unknown;
  date_to?: unknown;
  search?: unknown;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' && v !== 'all' ? v : undefined);

/** A date filter value; a bare `YYYY-MM-DD` upper bound covers that whole day. */
export function filterDate(value: unknown, endOfDay = false): Date | undefined {
  const s = str(value);
  if (!s) return undefined;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`) : new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

/** Prisma `where` for the expense list and summary (deleted rows never count). */
export function buildExpenseWhere(q: ExpenseQuery, opts: { withDates?: boolean } = {}): Record<string, unknown> {
  const where: Record<string, any> = { deletedAt: null };
  const category = str(q.category);
  const status = str(q.status);
  const driver = str(q.driver_id);
  const vehicle = str(q.vehicle_id);
  const method = str(q.payment_method);
  const linked = str(q.linked);
  if (category) where.category = category;
  if (status) where.status = status;
  if (driver) where.driverId = driver;
  if (vehicle) where.vehicleId = vehicle;
  if (method) where.payment_method = method;
  if (linked === 'vehicle') where.vehicleId = vehicle ?? { not: null };
  else if (linked === 'driver') where.driverId = driver ?? { not: null };
  else if (linked === 'overhead') {
    where.vehicleId = null;
    where.driverId = null;
  }
  if (opts.withDates !== false) {
    const from = filterDate(q.date_from);
    const to = filterDate(q.date_to, true);
    if (from || to) where.expense_date = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  }
  const searchAnd = buildSearchAnd(q.search, EXPENSE_SEARCH_FIELDS);
  if (searchAnd.length > 0) where.AND = searchAnd;
  return where;
}

export type ExpenseSort = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';

export function expenseOrderBy(sort: unknown) {
  switch (sort) {
    case 'date_asc':
      return [{ expense_date: 'asc' as const }, { createdAt: 'asc' as const }];
    case 'amount_desc':
      return [{ amount: 'desc' as const }, { expense_date: 'desc' as const }];
    case 'amount_asc':
      return [{ amount: 'asc' as const }, { expense_date: 'desc' as const }];
    default:
      return [{ expense_date: 'desc' as const }, { createdAt: 'desc' as const }];
  }
}

export interface SummaryRow {
  amount: number | string | { toString(): string };
  status: string;
  category: string;
  expense_date: Date | string;
  vehicleId: string | null;
  driverId: string | null;
  payee: string | null;
}

export interface ExpenseSummary {
  count: number;
  total: number;
  paid: number;
  pending: number;
  pending_count: number;
  /** Largest first. */
  by_category: { category: string; amount: number; count: number }[];
  /** Calendar months (UTC), oldest first, including empty months inside the range. */
  by_month: { month: string; amount: number; count: number }[];
  /** Truck costs, driver costs (no truck), and overhead (neither). */
  linked: { vehicle: number; driver: number; overhead: number };
  top_payees: { payee: string; amount: number; count: number }[];
  /** Spend in the equal-length period just before the date range; null without a full range. */
  previous_total: number | null;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const monthOf = (d: Date | string) => (d instanceof Date ? d.toISOString() : new Date(d).toISOString()).slice(0, 7);

function monthsBetween(first: string, last: string): string[] {
  const out: string[] = [];
  let [y, m] = first.split('-').map(Number);
  const [ly, lm] = last.split('-').map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    if (out.length > 120) break;
  }
  return out;
}

export function summarizeExpenses(rows: SummaryRow[], range: { from?: Date; to?: Date } = {}, previousTotal: number | null = null): ExpenseSummary {
  const s: ExpenseSummary = {
    count: 0,
    total: 0,
    paid: 0,
    pending: 0,
    pending_count: 0,
    by_category: [],
    by_month: [],
    linked: { vehicle: 0, driver: 0, overhead: 0 },
    top_payees: [],
    previous_total: previousTotal === null ? null : r2(previousTotal),
  };
  const cats = new Map<string, { category: string; amount: number; count: number }>();
  const months = new Map<string, { month: string; amount: number; count: number }>();
  const payees = new Map<string, { payee: string; amount: number; count: number }>();

  for (const row of rows) {
    const amount = Number(row.amount) || 0;
    s.count += 1;
    s.total += amount;
    if (row.status === 'Pending') {
      s.pending += amount;
      s.pending_count += 1;
    } else s.paid += amount;

    const c = cats.get(row.category) ?? { category: row.category, amount: 0, count: 0 };
    c.amount += amount;
    c.count += 1;
    cats.set(row.category, c);

    const key = monthOf(row.expense_date);
    const mo = months.get(key) ?? { month: key, amount: 0, count: 0 };
    mo.amount += amount;
    mo.count += 1;
    months.set(key, mo);

    if (row.vehicleId) s.linked.vehicle += amount;
    else if (row.driverId) s.linked.driver += amount;
    else s.linked.overhead += amount;

    const payee = row.payee?.trim();
    if (payee) {
      const p = payees.get(payee.toLowerCase()) ?? { payee, amount: 0, count: 0 };
      p.amount += amount;
      p.count += 1;
      payees.set(payee.toLowerCase(), p);
    }
  }

  s.total = r2(s.total);
  s.paid = r2(s.paid);
  s.pending = r2(s.pending);
  s.linked = { vehicle: r2(s.linked.vehicle), driver: r2(s.linked.driver), overhead: r2(s.linked.overhead) };
  s.by_category = [...cats.values()].map((c) => ({ ...c, amount: r2(c.amount) })).sort((a, b) => b.amount - a.amount);
  s.top_payees = [...payees.values()]
    .map((p) => ({ ...p, amount: r2(p.amount) }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  // Fill the months of the range (or of the data) so a chart shows gaps as zero
  const keys = [...months.keys()].sort();
  const first = range.from ? monthOf(range.from) : keys[0];
  const last = range.to ? monthOf(range.to) : keys[keys.length - 1];
  const span = first && last && first <= last ? monthsBetween(first, last) : keys;
  s.by_month = span.map((m) => {
    const mo = months.get(m);
    return { month: m, amount: r2(mo?.amount ?? 0), count: mo?.count ?? 0 };
  });
  return s;
}

/** The equal-length range just before [from, to] (both inclusive days), for "vs previous period". */
export function previousRange(from: Date, to: Date): { from: Date; to: Date } {
  const len = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  return { from: new Date(prevTo.getTime() - len), to: prevTo };
}

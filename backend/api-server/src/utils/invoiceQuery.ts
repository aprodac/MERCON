/**
 * Query building for the invoice list and its summary. Pure functions (no database access) so
 * the filter rules are unit-testable.
 */

export type InvoiceListStatus = 'all' | 'Draft' | 'Issued' | 'PartiallyPaid' | 'Paid' | 'Void' | 'unpaid' | 'overdue';
export type InvoiceSort = 'due_asc' | 'date_desc' | 'date_asc' | 'total_desc' | 'balance_desc' | 'created_desc';

export const UNPAID_STATUSES = ['Issued', 'PartiallyPaid'] as const;

export interface InvoiceFilterInput {
  customer_id?: unknown;
  status?: unknown;
  date_from?: unknown;
  date_to?: unknown;
  search?: unknown;
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);

/** Midnight UTC of today's date: a due date before this is overdue (due today is not). */
export const startOfTodayUtc = (now = new Date()) => new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);

/** Filters shared by the list and the summary, without the status (the summary counts every status). */
export function baseInvoiceWhere(q: InvoiceFilterInput): Record<string, any> {
  const where: Record<string, any> = {};
  const customerId = str(q.customer_id);
  if (customerId && customerId !== 'all') where.customerId = customerId;

  const from = str(q.date_from);
  const to = str(q.date_to);
  if (from || to) {
    where.invoice_date = {};
    if (from) where.invoice_date.gte = new Date(`${from.slice(0, 10)}T00:00:00.000Z`);
    // Inclusive of the whole end day
    if (to) where.invoice_date.lte = new Date(`${to.slice(0, 10)}T23:59:59.999Z`);
  }

  const search = str(q.search);
  if (search) {
    const contains = { contains: search, mode: 'insensitive' };
    where.OR = [
      { ref_id: contains },
      { customer: { name: contains } },
      { lines: { some: { description: contains } } },
      // Trip reference or AWB, whether the trip is linked through a line (draft) or directly (issued)
      { lines: { some: { trip: { OR: [{ ref_id: contains }, { awb_number: contains }] } } } },
      { trips: { some: { OR: [{ ref_id: contains }, { awb_number: contains }] } } },
    ];
  }
  return where;
}

/** Where-clause fragment for one status tab; `unpaid` and `overdue` are derived views. */
export function statusWhere(status: string | undefined, now = new Date()): Record<string, any> {
  if (!status || status === 'all') return {};
  if (status === 'unpaid') return { status: { in: [...UNPAID_STATUSES] } };
  if (status === 'overdue') return { status: { in: [...UNPAID_STATUSES] }, due_date: { lt: startOfTodayUtc(now) } };
  return { status };
}

export function invoiceWhere(q: InvoiceFilterInput, now = new Date()): Record<string, any> {
  return { ...baseInvoiceWhere(q), ...statusWhere(str(q.status), now) };
}

/** Sort order; unpaid and overdue views default to the oldest due date first. */
export function invoiceOrderBy(sort: unknown, status: unknown): Record<string, any>[] {
  const s = str(sort) as InvoiceSort | undefined;
  const st = str(status);
  const chosen: InvoiceSort = s ?? (st === 'unpaid' || st === 'overdue' ? 'due_asc' : 'date_desc');
  switch (chosen) {
    case 'due_asc':
      return [{ due_date: { sort: 'asc', nulls: 'last' } }, { invoice_date: 'asc' }];
    case 'date_asc':
      return [{ invoice_date: 'asc' }, { createdAt: 'asc' }];
    case 'total_desc':
      return [{ total_amount: 'desc' }];
    case 'balance_desc':
      return [{ balance_due: 'desc' }];
    case 'created_desc':
      return [{ createdAt: 'desc' }];
    default:
      return [{ invoice_date: 'desc' }, { createdAt: 'desc' }];
  }
}

/** Parse "Net 30", "30 days", "net30" into days; null when the terms don't name a number. */
export function termsToDays(terms: string | null | undefined): number | null {
  if (!terms) return null;
  if (/receipt|immediate|cash/i.test(terms)) return 0;
  const m = terms.match(/(\d{1,3})/);
  return m ? Number(m[1]) : null;
}

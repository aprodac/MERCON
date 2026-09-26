import type { AgeingBillDetail, AgeingRow } from '@/services/financeService';

/**
 * Pure ageing logic shared by the AP (payables) and AR (receivables) workspaces.
 * Pages only render; every figure they show is computed here, so both sides stay consistent and tested.
 */

export type AgeingBucket = AgeingBillDetail['bucket'];
export type AgeingBucketFilter = AgeingBucket | 'all';

export const AGEING_BUCKETS: { key: AgeingBucket; label: string; field: keyof Pick<AgeingRow, 'current' | 'days_1_30' | 'days_31_60' | 'days_61_90' | 'days_90_plus'> }[] = [
  { key: 'current', label: 'Current', field: 'current' },
  { key: '1-30', label: '1–30 days', field: 'days_1_30' },
  { key: '31-60', label: '31–60 days', field: 'days_31_60' },
  { key: '61-90', label: '61–90 days', field: 'days_61_90' },
  { key: '90+', label: '90+ days', field: 'days_90_plus' },
];

/** One open bill or invoice, flattened with its party so lists, forecasts and sheets share one shape. */
export interface AgeingDocument {
  id: string;
  ref_id: string | null;
  /** Bill date or invoice date. */
  doc_date: string;
  due_date: string | null;
  days_overdue: number;
  balance: number;
  bucket: AgeingBucket;
  party_id: string;
  party_name: string;
}

// ── Dates (date-only strings, YYYY-MM-DD) ───────────────────────────────

export const toDateOnly = (value: string | Date) => (typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10));

export function addDays(date: string, days: number): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The date a document is due (falls back to its document date). */
export const dueOn = (doc: Pick<AgeingDocument, 'due_date' | 'doc_date'>) => toDateOnly(doc.due_date || doc.doc_date);

// ── Rows & documents ────────────────────────────────────────────────────

export function flattenAgeingDocuments(rows: AgeingRow[], key: 'bills' | 'invoices'): AgeingDocument[] {
  return rows.flatMap((r) =>
    (r[key] ?? []).map((d) => ({
      id: d.id,
      ref_id: d.ref_id,
      doc_date: d.bill_date,
      due_date: d.due_date,
      days_overdue: d.days_overdue,
      balance: d.balance,
      bucket: d.bucket,
      party_id: r.party_id,
      party_name: r.party_name,
    })),
  );
}

export const overdueAmountOf = (r: AgeingRow) => r.days_1_30 + r.days_31_60 + r.days_61_90 + r.days_90_plus;

export type PartySort = 'total_desc' | 'total_asc' | 'name_asc' | 'overdue_desc';

export interface AgeingFilters {
  bucket: AgeingBucketFilter;
  overdueOnly: boolean;
  search: string;
}

export function filterPartyRows(rows: AgeingRow[], f: AgeingFilters & { sort: PartySort }): AgeingRow[] {
  const q = f.search.trim().toLowerCase();
  const field = AGEING_BUCKETS.find((b) => b.key === f.bucket)?.field;
  return rows
    .filter((r) => (!f.overdueOnly || overdueAmountOf(r) > 0) && (!field || r[field] > 0) && (!q || r.party_name.toLowerCase().includes(q)))
    .sort((a, b) => {
      if (f.sort === 'total_asc') return a.total - b.total;
      if (f.sort === 'name_asc') return a.party_name.localeCompare(b.party_name);
      if (f.sort === 'overdue_desc') return overdueAmountOf(b) - overdueAmountOf(a);
      return b.total - a.total;
    });
}

export function filterDocuments(docs: AgeingDocument[], f: AgeingFilters): AgeingDocument[] {
  const q = f.search.trim().toLowerCase();
  return docs.filter(
    (d) =>
      (!f.overdueOnly || d.days_overdue > 0) &&
      (f.bucket === 'all' || d.bucket === f.bucket) &&
      (!q || (d.ref_id ?? '').toLowerCase().includes(q) || d.party_name.toLowerCase().includes(q)),
  );
}

export const sumBalance = (docs: { balance: number }[]) => docs.reduce((s, d) => s + d.balance, 0);

/** Documents due on or before `asOf + days` (overdue included). */
export const dueWithin = (docs: AgeingDocument[], asOf: string, days: number) => docs.filter((d) => dueOn(d) <= addDays(asOf, days));

/** Documents falling due between today and `asOf + days` (not yet overdue). */
export const dueSoon = (docs: AgeingDocument[], asOf: string, days: number) =>
  docs.filter((d) => dueOn(d) >= toDateOnly(asOf) && dueOn(d) <= addDays(asOf, days));

// ── Schedule / forecast ─────────────────────────────────────────────────

export interface ScheduleWeek {
  key: string;
  label: string;
  start: string | null;
  end: string | null;
  docs: AgeingDocument[];
  total: number;
}

/** Overdue, then `weeks` weekly buckets starting at `asOf`, then everything later. */
export function buildScheduleWeeks(docs: AgeingDocument[], asOf: string, weeks = 6): ScheduleWeek[] {
  const today = toDateOnly(asOf);
  const result: ScheduleWeek[] = [];
  const overdue = docs.filter((d) => dueOn(d) < today);
  result.push({ key: 'overdue', label: 'Overdue', start: null, end: addDays(today, -1), docs: overdue, total: sumBalance(overdue) });
  for (let i = 0; i < weeks; i++) {
    const start = addDays(today, i * 7);
    const end = addDays(start, 6);
    const inWeek = docs.filter((d) => dueOn(d) >= start && dueOn(d) <= end);
    result.push({ key: `week-${i + 1}`, label: `Week of ${start}`, start, end, docs: inWeek, total: sumBalance(inWeek) });
  }
  const laterStart = addDays(today, weeks * 7);
  const later = docs.filter((d) => dueOn(d) >= laterStart);
  result.push({ key: 'later', label: 'Later', start: laterStart, end: null, docs: later, total: sumBalance(later) });
  return result;
}

/**
 * Running cash per schedule bucket: start + inflows − outflows, cumulatively.
 * `inflows` / `outflows` are schedules built with the same `asOf` and `weeks`.
 */
export function projectCash(startCash: number, inflows: ScheduleWeek[] | null, outflows: ScheduleWeek[] | null): number[] {
  const length = (inflows ?? outflows ?? []).length;
  let cash = startCash;
  return Array.from({ length }, (_, i) => {
    cash += (inflows?.[i]?.total ?? 0) - (outflows?.[i]?.total ?? 0);
    return cash;
  });
}

// ── Collection health ───────────────────────────────────────────────────

export interface CollectionHealth {
  total: number;
  overdue: number;
  overduePct: number;
  /** Σ(balance × days overdue) / Σ balance, over overdue documents; null when nothing is overdue. */
  weightedDaysOverdue: number | null;
  topParty: { name: string; total: number; share: number } | null;
}

export function collectionHealth(rows: AgeingRow[], docs: AgeingDocument[]): CollectionHealth {
  const total = rows.reduce((s, r) => s + r.total, 0);
  const overdueDocs = docs.filter((d) => d.days_overdue > 0);
  const overdue = sumBalance(overdueDocs);
  const weighted = overdue > 0 ? overdueDocs.reduce((s, d) => s + d.balance * d.days_overdue, 0) / overdue : null;
  const top = rows.reduce<AgeingRow | null>((best, r) => (!best || r.total > best.total ? r : best), null);
  return {
    total,
    overdue,
    overduePct: total > 0 ? (overdue / total) * 100 : 0,
    weightedDaysOverdue: weighted,
    topParty: top && total > 0 ? { name: top.party_name, total: top.total, share: (top.total / total) * 100 } : null,
  };
}

/** Days sales outstanding: receivables ÷ average daily revenue over the look-back window. */
export function daysSalesOutstanding(receivables: number, revenue: number, windowDays = 90): number | null {
  if (revenue <= 0) return null;
  return Math.round(receivables / (revenue / windowDays));
}

// ── Allocation ──────────────────────────────────────────────────────────

/** Spread `amount` across documents oldest-due first, never above a document's balance. */
export function allocateOldestFirst<T extends Pick<AgeingDocument, 'id' | 'balance' | 'due_date' | 'doc_date'>>(docs: T[], amount: number) {
  const sorted = [...docs].sort((a, b) => dueOn(a).localeCompare(dueOn(b)));
  const allocations = new Map<string, number>();
  let remaining = Math.max(0, amount);
  for (const d of sorted) {
    const take = Math.min(d.balance, remaining);
    allocations.set(d.id, Math.round(take * 100) / 100);
    remaining = Math.round((remaining - take) * 100) / 100;
  }
  return { allocations, unallocated: remaining };
}

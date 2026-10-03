/**
 * Ledger summary model: every postable account's opening balance, period debits and credits and
 * closing balance, grouped by account type and parent account, with the filters and sorting the
 * General Ledger page offers.
 *
 * Balances are kept as debit-positive nets (Dr − Cr), the way the API sends them in `.net`.
 */
import type { ChipTone } from '@/components/ui/chip';
import type { GeneralLedgerSummaryItem } from '@mercon/shared-types';
import type { ChangeSense } from './statementModel';

export type GlAccountType = 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';
export const GL_TYPES: GlAccountType[] = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];

export interface GlTypeMeta {
  label: string;
  /** The side a normal balance sits on. */
  normal: 'Dr' | 'Cr';
  tone: ChipTone;
  /** Whether a larger balance is good news, for the headline change colour. */
  sense: ChangeSense;
  /** Balance-sheet types carry a balance forward; revenue and expenses are read for the period. */
  statement: 'bs' | 'pl';
}

// Asset / liability / equity tones match the balance sheet; revenue matches the P&L.
export const GL_TYPE_META: Record<GlAccountType, GlTypeMeta> = {
  Asset: { label: 'Assets', normal: 'Dr', tone: 'info', sense: 'up-good', statement: 'bs' },
  Liability: { label: 'Liabilities', normal: 'Cr', tone: 'orange', sense: 'up-bad', statement: 'bs' },
  Equity: { label: 'Equity', normal: 'Cr', tone: 'violet', sense: 'up-good', statement: 'bs' },
  Revenue: { label: 'Revenue', normal: 'Cr', tone: 'positive', sense: 'up-good', statement: 'pl' },
  Expense: { label: 'Expenses', normal: 'Dr', tone: 'warning', sense: 'up-bad', statement: 'pl' },
};

export const isGlType = (t: string | null | undefined): t is GlAccountType => GL_TYPES.includes(t as GlAccountType);

/** A debit-positive net shown the way the account type normally reads (credit-normal types flip). */
export const naturalAmount = (net: number, type: GlAccountType) => (GL_TYPE_META[type].normal === 'Dr' ? net : -net);

/** Debit-positive net of an API balance. */
export const netOf = (b: { signed: number; side: 'Dr' | 'Cr'; net?: number }) =>
  typeof b.net === 'number' ? b.net : b.side === 'Dr' ? b.signed : -b.signed;

export interface GlFigures {
  opening: number;
  debit: number;
  credit: number;
  closing: number;
  lines: number;
}

export interface GlAccountRow extends GlFigures {
  key: string;
  item: GeneralLedgerSummaryItem;
  type: GlAccountType;
  /** Debit − credit over the period. */
  movement: number;
}

export interface GlParentGroup extends GlFigures {
  key: string;
  code: string | null;
  name: string;
  accounts: GlAccountRow[];
}

export interface GlTypeGroup extends GlFigures {
  type: GlAccountType;
  meta: GlTypeMeta;
  /** Accounts under a parent account. */
  parents: GlParentGroup[];
  /** Accounts with no parent, listed straight under the type. */
  direct: GlAccountRow[];
  accountCount: number;
}

export type GlSort = 'code' | 'activity' | 'balance';

export interface GlSummaryFilters {
  search?: string;
  type?: GlAccountType | null;
  /** Only accounts with postings in the period. */
  activeOnly?: boolean;
  sort?: GlSort;
}

export interface GlSummaryModel {
  groups: GlTypeGroup[];
  totals: GlFigures & { accounts: number; activeAccounts: number; difference: number };
  /** Accounts left after filtering, and before. */
  shown: number;
  total: number;
}

const zero = (): GlFigures => ({ opening: 0, debit: 0, credit: 0, closing: 0, lines: 0 });
const add = (into: GlFigures, r: GlFigures) => {
  into.opening += r.opening;
  into.debit += r.debit;
  into.credit += r.credit;
  into.closing += r.closing;
  into.lines += r.lines;
};

export const hasActivity = (r: Pick<GlFigures, 'debit' | 'credit' | 'lines'>) => r.lines > 0 || Math.abs(r.debit) > 0.005 || Math.abs(r.credit) > 0.005;

export function toRow(item: GeneralLedgerSummaryItem): GlAccountRow | null {
  if (!isGlType(item.type)) return null;
  return {
    key: item.account_id,
    item,
    type: item.type,
    opening: netOf(item.opening),
    debit: item.period_debit,
    credit: item.period_credit,
    movement: item.period_debit - item.period_credit,
    closing: netOf(item.closing),
    lines: item.line_count ?? 0,
  };
}

function matches(row: GlAccountRow, q: string) {
  if (!q) return true;
  const hay = `${row.item.code} ${row.item.name} ${row.item.parent_code ?? ''} ${row.item.parent_name ?? ''}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => hay.includes(word));
}

const byCode = (a: { code?: string | null }, b: { code?: string | null }) => (a.code ?? '').localeCompare(b.code ?? '', undefined, { numeric: true });

function sortRows(rows: GlAccountRow[], sort: GlSort) {
  if (sort === 'activity') return rows.sort((a, b) => b.debit + b.credit - (a.debit + a.credit) || byCode(a.item, b.item));
  if (sort === 'balance') return rows.sort((a, b) => Math.abs(b.closing) - Math.abs(a.closing) || byCode(a.item, b.item));
  return rows.sort((a, b) => byCode(a.item, b.item));
}

function sortParents(parents: GlParentGroup[], sort: GlSort) {
  if (sort === 'activity') return parents.sort((a, b) => b.debit + b.credit - (a.debit + a.credit) || byCode(a, b));
  if (sort === 'balance') return parents.sort((a, b) => Math.abs(b.closing) - Math.abs(a.closing) || byCode(a, b));
  return parents.sort(byCode);
}

/** Headline figures per type, over every account (filters don't change them). */
export function typeTotals(items: GeneralLedgerSummaryItem[]): Record<GlAccountType, GlFigures & { movement: number; accounts: number }> {
  const out = Object.fromEntries(GL_TYPES.map((t) => [t, { ...zero(), movement: 0, accounts: 0 }])) as Record<GlAccountType, GlFigures & { movement: number; accounts: number }>;
  items.forEach((item) => {
    const row = toRow(item);
    if (!row) return;
    const t = out[row.type];
    add(t, row);
    t.movement += row.movement;
    t.accounts += 1;
  });
  return out;
}

export function buildGlSummary(items: GeneralLedgerSummaryItem[], filters: GlSummaryFilters = {}): GlSummaryModel {
  const sort = filters.sort ?? 'code';
  const q = (filters.search ?? '').trim();
  const all = items.map(toRow).filter((r): r is GlAccountRow => r !== null);

  const totals = { ...zero(), accounts: all.length, activeAccounts: 0, difference: 0 };
  all.forEach((r) => {
    add(totals, r);
    if (hasActivity(r)) totals.activeAccounts += 1;
  });
  totals.difference = totals.debit - totals.credit;

  const visible = all.filter((r) => (!filters.type || r.type === filters.type) && (!filters.activeOnly || hasActivity(r)) && matches(r, q));

  const groups: GlTypeGroup[] = [];
  GL_TYPES.forEach((type) => {
    const rows = visible.filter((r) => r.type === type);
    if (rows.length === 0) return;
    const group: GlTypeGroup = { type, meta: GL_TYPE_META[type], parents: [], direct: [], accountCount: rows.length, ...zero() };
    const parents = new Map<string, GlParentGroup>();
    rows.forEach((r) => {
      add(group, r);
      const pKey = r.item.parent_id || r.item.parent_name;
      if (!pKey) {
        group.direct.push(r);
        return;
      }
      let p = parents.get(pKey);
      if (!p) {
        p = { key: `${type}:${pKey}`, code: r.item.parent_code ?? null, name: r.item.parent_name || 'Other accounts', accounts: [], ...zero() };
        parents.set(pKey, p);
      }
      p.accounts.push(r);
      add(p, r);
    });
    group.parents = sortParents([...parents.values()], sort);
    group.parents.forEach((p) => sortRows(p.accounts, sort));
    sortRows(group.direct, sort);
    groups.push(group);
  });

  return { groups, totals, shown: visible.length, total: all.length };
}

/** Keys of every parent group, for expand / collapse all. */
export const parentKeys = (model: GlSummaryModel) => model.groups.flatMap((g) => g.parents.map((p) => p.key));

import type { ReportLineItem } from '@/services/financeService';
import { changePct, senseTone, type ChangeSense } from './statementModel';

export type AssetSubCategory =
  | 'Cash & bank'
  | 'Receivables'
  | 'Advances & prepayments'
  | 'Other current assets';

export type AssetCategory = 'Current assets' | 'Fixed assets' | 'Investments';
export type LiabilityCategory = 'Current liabilities' | 'Long-term liabilities';
export type EquityCategory = 'Capital account';

export type LiabilitySubCategory =
  | 'Payables'
  | 'Advances from customers'
  | 'Accruals & other';

export interface ClassifiedLineItem extends ReportLineItem {
  category: AssetCategory | LiabilityCategory | EquityCategory;
  subCategory?: AssetSubCategory | LiabilitySubCategory;
}

const LOCAL_STORAGE_KEY = 'mercon_bs_class_overrides';

export function getStoredOverrides(): Record<string, string> {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return {};
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveStoredOverrides(overrides: Record<string, string>): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // ignore
  }
}

export function clearBsStoredOverrides(): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

export function classifyAssetAccount(
  item: ReportLineItem,
  overrides: Record<string, string> = {},
): { category: AssetCategory; subCategory?: AssetSubCategory } {
  const key = item.account_id || item.account_code || item.name;
  if (overrides[key]) {
    const ov = overrides[key];
    if (ov === 'Fixed assets') return { category: 'Fixed assets' };
    if (ov === 'Investments') return { category: 'Investments' };
    if (ov === 'Cash & bank') return { category: 'Current assets', subCategory: 'Cash & bank' };
    if (ov === 'Receivables') return { category: 'Current assets', subCategory: 'Receivables' };
    if (ov === 'Advances & prepayments')
      return { category: 'Current assets', subCategory: 'Advances & prepayments' };
    if (ov === 'Other current assets')
      return { category: 'Current assets', subCategory: 'Other current assets' };
  }

  const textToMatch = `${item.name} ${item.account_code || ''} ${item.parent_name || ''} ${item.parent_code || ''}`;

  if (/investment/i.test(textToMatch)) {
    return { category: 'Investments' };
  }
  if (item.is_bank_or_cash || /cash|bank|petty|al rajhi|snb|wio|stc pay/i.test(textToMatch)) {
    return { category: 'Current assets', subCategory: 'Cash & bank' };
  }
  if (/receivable/i.test(textToMatch)) {
    return { category: 'Current assets', subCategory: 'Receivables' };
  }
  if (/advance|prepaid|deposit/i.test(textToMatch)) {
    return { category: 'Current assets', subCategory: 'Advances & prepayments' };
  }
  if (/vehicle|truck|trailer|equipment|machinery|building|land|furniture|computer|fixed/i.test(textToMatch)) {
    return { category: 'Fixed assets' };
  }

  return { category: 'Current assets', subCategory: 'Other current assets' };
}

export function classifyLiabilityAccount(
  item: ReportLineItem,
  overrides: Record<string, string> = {},
): { category: LiabilityCategory; subCategory?: LiabilitySubCategory } {
  const key = item.account_id || item.account_code || item.name;
  if (overrides[key]) {
    const ov = overrides[key];
    if (ov === 'Long-term liabilities') return { category: 'Long-term liabilities' };
    if (ov === 'Payables') return { category: 'Current liabilities', subCategory: 'Payables' };
    if (ov === 'Advances from customers')
      return { category: 'Current liabilities', subCategory: 'Advances from customers' };
    if (ov === 'Accruals & other')
      return { category: 'Current liabilities', subCategory: 'Accruals & other' };
  }

  const textToMatch = `${item.name} ${item.account_code || ''} ${item.parent_name || ''} ${item.parent_code || ''}`;

  if (/customer advance|unearned|deferred/i.test(textToMatch)) {
    return { category: 'Current liabilities', subCategory: 'Advances from customers' };
  }
  if (/payable/i.test(textToMatch)) {
    return { category: 'Current liabilities', subCategory: 'Payables' };
  }
  if (/loan|long.?term|mortgage|financing/i.test(textToMatch)) {
    return { category: 'Long-term liabilities' };
  }

  return { category: 'Current liabilities', subCategory: 'Accruals & other' };
}

export function classifyEquityAccount(
  _item: ReportLineItem,
  _overrides: Record<string, string> = {},
): { category: EquityCategory } {
  return { category: 'Capital account' };
}

// ── Statement tree ──────────────────────────────────────────────────────
// One tree drives every balance-sheet view. Each total is the sum of the rows beneath it,
// so a figure can never include accounts the statement doesn't show.

export type BsSectionKey = 'assets' | 'liabilities' | 'equity';

export interface BsAccountRow {
  key: string;
  item: ReportLineItem;
  amount: number;
  /** Amount at the comparison date; null when not comparing. */
  compare: number | null;
}

/** A named group of accounts ("Cash & bank"). A group with one account renders as that account. */
export interface BsGroup {
  key: string;
  label: string;
  amount: number;
  compare: number | null;
  accounts: BsAccountRow[];
}

/** A block within a section ("Current assets", "Fixed assets"). */
export interface BsBlock {
  key: string;
  label: string;
  amount: number;
  compare: number | null;
  groups: BsGroup[];
}

export interface BsSection {
  key: BsSectionKey;
  label: string;
  amount: number;
  compare: number | null;
  blocks: BsBlock[];
}

export interface BalanceSheetTree {
  assets: BsSection;
  liabilities: BsSection;
  equity: BsSection;
  totals: {
    assets: number;
    liabilities: number;
    equity: number;
    liabilitiesAndEquity: number;
    /** Assets − (liabilities + equity); zero when the books balance. */
    difference: number;
    currentAssets: number;
    currentLiabilities: number;
    /** Cash & bank plus receivables, for the quick ratio. */
    quickAssets: number;
  };
}

const lineKey = (i: ReportLineItem) => i.account_id || i.account_code || i.name;
const round2 = (n: number) => Math.round(n * 100) / 100;

const ASSET_BLOCKS: { key: AssetCategory; groups: AssetSubCategory[] | 'per-account' }[] = [
  { key: 'Current assets', groups: ['Cash & bank', 'Receivables', 'Advances & prepayments', 'Other current assets'] },
  { key: 'Fixed assets', groups: 'per-account' },
  { key: 'Investments', groups: 'per-account' },
];
const LIABILITY_BLOCKS: { key: LiabilityCategory; groups: LiabilitySubCategory[] | 'per-account' }[] = [
  { key: 'Current liabilities', groups: ['Payables', 'Advances from customers', 'Accruals & other'] },
  { key: 'Long-term liabilities', groups: 'per-account' },
];

/** Current and comparison lines merged by account, dropping accounts that are zero on both dates (unless kept). */
function mergeLines(current: ReportLineItem[], prior: ReportLineItem[] | null, keepZero: boolean): BsAccountRow[] {
  const priorByKey = new Map((prior ?? []).map((i) => [lineKey(i), i]));
  const rows: BsAccountRow[] = current.map((item) => ({
    key: lineKey(item),
    item,
    amount: item.amount,
    compare: prior ? priorByKey.get(lineKey(item))?.amount ?? 0 : null,
  }));
  const seen = new Set(rows.map((r) => r.key));
  for (const item of prior ?? []) {
    if (!seen.has(lineKey(item))) rows.push({ key: lineKey(item), item: { ...item, amount: 0 }, amount: 0, compare: item.amount });
  }
  return rows.filter((r) => keepZero || Math.abs(r.amount) >= 0.005 || Math.abs(r.compare ?? 0) >= 0.005);
}

function sum(rows: { amount: number; compare: number | null }[], comparing: boolean) {
  return {
    amount: round2(rows.reduce((s, r) => s + r.amount, 0)),
    compare: comparing ? round2(rows.reduce((s, r) => s + (r.compare ?? 0), 0)) : null,
  };
}

function group(key: string, label: string, accounts: BsAccountRow[], comparing: boolean): BsGroup {
  return { key, label, accounts, ...sum(accounts, comparing) };
}

function section(key: BsSectionKey, label: string, blocks: BsBlock[], comparing: boolean): BsSection {
  const kept = blocks.filter((b) => b.groups.length > 0);
  return { key, label, blocks: kept, ...sum(kept, comparing) };
}

function blocksFor<C extends string, G extends string>(
  rows: BsAccountRow[],
  layout: { key: C; groups: G[] | 'per-account' }[],
  classify: (row: BsAccountRow) => { category: C; subCategory?: G },
  comparing: boolean,
): BsBlock[] {
  return layout.map((b) => {
    const inBlock = rows.filter((r) => classify(r).category === b.key);
    const groups =
      b.groups === 'per-account'
        ? inBlock.map((r) => group(r.key, r.item.name, [r], comparing))
        : b.groups.map((g) => group(`${b.key}/${g}`, g, inBlock.filter((r) => classify(r).subCategory === g), comparing));
    const kept = groups.filter((g) => g.accounts.length > 0);
    return { key: b.key, label: b.key, groups: kept, ...sum(kept, comparing) };
  });
}

export function buildBalanceSheetTree(
  report: { assets: ReportLineItem[]; liabilities: ReportLineItem[]; equity: ReportLineItem[] },
  prior: { assets: ReportLineItem[]; liabilities: ReportLineItem[]; equity: ReportLineItem[] } | null,
  opts: { overrides?: Record<string, string>; keepZero?: boolean } = {},
): BalanceSheetTree {
  const overrides = opts.overrides ?? {};
  const keepZero = opts.keepZero ?? false;
  const comparing = prior !== null;

  const assetRows = mergeLines(report.assets, prior?.assets ?? null, keepZero);
  const liabilityRows = mergeLines(report.liabilities, prior?.liabilities ?? null, keepZero);
  const equityRows = mergeLines(report.equity, prior?.equity ?? null, keepZero);

  const assets = section('assets', 'Assets', blocksFor(assetRows, ASSET_BLOCKS, (r) => classifyAssetAccount(r.item, overrides), comparing), comparing);
  const liabilities = section(
    'liabilities',
    'Liabilities',
    blocksFor(liabilityRows, LIABILITY_BLOCKS, (r) => classifyLiabilityAccount(r.item, overrides), comparing),
    comparing,
  );
  const equityGroups = equityRows.map((r) => group(r.key, r.item.name, [r], comparing));
  const equity = section('equity', 'Equity', [{ key: 'Equity', label: 'Equity', groups: equityGroups, ...sum(equityGroups, comparing) }], comparing);

  const block = (s: BsSection, key: string) => s.blocks.find((b) => b.key === key);
  const groupAmount = (s: BsSection, blockKey: string, groupLabel: string) =>
    block(s, blockKey)?.groups.find((g) => g.label === groupLabel)?.amount ?? 0;

  return {
    assets,
    liabilities,
    equity,
    totals: {
      assets: assets.amount,
      liabilities: liabilities.amount,
      equity: equity.amount,
      liabilitiesAndEquity: round2(liabilities.amount + equity.amount),
      difference: round2(assets.amount - liabilities.amount - equity.amount),
      currentAssets: block(assets, 'Current assets')?.amount ?? 0,
      currentLiabilities: block(liabilities, 'Current liabilities')?.amount ?? 0,
      quickAssets: round2(groupAmount(assets, 'Current assets', 'Cash & bank') + groupAmount(assets, 'Current assets', 'Receivables')),
    },
  };
}

export interface BalanceSheetRatios {
  workingCapital: number;
  currentRatio: number | null;
  quickRatio: number | null;
  debtToEquity: number | null;
}

export function balanceSheetRatios(t: BalanceSheetTree['totals']): BalanceSheetRatios {
  return {
    workingCapital: round2(t.currentAssets - t.currentLiabilities),
    currentRatio: t.currentLiabilities > 0 ? t.currentAssets / t.currentLiabilities : null,
    quickRatio: t.currentLiabilities > 0 ? t.quickAssets / t.currentLiabilities : null,
    debtToEquity: t.equity > 0 ? t.liabilities / t.equity : null,
  };
}

export type BsCompareMode = 'none' | 'prev_month' | 'prev_year' | 'custom';

/**
 * Comparison date for an as-of date: end of the previous month, the same month-end a year earlier,
 * or a date the user picked (`custom`).
 */
export function balanceSheetCompareDate(asOf: string, mode: BsCompareMode, custom?: string | null): string | null {
  if (mode === 'none') return null;
  if (mode === 'custom') return custom && /^\d{4}-\d{2}-\d{2}$/.test(custom) ? custom : null;
  const [y, m] = asOf.split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  // Day 0 of a month is the last day of the month before; UTC keeps it free of time-zone shifts
  const d = mode === 'prev_month' ? new Date(Date.UTC(y, m - 1, 0)) : new Date(Date.UTC(y - 1, m, 0));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// ── Comparison ──────────────────────────────────────────────────────────

const moved = (amount: number, compare: number | null) => compare !== null && Math.abs(amount - compare) >= 0.005;

/**
 * Whether a change is good news for the business: more assets or equity is good,
 * more liabilities is not. Null when nothing moved.
 */
export function changeTone(section: BsSectionKey, delta: number): 'positive' | 'negative' | null {
  return senseTone(BS_SENSE[section], delta);
}

/** How each section's movement reads: more liabilities is bad news, more assets or equity good. */
export const BS_SENSE: Record<BsSectionKey, ChangeSense> = { assets: 'up-good', liabilities: 'up-bad', equity: 'up-good' };

export { changePct };

/** A section with unchanged accounts (and groups left empty) hidden. Totals stay the true totals. */
export function onlyChangedSection(s: BsSection): BsSection {
  const blocks = s.blocks
    .map((b) => ({
      ...b,
      groups: b.groups
        .map((g) => ({ ...g, accounts: g.accounts.filter((a) => moved(a.amount, a.compare)) }))
        .filter((g) => g.accounts.length > 0),
    }))
    .filter((b) => b.groups.length > 0);
  return { ...s, blocks };
}

export interface BsChange {
  row: BsAccountRow;
  section: BsSectionKey;
  group: string;
  delta: number;
}

/** Accounts that moved most between the two dates, largest first. */
export function biggestChanges(tree: BalanceSheetTree, limit = 6): BsChange[] {
  const all: BsChange[] = [];
  for (const s of [tree.assets, tree.liabilities, tree.equity]) {
    for (const b of s.blocks) {
      for (const g of b.groups) {
        for (const a of g.accounts) {
          if (moved(a.amount, a.compare)) all.push({ row: a, section: s.key, group: g.accounts.length === 1 ? b.label : g.label, delta: round2(a.amount - (a.compare ?? 0)) });
        }
      }
    }
  }
  return all.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta)).slice(0, limit);
}

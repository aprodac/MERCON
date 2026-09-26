import type { ChipTone } from '@/components/ui/chip';
import type { PnlClass, PnlSection, StructuredVerticalPnl } from './pnlStructure';
import { shareOf, type ChangeSense, type StmtGroup, type StmtItem } from './statementModel';

/** Plain names on screen; the accounting term is kept for hover hints and exports. */
export const PNL_SECTION_META: Record<PnlClass, { label: string; formal: string; tone: ChipTone; sense: ChangeSense }> = {
  operating_income: { label: 'Revenue', formal: 'Operating income', tone: 'positive', sense: 'up-good' },
  cost_of_sales: { label: 'Direct costs', formal: 'Cost of sales', tone: 'orange', sense: 'up-bad' },
  operating_expense: { label: 'Overheads', formal: 'Operating expenses', tone: 'violet', sense: 'up-bad' },
  other_income: { label: 'Other income', formal: 'Non-operating income', tone: 'teal', sense: 'up-good' },
  non_operating_expense: { label: 'Other costs', formal: 'Non-operating expenses', tone: 'neutral', sense: 'up-bad' },
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const cmp = (totals: Record<string, number> | undefined, key: string | null) => (key === null ? null : round2(totals?.[key] ?? 0));

export interface PnlViewOptions {
  /** Comparison column key in the structured P&L; null when not comparing. */
  compareKey?: string | null;
  keepZero?: boolean;
}

/** One P&L section as a statement item; null when it has nothing to show. */
function sectionItem(sec: PnlSection, revenue: number, opts: PnlViewOptions, alwaysShow = false): StmtItem | null {
  const key = opts.compareKey ?? null;
  const meta = PNL_SECTION_META[sec.key];
  // Share of revenue says nothing inside the revenue section itself
  const share = (n: number) => (sec.key === 'operating_income' ? null : shareOf(n, revenue));
  const groups: StmtGroup[] = sec.groups
    .map((g) => {
      const lines = g.items
        .map((i) => ({
          key: i.id,
          label: i.name,
          code: i.code,
          amount: round2(i.amount),
          compare: cmp(i.compareAmounts, key),
          share: share(i.amount),
          ref: i,
        }))
        .filter((l) => opts.keepZero || Math.abs(l.amount) >= 0.005 || Math.abs(l.compare ?? 0) >= 0.005);
      return { key: `${sec.key}/${g.key}`, label: g.name, amount: round2(g.total), compare: cmp(g.compareTotals, key), share: share(g.total), lines };
    })
    .filter((g) => g.lines.length > 0);
  if (groups.length === 0 && !alwaysShow) return null;
  return {
    kind: 'section',
    key: sec.key,
    label: meta.label,
    tone: meta.tone,
    sense: meta.sense,
    amount: round2(sec.total),
    compare: cmp(sec.compareTotals, key),
    share: sec.key === 'operating_income' ? null : shareOf(sec.total, revenue),
    blocks: [{ key: sec.key, label: null, amount: round2(sec.total), compare: cmp(sec.compareTotals, key), groups }],
  };
}

export interface PnlPart {
  key: 'trading' | 'pl';
  title: string;
  hint: string;
  /** Costs side. */
  left: StmtItem[];
  /** Income side. */
  right: StmtItem[];
  /** Both sides total this amount. */
  total: Extract<StmtItem, { kind: 'total' }>;
}

const carried = (key: string, label: string, tag: string | undefined, amount: number, compare: number | null, good: boolean, hint: string): StmtItem => ({
  kind: 'line',
  key,
  label,
  tag,
  amount: round2(amount),
  compare: compare === null ? null : round2(compare),
  sense: good ? 'up-good' : 'up-bad',
  tone: good ? 'positive' : 'negative',
  hint,
});

/**
 * Two-column view in the Tally layout, in two parts that each balance: the trading account
 * (revenue against direct costs, down to gross profit or loss) and the profit and loss account
 * (overheads and other items against the gross result, down to net profit or loss).
 */
export function pnlTwoColumnParts(v: StructuredVerticalPnl, opts: PnlViewOptions = {}): PnlPart[] {
  const key = opts.compareKey ?? null;
  const s = v.sections;
  const revenue = v.operatingIncomeTotal;
  const gp = v.grossProfit;
  const np = v.netProfit;
  const c = (totals: Record<string, number> | undefined) => cmp(totals, key);
  const cGp = c(v.compareGrossProfit);
  const cNp = c(v.compareNetProfit);
  const pos = (n: number | null) => (n === null ? null : Math.max(0, n));
  const neg = (n: number | null) => (n === null ? null : Math.max(0, -n));

  const tradingLeft: (StmtItem | null)[] = [
    sectionItem(s.cost_of_sales, revenue, opts, true),
    gp > 0 ? carried('gp-cd', 'Gross profit', 'carried down', gp, pos(cGp), true, 'Gross profit c/d — moved to the profit and loss account') : null,
  ];
  const tradingRight: (StmtItem | null)[] = [
    sectionItem(s.operating_income, revenue, opts, true),
    gp < 0 ? carried('gl-cd', 'Gross loss', 'carried down', -gp, neg(cGp), false, 'Gross loss c/d — moved to the profit and loss account') : null,
  ];
  const cRev = c(s.operating_income.compareTotals);
  const cCos = c(s.cost_of_sales.compareTotals);

  const plLeft: (StmtItem | null)[] = [
    gp < 0 ? carried('gl-bd', 'Gross loss', 'brought down', -gp, neg(cGp), false, 'Gross loss b/d — from the trading account') : null,
    sectionItem(s.operating_expense, revenue, opts),
    sectionItem(s.non_operating_expense, revenue, opts),
    np > 0 ? carried('np', 'Net profit', undefined, np, pos(cNp), true, 'The balancing figure: income less every cost') : null,
  ];
  const plRight: (StmtItem | null)[] = [
    gp > 0 ? carried('gp-bd', 'Gross profit', 'brought down', gp, pos(cGp), true, 'Gross profit b/d — from the trading account') : null,
    sectionItem(s.other_income, revenue, opts),
    np < 0 ? carried('nl', 'Net loss', undefined, -np, neg(cNp), false, 'The balancing figure: costs in excess of income') : null,
  ];
  // The comparison period's own profit and loss total: gross loss (if any) + overheads + other costs + net profit (if any)
  const cPl =
    key === null
      ? null
      : (neg(cGp) ?? 0) + (c(s.operating_expense.compareTotals) ?? 0) + (c(s.non_operating_expense.compareTotals) ?? 0) + (pos(cNp) ?? 0);

  const keep = (items: (StmtItem | null)[]) => items.filter((i): i is StmtItem => i !== null);
  const sum = (items: StmtItem[]) => items.reduce((t, i) => t + i.amount, 0);
  const total = (k: string, amount: number, compare: number | null): PnlPart['total'] => ({
    kind: 'total',
    key: k,
    label: 'Total',
    tone: 'neutral',
    sense: 'neutral',
    amount: round2(amount),
    compare: compare === null ? null : round2(compare),
  });

  const pl = { left: keep(plLeft), right: keep(plRight) };
  return [
    {
      key: 'trading',
      title: 'Trading account',
      hint: 'Revenue against the direct cost of earning it, down to gross profit',
      left: keep(tradingLeft),
      right: keep(tradingRight),
      total: total('trading-total', Math.max(v.operatingIncomeTotal, v.costOfSalesTotal), key === null ? null : Math.max(cRev ?? 0, cCos ?? 0)),
    },
    {
      key: 'pl',
      title: 'Profit and loss account',
      hint: 'Overheads and other items against the gross result, down to net profit',
      ...pl,
      total: total('pl-total', Math.max(sum(pl.left), sum(pl.right)), cPl),
    },
  ];
}

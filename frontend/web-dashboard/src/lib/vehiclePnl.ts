import type { ChipTone } from '@/components/ui/chip';
import type { PnlBreakdown, PnlCostLine, PnlFlags } from '@/services/vehicleService';

/**
 * Vehicle P&L presentation helpers — labels, colours and period maths shared by
 * the fleet page, the truck statement and the side panel. What each figure
 * *means* is decided in the backend engine (services/vehicleFinancials/engine.ts).
 */

/**
 * Cost groups for the mix bar and legend. Four groups, not seven lines: the
 * colour tells you what kind of cost it is, not which of seven it is.
 */
export const COST_GROUPS = [
  { key: 'trip_pay', label: 'Trip pay', tone: 'violet', of: (b: PnlBreakdown) => b.driver_pay },
  { key: 'fuel', label: 'Fuel', tone: 'orange', of: (b: PnlBreakdown) => b.fuel },
  { key: 'running', label: 'Maintenance, tolls, other', tone: 'info', of: (b: PnlBreakdown) => b.maintenance + b.tolls + b.other },
  { key: 'overhead', label: 'Salary and ownership', tone: 'neutral', of: (b: PnlBreakdown) => b.overhead },
] as const satisfies readonly { key: string; label: string; tone: ChipTone; of: (b: PnlBreakdown) => number }[];

export type StatementKey = keyof Pick<
  PnlBreakdown,
  'revenue' | 'driver_pay' | 'fuel' | 'maintenance' | 'tolls' | 'other' | 'contribution' | 'salary' | 'depreciation' | 'fixed_costs' | 'net_profit'
>;

/** The statement, top to bottom. `kind` decides how the row is drawn. */
export const STATEMENT_ROWS: { key: StatementKey; label: string; kind: 'income' | 'cost' | 'subtotal' | 'total'; hint: string }[] = [
  { key: 'revenue', label: 'Revenue', kind: 'income', hint: 'Trip billing plus extra charges, for completed and invoiced trips.' },
  { key: 'driver_pay', label: 'Trip pay', kind: 'cost', hint: 'Driver and co-driver payout on those trips.' },
  { key: 'fuel', label: 'Fuel', kind: 'cost', hint: 'Fuel expenses linked to this truck.' },
  { key: 'maintenance', label: 'Maintenance and tyres', kind: 'cost', hint: 'Maintenance records plus maintenance and tyre expenses.' },
  { key: 'tolls', label: 'Tolls and parking', kind: 'cost', hint: 'Toll and parking expenses linked to this truck.' },
  { key: 'other', label: 'Other direct costs', kind: 'cost', hint: 'Other expenses and supplier bill lines linked to this truck.' },
  { key: 'contribution', label: 'Contribution', kind: 'subtotal', hint: 'What the truck earns on the road, before salary and ownership costs.' },
  { key: 'salary', label: 'Driver salary share', kind: 'cost', hint: 'Monthly salary of each driver, split across the trucks they drove that month by trip count.' },
  { key: 'depreciation', label: 'Depreciation', kind: 'cost', hint: 'Purchase price less resale value, spread evenly over the useful life.' },
  { key: 'fixed_costs', label: 'Insurance, Istimara and fees', kind: 'cost', hint: 'Recurring costs from the truck’s cost setup, spread per month.' },
  { key: 'net_profit', label: 'Net profit', kind: 'total', hint: 'Contribution less salary and ownership costs.' },
];

export const COST_LINE_LABEL: Record<PnlCostLine, string> = {
  fuel: 'Fuel',
  maintenance: 'Maintenance',
  tolls: 'Tolls',
  other: 'Other',
};

export const COST_LINE_TONE: Record<PnlCostLine, ChipTone> = {
  fuel: 'orange',
  maintenance: 'info',
  tolls: 'teal',
  other: 'neutral',
};

/** Whole riyals with separators — P&L at truck level doesn't need halalas. */
export const sar0 = (n: number) => Math.round(n).toLocaleString('en-US');

/** Signed whole riyals with a real minus sign. */
export const signed0 = (n: number) => (n < -0.5 ? `−${sar0(-n)}` : sar0(n));

/** 12.4k / 1.2M, for tight spots like chart axes. */
export const compact = (n: number) => {
  const a = Math.abs(n);
  const s = n < 0 ? '−' : '';
  if (a >= 1_000_000) return `${s}${(a / 1_000_000).toFixed(1)}M`;
  if (a >= 10_000) return `${s}${Math.round(a / 1000)}k`;
  if (a >= 1_000) return `${s}${(a / 1000).toFixed(1)}k`;
  return `${s}${Math.round(a)}`;
};

export const pctLabel = (p: number | null) => (p === null ? '—' : `${p.toFixed(1)}%`);

/** Share of revenue, for the statement's % column. */
export const ofRevenue = (amount: number, revenue: number) => (revenue > 0 ? `${((amount / revenue) * 100).toFixed(1)}%` : '');

export const monthShort = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en', { month: 'short', timeZone: 'UTC' }) + ` ${String(y).slice(2)}`;
};

/* ── Periods ──────────────────────────────────────────────────────────── */

const toDay = (d: Date) => d.toISOString().slice(0, 10);
const utc = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const isMonthStart = (day: string) => day.endsWith('-01');
const isMonthEnd = (day: string) => {
  const d = utc(day);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.getUTCDate() === 1;
};

/**
 * The period just before [from, to], the same length: whole calendar months
 * shift by months (Sep → Aug, Q3 → Q2), anything else by days.
 */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  if (isMonthStart(from) && isMonthEnd(to)) {
    const f = utc(from);
    const t = utc(to);
    const months = (t.getUTCFullYear() - f.getUTCFullYear()) * 12 + (t.getUTCMonth() - f.getUTCMonth()) + 1;
    const pf = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() - months, 1));
    const pt = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), 0));
    return { from: toDay(pf), to: toDay(pt) };
  }
  const days = Math.round((utc(to).getTime() - utc(from).getTime()) / 86_400_000) + 1;
  const pt = utc(from);
  pt.setUTCDate(pt.getUTCDate() - 1);
  const pf = new Date(pt);
  pf.setUTCDate(pf.getUTCDate() - days + 1);
  return { from: toDay(pf), to: toDay(pt) };
}

/** The last `n` whole months up to and including the one `day` falls in. */
export function lastMonths(day: string, n: number): { from: string; to: string } {
  const d = utc(day);
  const from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - (n - 1), 1));
  const to = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return { from: toDay(from), to: toDay(to) };
}

/* ── Data health ──────────────────────────────────────────────────────── */

export interface HealthIssue {
  key: 'billing' | 'driver_pay' | 'fuel' | 'cost_profile' | 'salary';
  label: string;
  tone: ChipTone;
}

/** What's missing for one truck, worst first — shown as small warnings. */
export function truckIssues(f: PnlFlags): HealthIssue[] {
  const out: HealthIssue[] = [];
  if (f.missing_billing > 0) out.push({ key: 'billing', tone: 'negative', label: `${f.missing_billing} trip${f.missing_billing === 1 ? '' : 's'} without billing` });
  if (f.missing_driver_pay > 0) out.push({ key: 'driver_pay', tone: 'warning', label: `${f.missing_driver_pay} trip${f.missing_driver_pay === 1 ? '' : 's'} without driver pay` });
  if (f.no_fuel) out.push({ key: 'fuel', tone: 'warning', label: 'No fuel recorded' });
  if (f.no_cost_profile) out.push({ key: 'cost_profile', tone: 'neutral', label: 'No ownership costs' });
  if (f.drivers_without_salary.length > 0) {
    const n = f.drivers_without_salary.length;
    out.push({ key: 'salary', tone: 'neutral', label: `${n} driver${n === 1 ? '' : 's'} without salary` });
  }
  return out;
}

export const hasIssues = (f: PnlFlags) => truckIssues(f).length > 0;

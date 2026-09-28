import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { ChipTone } from '@/components/ui/chip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TONE_CLASSES } from '@/components/finance/kit/tones';
import { changePct, senseTone, type ChangeSense } from '@/lib/finance/statementModel';
import { ofRevenue, pctLabel, sar0, signed0 } from '@/lib/vehiclePnl';
import type { PnlBreakdown } from '@/services/vehicleService';
import { cn } from '@/lib/utils';

interface Term {
  label: string;
  amount: number;
  compare: number | null;
  tone: ChipTone;
  sense: ChangeSense;
  /** Results sit on a plain card with a border instead of a tinted fill. */
  outlined?: boolean;
  note?: string;
  rows: { label: string; amount: number }[];
  explain: string;
}

function BridgeTerm({ term, revenue, compareLabel }: { term: Term; revenue: number; compareLabel?: string }) {
  const t = TONE_CLASSES[term.tone];
  const negative = term.amount < -0.5;
  const delta = term.compare === null ? 0 : term.amount - term.compare;
  const pct = changePct(term.amount, term.compare);
  const changeTone = senseTone(term.sense, delta);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'min-w-0 flex-1 rounded-lg border px-3 py-2 text-left outline-none transition-colors hover:brightness-[0.97] focus-visible:ring-2 focus-visible:ring-ring',
            term.outlined ? 'border-border bg-card' : cn(t.bg, t.border),
          )}
        >
          <span className={cn('flex items-center gap-1 truncate text-[11px] font-medium', term.outlined ? 'text-muted-foreground' : t.fg)}>
            {term.label} <ChevronDown className="size-3 opacity-60" />
          </span>
          <span className={cn('fin-num block truncate text-lg font-semibold leading-tight', negative ? TONE_CLASSES.negative.fg : term.outlined ? 'text-foreground' : t.fg)}>
            {signed0(term.amount)}
          </span>
          {term.compare !== null ? (
            <span className="block truncate text-[11px] text-muted-foreground" title={compareLabel ? `Compared with ${compareLabel}` : undefined}>
              {Math.abs(delta) < 0.5 ? (
                'no change'
              ) : (
                <span className={cn('fin-num font-medium', changeTone && TONE_CLASSES[changeTone].fg)}>
                  {delta > 0 ? '▲' : '▼'} {sar0(Math.abs(delta))}
                  {pct !== null && ` (${Math.abs(pct).toFixed(1)}%)`}
                </span>
              )}
            </span>
          ) : (
            term.note && <span className="block truncate text-[11px] text-muted-foreground">{term.note}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3 text-xs">
        <p className="mb-2 font-semibold text-foreground">{term.label}</p>
        <dl className="space-y-1.5">
          {term.rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">{r.label}</dt>
              <dd className="fin-num font-medium text-foreground">
                {signed0(r.amount)}
                <span className="ml-1.5 inline-block w-11 text-right text-[10px] font-normal text-muted-foreground">{ofRevenue(r.amount, revenue)}</span>
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-2.5 border-t pt-2 text-[11px] leading-relaxed text-muted-foreground">{term.explain}</p>
      </PopoverContent>
    </Popover>
  );
}

const Op = ({ children }: { children: string }) => <span className="hidden shrink-0 px-0.5 text-xl font-light text-muted-foreground sm:block">{children}</span>;

/**
 * The page header as a sum: Revenue − Direct costs = Contribution − Salary
 * and ownership = Net profit. Every term opens its breakdown.
 */
export function ProfitBridge({
  totals,
  compare = null,
  compareLabel,
  aside,
}: {
  totals: PnlBreakdown;
  compare?: PnlBreakdown | null;
  compareLabel?: string;
  /** Extra content on the right (counts, unallocated salary). */
  aside?: ReactNode;
}) {
  const c = (k: keyof PnlBreakdown) => (compare ? (compare[k] as number) : null);
  const net = totals.net_profit;
  const terms: Term[] = [
    {
      label: 'Revenue', amount: totals.revenue, compare: c('revenue'), tone: 'teal', sense: 'up-good',
      rows: [{ label: 'Trip billing and extra charges', amount: totals.revenue }],
      explain: 'Completed and invoiced trips in the period, dated by when they finished. Same figure as each trip’s details page.',
    },
    {
      label: 'Direct costs', amount: totals.direct_costs, compare: c('direct_costs'), tone: 'orange', sense: 'up-bad',
      note: `${ofRevenue(totals.direct_costs, totals.revenue) || '—'} of revenue`,
      rows: [
        { label: 'Trip pay', amount: totals.driver_pay },
        { label: 'Fuel', amount: totals.fuel },
        { label: 'Maintenance and tyres', amount: totals.maintenance },
        { label: 'Tolls and parking', amount: totals.tolls },
        { label: 'Other', amount: totals.other },
      ],
      explain: 'Costs of running the truck on the road: driver trip pay plus expenses, maintenance and supplier bills linked to it.',
    },
    {
      label: 'Contribution', amount: totals.contribution, compare: c('contribution'), tone: 'positive', sense: 'up-good', outlined: true,
      note: `${pctLabel(totals.contribution_percent)} of revenue`,
      rows: [
        { label: 'Revenue', amount: totals.revenue },
        { label: 'Direct costs', amount: -totals.direct_costs },
      ],
      explain: 'What the trucks earn on the road, before salaries and the cost of owning them.',
    },
    {
      label: 'Salary and ownership', amount: totals.overhead, compare: c('overhead'), tone: 'neutral', sense: 'up-bad',
      note: `${ofRevenue(totals.overhead, totals.revenue) || '—'} of revenue`,
      rows: [
        { label: 'Driver salary share', amount: totals.salary },
        { label: 'Depreciation', amount: totals.depreciation },
        { label: 'Insurance, Istimara and fees', amount: totals.fixed_costs },
      ],
      explain: 'Time-based costs, counted per day up to today: drivers’ monthly salaries and the trucks’ depreciation and recurring fees, from Cost setup.',
    },
    {
      label: 'Net profit', amount: net, compare: c('net_profit'), tone: net < 0 ? 'negative' : 'positive', sense: 'up-good', outlined: true,
      note: `${pctLabel(totals.margin_percent)} margin`,
      rows: [
        { label: 'Contribution', amount: totals.contribution },
        { label: 'Salary and ownership', amount: -totals.overhead },
      ],
      explain: 'Contribution less salary and ownership costs — whether the trucks are worth owning.',
    },
  ];

  return (
    <Card className="flex shrink-0 flex-col gap-2 rounded-xl p-2.5 shadow-xs xl:flex-row xl:items-center">
      <div className="grid min-w-0 flex-1 grid-cols-2 items-center gap-1.5 sm:flex">
        <BridgeTerm term={terms[0]} revenue={totals.revenue} compareLabel={compareLabel} />
        <Op>−</Op>
        <BridgeTerm term={terms[1]} revenue={totals.revenue} compareLabel={compareLabel} />
        <Op>=</Op>
        <BridgeTerm term={terms[2]} revenue={totals.revenue} compareLabel={compareLabel} />
        <Op>−</Op>
        <BridgeTerm term={terms[3]} revenue={totals.revenue} compareLabel={compareLabel} />
        <Op>=</Op>
        <BridgeTerm term={terms[4]} revenue={totals.revenue} compareLabel={compareLabel} />
      </div>
      {aside && <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t pt-2 text-xs xl:border-l xl:border-t-0 xl:pl-3 xl:pt-0">{aside}</div>}
    </Card>
  );
}

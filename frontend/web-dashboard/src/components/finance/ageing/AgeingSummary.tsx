import { ArrowRight, Lightbulb } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { AgeingBucketCounts, AgeingRow } from '@/services/financeService';
import { AGEING_BUCKETS, type AgeingBucketFilter } from '@/lib/finance/ageing';
import { formatDate, formatMoney, formatPct } from '@/lib/finance/format';
import { cn } from '@/lib/utils';
import { TONE_CLASSES, bucketTone } from './tones';
import type { AgeingInsight } from './insights';
import { FigurePopover, type SummaryFigure } from '@/components/finance/kit/FigurePopover';

const COUNT_FIELD: Record<string, keyof AgeingBucketCounts> = {
  current: 'current',
  '1-30': 'days_1_30',
  '31-60': 'days_31_60',
  '61-90': 'days_61_90',
  '90+': 'days_90_plus',
};

function Insights({ insights }: { insights: AgeingInsight[] }) {
  if (insights.length === 0) return null;
  const urgent = insights.some((i) => i.tone === 'negative' || i.tone === 'warning');
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <Lightbulb className={cn('size-3.5', urgent ? TONE_CLASSES.warning.fg : 'text-muted-foreground')} />
          Needs attention
          <span className="rounded-full bg-muted px-1.5 text-[10px] font-semibold tabular-nums">{insights.length}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-1.5">
        <ul className="divide-y">
          {insights.map((item) => {
            const tone = TONE_CLASSES[item.tone ?? 'neutral'];
            return (
              <li key={item.id} className="flex items-start gap-2.5 p-2">
                <span className={cn('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border', tone.bg, tone.fg, tone.border)}>
                  <item.icon className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground">{item.title}</p>
                  <p className="text-[11px] text-muted-foreground">{item.detail}</p>
                  <button
                    type="button"
                    onClick={item.onAction}
                    className="mt-1 inline-flex items-center gap-1 rounded text-[11px] font-medium text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {item.actionLabel} <ArrowRight className="size-3" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/**
 * One compact card above the ageing table: the total with its 30-day change, a stacked bar of
 * the buckets (click a segment or legend item to filter), headline figures that open their
 * breakdown, and the insights behind a "Needs attention" button.
 */
export function AgeingSummary({
  totalLabel,
  grandTotal,
  counts,
  documentNoun,
  asOf,
  priorTotal,
  active,
  onToggle,
  figures,
  insights,
}: {
  totalLabel: string;
  grandTotal: AgeingRow;
  counts: AgeingBucketCounts;
  documentNoun: string;
  asOf: string;
  priorTotal: number | null;
  active: AgeingBucketFilter;
  onToggle: (bucket: AgeingBucketFilter) => void;
  figures: SummaryFigure[];
  insights: AgeingInsight[];
}) {
  const total = grandTotal.total;
  const change = priorTotal && priorTotal > 0 ? ((total - priorTotal) / priorTotal) * 100 : null;
  const pick = (key: AgeingBucketFilter) => onToggle(active === key ? 'all' : key);

  return (
    <Card className="flex shrink-0 flex-col gap-3 rounded-xl p-3 shadow-xs lg:flex-row lg:items-center lg:gap-5">
      <div className="shrink-0">
        <p className="text-[11px] text-muted-foreground">
          {totalLabel} · {counts.total} {documentNoun} · {formatDate(asOf)}
        </p>
        <p className="fin-num text-xl font-semibold leading-tight text-foreground">
          <span className="mr-1 text-xs font-medium text-muted-foreground">SAR</span>
          {formatMoney(total)}
        </p>
        {change !== null && (
          <p className={cn('text-[11px]', change > 0 ? TONE_CLASSES.warning.fg : TONE_CLASSES.positive.fg)}>
            {change > 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)}% vs 30 days ago
          </p>
        )}
      </div>

      <div className="min-w-0 flex-1 lg:border-l lg:pl-5">
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted" role="group" aria-label="Ageing buckets">
          {AGEING_BUCKETS.map((b) => {
            const amount = grandTotal[b.field];
            if (amount <= 0 || total <= 0) return null;
            return (
              <button
                key={b.key}
                type="button"
                aria-label={`${b.label}: SAR ${formatMoney(amount)}`}
                onClick={() => pick(b.key)}
                style={{ width: `${(amount / total) * 100}%` }}
                className={cn('h-full transition-opacity', TONE_CLASSES[bucketTone(b.key)].dot, active !== 'all' && active !== b.key && 'opacity-30')}
              />
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-1 gap-y-1">
          {AGEING_BUCKETS.map((b) => {
            const amount = grandTotal[b.field];
            const isActive = active === b.key;
            const count = counts[COUNT_FIELD[b.key]];
            return (
              <button
                key={b.key}
                type="button"
                aria-pressed={isActive}
                onClick={() => pick(b.key)}
                title={`${count} ${documentNoun} · ${formatPct(total > 0 ? (amount / total) * 100 : 0)} of total`}
                className={cn(
                  'flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
                  isActive ? 'border-foreground/30 bg-muted' : 'border-transparent',
                  amount <= 0 && 'opacity-50',
                )}
              >
                <span className={cn('size-2 rounded-full', TONE_CLASSES[bucketTone(b.key)].dot)} aria-hidden="true" />
                <span className="text-muted-foreground">{b.label}</span>
                <span className="fin-num font-medium text-foreground">{formatMoney(amount)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 lg:border-l lg:pl-4">
        {figures.map((f) => <FigurePopover key={f.id} figure={f} />)}
        <Insights insights={insights} />
      </div>
    </Card>
  );
}

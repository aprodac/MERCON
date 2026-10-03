import { toneDotVar } from '@/components/finance/kit/tones';
import { COST_GROUPS, sar0 } from '@/lib/vehiclePnl';
import type { PnlBreakdown } from '@/services/vehicleService';
import { cn } from '@/lib/utils';

/**
 * Where a truck's money went, as one bar. The bar is as long as the larger of
 * revenue and costs: cost groups fill it from the left, what's left of revenue
 * is profit (green); if costs run past revenue, a red mark shows where
 * revenue ran out.
 */
export function CostMixBar({ b, className }: { b: PnlBreakdown; className?: string }) {
  const scale = Math.max(b.revenue, b.total_costs);
  if (scale <= 0) return <div className={cn('h-2 rounded-full bg-muted', className)} title="No revenue or costs" />;

  const parts = COST_GROUPS.map((g) => ({ ...g, amount: g.of(b) })).filter((g) => g.amount > 0);
  const profit = Math.max(0, b.revenue - b.total_costs);
  const title = [
    `Revenue ${sar0(b.revenue)}`,
    ...parts.map((p) => `${p.label} ${sar0(p.amount)}`),
    b.net_profit >= 0 ? `Profit ${sar0(b.net_profit)}` : `Loss ${sar0(-b.net_profit)}`,
  ].join('\n');

  return (
    <div className={cn('relative flex h-2 overflow-hidden rounded-full bg-muted', className)} title={title} aria-label={title.replace(/\n/g, ', ')}>
      {parts.map((p) => (
        <span key={p.key} style={{ width: `${(p.amount / scale) * 100}%`, background: toneDotVar(p.tone) }} />
      ))}
      {profit > 0 && <span style={{ width: `${(profit / scale) * 100}%`, background: toneDotVar('positive'), opacity: 0.35 }} />}
      {b.total_costs > b.revenue && (
        <span className="absolute inset-y-0 w-0.5" style={{ left: `calc(${(b.revenue / scale) * 100}% - 1px)`, background: toneDotVar('negative') }} />
      )}
    </div>
  );
}

export function CostMixLegend({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground', className)}>
      {COST_GROUPS.map((g) => (
        <span key={g.key} className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: toneDotVar(g.tone) }} />
          {g.label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2 rounded-full" style={{ background: toneDotVar('positive'), opacity: 0.35 }} />
        Profit
      </span>
    </div>
  );
}

import { Info } from 'lucide-react';
import { TONE_CLASSES } from '@/components/finance/kit/tones';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { STATEMENT_ROWS, ofRevenue, signed0, type StatementKey } from '@/lib/vehiclePnl';
import type { PnlBreakdown } from '@/services/vehicleService';
import { cn } from '@/lib/utils';

/**
 * A truck's (or the fleet's) P&L as a short statement: each line with its
 * share of revenue, contribution and net profit as ruled subtotals. Cost rows
 * with nothing in them are dimmed rather than hidden, so a missing cost (no
 * fuel logged) is visible as a gap.
 */
export function PnlStatement({
  totals,
  compare,
  compareLabel,
  active,
  onRow,
  dense = false,
}: {
  totals: PnlBreakdown;
  compare?: PnlBreakdown | null;
  compareLabel?: string;
  /** Row highlighted as the ledger's current filter. */
  active?: StatementKey | null;
  onRow?: (key: StatementKey) => void;
  dense?: boolean;
}) {
  const py = dense ? 'py-1' : 'py-1.5';
  return (
    <TooltipProvider delay={300}>
      <table className="w-full text-xs">
        {compare && (
          <thead>
            <tr className="text-[11px] text-muted-foreground">
              <th className="pb-1 text-left font-medium" />
              <th className="pb-1 text-right font-medium">This period</th>
              <th className="pb-1 text-right font-medium" />
              <th className="pb-1 pl-3 text-right font-medium">{compareLabel ?? 'Before'}</th>
            </tr>
          </thead>
        )}
        <tbody>
          {STATEMENT_ROWS.map((row) => {
            const amount = totals[row.key] as number;
            const isTotal = row.kind === 'total' || row.kind === 'subtotal';
            const shown = row.kind === 'cost' ? -amount : amount;
            const empty = row.kind === 'cost' && Math.abs(amount) < 0.5;
            const tone = isTotal ? (amount < -0.5 ? TONE_CLASSES.negative.fg : TONE_CLASSES.positive.fg) : '';
            const clickable = Boolean(onRow) && !isTotal;
            return (
              <tr
                key={row.key}
                onClick={clickable ? () => onRow!(row.key) : undefined}
                className={cn(
                  isTotal && 'border-t border-border',
                  row.kind === 'total' && 'border-t-2',
                  clickable && 'cursor-pointer hover:bg-muted/50',
                  active === row.key && 'bg-muted',
                )}
              >
                <td className={cn(py, 'pl-1 pr-2', isTotal ? 'font-semibold text-foreground' : row.kind === 'cost' ? 'pl-3 text-muted-foreground' : 'font-medium text-foreground', empty && 'opacity-50')}>
                  <span className="inline-flex items-center gap-1">
                    {row.label}
                    <Tooltip>
                      <TooltipTrigger className="inline-flex rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={row.hint}>
                        <Info className="size-3 shrink-0 text-muted-foreground/60" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-60 text-xs">{row.hint}</TooltipContent>
                    </Tooltip>
                  </span>
                </td>
                <td className={cn(py, 'fin-num text-right', isTotal ? cn('font-semibold', tone) : 'text-foreground', empty && 'opacity-50')}>{signed0(shown)}</td>
                <td className={cn(py, 'fin-num w-14 pr-1 text-right text-[11px] text-muted-foreground')}>{ofRevenue(Math.abs(amount), totals.revenue)}</td>
                {compare && (
                  <td className={cn(py, 'fin-num pl-3 text-right text-muted-foreground')}>
                    {signed0(row.kind === 'cost' ? -(compare[row.key] as number) : (compare[row.key] as number))}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </TooltipProvider>
  );
}

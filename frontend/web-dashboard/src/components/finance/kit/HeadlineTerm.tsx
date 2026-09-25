import type { ReactNode } from 'react';
import type { ChipTone } from '@/components/ui/chip';
import { changePct, senseTone, type ChangeSense } from '@/lib/finance/statementModel';
import { formatMoney } from '@/lib/finance/format';
import { cn } from '@/lib/utils';
import { TONE_CLASSES } from './tones';

/**
 * One term of a statement headline (the balance-sheet equation, the profit flow): label, amount
 * and a small line underneath — the change when comparing, otherwise `note` (a share or margin).
 */
export function HeadlineTerm({
  label,
  amount,
  tone,
  sense,
  compare = null,
  compareLabel,
  note,
  outlined = false,
  title,
  onClick,
  className,
}: {
  label: string;
  amount: number;
  tone: ChipTone;
  sense: ChangeSense;
  compare?: number | null;
  compareLabel?: string;
  note?: ReactNode;
  /** Results (gross profit) sit on a plain card with a border instead of a tinted fill. */
  outlined?: boolean;
  title?: string;
  onClick?: () => void;
  className?: string;
}) {
  const t = TONE_CLASSES[tone];
  const delta = compare === null ? 0 : amount - compare;
  const pct = changePct(amount, compare);
  const changeTone = senseTone(sense, delta);
  const negative = amount < -0.005;

  const sub =
    compare !== null ? (
      <span className="block truncate text-[11px] text-muted-foreground" title={compareLabel ? `On ${compareLabel}` : undefined}>
        from <span className="fin-num">{formatMoney(compare)}</span> ·{' '}
        {Math.abs(delta) < 0.005 ? (
          'no change'
        ) : (
          <span className={cn('fin-num font-medium', changeTone && TONE_CLASSES[changeTone].fg)}>
            {delta > 0 ? '▲' : '▼'} {formatMoney(Math.abs(delta))}
            {pct !== null && ` (${Math.abs(pct).toFixed(1)}%)`}
          </span>
        )}
      </span>
    ) : note ? (
      <span className="block truncate text-[11px] text-muted-foreground">{note}</span>
    ) : null;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      title={title}
      className={cn(
        'min-w-0 flex-1 rounded-lg border px-3 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring enabled:hover:brightness-[0.97] disabled:cursor-default',
        outlined ? 'border-border bg-card' : cn(t.bg, t.border),
        className,
      )}
    >
      <span className={cn('block truncate text-[11px] font-medium', outlined ? 'text-muted-foreground' : t.fg)}>{label}</span>
      <span className={cn('fin-num block truncate text-lg font-semibold leading-tight', negative ? TONE_CLASSES.negative.fg : outlined ? 'text-foreground' : t.fg)}>
        {negative ? `−${formatMoney(-amount)}` : formatMoney(amount)}
      </span>
      {sub}
    </button>
  );
}

import { Check, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A stop or location is either pinned exactly or it needs a pin — the team
 * doesn't need more than that. Approximate (a city centre / area guess) and
 * no pin at all both mean the ETA, driver navigation and automatic arrival
 * can't be trusted, so both read "Pin needed".
 */
export function isExactPin(precision: string | null | undefined, lat?: number | null, lng?: number | null): boolean {
  return precision === 'EXACT' && lat != null && lng != null && (lat !== 0 || lng !== 0);
}

interface PinChipProps {
  exact: boolean;
  /** When set, the chip is a button that opens the "Set pin" box. */
  onClick?: () => void;
  className?: string;
}

export default function PinChip({ exact, onClick, className }: PinChipProps) {
  const classes = cn(
    'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap',
    exact
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
      : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-800',
    onClick && 'cursor-pointer transition hover:brightness-95',
    onClick && !exact && 'hover:ring-amber-400',
    className
  );
  const content = (
    <>
      {exact ? <Check className="size-3" strokeWidth={3} /> : <MapPin className="size-3" />}
      {exact ? 'Exact' : 'Pin needed'}
    </>
  );
  if (!onClick) return <span className={classes}>{content}</span>;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={classes}
      title={exact ? 'Move the pin' : 'Set the exact pin'}
    >
      {content}
    </button>
  );
}

import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * The summary figures above a list: one card, the figures inline. Colour sits only on a figure's
 * value (overdue red, received green) or as a small dot before its label — never borders or
 * tinted boxes. Same look as the Invoices page.
 */
export function FigureStrip({ children, className }: { children: ReactNode; className?: string }) {
  return <Card className={cn('flex flex-1 flex-row flex-wrap items-center gap-2 rounded-xl p-2 shadow-xs', className)}>{children}</Card>;
}

export function Figure({
  label,
  value,
  count,
  tone,
  dot,
  sub,
  onClick,
  active,
  loading,
}: {
  label: string;
  value: ReactNode;
  count?: number;
  /** Text colour class for the value (e.g. TONE_CLASSES.negative.fg). */
  tone?: string | null;
  /** Dot colour class before the label, for what the figure is (e.g. a type's colour). */
  dot?: string;
  sub?: ReactNode;
  /** Clickable figures filter the list below. */
  onClick?: () => void;
  active?: boolean;
  loading?: boolean;
}) {
  const body = (
    <>
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {dot && <span className={cn('size-1.5 shrink-0 rounded-full', dot)} />}
        {label}
        {count !== undefined && ` · ${count}`}
      </span>
      {loading ? <Skeleton className="mt-1 h-5 w-20" /> : <span className={cn('fin-num block text-base font-semibold leading-tight', tone ?? 'text-foreground')}>{value}</span>}
      {sub && <span className="mt-0.5 block text-[11px] text-muted-foreground">{sub}</span>}
    </>
  );
  if (!onClick) return <div className="min-w-0 px-2 py-1">{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn('min-w-0 rounded-md px-2 py-1 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring', active && 'bg-muted')}
    >
      {body}
    </button>
  );
}

import * as React from 'react';
import { cn } from '@/lib/utils';
import type { ChipTone } from '@/components/ui/chip';

export interface StatPillProps extends React.HTMLAttributes<HTMLDivElement> {
  count?: number | string;
  label: string;
  value?: React.ReactNode | number | string;
  tone?: ChipTone;
}

const TONE_FG_CLASSES: Record<ChipTone, string> = {
  neutral: 'text-chip-neutral-fg',
  positive: 'text-chip-positive-fg',
  negative: 'text-chip-negative-fg',
  warning: 'text-chip-warning-fg',
  info: 'text-chip-info-fg',
  violet: 'text-chip-violet-fg',
  teal: 'text-chip-teal-fg',
  orange: 'text-chip-orange-fg',
  brand: 'text-chip-brand-fg',
};

export function StatPill({
  count,
  label,
  value,
  tone = 'neutral',
  className,
  ...props
}: StatPillProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border border-border bg-card shadow-xs px-3 py-1 text-xs select-none whitespace-nowrap',
        className
      )}
      {...props}
    >
      {count !== undefined && count !== null && (
        <span className="font-semibold text-foreground fin-num">{count}</span>
      )}
      <span className="text-muted-foreground font-medium">{label}</span>
      {value !== undefined && value !== null && (
        <span
          className={cn(
            'border-l border-border pl-2 font-mono font-semibold',
            TONE_FG_CLASSES[tone] || 'text-foreground'
          )}
        >
          {value}
        </span>
      )}
    </div>
  );
}

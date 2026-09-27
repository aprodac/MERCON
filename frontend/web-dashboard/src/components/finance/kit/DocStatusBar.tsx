import React from 'react';
import { Check } from 'lucide-react';
import { formatDate } from '@/lib/finance';
import { cn } from '@/lib/utils';

export interface DocStep {
  key?: string;
  label: string;
  at?: string | Date | null;
  timestamp?: string | Date | null;
}

export interface DocStatusBarProps {
  steps: DocStep[];
  current?: string;
  currentStepIndex?: number;
  voided?: boolean;
  className?: string;
}

export function DocStatusBar({
  steps,
  current,
  currentStepIndex,
  voided = false,
  className,
}: DocStatusBarProps) {
  const activeIndex =
    currentStepIndex !== undefined
      ? currentStepIndex
      : steps.findIndex((s) => s.key === current);

  return (
    <ol
      className={cn(
        'bg-card border border-border rounded-xl p-1.5 shadow-xs grid grid-flow-col auto-cols-fr gap-1 select-none',
        className
      )}
    >
      {steps.map((step, idx) => {
        const isDone = !voided && activeIndex > idx;
        const isCurrent =
          !voided &&
          (activeIndex === idx || (activeIndex === -1 && idx === steps.length - 1));
        const timeVal = step.at || step.timestamp;

        return (
          <li
            key={step.key || step.label || idx}
            className={cn(
              'flex flex-col sm:flex-row items-center justify-center gap-2 py-1.5 px-2.5 rounded-md transition-all text-center sm:text-left',
              isCurrent
                ? 'bg-muted/80 text-foreground font-medium'
                : isDone
                ? 'text-foreground'
                : voided && idx === steps.length - 1
                ? 'bg-muted/50 text-muted-foreground font-medium'
                : 'text-muted-foreground'
            )}
          >
            <span
              className={cn(
                'w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[10px] font-semibold transition-all',
                isCurrent
                  ? 'bg-primary text-primary-foreground'
                  : isDone
                  ? 'bg-foreground text-background'
                  : voided && idx === steps.length - 1
                  ? 'bg-muted-foreground text-background'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {isDone ? <Check className="w-2.5 h-2.5 stroke-[3]" /> : idx + 1}
            </span>
            <div className="flex flex-col">
              <span className="text-xs leading-tight font-medium">{step.label}</span>
              {timeVal && (
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {typeof timeVal === 'string' && timeVal.includes(',') ? timeVal : formatDate(timeVal)}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}


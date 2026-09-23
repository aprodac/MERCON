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
        'bg-white dark:bg-slate-900 border border-black/[0.06] dark:border-slate-800 rounded-2xl p-1.5 grid grid-flow-col auto-cols-fr gap-1 select-none',
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
              'flex flex-col sm:flex-row items-center justify-center gap-2 py-2 px-3 rounded-xl transition-all text-center sm:text-left',
              isCurrent
                ? 'bg-[#FFF4F2] dark:bg-[rgba(250,99,78,0.12)] text-[#FA634E] dark:text-[#FA634E] font-semibold'
                : isDone
                ? 'text-[#111111] dark:text-slate-200'
                : voided && idx === steps.length - 1
                ? 'bg-[#F4F4F6] dark:bg-slate-800/80 text-[#6E6E80] dark:text-slate-400 font-medium'
                : 'text-[#6E6E80] dark:text-slate-400'
            )}
          >
            <span
              className={cn(
                'w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold transition-all',
                isCurrent
                  ? 'bg-[#FA634E] text-white'
                  : isDone
                  ? 'bg-[#3E3C3D] text-white'
                  : voided && idx === steps.length - 1
                  ? 'bg-[#6E6E80] text-white'
                  : 'bg-[#F1F2F5] dark:bg-slate-800 text-[#6E6E80] dark:text-slate-400'
              )}
            >
              {isDone ? <Check className="w-3 h-3 stroke-[3]" /> : idx + 1}
            </span>
            <div className="flex flex-col">
              <span className="text-[12.5px] leading-tight">{step.label}</span>
              {timeVal && (
                <span className="text-[10.5px] opacity-70 font-mono">
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

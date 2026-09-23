import React from 'react';
import { cn } from '@/lib/utils';

export interface FinanceEmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function FinanceEmptyState({
  icon,
  title,
  description,
  action,
  className,
}: FinanceEmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-8 sm:p-12 text-center bg-white dark:bg-slate-900 border border-black/[0.06] dark:border-slate-800 rounded-[20px]',
        className
      )}
    >
      {icon && (
        <div className="w-12 h-12 rounded-2xl bg-[#F7F8FA] dark:bg-slate-800/80 border border-black/[0.04] dark:border-white/[0.06] flex items-center justify-center text-[#6E6E80] dark:text-slate-400 mb-3 shadow-xs">
          {icon}
        </div>
      )}
      <h3 className="text-[15px] font-bold text-[#111111] dark:text-slate-100 mb-1">
        {title}
      </h3>
      {description && (
        <p className="text-[13px] text-[#6E6E80] dark:text-slate-400 max-w-sm mb-5 leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

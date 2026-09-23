import React from 'react';
import { cn } from '@/lib/utils';

export interface FinanceEmptyAction {
  label: string;
  onClick?: () => void;
}

export interface FinanceEmptyStateProps {
  icon?: any;
  title: string;
  description?: React.ReactNode;
  action?: FinanceEmptyAction | React.ReactNode | any;
  className?: string;
}

export function FinanceEmptyState({
  icon: IconOrElement,
  title,
  description,
  action,
  className,
}: FinanceEmptyStateProps) {
  const renderedIcon =
    typeof IconOrElement === 'function' || (typeof IconOrElement === 'object' && IconOrElement && 'render' in (IconOrElement as any))
      ? React.createElement(IconOrElement as React.ComponentType<{ className?: string }>, { className: 'w-6 h-6 text-[#6E6E80] dark:text-slate-400' })
      : IconOrElement;

  const renderedAction =
    action && typeof action === 'object' && 'label' in action ? (
      <button
        type="button"
        onClick={action.onClick}
        className="px-4 py-2 text-xs font-semibold rounded-xl bg-[#FA634E] hover:bg-[#e0523d] text-white shadow-xs transition-colors"
      >
        {action.label}
      </button>
    ) : (
      action
    );

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-8 sm:p-12 text-center bg-white dark:bg-slate-900 border border-black/[0.06] dark:border-slate-800 rounded-[20px]',
        className
      )}
    >
      {renderedIcon && (
        <div className="w-12 h-12 rounded-2xl bg-[#F7F8FA] dark:bg-slate-800/80 border border-black/[0.04] dark:border-white/[0.06] flex items-center justify-center text-[#6E6E80] dark:text-slate-400 mb-3 shadow-xs">
          {renderedIcon}
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
      {renderedAction && <div className="mt-1">{renderedAction}</div>}
    </div>
  );
}

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
      ? React.createElement(IconOrElement as React.ComponentType<{ className?: string }>, { className: 'w-5 h-5 text-muted-foreground' })
      : IconOrElement;

  const renderedAction =
    action && typeof action === 'object' && 'label' in action ? (
      <button
        type="button"
        onClick={action.onClick}
        className="px-3.5 py-1.5 text-xs font-semibold rounded-md bg-[#FA634E] hover:bg-[#e0523d] text-white shadow-2xs transition-colors"
      >
        {action.label}
      </button>
    ) : (
      action
    );

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-8 sm:p-12 text-center bg-card border border-border rounded-xl shadow-xs',
        className
      )}
    >
      {renderedIcon && (
        <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center text-muted-foreground mb-3">
          {renderedIcon}
        </div>
      )}
      <h3 className="text-[15px] font-semibold text-foreground mb-1">
        {title}
      </h3>
      {description && (
        <p className="text-xs text-muted-foreground max-w-sm mb-4 leading-relaxed">
          {description}
        </p>
      )}
      {renderedAction && <div className="mt-1">{renderedAction}</div>}
    </div>
  );
}

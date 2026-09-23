import React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export interface FinanceCrumb {
  label: string;
  to?: string;
  href?: string;
}

export interface FinancePageHeaderProps {
  crumbs: FinanceCrumb[];
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function FinancePageHeader({
  crumbs,
  title,
  subtitle,
  actions,
  className,
}: FinancePageHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-2.5 mb-5', className)}>
      {/* Breadcrumbs */}
      {crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[12px] text-[#6E6E80] dark:text-slate-400">
          {crumbs.map((crumb, idx) => {
            const isLast = idx === crumbs.length - 1;
            const target = crumb.to || crumb.href;
            return (
              <React.Fragment key={idx}>
                {idx > 0 && (
                  <span className="text-[#6E6E80]/40 dark:text-slate-600 select-none">/</span>
                )}
                {target && !isLast ? (
                  <Link
                    to={target}
                    className="hover:text-[#FA634E] transition-colors"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className={cn(isLast ? 'font-semibold text-[#111111] dark:text-slate-100' : '')}>
                    {crumb.label}
                  </span>
                )}
              </React.Fragment>
            );
          })}
        </nav>
      )}

      {/* Main Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-[-0.01em] text-[#111111] dark:text-slate-100 leading-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[13px] text-[#6E6E80] dark:text-slate-400 mt-0.5 max-w-2xl">
              {subtitle}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-auto">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

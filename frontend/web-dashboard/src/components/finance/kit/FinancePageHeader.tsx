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
    <div className={cn('flex flex-col gap-2 mb-4', className)}>
      {/* Breadcrumbs */}
      {crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {crumbs.map((crumb, idx) => {
            const isLast = idx === crumbs.length - 1;
            const target = crumb.to || crumb.href;
            return (
              <React.Fragment key={idx}>
                {idx > 0 && (
                  <span className="text-muted-foreground/40 select-none">/</span>
                )}
                {target && !isLast ? (
                  <Link
                    to={target}
                    className="hover:text-foreground transition-colors"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className={cn(isLast ? 'font-medium text-foreground' : '')}>
                    {crumb.label}
                  </span>
                )}
              </React.Fragment>
            );
          })}
        </nav>
      )}

      {/* Main Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground leading-snug">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
              {subtitle}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}


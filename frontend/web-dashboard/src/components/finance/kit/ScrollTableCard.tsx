import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface ScrollTableCardProps {
  /** Optional card toolbar (filters, search, view switches inside card header) */
  toolbar?: React.ReactNode;
  /** The scrollable table or grid content */
  children: React.ReactNode;
  /** Pinned footer content (pagination controls, ledgers period totals) */
  footer?: React.ReactNode;
  /** Additional Card container classes */
  className?: string;
  /** Additional table container div classes */
  containerClassName?: string;
  /** ID for scroll targeting */
  id?: string;
}

export function ScrollTableCard({
  toolbar,
  children,
  footer,
  className,
  containerClassName,
  id,
}: ScrollTableCardProps) {
  return (
    <Card
      id={id}
      className={cn(
        'flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs',
        className
      )}
    >
      {toolbar && (
        <div className="px-3 py-2 border-b border-border bg-card flex flex-wrap items-center justify-between gap-2 shrink-0 text-xs">
          {toolbar}
        </div>
      )}
      <CardContent className="relative flex min-h-0 flex-1 flex-col p-0 overflow-hidden">
        <div className={cn('table-container flex-1 overflow-auto w-full', containerClassName)}>
          {children}
        </div>
      </CardContent>
      {footer && (
        <div className="border-t border-border bg-background px-4 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2 shrink-0">
          {footer}
        </div>
      )}
    </Card>
  );
}

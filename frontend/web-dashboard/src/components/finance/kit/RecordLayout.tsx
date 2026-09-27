import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

import { FinancePageHeader, FinanceCrumb } from './FinancePageHeader';

export interface RecordPager {
  index: number;
  total: number;
  prevTo?: string;
  nextTo?: string;
}

export interface RecordLayoutProps {
  crumbs?: FinanceCrumb[];
  title?: React.ReactNode;
  subLine?: React.ReactNode;
  actions?: React.ReactNode;
  header?: React.ReactNode;
  statusBar?: React.ReactNode;
  main: React.ReactNode;
  side?: React.ReactNode;
  pager?: RecordPager;
  className?: string;
}

export function RecordLayout({
  crumbs,
  title,
  subLine,
  actions,
  header,
  statusBar,
  main,
  side,
  pager,
  className,
}: RecordLayoutProps) {
  const renderedHeader = header || (
    (crumbs || title || actions) ? (
      <FinancePageHeader
        crumbs={crumbs || []}
        title={title || ''}
        subtitle={subLine}
        actions={actions}
      />
    ) : null
  );
  return (
    <div className={cn('space-y-4 max-w-[1600px] mx-auto animate-fade-in', className)}>
      {/* Top Header & Pager */}
      {renderedHeader && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex-1">{renderedHeader}</div>
          {pager && pager.total > 0 && (
            <div className="flex items-center gap-2 self-end sm:self-auto text-xs text-muted-foreground bg-card border border-border rounded-xl px-3 py-1.5 shadow-xs">
              <span className="fin-num font-medium text-foreground">
                {pager.index} of {pager.total}
              </span>
              <div className="flex items-center gap-1">
                {pager.prevTo ? (
                  <Link
                    to={pager.prevTo}
                    className="p-1 hover:bg-muted rounded-md transition-colors text-foreground"
                    title="Previous entry"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Link>
                ) : (
                  <span className="p-1 opacity-30 cursor-not-allowed text-muted-foreground">
                    <ChevronLeft className="w-4 h-4" />
                  </span>
                )}
                {pager.nextTo ? (
                  <Link
                    to={pager.nextTo}
                    className="p-1 hover:bg-muted rounded-md transition-colors text-foreground"
                    title="Next entry"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                ) : (
                  <span className="p-1 opacity-30 cursor-not-allowed text-muted-foreground">
                    <ChevronRight className="w-4 h-4" />
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Status Bar */}
      {statusBar && <div>{statusBar}</div>}

      {/* Main Content & Side Panel */}
      <div className="flex flex-col lg:flex-row items-start gap-4">
        <div className="flex-1 w-full min-w-0">{main}</div>
        {side && <div className="w-full lg:w-[360px] shrink-0 space-y-4">{side}</div>}
      </div>
    </div>
  );
}


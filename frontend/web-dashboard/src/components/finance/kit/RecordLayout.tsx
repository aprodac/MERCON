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
            <div className="flex items-center gap-2 self-end sm:self-auto text-xs text-[#6E6E80] dark:text-slate-400 bg-white dark:bg-slate-900 border border-black/[0.06] dark:border-slate-800 rounded-xl px-3 py-1.5 shadow-xs">
              <span className="fin-num font-semibold text-[#111111] dark:text-slate-200">
                {pager.index} of {pager.total}
              </span>
              <div className="flex items-center gap-1">
                {pager.prevTo ? (
                  <Link
                    to={pager.prevTo}
                    className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors text-[#111111] dark:text-slate-200"
                    title="Previous entry"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Link>
                ) : (
                  <span className="p-1 opacity-30 cursor-not-allowed text-[#6E6E80]">
                    <ChevronLeft className="w-4 h-4" />
                  </span>
                )}
                {pager.nextTo ? (
                  <Link
                    to={pager.nextTo}
                    className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors text-[#111111] dark:text-slate-200"
                    title="Next entry"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                ) : (
                  <span className="p-1 opacity-30 cursor-not-allowed text-[#6E6E80]">
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
      <div className="flex flex-col lg:flex-row items-start gap-[18px]">
        <div className="flex-1 w-full min-w-0">{main}</div>
        {side && <div className="w-full lg:w-[360px] shrink-0 space-y-4">{side}</div>}
      </div>
    </div>
  );
}

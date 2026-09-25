import React from 'react';
import { Badge } from '@/components/ui/badge';

export interface StatementHeaderBarProps {
  title: string;
  periodLabel: string;
  isSnapshot?: boolean;
  sourceLabel?: string;
  basis?: string;
  currency?: string;
  companyName?: string;
  subtitle?: string;
}

export function StatementHeaderBar({
  title,
  periodLabel,
  isSnapshot = false,
  sourceLabel,
  basis = 'Accrual',
  currency = 'SAR',
  companyName,
  subtitle,
}: StatementHeaderBarProps) {
  const displayCompany = subtitle || companyName || 'MERCON Logistics';
  const displaySource = sourceLabel || (isSnapshot ? 'Period snapshot' : 'Live ledger');
  const isSnap = isSnapshot || displaySource.toLowerCase().includes('snapshot');

  return (
    <>
      {/* ── ON SCREEN HEADER: Slim Bar (≤ 56px) ────────────────────────────── */}
      <div className="h-14 px-4 bg-slate-50/60 dark:bg-slate-800/40 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3 print:hidden">
        {/* Left: Statement Title + Company Name */}
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-7 bg-[#FA634E] rounded-full shrink-0" />
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 leading-tight">
              {title}
            </h2>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {displayCompany}
            </p>
          </div>
        </div>

        {/* Right: Micro Chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-semibold px-2 py-0.5">
            {periodLabel}
          </Badge>
          <Badge variant="outline" className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-[11px] font-medium px-2 py-0.5">
            {basis}
          </Badge>
          <Badge variant="outline" className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-[11px] font-medium px-2 py-0.5">
            {currency}
          </Badge>
          <Badge
            variant="outline"
            className={`text-[11px] font-medium px-2 py-0.5 flex items-center gap-1 ${
              isSnap
                ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isSnap ? 'bg-purple-500' : 'bg-emerald-500'}`} />
            <span>{displaySource}</span>
          </Badge>
        </div>
      </div>

      {/* ── ON PRINT HEADER: Formal Centred 4-Line Header ─────────────────── */}
      <div className="hidden print:block text-center pb-4 border-b border-slate-300 mb-4 space-y-1">
        <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
          {companyName}
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          {title}
        </h1>
        <div className="text-xs font-semibold text-slate-700">
          {periodLabel}
        </div>
        <div className="text-[11px] font-medium text-slate-500">
          {basis} Basis · Amounts in {currency}
        </div>
      </div>
    </>
  );
}

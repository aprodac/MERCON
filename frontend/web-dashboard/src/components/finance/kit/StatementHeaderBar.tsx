import React from 'react';

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

  return (
    <>
      {/* ── ON SCREEN HEADER ────────────────────────────── */}
      <div className="px-5 py-3.5 bg-muted/40 border-b border-border/60 flex items-center justify-between gap-3 print:hidden">
        {/* Left: Statement Title + Company Name */}
        <div>
          <h2 className="text-[15px] font-semibold text-foreground leading-snug">
            {title}
          </h2>
          <p className="text-xs text-muted-foreground">
            {displayCompany}
          </p>
        </div>

        {/* Right: Neutral Micro Chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset bg-muted text-muted-foreground ring-border">
            {periodLabel}
          </span>
          <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset bg-muted text-muted-foreground ring-border">
            {basis}
          </span>
          <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset bg-muted text-muted-foreground ring-border">
            {currency}
          </span>
          <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset bg-muted text-muted-foreground ring-border">
            {displaySource}
          </span>
        </div>
      </div>

      {/* ── ON PRINT HEADER: Formal Centred 4-Line Header ─────────────────── */}
      <div className="hidden print:block text-center pb-4 border-b border-border mb-4 space-y-1">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {displayCompany}
        </div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          {title}
        </h1>
        <div className="text-xs font-medium text-foreground">
          {periodLabel}
        </div>
        <div className="text-[11px] font-medium text-muted-foreground">
          {basis} Basis · Amounts in {currency}
        </div>
      </div>
    </>
  );
}


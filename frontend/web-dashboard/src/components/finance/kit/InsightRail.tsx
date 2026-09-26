import React from 'react';
import {
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import { formatMoney, formatPct } from '@/lib/finance/format';

export interface InsightRailProps {
  mode: 'balance_sheet' | 'pnl' | 'general_ledger';
  data: any;
  onJumpTo?: (sectionId: string) => void;
  onNavigateAnalysis?: () => void;
}

export function InsightRail({ mode, data, onJumpTo, onNavigateAnalysis }: InsightRailProps) {
  if (!data) return null;

  if (mode === 'balance_sheet') {
    const {
      totalAssets = 0,
      totalLiabilities = 0,
      totalEquity = 0,
      currentAssetsTotal = 0,
      currentLiabilitiesTotal = 0,
    } = data;

    const isBalanced = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01;
    const outAmount = Math.abs(totalAssets - (totalLiabilities + totalEquity));
    const workingCapital = currentAssetsTotal - currentLiabilitiesTotal;
    const currentRatio = currentLiabilitiesTotal > 0 ? (currentAssetsTotal / currentLiabilitiesTotal).toFixed(1) + 'x' : 'N/A';

    return (
      <div className="space-y-3 print:hidden">
        {/* Merged "At a Glance & Jump to Section" Card */}
        <div className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              At a Glance
            </span>
          </div>

          <div className="space-y-1.5 text-xs">
            <button
              type="button"
              onClick={() => onJumpTo?.('section-assets')}
              className="w-full flex items-center justify-between p-1.5 rounded-md hover:bg-muted/50 transition-colors text-left group"
            >
              <span className="flex items-center gap-2 font-medium text-foreground group-hover:underline">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                <span>Assets</span>
              </span>
              <span className="fin-num text-foreground font-medium">{formatMoney(totalAssets)}</span>
            </button>

            <button
              type="button"
              onClick={() => onJumpTo?.('section-liabilities')}
              className="w-full flex items-center justify-between p-1.5 rounded-md hover:bg-muted/50 transition-colors text-left group"
            >
              <span className="flex items-center gap-2 font-medium text-foreground group-hover:underline">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <span>Liabilities</span>
              </span>
              <span className="fin-num text-foreground font-medium">{formatMoney(totalLiabilities)}</span>
            </button>

            <button
              type="button"
              onClick={() => onJumpTo?.('section-equity')}
              className="w-full flex items-center justify-between p-1.5 rounded-md hover:bg-muted/50 transition-colors text-left group"
            >
              <span className="flex items-center gap-2 font-medium text-foreground group-hover:underline">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                <span>Equity</span>
              </span>
              <span className="fin-num text-foreground font-medium">{formatMoney(totalEquity)}</span>
            </button>
          </div>

          {/* Bottom Result Status Line */}
          <div className="pt-2 border-t border-border/60 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Balance Status</span>
            {isBalanced ? (
              <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-600/20">
                <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                <span>✓ Balanced</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-600/20">
                <AlertCircle className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                <span>Out by {formatMoney(outAmount)}</span>
              </span>
            )}
          </div>
        </div>

        {/* Key Metrics Card (Balance Sheet only) */}
        <div className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              Key Metrics
            </span>
            {onNavigateAnalysis && (
              <button
                type="button"
                onClick={onNavigateAnalysis}
                className="text-xs font-medium text-foreground hover:underline flex items-center gap-0.5"
              >
                <span>Analysis</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-muted/40 p-2 rounded-md border border-border/60">
              <span className="text-[10px] text-muted-foreground font-medium block">Working Cap</span>
              <span className="fin-num font-medium text-foreground">{formatMoney(workingCapital)}</span>
            </div>
            <div className="bg-muted/40 p-2 rounded-md border border-border/60">
              <span className="text-[10px] text-muted-foreground font-medium block">Current Ratio</span>
              <span className="fin-num font-medium text-foreground">{currentRatio}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'pnl') {
    const {
      operatingIncomeTotal = 0,
      costOfSalesTotal = 0,
      operatingExpenseTotal = 0,
      otherIncomeTotal = 0,
      netProfit = 0,
    } = data;
    const totalRev = operatingIncomeTotal + otherIncomeTotal;
    const netMargin = totalRev > 0 ? (netProfit / totalRev) * 100 : 0;
    const isLoss = netProfit < 0;

    return (
      <div className="space-y-3 print:hidden">
        {/* Merged "At a Glance & Jump to Section" Card */}
        <div className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              At a Glance
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                isLoss
                  ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-600/20'
                  : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-600/20'
              }`}
            >
              {isLoss ? (
                <TrendingDown className="w-3 h-3 text-rose-600 dark:text-rose-400" />
              ) : (
                <TrendingUp className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              )}
              <span>Margin: {formatPct(netMargin)}</span>
            </span>
          </div>

          <div className="space-y-1.5 text-xs">
            <button
              type="button"
              onClick={() => onJumpTo?.('section-operating_income')}
              className="w-full flex items-center justify-between p-1.5 rounded-md hover:bg-muted/50 transition-colors text-left group"
            >
              <span className="flex items-center gap-2 font-medium text-foreground group-hover:underline">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Operating Income</span>
              </span>
              <span className="fin-num font-medium text-foreground">{formatMoney(operatingIncomeTotal)}</span>
            </button>

            <button
              type="button"
              onClick={() => onJumpTo?.('section-cost_of_sales')}
              className="w-full flex items-center justify-between p-1.5 rounded-md hover:bg-muted/50 transition-colors text-left group"
            >
              <span className="flex items-center gap-2 font-medium text-foreground group-hover:underline">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <span>Cost of Sales</span>
              </span>
              <span className="fin-num font-medium text-foreground">{formatMoney(costOfSalesTotal)}</span>
            </button>

            <button
              type="button"
              onClick={() => onJumpTo?.('section-operating_expense')}
              className="w-full flex items-center justify-between p-1.5 rounded-md hover:bg-muted/50 transition-colors text-left group"
            >
              <span className="flex items-center gap-2 font-medium text-foreground group-hover:underline">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                <span>Operating Expenses</span>
              </span>
              <span className="fin-num font-medium text-foreground">{formatMoney(operatingExpenseTotal)}</span>
            </button>
          </div>

          {/* Bottom Net Result Line */}
          <div className="pt-2 border-t border-border/60 flex items-center justify-between">
            <span className="font-semibold text-foreground">Net {isLoss ? 'Loss' : 'Profit'}</span>
            <span
              className={`fin-num font-semibold ${
                isLoss ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {formatMoney(netProfit)}
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'general_ledger') {
    const { account, opening_balance = 0, closing_balance = 0, total_debit = 0, total_credit = 0 } = data;

    return (
      <div className="space-y-3 print:hidden">
        {/* Account Details Card */}
        <div className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              Account Overview
            </span>
            {account && (
              <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset bg-muted text-muted-foreground ring-border">
                {account.account_type}
              </span>
            )}
          </div>

          {account ? (
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Code & Name</span>
                <span className="font-medium text-foreground">
                  {account.account_code} · {account.name}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Opening Balance</span>
                <span className="fin-num font-medium text-foreground">{formatMoney(opening_balance)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Period Debits</span>
                <span className="fin-num font-medium text-foreground">{formatMoney(total_debit)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Period Credits</span>
                <span className="fin-num font-medium text-foreground">{formatMoney(total_credit)}</span>
              </div>
              <div className="pt-2 border-t border-border/60 flex items-center justify-between">
                <span className="font-semibold text-foreground">Closing Balance</span>
                <span className="fin-num font-semibold text-foreground">{formatMoney(closing_balance)}</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">No account selected</p>
          )}
        </div>
      </div>
    );
  }

  return null;
}

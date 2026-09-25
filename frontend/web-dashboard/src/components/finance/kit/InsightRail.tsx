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
    const { totalAssets = 0, totalLiabilities = 0, totalEquity = 0, currentAssetsTotal = 0, currentLiabilitiesTotal = 0 } = data;
    const isBalanced = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01;
    const outAmount = Math.abs(totalAssets - (totalLiabilities + totalEquity));
    const workingCapital = currentAssetsTotal - currentLiabilitiesTotal;
    const currentRatio = currentLiabilitiesTotal > 0 ? (currentAssetsTotal / currentLiabilitiesTotal).toFixed(1) + 'x' : 'N/A';

    return (
      <div className="space-y-3 print:hidden">
        {/* At a Glance Card */}
        <div className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              At a Glance
            </span>
            {isBalanced ? (
              <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-600/20">
                <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                <span>Balanced</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-600/20">
                <AlertCircle className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                <span>Out by {formatMoney(outAmount)}</span>
              </span>
            )}
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                <span>Total Assets</span>
              </span>
              <span className="fin-num font-medium text-foreground">{formatMoney(totalAssets)}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <span>Liabilities</span>
              </span>
              <span className="fin-num font-medium text-foreground">{formatMoney(totalLiabilities)}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                <span>Equity</span>
              </span>
              <span className="fin-num font-medium text-foreground">{formatMoney(totalEquity)}</span>
            </div>
          </div>

          {/* Visual Share Bar */}
          {totalAssets > 0 && (
            <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden flex">
              <div
                className="bg-amber-500 h-full"
                style={{ width: `${Math.min(100, (totalLiabilities / totalAssets) * 100)}%` }}
                title={`Liabilities: ${formatPct((totalLiabilities / totalAssets) * 100)}`}
              />
              <div
                className="bg-violet-500 h-full"
                style={{ width: `${Math.min(100, (totalEquity / totalAssets) * 100)}%` }}
                title={`Equity: ${formatPct((totalEquity / totalAssets) * 100)}`}
              />
            </div>
          )}
        </div>

        {/* Jump To Section Card */}
        <div className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-2">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide block">
            Jump to Section
          </span>
          <div className="space-y-1 text-xs">
            <button
              type="button"
              onClick={() => onJumpTo?.('section-assets')}
              className="w-full flex items-center justify-between p-1.5 rounded-md hover:bg-muted/50 transition-colors text-left group"
            >
              <span className="flex items-center gap-2 font-medium text-foreground group-hover:underline">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                <span>Assets</span>
              </span>
              <span className="fin-num font-normal text-muted-foreground">{formatMoney(totalAssets)}</span>
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
              <span className="fin-num font-normal text-muted-foreground">{formatMoney(totalLiabilities)}</span>
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
              <span className="fin-num font-normal text-muted-foreground">{formatMoney(totalEquity)}</span>
            </button>
          </div>
        </div>

        {/* Mini Ratios Card */}
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
    const { operatingIncomeTotal = 0, costOfSalesTotal = 0, operatingExpenseTotal = 0, nonOperatingExpenseTotal = 0, otherIncomeTotal = 0, netProfit = 0 } = data;
    const totalExpense = costOfSalesTotal + operatingExpenseTotal + nonOperatingExpenseTotal;
    const totalRev = operatingIncomeTotal + otherIncomeTotal;
    const netMargin = totalRev > 0 ? (netProfit / totalRev) * 100 : 0;
    const isLoss = netProfit < 0;

    return (
      <div className="space-y-3 print:hidden">
        {/* At a Glance Card */}
        <div className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              At a Glance
            </span>
            <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
              isLoss
                ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-600/20'
                : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-600/20'
            }`}>
              {isLoss ? <TrendingDown className="w-3 h-3 text-rose-600 dark:text-rose-400" /> : <TrendingUp className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />}
              <span>Margin: {formatPct(netMargin)}</span>
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Total Income</span>
              </span>
              <span className="fin-num font-medium text-foreground">{formatMoney(totalRev)}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                <span>Total Expenses</span>
              </span>
              <span className="fin-num font-medium text-foreground">{formatMoney(totalExpense)}</span>
            </div>

            <div className="pt-2 border-t border-border/60 flex items-center justify-between">
              <span className="font-semibold text-foreground">Net {isLoss ? 'Loss' : 'Profit'}</span>
              <span className={`fin-num font-semibold ${isLoss ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {formatMoney(netProfit)}
              </span>
            </div>
          </div>

          {/* Expense Mix Stacked Bar */}
          {totalExpense > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] text-muted-foreground font-medium block">Expense Breakdown</span>
              <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden flex">
                <div
                  className="bg-amber-500 h-full"
                  style={{ width: `${Math.min(100, (costOfSalesTotal / totalExpense) * 100)}%` }}
                  title={`Cost of Sales: ${formatPct((costOfSalesTotal / totalExpense) * 100)}`}
                />
                <div
                  className="bg-rose-500 h-full"
                  style={{ width: `${Math.min(100, (operatingExpenseTotal / totalExpense) * 100)}%` }}
                  title={`Operating Exp: ${formatPct((operatingExpenseTotal / totalExpense) * 100)}`}
                />
                <div
                  className="bg-slate-400 dark:bg-slate-500 h-full"
                  style={{ width: `${Math.min(100, (nonOperatingExpenseTotal / totalExpense) * 100)}%` }}
                  title={`Non-Operating Exp: ${formatPct((nonOperatingExpenseTotal / totalExpense) * 100)}`}
                />
              </div>
            </div>
          )}
        </div>

        {/* Jump To Section Card */}
        <div className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-2">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide block">
            Jump to Section
          </span>
          <div className="space-y-1 text-xs">
            <button
              type="button"
              onClick={() => onJumpTo?.('section-operating_income')}
              className="w-full flex items-center justify-between p-1.5 rounded-md hover:bg-muted/50 transition-colors text-left group"
            >
              <span className="flex items-center gap-2 font-medium text-foreground group-hover:underline">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Operating Income</span>
              </span>
              <span className="fin-num font-normal text-muted-foreground">{formatMoney(operatingIncomeTotal)}</span>
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
              <span className="fin-num font-normal text-muted-foreground">{formatMoney(costOfSalesTotal)}</span>
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
              <span className="fin-num font-normal text-muted-foreground">{formatMoney(operatingExpenseTotal)}</span>
            </button>
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
                <span className="font-medium text-foreground">{account.account_code} · {account.name}</span>
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


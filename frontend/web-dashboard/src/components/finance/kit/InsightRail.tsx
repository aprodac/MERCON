import React from 'react';
import {
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  PieChart,
  Sliders,
  DollarSign,
  Scale,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-3.5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              At a Glance
            </span>
            {isBalanced ? (
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 text-[10px] font-bold gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span>Balanced</span>
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800 text-[10px] font-bold gap-1">
                <AlertCircle className="w-3 h-3 text-rose-600" />
                <span>Out by {formatMoney(outAmount)}</span>
              </Badge>
            )}
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-medium">
                <span className="w-2 h-2 rounded-full bg-sky-500" />
                <span>Total Assets</span>
              </span>
              <span className="fin-num font-bold text-slate-900 dark:text-slate-100">{formatMoney(totalAssets)}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-medium">
                <span className="w-2 h-2 rounded-full bg-orange-500" />
                <span>Liabilities</span>
              </span>
              <span className="fin-num font-bold text-slate-900 dark:text-slate-100">{formatMoney(totalLiabilities)}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-medium">
                <span className="w-2 h-2 rounded-full bg-violet-500" />
                <span>Equity</span>
              </span>
              <span className="fin-num font-bold text-slate-900 dark:text-slate-100">{formatMoney(totalEquity)}</span>
            </div>
          </div>

          {/* Visual Share Bar */}
          {totalAssets > 0 && (
            <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
              <div
                className="bg-orange-500 h-full"
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
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-3.5 shadow-xs space-y-2">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
            Jump to Section
          </span>
          <div className="space-y-1 text-xs">
            <button
              type="button"
              onClick={() => onJumpTo?.('section-assets')}
              className="w-full flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-left group"
            >
              <span className="font-semibold text-sky-700 dark:text-sky-400 group-hover:underline">Assets</span>
              <span className="fin-num font-medium text-slate-600 dark:text-slate-400">{formatMoney(totalAssets)}</span>
            </button>
            <button
              type="button"
              onClick={() => onJumpTo?.('section-liabilities')}
              className="w-full flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-left group"
            >
              <span className="font-semibold text-orange-700 dark:text-orange-400 group-hover:underline">Liabilities</span>
              <span className="fin-num font-medium text-slate-600 dark:text-slate-400">{formatMoney(totalLiabilities)}</span>
            </button>
            <button
              type="button"
              onClick={() => onJumpTo?.('section-equity')}
              className="w-full flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-left group"
            >
              <span className="font-semibold text-violet-700 dark:text-violet-400 group-hover:underline">Equity</span>
              <span className="fin-num font-medium text-slate-600 dark:text-slate-400">{formatMoney(totalEquity)}</span>
            </button>
          </div>
        </div>

        {/* Mini Ratios Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-3.5 shadow-xs space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Key Metrics
            </span>
            {onNavigateAnalysis && (
              <button
                type="button"
                onClick={onNavigateAnalysis}
                className="text-[11px] font-bold text-[#FA634E] hover:underline flex items-center gap-0.5"
              >
                <span>Analysis</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg">
              <span className="text-[10px] text-slate-500 font-medium block">Working Cap</span>
              <span className="fin-num font-bold text-slate-900 dark:text-slate-100">{formatMoney(workingCapital)}</span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg">
              <span className="text-[10px] text-slate-500 font-medium block">Current Ratio</span>
              <span className="fin-num font-bold text-slate-900 dark:text-slate-100">{currentRatio}</span>
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
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-3.5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              At a Glance
            </span>
            <Badge variant="outline" className={`text-[10px] font-bold gap-1 ${
              isLoss
                ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300'
            }`}>
              {isLoss ? <TrendingDown className="w-3 h-3 text-rose-600" /> : <TrendingUp className="w-3 h-3 text-emerald-600" />}
              <span>Margin: {formatPct(netMargin)}</span>
            </Badge>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Total Income</span>
              </span>
              <span className="fin-num font-bold text-slate-900 dark:text-slate-100">{formatMoney(totalRev)}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-medium">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span>Total Expenses</span>
              </span>
              <span className="fin-num font-bold text-slate-900 dark:text-slate-100">{formatMoney(totalExpense)}</span>
            </div>

            <div className="pt-1 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="font-bold text-slate-900 dark:text-slate-100">Net {isLoss ? 'Loss' : 'Profit'}</span>
              <span className={`fin-num font-extrabold ${isLoss ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {formatMoney(netProfit)}
              </span>
            </div>
          </div>

          {/* Expense Mix Stacked Bar */}
          {totalExpense > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] text-slate-400 font-medium block">Expense Breakdown</span>
              <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
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
                  className="bg-slate-500 h-full"
                  style={{ width: `${Math.min(100, (nonOperatingExpenseTotal / totalExpense) * 100)}%` }}
                  title={`Non-Operating Exp: ${formatPct((nonOperatingExpenseTotal / totalExpense) * 100)}`}
                />
              </div>
            </div>
          )}
        </div>

        {/* Jump To Section Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-3.5 shadow-xs space-y-2">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
            Jump to Section
          </span>
          <div className="space-y-1 text-xs">
            <button
              type="button"
              onClick={() => onJumpTo?.('section-operating_income')}
              className="w-full flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-left group"
            >
              <span className="font-semibold text-emerald-700 dark:text-emerald-400 group-hover:underline">Operating Income</span>
              <span className="fin-num font-medium text-slate-600 dark:text-slate-400">{formatMoney(operatingIncomeTotal)}</span>
            </button>
            <button
              type="button"
              onClick={() => onJumpTo?.('section-cost_of_sales')}
              className="w-full flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-left group"
            >
              <span className="font-semibold text-amber-700 dark:text-amber-400 group-hover:underline">Cost of Sales</span>
              <span className="fin-num font-medium text-slate-600 dark:text-slate-400">{formatMoney(costOfSalesTotal)}</span>
            </button>
            <button
              type="button"
              onClick={() => onJumpTo?.('section-operating_expense')}
              className="w-full flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-left group"
            >
              <span className="font-semibold text-rose-700 dark:text-rose-400 group-hover:underline">Operating Expenses</span>
              <span className="fin-num font-medium text-slate-600 dark:text-slate-400">{formatMoney(operatingExpenseTotal)}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'general_ledger') {
    const { account, opening_balance = 0, closing_balance = 0, total_debit = 0, total_credit = 0, count = 0 } = data;

    return (
      <div className="space-y-3 print:hidden">
        {/* Account Details Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-3.5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Account Overview
            </span>
            {account && (
              <Badge variant="outline" className="bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-[10px] font-bold">
                {account.account_type}
              </Badge>
            )}
          </div>

          {account ? (
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Code & Name</span>
                <span className="font-bold text-slate-900 dark:text-slate-100">{account.account_code} · {account.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Opening Balance</span>
                <span className="fin-num font-bold text-slate-800 dark:text-slate-200">{formatMoney(opening_balance)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Period Debits</span>
                <span className="fin-num font-bold text-emerald-600 dark:text-emerald-400">{formatMoney(total_debit)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Period Credits</span>
                <span className="fin-num font-bold text-orange-600 dark:text-orange-400">{formatMoney(total_credit)}</span>
              </div>
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span className="font-bold text-slate-900 dark:text-slate-100">Closing Balance</span>
                <span className="fin-num font-extrabold text-[#3E3C3D] dark:text-slate-100">{formatMoney(closing_balance)}</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic">No account selected</p>
          )}
        </div>
      </div>
    );
  }

  return null;
}

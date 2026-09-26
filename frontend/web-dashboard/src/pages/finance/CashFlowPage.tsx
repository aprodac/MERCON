import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, TrendingUp, ArrowUpRight, ArrowDownRight, Wallet } from 'lucide-react';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

import { financeService } from '@/services/financeService';

function formatMoney(amount: number): string {
  return (amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function CashFlowPage() {
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  const { data: reportRes, isLoading, isError, refetch } = useQuery({
    queryKey: ['finance-reports', 'cash-flow', dateFrom, dateTo],
    queryFn: () =>
      financeService.getCashFlow({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      }),
  });

  const report = reportRes?.data;

  return (
    <DashboardLayout active="finance" title="Cash Flow Statement">
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#3E3C3D]">Statement of Cash Flows</h1>
            <p className="text-sm text-muted-foreground">Indirect cash flow statement (Operating, Investing, Financing)</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">From:</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-36 h-9 text-xs bg-card"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">To:</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-36 h-9 text-xs bg-card"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => refetch()}
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4 text-muted-foreground" />
            </Button>
          </div>
        </div>

        {/* Error State */}
        {isError && (
          <div className="bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-600/20 border border-rose-200 rounded-xl p-4 text-rose-800 text-sm">
            Failed to load Cash Flow statement. Please try again.
          </div>
        )}

        {/* Summary Metric Cards */}
        {report && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-card p-4 rounded-xl border border-border shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Opening Cash</p>
                <p className="text-xl font-bold font-mono text-foreground mt-1">SAR {formatMoney(report.opening_cash)}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-muted text-muted-foreground">
                <Wallet className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-card p-4 rounded-xl border border-border shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Net Change in Cash</p>
                <p className={`text-xl font-bold font-mono mt-1 ${report.net_change_in_cash >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {report.net_change_in_cash >= 0 ? '+' : ''}SAR {formatMoney(report.net_change_in_cash)}
                </p>
              </div>
              <div className={`p-2.5 rounded-lg ${report.net_change_in_cash >= 0 ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20 text-emerald-600' : 'bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-600/20 text-rose-600'}`}>
                {report.net_change_in_cash >= 0 ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
              </div>
            </div>

            <div className="bg-card p-4 rounded-xl border border-border shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Closing Cash</p>
                <p className="text-xl font-bold font-mono text-[#FA634E] mt-1">SAR {formatMoney(report.closing_cash)}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-orange-50 text-[#FA634E]">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>
          </div>
        )}

        {/* Detailed Statement Card */}
        <div className="bg-card rounded-xl border border-border shadow-xs overflow-hidden p-6 space-y-6">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          ) : report ? (
            <div className="space-y-6">
              {/* 1. Operating Activities */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider pb-2 border-b border-border">
                  Cash Flow from Operating Activities
                </h3>
                <div className="space-y-2 text-sm pl-2">
                  <div className="flex justify-between font-medium text-foreground py-1">
                    <span>Net Income (Profit / Loss)</span>
                    <span className="font-mono">{formatMoney(report.operating.net_income)}</span>
                  </div>

                  {report.operating.adjustments.map((adj) => (
                    <div key={adj.account_code} className="flex justify-between text-muted-foreground text-xs py-0.5">
                      <span>
                        <span className="font-mono text-muted-foreground mr-2">{adj.account_code}</span>
                        {adj.name}
                      </span>
                      <span className="font-mono">{formatMoney(adj.amount)}</span>
                    </div>
                  ))}

                  {report.operating.adjustments.length === 0 && (
                    <p className="text-xs text-muted-foreground italic py-0.5">No operating adjustments recorded.</p>
                  )}

                  <div className="flex justify-between font-bold text-foreground pt-2 border-t border-border">
                    <span>Net Cash Provided by Operating Activities</span>
                    <span className="font-mono text-emerald-700">{formatMoney(report.operating.total)}</span>
                  </div>
                </div>
              </div>

              {/* 2. Investing Activities */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider pb-2 border-b border-border">
                  Cash Flow from Investing Activities
                </h3>
                <div className="space-y-2 text-sm pl-2">
                  {report.investing.items.map((item) => (
                    <div key={item.account_code} className="flex justify-between text-muted-foreground text-xs py-0.5">
                      <span>
                        <span className="font-mono text-muted-foreground mr-2">{item.account_code}</span>
                        {item.name}
                      </span>
                      <span className="font-mono">{formatMoney(item.amount)}</span>
                    </div>
                  ))}

                  {report.investing.items.length === 0 && (
                    <p className="text-xs text-muted-foreground italic py-0.5">No investing activities recorded.</p>
                  )}

                  <div className="flex justify-between font-bold text-foreground pt-2 border-t border-border">
                    <span>Net Cash Used in / Provided by Investing Activities</span>
                    <span className="font-mono text-blue-700">{formatMoney(report.investing.total)}</span>
                  </div>
                </div>
              </div>

              {/* 3. Financing Activities */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider pb-2 border-b border-border">
                  Cash Flow from Financing Activities
                </h3>
                <div className="space-y-2 text-sm pl-2">
                  {report.financing.items.map((item) => (
                    <div key={item.account_code} className="flex justify-between text-muted-foreground text-xs py-0.5">
                      <span>
                        <span className="font-mono text-muted-foreground mr-2">{item.account_code}</span>
                        {item.name}
                      </span>
                      <span className="font-mono">{formatMoney(item.amount)}</span>
                    </div>
                  ))}

                  {report.financing.items.length === 0 && (
                    <p className="text-xs text-muted-foreground italic py-0.5">No financing activities recorded.</p>
                  )}

                  <div className="flex justify-between font-bold text-foreground pt-2 border-t border-border">
                    <span>Net Cash Used in / Provided by Financing Activities</span>
                    <span className="font-mono text-purple-700">{formatMoney(report.financing.total)}</span>
                  </div>
                </div>
              </div>

              {/* Final Summary Row */}
              <div className="pt-4 border-t-2 border-border space-y-2">
                <div className="flex justify-between font-extrabold text-foreground text-base">
                  <span>Net Increase / (Decrease) in Cash</span>
                  <span className={`font-mono ${report.net_change_in_cash >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {formatMoney(report.net_change_in_cash)}
                  </span>
                </div>
                <div className="flex justify-between text-sm text-muted-foreground font-medium">
                  <span>Cash & Cash Equivalents at Beginning of Period</span>
                  <span className="font-mono">{formatMoney(report.opening_cash)}</span>
                </div>
                <div className="flex justify-between font-extrabold text-[#FA634E] text-base pt-1">
                  <span>Cash & Cash Equivalents at End of Period</span>
                  <span className="font-mono">{formatMoney(report.closing_cash)}</span>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </DashboardLayout>
  );
}

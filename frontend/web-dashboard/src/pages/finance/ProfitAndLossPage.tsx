import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';

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

export default function ProfitAndLossPage() {
  const navigate = useNavigate();
  const currentYearStart = `${new Date().getFullYear()}-01-01`;
  const todayIso = new Date().toISOString().slice(0, 10);

  const [dateFrom, setDateFrom] = useState<string>(currentYearStart);
  const [dateTo, setDateTo] = useState<string>(todayIso);

  const { data: reportRes, isLoading, isError, refetch } = useQuery({
    queryKey: ['finance-reports', 'profit-and-loss', dateFrom, dateTo],
    queryFn: () =>
      financeService.getProfitAndLoss({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      }),
  });

  const report = reportRes?.data;
  const revenues = report?.revenues || [];
  const expenses = report?.expenses || [];
  const netProfit = report?.net_profit || 0;
  const isProfit = netProfit >= 0;

  return (
    <DashboardLayout active="finance" title="Profit & Loss Statement">
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-[#3E3C3D]">Profit & Loss Statement</h1>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                From:
              </label>
              <Input
                type="date"
                className="w-36 h-9 text-xs bg-white"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                To:
              </label>
              <Input
                type="date"
                className="w-36 h-9 text-xs bg-white"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => refetch()}
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4 text-slate-600" />
            </Button>
          </div>
        </div>

        {/* Summary KPI Pills */}
        {report && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Total Revenue
                </p>
                <p className="text-xl font-bold text-emerald-700 mt-1 font-mono">
                  SAR {formatMoney(report.total_revenue)}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Total Expenses
                </p>
                <p className="text-xl font-bold text-rose-700 mt-1 font-mono">
                  SAR {formatMoney(report.total_expense)}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                <TrendingDown className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Net {isProfit ? 'Profit' : 'Loss'}
                </p>
                <p
                  className={`text-xl font-bold mt-1 font-mono ${
                    isProfit ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  SAR {formatMoney(netProfit)}
                </p>
              </div>
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  isProfit ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                }`}
              >
                <DollarSign className="w-5 h-5" />
              </div>
            </div>
          </div>
        )}

        {/* Error State */}
        {isError && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-800 text-sm">
            Failed to load profit & loss statement. Please try again.
          </div>
        )}

        {/* Content Table Card */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden space-y-6 p-6">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          ) : (
            <>
              {/* Section 1: Revenue */}
              <div className="space-y-2">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h2 className="text-base font-bold text-slate-900">Revenue</h2>
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                    Subtotal: SAR {formatMoney(report?.total_revenue || 0)}
                  </span>
                </div>
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                      <th className="py-2 px-3 w-32">Account Code</th>
                      <th className="py-2 px-3">Account Name</th>
                      <th className="py-2 px-3 text-right w-40">Amount (SAR)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {revenues.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="py-4 text-center text-slate-400 text-xs italic">
                          No revenue items recorded for this period.
                        </td>
                      </tr>
                    ) : (
                      revenues.map((r) => (
                        <tr
                          key={r.account_code}
                          onClick={() => r.account_id && navigate(`/finance/general-ledger?account_id=${r.account_id}`)}
                          className="hover:bg-slate-100/70 cursor-pointer transition-colors"
                        >
                          <td className="py-2 px-3 font-mono text-xs font-semibold text-slate-700">
                            {r.account_code}
                          </td>
                          <td className="py-2 px-3 text-slate-900">{r.name}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs font-medium text-slate-900">
                            {formatMoney(r.amount)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-emerald-50/60 font-bold text-emerald-900 text-sm">
                      <td colSpan={2} className="py-2.5 px-3">
                        Total Revenue
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs">
                        SAR {formatMoney(report?.total_revenue || 0)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Section 2: Expenses */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h2 className="text-base font-bold text-slate-900">Expenses</h2>
                  <span className="text-xs font-semibold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-md border border-rose-200">
                    Subtotal: SAR {formatMoney(report?.total_expense || 0)}
                  </span>
                </div>
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                      <th className="py-2 px-3 w-32">Account Code</th>
                      <th className="py-2 px-3">Account Name</th>
                      <th className="py-2 px-3 text-right w-40">Amount (SAR)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {expenses.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="py-4 text-center text-slate-400 text-xs italic">
                          No expense items recorded for this period.
                        </td>
                      </tr>
                    ) : (
                      expenses.map((e) => (
                        <tr
                          key={e.account_code}
                          onClick={() => e.account_id && navigate(`/finance/general-ledger?account_id=${e.account_id}`)}
                          className="hover:bg-slate-100/70 cursor-pointer transition-colors"
                        >
                          <td className="py-2 px-3 font-mono text-xs font-semibold text-slate-700">
                            {e.account_code}
                          </td>
                          <td className="py-2 px-3 text-slate-900">{e.name}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs font-medium text-slate-900">
                            {formatMoney(e.amount)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-rose-50/60 font-bold text-rose-900 text-sm">
                      <td colSpan={2} className="py-2.5 px-3">
                        Total Expenses
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs">
                        SAR {formatMoney(report?.total_expense || 0)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Net Profit Summary Row */}
              <div
                className={`mt-6 p-4 rounded-xl border flex items-center justify-between font-bold text-base ${
                  isProfit
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                    : 'bg-rose-50 text-rose-900 border-rose-300'
                }`}
              >
                <span>Net {isProfit ? 'Profit' : 'Loss'}</span>
                <span className="font-mono text-lg">
                  SAR {formatMoney(netProfit)}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

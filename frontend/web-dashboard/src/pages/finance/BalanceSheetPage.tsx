import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Info, CheckCircle2 } from 'lucide-react';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Badge } from '@/components/ui/badge';
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

export default function BalanceSheetPage() {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [asOf, setAsOf] = useState<string>(todayIso);

  const { data: reportRes, isLoading, isError, refetch } = useQuery({
    queryKey: ['finance-reports', 'balance-sheet', asOf],
    queryFn: () =>
      financeService.getBalanceSheet({
        as_of: asOf || undefined,
      }),
  });

  const report = reportRes?.data;
  const assets = report?.assets || [];
  const liabilities = report?.liabilities || [];
  const equity = report?.equity || [];

  const totalAssets = report?.total_assets || 0;
  const totalLiabilities = report?.total_liabilities || 0;
  const totalEquity = report?.total_equity || 0;
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;
  const imbalanceDiff = Math.abs(totalAssets - totalLiabilitiesAndEquity);

  return (
    <DashboardLayout active="finance" title="Balance Sheet">
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-[#3E3C3D]">Balance Sheet</h1>
            {report && (
              <Badge
                variant="outline"
                className={
                  report.using_snapshot
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                    : 'bg-slate-100 text-slate-700 border-slate-200'
                }
              >
                {report.using_snapshot ? 'Using period-close snapshot' : 'Calculated live from ledger'}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              As Of Date:
            </label>
            <Input
              type="date"
              className="w-40 h-9 text-xs bg-white"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
            />
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

        {/* Informational Balance Note (Neutral blue/slate box, not red) */}
        {report && !report.is_balanced && (
          <div className="bg-blue-50/70 border border-blue-200 text-blue-900 rounded-xl p-4 flex items-start gap-3 shadow-sm">
            <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-sm space-y-1">
              <p className="font-medium text-blue-950">
                Total Assets vs. Liabilities + Equity differs by SAR {formatMoney(imbalanceDiff)} —
                expected until fiscal year-end closing entries exist; Trial Balance is the
                authoritative check.
              </p>
            </div>
          </div>
        )}

        {/* Balanced Note */}
        {report && report.is_balanced && (
          <div className="bg-emerald-50 border border-emerald-200/80 rounded-xl p-3 text-emerald-800 flex items-center gap-2.5 text-xs font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              Balance Sheet is fully balanced — Total Assets equal Total Liabilities + Equity exactly (SAR{' '}
              {formatMoney(totalAssets)}).
            </span>
          </div>
        )}

        {/* Error State */}
        {isError && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-800 text-sm">
            Failed to load balance sheet. Please try again.
          </div>
        )}

        {/* Side-by-Side Summary Banner */}
        {report && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Total Assets
                </p>
                <p className="text-xl font-bold text-slate-900 mt-1 font-mono">
                  SAR {formatMoney(totalAssets)}
                </p>
              </div>
              <Badge className="bg-blue-50 text-blue-700 border-blue-200">Assets</Badge>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Total Liabilities + Equity
                </p>
                <p className="text-xl font-bold text-slate-900 mt-1 font-mono">
                  SAR {formatMoney(totalLiabilitiesAndEquity)}
                </p>
              </div>
              <Badge className="bg-purple-50 text-purple-700 border-purple-200">
                Liabilities & Equity
              </Badge>
            </div>
          </div>
        )}

        {/* Tables Container */}
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
              {/* Section 1: Assets */}
              <div className="space-y-2">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h2 className="text-base font-bold text-slate-900">1. Assets</h2>
                  <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200">
                    Subtotal: SAR {formatMoney(totalAssets)}
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
                    {assets.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="py-4 text-center text-slate-400 text-xs italic">
                          No asset accounts recorded.
                        </td>
                      </tr>
                    ) : (
                      assets.map((a) => (
                        <tr key={a.account_code} className="hover:bg-slate-50/50">
                          <td className="py-2 px-3 font-mono text-xs font-semibold text-slate-700">
                            {a.account_code}
                          </td>
                          <td className="py-2 px-3 text-slate-900">{a.name}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs font-medium text-slate-900">
                            {formatMoney(a.amount)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-bold text-slate-900 text-sm">
                      <td colSpan={2} className="py-2.5 px-3">
                        Total Assets
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs">
                        SAR {formatMoney(totalAssets)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Section 2: Liabilities */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h2 className="text-base font-bold text-slate-900">2. Liabilities</h2>
                  <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">
                    Subtotal: SAR {formatMoney(totalLiabilities)}
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
                    {liabilities.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="py-4 text-center text-slate-400 text-xs italic">
                          No liability accounts recorded.
                        </td>
                      </tr>
                    ) : (
                      liabilities.map((l) => (
                        <tr key={l.account_code} className="hover:bg-slate-50/50">
                          <td className="py-2 px-3 font-mono text-xs font-semibold text-slate-700">
                            {l.account_code}
                          </td>
                          <td className="py-2 px-3 text-slate-900">{l.name}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs font-medium text-slate-900">
                            {formatMoney(l.amount)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-bold text-slate-900 text-sm">
                      <td colSpan={2} className="py-2.5 px-3">
                        Total Liabilities
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs">
                        SAR {formatMoney(totalLiabilities)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Section 3: Equity */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h2 className="text-base font-bold text-slate-900">3. Equity</h2>
                  <span className="text-xs font-semibold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-md border border-purple-200">
                    Subtotal: SAR {formatMoney(totalEquity)}
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
                    {equity.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="py-4 text-center text-slate-400 text-xs italic">
                          No equity accounts recorded.
                        </td>
                      </tr>
                    ) : (
                      equity.map((eq) => (
                        <tr key={eq.account_code} className="hover:bg-slate-50/50">
                          <td className="py-2 px-3 font-mono text-xs font-semibold text-slate-700">
                            {eq.account_code}
                          </td>
                          <td className="py-2 px-3 text-slate-900">{eq.name}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs font-medium text-slate-900">
                            {formatMoney(eq.amount)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-bold text-slate-900 text-sm">
                      <td colSpan={2} className="py-2.5 px-3">
                        Total Equity
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs">
                        SAR {formatMoney(totalEquity)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Total Liabilities + Equity Summary */}
              <div className="mt-6 p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between font-bold text-base text-slate-900">
                <span>Total Liabilities + Equity</span>
                <span className="font-mono text-lg">
                  SAR {formatMoney(totalLiabilitiesAndEquity)}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

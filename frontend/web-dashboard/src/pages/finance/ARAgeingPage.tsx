import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';

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

export default function ARAgeingPage() {
  const [asOfDate, setAsOfDate] = useState<string>('');

  const { data: reportRes, isLoading, isError, refetch } = useQuery({
    queryKey: ['finance-reports', 'ar-ageing', asOfDate],
    queryFn: () =>
      financeService.getARAgeing({
        as_of: asOfDate || undefined,
      }),
  });

  const report = reportRes?.data;
  const rows = report?.rows || [];
  const grandTotal =
    report?.grand_total ||
    (report?.summary
      ? {
          party_id: 'TOTAL',
          party_name: 'Grand Total',
          current: report.summary.total_current,
          days_1_30: report.summary.total_1_30,
          days_31_60: report.summary.total_31_60,
          days_61_90: report.summary.total_61_90,
          days_90_plus: report.summary.total_90_plus,
          total: report.summary.total_outstanding,
        }
      : undefined);

  return (
    <DashboardLayout active="finance" title="AR Ageing Report">
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#3E3C3D]">Accounts Receivable Ageing</h1>
            <p className="text-sm text-slate-500">Customer outstanding invoices by overdue range</p>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              As Of Date:
            </label>
            <Input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="w-40 h-9 text-xs bg-white"
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

        {/* Error State */}
        {isError && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-800 text-sm">
            Failed to load AR Ageing report. Please try again.
          </div>
        )}

        {/* Report Table Card */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200/80 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-4">Customer Name</th>
                    <th className="py-3 px-4 text-right w-32">Current</th>
                    <th className="py-3 px-4 text-right w-32">1–30 Days</th>
                    <th className="py-3 px-4 text-right w-32">31–60 Days</th>
                    <th className="py-3 px-4 text-right w-32">61–90 Days</th>
                    <th className="py-3 px-4 text-right w-32">90+ Days</th>
                    <th className="py-3 px-4 text-right w-36">Total (SAR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 text-sm">
                        No outstanding customer invoices found.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.party_name} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-2.5 px-4 font-medium text-slate-900">{row.party_name}</td>
                        <td className="py-2.5 px-4 text-right font-mono text-xs text-slate-700">
                          {row.current > 0 ? formatMoney(row.current) : '—'}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-xs text-amber-700">
                          {row.days_1_30 > 0 ? formatMoney(row.days_1_30) : '—'}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-xs text-orange-700">
                          {row.days_31_60 > 0 ? formatMoney(row.days_31_60) : '—'}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-xs text-rose-700 font-semibold">
                          {row.days_61_90 > 0 ? formatMoney(row.days_61_90) : '—'}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-xs text-red-800 font-bold">
                          {row.days_90_plus > 0 ? formatMoney(row.days_90_plus) : '—'}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-xs font-bold text-slate-900">
                          {formatMoney(row.total)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {grandTotal && rows.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-100/80 border-t-2 border-slate-300 font-bold text-slate-900 text-sm">
                      <td className="py-3 px-4">Grand Total</td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-slate-900">
                        {formatMoney(grandTotal.current)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-amber-700">
                        {formatMoney(grandTotal.days_1_30)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-orange-700">
                        {formatMoney(grandTotal.days_31_60)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-rose-700">
                        {formatMoney(grandTotal.days_61_90)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-red-800">
                        {formatMoney(grandTotal.days_90_plus)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-[#FA634E] font-extrabold">
                        {formatMoney(grandTotal.total)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

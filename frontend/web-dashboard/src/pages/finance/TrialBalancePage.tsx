import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

import { financeService } from '@/services/financeService';
import type { AccountingPeriod } from '@mercon/shared-types';

function formatMoney(amount: number): string {
  return (amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function TrialBalancePage() {
  const navigate = useNavigate();
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all');

  const { data: periodsRes } = useQuery({
    queryKey: ['accounting-periods', 'all'],
    queryFn: () => financeService.getAccountingPeriods(),
  });

  const { data: reportRes, isLoading, isError, refetch } = useQuery({
    queryKey: ['finance-reports', 'trial-balance', selectedPeriod],
    queryFn: () =>
      financeService.getTrialBalance({
        period_id: selectedPeriod === 'all' ? undefined : selectedPeriod,
      }),
  });

  const periods: AccountingPeriod[] = periodsRes?.data || [];
  const report = reportRes?.data;
  const items = report?.items || [];

  return (
    <DashboardLayout active="finance" title="Trial Balance">
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-[#3E3C3D]">Trial Balance</h1>
            {report && (
              <Badge
                variant="outline"
                className={
                  report.is_balanced
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-rose-50 text-rose-700 border-rose-200'
                }
              >
                {report.is_balanced ? 'Balanced' : 'Out of Balance'}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Accounting Period:
            </label>
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-[200px] h-9 text-sm bg-white">
                <SelectValue placeholder="All Periods" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Periods</SelectItem>
                {periods.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

        {/* Imbalance Red Warning Banner (Loud red banner if !is_balanced) */}
        {report && !report.is_balanced && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-900 flex items-start gap-3 shadow-sm">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-rose-800">
                CRITICAL: Trial Balance is Out of Balance!
              </p>
              <p className="text-rose-700">
                Total Debits (SAR {formatMoney(report.total_debit)}) do not equal Total Credits (SAR{' '}
                {formatMoney(report.total_credit)}). Discrepancy of SAR{' '}
                {formatMoney(Math.abs(report.total_debit - report.total_credit))}.
              </p>
            </div>
          </div>
        )}

        {/* Balanced Indicator */}
        {report && report.is_balanced && (
          <div className="bg-emerald-50 border border-emerald-200/80 rounded-xl p-3 text-emerald-800 flex items-center gap-2.5 text-xs font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              Trial Balance is fully balanced — Total Debits match Total Credits exactly (SAR{' '}
              {formatMoney(report.total_debit)}).
            </span>
          </div>
        )}

        {/* Error State */}
        {isError && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-800 text-sm">
            Failed to load trial balance report. Please try again.
          </div>
        )}

        {/* Plain Table Card */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-6 w-full" />
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
                    <th className="py-3 px-4 w-32">Account Code</th>
                    <th className="py-3 px-4">Account Name</th>
                    <th className="py-3 px-4 w-36">Type</th>
                    <th className="py-3 px-4 text-right w-36">Debit (SAR)</th>
                    <th className="py-3 px-4 text-right w-36">Credit (SAR)</th>
                    <th className="py-3 px-4 text-right w-36">Balance (SAR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400 text-sm">
                        No transactions recorded for the selected period.
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => (
                      <tr
                        key={item.account_code}
                        onClick={() => item.account_id && navigate(`/finance/general-ledger?account_id=${item.account_id}`)}
                        className="hover:bg-slate-100/70 cursor-pointer transition-colors"
                      >
                        <td className="py-2.5 px-4 font-mono text-xs font-semibold text-slate-700">
                          {item.account_code}
                        </td>
                        <td className="py-2.5 px-4 font-medium text-slate-900">{item.name}</td>
                        <td className="py-2.5 px-4">
                          <span className="inline-block text-xs text-slate-500 font-medium">
                            {item.account_type}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-xs text-slate-800">
                          {item.debit > 0 ? formatMoney(item.debit) : '—'}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-xs text-slate-800">
                          {item.credit > 0 ? formatMoney(item.credit) : '—'}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-xs font-semibold text-slate-900">
                          {formatMoney(item.balance)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {report && items.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-100/80 border-t-2 border-slate-300 font-bold text-slate-900 text-sm">
                      <td colSpan={3} className="py-3 px-4">
                        Total
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-slate-900">
                        {formatMoney(report.total_debit)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-slate-900">
                        {formatMoney(report.total_credit)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-slate-900">
                        —
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

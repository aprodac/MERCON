import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, ArrowLeftRight, BookOpenText, Printer } from 'lucide-react';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

import { StatementHeaderBar, InsightRail } from '@/components/finance/kit';
import { financeService } from '@/services/financeService';
import { formatMoney, formatDate } from '@/lib/finance/format';
import type { Account } from '@mercon/shared-types';

function getSourceLink(ref_id?: string | null): string {
  if (!ref_id) return '/finance/journal-entries';
  return `/finance/journal-entries?search=${encodeURIComponent(ref_id)}`;
}

const ACCOUNT_TYPE_BADGES: Record<string, string> = {
  Asset: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300',
  Liability: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300',
  Equity: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300',
  Revenue: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300',
  Expense: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300',
};

export default function GeneralLedgerPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const accountId = searchParams.get('account_id') || '';
  const [dateFrom, setDateFrom] = useState<string>(searchParams.get('date_from') || '');
  const [dateTo, setDateTo] = useState<string>(searchParams.get('date_to') || '');

  // Fetch all accounts for selector
  const { data: accountsRes } = useQuery({
    queryKey: ['accounts', 'all'],
    queryFn: () => financeService.getAccounts({ include_inactive: false }),
  });

  const accounts: Account[] = (accountsRes?.data || []).filter((a: Account) => a.is_postable);

  // Fetch general ledger report data
  const { data: reportRes, isLoading, isError, refetch } = useQuery({
    queryKey: ['finance-reports', 'general-ledger', accountId, dateFrom, dateTo],
    queryFn: () =>
      financeService.getGeneralLedger({
        account_id: accountId || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      }),
    enabled: Boolean(accountId),
  });

  const report = reportRes?.data;
  const account = report?.account;
  const lines = report?.lines || [];

  const totalDebit = lines.reduce((sum, l) => sum + (l.debit || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (l.credit || 0), 0);

  const handleAccountChange = (newAccountId: string) => {
    const params = new URLSearchParams(searchParams);
    if (newAccountId) {
      params.set('account_id', newAccountId);
    } else {
      params.delete('account_id');
    }
    setSearchParams(params);
  };

  const handleFilterApply = () => {
    const params = new URLSearchParams(searchParams);
    if (dateFrom) params.set('date_from', dateFrom);
    else params.delete('date_from');
    if (dateTo) params.set('date_to', dateTo);
    else params.delete('date_to');
    setSearchParams(params);
  };

  return (
    <DashboardLayout active="finance" title="General Ledger">
      <div className="p-4 space-y-4 max-w-[1400px] mx-auto print:p-0">
        {/* Single-Row Toolbar (No Card Wrapper) */}
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Account Selector */}
            <div className="w-64">
              <Select value={accountId} onValueChange={handleAccountChange}>
                <SelectTrigger className="h-8 text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 font-medium">
                  <SelectValue placeholder="Select Account..." />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {accounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      <span className="font-mono text-xs text-slate-500 mr-2">{acc.account_code}</span>
                      <span>{acc.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />

            {/* Date Filters */}
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-8 w-36 text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                placeholder="From Date"
              />
              <span className="text-xs text-slate-400">to</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-8 w-36 text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                placeholder="To Date"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleFilterApply}
                className="h-8 text-xs font-semibold border-slate-200 dark:border-slate-700"
              >
                Filter
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {accountId && (
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 border-slate-200 dark:border-slate-700 shrink-0"
                onClick={() => refetch()}
                title="Refresh"
              >
                <RefreshCw className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs font-semibold border-slate-200 dark:border-slate-700 gap-1.5"
              onClick={() => window.print()}
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
              <span>Print</span>
            </Button>
          </div>
        </div>

        {/* Empty State when no account selected */}
        {!accountId && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-12 text-center shadow-xs">
            <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4 text-slate-400">
              <ArrowLeftRight className="w-7 h-7 text-[#FA634E]" />
            </div>
            <h3 className="text-lg font-bold text-[#3E3C3D] dark:text-slate-100 mb-1">No Account Selected</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-6">
              Choose an account from the dropdown above to view all posted journal lines, running balances, and source activity.
            </p>
            <div className="max-w-xs mx-auto">
              <Select value={accountId} onValueChange={handleAccountChange}>
                <SelectTrigger className="h-9 text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-2xs font-medium">
                  <SelectValue placeholder="Select an Account to view..." />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {accounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      <span className="font-mono text-xs text-slate-500 mr-2">{acc.account_code}</span>
                      <span>{acc.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Account Selected View */}
        {accountId && (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4">
            {/* Left: Table Container */}
            <div className="space-y-4 min-w-0">
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-800 p-5 shadow-xs w-full print:shadow-none print:border-none print:p-0 space-y-4">
                {/* Header Bar */}
                <StatementHeaderBar
                  title="General Ledger"
                  subtitle={account ? `${account.account_code} · ${account.name}` : 'MERCON LOGISTICS CO.'}
                  periodLabel={dateFrom && dateTo ? `${formatDate(dateFrom)} – ${formatDate(dateTo)}` : 'All Dates'}
                  sourceLabel="Live ledger"
                />

                {/* Print Only Header */}
                <div className="hidden print:block text-center space-y-1 pb-4 border-b border-slate-200">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500">MERCON Logistics</p>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900">General Ledger</h1>
                  {account && (
                    <p className="text-xs font-medium text-slate-600">
                      Account: {account.account_code} · {account.name} ({account.account_type})
                    </p>
                  )}
                </div>

                {/* Error State */}
                {isError && (
                  <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 rounded-xl p-4 text-rose-800 text-xs">
                    Failed to load general ledger. Please try again.
                  </div>
                )}

                {/* General Ledger Table */}
                {isLoading ? (
                  <div className="p-4 space-y-3">
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                  </div>
                ) : (
                  <div className="overflow-x-auto text-xs">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/80 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                          <th className="py-2.5 px-3 w-28">Date</th>
                          <th className="py-2.5 px-3 w-32">Ref</th>
                          <th className="py-2.5 px-3">Memo / Description</th>
                          <th className="py-2.5 px-3 w-24">Source</th>
                          <th className="py-2.5 px-3 text-right w-36 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300">
                            Debit (SAR)
                          </th>
                          <th className="py-2.5 px-3 text-right w-36 bg-orange-50/70 dark:bg-orange-950/30 text-orange-800 dark:text-orange-300">
                            Credit (SAR)
                          </th>
                          <th className="py-2.5 px-3 text-right w-36">Running Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                        {/* Opening Balance Row */}
                        {report && (
                          <tr className="bg-slate-50 dark:bg-slate-900/60 font-semibold text-slate-700 dark:text-slate-300">
                            <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                              {dateFrom ? formatDate(dateFrom) : 'Beginning'}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-400">—</td>
                            <td className="py-2.5 px-3 italic text-slate-500" colSpan={2}>
                              Opening Balance
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-400">—</td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-400">—</td>
                            <td className="py-2.5 px-3 text-right fin-num font-bold text-slate-900 dark:text-slate-100">
                              {formatMoney(report.opening_balance)}
                            </td>
                          </tr>
                        )}

                        {lines.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-8 text-center text-slate-400 italic">
                              No posted transactions found for this account in the selected range.
                            </td>
                          </tr>
                        ) : (
                          lines.map((line, idx) => {
                            const link = getSourceLink(line.ref_id);
                            return (
                              <tr key={`${line.ref_id}-${idx}`} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors h-8">
                                <td className="py-1.5 px-3 font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                  {formatDate(line.entry_date)}
                                </td>
                                <td className="py-1.5 px-3 font-mono font-semibold">
                                  {link ? (
                                    <Link
                                      to={link}
                                      className="text-[#FA634E] hover:underline"
                                      title="View Source Context"
                                    >
                                      {line.ref_id || line.source_id || 'View'}
                                    </Link>
                                  ) : (
                                    <span className="text-slate-700 dark:text-slate-300">{line.ref_id || '—'}</span>
                                  )}
                                </td>
                                <td className="py-1.5 px-3 text-slate-800 dark:text-slate-200 max-w-xs truncate" title={line.memo || ''}>
                                  {line.memo || '—'}
                                </td>
                                <td className="py-1.5 px-3">
                                  <span className="text-[11px] text-slate-500 font-medium">
                                    {line.source_type || 'Journal'}
                                  </span>
                                </td>
                                <td className="py-1.5 px-3 text-right fin-num text-emerald-700 dark:text-emerald-400 font-medium">
                                  {line.debit > 0 ? formatMoney(line.debit) : '—'}
                                </td>
                                <td className="py-1.5 px-3 text-right fin-num text-orange-700 dark:text-orange-400 font-medium">
                                  {line.credit > 0 ? formatMoney(line.credit) : '—'}
                                </td>
                                <td className="py-1.5 px-3 text-right fin-num font-semibold text-slate-900 dark:text-slate-100">
                                  {formatMoney(line.running_balance)}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                      {report && (
                        <tfoot>
                          <tr className="bg-[#3E3C3D] text-white font-bold text-xs h-10">
                            <td colSpan={4} className="py-2.5 px-3 font-bold uppercase tracking-wider">
                              Period Totals & Closing Balance
                            </td>
                            <td className="py-2.5 px-3 text-right fin-num font-bold text-emerald-300">
                              {formatMoney(totalDebit)}
                            </td>
                            <td className="py-2.5 px-3 text-right fin-num font-bold text-orange-300">
                              {formatMoney(totalCredit)}
                            </td>
                            <td className="py-2.5 px-3 text-right fin-num font-extrabold text-white">
                              {formatMoney(report.closing_balance)}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Sticky Insight Rail */}
            <div className="xl:sticky xl:top-4 self-start space-y-4">
              <InsightRail
                mode="general_ledger"
                data={{
                  account,
                  opening_balance: report?.opening_balance || 0,
                  closing_balance: report?.closing_balance || 0,
                  total_debit: totalDebit,
                  total_credit: totalCredit,
                  count: lines.length,
                }}
              />
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

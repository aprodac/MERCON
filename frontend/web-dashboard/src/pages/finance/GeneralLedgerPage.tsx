import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, ArrowLeftRight, BookOpenText } from 'lucide-react';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

import { financeService } from '@/services/financeService';
import type { Account } from '@mercon/shared-types';

function formatMoney(amount: number): string {
  return (amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function getSourceLink(ref_id?: string | null): string {
  if (!ref_id) return '/finance/journal-entries';
  return `/finance/journal-entries?search=${encodeURIComponent(ref_id)}`;
}

const ACCOUNT_TYPE_BADGES: Record<string, string> = {
  Asset: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Liability: 'bg-amber-50 text-amber-700 border-amber-200',
  Equity: 'bg-purple-50 text-purple-700 border-purple-200',
  Revenue: 'bg-blue-50 text-blue-700 border-blue-200',
  Expense: 'bg-rose-50 text-rose-700 border-rose-200',
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
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Top Header & Account Switcher */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#3E3C3D] flex items-center justify-center shrink-0">
              <BookOpenText className="w-5 h-5 text-[#FA634E]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[#3E3C3D]">General Ledger</h1>
              {account ? (
                <p className="text-xs font-medium text-slate-500 flex items-center gap-2 mt-0.5">
                  <span className="font-mono text-slate-700 font-semibold">{account.account_code}</span>
                  <span>·</span>
                  <span>{account.name}</span>
                </p>
              ) : (
                <p className="text-xs text-slate-500">Select an account to view posted transactions</p>
              )}
            </div>
            {account && (
              <Badge
                variant="outline"
                className={`ml-2 ${ACCOUNT_TYPE_BADGES[account.account_type] || 'bg-slate-50 text-slate-700'}`}
              >
                {account.account_type}
              </Badge>
            )}
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Account Picker */}
            <div className="w-64">
              <Select value={accountId} onValueChange={handleAccountChange}>
                <SelectTrigger className="h-9 text-sm bg-white border-slate-300">
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

            {/* Date Filters */}
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-9 w-36 text-xs bg-white"
                placeholder="From Date"
              />
              <span className="text-xs text-slate-400">to</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-9 w-36 text-xs bg-white"
                placeholder="To Date"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleFilterApply}
                className="h-9 text-xs font-medium border-slate-300"
              >
                Filter
              </Button>
            </div>

            {accountId && (
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 border-slate-300 shrink-0"
                onClick={() => refetch()}
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4 text-slate-600" />
              </Button>
            )}
          </div>
        </div>

        {/* Empty State when no account selected */}
        {!accountId && (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-xs">
            <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4 text-slate-400">
              <ArrowLeftRight className="w-7 h-7 text-[#FA634E]" />
            </div>
            <h3 className="text-lg font-bold text-[#3E3C3D] mb-1">No Account Selected</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
              Choose an account from the dropdown above to view all posted journal lines, running balances, and source activity.
            </p>
            <div className="max-w-xs mx-auto">
              <Select value={accountId} onValueChange={handleAccountChange}>
                <SelectTrigger className="h-10 text-sm bg-white border-slate-300 shadow-xs">
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
          <>
            {/* Opening & Closing Balance Summary Pills */}
            {report && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Opening Balance {dateFrom ? `(before ${dateFrom})` : ''}
                    </span>
                    <p className="text-xl font-bold font-mono text-[#3E3C3D] mt-0.5">
                      SAR {formatMoney(report.opening_balance)}
                    </p>
                  </div>
                  <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">
                    Start
                  </Badge>
                </div>

                <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Closing Balance {dateTo ? `(as of ${dateTo})` : ''}
                    </span>
                    <p className="text-xl font-bold font-mono text-[#3E3C3D] mt-0.5">
                      SAR {formatMoney(report.closing_balance)}
                    </p>
                  </div>
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                    End
                  </Badge>
                </div>
              </div>
            )}

            {/* Error State */}
            {isError && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-800 text-sm">
                Failed to load general ledger. Please try again.
              </div>
            )}

            {/* General Ledger Table */}
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
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
                        <th className="py-3 px-4 w-32">Date</th>
                        <th className="py-3 px-4 w-36">Ref</th>
                        <th className="py-3 px-4">Memo / Description</th>
                        <th className="py-3 px-4 w-28">Source</th>
                        <th className="py-3 px-4 text-right w-36">Debit (SAR)</th>
                        <th className="py-3 px-4 text-right w-36">Credit (SAR)</th>
                        <th className="py-3 px-4 text-right w-36">Running Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {/* Opening Balance Row */}
                      {report && (
                        <tr className="bg-slate-50/40 text-slate-600 font-medium">
                          <td className="py-2.5 px-4 font-mono text-xs text-slate-500">
                            {dateFrom ? formatDate(dateFrom) : 'Beginning'}
                          </td>
                          <td className="py-2.5 px-4 text-xs font-mono text-slate-400">—</td>
                          <td className="py-2.5 px-4 italic text-xs text-slate-500" colSpan={2}>
                            Opening Balance
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono text-xs text-slate-400">—</td>
                          <td className="py-2.5 px-4 text-right font-mono text-xs text-slate-400">—</td>
                          <td className="py-2.5 px-4 text-right font-mono text-xs font-bold text-slate-800">
                            {formatMoney(report.opening_balance)}
                          </td>
                        </tr>
                      )}

                      {lines.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-400 text-sm">
                            No posted transactions found for this account in the selected range.
                          </td>
                        </tr>
                      ) : (
                        lines.map((line, idx) => {
                          const link = getSourceLink(line.ref_id);
                          return (
                            <tr key={`${line.ref_id}-${idx}`} className="hover:bg-slate-50/50 transition-colors">
                              <td className="py-2.5 px-4 font-mono text-xs text-slate-700 whitespace-nowrap">
                                {formatDate(line.entry_date)}
                              </td>
                              <td className="py-2.5 px-4 font-mono text-xs font-semibold">
                                {link ? (
                                  <Link
                                    to={link}
                                    className="text-[#FA634E] hover:underline hover:text-[#df4834]"
                                    title="View Source Context"
                                  >
                                    {line.ref_id || line.source_id || 'View'}
                                  </Link>
                                ) : (
                                  <span className="text-slate-700">{line.ref_id || '—'}</span>
                                )}
                              </td>
                              <td className="py-2.5 px-4 text-slate-900 max-w-xs truncate" title={line.memo || ''}>
                                {line.memo || '—'}
                              </td>
                              <td className="py-2.5 px-4">
                                <span className="inline-block text-xs text-slate-500 font-medium">
                                  {line.source_type || 'Journal'}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono text-xs text-slate-800">
                                {line.debit > 0 ? formatMoney(line.debit) : '—'}
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono text-xs text-slate-800">
                                {line.credit > 0 ? formatMoney(line.credit) : '—'}
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono text-xs font-semibold text-slate-900">
                                {formatMoney(line.running_balance)}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    {report && (
                      <tfoot>
                        <tr className="bg-slate-100/80 border-t-2 border-slate-300 font-bold text-slate-900 text-sm">
                          <td colSpan={4} className="py-3 px-4">
                            Period Totals & Closing Balance
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-xs text-slate-900">
                            {formatMoney(totalDebit)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-xs text-slate-900">
                            {formatMoney(totalCredit)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-xs font-bold text-[#3E3C3D]">
                            {formatMoney(report.closing_balance)}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

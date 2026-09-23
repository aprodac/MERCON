import { useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Landmark,
  Wallet,
  Building2,
  ArrowRightLeft,
  CheckCircle2,
  Copy,
  Pencil,
  Power,
  Calendar,
  ExternalLink,
  Search,
  Filter,
  FileText,
  Clock,
  Info,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import DataTable, { Column } from '@/components/ui/DataTable';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip as UiTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { MoneyText } from '@/components/finance/kit';
import {
  getBankTint,
  getBankInitials,
  maskAccountNumber,
  TransferSheet,
} from '@/components/finance/banking/TransferSheet';
import { formatDate, formatMoney, formatIban, renderSourceBadge } from '@/lib/finance';
import { financeService } from '@/services/financeService';
import type { BankAccount, BankTransactionRow, BankReconciliation } from '@mercon/shared-types';

export default function BankAccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'transactions' | 'reconciliations' | 'details'>('transactions');
  const [chartDays, setChartDays] = useState<number>(90);
  const [isTransferSheetOpen, setIsTransferSheetOpen] = useState(false);
  const [isDeactivateDialogOpen, setIsDeactivateDialogOpen] = useState(false);

  // Transaction Filters State
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [direction, setDirection] = useState<'all' | 'in' | 'out'>('all');
  const [reconciledFilter, setReconciledFilter] = useState<'all' | 'true' | 'false'>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Fetch Bank Account details
  const { data: bankAccountRes, isLoading: isAccountLoading } = useQuery({
    queryKey: ['bankAccount', id],
    queryFn: () => (id ? financeService.getBankAccountById(id) : null),
    enabled: Boolean(id),
  });

  const account: BankAccount | null = bankAccountRes?.data || null;

  // Fetch Transactions
  const { data: transactionsRes, isLoading: isTxLoading } = useQuery({
    queryKey: ['bankAccountTransactions', id, dateFrom, dateTo, direction, reconciledFilter, search, page],
    queryFn: () =>
      id
        ? financeService.getBankAccountTransactions(id, {
            date_from: dateFrom || undefined,
            date_to: dateTo || undefined,
            direction: direction === 'all' ? undefined : direction,
            reconciled: reconciledFilter === 'all' ? undefined : reconciledFilter === 'true',
            search: search || undefined,
            page,
            per_page: 20,
          })
        : null,
    enabled: Boolean(id) && activeTab === 'transactions',
  });

  const txData = transactionsRes?.data;
  const transactions: BankTransactionRow[] = txData?.rows || [];
  const pagination = txData?.pagination;

  // Fetch Balance History
  const { data: balanceHistoryRes } = useQuery({
    queryKey: ['bankAccountBalanceHistory', id, chartDays],
    queryFn: () => (id ? financeService.getBankAccountBalanceHistory(id, { days: chartDays }) : null),
    enabled: Boolean(id),
  });

  const balanceHistory = balanceHistoryRes?.data || [];

  // Toggle Active Mutation
  const toggleActiveMutation = useMutation({
    mutationFn: (isActive: boolean) =>
      id ? financeService.updateBankAccount(id, { isActive }) : Promise.reject('No ID'),
    onSuccess: (_, variables) => {
      toast.success(`Account ${variables ? 'activated' : 'deactivated'}`);
      queryClient.invalidateQueries({ queryKey: ['bankAccount', id] });
      queryClient.invalidateQueries({ queryKey: ['bankAccounts'] });
      setIsDeactivateDialogOpen(false);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to update account status');
    },
  });

  // Copy IBAN helper
  const handleCopyIban = () => {
    if (account?.iban) {
      navigator.clipboard.writeText(account.iban);
      toast.success('IBAN copied to clipboard');
    }
  };

  // Columns for Transactions Table
  const txColumns: Column<BankTransactionRow>[] = [
    {
      header: 'Date',
      accessor: (row) => <span className="font-medium text-slate-800 dark:text-slate-200 text-xs">{formatDate(row.date)}</span>,
    },
    {
      header: 'JE Ref',
      accessor: (row) => (
        <Link
          to={`/finance/journal-entries/${row.journal_entry.id}`}
          onClick={(e) => e.stopPropagation()}
          className="font-mono text-xs font-bold text-[#FA634E] hover:underline"
        >
          {row.journal_entry.ref_id}
        </Link>
      ),
    },
    {
      header: 'Source',
      accessor: (row) => renderSourceBadge(row.journal_entry.source_type || undefined, row.journal_entry.source_id),
    },
    {
      header: 'Description / Memo',
      accessor: (row) => (
        <span className="text-xs text-slate-700 dark:text-slate-300 truncate max-w-[240px] block">
          {row.description || row.journal_entry.memo || '—'}
        </span>
      ),
    },
    {
      header: 'Money In',
      accessor: (row) =>
        row.money_in > 0 ? (
          <span className="fin-num font-bold text-xs text-emerald-600 dark:text-emerald-400">
            +{formatMoney(row.money_in)}
          </span>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    {
      header: 'Money Out',
      accessor: (row) =>
        row.money_out > 0 ? (
          <span className="fin-num font-bold text-xs text-orange-600 dark:text-orange-400">
            −{formatMoney(row.money_out)}
          </span>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    {
      header: 'Running Balance',
      accessor: (row) => (
        <span className="fin-num font-extrabold text-xs text-slate-900 dark:text-slate-100">
          {formatMoney(row.running_balance)}
        </span>
      ),
    },
    {
      header: 'Reconciled',
      accessor: (row) =>
        row.reconciled ? (
          <TooltipProvider>
            <UiTooltip>
              <TooltipTrigger className="flex items-center text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
              </TooltipTrigger>
              <TooltipContent className="text-xs">
                <span>Reconciled statement line</span>
              </TooltipContent>
            </UiTooltip>
          </TooltipProvider>
        ) : (
          <span className="text-slate-300 dark:text-slate-700 text-xs">—</span>
        ),
    },
  ];

  if (isAccountLoading) {
    return (
      <DashboardLayout active="finance" title="Bank Account Details">
        <div className="p-6 max-w-[1400px] mx-auto space-y-4">
          <div className="h-44 bg-slate-200 dark:bg-slate-800 animate-pulse rounded-2xl" />
          <div className="h-64 bg-slate-200 dark:bg-slate-800 animate-pulse rounded-2xl" />
        </div>
      </DashboardLayout>
    );
  }

  if (!account) {
    return (
      <DashboardLayout active="finance" title="Bank Account Details">
        <div className="p-8 max-w-[1400px] mx-auto">
          <div className="bg-white dark:bg-slate-900 rounded-[20px] border border-slate-200 dark:border-slate-800 p-8 text-center space-y-4">
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-slate-100">Bank Account Not Found</h2>
            <p className="text-xs text-slate-500">The requested bank or cash account does not exist or was deleted.</p>
            <Button onClick={() => navigate('/finance/bank-accounts')} className="bg-[#FA634E] text-white text-xs font-bold">
              Return to Bank Accounts
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const tint = getBankTint(account.bank_name, account.is_cash);
  const bookBal = Number(account.book_balance ?? account.opening_balance ?? 0);
  const openingBal = Number(account.opening_balance || 0);

  return (
    <DashboardLayout active="finance" title={`${account.is_cash ? 'Cash Drawer' : account.bank_name || 'Bank Account'} Details`}>
      <div className="p-4 space-y-4 max-w-[1400px] mx-auto animate-fade-in">
        {/* ROW 1: Toolbar Navigation Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800 pb-2.5">
          {/* Segmented Category Tabs */}
          <div className="flex items-center gap-1 bg-[#F4F4F5] dark:bg-slate-900 p-1 rounded-xl">
            <button
              onClick={() => { setActiveTab('transactions'); setPage(1); }}
              className={`px-3.5 py-1.5 rounded-[9px] text-xs font-bold transition-all ${
                activeTab === 'transactions'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Transactions
            </button>
            <button
              onClick={() => setActiveTab('reconciliations')}
              className={`px-3.5 py-1.5 rounded-[9px] text-xs font-bold transition-all ${
                activeTab === 'reconciliations'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Reconciliations
            </button>
            <button
              onClick={() => setActiveTab('details')}
              className={`px-3.5 py-1.5 rounded-[9px] text-xs font-bold transition-all ${
                activeTab === 'details'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Details
            </button>
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsTransferSheetOpen(true)}
              className="h-8 text-xs font-semibold gap-1.5 border-slate-200 dark:border-slate-700 rounded-xl"
            >
              <ArrowRightLeft className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
              <span>Transfer</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/finance/reconciliation?bankAccountId=${account.id}`)}
              className="h-8 text-xs font-semibold gap-1.5 border-slate-200 dark:border-slate-700 rounded-xl"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Reconcile</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/finance/bank-accounts/${account.id}/edit`)}
              className="h-8 text-xs font-semibold gap-1.5 border-slate-200 dark:border-slate-700 rounded-xl"
            >
              <Pencil className="w-3.5 h-3.5 text-slate-500" />
              <span>Edit</span>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 w-8 p-0 border-slate-200 dark:border-slate-700 rounded-xl">
                  <Power className="w-3.5 h-3.5 text-slate-500" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => setIsDeactivateDialogOpen(true)}
                  className={account.isActive ? 'text-rose-600' : 'text-emerald-600'}
                >
                  <Power className="w-3.5 h-3.5 mr-2" />
                  <span>{account.isActive ? 'Deactivate account' : 'Activate account'}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* IDENTITY HERO (Charcoal Surface Card #3E3C3D) */}
        <div className="rounded-[20px] bg-[#3E3C3D] text-white p-6 shadow-md border border-slate-800 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Left Bank Metadata */}
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-base ${tint.bg} ${tint.text} border ${tint.border} shadow-sm shrink-0`}>
                {account.is_cash ? <Wallet className="w-6 h-6" /> : getBankInitials(account.bank_name)}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-extrabold tracking-tight text-white">
                    {account.is_cash ? 'Cash Drawer' : account.bank_name || 'Bank Account'}
                  </h1>
                  {!account.isActive && (
                    <Badge variant="outline" className="bg-slate-800 text-slate-400 border-slate-700 text-[10px] font-bold">
                      Inactive
                    </Badge>
                  )}
                  <Badge variant="outline" className="bg-white/10 text-white border-white/20 text-[10px] font-mono">
                    {account.currency || 'SAR'}
                  </Badge>
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-300 font-mono flex-wrap">
                  {!account.is_cash && account.account_number && (
                    <span>Account: <span className="font-bold text-white">{maskAccountNumber(account.account_number)}</span></span>
                  )}
                  {!account.is_cash && account.iban && (
                    <div className="flex items-center gap-1">
                      <span>IBAN: <span className="font-bold text-white">{formatIban(account.iban)}</span></span>
                      <button onClick={handleCopyIban} className="p-1 hover:text-white text-slate-400 transition-colors" title="Copy IBAN">
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  {!account.is_cash && account.swift_code && (
                    <span>SWIFT: <span className="font-bold text-white">{account.swift_code}</span></span>
                  )}
                </div>

                {account.account && (
                  <div className="pt-0.5">
                    <Link
                      to={`/finance/general-ledger?account_id=${account.accountId}`}
                      className="inline-flex items-center gap-1.5 text-xs text-[#FA634E] hover:underline font-semibold"
                    >
                      <span className="font-mono bg-white/10 px-1.5 py-0.5 rounded text-[11px]">GL {account.account.account_code}</span>
                      <span>{account.account.name} →</span>
                    </Link>
                  </div>
                )}
              </div>
            </div>

            {/* Right Book Balance Hero */}
            <div className="md:text-right space-y-1 bg-white/5 md:bg-transparent p-4 md:p-0 rounded-xl border border-white/10 md:border-none">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block">Book Balance as of Today</span>
              <div className="text-3xl font-extrabold fin-num text-white tracking-tight">
                {formatMoney(bookBal, { currency: account.currency || 'SAR' })}
              </div>
              {openingBal !== 0 && (
                <span className="text-[11px] text-amber-300 font-medium block">
                  Includes {formatMoney(openingBal)} opening balance (not in ledger)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* BALANCE CHART CARD */}
        <div className="rounded-[20px] bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Balance & Cash Flow History
              </h3>
            </div>
            <ToggleGroup
              value={[String(chartDays)]}
              onValueChange={(v) => v && v[0] && setChartDays(Number(v[0]))}
              className="bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200/70 dark:border-slate-700 h-7"
            >
              <ToggleGroupItem value="30" className="h-6 px-2 text-[11px] font-bold rounded-lg data-[state=on]:bg-white dark:data-[state=on]:bg-slate-900 shadow-2xs">
                30 Days
              </ToggleGroupItem>
              <ToggleGroupItem value="90" className="h-6 px-2 text-[11px] font-bold rounded-lg data-[state=on]:bg-white dark:data-[state=on]:bg-slate-900 shadow-2xs">
                90 Days
              </ToggleGroupItem>
              <ToggleGroupItem value="365" className="h-6 px-2 text-[11px] font-bold rounded-lg data-[state=on]:bg-white dark:data-[state=on]:bg-slate-900 shadow-2xs">
                1 Year
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="h-56 w-full pt-2">
            {balanceHistory.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">No history available</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={balanceHistory} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FA634E" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#FA634E" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.5} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(val) => formatDate(val)}
                    tick={{ fontSize: 10, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                    tick={{ fontSize: 10, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-slate-900 text-white p-3 rounded-xl text-xs space-y-1 shadow-lg border border-slate-700">
                            <p className="font-bold text-slate-300">{formatDate(label)}</p>
                            <p className="fin-num font-extrabold text-sm text-[#FA634E]">
                              Balance: {formatMoney(data.balance)}
                            </p>
                            {(data.money_in > 0 || data.money_out > 0) && (
                              <div className="flex gap-3 text-[11px] pt-1 border-t border-slate-800">
                                <span className="text-emerald-400 font-semibold">↓ +{formatMoney(data.money_in)}</span>
                                <span className="text-orange-400 font-semibold">↑ −{formatMoney(data.money_out)}</span>
                              </div>
                            )}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area type="monotone" dataKey="balance" stroke="#FA634E" strokeWidth={2.5} fillOpacity={1} fill="url(#balanceGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* MAIN CONTENT AREA BY TAB */}
        {activeTab === 'transactions' && (
          <div className="bg-white dark:bg-slate-900 rounded-[20px] border border-slate-200/80 dark:border-slate-800 p-4 shadow-xs space-y-3">
            {/* Header Toolbar Filters */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/60 dark:border-slate-700">
              <div className="flex items-center gap-2 flex-wrap flex-1">
                {/* Search */}
                <div className="relative w-full sm:w-56">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="Search ref, memo..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    className="pl-9 h-8 text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
                  />
                </div>

                {/* Date range */}
                <div className="flex items-center gap-1">
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                    className="h-8 text-xs w-32 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
                  />
                  <span className="text-xs text-slate-400">to</span>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                    className="h-8 text-xs w-32 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
                  />
                </div>

                {/* Direction Select */}
                <Select value={direction} onValueChange={(v: any) => { setDirection(v); setPage(1); }}>
                  <SelectTrigger className="w-[125px] h-8 text-xs font-semibold bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
                    <SelectValue placeholder="Direction" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Directions</SelectItem>
                    <SelectItem value="in">Money In</SelectItem>
                    <SelectItem value="out">Money Out</SelectItem>
                  </SelectContent>
                </Select>

                {/* Reconciled Select */}
                <Select value={reconciledFilter} onValueChange={(v: any) => { setReconciledFilter(v); setPage(1); }}>
                  <SelectTrigger className="w-[145px] h-8 text-xs font-semibold bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
                    <SelectValue placeholder="Reconciled" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Lines</SelectItem>
                    <SelectItem value="true">Reconciled</SelectItem>
                    <SelectItem value="false">Unreconciled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(dateFrom || dateTo || direction !== 'all' || reconciledFilter !== 'all' || search) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDateFrom('');
                    setDateTo('');
                    setDirection('all');
                    setReconciledFilter('all');
                    setSearch('');
                    setPage(1);
                  }}
                  className="h-8 text-xs text-slate-500 hover:text-slate-800"
                >
                  Clear filters
                </Button>
              )}
            </div>

            {/* Opening Balance Banner Row */}
            {txData && (
              <div className="flex items-center justify-between p-3 bg-slate-100/70 dark:bg-slate-800/40 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300">
                <span>Range Opening Balance {dateFrom ? `(as of ${formatDate(dateFrom)})` : '(account start)'}</span>
                <span className="fin-num text-sm text-slate-900 dark:text-slate-100">{formatMoney(txData.opening_balance)}</span>
              </div>
            )}

            {/* DataTable */}
            <DataTable
              data={transactions}
              columns={txColumns}
              isLoading={isTxLoading}
              emptyMessage="No bank transactions match the selected filters."
            />

            {/* Closing Balance Banner Row */}
            {txData && (
              <div className="flex items-center justify-between p-3 bg-slate-100/70 dark:bg-slate-800/40 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300">
                <span>Range Closing Balance</span>
                <span className="fin-num text-sm text-slate-900 dark:text-slate-100">{formatMoney(txData.closing_balance)}</span>
              </div>
            )}

            {/* Pagination Controls */}
            {pagination && pagination.total_pages > 1 && (
              <div className="flex items-center justify-between pt-2 text-xs text-slate-500">
                <span>
                  Showing {((page - 1) * pagination.per_page) + 1}–{Math.min(page * pagination.per_page, pagination.total)} of {pagination.total} transactions
                </span>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="h-7 w-7 p-0 border-slate-200 dark:border-slate-700"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="font-bold text-slate-800 dark:text-slate-200 px-2">
                    Page {page} of {pagination.total_pages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= pagination.total_pages}
                    onClick={() => setPage((p) => p + 1)}
                    className="h-7 w-7 p-0 border-slate-200 dark:border-slate-700"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'reconciliations' && (
          <div className="bg-white dark:bg-slate-900 rounded-[20px] border border-slate-200/80 dark:border-slate-800 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Reconciliation Statements History</h3>
                <p className="text-xs text-slate-500">Completed bank statement reconciliations for this account.</p>
              </div>
              <Button
                onClick={() => navigate(`/finance/reconciliation?bankAccountId=${account.id}`)}
                className="h-8 text-xs font-bold gap-1.5 bg-[#FA634E] text-white rounded-xl"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Start reconciliation</span>
              </Button>
            </div>

            {(!account.reconciliations || account.reconciliations.length === 0) ? (
              <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                <Clock className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">No statement reconciliations recorded yet</p>
                <p className="text-[11.5px] text-slate-500 mt-1">Reconcile this account against bank statements to audit posted entries.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {account.reconciliations.map((rec) => (
                  <div key={rec.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/60 dark:border-slate-700">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          Statement Date: {formatDate(rec.statement_date)}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Status: <span className="font-semibold text-slate-700 dark:text-slate-300">{rec.status}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="fin-num text-sm font-extrabold text-slate-900 dark:text-slate-100">
                        {formatMoney(Number(rec.statement_closing_balance))}
                      </div>
                      <span className="text-[10.5px] text-slate-400">Closing Balance</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'details' && (
          <div className="bg-white dark:bg-slate-900 rounded-[20px] border border-slate-200/80 dark:border-slate-800 p-6 shadow-xs space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Account Specifications</h3>
              <Button
                size="sm"
                onClick={() => navigate(`/finance/bank-accounts/${account.id}/edit`)}
                className="h-8 text-xs font-bold gap-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Edit Account</span>
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-xs">
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Account Type</span>
                <p className="font-bold text-slate-800 dark:text-slate-200">{account.is_cash ? 'Physical Cash Account' : 'Bank Account'}</p>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Bank Name</span>
                <p className="font-bold text-slate-800 dark:text-slate-200">{account.is_cash ? '—' : account.bank_name || '—'}</p>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Account Number</span>
                <p className="font-mono font-bold text-slate-800 dark:text-slate-200">{account.is_cash ? '—' : account.account_number || '—'}</p>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">IBAN</span>
                <p className="font-mono font-bold text-slate-800 dark:text-slate-200">{account.is_cash ? '—' : (account.iban ? formatIban(account.iban) : '—')}</p>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">SWIFT / BIC Code</span>
                <p className="font-mono font-bold text-slate-800 dark:text-slate-200">{account.is_cash ? '—' : account.swift_code || '—'}</p>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Base Currency</span>
                <p className="font-bold text-slate-800 dark:text-slate-200">{account.currency || 'SAR'}</p>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Opening Balance</span>
                <p className="fin-num font-bold text-slate-800 dark:text-slate-200">{formatMoney(openingBal)}</p>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Opening Date</span>
                <p className="font-bold text-slate-800 dark:text-slate-200">{account.opening_date ? formatDate(account.opening_date) : '—'}</p>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Linked GL Account</span>
                <p className="font-bold text-slate-800 dark:text-slate-200">
                  {account.account ? `${account.account.account_code} · ${account.account.name}` : '—'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Transfer Sheet */}
        <TransferSheet
          open={isTransferSheetOpen}
          onOpenChange={setIsTransferSheetOpen}
          initialFromBankAccountId={account.id}
        />

        {/* Deactivate/Activate Dialog */}
        <AlertDialog open={isDeactivateDialogOpen} onOpenChange={setIsDeactivateDialogOpen}>
          <AlertDialogContent className="rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-lg font-bold">
                {account.isActive ? 'Deactivate' : 'Activate'} Account?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-xs text-slate-500">
                {account.isActive
                  ? 'Deactivating this account stops new transfers or payments from being posted to it.'
                  : 'Activating this account makes it available for transfers and payments.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-9 text-xs rounded-xl">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => toggleActiveMutation.mutate(!account.isActive)}
                className={`h-9 text-xs font-bold rounded-xl text-white ${
                  account.isActive ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {account.isActive ? 'Deactivate Account' : 'Activate Account'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}

import { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Landmark,
  Wallet,
  Building2,
  ArrowRightLeft,
  LayoutGrid,
  Table as TableIcon,
  MoreHorizontal,
  Info,
  CheckCircle2,
  AlertCircle,
  Clock,
  ExternalLink,
  Pencil,
  Power,
  Download,
} from 'lucide-react';
import { toast } from 'sonner';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import DataTable, { Column } from '@/components/ui/DataTable';
import ExportModal, { ExportColumn } from '@/components/ui/ExportModal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
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
  SummaryStrip,
  MoneyText,
  FinanceEmptyState,
} from '@/components/finance/kit';
import {
  getBankTint,
  getBankInitials,
  maskAccountNumber,
  TransferSheet,
} from '@/components/finance/banking/TransferSheet';
import { formatDate, formatMoney } from '@/lib/finance';
import { financeService } from '@/services/financeService';
import type { BankAccount } from '@mercon/shared-types';

// SVG Sparkline component for card view
function BankSparkline({ data, colorHex = '#FA634E' }: { data?: Array<{ date: string; balance: number }>; colorHex?: string }) {
  if (!data || data.length < 2) {
    return <div className="h-9 w-full bg-muted rounded-lg flex items-center justify-center text-[10px] text-muted-foreground">No chart data</div>;
  }

  const balances = data.map((d) => d.balance);
  const min = Math.min(...balances);
  const max = Math.max(...balances);
  const range = max - min || 1;

  const points = data
    .map((d, idx) => {
      const x = (idx / (data.length - 1)) * 140;
      const y = 32 - ((d.balance - min) / range) * 24 - 4;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className="w-full h-9">
      <svg viewBox="0 0 140 36" className="w-full h-full overflow-visible">
        <defs>
          <linearGradient id={`grad-${colorHex.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colorHex} stopOpacity="0.25" />
            <stop offset="100%" stopColor={colorHex} stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <polyline
          fill="none"
          stroke={colorHex}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
      </svg>
    </div>
  );
}

export default function BankAccountsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [categoryFilter, setCategoryFilter] = useState<'all' | 'bank' | 'cash'>('all');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState('');

  const [isTransferSheetOpen, setIsTransferSheetOpen] = useState(false);
  const [transferInitialFromId, setTransferInitialFromId] = useState<string | undefined>(undefined);

  const [isExportOpen, setIsExportOpen] = useState(false);
  const [toggleActiveAccount, setToggleActiveAccount] = useState<BankAccount | null>(null);

  // Fetch Bank Accounts
  const { data: bankAccountsRes, isLoading } = useQuery({
    queryKey: ['bankAccounts'],
    queryFn: financeService.getBankAccounts,
  });

  const allAccounts: BankAccount[] = bankAccountsRes?.data || [];

  // Toggle active status mutation
  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      financeService.updateBankAccount(id, { isActive }),
    onSuccess: (_, variables) => {
      toast.success(`Account ${variables.isActive ? 'activated' : 'deactivated'}`);
      queryClient.invalidateQueries({ queryKey: ['bankAccounts'] });
      setToggleActiveAccount(null);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to update account status');
    },
  });

  // Category Counts
  const counts = useMemo(() => {
    const active = allAccounts.filter((a) => showInactive || a.isActive);
    return {
      all: active.length,
      bank: active.filter((a) => !a.is_cash).length,
      cash: active.filter((a) => a.is_cash).length,
    };
  }, [allAccounts, showInactive]);

  // Filtered accounts list
  const filteredAccounts = useMemo(() => {
    return allAccounts.filter((acc) => {
      if (!showInactive && !acc.isActive) return false;
      if (categoryFilter === 'bank' && acc.is_cash) return false;
      if (categoryFilter === 'cash' && !acc.is_cash) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const name = (acc.is_cash ? 'Cash Drawer' : acc.bank_name || '').toLowerCase();
        const num = (acc.account_number || '').toLowerCase();
        const iban = (acc.iban || '').toLowerCase();
        const gl = acc.account ? `${acc.account.account_code} ${acc.account.name}`.toLowerCase() : '';
        return name.includes(q) || num.includes(q) || iban.includes(q) || gl.includes(q);
      }
      return true;
    });
  }, [allAccounts, showInactive, categoryFilter, search]);

  // Metrics for SummaryStrip
  const summaryMetrics = useMemo(() => {
    const activeOnly = allAccounts.filter((a) => a.isActive);
    const totalBook = activeOnly.reduce((s, a) => s + (Number(a.book_balance ?? a.opening_balance) || 0), 0);
    const totalIn = activeOnly.reduce((s, a) => s + (Number(a.month_in) || 0), 0);
    const totalOut = activeOnly.reduce((s, a) => s + (Number(a.month_out) || 0), 0);

    const now = new Date();
    const lastMonthEndStr = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];

    const needsReconciliationCount = activeOnly.filter((a) => {
      if (!a.last_reconciled_at) return true;
      return a.last_reconciled_at < lastMonthEndStr;
    }).length;

    return {
      totalBook,
      totalIn,
      totalOut,
      needsReconciliationCount,
    };
  }, [allAccounts]);

  // Table Columns
  const columns: Column<BankAccount>[] = [
    {
      header: 'Bank / Cash Name',
      accessor: (row) => {
        const tint = getBankTint(row.bank_name, row.is_cash);
        return (
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-extrabold text-xs shrink-0 ${tint.bg} ${tint.text} border ${tint.border}`}>
              {row.is_cash ? <Wallet className="w-4 h-4" /> : getBankInitials(row.bank_name)}
            </div>
            <div>
              <Link
                to={`/finance/bank-accounts/${row.id}`}
                className="font-bold text-foreground hover:text-[#FA634E] dark:hover:text-[#FA634E] transition-colors text-xs block"
              >
                {row.is_cash ? 'Cash Drawer' : row.bank_name || 'Bank Account'}
              </Link>
              <span className="text-[11px] text-muted-foreground font-mono">{row.is_cash ? 'Cash' : maskAccountNumber(row.account_number)}</span>
            </div>
          </div>
        );
      },
    },
    {
      header: 'Linked GL Account',
      accessor: (row) =>
        row.account ? (
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[11px] font-bold text-foreground bg-muted px-2 py-0.5 rounded-md">
              {row.account.account_code}
            </span>
            <span className="text-xs text-foreground truncate max-w-[160px]">{row.account.name}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      header: 'Book Balance',
      accessor: (row) => (
        <div className="text-right">
          <MoneyText
            value={Number(row.book_balance ?? row.opening_balance)}
            currency={row.currency || 'SAR'}
            className="font-extrabold text-xs text-foreground"
          />
          {Number(row.opening_balance || 0) !== 0 && (
            <span className="block text-[10px] text-muted-foreground">incl. {formatMoney(Number(row.opening_balance))} opening</span>
          )}
        </div>
      ),
    },
    {
      header: 'This Month (In / Out)',
      accessor: (row) => (
        <div className="flex items-center gap-2 text-xs font-semibold">
          <span className="text-emerald-600 dark:text-emerald-400">↓ {formatMoney(Number(row.month_in || 0))}</span>
          <span className="text-slate-300">·</span>
          <span className="text-orange-600 dark:text-orange-400">↑ {formatMoney(Number(row.month_out || 0))}</span>
        </div>
      ),
    },
    {
      header: 'Reconciliation',
      accessor: (row) => {
        if (row.last_reconciled_at) {
          return (
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20 border-emerald-200 text-[11px] font-semibold gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              <span>Reconciled to {formatDate(row.last_reconciled_at)}</span>
            </Badge>
          );
        }
        return (
          <Badge variant="outline" className="bg-muted text-muted-foreground border-border text-[11px] font-semibold">
            Never reconciled
          </Badge>
        );
      },
    },
    {
      header: 'Status',
      accessor: (row) => (
        <Badge
          className={
            row.isActive
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20 text-emerald-700 border-emerald-200'
              : 'bg-muted text-muted-foreground border-border'
          }
        >
          {row.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      header: '',
      accessor: (row) => (
        <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => navigate(`/finance/bank-accounts/${row.id}`)}>
                <ExternalLink className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                <span>Open details</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/finance/reconciliation?bankAccountId=${row.id}`)}>
                <CheckCircle2 className="w-3.5 h-3.5 mr-2 text-emerald-500" />
                <span>Reconcile</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                setTransferInitialFromId(row.id);
                setIsTransferSheetOpen(true);
              }}>
                <ArrowRightLeft className="w-3.5 h-3.5 mr-2 text-blue-500" />
                <span>Transfer from here</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/finance/bank-accounts/${row.id}/edit`)}>
                <Pencil className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                <span>Edit account</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setToggleActiveAccount(row)}
                className={row.isActive ? 'text-rose-600' : 'text-emerald-600'}
              >
                <Power className="w-3.5 h-3.5 mr-2" />
                <span>{row.isActive ? 'Deactivate' : 'Activate'}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  // Export Columns
  const exportColumns: ExportColumn<BankAccount>[] = [
    { id: 'bank_name', label: 'Bank / Cash Name', accessor: (r) => (r.is_cash ? 'Cash Drawer' : r.bank_name || '') },
    { id: 'account_number', label: 'Account Number', accessor: (r) => r.account_number || '' },
    { id: 'iban', label: 'IBAN', accessor: (r) => r.iban || '' },
    { id: 'swift_code', label: 'SWIFT', accessor: (r) => r.swift_code || '' },
    { id: 'account', label: 'GL Account', accessor: (r) => (r.account ? `${r.account.account_code} ${r.account.name}` : '') },
    { id: 'currency', label: 'Currency', accessor: (r) => r.currency || 'SAR' },
    { id: 'opening_balance', label: 'Opening Balance', accessor: (r) => Number(r.opening_balance || 0) },
    { id: 'book_balance', label: 'Book Balance', accessor: (r) => Number(r.book_balance ?? r.opening_balance) },
    { id: 'last_reconciled_at', label: 'Last Reconciled At', accessor: (r) => r.last_reconciled_at || 'Never' },
    { id: 'isActive', label: 'Status', accessor: (r) => (r.isActive ? 'Active' : 'Inactive') },
  ];

  return (
    <DashboardLayout active="finance" title="Bank Accounts" fixedViewport>
      <div className="p-4 flex flex-col flex-1 min-h-0 gap-3 overflow-hidden h-full max-md:overflow-y-auto max-md:h-auto max-w-[1400px] mx-auto w-full animate-fade-in">
        {/* ROW 1: Toolbar Header (Segmented tabs + Compact Actions) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border dark:border-border pb-2.5">
          {/* Left: Segmented Category Tabs */}
          <div className="flex items-center gap-1.5 bg-[#F4F4F5] p-1 rounded-xl">
            <button
              onClick={() => setCategoryFilter('all')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-[9px] text-xs font-bold transition-all ${
                categoryFilter === 'all'
                  ? 'bg-card  text-foreground  shadow-xs'
                  : 'text-muted-foreground dark:text-muted-foreground hover:text-foreground dark:hover:text-slate-200'
              }`}
            >
              <Landmark className="w-3.5 h-3.5 text-[#FA634E]" />
              <span>All accounts</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${categoryFilter === 'all' ? 'bg-muted dark:bg-slate-700 text-foreground ' : 'bg-slate-200/70  text-muted-foreground dark:text-muted-foreground'}`}>
                {counts.all}
              </span>
            </button>

            <button
              onClick={() => setCategoryFilter('bank')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-[9px] text-xs font-bold transition-all ${
                categoryFilter === 'bank'
                  ? 'bg-card  text-foreground  shadow-xs'
                  : 'text-muted-foreground dark:text-muted-foreground hover:text-foreground dark:hover:text-slate-200'
              }`}
            >
              <Building2 className="w-3.5 h-3.5 text-sky-500" />
              <span>Bank</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${categoryFilter === 'bank' ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-1 ring-inset ring-sky-600/20 text-sky-800' : 'bg-slate-200/70  text-muted-foreground dark:text-muted-foreground'}`}>
                {counts.bank}
              </span>
            </button>

            <button
              onClick={() => setCategoryFilter('cash')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-[9px] text-xs font-bold transition-all ${
                categoryFilter === 'cash'
                  ? 'bg-card  text-foreground  shadow-xs'
                  : 'text-muted-foreground dark:text-muted-foreground hover:text-foreground dark:hover:text-slate-200'
              }`}
            >
              <Wallet className="w-3.5 h-3.5 text-emerald-500" />
              <span>Cash</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${categoryFilter === 'cash' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20 text-emerald-800' : 'bg-slate-200/70  text-muted-foreground dark:text-muted-foreground'}`}>
                {counts.cash}
              </span>
            </button>
          </div>

          {/* Right: Actions (View toggle, Transfer, New account, Show inactive) */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Show Inactive Toggle */}
            <div className="flex items-center gap-1.5 px-3 py-1 bg-muted border border-border dark:border-border rounded-xl h-8">
              <Switch id="show-inactive-switch" checked={showInactive} onCheckedChange={setShowInactive} className="scale-75" />
              <label htmlFor="show-inactive-switch" className="text-xs font-semibold text-muted-foreground dark:text-muted-foreground cursor-pointer select-none">
                Show inactive
              </label>
            </div>

            {/* Cards vs Table View Toggle */}
            <ToggleGroup value={[viewMode]} onValueChange={(v) => v && v[0] && setViewMode(v[0] as any)} className="bg-muted p-0.5 rounded-xl border border-border dark:border-border h-8">
              <ToggleGroupItem value="cards" aria-label="Cards view" className="h-7 w-7 p-0 rounded-lg data-[state=on]:bg-card dark:data-[state=on]:bg-slate-800 data-[state=on]:shadow-xs">
                <LayoutGrid className="w-3.5 h-3.5 text-foreground" />
              </ToggleGroupItem>
              <ToggleGroupItem value="table" aria-label="Table view" className="h-7 w-7 p-0 rounded-lg data-[state=on]:bg-card dark:data-[state=on]:bg-slate-800 data-[state=on]:shadow-xs">
                <TableIcon className="w-3.5 h-3.5 text-foreground" />
              </ToggleGroupItem>
            </ToggleGroup>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsExportOpen(true)}
              className="h-8 text-xs font-semibold gap-1.5 border-border dark:border-border rounded-xl"
            >
              <Download className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="hidden sm:inline">Export</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setTransferInitialFromId(undefined);
                setIsTransferSheetOpen(true);
              }}
              className="h-8 text-xs font-semibold gap-1.5 border-border dark:border-border rounded-xl"
            >
              <ArrowRightLeft className="w-3.5 h-3.5 text-muted-foreground dark:text-muted-foreground" />
              <span>Transfer</span>
            </Button>

            <Button
              size="sm"
              onClick={() => navigate('/finance/bank-accounts/new')}
              className="h-8 text-xs font-bold gap-1.5 bg-[#FA634E] hover:bg-[#EE553F] text-white rounded-xl shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New account</span>
            </Button>
          </div>
        </div>

        {/* ROW 2: Compact SummaryStrip */}
        <SummaryStrip
          items={[
            {
              label: 'Total cash & bank',
              value: formatMoney(summaryMetrics.totalBook, { currency: 'SAR' }),
              sub: `${counts.all} active accounts`,
            },
            {
              label: 'Money in this month',
              value: formatMoney(summaryMetrics.totalIn, { currency: 'SAR' }),
              tone: 'positive',
            },
            {
              label: 'Money out this month',
              value: formatMoney(summaryMetrics.totalOut, { currency: 'SAR' }),
              tone: 'negative',
            },
            {
              label: 'Needs reconciliation',
              value: `${summaryMetrics.needsReconciliationCount} account${summaryMetrics.needsReconciliationCount === 1 ? '' : 's'}`,
              tone: summaryMetrics.needsReconciliationCount > 0 ? 'negative' : 'default',
              sub: summaryMetrics.needsReconciliationCount > 0 ? 'Pending statement match' : 'All accounts up to date',
            },
          ]}
        />

        {/* ROW 3: Content Card(s) */}
        {filteredAccounts.length === 0 ? (
          <div className="bg-card rounded-[20px] border border-border dark:border-border p-8">
            <FinanceEmptyState
              title="Add your first bank or cash account"
              description="Track cash drawers, bank accounts, money movements, and statement reconciliations in one place."
              action={{ label: 'New account', onClick: () => navigate('/finance/bank-accounts/new') }}
            />
          </div>
        ) : viewMode === 'cards' ? (
          /* Cards Grid View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
            {filteredAccounts.map((acc) => {
              const tint = getBankTint(acc.bank_name, acc.is_cash);
              const bookBal = Number(acc.book_balance ?? acc.opening_balance ?? 0);
              const openingBal = Number(acc.opening_balance || 0);

              return (
                <div
                  key={acc.id}
                  onClick={() => navigate(`/finance/bank-accounts/${acc.id}`)}
                  className={`rounded-[20px] bg-card  border ${
                    acc.isActive
                      ? 'border-border dark:border-border hover:border-border dark:hover:border-border'
                      : 'border-border dark:border-border opacity-70 bg-muted/50 '
                  } p-5 shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between group space-y-4`}
                >
                  {/* Card Top Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm ${tint.bg} ${tint.text} border ${tint.border} shadow-xs`}>
                        {acc.is_cash ? <Wallet className="w-5 h-5" /> : getBankInitials(acc.bank_name)}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h3 className="font-extrabold text-sm text-foreground group-hover:text-[#FA634E] dark:group-hover:text-[#FA634E] transition-colors truncate max-w-[150px]">
                            {acc.is_cash ? 'Cash Drawer' : acc.bank_name || 'Bank Account'}
                          </h3>
                          {!acc.isActive && (
                            <Badge variant="outline" className="text-[9px] font-bold px-1.5 py-0 bg-muted text-muted-foreground border-border">
                              Inactive
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground dark:text-muted-foreground font-mono mt-0.5">
                          <span>{acc.is_cash ? 'Cash Account' : maskAccountNumber(acc.account_number)}</span>
                          {acc.account && (
                            <span className="bg-muted text-foreground px-1.5 py-0.2 rounded font-bold">
                              GL {acc.account.account_code}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions Menu */}
                    <div onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => navigate(`/finance/bank-accounts/${acc.id}`)}>
                            <ExternalLink className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                            <span>Open details</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigate(`/finance/reconciliation?bankAccountId=${acc.id}`)}>
                            <CheckCircle2 className="w-3.5 h-3.5 mr-2 text-emerald-500" />
                            <span>Reconcile</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            setTransferInitialFromId(acc.id);
                            setIsTransferSheetOpen(true);
                          }}>
                            <ArrowRightLeft className="w-3.5 h-3.5 mr-2 text-blue-500" />
                            <span>Transfer from here</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigate(`/finance/bank-accounts/${acc.id}/edit`)}>
                            <Pencil className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                            <span>Edit account</span>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setToggleActiveAccount(acc)}
                            className={acc.isActive ? 'text-rose-600' : 'text-emerald-600'}
                          >
                            <Power className="w-3.5 h-3.5 mr-2" />
                            <span>{acc.isActive ? 'Deactivate' : 'Activate'}</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {/* Hero Book Balance */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Book Balance</span>
                      {openingBal !== 0 && (
                        <HoverCard>
                          <HoverCardTrigger onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 font-semibold cursor-pointer">
                              <Info className="w-3 h-3" />
                              <span>Opening note</span>
                            </div>
                          </HoverCardTrigger>
                          <HoverCardContent align="end" className="w-64 p-3 text-xs space-y-1">
                            <p className="font-bold text-foreground">Opening Balance Note</p>
                            <p className="text-muted-foreground text-[11.5px]">
                              Includes <span className="font-bold font-mono">{formatMoney(openingBal)}</span> opening balance recorded outside the general ledger.
                            </p>
                          </HoverCardContent>
                        </HoverCard>
                      )}
                    </div>
                    <div className="text-2xl font-extrabold fin-num text-foreground tracking-tight">
                      {formatMoney(bookBal, { currency: acc.currency || 'SAR' })}
                    </div>
                  </div>

                  {/* 90-day Sparkline */}
                  <div className="py-1">
                    <BankSparkline data={acc.balance_series} colorHex={acc.is_cash ? '#10B981' : '#FA634E'} />
                  </div>

                  {/* In / Out Movements this month */}
                  <div className="flex items-center justify-between text-xs font-semibold pt-1 border-t border-border dark:border-border">
                    <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <span>↓ In {formatMoney(Number(acc.month_in || 0))}</span>
                    </div>
                    <div className="flex items-center gap-1 text-orange-600 dark:text-orange-400">
                      <span>↑ Out {formatMoney(Number(acc.month_out || 0))}</span>
                    </div>
                  </div>

                  {/* Reconciliation Status & Unreconciled link */}
                  <div className="flex items-center justify-between pt-2 border-t border-border dark:border-border text-xs">
                    <div>
                      {acc.last_reconciled_at ? (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20 border-emerald-200/80 text-[10.5px] font-semibold gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Reconciled to {formatDate(acc.last_reconciled_at)}</span>
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-muted text-muted-foreground border-border text-[10.5px] font-semibold">
                          Never reconciled
                        </Badge>
                      )}
                    </div>

                    <Link
                      to={`/finance/reconciliation?bankAccountId=${acc.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-[11.5px] font-bold text-muted-foreground dark:text-muted-foreground hover:text-[#FA634E] dark:hover:text-[#FA634E] transition-colors"
                    >
                      {acc.unreconciled_count || 0} unreconciled →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Table View */
          <div className="bg-card rounded-[20px] border border-border dark:border-border p-4 shadow-xs">
            <DataTable
              data={filteredAccounts}
              columns={columns}
              isLoading={isLoading}
              searchValue={search}
              searchPlaceholder="Search bank name, cash drawer, account #, IBAN, GL account..."
              onSearchChange={setSearch}
              onRowClick={(row) => navigate(`/finance/bank-accounts/${row.id}`)}
              emptyMessage="No bank or cash accounts found."
            />
          </div>
        )}

        {/* Transfer Sheet */}
        <TransferSheet
          open={isTransferSheetOpen}
          onOpenChange={setIsTransferSheetOpen}
          initialFromBankAccountId={transferInitialFromId}
        />

        {/* Export Modal */}
        <ExportModal
          isOpen={isExportOpen}
          onClose={() => setIsExportOpen(false)}
          title="Bank Accounts"
          fileNamePrefix="bank-accounts"
          filteredData={filteredAccounts}
          columns={exportColumns}
        />

        {/* Deactivate/Activate Confirmation Dialog */}
        <AlertDialog open={Boolean(toggleActiveAccount)} onOpenChange={(o) => !o && setToggleActiveAccount(null)}>
          <AlertDialogContent className="rounded-xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-lg font-bold">
                {toggleActiveAccount?.isActive ? 'Deactivate' : 'Activate'} Bank Account?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-xs text-muted-foreground">
                Are you sure you want to {toggleActiveAccount?.isActive ? 'deactivate' : 'activate'}{' '}
                <span className="font-bold text-foreground">
                  {toggleActiveAccount?.is_cash ? 'Cash Drawer' : toggleActiveAccount?.bank_name}
                </span>
                ? {toggleActiveAccount?.isActive ? 'Deactivated accounts cannot be selected for new postings.' : 'Activated accounts will be available for transfers and payments.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-9 text-xs rounded-xl">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (toggleActiveAccount) {
                    toggleActiveMutation.mutate({
                      id: toggleActiveAccount.id,
                      isActive: !toggleActiveAccount.isActive,
                    });
                  }
                }}
                className={`h-9 text-xs font-bold rounded-xl text-white ${
                  toggleActiveAccount?.isActive
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {toggleActiveAccount?.isActive ? 'Deactivate Account' : 'Activate Account'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}


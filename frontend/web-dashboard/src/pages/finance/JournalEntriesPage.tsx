import { useState, useMemo } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useQuery as useQueryHook, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  FileText,
  Trash2,
  Eye,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  PenLine,
  ReceiptText,
  BadgeDollarSign,
  CreditCard,
  Wallet,
  HandCoins,
  ArrowRightLeft,
  Building2,
  Truck,
  Lock,
  Upload,
  HelpCircle,
  AlertCircle,
  Download,
} from 'lucide-react';
import { toast } from 'sonner';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import ExportModal, { ExportColumn } from '@/components/ui/ExportModal';
import ConfirmModal from '@/components/ui/ConfirmModal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { financeService } from '@/services/financeService';
import type { JournalEntry, JournalEntryStatus, Account, AccountingPeriod } from '@mercon/shared-types';
import {
  FinancePageHeader,
  StatusTabs,
  FilterBar,
  FilterChip,
  StatusPill,
  MoneyText,
  FinanceEmptyState,
  JournalLinesTable,
} from '@/components/finance/kit';
import { formatDate, formatMoney } from '@/lib/finance';

// Source badge mapping matching filter chip color dots exactly
const SOURCE_CONFIG: Record<
  string,
  {
    icon: React.ElementType;
    label: string;
    dotClass: string;
    link?: (id?: string | null) => string;
  }
> = {
  Manual: { icon: PenLine, label: 'Manual', dotClass: 'bg-amber-500' },
  Invoice: { icon: ReceiptText, label: 'Invoice', dotClass: 'bg-sky-500', link: () => `/finance/invoices` },
  InvoicePayment: { icon: BadgeDollarSign, label: 'Invoice payment', dotClass: 'bg-emerald-500', link: () => `/finance/invoices` },
  Bill: { icon: FileText, label: 'Bill', dotClass: 'bg-purple-500', link: () => `/finance/bills` },
  BillPayment: { icon: CreditCard, label: 'Bill payment', dotClass: 'bg-indigo-500', link: () => `/finance/bills` },
  Expense: { icon: Wallet, label: 'Expense', dotClass: 'bg-rose-500', link: () => `/finance/expenses` },
  Advance: { icon: HandCoins, label: 'Advance', dotClass: 'bg-[#FA634E]', link: () => `/finance/advances` },
  AdvanceApplication: { icon: ArrowRightLeft, label: 'Advance applied', dotClass: 'bg-teal-500', link: () => `/finance/advances` },
  BankTransfer: { icon: Building2, label: 'Bank transfer', dotClass: 'bg-blue-600', link: () => `/finance/bank-accounts` },
  TripSubcontract: { icon: Truck, label: 'Trip subcontract', dotClass: 'bg-orange-500' },
  FiscalYearClosing: { icon: Lock, label: 'Year-end closing', dotClass: 'bg-slate-600' },
  IMPORT: { icon: Upload, label: 'Import', dotClass: 'bg-violet-500' },
};

function renderSourceBadge(sourceType?: string, sourceId?: string | null) {
  const config = SOURCE_CONFIG[sourceType || ''] || {
    icon: HelpCircle,
    label: sourceType || 'System',
    dotClass: 'bg-slate-400',
  };
  const Icon = config.icon;
  const link = config.link?.(sourceId);

  const badgeContent = (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/90 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/80 transition-all shrink-0 shadow-2xs">
      <span className={`w-2 h-2 rounded-full shrink-0 ${config.dotClass}`} />
      <Icon className="w-3 h-3 text-slate-500 dark:text-slate-400" />
      {config.label}
    </span>
  );

  if (link) {
    return (
      <Link to={link} onClick={(e) => e.stopPropagation()}>
        {badgeContent}
      </Link>
    );
  }

  return badgeContent;
}

// Account flow summary helper returning color-coded Dr (emerald) and Cr (amber) account strings
function getAccountFlowDetails(lines?: JournalEntry['lines']) {
  if (!lines || lines.length === 0) return { drText: '', crText: '' };

  const drLines = lines.filter((l) => Number(l.debit) > 0);
  const crLines = lines.filter((l) => Number(l.credit) > 0);

  const drText = drLines.length > 0
    ? `${drLines[0].account?.name || drLines[0].account?.account_code || 'Account'}${drLines.length > 1 ? ` +${drLines.length - 1}` : ''}`
    : '';

  const crText = crLines.length > 0
    ? `${crLines[0].account?.name || crLines[0].account?.account_code || 'Account'}${crLines.length > 1 ? ` +${crLines.length - 1}` : ''}`
    : '';

  return { drText, crText };
}

const EXPORT_COLUMNS: ExportColumn<JournalEntry>[] = [
  { id: 'ref_id', label: 'Reference ID', accessor: (e) => e.ref_id || e.id },
  { id: 'source_type', label: 'Source', accessor: (e) => e.source_type || 'Manual' },
  { id: 'entry_date', label: 'Entry Date', accessor: (e) => (e.entry_date ? new Date(e.entry_date).toLocaleDateString() : '—') },
  { id: 'period_name', label: 'Period Name', accessor: (e) => e.period?.name || '—' },
  { id: 'memo', label: 'Memo / Description', accessor: (e) => e.memo || '—' },
  { id: 'status', label: 'Status', accessor: (e) => e.status },
  {
    id: 'total_debit',
    label: 'Total Debit',
    accessor: (e) => (e.lines || []).reduce((sum, l) => sum + (Number(l.debit) || 0), 0),
  },
  {
    id: 'total_credit',
    label: 'Total Credit',
    accessor: (e) => (e.lines || []).reduce((sum, l) => sum + (Number(l.credit) || 0), 0),
  },
];

export default function JournalEntriesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL State
  const activeTab = (searchParams.get('status') as JournalEntryStatus | 'all') || 'all';
  const selectedPeriod = searchParams.get('period_id') || 'all';
  const selectedSource = searchParams.get('source_type') || 'all';
  const selectedAccount = searchParams.get('account_id') || 'all';

  // Default Date Logic (Current Month-to-Date: 1st of current month to today)
  const defaultDates = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return {
      from: `${year}-${month}-01`,
      to: `${year}-${month}-${day}`,
    };
  }, []);

  const dateFrom = searchParams.get('date_from') ?? defaultDates.from;
  const dateTo = searchParams.get('date_to') ?? defaultDates.to;
  const search = searchParams.get('search') || '';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const perPage = 25;

  // Local State
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set());
  const [isExportOpen, setIsExportOpen] = useState(false);

  // Modals state
  const [postTarget, setPostTarget] = useState<JournalEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<JournalEntry | null>(null);
  const [voidTarget, setVoidTarget] = useState<JournalEntry | null>(null);
  const [voidReason, setVoidReason] = useState('');

  // Helper to update search params cleanly
  const updateParams = (updates: Record<string, string | null>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      Object.entries(updates).forEach(([key, val]) => {
        if (val === null || val === '' || val === 'all') {
          next.delete(key);
        } else {
          next.set(key, val);
        }
      });
      return next;
    });
  };

  // Queries
  const { data: entriesRes, isLoading } = useQueryHook({
    queryKey: ['journal-entries', activeTab, selectedPeriod, selectedSource, selectedAccount, dateFrom, dateTo, search, page],
    queryFn: () =>
      financeService.getJournalEntries({
        status: activeTab === 'all' ? undefined : activeTab,
        period_id: selectedPeriod === 'all' ? undefined : selectedPeriod,
        source_type: selectedSource === 'all' ? undefined : selectedSource,
        account_id: selectedAccount === 'all' ? undefined : selectedAccount,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        search: search || undefined,
        page,
        per_page: perPage,
      }),
  });

  // Cheap count queries for StatusTabs (staleTime 30s)
  const { data: countAll } = useQueryHook({
    queryKey: ['je-count', 'all'],
    queryFn: () => financeService.getJournalEntries({ per_page: 1 }),
    staleTime: 30000,
  });

  const { data: countDraft } = useQueryHook({
    queryKey: ['je-count', 'Draft'],
    queryFn: () => financeService.getJournalEntries({ status: 'Draft', per_page: 1 }),
    staleTime: 30000,
  });

  const { data: countPosted } = useQueryHook({
    queryKey: ['je-count', 'Posted'],
    queryFn: () => financeService.getJournalEntries({ status: 'Posted', per_page: 1 }),
    staleTime: 30000,
  });

  const { data: countVoided } = useQueryHook({
    queryKey: ['je-count', 'Voided'],
    queryFn: () => financeService.getJournalEntries({ status: 'Voided', per_page: 1 }),
    staleTime: 30000,
  });

  // Periods & Accounts metadata queries for filter dropdowns
  const { data: periodsRes } = useQueryHook({
    queryKey: ['accounting-periods', 'all'],
    queryFn: () => financeService.getAccountingPeriods(),
  });

  const { data: accountsRes } = useQueryHook({
    queryKey: ['accounts', 'all'],
    queryFn: () => financeService.getAccounts(),
  });

  const entries: JournalEntry[] = entriesRes?.data || [];
  const pagination = entriesRes?.pagination || { page: 1, per_page: perPage, total: 0, total_pages: 1 };
  const draftCount = countDraft?.pagination?.total || 0;

  const periods: AccountingPeriod[] = periodsRes?.data || [];
  const accounts: Account[] = accountsRes?.data || [];

  // Group entries by date for Daybook view
  const groupedEntries = useMemo(() => {
    const groups: { dateKey: string; dateObj: Date; totalDebit: number; items: JournalEntry[] }[] = [];
    const map = new Map<string, { dateKey: string; dateObj: Date; totalDebit: number; items: JournalEntry[] }>();

    entries.forEach((entry) => {
      const dateObj = new Date(entry.entry_date);
      const dateKey = formatDate(dateObj, 'MMM d, yyyy'); // e.g. Tue, Sep 23, 2026
      const entryDebit = (entry.lines || []).reduce((s, l) => s + (Number(l.debit) || 0), 0);

      if (!map.has(dateKey)) {
        const newGroup = { dateKey, dateObj, totalDebit: 0, items: [] };
        map.set(dateKey, newGroup);
        groups.push(newGroup);
      }
      const g = map.get(dateKey)!;
      g.items.push(entry);
      g.totalDebit += entryDebit;
    });

    return groups;
  }, [entries]);

  // Status Tab Counts
  const tabCounts = {
    all: countAll?.pagination?.total || 0,
    Draft: draftCount,
    Posted: countPosted?.pagination?.total || 0,
    Voided: countVoided?.pagination?.total || 0,
  };

  // Mutations
  const postMutation = useMutation({
    mutationFn: financeService.postJournalEntry,
    onSuccess: (data) => {
      toast.success(`Journal entry ${data.ref_id || ''} posted successfully`);
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      queryClient.invalidateQueries({ queryKey: ['je-count'] });
      setPostTarget(null);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Failed to post entry');
    },
  });

  const voidMutation = useMutation({
    mutationFn: ({ id, memo }: { id: string; memo?: string }) => financeService.voidJournalEntry(id, memo),
    onSuccess: () => {
      toast.success('Journal entry voided and reversal posted');
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      queryClient.invalidateQueries({ queryKey: ['je-count'] });
      setVoidTarget(null);
      setVoidReason('');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Failed to void entry');
    },
  });

  const deleteDraftMutation = useMutation({
    mutationFn: financeService.deleteDraftJournalEntry,
    onSuccess: () => {
      toast.success('Draft entry deleted');
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      queryClient.invalidateQueries({ queryKey: ['je-count'] });
      setDeleteTarget(null);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || 'Failed to delete draft');
    },
  });

  const toggleExpandRow = (id: string) => {
    setExpandedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hasActiveFilters =
    selectedPeriod !== 'all' ||
    selectedSource !== 'all' ||
    selectedAccount !== 'all' ||
    Boolean(dateFrom) ||
    Boolean(dateTo) ||
    Boolean(search);

  const clearFilters = () => {
    updateParams({
      period_id: null,
      source_type: null,
      account_id: null,
      date_from: null,
      date_to: null,
      search: null,
      page: '1',
    });
  };

  return (
    <DashboardLayout active="finance" title="Journal Entries">
      <div className="p-6 space-y-4 max-w-7xl mx-auto">
        {/* Top Control Bar: Status Tabs on Left, Actions on Right */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl px-4 py-1.5 shadow-xs">
          <StatusTabs
            value={activeTab}
            onChange={(tab) => updateParams({ status: tab === 'all' ? null : tab, page: '1' })}
            tabs={[
              { key: 'all', label: 'All', count: tabCounts.all },
              { key: 'Draft', label: 'Draft', count: tabCounts.Draft },
              { key: 'Posted', label: 'Posted', count: tabCounts.Posted },
              { key: 'Voided', label: 'Voided', count: tabCounts.Voided },
            ]}
          />

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto py-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsExportOpen(true)}
              className="h-9 text-xs font-semibold rounded-xl"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Export
            </Button>
            <Button
              onClick={() => navigate('/finance/journal-entries/new')}
              className="bg-[#FA634E] hover:bg-[#e0523d] text-white h-9 text-xs font-semibold px-3.5 rounded-xl shadow-xs"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              New entry
            </Button>
          </div>
        </div>

        {/* Drafts notice info bar */}
        {draftCount > 0 && activeTab !== 'Draft' && (
          <div className="bg-[var(--fin-brand-tint)] border border-[#FA634E]/20 text-[#3E3C3D] px-4 py-2.5 rounded-xl flex items-center justify-between text-xs font-medium shadow-xs">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-[#FA634E] shrink-0" />
              <span>
                <strong>{draftCount}</strong> draft {draftCount === 1 ? 'entry' : 'entries'} waiting to post
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateParams({ status: 'Draft', page: '1' })}
              className="h-7 text-xs bg-white text-[#FA634E] border-[#FA634E]/30 hover:bg-rose-50 hover:text-[#FA634E] font-semibold"
            >
              Review drafts
            </Button>
          </div>
        )}

        {/* FilterBar */}
        <FilterBar
          searchValue={search}
          onSearchChange={(val) => updateParams({ search: val || null, page: '1' })}
          searchPlaceholder="Search reference, memo, description..."
          onClearFilters={clearFilters}
          hasActiveFilters={hasActiveFilters}
        >
          {/* Period Filter */}
          <FilterChip
            label="Period"
            value={selectedPeriod}
            dotClass="bg-sky-500"
            onChange={(val) => updateParams({ period_id: val === 'all' ? null : val, page: '1' })}
            options={[
              { value: 'all', label: 'All Periods', dotClass: 'bg-slate-400' },
              ...periods.map((p) => ({
                value: p.id,
                label: `${p.name} (${p.status})`,
                dotClass: p.status === 'Open' ? 'bg-emerald-500' : 'bg-slate-400',
              })),
            ]}
          />

          {/* Source Filter */}
          <FilterChip
            label="Source"
            value={selectedSource}
            dotClass="bg-indigo-500"
            onChange={(val) => updateParams({ source_type: val === 'all' ? null : val, page: '1' })}
            options={[
              { value: 'all', label: 'All Sources', dotClass: 'bg-slate-400' },
              { value: 'Manual', label: 'Manual', dotClass: 'bg-amber-500' },
              { value: 'Invoice', label: 'Invoice', dotClass: 'bg-sky-500' },
              { value: 'InvoicePayment', label: 'Invoice Payment', dotClass: 'bg-emerald-500' },
              { value: 'Bill', label: 'Bill', dotClass: 'bg-purple-500' },
              { value: 'BillPayment', label: 'Bill Payment', dotClass: 'bg-indigo-500' },
              { value: 'Expense', label: 'Expense', dotClass: 'bg-rose-500' },
              { value: 'Advance', label: 'Advance', dotClass: 'bg-[#FA634E]' },
              { value: 'AdvanceApplication', label: 'Advance Application', dotClass: 'bg-teal-500' },
              { value: 'BankTransfer', label: 'Bank Transfer', dotClass: 'bg-blue-600' },
              { value: 'TripSubcontract', label: 'Trip Subcontract', dotClass: 'bg-orange-500' },
              { value: 'FiscalYearClosing', label: 'Fiscal Year Closing', dotClass: 'bg-slate-600' },
              { value: 'IMPORT', label: 'Import', dotClass: 'bg-violet-500' },
            ]}
          />

          {/* Account Filter */}
          <FilterChip
            label="Account"
            value={selectedAccount}
            dotClass="bg-emerald-500"
            onChange={(val) => updateParams({ account_id: val === 'all' ? null : val, page: '1' })}
            options={[
              { value: 'all', label: 'All Accounts', dotClass: 'bg-slate-400' },
              ...accounts.map((a) => ({
                value: a.id,
                label: `${a.account_code} - ${a.name}`,
                dotClass: 'bg-emerald-500',
              })),
            ]}
          />

          {/* Date Range Filters */}
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => updateParams({ date_from: e.target.value || null, page: '1' })}
              className="h-8 text-xs px-2 rounded-lg border border-slate-200 bg-white text-slate-700"
            />
            <span className="text-slate-400 text-xs">–</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => updateParams({ date_to: e.target.value || null, page: '1' })}
              className="h-8 text-xs px-2 rounded-lg border border-slate-200 bg-white text-slate-700"
            />
          </div>
        </FilterBar>

        {/* Daybook List View */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          {isLoading ? (
            <div className="p-8 space-y-4">
              <div className="h-6 w-48 bg-slate-100 rounded-lg animate-pulse" />
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <div key={n} className="h-14 bg-slate-50 rounded-xl animate-pulse" />
                ))}
              </div>
            </div>
          ) : entries.length === 0 ? (
            <FinanceEmptyState
              icon={<FileText className="w-6 h-6" />}
              title={hasActiveFilters ? 'Nothing matches these filters' : 'No journal entries yet'}
              description={
                hasActiveFilters
                  ? 'Try clearing some filters or changing your search terms.'
                  : 'Get started by creating your first manual journal entry.'
              }
              action={
                hasActiveFilters ? (
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => navigate('/finance/journal-entries/new')}
                    className="bg-[#FA634E] text-white hover:bg-[#e0523d]"
                  >
                    New entry
                  </Button>
                )
              }
            />
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-2xs overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
              {groupedEntries.map((group: any) => (
                <div key={group.dateKey} className="group-container">
                  {/* Swiss Modern Sticky Date Header */}
                  <div className="sticky top-0 z-10 bg-[#F9FAFB]/95 backdrop-blur-xs dark:bg-slate-900/95 px-4 py-2 border-y border-slate-200/60 dark:border-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-900 dark:text-white font-bold tracking-tight">{group.dateKey}</span>
                      <span className="text-slate-300 dark:text-slate-700">·</span>
                      <span className="text-slate-400 font-medium text-[11px]">
                        {group.items.length} {group.items.length === 1 ? 'entry' : 'entries'}
                      </span>
                    </div>
                    <div className="text-right flex items-center gap-1.5">
                      <span className="text-slate-400 font-mono text-[11px]">Dr</span>
                      <span className="font-mono text-slate-900 dark:text-white font-bold">
                        {formatMoney(group.totalDebit, { currency: 'SAR' })}
                      </span>
                    </div>
                  </div>

                  {/* Entry Rows */}
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {group.items.map((entry: JournalEntry) => {
                      const isExpanded = expandedRowIds.has(entry.id);
                      const totalDebit = (entry.lines || []).reduce((sum: number, l: any) => sum + (Number(l.debit) || 0), 0);
                      const { drText, crText } = getAccountFlowDetails(entry.lines);
                      const isVoided = entry.status === 'Voided';
                      const isReversal = Boolean(entry.reversalOfId || entry.reversalOf);

                      return (
                        <div key={entry.id} className="transition-colors">
                          <div
                            onClick={() => toggleExpandRow(entry.id)}
                            className="h-14 px-4 flex items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 cursor-pointer text-xs group"
                          >
                            {/* Chevron + Ref ID + Source badge */}
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <button
                                type="button"
                                aria-expanded={isExpanded}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleExpandRow(entry.id);
                                }}
                                className="p-1 rounded text-slate-400 hover:text-slate-600 focus:outline-none"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-slate-700 dark:text-slate-200" />
                                ) : (
                                  <ChevronRight className="w-4 h-4" />
                                )}
                              </button>

                              {/* Monospace Ref Badge */}
                              <span className="font-mono font-bold text-xs tracking-tight text-slate-900 dark:text-slate-100 shrink-0">
                                {entry.ref_id || `JE-${entry.id.slice(0, 6)}`}
                              </span>

                              {renderSourceBadge(entry.source_type, entry.source_id)}

                              {isReversal && (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border border-purple-200/80 dark:border-purple-800">
                                  Reversal
                                </span>
                              )}

                              {/* Memo + Account flow */}
                              <div className="min-w-0 flex-1 pl-1">
                                <div className={`truncate font-semibold text-slate-900 dark:text-slate-100 ${isVoided ? 'line-through text-slate-400' : ''}`}>
                                  {entry.memo || '—'}
                                </div>
                                {(drText || crText) && (
                                  <div className="truncate text-[11px] font-medium flex items-center gap-2 mt-0.5">
                                    {drText && (
                                      <span className="truncate text-emerald-700 dark:text-emerald-400 font-mono">
                                        <span className="font-bold text-emerald-800 dark:text-emerald-300 mr-1">Dr:</span>
                                        {drText}
                                      </span>
                                    )}
                                    {drText && crText && <span className="text-slate-300 dark:text-slate-700 font-mono">/</span>}
                                    {crText && (
                                      <span className="truncate text-amber-700 dark:text-amber-400 font-mono">
                                        <span className="font-bold text-amber-800 dark:text-amber-300 mr-1">Cr:</span>
                                        {crText}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Total Debit + StatusPill + Hover Menu */}
                            <div className="flex items-center gap-4 shrink-0">
                              <div className="text-right">
                                <MoneyText
                                  value={totalDebit}
                                  currency="SAR"
                                  className={`text-xs font-semibold ${isVoided ? 'line-through text-slate-400' : ''}`}
                                />
                              </div>

                              <StatusPill kind="journal" status={entry.status} />

                              {/* Hover-reveal menu */}
                              <div onClick={(e) => e.stopPropagation()}>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-700 transition-opacity"
                                    >
                                      <MoreHorizontal className="w-4 h-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-36 text-xs">
                                    <DropdownMenuItem onClick={() => navigate(`/finance/journal-entries/${entry.id}`)}>
                                      <Eye className="w-3.5 h-3.5 mr-2 text-slate-500" />
                                      Open
                                    </DropdownMenuItem>
                                    {entry.status === 'Draft' && (
                                      <>
                                        <DropdownMenuItem onClick={() => navigate(`/finance/journal-entries/${entry.id}/edit`)}>
                                          <PenLine className="w-3.5 h-3.5 mr-2 text-slate-500" />
                                          Edit
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={() => setPostTarget(entry)}
                                          className="text-emerald-700 font-medium"
                                        >
                                          <FileText className="w-3.5 h-3.5 mr-2" />
                                          Post
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={() => setDeleteTarget(entry)}
                                          className="text-rose-600"
                                        >
                                          <Trash2 className="w-3.5 h-3.5 mr-2" />
                                          Delete
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                    {entry.status === 'Posted' && (
                                      <DropdownMenuItem onClick={() => setVoidTarget(entry)} className="text-rose-600">
                                        <Trash2 className="w-3.5 h-3.5 mr-2" />
                                        Void
                                      </DropdownMenuItem>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </div>
                          </div>

                          {/* Inline Expansion details */}
                          {isExpanded && (
                            <div className="bg-slate-50/70 p-4 border-b border-slate-200/80 space-y-3 pl-11">
                              <JournalLinesTable lines={entry.lines} />

                              <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 pt-1 gap-2">
                                <div className="flex items-center gap-3">
                                  <span>
                                    Period: <strong className="text-slate-700">{entry.period?.name || '—'}</strong>
                                  </span>
                                  <span>·</span>
                                  <span>
                                    {entry.posted_at ? `Posted on ${formatDate(entry.posted_at)}` : 'Draft entry'}
                                  </span>
                                  {entry.reversalOf && (
                                    <>
                                      <span>·</span>
                                      <Link
                                        to={`/finance/journal-entries/${entry.reversalOf.id}`}
                                        className="text-[#FA634E] hover:underline font-medium"
                                      >
                                        Reversal of {entry.reversalOf.ref_id || 'JE'}
                                      </Link>
                                    </>
                                  )}
                                  {entry.reversedBy && (
                                    <>
                                      <span>·</span>
                                      <Link
                                        to={`/finance/journal-entries/${entry.reversedBy.id}`}
                                        className="text-purple-600 hover:underline font-medium"
                                      >
                                        Reversed by {entry.reversedBy.ref_id || 'JE'}
                                      </Link>
                                    </>
                                  )}
                                </div>

                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => navigate(`/finance/journal-entries/${entry.id}`)}
                                    className="h-7 text-xs bg-white"
                                  >
                                    Open record
                                  </Button>
                                  {entry.status === 'Draft' && (
                                    <>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => navigate(`/finance/journal-entries/${entry.id}/edit`)}
                                        className="h-7 text-xs bg-white"
                                      >
                                        Edit
                                      </Button>
                                      <Button
                                        size="sm"
                                        onClick={() => setPostTarget(entry)}
                                        className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                                      >
                                        Post
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Footer Pagination */}
          {pagination.total > 0 && (
            <div className="px-4 py-3 border-t border-slate-200 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500">
              <div>
                Showing {(pagination.page - 1) * pagination.per_page + 1}–
                {Math.min(pagination.page * pagination.per_page, pagination.total)} of {pagination.total} entries
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page <= 1}
                  onClick={() => updateParams({ page: String(pagination.page - 1) })}
                  className="h-7 text-xs px-2.5"
                >
                  Previous
                </Button>
                <span className="px-2 font-mono text-slate-700 font-semibold">
                  {pagination.page} / {pagination.total_pages || 1}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page >= pagination.total_pages}
                  onClick={() => updateParams({ page: String(pagination.page + 1) })}
                  className="h-7 text-xs px-2.5"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Export Modal */}
        <ExportModal
          isOpen={isExportOpen}
          onClose={() => setIsExportOpen(false)}
          title="Export Journal Entries"
          description="Choose your export preferences and columns."
          fileNamePrefix="journal_entries"
          sheetName="Journal Entries"
          subtitle="MERCON Logistics General Ledger Daybook"
          filteredData={entries}
          columns={EXPORT_COLUMNS}
          formats={['xlsx', 'csv']}
          totalCount={pagination.total}
        />

        {/* Post Confirmation Modal */}
        {postTarget && (
          <ConfirmModal
            isOpen={!!postTarget}
            onClose={() => setPostTarget(null)}
            onConfirm={() => postMutation.mutate(postTarget.id)}
            isLoading={postMutation.isPending}
            title={`Post Journal Entry ${postTarget.ref_id || ''}?`}
            description="This posts to the general ledger and cannot be edited afterwards. Verify the double-entry lines before posting."
            confirmLabel="Post to General Ledger"
            variant="default"
          >
            <div className="my-3">
              <JournalLinesTable lines={postTarget.lines} />
            </div>
          </ConfirmModal>
        )}

        {/* Delete Draft Modal */}
        {deleteTarget && (
          <ConfirmModal
            isOpen={!!deleteTarget}
            onClose={() => setDeleteTarget(null)}
            onConfirm={() => deleteDraftMutation.mutate(deleteTarget.id)}
            isLoading={deleteDraftMutation.isPending}
            title={`Delete Draft Entry ${deleteTarget.ref_id || ''}?`}
            description="Are you sure you want to permanently delete this draft journal entry? This action cannot be undone."
            confirmLabel="Delete Draft"
            variant="destructive"
          />
        )}

        {/* Void Modal */}
        {voidTarget && (
          <ConfirmModal
            isOpen={!!voidTarget}
            onClose={() => {
              setVoidTarget(null);
              setVoidReason('');
            }}
            onConfirm={() => voidMutation.mutate({ id: voidTarget.id, memo: voidReason })}
            isLoading={voidMutation.isPending}
            title={`Void Journal Entry ${voidTarget.ref_id || ''}?`}
            description="Voiding will create an automated reversing journal entry with swapped debit and credit lines posted to an open period."
            confirmLabel="Void & Post Reversal"
            variant="destructive"
          >
            <div className="my-3 space-y-2">
              <label className="text-xs font-semibold text-slate-700 block">Reason for voiding (optional):</label>
              <textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="e.g. Duplicated invoice entry / incorrect posting date"
                rows={2}
                className="w-full text-xs p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-rose-500"
              />
            </div>
          </ConfirmModal>
        )}
      </div>
    </DashboardLayout>
  );
}

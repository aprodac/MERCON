import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutList,
  BookOpenText,
  CalendarRange,
  Download,
  Printer,
  SlidersHorizontal,
  ChevronRight,
  ChevronDown,
  Search,
  ChevronLeft,
  Building2,
  ExternalLink,
  ChevronsUpDown,
  Check,
} from 'lucide-react';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import ExportModal, { type ExportColumn } from '@/components/ui/ExportModal';

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from 'recharts';

import {
  financeService,
} from '@/services/financeService';
import type { Account, JournalEntry } from '@mercon/shared-types';
import { formatMoney, formatDate } from '@/lib/finance/format';
import { resolvePeriodPreset, type PeriodPreset } from '@/lib/finance/pnlPeriodHelpers';
import { renderSourceBadge } from '@/lib/finance/sourceConfig';
import { JournalLinesTable, StatusPill } from '@/components/finance/kit';
import { PeriodControl } from '@/components/finance/kit/PeriodControl';
import { ReportViewState } from '@/components/finance/kit/ReportViewState';
import { AccountLedgerSheet, type LedgerAccount } from '@/components/finance/ledger/AccountLedgerSheet';
import { LedgerSummaryHeadline } from '@/components/finance/ledger/LedgerSummaryHeadline';
import { LedgerSummaryTable, type LedgerSummaryFormat } from '@/components/finance/ledger/LedgerSummaryTable';
import { settingsService } from '@/services/settingsService';
import {
  GL_TYPE_META,
  buildGlSummary,
  isGlType,
  parentKeys,
  typeTotals,
  type GlAccountRow,
  type GlParentGroup,
  type GlSort,
} from '@/lib/finance/glSummary';

const CUSTOMIZE_STORAGE_KEY = 'mercon_gl_customize_v1';

interface CustomizeSettings {
  showNarration: boolean;
  showVoucherType: boolean;
  hideVoidedPairs: boolean;
  groupBy: 'none' | 'day' | 'month';
  showAccountCodes: boolean;
  negativeFormat: 'minus' | 'parentheses';
  balanceStyle: 'dr_cr' | 'signed';
  showZeroBalance: boolean;
}

const DEFAULT_CUSTOMIZE: CustomizeSettings = {
  showNarration: true,
  showVoucherType: true,
  hideVoidedPairs: false,
  groupBy: 'none',
  showAccountCodes: true,
  negativeFormat: 'minus',
  balanceStyle: 'dr_cr',
  showZeroBalance: false,
};

function loadCustomizeSettings(): CustomizeSettings {
  try {
    const raw = localStorage.getItem(CUSTOMIZE_STORAGE_KEY);
    if (raw) return { ...DEFAULT_CUSTOMIZE, ...JSON.parse(raw) };
  } catch {
    // fallback
  }
  return DEFAULT_CUSTOMIZE;
}

function saveCustomizeSettings(settings: CustomizeSettings) {
  try {
    localStorage.setItem(CUSTOMIZE_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

export default function GeneralLedgerPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL state
  const accountId = searchParams.get('account_id') || '';
  const viewParam = (searchParams.get('view') as 'summary' | 'account' | 'monthly') || (accountId ? 'account' : 'summary');
  // A link that carries dates but no preset (e.g. "Open full ledger" from a statement) is a custom range
  const periodPreset = (searchParams.get('preset') as PeriodPreset) || (searchParams.get('date_from') ? 'custom' : 'this_quarter');

  const defaultDates = useMemo(() => resolvePeriodPreset(periodPreset), [periodPreset]);
  const dateFrom = searchParams.get('date_from') || defaultDates.from;
  const dateTo = searchParams.get('date_to') || defaultDates.to;

  const searchFilter = searchParams.get('search') || '';
  const sideFilter = (searchParams.get('side') as 'all' | 'debit' | 'credit') || 'all';
  const sourceTypeFilter = searchParams.get('source_type') || '';
  const minAmtFilter = searchParams.get('min_amount') || '';
  const maxAmtFilter = searchParams.get('max_amount') || '';
  const pageParam = parseInt(searchParams.get('page') || '1', 10);

  // Ledger summary filters
  const summaryTypeParam = searchParams.get('type');
  const summaryType = isGlType(summaryTypeParam) ? summaryTypeParam : null;
  const summaryActiveOnly = searchParams.get('active') === 'true';
  const summarySortParam = searchParams.get('sort');
  const summarySort: GlSort = summarySortParam === 'activity' || summarySortParam === 'balance' ? summarySortParam : 'code';

  // Local customize & UI states
  const [customize, setCustomize] = useState<CustomizeSettings>(loadCustomizeSettings);
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isAccountPickerOpen, setIsAccountPickerOpen] = useState(false);
  const [expandedDetails, setExpandedDetails] = useState<Record<string, boolean>>({});
  const [collapsedSummaryGroups, setCollapsedSummaryGroups] = useState<Set<string>>(new Set());
  const [summarySearch, setSummarySearch] = useState('');
  const [peekAccount, setPeekAccount] = useState<LedgerAccount | null>(null);

  // Keyboard navigation & voucher preview sheet state
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [previewJeId, setPreviewJeId] = useState<string | null>(null);

  // Sync customize settings
  useEffect(() => {
    saveCustomizeSettings(customize);
  }, [customize]);

  // Helper to update URL params
  const updateParams = useCallback((updates: Record<string, string | null | number>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([k, v]) => {
      if (v === null || v === undefined || v === '') {
        next.delete(k);
      } else {
        next.set(k, String(v));
      }
    });
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  // Fetch accounts list for combobox & stepping
  const { data: accountsRes } = useQuery({
    queryKey: ['accounts', 'postable'],
    queryFn: () => financeService.getAccounts({ include_inactive: false }),
  });

  const allAccounts: Account[] = (accountsRes?.data || []).filter((a: Account) => a.is_postable);

  // Index of currently selected account in postable accounts list
  const currentAccountIndex = useMemo(() => {
    if (!accountId) return -1;
    return allAccounts.findIndex((a) => a.id === accountId);
  }, [allAccounts, accountId]);

  // Company name for the printed report header (same query as the statements)
  const { data: company } = useQuery({ queryKey: ['settings', 'public'], queryFn: () => settingsService.getPublic() });
  const companyLegalName = company?.companyLegalName || company?.appName || '';

  // 1. Fetch Ledger Summary Data (when view === 'summary')
  const {
    data: summaryRes,
    isLoading: isSummaryLoading,
    isError: isSummaryError,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ['finance-reports', 'general-ledger-summary', dateFrom, dateTo, customize.showZeroBalance],
    queryFn: () =>
      financeService.getGeneralLedgerSummary({
        date_from: dateFrom,
        date_to: dateTo,
        include_zero: customize.showZeroBalance,
      }),
    enabled: viewParam === 'summary',
  });

  // 2. Fetch Single Account Ledger Data (when view === 'account')
  const {
    data: glRes,
    isLoading: isGlLoading,
    isError: isGlError,
    refetch: refetchGl,
  } = useQuery({
    queryKey: [
      'finance-reports',
      'general-ledger',
      accountId,
      dateFrom,
      dateTo,
      pageParam,
      sourceTypeFilter,
      sideFilter,
      searchFilter,
      minAmtFilter,
      maxAmtFilter,
    ],
    queryFn: () =>
      financeService.getGeneralLedger({
        account_id: accountId || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        page: pageParam,
        per_page: 100,
        source_type: sourceTypeFilter || undefined,
        side: sideFilter !== 'all' ? sideFilter : undefined,
        search: searchFilter || undefined,
        min_amount: minAmtFilter ? parseFloat(minAmtFilter) : undefined,
        max_amount: maxAmtFilter ? parseFloat(maxAmtFilter) : undefined,
      }),
    enabled: Boolean(accountId) && viewParam === 'account',
  });

  // 3. Fetch Monthly Summary Data (when view === 'monthly' or for sparkline)
  const { data: monthlyRes } = useQuery({
    queryKey: ['finance-reports', 'general-ledger-monthly', accountId, dateFrom, dateTo],
    queryFn: () =>
      financeService.getGeneralLedgerMonthly({
        account_id: accountId || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      }),
    enabled: Boolean(accountId),
  });

  // 4. Fetch Voucher Preview Journal Entry when preview sheet is open
  const { data: previewJeRes } = useQuery({
    queryKey: ['journal-entry', previewJeId],
    queryFn: () => financeService.getJournalEntryById(previewJeId!),
    enabled: Boolean(previewJeId),
  });

  const previewJe: JournalEntry | null = previewJeRes?.data || null;

  const glData = glRes?.data;
  const currentAccount = glData?.account || allAccounts.find((a) => a.id === accountId);
  const rawLines = glData?.lines || [];

  // Filter out voided pairs if Customize setting is enabled
  const lines = useMemo(() => {
    if (!customize.hideVoidedPairs) return rawLines;
    const voidedIds = new Set<string>();
    rawLines.forEach((l) => {
      if (l.journal_entry_status === 'Voided') {
        voidedIds.add(l.journal_entry_id);
        if (l.reversal_of_id) voidedIds.add(l.reversal_of_id);
        if (l.reversed_by_id) voidedIds.add(l.reversed_by_id);
      }
    });
    return rawLines.filter((l) => !voidedIds.has(l.journal_entry_id));
  }, [rawLines, customize.hideVoidedPairs]);

  // Total debits / credits for current account ledger
  const currentTotalDebit = glData?.total_debit ?? lines.reduce((s, l) => s + (l.debit || 0), 0);
  const currentTotalCredit = glData?.total_credit ?? lines.reduce((s, l) => s + (l.credit || 0), 0);
  const closingBalance = glData?.closing_balance ?? 0;
  const closingSide = glData?.closing_balance_side ?? 'Dr';

  // Bank Account linkage if bank/cash
  const { data: bankAccountsRes } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => financeService.getBankAccounts(),
    enabled: Boolean(currentAccount),
  });
  const bankAccount = (bankAccountsRes?.data || []).find((b) => b.accountId === accountId);

  // Ledger summary: accounts grouped by type and parent, filtered and sorted
  const summaryItems = useMemo(() => summaryRes?.data?.items ?? [], [summaryRes]);
  const summaryTypeTotals = useMemo(() => typeTotals(summaryItems), [summaryItems]);
  const summaryModel = useMemo(
    () => buildGlSummary(summaryItems, { search: summarySearch, type: summaryType, activeOnly: summaryActiveOnly, sort: summarySort }),
    [summaryItems, summarySearch, summaryType, summaryActiveOnly, summarySort],
  );

  // Stepping previous / next account by code order
  const stepAccount = (direction: -1 | 1) => {
    if (allAccounts.length === 0) return;
    let nextIdx = currentAccountIndex + direction;
    if (nextIdx < 0) nextIdx = allAccounts.length - 1;
    if (nextIdx >= allAccounts.length) nextIdx = 0;
    const nextAcc = allAccounts[nextIdx];
    if (nextAcc) {
      updateParams({ account_id: nextAcc.id, page: 1 });
    }
  };

  // Auto-select first/default account when in Account ledger or Monthly summary view if none is selected
  useEffect(() => {
    if ((viewParam === 'account' || viewParam === 'monthly') && !accountId && allAccounts.length > 0) {
      const defaultAcc =
        allAccounts.find((a) => a.account_code === '1010' || a.account_code === '1020') ||
        allAccounts.find((a) => a.account_type === 'Asset') ||
        allAccounts[0];
      if (defaultAcc) {
        updateParams({ account_id: defaultAcc.id });
      }
    }
  }, [viewParam, accountId, allAccounts, updateParams]);

  // Keyboard navigation listener (Alt+Left/Right to step account, Up/Down to pick line, Enter to view JE)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Stepping accounts with Alt+Left / Alt+Right (account-based views only)
      if (viewParam === 'summary') return;
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        stepAccount(-1);
        return;
      }
      if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        stepAccount(1);
        return;
      }

      // ArrowUp / ArrowDown row selection in Account Ledger
      if (viewParam === 'account' && lines.length > 0 && !isCustomizeOpen && !isExportOpen && !isAccountPickerOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, lines.length - 1));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          return;
        }
        if (e.key === 'Enter' && selectedIndex >= 0 && selectedIndex < lines.length) {
          e.preventDefault();
          const line = lines[selectedIndex];
          if (line) setPreviewJeId(line.journal_entry_id);
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [allAccounts, currentAccountIndex, viewParam, lines, selectedIndex, isCustomizeOpen, isExportOpen, isAccountPickerOpen]);

  // Formatting helpers with Customize options
  const fmtVal = (val: number | null | undefined) => {
    return formatMoney(val, {
      negativeFormat: customize.negativeFormat,
    });
  };

  const fmtBalance = (signed: number, side: 'Dr' | 'Cr') => {
    if (customize.balanceStyle === 'signed') {
      const net = side === 'Dr' ? signed : -signed;
      return fmtVal(net);
    }
    return `${fmtVal(signed)} ${side}`;
  };

  const toggleDetailExpansion = (id: string) => {
    setExpandedDetails((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleSummaryGroup = (key: string) => {
    setCollapsedSummaryGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const summaryFmt: LedgerSummaryFormat = {
    money: (n) => fmtVal(n),
    balance: (net) =>
      customize.balanceStyle === 'signed'
        ? { amount: fmtVal(net), side: null }
        : { amount: fmtVal(Math.abs(net)), side: net >= 0 ? 'Dr' : 'Cr' },
    showCodes: customize.showAccountCodes,
  };

  const peekSummaryAccount = (row: GlAccountRow, parent: GlParentGroup | null) => {
    const meta = GL_TYPE_META[row.type];
    setPeekAccount({
      id: row.item.account_id,
      code: row.item.code,
      name: row.item.name,
      tone: meta.tone,
      context: parent ? `${meta.label} · ${parent.name}` : meta.label,
    });
  };

  // Preparation for Export Modal
  const exportRows = useMemo(() => {
    const rows: Record<string, any>[] = [];

    if (viewParam === 'summary') {
      summaryModel.groups.forEach((g) => {
        const push = (r: GlAccountRow, parentName: string) =>
          rows.push({
            type: g.meta.label,
            group: parentName,
            account_code: r.item.code,
            account_name: r.item.name,
            opening: Math.abs(r.opening),
            opening_side: r.opening >= 0 ? 'Dr' : 'Cr',
            debit: r.debit,
            credit: r.credit,
            net_change: r.movement,
            closing: Math.abs(r.closing),
            closing_side: r.closing >= 0 ? 'Dr' : 'Cr',
            lines: r.lines,
          });
        g.direct.forEach((r) => push(r, ''));
        g.parents.forEach((p) => p.accounts.forEach((r) => push(r, p.name)));
      });
    } else if (viewParam === 'account') {
      rows.push({
        entry_date: dateFrom ? formatDate(dateFrom) : 'Beginning',
        ref_id: '—',
        particulars: 'Opening Balance',
        source_type: '—',
        debit: glData?.opening_balance_side === 'Dr' ? glData?.opening_balance : 0,
        credit: glData?.opening_balance_side === 'Cr' ? glData?.opening_balance : 0,
        balance: fmtBalance(glData?.opening_balance || 0, (glData?.opening_balance_side as 'Dr'|'Cr') || 'Dr'),
      });

      lines.forEach((l) => {
        const contraStr =
          l.contra.length === 1
            ? `${l.debit > 0 ? 'To' : 'By'} ${l.contra[0].name}`
            : l.contra.length > 1
            ? `${l.debit > 0 ? 'To' : 'By'} (as per details)`
            : `${l.debit > 0 ? 'To' : 'By'} Contra Account`;

        rows.push({
          entry_date: l.entry_date ? formatDate(l.entry_date) : '',
          ref_id: l.ref_id || '—',
          particulars: contraStr,
          source_type: l.source_type || 'Manual',
          debit: l.debit,
          credit: l.credit,
          balance: fmtBalance(l.signed_balance, l.balance_side),
        });
      });

      rows.push({
        entry_date: 'Current Total',
        ref_id: '—',
        particulars: 'Period Totals',
        source_type: '—',
        debit: currentTotalDebit,
        credit: currentTotalCredit,
        balance: '—',
      });

      rows.push({
        entry_date: 'Closing Balance',
        ref_id: '—',
        particulars: 'Closing Balance',
        source_type: '—',
        debit: closingSide === 'Dr' ? closingBalance : 0,
        credit: closingSide === 'Cr' ? closingBalance : 0,
        balance: fmtBalance(closingBalance, closingSide as 'Dr' | 'Cr'),
      });
    } else {
      (monthlyRes?.data?.items || []).forEach((m) => {
        rows.push({
          month: m.month,
          debit: m.debit,
          credit: m.credit,
          closing: fmtBalance(m.closing.signed, m.closing.side),
        });
      });
    }

    return rows;
  }, [viewParam, summaryModel, lines, glData, currentTotalDebit, currentTotalCredit, closingBalance, closingSide, monthlyRes, customize]);

  const exportColumns: ExportColumn<any>[] = useMemo(() => {
    if (viewParam === 'summary') {
      return [
        { id: 'type', label: 'Type', accessor: (r) => r.type },
        { id: 'group', label: 'Group', accessor: (r) => r.group },
        { id: 'account_code', label: 'Account code', accessor: (r) => r.account_code },
        { id: 'account_name', label: 'Account', accessor: (r) => r.account_name },
        { id: 'opening', label: 'Opening (SAR)', accessor: (r) => r.opening },
        { id: 'opening_side', label: 'Opening Dr/Cr', accessor: (r) => r.opening_side },
        { id: 'debit', label: 'Debit (SAR)', accessor: (r) => r.debit },
        { id: 'credit', label: 'Credit (SAR)', accessor: (r) => r.credit },
        { id: 'net_change', label: 'Net change Dr − Cr (SAR)', accessor: (r) => r.net_change },
        { id: 'closing', label: 'Closing (SAR)', accessor: (r) => r.closing },
        { id: 'closing_side', label: 'Closing Dr/Cr', accessor: (r) => r.closing_side },
        { id: 'lines', label: 'Lines', accessor: (r) => r.lines },
      ];
    } else if (viewParam === 'account') {
      return [
        { id: 'entry_date', label: 'Date', accessor: (r) => r.entry_date },
        { id: 'ref_id', label: 'Vch No.', accessor: (r) => r.ref_id },
        { id: 'particulars', label: 'Particulars', accessor: (r) => r.particulars },
        { id: 'source_type', label: 'Vch Type', accessor: (r) => r.source_type },
        { id: 'debit', label: 'Debit (SAR)', accessor: (r) => r.debit },
        { id: 'credit', label: 'Credit (SAR)', accessor: (r) => r.credit },
        { id: 'balance', label: 'Balance', accessor: (r) => r.balance },
      ];
    } else {
      return [
        { id: 'month', label: 'Month', accessor: (r) => r.month },
        { id: 'debit', label: 'Debit (SAR)', accessor: (r) => r.debit },
        { id: 'credit', label: 'Credit (SAR)', accessor: (r) => r.credit },
        { id: 'closing', label: 'Closing Balance', accessor: (r) => r.closing },
      ];
    }
  }, [viewParam]);

  return (
    <DashboardLayout active="finance" title="General Ledger" fixedViewport>
      <div className="p-4 flex flex-col flex-1 min-h-0 gap-3 overflow-hidden h-full max-md:overflow-y-auto max-md:h-auto max-w-[1400px] mx-auto w-full print:p-0 print:m-0 print:max-w-none">
        {/* ── Toolbar Row (DESIGN.md §4.0a / AdvancesPage style) ─────────────────── */}
        <div className="border-b border-border pb-2.5 flex flex-col md:flex-row md:items-center justify-between gap-3 print:hidden">
          {/* Left Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* View Selector Tabs */}
            <ToggleGroup
              value={[viewParam]}
              onValueChange={(val: string[]) => {
                const nextView = val[0];
                if (!nextView) return;
                if ((nextView === 'account' || nextView === 'monthly') && !accountId && allAccounts.length > 0) {
                  const defaultAcc =
                    allAccounts.find((a) => a.account_code === '1010' || a.account_code === '1020') ||
                    allAccounts.find((a) => a.account_type === 'Asset') ||
                    allAccounts[0];
                  updateParams({ view: nextView, account_id: defaultAcc?.id });
                } else {
                  updateParams({ view: nextView });
                }
              }}
              className="bg-muted p-[3px] rounded-lg border border-border/60"
            >
              <ToggleGroupItem
                value="summary"
                className="h-7 text-xs font-medium px-3 rounded-md data-pressed:bg-background data-pressed:text-foreground data-pressed:shadow-xs"
              >
                <LayoutList className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                <span>Ledger summary</span>
              </ToggleGroupItem>
              <ToggleGroupItem
                value="account"
                className="h-7 text-xs font-medium px-3 rounded-md data-pressed:bg-background data-pressed:text-foreground data-pressed:shadow-xs"
              >
                <BookOpenText className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                <span>Account ledger</span>
              </ToggleGroupItem>
              <ToggleGroupItem
                value="monthly"
                className="h-7 text-xs font-medium px-3 rounded-md data-pressed:bg-background data-pressed:text-foreground data-pressed:shadow-xs"
              >
                <CalendarRange className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                <span>Monthly summary</span>
              </ToggleGroupItem>
            </ToggleGroup>

            <PeriodControl
              preset={periodPreset}
              from={dateFrom}
              to={dateTo}
              onChange={({ preset, from, to }) => updateParams({ preset, date_from: from, date_to: to, page: 1 })}
            />
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs rounded-md border-border font-medium gap-1.5"
              onClick={() => setIsCustomizeOpen(true)}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
              <span>Customize</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs rounded-md border-border font-medium gap-1.5"
              onClick={() => window.print()}
            >
              <Printer className="w-3.5 h-3.5 text-muted-foreground" />
              <span>Print</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs rounded-md border-border font-medium gap-1.5"
              onClick={() => setIsExportOpen(true)}
            >
              <Download className="w-3.5 h-3.5 text-muted-foreground" />
              <span>Export</span>
            </Button>
          </div>
        </div>

        {/* ── VIEW 1: LEDGER SUMMARY ───────────────────────────────────────────── */}
        {viewParam === 'summary' && (
          <>
            <div className="hidden text-center print:block">
              {companyLegalName && <p className="text-xs text-muted-foreground">{companyLegalName}</p>}
              <h1 className="text-xl font-semibold">General ledger summary</h1>
              <p className="text-xs text-muted-foreground">
                {formatDate(dateFrom)} – {formatDate(dateTo)} · amounts in SAR
              </p>
            </div>
            <ReportViewState
              isLoading={isSummaryLoading}
              isError={isSummaryError}
              onRetry={() => refetchSummary()}
              isEmpty={summaryItems.length === 0}
              emptyTitle="No ledger activity"
              emptyDescription="No account has a balance or postings up to the end of this period. Try a different period, or turn on accounts with no activity in Customize."
            >
              <div className="shrink-0 print:hidden">
                <LedgerSummaryHeadline
                  totals={summaryTypeTotals}
                  model={summaryModel}
                  openingLabel={formatDate(dateFrom)}
                  active={summaryType}
                  onType={(t) => updateParams({ type: t })}
                />
              </div>
              <LedgerSummaryTable
                model={summaryModel}
                fmt={summaryFmt}
                search={summarySearch}
                onSearch={setSummarySearch}
                type={summaryType}
                onType={(t) => updateParams({ type: t })}
                activeOnly={summaryActiveOnly}
                onActiveOnly={(v) => updateParams({ active: v ? 'true' : null })}
                sort={summarySort}
                onSort={(v) => updateParams({ sort: v === 'code' ? null : v })}
                collapsed={collapsedSummaryGroups}
                onToggleParent={toggleSummaryGroup}
                onCollapseAll={(collapse) => setCollapsedSummaryGroups(collapse ? new Set(parentKeys(summaryModel)) : new Set())}
                onPeek={peekSummaryAccount}
                onOpenLedger={(row) => updateParams({ view: 'account', account_id: row.item.account_id, page: 1 })}
                onOpenMonthly={(row) => updateParams({ view: 'monthly', account_id: row.item.account_id })}
                selectedId={peekAccount?.id ?? null}
              />
            </ReportViewState>
            <AccountLedgerSheet account={peekAccount} from={dateFrom} to={dateTo} onClose={() => setPeekAccount(null)} />
          </>
        )}

        {/* ── VIEW 2: ACCOUNT LEDGER (Tally Ledger Vouchers) ───────────────────── */}
        {viewParam === 'account' && (
          <div className="flex flex-col flex-1 min-h-0 gap-3 w-full">
            {/* Account Ledger Card */}
            <div className="bg-card rounded-xl border border-border shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden">
                {/* Single Toolbar Header Strip */}
                <div className="px-3 py-2 border-b border-border bg-card flex flex-wrap items-center justify-between gap-2 shrink-0 print:hidden">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Account Picker Combobox */}
                    <Popover open={isAccountPickerOpen} onOpenChange={setIsAccountPickerOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={isAccountPickerOpen}
                          className="w-[280px] justify-between h-8 text-xs bg-background border-border font-medium text-foreground"
                        >
                          {currentAccount ? (
                            <div className="flex items-center gap-2 truncate">
                              {customize.showAccountCodes && (
                                <span className="font-mono text-muted-foreground">{currentAccount.account_code}</span>
                              )}
                              <span className="truncate">{currentAccount.name}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Select an account…</span>
                          )}
                          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[320px] p-0 bg-card border-border" align="start">
                        <Command>
                          <CommandInput placeholder="Search account code or name..." className="h-9 text-xs" />
                          <CommandList className="max-h-72">
                            <CommandEmpty>No matching account found.</CommandEmpty>
                            {['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'].map((type) => {
                              const typeAccounts = allAccounts.filter((a) => a.account_type === type);
                              if (typeAccounts.length === 0) return null;
                              return (
                                <CommandGroup key={type} heading={`${type}s`}>
                                  {typeAccounts.map((acc) => (
                                    <CommandItem
                                      key={acc.id}
                                      value={`${acc.account_code} ${acc.name}`}
                                      onSelect={() => {
                                        updateParams({ account_id: acc.id, page: 1 });
                                        setIsAccountPickerOpen(false);
                                      }}
                                      className="text-xs flex items-center justify-between cursor-pointer"
                                    >
                                      <div className="flex items-center gap-2 truncate">
                                        <span className="font-mono text-muted-foreground">{acc.account_code}</span>
                                        <span className="truncate">{acc.name}</span>
                                      </div>
                                      {accountId === acc.id && <Check className="h-3.5 w-3.5 text-[#FA634E]" />}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              );
                            })}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>

                    {/* Stepper Buttons */}
                    <div className="flex items-center gap-1">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => stepAccount(-1)}
                              disabled={allAccounts.length === 0}
                              className="h-8 w-8 border-border text-foreground"
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs">Previous Account (Alt + ←)</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => stepAccount(1)}
                              disabled={allAccounts.length === 0}
                              className="h-8 w-8 border-border text-foreground"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs">Next Account (Alt + →)</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>

                    {/* Account Type Badge */}
                    {currentAccount && (
                      <Badge variant="outline" className="border-border bg-muted text-muted-foreground font-medium text-xs">
                        {currentAccount.account_type}
                      </Badge>
                    )}

                    {/* Bank Link */}
                    {bankAccount && (
                      <Link
                        to={`/finance/bank-accounts/${bankAccount.id}`}
                        className="flex items-center gap-1 text-xs text-[#FA634E] hover:underline font-medium"
                      >
                        <Building2 className="w-3.5 h-3.5" />
                        <span>Bank details →</span>
                      </Link>
                    )}
                  </div>

                  {/* Search & Filters */}
                  <div className="flex items-center gap-2">
                    <div className="relative w-44">
                      <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-2.5" />
                      <Input
                        placeholder="Search ref, memo..."
                        value={searchFilter}
                        onChange={(e) => updateParams({ search: e.target.value, page: 1 })}
                        className="h-8 pl-8 text-xs bg-background border-border"
                      />
                    </div>

                    <ToggleGroup
                      value={[sideFilter]}
                      onValueChange={(val: string[]) => val[0] && updateParams({ side: val[0], page: 1 })}
                      className="bg-muted p-[3px] rounded-lg border border-border/60"
                    >
                      <ToggleGroupItem value="all" className="h-7 text-xs font-medium px-2.5 rounded-md data-pressed:bg-background data-pressed:text-foreground data-pressed:shadow-xs">
                        All
                      </ToggleGroupItem>
                      <ToggleGroupItem value="debit" className="h-7 text-xs font-medium px-2.5 rounded-md data-pressed:bg-background data-pressed:text-foreground data-pressed:shadow-xs">
                        Debit
                      </ToggleGroupItem>
                      <ToggleGroupItem value="credit" className="h-7 text-xs font-medium px-2.5 rounded-md data-pressed:bg-background data-pressed:text-foreground data-pressed:shadow-xs">
                        Credit
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                </div>

                {/* Internal Scroll Table Container */}
                <div className="table-container flex-1 overflow-auto">
                  <table className="w-full text-left text-xs border-collapse min-w-[780px]">
                    <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-xs border-b border-border">
                      <tr className="text-xs font-medium text-muted-foreground">
                        <th className="py-2.5 px-3 w-28">Date</th>
                        <th className="py-2.5 px-3">Account / Narration</th>
                        {customize.showVoucherType && <th className="py-2.5 px-3 w-32">Vch type</th>}
                        <th className="py-2.5 px-3 w-36">Vch no.</th>
                        <th className="w-[140px] py-2.5 px-3 text-right text-xs font-semibold text-foreground">Debit</th>
                        <th className="w-[140px] py-2.5 px-3 text-right text-xs font-semibold text-foreground">Credit</th>
                        <th className="w-[150px] py-2.5 px-3 text-right text-xs font-semibold text-foreground">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {(isGlLoading || !accountId) ? (
                        [1, 2, 3, 4, 5].map((i) => (
                          <tr key={i} className="animate-pulse">
                            <td className="py-2.5 px-3"><Skeleton className="h-4 w-20" /></td>
                            <td className="py-2.5 px-3"><Skeleton className="h-4 w-48" /></td>
                            {customize.showVoucherType && <td className="py-2.5 px-3"><Skeleton className="h-4 w-20" /></td>}
                            <td className="py-2.5 px-3"><Skeleton className="h-4 w-24" /></td>
                            <td className="py-2.5 px-3 text-right"><Skeleton className="h-4 w-16 ml-auto" /></td>
                            <td className="py-2.5 px-3 text-right"><Skeleton className="h-4 w-16 ml-auto" /></td>
                            <td className="py-2.5 px-3 text-right"><Skeleton className="h-4 w-20 ml-auto" /></td>
                          </tr>
                        ))
                      ) : isGlError ? (
                        <tr>
                          <td colSpan={customize.showVoucherType ? 7 : 6} className="py-8 text-center">
                            <div className="text-rose-600 font-medium text-xs flex items-center justify-center gap-2">
                              <span>Failed to load General Ledger Vouchers</span>
                              <Button size="sm" variant="outline" onClick={() => refetchGl()} className="h-7 text-xs">Retry</Button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        <>
                          {/* Opening Balance */}
                          <tr className="bg-muted/40 font-medium text-foreground">
                            <td className="py-2 px-3 font-mono text-muted-foreground">
                              {dateFrom ? formatDate(dateFrom) : 'Beginning'}
                            </td>
                            <td className="py-2 px-3 font-semibold text-foreground">
                              Opening Balance
                            </td>
                            {customize.showVoucherType && <td className="py-2 px-3 text-muted-foreground">—</td>}
                            <td className="py-2 px-3 text-muted-foreground font-mono">—</td>
                            <td className="py-2 px-3 text-right font-mono text-xs text-emerald-600 dark:text-emerald-400">
                              {glData?.opening_balance_side === 'Dr' ? fmtVal(glData.opening_balance) : '—'}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-xs text-amber-600 dark:text-amber-400">
                              {glData?.opening_balance_side === 'Cr' ? fmtVal(glData.opening_balance) : '—'}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-xs font-bold text-foreground">
                              {fmtBalance(glData?.opening_balance || 0, (glData?.opening_balance_side as 'Dr'|'Cr') || 'Dr')}
                            </td>
                          </tr>

                      {/* Empty state */}
                      {lines.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-muted-foreground">
                            No transactions found for this account in the selected period.
                          </td>
                        </tr>
                      )}

                      {/* Transaction Voucher Lines */}
                      {lines.map((line, idx) => {
                        const isSelected = selectedIndex === idx;

                        const isDebit = line.debit > 0;
                        const prefix = isDebit ? 'To' : 'By';

                        let particularsStr = `${prefix} Contra Account`;
                        let hasMultipleContra = false;

                        if (line.contra.length === 1) {
                          particularsStr = `${prefix} ${line.contra[0].name}`;
                        } else if (line.contra.length > 1) {
                          particularsStr = `${prefix} (as per details)`;
                          hasMultipleContra = true;
                        }

                        const isDetailExpanded = Boolean(expandedDetails[line.line_id]);

                        return (
                          <React.Fragment key={`${line.line_id}-${idx}`}>
                            <tr
                              onClick={() => {
                                setSelectedIndex(idx);
                                setPreviewJeId(line.journal_entry_id);
                              }}
                              className={`transition-colors cursor-pointer group ${
                                isSelected
                                  ? 'bg-muted/80'
                                  : 'hover:bg-muted/50'
                              } ${line.journal_entry_status === 'Voided' ? 'opacity-60 text-muted-foreground' : ''}`}
                            >
                              <td className="py-2 px-3 font-mono text-muted-foreground whitespace-nowrap">
                                {formatDate(line.entry_date)}
                              </td>
                              <td className="py-2 px-3">
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                                    <span>{particularsStr}</span>
                                    {hasMultipleContra && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleDetailExpansion(line.line_id);
                                        }}
                                        className="p-0.5 hover:bg-muted rounded transition-colors"
                                      >
                                        {isDetailExpanded ? (
                                          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                                        ) : (
                                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                                        )}
                                      </button>
                                    )}
                                  </div>

                                  {customize.showNarration && (line.memo || line.description) && (
                                    <div className="text-xs text-muted-foreground font-normal">
                                      {line.memo || line.description}
                                    </div>
                                  )}
                                </div>
                              </td>
                              {customize.showVoucherType && (
                                <td className="py-2 px-3">
                                  {renderSourceBadge(line.source_type || undefined, line.source_id || undefined)}
                                </td>
                              )}
                              <td className="py-2 px-3 font-mono">
                                <Link
                                  to={`/finance/journal-entries/${line.journal_entry_id}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-foreground font-medium hover:underline"
                                >
                                  {line.ref_id || 'JE-Details'}
                                </Link>
                              </td>
                              <td className="py-2 px-3 text-right font-mono text-xs text-emerald-600 dark:text-emerald-400">
                                {line.debit > 0 ? fmtVal(line.debit) : '—'}
                              </td>
                              <td className="py-2 px-3 text-right font-mono text-xs text-amber-600 dark:text-amber-400">
                                {line.credit > 0 ? fmtVal(line.credit) : '—'}
                              </td>
                              <td className="py-2 px-3 text-right font-mono text-xs font-bold text-foreground">
                                {fmtBalance(line.signed_balance, line.balance_side)}
                              </td>
                            </tr>

                            {/* Expanded Contra Lines Breakdown */}
                            {hasMultipleContra && isDetailExpanded && (
                              <tr className="bg-muted/30">
                                <td colSpan={customize.showVoucherType ? 7 : 6} className="py-2 px-6">
                                  <div className="pl-6 border-l-2 border-[#FA634E] space-y-1 py-1">
                                    <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                      Contra breakdown details:
                                    </div>
                                    <div className="space-y-1">
                                      {line.contra.map((cl, cIdx) => (
                                        <div key={cIdx} className="flex items-center justify-between text-xs font-mono">
                                          <div className="flex items-center gap-2">
                                            <span className="text-muted-foreground">{cl.account_code}</span>
                                            <span className="text-foreground font-sans">{cl.name}</span>
                                          </div>
                                          <div className="font-medium text-foreground">
                                            {fmtVal(cl.amount)}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                      </>
                    )}
                    </tbody>
                  </table>
                </div>

                {/* Pinned Card Footer */}
                <div className="border-t border-border bg-card px-4 py-2.5 text-xs font-semibold text-foreground flex items-center justify-between shrink-0 print:hidden">
                  <div className="flex items-center gap-3">
                    <span>Current total</span>
                    <span className="font-mono text-muted-foreground font-normal">
                      Dr {fmtVal(currentTotalDebit)} &nbsp; Cr {fmtVal(currentTotalCredit)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {glData?.pagination && glData.pagination.total_pages > pageParam && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateParams({ page: pageParam + 1 })}
                        className="h-7 text-xs font-medium border-border"
                      >
                        Load More ({lines.length} of {glData.count})
                      </Button>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground font-normal">Closing</span>
                      <span className="font-mono font-bold text-foreground">
                        {fmtBalance(closingBalance, closingSide as 'Dr' | 'Cr')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

        {/* ── VIEW 3: MONTHLY SUMMARY (Tally Style) ────────────────────────────── */}
        {viewParam === 'monthly' && (
          <div className="space-y-6 max-w-[1240px] mx-auto">
            {/* Header info */}
            <div className="p-4 bg-card rounded-xl border border-border shadow-xs flex items-center justify-between">
              <div className="text-xs font-medium text-foreground">
                Monthly Breakdown: <strong className="font-semibold">{currentAccount?.name || 'Selected Account'}</strong>
              </div>
            </div>

            {/* Monthly Bar + Line Chart */}
            {monthlyRes?.data?.items && (
              <div className="bg-card rounded-xl border border-border p-6 space-y-3 shadow-xs">
                <div className="text-xs font-semibold text-foreground uppercase tracking-wide">
                  Monthly Activity & Closing Balance
                </div>
                <div className="h-64 w-full pt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyRes.data.items}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <RechartsTooltip />
                      <Bar dataKey="debit" name="Debit" fill="#FA634E" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="credit" name="Credit" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Monthly Summary Table */}
            <div className="bg-card rounded-xl border border-border shadow-xs p-6 md:p-8">
              <div className="table-container overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      <th className="py-2.5 px-3">Month</th>
                      <th className="py-2.5 px-3 text-right w-36">Debit (SAR)</th>
                      <th className="py-2.5 px-3 text-right w-36">Credit (SAR)</th>
                      <th className="py-2.5 px-3 text-right w-44">Closing Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {(monthlyRes?.data?.items || []).map((m) => (
                      <tr
                        key={m.month}
                        onClick={() => {
                          const [y, mm] = m.month.split('-');
                          const lastDay = new Date(Number(y), Number(mm), 0).getDate();
                          updateParams({
                            view: 'account',
                            preset: 'custom',
                            date_from: `${m.month}-01`,
                            date_to: `${m.month}-${String(lastDay).padStart(2, '0')}`,
                          });
                        }}
                        className="hover:bg-muted/50 cursor-pointer font-medium"
                      >
                        <td className="py-3 px-3 font-semibold text-foreground">
                          {m.month}
                        </td>
                        <td className="py-3 px-3 text-right fin-num text-foreground">
                          {m.debit > 0 ? fmtVal(m.debit) : '—'}
                        </td>
                        <td className="py-3 px-3 text-right fin-num text-foreground">
                          {m.credit > 0 ? fmtVal(m.credit) : '—'}
                        </td>
                        <td className="py-3 px-3 text-right fin-num font-semibold text-foreground">
                          {fmtBalance(m.closing.signed, m.closing.side)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-foreground/70 border-b-[3px] border-double font-semibold text-foreground text-sm">
                      <td className="py-3.5 px-3">Total</td>
                      <td className="py-3.5 px-3 text-right fin-num text-foreground">
                        {fmtVal(monthlyRes?.data?.total_debit || 0)}
                      </td>
                      <td className="py-3.5 px-3 text-right fin-num text-foreground">
                        {fmtVal(monthlyRes?.data?.total_credit || 0)}
                      </td>
                      <td className="py-3.5 px-3 text-right fin-num text-muted-foreground">—</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── CUSTOMIZE SHEET ─────────────────────────────────────────────────── */}
        <Sheet open={isCustomizeOpen} onOpenChange={setIsCustomizeOpen}>
          <SheetContent className="w-[380px] sm:w-[420px] space-y-6">
            <SheetHeader>
              <SheetTitle className="text-base font-semibold">Customize General Ledger</SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground">
                Adjust viewing parameters, formats, and voucher groupings.
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-5 text-xs pt-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-foreground">Show Narration</div>
                  <div className="text-[11px] text-muted-foreground">Display entry memo & description under particulars</div>
                </div>
                <Switch
                  checked={customize.showNarration}
                  onCheckedChange={(val) => setCustomize((prev) => ({ ...prev, showNarration: val }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-foreground">Show Voucher Type</div>
                  <div className="text-[11px] text-muted-foreground">Display source badge column</div>
                </div>
                <Switch
                  checked={customize.showVoucherType}
                  onCheckedChange={(val) => setCustomize((prev) => ({ ...prev, showVoucherType: val }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-foreground">Hide Voided Pairs</div>
                  <div className="text-[11px] text-muted-foreground">Hide voided entries and their reversing pairs</div>
                </div>
                <Switch
                  checked={customize.hideVoidedPairs}
                  onCheckedChange={(val) => setCustomize((prev) => ({ ...prev, hideVoidedPairs: val }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-foreground">Show Account Codes</div>
                  <div className="text-[11px] text-muted-foreground">Include account code next to account name</div>
                </div>
                <Switch
                  checked={customize.showAccountCodes}
                  onCheckedChange={(val) => setCustomize((prev) => ({ ...prev, showAccountCodes: val }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-foreground">Show Zero-Balance Accounts</div>
                  <div className="text-[11px] text-muted-foreground">Ledger summary: include accounts with no balance and no postings</div>
                </div>
                <Switch
                  checked={customize.showZeroBalance}
                  onCheckedChange={(val) => setCustomize((prev) => ({ ...prev, showZeroBalance: val }))}
                />
              </div>

              <div className="space-y-2 pt-2 border-t border-border">
                <div className="font-medium text-foreground">Negative Format</div>
                <Select
                  value={customize.negativeFormat}
                  onValueChange={(val: 'minus' | 'parentheses') =>
                    setCustomize((prev) => ({ ...prev, negativeFormat: val }))
                  }
                >
                  <SelectTrigger className="h-8 text-xs bg-background border-border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="text-xs font-medium">
                    <SelectItem value="minus">-1,234.00 (Standard minus)</SelectItem>
                    <SelectItem value="parentheses">(1,234.00) (Accounting parentheses)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 pt-2 border-t border-border">
                <div className="font-medium text-foreground">Balance Style</div>
                <Select
                  value={customize.balanceStyle}
                  onValueChange={(val: 'dr_cr' | 'signed') =>
                    setCustomize((prev) => ({ ...prev, balanceStyle: val }))
                  }
                >
                  <SelectTrigger className="h-8 text-xs bg-background border-border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="text-xs font-medium">
                    <SelectItem value="dr_cr">1,234.00 Dr / Cr (Suffix)</SelectItem>
                    <SelectItem value="signed">Signed net (+ / -)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* ── VOUCHER PREVIEW SHEET ───────────────────────────────────────────── */}
        <Sheet open={Boolean(previewJeId)} onOpenChange={(open) => !open && setPreviewJeId(null)}>
          <SheetContent className="w-[420px] sm:w-[540px] space-y-6 overflow-y-auto">
            <SheetHeader>
              <SheetTitle className="text-base font-semibold flex items-center justify-between">
                <span>Voucher Preview</span>
                {previewJe?.ref_id && (
                  <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground ring-1 ring-inset ring-border fin-num">
                    {previewJe.ref_id}
                  </span>
                )}
              </SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground">
                Journal Entry details and line postings.
              </SheetDescription>
            </SheetHeader>

            {previewJe ? (
              <div className="space-y-5 text-xs">
                {/* Meta Card */}
                <div className="p-3.5 bg-muted/30 rounded-xl border border-border grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-muted-foreground block font-medium">Entry Date</span>
                    <span className="font-semibold text-foreground fin-num">
                      {formatDate(previewJe.entry_date)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block font-medium">Status</span>
                    <StatusPill kind="journal" status={previewJe.status} />
                  </div>
                  <div>
                    <span className="text-muted-foreground block font-medium">Source</span>
                    <span>{renderSourceBadge(previewJe.source_type, previewJe.source_id || undefined)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block font-medium">Period</span>
                    <span className="font-medium text-foreground">
                      {previewJe.period?.name || '—'}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground block font-medium">Memo / Reference</span>
                    <span className="text-foreground font-medium">
                      {previewJe.memo || '—'}
                    </span>
                  </div>
                </div>

                {/* Journal Lines Table Component */}
                <div>
                  <div className="font-semibold text-foreground uppercase tracking-wide mb-2">
                    Journal Lines
                  </div>
                  <JournalLinesTable lines={previewJe.lines || []} />
                </div>

                {/* Open Full Entry Button */}
                <div className="pt-2">
                  <Button
                    onClick={() => {
                      const id = previewJeId;
                      setPreviewJeId(null);
                      navigate(`/finance/journal-entries/${id}`);
                    }}
                    variant="outline"
                    className="w-full font-medium h-8 text-xs gap-1.5 border-border text-foreground"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open full journal entry details</span>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center space-y-3">
                <Skeleton className="h-6 w-48 mx-auto" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-48 w-full" />
              </div>
            )}
          </SheetContent>
        </Sheet>

        {/* ── EXPORT MODAL ───────────────────────────────────────────────────── */}
        <ExportModal
          isOpen={isExportOpen}
          onClose={() => setIsExportOpen(false)}
          title={`Export General Ledger (${viewParam})`}
          fileNamePrefix={`general-ledger-${viewParam}`}
          filteredData={exportRows}
          columns={exportColumns}
        />
      </div>
    </DashboardLayout>
  );
}

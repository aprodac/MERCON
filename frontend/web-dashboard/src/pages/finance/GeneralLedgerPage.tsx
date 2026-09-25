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
  ArrowLeftRight,
  ChevronLeft,
  Building2,
  ExternalLink,
  RefreshCw,
  Calendar as CalendarIcon,
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
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import ExportModal, { type ExportColumn } from '@/components/ui/ExportModal';

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Cell,
} from 'recharts';

import {
  financeService,
  type Account,
  type GeneralLedgerData,
  type GeneralLedgerLineItem,
  type GeneralLedgerSummaryData,
  type GeneralLedgerSummaryItem,
  type GeneralLedgerMonthlyData,
  type GeneralLedgerMonthlyItem,
  type JournalEntry,
} from '@/services/financeService';
import { formatMoney, formatDate } from '@/lib/finance/format';
import { resolvePeriodPreset, type PeriodPreset } from '@/lib/finance/pnlPeriodHelpers';
import { SOURCE_CONFIG, renderSourceBadge } from '@/lib/finance/sourceConfig';
import { JournalLinesTable } from '@/components/finance/kit/JournalLinesTable';

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
  const periodPreset = (searchParams.get('preset') as PeriodPreset) || 'this_quarter';

  const defaultDates = useMemo(() => resolvePeriodPreset(periodPreset), [periodPreset]);
  const dateFrom = searchParams.get('date_from') || defaultDates.from;
  const dateTo = searchParams.get('date_to') || defaultDates.to;

  const searchFilter = searchParams.get('search') || '';
  const sideFilter = (searchParams.get('side') as 'all' | 'debit' | 'credit') || 'all';
  const sourceTypeFilter = searchParams.get('source_type') || '';
  const minAmtFilter = searchParams.get('min_amount') || '';
  const maxAmtFilter = searchParams.get('max_amount') || '';
  const pageParam = parseInt(searchParams.get('page') || '1', 10);

  // Local customize & UI states
  const [customize, setCustomize] = useState<CustomizeSettings>(loadCustomizeSettings);
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isAccountPickerOpen, setIsAccountPickerOpen] = useState(false);
  const [expandedDetails, setExpandedDetails] = useState<Record<string, boolean>>({});
  const [collapsedSummaryGroups, setCollapsedSummaryGroups] = useState<Record<string, boolean>>({});

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

  // Fetch Public Settings for Legal Name
  const { data: publicSettingsRes } = useQuery({
    queryKey: ['settings', 'public'],
    queryFn: () => financeService.getAccounts().then(() => null).catch(() => null),
  });
  const companyLegalName = (publicSettingsRes as any)?.data?.companyLegalName || 'MERCON Logistics';

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
  const {
    data: monthlyRes,
    isLoading: isMonthlyLoading,
    isError: isMonthlyError,
    refetch: refetchMonthly,
  } = useQuery({
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

  // Grouping of Summary items by Account Type and Parent Group
  const summaryGrouped = useMemo(() => {
    const items = summaryRes?.data?.items || [];
    type TypeGroup = {
      type: string;
      totalOpening: number;
      totalDebit: number;
      totalCredit: number;
      totalClosing: number;
      parents: Map<string, { parentCode?: string; parentName: string; items: GeneralLedgerSummaryItem[]; subtotalDebit: number; subtotalCredit: number }>;
    };

    const typeOrder = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];
    const map = new Map<string, TypeGroup>();

    typeOrder.forEach((t) => {
      map.set(t, {
        type: t,
        totalOpening: 0,
        totalDebit: 0,
        totalCredit: 0,
        totalClosing: 0,
        parents: new Map(),
      });
    });

    items.forEach((item) => {
      const typeKey = item.type;
      let tg = map.get(typeKey);
      if (!tg) {
        tg = {
          type: typeKey,
          totalOpening: 0,
          totalDebit: 0,
          totalCredit: 0,
          totalClosing: 0,
          parents: new Map(),
        };
        map.set(typeKey, tg);
      }

      tg.totalDebit += item.period_debit;
      tg.totalCredit += item.period_credit;
      tg.totalOpening += item.opening.signed * (item.opening.side === 'Dr' ? 1 : -1);
      tg.totalClosing += item.closing.signed * (item.closing.side === 'Dr' ? 1 : -1);

      const parentKey = item.parent_id || item.parent_name || 'Unassigned';
      let pg = tg.parents.get(parentKey);
      if (!pg) {
        pg = {
          parentCode: item.parent_code || undefined,
          parentName: item.parent_name || 'Direct Accounts',
          items: [],
          subtotalDebit: 0,
          subtotalCredit: 0,
        };
        tg.parents.set(parentKey, pg);
      }
      pg.items.push(item);
      pg.subtotalDebit += item.period_debit;
      pg.subtotalCredit += item.period_credit;
    });

    return Array.from(map.values()).filter((g) => g.parents.size > 0);
  }, [summaryRes]);

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

  // Keyboard navigation listener (Alt+Left/Right to step account, Up/Down to pick line, Enter to view JE)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Stepping accounts with Alt+Left / Alt+Right
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

  const handlePeriodPresetChange = (preset: PeriodPreset) => {
    if (preset === 'custom') {
      updateParams({ preset: 'custom' });
    } else {
      const { from, to } = resolvePeriodPreset(preset);
      updateParams({ preset, date_from: from, date_to: to });
    }
  };

  const handleCustomRangeChange = (from: string, to: string) => {
    updateParams({ preset: 'custom', date_from: from, date_to: to });
  };

  const toggleDetailExpansion = (id: string) => {
    setExpandedDetails((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleSummaryGroup = (key: string) => {
    setCollapsedSummaryGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Preparation for Export Modal
  const exportRows = useMemo(() => {
    const rows: Record<string, any>[] = [];

    if (viewParam === 'summary') {
      summaryGrouped.forEach((tg) => {
        tg.parents.forEach((pg) => {
          pg.items.forEach((item) => {
            rows.push({
              view: 'Ledger Summary',
              type: item.type,
              account_code: item.code,
              account_name: item.name,
              opening: `${fmtVal(item.opening.signed)} ${item.opening.side}`,
              debit: item.period_debit,
              credit: item.period_credit,
              closing: `${fmtVal(item.closing.signed)} ${item.closing.side}`,
            });
          });
        });
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
          entry_date: formatDate(l.entry_date),
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
  }, [viewParam, summaryGrouped, lines, glData, currentTotalDebit, currentTotalCredit, closingBalance, closingSide, monthlyRes, customize]);

  const exportColumns: ExportColumn<any>[] = useMemo(() => {
    if (viewParam === 'summary') {
      return [
        { id: 'type', label: 'Type', accessor: (r) => r.type },
        { id: 'account_code', label: 'Account Code', accessor: (r) => r.account_code },
        { id: 'account_name', label: 'Account Name', accessor: (r) => r.account_name },
        { id: 'opening', label: 'Opening Balance', accessor: (r) => r.opening },
        { id: 'debit', label: 'Debit (SAR)', accessor: (r) => r.debit },
        { id: 'credit', label: 'Credit (SAR)', accessor: (r) => r.credit },
        { id: 'closing', label: 'Closing Balance', accessor: (r) => r.closing },
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
    <DashboardLayout active="finance" title="General Ledger">
      <div className="p-4 space-y-3.5 max-w-[1400px] mx-auto print:p-0 print:m-0 print:max-w-none">
        {/* ── Toolbar Row (DESIGN.md §4.0a / AdvancesPage style) ─────────────────── */}
        <div className="border-b border-slate-200/80 pb-2.5 flex flex-col md:flex-row md:items-center justify-between gap-3 print:hidden">
          {/* Left Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* View Selector Tabs */}
            <div className="bg-[#F4F4F5] dark:bg-slate-800/80 p-1 rounded-xl flex items-center gap-1">
              <button
                type="button"
                onClick={() => updateParams({ view: 'summary' })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[9px] text-xs font-semibold transition-all ${
                  viewParam === 'summary'
                    ? 'bg-white dark:bg-slate-900 text-[#111111] dark:text-slate-100 shadow-xs'
                    : 'text-[#6E6E80] dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <LayoutList className="w-3.5 h-3.5 text-[#FA634E]" />
                <span>Ledger summary</span>
              </button>
              <button
                type="button"
                onClick={() => updateParams({ view: 'account' })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[9px] text-xs font-semibold transition-all ${
                  viewParam === 'account'
                    ? 'bg-white dark:bg-slate-900 text-[#111111] dark:text-slate-100 shadow-xs'
                    : 'text-[#6E6E80] dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <BookOpenText className="w-3.5 h-3.5 text-[#FA634E]" />
                <span>Account ledger</span>
              </button>
              <button
                type="button"
                onClick={() => updateParams({ view: 'monthly' })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[9px] text-xs font-semibold transition-all ${
                  viewParam === 'monthly'
                    ? 'bg-white dark:bg-slate-900 text-[#111111] dark:text-slate-100 shadow-xs'
                    : 'text-[#6E6E80] dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <CalendarRange className="w-3.5 h-3.5 text-[#FA634E]" />
                <span>Monthly summary</span>
              </button>
            </div>

            {/* Period Preset Select */}
            <Select value={periodPreset} onValueChange={(val) => handlePeriodPresetChange(val as PeriodPreset)}>
              <SelectTrigger className="h-8 text-xs w-[140px] rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                <SelectValue placeholder="Period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="this_month">This Month</SelectItem>
                <SelectItem value="last_month">Last Month</SelectItem>
                <SelectItem value="this_quarter">This Quarter</SelectItem>
                <SelectItem value="last_quarter">Last Quarter</SelectItem>
                <SelectItem value="this_year">This Year</SelectItem>
                <SelectItem value="last_year">Last Year</SelectItem>
                <SelectItem value="ytd">Year to Date</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>

            {/* Custom Date Range Popover */}
            {periodPreset === 'custom' && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 gap-1.5">
                    <CalendarIcon className="w-3.5 h-3.5 text-slate-500" />
                    <span>Select Dates</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-3" align="start">
                  <div className="space-y-3">
                    <div className="text-xs font-bold text-slate-700 dark:text-slate-300">Custom Date Range</div>
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => handleCustomRangeChange(e.target.value, dateTo)}
                        className="h-8 text-xs p-1.5 border rounded-lg bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                      />
                      <span className="text-xs text-slate-400">to</span>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => handleCustomRangeChange(dateFrom, e.target.value)}
                        className="h-8 text-xs p-1.5 border rounded-lg bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                      />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            )}

            {/* Resolved Date Range Chip */}
            <div className="bg-[#EEF1F6] dark:bg-slate-800 px-2.5 py-1 rounded-[10px] text-[11.5px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <span>{formatDate(dateFrom)} – {formatDate(dateTo)}</span>
            </div>
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs rounded-lg border-slate-200 dark:border-slate-800 gap-1.5"
              onClick={() => setIsCustomizeOpen(true)}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
              <span>Customize</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs rounded-lg border-slate-200 dark:border-slate-800 gap-1.5"
              onClick={() => window.print()}
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
              <span>Print</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs rounded-lg border-slate-200 dark:border-slate-800 gap-1.5"
              onClick={() => setIsExportOpen(true)}
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Export</span>
            </Button>
          </div>
        </div>

        {/* ── VIEW 1: LEDGER SUMMARY (Zoho GL) ─────────────────────────────────── */}
        {viewParam === 'summary' && (
          <div className="space-y-4 max-w-[1240px] mx-auto">
            {/* Header / Activity Toggle Card */}
            <div className="flex items-center justify-between p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span>Summary of all accounts</span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-500 dark:text-slate-400">{summaryRes?.data?.items.length || 0} active accounts</span>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="show-zero-accs"
                  checked={customize.showZeroBalance}
                  onCheckedChange={(checked) => setCustomize((prev) => ({ ...prev, showZeroBalance: checked }))}
                />
                <label htmlFor="show-zero-accs" className="text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                  Show accounts with no activity
                </label>
              </div>
            </div>

            {/* Error State */}
            {isSummaryError && (
              <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-2xl p-6 text-center space-y-3">
                <div className="text-rose-700 dark:text-rose-300 font-bold text-sm">Failed to load General Ledger Summary</div>
                <Button size="sm" variant="outline" onClick={() => refetchSummary()} className="h-8 text-xs gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry</span>
                </Button>
              </div>
            )}

            {/* Skeleton Loading */}
            {isSummaryLoading && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 border border-slate-200/80 dark:border-slate-800 space-y-4">
                <Skeleton className="h-6 w-64" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            )}

            {/* General Ledger Summary Paper Table */}
            {!isSummaryLoading && !isSummaryError && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs p-6 md:p-8 fin-gl-paper">
                {/* Paper Header */}
                <div className="text-center pb-6 border-b border-slate-200/80 dark:border-slate-800 space-y-1">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {companyLegalName}
                  </div>
                  <h1 className="text-2xl font-bold text-[#111111] dark:text-slate-100">
                    General Ledger Summary
                  </h1>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {formatDate(dateFrom)} to {formatDate(dateTo)} · Amounts in SAR
                  </div>
                </div>

                {/* Accounts Table by Type */}
                <div className="overflow-x-auto pt-4">
                  <table className="w-full text-left text-xs border-collapse min-w-[720px]">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-[#757583] dark:text-slate-400">
                        <th className="py-2.5 px-3">Account</th>
                        <th className="py-2.5 px-3 text-right w-36">Opening Balance</th>
                        <th className="py-2.5 px-3 text-right w-36">Debit (SAR)</th>
                        <th className="py-2.5 px-3 text-right w-36">Credit (SAR)</th>
                        <th className="py-2.5 px-3 text-right w-40">Closing Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {summaryGrouped.map((typeGroup) => (
                        <React.Fragment key={typeGroup.type}>
                          {/* Type Section Header */}
                          <tr className="bg-slate-50/80 dark:bg-slate-800/40">
                            <td colSpan={5} className="py-2.5 px-3 font-bold text-slate-900 dark:text-slate-100 text-xs uppercase tracking-wider">
                              {typeGroup.type}s
                            </td>
                          </tr>

                          {/* Parent Group Rows & Items */}
                          {Array.from(typeGroup.parents.entries()).map(([parentKey, pg]) => {
                            const isCollapsed = collapsedSummaryGroups[`${typeGroup.type}-${parentKey}`];

                            return (
                              <React.Fragment key={parentKey}>
                                {/* Parent Group Sub-Header */}
                                <tr
                                  onClick={() => toggleSummaryGroup(`${typeGroup.type}-${parentKey}`)}
                                  className="hover:bg-slate-50 dark:hover:bg-slate-800/30 cursor-pointer select-none font-semibold text-slate-800 dark:text-slate-200"
                                >
                                  <td className="py-2 px-3 flex items-center gap-1.5">
                                    {isCollapsed ? (
                                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                    ) : (
                                      <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                    )}
                                    {pg.parentCode && customize.showAccountCodes && (
                                      <span className="font-mono text-slate-500 mr-1.5">{pg.parentCode}</span>
                                    )}
                                    <span>{pg.parentName}</span>
                                    <span className="text-[11px] font-normal text-slate-400 ml-2">({pg.items.length})</span>
                                  </td>
                                  <td className="py-2 px-3 text-right font-mono text-slate-400">—</td>
                                  <td className="py-2 px-3 text-right font-mono text-slate-700 dark:text-slate-300">
                                    {fmtVal(pg.subtotalDebit)}
                                  </td>
                                  <td className="py-2 px-3 text-right font-mono text-slate-700 dark:text-slate-300">
                                    {fmtVal(pg.subtotalCredit)}
                                  </td>
                                  <td className="py-2 px-3 text-right font-mono text-slate-400">—</td>
                                </tr>

                                {/* Child Account Rows */}
                                {!isCollapsed &&
                                  pg.items.map((accItem) => (
                                    <tr
                                      key={accItem.account_id}
                                      onClick={() => {
                                        updateParams({ account_id: accItem.account_id, view: 'account', page: 1 });
                                      }}
                                      className="hover:bg-orange-50/40 dark:hover:bg-slate-800/50 cursor-pointer transition-colors group"
                                    >
                                      <td className="py-2 px-3 pl-8">
                                        <div className="flex items-center gap-2">
                                          {customize.showAccountCodes && (
                                            <span className="font-mono text-slate-500 dark:text-slate-400 font-medium w-16 shrink-0">
                                              {accItem.code}
                                            </span>
                                          )}
                                          <span className="font-medium text-slate-900 dark:text-slate-100 group-hover:text-[#FA634E] transition-colors">
                                            {accItem.name}
                                          </span>
                                        </div>
                                      </td>
                                      <td className="py-2 px-3 text-right font-mono text-slate-600 dark:text-slate-400">
                                        {fmtBalance(accItem.opening.signed, accItem.opening.side)}
                                      </td>
                                      <td className="py-2 px-3 text-right font-mono text-slate-900 dark:text-slate-100">
                                        {accItem.period_debit > 0 ? fmtVal(accItem.period_debit) : '—'}
                                      </td>
                                      <td className="py-2 px-3 text-right font-mono text-slate-900 dark:text-slate-100">
                                        {accItem.period_credit > 0 ? fmtVal(accItem.period_credit) : '—'}
                                      </td>
                                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                                        {fmtBalance(accItem.closing.signed, accItem.closing.side)}
                                      </td>
                                    </tr>
                                  ))}
                              </React.Fragment>
                            );
                          })}
                        </React.Fragment>
                      ))}
                    </tbody>

                    {/* Summary Footer Row */}
                    <tfoot>
                      <tr className="border-t-2 border-slate-900 dark:border-slate-100 font-bold text-slate-900 dark:text-slate-100 text-sm bg-slate-50/60 dark:bg-slate-800/60">
                        <td className="py-3.5 px-3">
                          <div className="flex items-center gap-3">
                            <span>Grand Total</span>
                            {summaryRes?.data?.is_balanced ? (
                              <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-none font-bold text-[10.5px]">
                                ✓ balanced
                              </Badge>
                            ) : (
                              <Badge className="bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-none font-bold text-[10.5px]">
                                Out by {fmtVal(Math.abs((summaryRes?.data?.total_debit || 0) - (summaryRes?.data?.total_credit || 0)))}
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono text-slate-400">—</td>
                        <td className="py-3.5 px-3 text-right font-mono text-[#FA634E] text-base">
                          {fmtVal(summaryRes?.data?.total_debit || 0)}
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono text-[#FA634E] text-base">
                          {fmtVal(summaryRes?.data?.total_credit || 0)}
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono text-slate-400">—</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── VIEW 2: ACCOUNT LEDGER (Tally Ledger Vouchers) ───────────────────── */}
        {viewParam === 'account' && (
          <div className="space-y-4 max-w-[1240px] mx-auto">
            {/* Account Combobox & Stepper Header Strip */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
              {/* Account Picker Combobox */}
              <div className="flex items-center gap-2">
                <Popover open={isAccountPickerOpen} onOpenChange={setIsAccountPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={isAccountPickerOpen}
                      className="w-[320px] justify-between h-9 text-xs bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 font-semibold"
                    >
                      {currentAccount ? (
                        <div className="flex items-center gap-2 truncate">
                          {customize.showAccountCodes && (
                            <span className="font-mono text-slate-500 font-semibold">{currentAccount.account_code}</span>
                          )}
                          <span className="truncate">{currentAccount.name}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400">Select an account…</span>
                      )}
                      <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[340px] p-0" align="start">
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
                                    <span className="font-mono text-slate-500 font-semibold">{acc.account_code}</span>
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

                {/* Tally Account Stepper Buttons */}
                <div className="flex items-center gap-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => stepAccount(-1)}
                          disabled={allAccounts.length === 0}
                          className="h-9 w-9 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">Previous Account (Alt + ←)</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => stepAccount(1)}
                          disabled={allAccounts.length === 0}
                          className="h-9 w-9 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">Next Account (Alt + →)</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>

              {/* Slim Info Strip & Sparkline */}
              {currentAccount && (
                <div className="flex items-center gap-4 text-xs">
                  <Badge variant="outline" className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold border-slate-200">
                    {currentAccount.account_type}
                  </Badge>

                  {/* Bank/Cash Account Link HoverCard */}
                  {bankAccount && (
                    <HoverCard>
                      <HoverCardTrigger asChild>
                        <Link
                          to={`/finance/bank-accounts/${bankAccount.id}`}
                          className="flex items-center gap-1 text-[#FA634E] hover:underline font-semibold"
                        >
                          <Building2 className="w-3.5 h-3.5" />
                          <span>Bank details →</span>
                        </Link>
                      </HoverCardTrigger>
                      <HoverCardContent className="w-64 space-y-2 p-3 text-xs">
                        <div className="font-bold text-slate-900 dark:text-slate-100">{bankAccount.bank_name || 'Bank Account'}</div>
                        <div className="text-slate-500 font-mono">IBAN: {bankAccount.iban || '—'}</div>
                        <div className="text-slate-500">Acc No: {bankAccount.account_number || '—'}</div>
                        <Link
                          to={`/finance/bank-accounts/${bankAccount.id}`}
                          className="inline-block pt-1 text-[#FA634E] font-bold hover:underline"
                        >
                          View Bank Dashboard →
                        </Link>
                      </HoverCardContent>
                    </HoverCard>
                  )}

                  {/* Sparkline for range balance trend */}
                  {monthlyRes?.data?.items && monthlyRes.data.items.length > 1 && (
                    <div className="hidden sm:flex items-center gap-2">
                      <span className="text-[11px] text-slate-400">Balance trend:</span>
                      <div className="w-24 h-7">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={monthlyRes.data.items}>
                            <Area type="monotone" dataKey="closing.signed" stroke="#FA634E" fill="#FA634E" fillOpacity={0.15} strokeWidth={2} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Empty state if no account picked */}
            {!accountId && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                  <ArrowLeftRight className="w-6 h-6 text-[#FA634E]" />
                </div>
                <div className="text-sm font-bold text-slate-900 dark:text-slate-100">Choose an account to see its ledger</div>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  Select an account from the combobox above to view detailed ledger vouchers, contra lines, running balances, and voucher previews.
                </p>
              </div>
            )}

            {/* Error State */}
            {accountId && isGlError && (
              <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-2xl p-6 text-center space-y-3">
                <div className="text-rose-700 dark:text-rose-300 font-bold text-sm">Failed to load General Ledger Vouchers</div>
                <Button size="sm" variant="outline" onClick={() => refetchGl()} className="h-8 text-xs gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry</span>
                </Button>
              </div>
            )}

            {/* Loading State */}
            {accountId && isGlLoading && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 border border-slate-200/80 dark:border-slate-800 space-y-4">
                <Skeleton className="h-6 w-64" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            )}

            {/* Account Ledger Tally Statement Paper Card */}
            {accountId && !isGlLoading && !isGlError && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs p-6 md:p-8 fin-gl-paper space-y-4">
                {/* Statement Paper Header */}
                <div className="text-center pb-4 border-b border-slate-200/80 dark:border-slate-800 space-y-1">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {companyLegalName}
                  </div>
                  <h1 className="text-xl font-bold text-[#111111] dark:text-slate-100 flex items-center justify-center gap-2">
                    <span>Ledger:</span>
                    {customize.showAccountCodes && <span className="font-mono text-slate-600">{currentAccount?.account_code}</span>}
                    <span>·</span>
                    <span>{currentAccount?.name}</span>
                  </h1>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {formatDate(dateFrom)} to {formatDate(dateTo)} · Amounts in SAR
                  </div>
                </div>

                {/* Filter Row inside Card */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-800 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Search Filter */}
                    <div className="relative w-48">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                      <Input
                        placeholder="Search ref, memo..."
                        value={searchFilter}
                        onChange={(e) => updateParams({ search: e.target.value, page: 1 })}
                        className="h-8 pl-8 text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
                      />
                    </div>

                    {/* Side Filter ToggleGroup */}
                    <ToggleGroup
                      value={[sideFilter]}
                      onValueChange={(val: string[]) => val[0] && updateParams({ side: val[0], page: 1 })}
                      className="bg-white dark:bg-slate-900 p-0.5 border border-slate-200 dark:border-slate-700 rounded-lg"
                    >
                      <ToggleGroupItem value="all" className="h-7 text-[11px] px-2.5">
                        All
                      </ToggleGroupItem>
                      <ToggleGroupItem value="debit" className="h-7 text-[11px] px-2.5">
                        Debit
                      </ToggleGroupItem>
                      <ToggleGroupItem value="credit" className="h-7 text-[11px] px-2.5">
                        Credit
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </div>

                  <div className="text-[11px] text-slate-500">
                    Press <kbd className="px-1 py-0.5 bg-slate-200 dark:bg-slate-700 rounded font-mono">↑</kbd> <kbd className="px-1 py-0.5 bg-slate-200 dark:bg-slate-700 rounded font-mono">↓</kbd> to select row, <kbd className="px-1 py-0.5 bg-slate-200 dark:bg-slate-700 rounded font-mono">Enter</kbd> to view JE preview
                  </div>
                </div>

                {/* Paper Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse min-w-[780px]">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-[#757583] dark:text-slate-400">
                        <th className="py-2.5 px-3 w-28">Date</th>
                        <th className="py-2.5 px-3">Particulars</th>
                        {customize.showVoucherType && <th className="py-2.5 px-3 w-32">Vch Type</th>}
                        <th className="py-2.5 px-3 w-36">Vch No.</th>
                        <th className="py-2.5 px-3 text-right w-32">Debit (SAR)</th>
                        <th className="py-2.5 px-3 text-right w-32">Credit (SAR)</th>
                        <th className="py-2.5 px-3 text-right w-36">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {/* Row 1: Opening Balance */}
                      <tr className="bg-slate-50/70 dark:bg-slate-800/40 font-medium text-slate-700 dark:text-slate-300">
                        <td className="py-2.5 px-3 font-mono text-[11.5px] text-slate-500">
                          {dateFrom ? formatDate(dateFrom) : 'Beginning'}
                        </td>
                        <td className="py-2.5 px-3 italic font-semibold text-slate-800 dark:text-slate-200">
                          Opening Balance
                        </td>
                        {customize.showVoucherType && <td className="py-2.5 px-3 text-slate-400">—</td>}
                        <td className="py-2.5 px-3 text-slate-400 font-mono">—</td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          {glData?.opening_balance_side === 'Dr' ? fmtVal(glData.opening_balance) : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          {glData?.opening_balance_side === 'Cr' ? fmtVal(glData.opening_balance) : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                          {fmtBalance(glData?.opening_balance || 0, (glData?.opening_balance_side as 'Dr'|'Cr') || 'Dr')}
                        </td>
                      </tr>

                      {/* Empty state inside paper */}
                      {lines.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-400 italic">
                            No transactions found for this account in the selected period.
                          </td>
                        </tr>
                      )}

                      {/* Transaction Voucher Lines */}
                      {lines.map((line, idx) => {
                        const isSelected = selectedIndex === idx;

                        // Contra Particulars calculation (Tally convention)
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
                                  ? 'bg-[#FFF4F2] dark:bg-slate-800'
                                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                              } ${line.journal_entry_status === 'Voided' ? 'opacity-60 text-slate-400' : ''}`}
                            >
                              <td className="py-2.5 px-3 font-mono text-[11.5px] text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                {formatDate(line.entry_date)}
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
                                    <span>{particularsStr}</span>
                                    {hasMultipleContra && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleDetailExpansion(line.line_id);
                                        }}
                                        className="p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                                      >
                                        {isDetailExpanded ? (
                                          <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                                        ) : (
                                          <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                                        )}
                                      </button>
                                    )}
                                  </div>

                                  {/* Optional Narration */}
                                  {customize.showNarration && (line.memo || line.description) && (
                                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-normal italic">
                                      {line.memo || line.description}
                                    </div>
                                  )}
                                </div>
                              </td>
                              {customize.showVoucherType && (
                                <td className="py-2.5 px-3">
                                  {renderSourceBadge(line.source_type, line.source_id)}
                                </td>
                              )}
                              <td className="py-2.5 px-3 font-mono text-[11.5px]">
                                <Link
                                  to={`/finance/journal-entries/${line.journal_entry_id}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-[#FA634E] font-semibold hover:underline"
                                >
                                  {line.ref_id || 'JE-Details'}
                                </Link>
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-slate-900 dark:text-slate-100">
                                {line.debit > 0 ? fmtVal(line.debit) : '—'}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-slate-900 dark:text-slate-100">
                                {line.credit > 0 ? fmtVal(line.credit) : '—'}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900 dark:text-slate-100">
                                {fmtBalance(line.signed_balance, line.balance_side)}
                              </td>
                            </tr>

                            {/* Expanded Contra Lines Breakdown Table */}
                            {hasMultipleContra && isDetailExpanded && (
                              <tr className="bg-slate-50/90 dark:bg-slate-800/80">
                                <td colSpan={customize.showVoucherType ? 7 : 6} className="py-2 px-6">
                                  <div className="pl-6 border-l-2 border-[#FA634E] space-y-1 py-1">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                      Contra Breakdown Details:
                                    </div>
                                    <div className="space-y-1">
                                      {line.contra.map((cl, cIdx) => (
                                        <div key={cIdx} className="flex items-center justify-between text-[11px] font-mono">
                                          <div className="flex items-center gap-2">
                                            <span className="text-slate-400">{cl.account_code}</span>
                                            <span className="text-slate-800 dark:text-slate-200">{cl.name}</span>
                                          </div>
                                          <div className="font-semibold text-slate-900 dark:text-slate-100">
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
                    </tbody>

                    {/* Statement Footers */}
                    <tfoot>
                      {/* Current Total Row */}
                      <tr className="border-t border-slate-300 dark:border-slate-700 font-bold text-slate-900 dark:text-slate-100">
                        <td colSpan={customize.showVoucherType ? 4 : 3} className="py-3 px-3">
                          Current Total
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-900 dark:text-slate-100">
                          {fmtVal(currentTotalDebit)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-900 dark:text-slate-100">
                          {fmtVal(currentTotalCredit)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-400">—</td>
                      </tr>

                      {/* Closing Balance Row */}
                      <tr className="border-b-4 border-double border-slate-900 dark:border-slate-100 font-bold text-slate-900 dark:text-slate-100 text-sm bg-slate-50/60 dark:bg-slate-800/60">
                        <td colSpan={customize.showVoucherType ? 4 : 3} className="py-3.5 px-3">
                          Closing Balance
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono">
                          {closingSide === 'Dr' ? fmtVal(closingBalance) : '—'}
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono">
                          {closingSide === 'Cr' ? fmtVal(closingBalance) : '—'}
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono text-[#FA634E] text-base">
                          {fmtBalance(closingBalance, closingSide as 'Dr'|'Cr')}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Server-side Pagination Load More */}
                {glData?.pagination && glData.pagination.total_pages > pageParam && (
                  <div className="pt-3 text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateParams({ page: pageParam + 1 })}
                      className="h-8 text-xs font-semibold rounded-xl"
                    >
                      Load More Transactions ({lines.length} of {glData.count})
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── VIEW 3: MONTHLY SUMMARY (Tally Style) ────────────────────────────── */}
        {viewParam === 'monthly' && (
          <div className="space-y-6 max-w-[1240px] mx-auto">
            {/* Header info */}
            <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-2xs flex items-center justify-between">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Monthly Breakdown: <strong className="text-slate-900 dark:text-slate-100">{currentAccount?.name || 'Selected Account'}</strong>
              </div>
            </div>

            {/* Monthly Bar + Line Chart */}
            {monthlyRes?.data?.items && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-6 space-y-3">
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
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
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs p-6 md:p-8 fin-gl-paper">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-[#757583] dark:text-slate-400">
                      <th className="py-2.5 px-3">Month</th>
                      <th className="py-2.5 px-3 text-right w-36">Debit (SAR)</th>
                      <th className="py-2.5 px-3 text-right w-36">Credit (SAR)</th>
                      <th className="py-2.5 px-3 text-right w-44">Closing Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
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
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer font-medium"
                      >
                        <td className="py-3 px-3 font-semibold text-slate-900 dark:text-slate-100">
                          {m.month}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-900 dark:text-slate-100">
                          {m.debit > 0 ? fmtVal(m.debit) : '—'}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-900 dark:text-slate-100">
                          {m.credit > 0 ? fmtVal(m.credit) : '—'}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                          {fmtBalance(m.closing.signed, m.closing.side)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-900 dark:border-slate-100 font-bold text-slate-900 dark:text-slate-100 text-sm">
                      <td className="py-3.5 px-3">Total</td>
                      <td className="py-3.5 px-3 text-right font-mono text-[#FA634E]">
                        {fmtVal(monthlyRes?.data?.total_debit || 0)}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono text-[#FA634E]">
                        {fmtVal(monthlyRes?.data?.total_credit || 0)}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono text-slate-400">—</td>
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
              <SheetTitle className="text-base font-bold">Customize General Ledger</SheetTitle>
              <SheetDescription className="text-xs">
                Adjust viewing parameters, formats, and voucher groupings.
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-5 text-xs pt-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-900 dark:text-slate-100">Show Narration</div>
                  <div className="text-[11px] text-slate-500">Display entry memo & description under particulars</div>
                </div>
                <Switch
                  checked={customize.showNarration}
                  onCheckedChange={(val) => setCustomize((prev) => ({ ...prev, showNarration: val }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-900 dark:text-slate-100">Show Voucher Type</div>
                  <div className="text-[11px] text-slate-500">Display source badge column</div>
                </div>
                <Switch
                  checked={customize.showVoucherType}
                  onCheckedChange={(val) => setCustomize((prev) => ({ ...prev, showVoucherType: val }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-900 dark:text-slate-100">Hide Voided Pairs</div>
                  <div className="text-[11px] text-slate-500">Hide voided entries and their reversing pairs</div>
                </div>
                <Switch
                  checked={customize.hideVoidedPairs}
                  onCheckedChange={(val) => setCustomize((prev) => ({ ...prev, hideVoidedPairs: val }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-900 dark:text-slate-100">Show Account Codes</div>
                  <div className="text-[11px] text-slate-500">Include account code next to account name</div>
                </div>
                <Switch
                  checked={customize.showAccountCodes}
                  onCheckedChange={(val) => setCustomize((prev) => ({ ...prev, showAccountCodes: val }))}
                />
              </div>

              <div className="space-y-2 pt-2 border-t">
                <div className="font-semibold text-slate-900 dark:text-slate-100">Negative Format</div>
                <Select
                  value={customize.negativeFormat}
                  onValueChange={(val: 'minus' | 'parentheses') =>
                    setCustomize((prev) => ({ ...prev, negativeFormat: val }))
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minus">-1,234.00 (Standard minus)</SelectItem>
                    <SelectItem value="parentheses">(1,234.00) (Accounting parentheses)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 pt-2 border-t">
                <div className="font-semibold text-slate-900 dark:text-slate-100">Balance Style</div>
                <Select
                  value={customize.balanceStyle}
                  onValueChange={(val: 'dr_cr' | 'signed') =>
                    setCustomize((prev) => ({ ...prev, balanceStyle: val }))
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
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
              <SheetTitle className="text-base font-bold flex items-center justify-between">
                <span>Voucher Preview</span>
                {previewJe?.ref_id && (
                  <Badge variant="outline" className="font-mono text-xs">
                    {previewJe.ref_id}
                  </Badge>
                )}
              </SheetTitle>
              <SheetDescription className="text-xs">
                Journal Entry details and line postings.
              </SheetDescription>
            </SheetHeader>

            {previewJe ? (
              <div className="space-y-5 text-xs">
                {/* Meta Card */}
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-slate-400 block font-medium">Entry Date</span>
                    <span className="font-bold text-slate-900 dark:text-slate-100 font-mono">
                      {formatDate(previewJe.entry_date)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Status</span>
                    <StatusPill kind="journal" status={previewJe.status} />
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Source</span>
                    <span>{renderSourceBadge(previewJe.source_type, previewJe.source_id)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Period</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {previewJe.period?.name || '—'}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-400 block font-medium">Memo / Reference</span>
                    <span className="text-slate-900 dark:text-slate-100 font-medium">
                      {previewJe.memo || '—'}
                    </span>
                  </div>
                </div>

                {/* Journal Lines Table Component */}
                <div>
                  <div className="font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider mb-2">
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
                    className="w-full bg-[#FA634E] hover:bg-[#E54D38] text-white font-semibold h-9 text-xs gap-1.5"
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

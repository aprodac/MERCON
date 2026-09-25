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
  type GeneralLedgerData,
  type GeneralLedgerLineItem,
  type GeneralLedgerSummaryData,
  type GeneralLedgerSummaryItem,
  type GeneralLedgerMonthlyData,
  type GeneralLedgerMonthlyItem,
} from '@/services/financeService';
import type { Account, JournalEntry } from '@mercon/shared-types';
import { formatMoney, formatDate } from '@/lib/finance/format';
import { resolvePeriodPreset, type PeriodPreset } from '@/lib/finance/pnlPeriodHelpers';
import { SOURCE_CONFIG, renderSourceBadge } from '@/lib/finance/sourceConfig';
import { JournalLinesTable, StatusPill } from '@/components/finance/kit';

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
    <DashboardLayout active="finance" title="General Ledger" fixedViewport>
      <div className="p-4 flex flex-col flex-1 min-h-0 gap-3 overflow-hidden h-full max-md:overflow-y-auto max-md:h-auto max-w-[1400px] mx-auto w-full print:p-0 print:m-0 print:max-w-none">
        {/* ── Toolbar Row (DESIGN.md §4.0a / AdvancesPage style) ─────────────────── */}
        <div className="border-b border-border pb-2.5 flex flex-col md:flex-row md:items-center justify-between gap-3 print:hidden">
          {/* Left Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* View Selector Tabs */}
            <ToggleGroup
              value={[viewParam]}
              onValueChange={(val: string[]) => val[0] && updateParams({ view: val[0] })}
              className="bg-muted p-[3px] rounded-lg border border-border/60"
            >
              <ToggleGroupItem
                value="summary"
                className="h-7 text-xs font-medium px-3 rounded-md data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-xs"
              >
                <LayoutList className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                <span>Ledger summary</span>
              </ToggleGroupItem>
              <ToggleGroupItem
                value="account"
                className="h-7 text-xs font-medium px-3 rounded-md data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-xs"
              >
                <BookOpenText className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                <span>Account ledger</span>
              </ToggleGroupItem>
              <ToggleGroupItem
                value="monthly"
                className="h-7 text-xs font-medium px-3 rounded-md data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-xs"
              >
                <CalendarRange className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                <span>Monthly summary</span>
              </ToggleGroupItem>
            </ToggleGroup>

            {/* Period Preset Select */}
            <Select value={periodPreset} onValueChange={(val) => handlePeriodPresetChange(val as PeriodPreset)}>
              <SelectTrigger className="h-8 text-xs w-[140px] rounded-md bg-background border-border font-medium text-foreground">
                <SelectValue placeholder="Period" />
              </SelectTrigger>
              <SelectContent className="text-xs font-medium">
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
                  <Button variant="outline" size="sm" className="h-8 text-xs rounded-md bg-background border-border gap-1.5 font-medium">
                    <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>Select Dates</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-3 bg-card border-border" align="start">
                  <div className="space-y-3">
                    <div className="text-xs font-semibold text-foreground">Custom Date Range</div>
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => handleCustomRangeChange(e.target.value, dateTo)}
                        className="h-8 text-xs p-1.5 border rounded-md bg-background border-border text-foreground"
                      />
                      <span className="text-xs text-muted-foreground">to</span>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => handleCustomRangeChange(dateFrom, e.target.value)}
                        className="h-8 text-xs p-1.5 border rounded-md bg-background border-border text-foreground"
                      />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            )}

            {/* Resolved Date Range Chip */}
            <div className="bg-muted px-2.5 py-1 rounded-md text-xs font-medium text-muted-foreground flex items-center gap-1.5 fin-num">
              <span>{formatDate(dateFrom)} – {formatDate(dateTo)}</span>
            </div>
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

        {/* ── VIEW 1: LEDGER SUMMARY (Zoho GL) ─────────────────────────────────── */}
        {viewParam === 'summary' && (
          <div className="space-y-4 max-w-[1240px] mx-auto">
            {/* Header / Activity Toggle Card */}
            <div className="flex items-center justify-between p-3.5 bg-card rounded-xl border border-border shadow-xs">
              <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                <span>Summary of all accounts</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">{summaryRes?.data?.items.length || 0} active accounts</span>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="show-zero-accs"
                  checked={customize.showZeroBalance}
                  onCheckedChange={(checked) => setCustomize((prev) => ({ ...prev, showZeroBalance: checked }))}
                />
                <label htmlFor="show-zero-accs" className="text-xs font-medium text-foreground cursor-pointer select-none">
                  Show accounts with no activity
                </label>
              </div>
            </div>

            {/* Error State */}
            {isSummaryError && (
              <div className="bg-rose-500/10 border border-rose-600/20 rounded-xl p-4 text-rose-700 dark:text-rose-300 text-xs font-medium flex items-center justify-between">
                <span>Failed to load General Ledger Summary</span>
                <Button size="sm" variant="outline" onClick={() => refetchSummary()} className="h-7 text-xs gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry</span>
                </Button>
              </div>
            )}

            {/* Skeleton Loading */}
            {isSummaryLoading && (
              <div className="bg-card rounded-xl p-8 border border-border space-y-4 shadow-xs">
                <Skeleton className="h-6 w-64" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            )}

            {/* General Ledger Summary Paper Table */}
            {!isSummaryLoading && !isSummaryError && (
              <div className="bg-card rounded-xl border border-border shadow-xs p-6 md:p-8">
                {/* Paper Header */}
                <div className="text-center pb-6 border-b border-border space-y-1">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {companyLegalName}
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight text-foreground">
                    General Ledger Summary
                  </h1>
                  <div className="text-xs text-muted-foreground fin-num">
                    {formatDate(dateFrom)} to {formatDate(dateTo)} · Amounts in SAR
                  </div>
                </div>

                {/* Accounts Table by Type */}
                <div className="overflow-x-auto pt-4">
                  <table className="w-full text-left text-xs border-collapse min-w-[720px]">
                    <thead>
                      <tr className="border-b border-border text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        <th className="py-2.5 px-3">Account</th>
                        <th className="py-2.5 px-3 text-right w-36">Opening balance</th>
                        <th className="py-2.5 px-3 text-right w-36">Debit (SAR)</th>
                        <th className="py-2.5 px-3 text-right w-36">Credit (SAR)</th>
                        <th className="py-2.5 px-3 text-right w-40">Closing balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {summaryGrouped.map((typeGroup) => (
                        <React.Fragment key={typeGroup.type}>
                          {/* Type Section Header */}
                          <tr className="bg-muted/40">
                            <td colSpan={5} className="py-2.5 px-3 font-semibold text-foreground text-xs">
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
                                  className="hover:bg-muted/50 cursor-pointer select-none font-medium text-foreground"
                                >
                                  <td className="py-2 px-3 flex items-center gap-1.5">
                                    {isCollapsed ? (
                                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                    ) : (
                                      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                    )}
                                    {pg.parentCode && customize.showAccountCodes && (
                                      <span className="fin-num text-muted-foreground mr-1.5">{pg.parentCode}</span>
                                    )}
                                    <span>{pg.parentName}</span>
                                    <span className="text-[11px] font-normal text-muted-foreground ml-2">({pg.items.length})</span>
                                  </td>
                                  <td className="py-2 px-3 text-right fin-num text-muted-foreground">—</td>
                                  <td className="py-2 px-3 text-right fin-num text-foreground">
                                    {fmtVal(pg.subtotalDebit)}
                                  </td>
                                  <td className="py-2 px-3 text-right fin-num text-foreground">
                                    {fmtVal(pg.subtotalCredit)}
                                  </td>
                                  <td className="py-2 px-3 text-right fin-num text-muted-foreground">—</td>
                                </tr>

                                {/* Child Account Rows */}
                                {!isCollapsed &&
                                  pg.items.map((accItem) => (
                                    <tr
                                      key={accItem.account_id}
                                      onClick={() => {
                                        updateParams({ account_id: accItem.account_id, view: 'account', page: 1 });
                                      }}
                                      className="hover:bg-muted/50 cursor-pointer transition-colors group"
                                    >
                                      <td className="py-2 px-3 pl-8">
                                        <div className="flex items-center gap-2">
                                          {customize.showAccountCodes && (
                                            <span className="w-12 text-muted-foreground fin-num text-xs">
                                              {accItem.code}
                                            </span>
                                          )}
                                          <span className="font-normal text-foreground group-hover:text-[#FA634E] transition-colors">
                                            {accItem.name}
                                          </span>
                                        </div>
                                      </td>
                                      <td className="py-2 px-3 text-right fin-num text-muted-foreground">
                                        {fmtBalance(accItem.opening.signed, accItem.opening.side)}
                                      </td>
                                      <td className="py-2 px-3 text-right fin-num text-foreground">
                                        {accItem.period_debit > 0 ? fmtVal(accItem.period_debit) : '—'}
                                      </td>
                                      <td className="py-2 px-3 text-right fin-num text-foreground">
                                        {accItem.period_credit > 0 ? fmtVal(accItem.period_credit) : '—'}
                                      </td>
                                      <td className="py-2 px-3 text-right fin-num font-medium text-foreground">
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
                      <tr className="border-t border-foreground/70 border-b-[3px] border-double font-semibold text-foreground text-sm">
                        <td className="py-3.5 px-3">
                          <div className="flex items-center gap-3">
                            <span>Grand total</span>
                            {summaryRes?.data?.is_balanced ? (
                              <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20">
                                ✓ balanced
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-600/20">
                                Out by {fmtVal(Math.abs((summaryRes?.data?.total_debit || 0) - (summaryRes?.data?.total_credit || 0)))}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-3 text-right fin-num text-muted-foreground">—</td>
                        <td className="py-3.5 px-3 text-right fin-num text-foreground">
                          {fmtVal(summaryRes?.data?.total_debit || 0)}
                        </td>
                        <td className="py-3.5 px-3 text-right fin-num text-foreground">
                          {fmtVal(summaryRes?.data?.total_credit || 0)}
                        </td>
                        <td className="py-3.5 px-3 text-right fin-num text-muted-foreground">—</td>
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
          <div className="flex flex-col flex-1 min-h-0 gap-3 w-full">
            {/* Empty state if no account picked */}
            {!accountId && (
              <div className="bg-card rounded-xl border border-border p-12 text-center space-y-3 shadow-xs">
                <div className="w-12 h-12 rounded-full bg-muted text-muted-foreground flex items-center justify-center mx-auto">
                  <ArrowLeftRight className="w-6 h-6 text-[#FA634E]" />
                </div>
                <div className="text-sm font-semibold text-foreground">Choose an account to see its ledger</div>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  Select an account from the combobox above to view detailed ledger vouchers, contra lines, running balances, and voucher previews.
                </p>
              </div>
            )}

            {/* Error State */}
            {accountId && isGlError && (
              <div className="bg-rose-500/10 border border-rose-600/20 rounded-xl p-4 text-rose-700 dark:text-rose-300 text-xs font-medium flex items-center justify-between">
                <span>Failed to load General Ledger Vouchers</span>
                <Button size="sm" variant="outline" onClick={() => refetchGl()} className="h-7 text-xs gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry</span>
                </Button>
              </div>
            )}

            {/* Loading State */}
            {accountId && isGlLoading && (
              <div className="bg-card rounded-xl p-8 border border-border space-y-4 shadow-xs">
                <Skeleton className="h-6 w-64" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            )}

            {/* Account Ledger Card */}
            {accountId && !isGlLoading && !isGlError && (
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
                      <ToggleGroupItem value="all" className="h-7 text-xs font-medium px-2.5 rounded-md data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-xs">
                        All
                      </ToggleGroupItem>
                      <ToggleGroupItem value="debit" className="h-7 text-xs font-medium px-2.5 rounded-md data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-xs">
                        Debit
                      </ToggleGroupItem>
                      <ToggleGroupItem value="credit" className="h-7 text-xs font-medium px-2.5 rounded-md data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-xs">
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
                        <th className="py-2.5 px-3 text-right w-32">Debit</th>
                        <th className="py-2.5 px-3 text-right w-32">Credit</th>
                        <th className="py-2.5 px-3 text-right w-36">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
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
                        <td className="py-2 px-3 text-right font-mono text-xs">
                          {glData?.opening_balance_side === 'Dr' ? fmtVal(glData.opening_balance) : '—'}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-xs">
                          {glData?.opening_balance_side === 'Cr' ? fmtVal(glData.opening_balance) : '—'}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-xs font-semibold text-foreground">
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
                              <td className="py-2 px-3 text-right font-mono text-xs text-foreground">
                                {line.debit > 0 ? fmtVal(line.debit) : '—'}
                              </td>
                              <td className="py-2 px-3 text-right font-mono text-xs text-foreground">
                                {line.credit > 0 ? fmtVal(line.credit) : '—'}
                              </td>
                              <td className="py-2 px-3 text-right font-mono text-xs font-medium text-foreground">
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
            )}
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
              <div className="overflow-x-auto">
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

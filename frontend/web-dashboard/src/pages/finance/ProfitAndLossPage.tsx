import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueries } from '@tanstack/react-query';
import {
  FileText,
  BarChart3,
  Download,
  Printer,
  SlidersHorizontal,
  Settings2,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Calendar as CalendarIcon,
  RefreshCw,
} from 'lucide-react';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import ExportModal, { type ExportColumn } from '@/components/ui/ExportModal';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

import { financeService, type ReportLineItem } from '@/services/financeService';
import { formatMoney, formatDate, formatPct } from '@/lib/finance/format';
import { varianceTone } from '@/lib/finance/variance';
import {
  buildStructuredVerticalPnl,
  buildStructuredTFormatPnl,
  getDefaultPnlClass,
  PNL_CLASS_LABELS,
  type PnlClass,
  type PnlGroupRow,
  type PnlSection,
  type StructuredVerticalPnl,
} from '@/lib/finance/pnlStructure';
import {
  resolvePeriodPreset,
  resolveCompareColumns,
  type PeriodPreset,
  type CompareOption,
  type CompareColumnMeta,
} from '@/lib/finance/pnlPeriodHelpers';

const CUSTOMIZE_STORAGE_KEY = 'mercon_pnl_customize_v1';
const SETUP_STORAGE_KEY = 'mercon_pnl_classification_v1';

interface CustomizeSettings {
  showAccountCodes: boolean;
  showZeroBalance: boolean;
  showPctOfRevenue: boolean;
  expandAllByDefault: boolean;
  negativeFormat: 'minus' | 'parentheses';
}

const DEFAULT_CUSTOMIZE: CustomizeSettings = {
  showAccountCodes: true,
  showZeroBalance: false,
  showPctOfRevenue: false,
  expandAllByDefault: true,
  negativeFormat: 'minus',
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

function loadClassifications(): Record<string, PnlClass> {
  try {
    const raw = localStorage.getItem(SETUP_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  return {};
}

function saveClassifications(data: Record<string, PnlClass>) {
  try {
    localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

export default function ProfitAndLossPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL state
  const activeTab = (searchParams.get('tab') as 'statement' | 'analysis') || 'statement';
  const periodPreset = (searchParams.get('preset') as PeriodPreset) || 'this_quarter';
  const layout = (searchParams.get('layout') as 'vertical' | 'tformat') || 'vertical';
  const compareOpt = (searchParams.get('compare') as CompareOption) || 'none';

  // Resolved range state
  const defaultDates = useMemo(() => resolvePeriodPreset(periodPreset), [periodPreset]);
  const dateFrom = searchParams.get('date_from') || defaultDates.from;
  const dateTo = searchParams.get('date_to') || defaultDates.to;

  // Local settings & sheets
  const [customize, setCustomize] = useState<CustomizeSettings>(loadCustomizeSettings);
  const [classifications, setClassifications] = useState<Record<string, PnlClass>>(loadClassifications);
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);

  // Group expansion state
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Sync customize changes to localStorage
  useEffect(() => {
    saveCustomizeSettings(customize);
  }, [customize]);

  // Sync classification changes to localStorage
  useEffect(() => {
    saveClassifications(classifications);
  }, [classifications]);

  // Helper to update URL params
  const updateParams = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([k, v]) => {
      if (v === null || v === undefined) {
        next.delete(k);
      } else {
        next.set(k, v);
      }
    });
    setSearchParams(next);
  };

  // Compare columns metadata
  const compareColsMeta = useMemo(() => {
    if (layout === 'tformat') return [];
    return resolveCompareColumns(dateFrom, dateTo, compareOpt);
  }, [dateFrom, dateTo, compareOpt, layout]);

  // Query Primary P&L Data
  const {
    data: mainReportRes,
    isLoading: isMainLoading,
    isError: isMainError,
    refetch: refetchMain,
  } = useQuery({
    queryKey: ['finance-reports', 'profit-and-loss', dateFrom, dateTo],
    queryFn: () => financeService.getProfitAndLoss({ date_from: dateFrom, date_to: dateTo }),
  });

  // Query Company Public Settings (legal name)
  const { data: publicSettingsRes } = useQuery({
    queryKey: ['settings', 'public'],
    queryFn: () => financeService.getAccounts().then(() => null).catch(() => null), // gentle query check
  });
  const companyLegalName = (publicSettingsRes as any)?.data?.companyLegalName || 'MERCON Logistics';

  // Query Comparison P&L Data
  const compareQueries = useQueries({
    queries: compareColsMeta.map((col) => ({
      queryKey: ['finance-reports', 'profit-and-loss', col.from, col.to],
      queryFn: () => financeService.getProfitAndLoss({ date_from: col.from, date_to: col.to }),
      enabled: compareColsMeta.length > 0 && layout === 'vertical',
      staleTime: 60000,
    })),
  });

  // Query Monthly Trend for Analysis Tab (up to 12 months in range)
  const monthlyRangeCols = useMemo(() => {
    if (activeTab !== 'analysis') return [];
    return resolveCompareColumns(dateFrom, dateTo, 'monthly');
  }, [dateFrom, dateTo, activeTab]);

  const monthlyQueries = useQueries({
    queries: monthlyRangeCols.map((col) => ({
      queryKey: ['finance-reports', 'profit-and-loss-monthly', col.from, col.to],
      queryFn: () => financeService.getProfitAndLoss({ date_from: col.from, date_to: col.to }),
      enabled: activeTab === 'analysis' && monthlyRangeCols.length > 0,
      staleTime: 60000,
    })),
  });

  const mainData = mainReportRes?.data;
  const revenues = mainData?.revenues || [];
  const expenses = mainData?.expenses || [];

  // Build Compare Items Map
  const compareItemsMap = useMemo(() => {
    if (compareColsMeta.length === 0 || layout === 'tformat') return undefined;
    const map: Record<string, { revenues: ReportLineItem[]; expenses: ReportLineItem[] }> = {};
    compareColsMeta.forEach((col, idx) => {
      const q = compareQueries[idx];
      if (q?.data?.data) {
        map[col.key] = {
          revenues: q.data.data.revenues || [],
          expenses: q.data.data.expenses || [],
        };
      }
    });
    return map;
  }, [compareColsMeta, compareQueries, layout]);

  // Build Structured P&L Models
  const verticalPnl: StructuredVerticalPnl = useMemo(() => {
    return buildStructuredVerticalPnl(revenues, expenses, classifications, compareItemsMap);
  }, [revenues, expenses, classifications, compareItemsMap]);

  const tFormatPnl = useMemo(() => {
    return buildStructuredTFormatPnl(verticalPnl);
  }, [verticalPnl]);

  // List of all groups/standalone accounts for Statement Setup Sheet
  const setupGroups = useMemo(() => {
    const map = new Map<string, { key: string; name: string; isRevenue: boolean; defaultClass: PnlClass }>();
    [...revenues, ...expenses].forEach((item) => {
      const isRev = revenues.includes(item);
      const key = String(item.parent_id || (item.parent_name ? `parent-${item.parent_name}` : item.account_id || item.account_code || item.name || 'unassigned'));
      const name = item.parent_name || item.name || 'Unassigned';
      if (key && !map.has(key)) {
        map.set(key, {
          key,
          name,
          isRevenue: isRev,
          defaultClass: getDefaultPnlClass(item.name, item.parent_name, isRev),
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [revenues, expenses]);

  // Formatting helper with negative numbers preference
  const fmtMoney = (val: number | null | undefined, signed = false) => {
    return formatMoney(val, {
      negativeFormat: customize.negativeFormat,
      signed,
    });
  };

  const toggleGroupCollapse = (key: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [key]: prev[key] !== undefined ? !prev[key] : customize.expandAllByDefault,
    }));
  };

  const isGroupExpanded = (key: string) => {
    if (collapsedGroups[key] !== undefined) return !collapsedGroups[key];
    return customize.expandAllByDefault;
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

  // Export dataset preparation
  const exportRows = useMemo(() => {
    const rows: Record<string, any>[] = [];
    if (layout === 'vertical') {
      (Object.keys(verticalPnl.sections) as PnlClass[]).forEach((secKey) => {
        const sec = verticalPnl.sections[secKey];
        if (sec.groups.length === 0 && !customize.showZeroBalance) return;

        rows.push({ category: PNL_CLASS_LABELS[secKey], type: 'HEADER' });

        sec.groups.forEach((g) => {
          if (g.total === 0 && !customize.showZeroBalance) return;
          rows.push({
            category: PNL_CLASS_LABELS[secKey],
            group: g.name,
            account_code: g.code || '',
            account_name: g.name,
            amount: g.total,
            type: 'GROUP_TOTAL',
          });
          g.items.forEach((item) => {
            if (item.amount === 0 && !customize.showZeroBalance) return;
            rows.push({
              category: PNL_CLASS_LABELS[secKey],
              group: g.name,
              account_code: item.account_code,
              account_name: item.name,
              amount: item.amount,
              type: 'ACCOUNT',
            });
          });
        });

        rows.push({
          category: PNL_CLASS_LABELS[secKey],
          group: `Total for ${PNL_CLASS_LABELS[secKey]}`,
          amount: sec.total,
          type: 'SECTION_TOTAL',
        });
      });

      rows.push({ category: 'Gross Profit', amount: verticalPnl.grossProfit, type: 'KPI' });
      rows.push({ category: 'Operating Profit', amount: verticalPnl.operatingProfit, type: 'KPI' });
      rows.push({ category: 'Net Profit / Loss', amount: verticalPnl.netProfit, type: 'KPI' });
    } else {
      // T-format Export (Dr vs Cr)
      const maxRows = Math.max(tFormatPnl.trading.dr.length, tFormatPnl.trading.cr.length);
      for (let i = 0; i < maxRows; i++) {
        const dr = tFormatPnl.trading.dr[i];
        const cr = tFormatPnl.trading.cr[i];
        rows.push({
          dr_particulars: dr?.label || '',
          dr_amount: dr?.amount ?? '',
          cr_particulars: cr?.label || '',
          cr_amount: cr?.amount ?? '',
          part: 'Trading Account',
        });
      }
      rows.push({
        dr_particulars: 'Trading Total',
        dr_amount: tFormatPnl.trading.drTotal,
        cr_particulars: 'Trading Total',
        cr_amount: tFormatPnl.trading.crTotal,
        part: 'Trading Account Total',
      });

      const maxPnlRows = Math.max(tFormatPnl.pnl.dr.length, tFormatPnl.pnl.cr.length);
      for (let i = 0; i < maxPnlRows; i++) {
        const dr = tFormatPnl.pnl.dr[i];
        const cr = tFormatPnl.pnl.cr[i];
        rows.push({
          dr_particulars: dr?.label || '',
          dr_amount: dr?.amount ?? '',
          cr_particulars: cr?.label || '',
          cr_amount: cr?.amount ?? '',
          part: 'Profit & Loss Account',
        });
      }
      rows.push({
        dr_particulars: 'P&L Total',
        dr_amount: tFormatPnl.pnl.drTotal,
        cr_particulars: 'P&L Total',
        cr_amount: tFormatPnl.pnl.crTotal,
        part: 'P&L Account Total',
      });
    }
    return rows;
  }, [verticalPnl, tFormatPnl, layout, customize.showZeroBalance]);

  const exportColumns: ExportColumn<any>[] = useMemo(() => {
    if (layout === 'vertical') {
      const cols: ExportColumn<any>[] = [
        { id: 'category', label: 'Section', accessor: (r) => r.category || '' },
        { id: 'group', label: 'Group / Particulars', accessor: (r) => r.group || '' },
        { id: 'account_code', label: 'Account Code', accessor: (r) => r.account_code || '' },
        { id: 'account_name', label: 'Account Name', accessor: (r) => r.account_name || '' },
        { id: 'amount', label: 'Amount (SAR)', accessor: (r) => r.amount },
      ];
      return cols;
    } else {
      return [
        { id: 'part', label: 'Account Part', accessor: (r) => r.part },
        { id: 'dr_particulars', label: 'Dr Particulars', accessor: (r) => r.dr_particulars },
        { id: 'dr_amount', label: 'Dr Amount (SAR)', accessor: (r) => r.dr_amount },
        { id: 'cr_particulars', label: 'Cr Particulars', accessor: (r) => r.cr_particulars },
        { id: 'cr_amount', label: 'Cr Amount (SAR)', accessor: (r) => r.cr_amount },
      ];
    }
  }, [layout]);

  // Waterfall Chart Data for Analysis Tab
  const waterfallData = useMemo(() => {
    const opInc = verticalPnl.operatingIncomeTotal;
    const cogs = verticalPnl.costOfSalesTotal;
    const gp = verticalPnl.grossProfit;
    const opExp = verticalPnl.operatingExpenseTotal;
    const othInc = verticalPnl.otherIncomeTotal;
    const nonOpExp = verticalPnl.nonOperatingExpenseTotal;
    const net = verticalPnl.netProfit;

    // Stacked bars: base (invisible spacer) + value
    return [
      { name: 'Operating Income', base: 0, val: opInc, color: '#10B981', displayVal: opInc },
      { name: 'Cost of Sales', base: Math.max(0, opInc - cogs), val: cogs, color: '#F97316', displayVal: -cogs },
      { name: 'Gross Profit', base: 0, val: Math.abs(gp), color: '#3E3C3D', displayVal: gp },
      { name: 'Operating Exp', base: Math.max(0, Math.max(0, gp) - opExp), val: opExp, color: '#F97316', displayVal: -opExp },
      { name: 'Other / Non-Op', base: 0, val: Math.abs(othInc - nonOpExp), color: othInc - nonOpExp >= 0 ? '#10B981' : '#F97316', displayVal: othInc - nonOpExp },
      { name: 'Net Result', base: 0, val: Math.abs(net), color: '#3E3C3D', displayVal: net },
    ];
  }, [verticalPnl]);

  // Monthly Trend Chart Data for Analysis Tab
  const monthlyTrendData = useMemo(() => {
    return monthlyRangeCols.map((col, idx) => {
      const q = monthlyQueries[idx];
      const data = q?.data?.data;
      const inc = data?.total_revenue || 0;
      const exp = data?.total_expense || 0;
      const net = data?.net_profit || 0;
      return {
        name: col.label,
        Income: inc,
        Expenses: exp,
        Net: net,
      };
    });
  }, [monthlyRangeCols, monthlyQueries]);

  // Deterministic Insights Cards for Analysis Tab
  const insights = useMemo(() => {
    const list: { id: string; title: string; text: string; accountId?: string }[] = [];

    // Compare period analysis
    if (compareColsMeta.length > 0 && compareQueries[0]?.data?.data) {
      const prevRev = compareQueries[0].data.data.revenues || [];
      const prevExp = compareQueries[0].data.data.expenses || [];

      // Biggest expense increase
      let maxExpIncrease = 0;
      let maxExpAccount: ReportLineItem | null = null;

      expenses.forEach((item) => {
        const prev = prevExp.find((p) => p.account_code === item.account_code);
        const diff = item.amount - (prev?.amount || 0);
        if (diff > maxExpIncrease) {
          maxExpIncrease = diff;
          maxExpAccount = item;
        }
      });

      if (maxExpAccount && maxExpIncrease > 0) {
        list.push({
          id: 'exp_inc',
          title: 'Highest Expense Increase',
          text: `${(maxExpAccount as ReportLineItem).name} (${(maxExpAccount as ReportLineItem).account_code}) increased by SAR ${formatMoney(maxExpIncrease)} compared to previous period.`,
          accountId: (maxExpAccount as ReportLineItem).account_id || undefined,
        });
      }

      // Biggest income change
      let maxRevDiff = 0;
      let maxRevAccount: ReportLineItem | null = null;

      revenues.forEach((item) => {
        const prev = prevRev.find((p) => p.account_code === item.account_code);
        const diff = item.amount - (prev?.amount || 0);
        if (Math.abs(diff) > Math.abs(maxRevDiff)) {
          maxRevDiff = diff;
          maxRevAccount = item;
        }
      });

      if (maxRevAccount && Math.abs(maxRevDiff) > 0) {
        const isUp = maxRevDiff > 0;
        list.push({
          id: 'rev_change',
          title: 'Primary Revenue Driver',
          text: `${(maxRevAccount as ReportLineItem).name} (${(maxRevAccount as ReportLineItem).account_code}) ${isUp ? 'grew by' : 'dropped by'} SAR ${formatMoney(Math.abs(maxRevDiff))}.`,
          accountId: (maxRevAccount as ReportLineItem).account_id || undefined,
        });
      }

      // Net margin points change
      const curMargin = verticalPnl.operatingIncomeTotal > 0 ? (verticalPnl.netProfit / verticalPnl.operatingIncomeTotal) * 100 : 0;
      const prevNet = compareQueries[0].data.data.net_profit || 0;
      const prevOpInc = (compareQueries[0].data.data.revenues || []).reduce((s, r) => s + r.amount, 0);
      const prevMargin = prevOpInc > 0 ? (prevNet / prevOpInc) * 100 : 0;
      const marginPts = curMargin - prevMargin;

      list.push({
        id: 'margin_change',
        title: 'Net Margin Shift',
        text: `Net profit margin shifted by ${marginPts >= 0 ? '+' : ''}${marginPts.toFixed(1)} percentage points (from ${prevMargin.toFixed(1)}% to ${curMargin.toFixed(1)}%).`,
      });
    }

    return list;
  }, [compareColsMeta, compareQueries, expenses, revenues, verticalPnl]);

  const isEmptyState = revenues.length === 0 && expenses.length === 0;

  return (
    <DashboardLayout active="finance" title="Profit & Loss Statement">
      <div className="p-4 space-y-3.5 max-w-[1400px] mx-auto print:p-0 print:m-0 print:max-w-none">
        {/* ── Toolbar Row (DESIGN.md §4.0a) ─────────────────────────────────── */}
        <div className="border-b border-slate-200/80 pb-2.5 flex flex-col md:flex-row md:items-center justify-between gap-3 print:hidden">
          {/* Left Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Statement / Analysis Tabs */}
            <div className="bg-[#F4F4F5] dark:bg-slate-800/80 p-1 rounded-xl flex items-center gap-1">
              <button
                type="button"
                onClick={() => updateParams({ tab: 'statement' })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[9px] text-xs font-semibold transition-all ${
                  activeTab === 'statement'
                    ? 'bg-white dark:bg-slate-900 text-[#111111] dark:text-slate-100 shadow-xs'
                    : 'text-[#6E6E80] dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <FileText className="w-3.5 h-3.5 text-[#FA634E]" />
                <span>Statement</span>
              </button>
              <button
                type="button"
                onClick={() => updateParams({ tab: 'analysis' })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[9px] text-xs font-semibold transition-all ${
                  activeTab === 'analysis'
                    ? 'bg-white dark:bg-slate-900 text-[#111111] dark:text-slate-100 shadow-xs'
                    : 'text-[#6E6E80] dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5 text-[#FA634E]" />
                <span>Analysis</span>
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

            {/* Layout ToggleGroup (Vertical vs T-format) */}
            {activeTab === 'statement' && (
              <ToggleGroup
                value={[layout]}
                onValueChange={(val: string[]) => val[0] && updateParams({ layout: val[0] })}
                className="bg-[#F4F4F5] dark:bg-slate-800/80 p-0.5 rounded-xl"
              >
                <ToggleGroupItem value="vertical" aria-label="Vertical Layout" className="h-7 text-xs px-2.5 rounded-[9px]">
                  Vertical
                </ToggleGroupItem>
                <ToggleGroupItem value="tformat" aria-label="T-Format Layout" className="h-7 text-xs px-2.5 rounded-[9px]">
                  T-format
                </ToggleGroupItem>
              </ToggleGroup>
            )}

            {/* Compare Select */}
            {activeTab === 'statement' && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <div>
                      <Select
                        value={compareOpt}
                        disabled={layout === 'tformat'}
                        onValueChange={(val) => updateParams({ compare: val })}
                      >
                        <SelectTrigger
                          className={`h-8 text-xs w-[160px] rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 ${
                            layout === 'tformat' ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                        >
                          <SelectValue placeholder="Compare" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Compare: None</SelectItem>
                          <SelectItem value="previous_period">Previous period</SelectItem>
                          <SelectItem value="same_period_last_year">Same period last year</SelectItem>
                          <SelectItem value="monthly">Monthly columns</SelectItem>
                          <SelectItem value="quarterly">Quarterly columns</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </TooltipTrigger>
                  {layout === 'tformat' && (
                    <TooltipContent className="text-xs">
                      Comparison columns are available in Vertical layout.
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            )}
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
              onClick={() => setIsSetupOpen(true)}
            >
              <Settings2 className="w-3.5 h-3.5 text-slate-500" />
              <span>Setup</span>
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
              disabled={isMainLoading || isEmptyState}
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Export</span>
            </Button>
          </div>
        </div>

        {/* ── Error State ────────────────────────────────────────────────────── */}
        {isMainError && (
          <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-2xl p-6 text-center space-y-3">
            <div className="text-rose-700 dark:text-rose-300 font-bold text-sm">Failed to load Profit & Loss Statement</div>
            <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md mx-auto">
              An error occurred while connecting to the server. Please verify your connection or retry.
            </p>
            <Button size="sm" variant="outline" className="h-8 text-xs rounded-xl gap-1.5" onClick={() => refetchMain()}>
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </Button>
          </div>
        )}

        {/* ── Loading Skeleton ───────────────────────────────────────────────── */}
        {isMainLoading && (
          <div className="max-w-[920px] mx-auto bg-white dark:bg-slate-900 rounded-2xl p-8 border border-slate-200/80 dark:border-slate-800 space-y-6">
            <div className="space-y-2 text-center">
              <Skeleton className="h-6 w-48 mx-auto" />
              <Skeleton className="h-8 w-64 mx-auto" />
              <Skeleton className="h-4 w-36 mx-auto" />
            </div>
            <div className="space-y-3 pt-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          </div>
        )}

        {/* ── Empty State ────────────────────────────────────────────────────── */}
        {!isMainLoading && !isMainError && isEmptyState && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 text-center space-y-3 border border-slate-200/80 dark:border-slate-800 max-w-[920px] mx-auto">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
              <FileText className="w-6 h-6" />
            </div>
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
              No income or expenses posted between {formatDate(dateFrom)} and {formatDate(dateTo)}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Post invoices, bills, or journal entries in this date range to view your Profit and Loss statement.
            </p>
          </div>
        )}

        {/* ── TAB 1: STATEMENT TAB ────────────────────────────────────────────── */}
        {!isMainLoading && !isMainError && !isEmptyState && activeTab === 'statement' && (
          <div className="fin-pnl-paper-wrapper">
            <div
              className={`mx-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs p-8 md:p-10 space-y-6 fin-pnl-paper transition-all ${
                compareColsMeta.length > 0 && layout === 'vertical' ? 'max-w-[1280px]' : 'max-w-[920px]'
              }`}
            >
              {/* Document Header (Centred inside Paper) */}
              <div className="text-center space-y-1 pb-4 border-b border-slate-200/80 dark:border-slate-800">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {companyLegalName}
                </div>
                <h1 className="text-2xl font-semibold text-[#111111] dark:text-slate-100 tracking-tight">
                  Profit and Loss
                </h1>
                <div className="text-[12px] text-slate-500 dark:text-slate-400 flex items-center justify-center gap-2">
                  <span>Basis: Accrual</span>
                  <span>·</span>
                  <span>From {formatDate(dateFrom)} To {formatDate(dateTo)}</span>
                </div>
                <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-widest pt-0.5">
                  Amounts in SAR
                </div>
              </div>

              {/* VERTICAL LAYOUT (Zoho Books Style) */}
              {layout === 'vertical' && (
                <div className="space-y-6 overflow-x-auto">
                  <table className="w-full text-[13px] border-collapse min-w-[600px]">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-[#757583] dark:text-slate-400">
                        <th className="py-2 text-left font-bold">Account</th>
                        <th className="py-2 text-right font-bold w-36">
                          {formatDate(dateFrom)} – {formatDate(dateTo)}
                        </th>

                        {/* Comparison Column Headers */}
                        {compareColsMeta.map((col) => (
                          <th key={col.key} className="py-2 text-right font-bold w-36">
                            {col.label}
                          </th>
                        ))}

                        {/* Variance Columns */}
                        {compareColsMeta.length === 1 && (
                          <>
                            <th className="py-2 text-right font-bold w-28">Change</th>
                            <th className="py-2 text-right font-bold w-24">Change %</th>
                          </>
                        )}

                        {/* % of Revenue Column */}
                        {customize.showPctOfRevenue && (
                          <th className="py-2 text-right font-bold w-24">% of Revenue</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {/* Section Renderer */}
                      {renderVerticalSection({
                        secKey: 'operating_income',
                        section: verticalPnl.sections.operating_income,
                        customize,
                        compareColsMeta,
                        isGroupExpanded,
                        toggleGroupCollapse,
                        fmtMoney,
                        navigate,
                        dateFrom,
                        dateTo,
                        operatingIncomeTotal: verticalPnl.operatingIncomeTotal,
                      })}

                      {renderVerticalSection({
                        secKey: 'cost_of_sales',
                        section: verticalPnl.sections.cost_of_sales,
                        customize,
                        compareColsMeta,
                        isGroupExpanded,
                        toggleGroupCollapse,
                        fmtMoney,
                        navigate,
                        dateFrom,
                        dateTo,
                        operatingIncomeTotal: verticalPnl.operatingIncomeTotal,
                        isCost: true,
                      })}

                      {/* ── Gross Profit Subtotal Row ── */}
                      <tr className="bg-[#F7F8FA] dark:bg-slate-900/60 font-bold border-t-2 border-b border-slate-300 dark:border-slate-700">
                        <td className="py-2.5 px-2 text-[#111111] dark:text-slate-100">
                          Gross Profit
                        </td>
                        <td className={`py-2.5 px-2 text-right font-mono ${verticalPnl.grossProfit < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-[#111111] dark:text-slate-100'}`}>
                          {fmtMoney(verticalPnl.grossProfit)}
                        </td>
                        {compareColsMeta.map((col) => {
                          const gpVal = verticalPnl.compareGrossProfit?.[col.key] ?? 0;
                          return (
                            <td key={col.key} className={`py-2.5 px-2 text-right font-mono ${gpVal < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-[#111111] dark:text-slate-100'}`}>
                              {fmtMoney(gpVal)}
                            </td>
                          );
                        })}
                        {compareColsMeta.length === 1 && (
                          <VarianceCells
                            current={verticalPnl.grossProfit}
                            previous={verticalPnl.compareGrossProfit?.[compareColsMeta[0].key] ?? 0}
                            isCost={false}
                            fmtMoney={fmtMoney}
                          />
                        )}
                        {customize.showPctOfRevenue && (
                          <td className="py-2.5 px-2 text-right font-mono text-slate-500 text-xs">
                            {verticalPnl.operatingIncomeTotal > 0 ? formatPct((verticalPnl.grossProfit / verticalPnl.operatingIncomeTotal) * 100) : '—'}
                          </td>
                        )}
                      </tr>

                      {renderVerticalSection({
                        secKey: 'operating_expense',
                        section: verticalPnl.sections.operating_expense,
                        customize,
                        compareColsMeta,
                        isGroupExpanded,
                        toggleGroupCollapse,
                        fmtMoney,
                        navigate,
                        dateFrom,
                        dateTo,
                        operatingIncomeTotal: verticalPnl.operatingIncomeTotal,
                        isCost: true,
                      })}

                      {/* ── Operating Profit Subtotal Row ── */}
                      <tr className="bg-[#F7F8FA] dark:bg-slate-900/60 font-bold border-t-2 border-b border-slate-300 dark:border-slate-700">
                        <td className="py-2.5 px-2 text-[#111111] dark:text-slate-100">
                          Operating Profit
                        </td>
                        <td className={`py-2.5 px-2 text-right font-mono ${verticalPnl.operatingProfit < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-[#111111] dark:text-slate-100'}`}>
                          {fmtMoney(verticalPnl.operatingProfit)}
                        </td>
                        {compareColsMeta.map((col) => {
                          const opProfVal = verticalPnl.compareOperatingProfit?.[col.key] ?? 0;
                          return (
                            <td key={col.key} className={`py-2.5 px-2 text-right font-mono ${opProfVal < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-[#111111] dark:text-slate-100'}`}>
                              {fmtMoney(opProfVal)}
                            </td>
                          );
                        })}
                        {compareColsMeta.length === 1 && (
                          <VarianceCells
                            current={verticalPnl.operatingProfit}
                            previous={verticalPnl.compareOperatingProfit?.[compareColsMeta[0].key] ?? 0}
                            isCost={false}
                            fmtMoney={fmtMoney}
                          />
                        )}
                        {customize.showPctOfRevenue && (
                          <td className="py-2.5 px-2 text-right font-mono text-slate-500 text-xs">
                            {verticalPnl.operatingIncomeTotal > 0 ? formatPct((verticalPnl.operatingProfit / verticalPnl.operatingIncomeTotal) * 100) : '—'}
                          </td>
                        )}
                      </tr>

                      {renderVerticalSection({
                        secKey: 'other_income',
                        section: verticalPnl.sections.other_income,
                        customize,
                        compareColsMeta,
                        isGroupExpanded,
                        toggleGroupCollapse,
                        fmtMoney,
                        navigate,
                        dateFrom,
                        dateTo,
                        operatingIncomeTotal: verticalPnl.operatingIncomeTotal,
                      })}

                      {renderVerticalSection({
                        secKey: 'non_operating_expense',
                        section: verticalPnl.sections.non_operating_expense,
                        customize,
                        compareColsMeta,
                        isGroupExpanded,
                        toggleGroupCollapse,
                        fmtMoney,
                        navigate,
                        dateFrom,
                        dateTo,
                        operatingIncomeTotal: verticalPnl.operatingIncomeTotal,
                        isCost: true,
                      })}

                      {/* ── Net Profit / Net Loss Double-Ruled Grand Total Row ── */}
                      <tr className="font-bold text-[15px] border-t-2 border-b-[3px] border-double border-[#3E3C3D] dark:border-slate-200">
                        <td className="py-3 px-2 text-[#3E3C3D] dark:text-slate-100">
                          {verticalPnl.netProfit >= 0 ? 'Net Profit' : 'Net Loss'}
                        </td>
                        <td className={`py-3 px-2 text-right font-mono ${verticalPnl.netProfit < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-[#111111] dark:text-slate-100'}`}>
                          {fmtMoney(verticalPnl.netProfit)}
                        </td>
                        {compareColsMeta.map((col) => {
                          const netVal = verticalPnl.compareNetProfit?.[col.key] ?? 0;
                          return (
                            <td key={col.key} className={`py-3 px-2 text-right font-mono ${netVal < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-[#111111] dark:text-slate-100'}`}>
                              {fmtMoney(netVal)}
                            </td>
                          );
                        })}
                        {compareColsMeta.length === 1 && (
                          <VarianceCells
                            current={verticalPnl.netProfit}
                            previous={verticalPnl.compareNetProfit?.[compareColsMeta[0].key] ?? 0}
                            isCost={false}
                            fmtMoney={fmtMoney}
                          />
                        )}
                        {customize.showPctOfRevenue && (
                          <td className="py-3 px-2 text-right font-mono text-slate-500 text-xs">
                            {verticalPnl.operatingIncomeTotal > 0 ? formatPct((verticalPnl.netProfit / verticalPnl.operatingIncomeTotal) * 100) : '—'}
                          </td>
                        )}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* T-FORMAT LAYOUT (Tally Horizontal Style) */}
              {layout === 'tformat' && (
                <div className="space-y-8">
                  {/* TRADING PART */}
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    <div className="bg-slate-100 dark:bg-slate-800 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 text-center">
                      Trading Account
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
                      {/* Left Side (Dr / Cost of Sales) */}
                      <div className="p-4 space-y-3 flex flex-col justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500 border-b pb-1">
                            <span>Particulars (Dr)</span>
                            <span>Amount (SAR)</span>
                          </div>
                          {tFormatPnl.trading.dr.map((item) => (
                            <TFormatRowItem key={item.key} item={item} fmtMoney={fmtMoney} navigate={navigate} dateFrom={dateFrom} dateTo={dateTo} showAccountCodes={customize.showAccountCodes} />
                          ))}
                        </div>
                        <div className="border-t border-b border-slate-300 dark:border-slate-700 py-1.5 flex justify-between font-bold text-xs">
                          <span>Total</span>
                          <span className="font-mono">{fmtMoney(tFormatPnl.trading.drTotal)}</span>
                        </div>
                      </div>

                      {/* Right Side (Cr / Operating Income) */}
                      <div className="p-4 space-y-3 flex flex-col justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500 border-b pb-1">
                            <span>Particulars (Cr)</span>
                            <span>Amount (SAR)</span>
                          </div>
                          {tFormatPnl.trading.cr.map((item) => (
                            <TFormatRowItem key={item.key} item={item} fmtMoney={fmtMoney} navigate={navigate} dateFrom={dateFrom} dateTo={dateTo} showAccountCodes={customize.showAccountCodes} />
                          ))}
                        </div>
                        <div className="border-t border-b border-slate-300 dark:border-slate-700 py-1.5 flex justify-between font-bold text-xs">
                          <span>Total</span>
                          <span className="font-mono">{fmtMoney(tFormatPnl.trading.crTotal)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* PROFIT & LOSS PART */}
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    <div className="bg-slate-100 dark:bg-slate-800 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 text-center">
                      Profit & Loss Account
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
                      {/* Left Side (Dr / Expenses & Net Profit) */}
                      <div className="p-4 space-y-3 flex flex-col justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500 border-b pb-1">
                            <span>Particulars (Dr)</span>
                            <span>Amount (SAR)</span>
                          </div>
                          {tFormatPnl.pnl.dr.map((item) => (
                            <TFormatRowItem key={item.key} item={item} fmtMoney={fmtMoney} navigate={navigate} dateFrom={dateFrom} dateTo={dateTo} showAccountCodes={customize.showAccountCodes} />
                          ))}
                        </div>
                        <div className="border-t border-b-[3px] border-double border-slate-400 dark:border-slate-600 py-2 flex justify-between font-bold text-xs">
                          <span>Total</span>
                          <span className="font-mono">{fmtMoney(tFormatPnl.pnl.drTotal)}</span>
                        </div>
                      </div>

                      {/* Right Side (Cr / Other Income & Net Loss) */}
                      <div className="p-4 space-y-3 flex flex-col justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500 border-b pb-1">
                            <span>Particulars (Cr)</span>
                            <span>Amount (SAR)</span>
                          </div>
                          {tFormatPnl.pnl.cr.map((item) => (
                            <TFormatRowItem key={item.key} item={item} fmtMoney={fmtMoney} navigate={navigate} dateFrom={dateFrom} dateTo={dateTo} showAccountCodes={customize.showAccountCodes} />
                          ))}
                        </div>
                        <div className="border-t border-b-[3px] border-double border-slate-400 dark:border-slate-600 py-2 flex justify-between font-bold text-xs">
                          <span>Total</span>
                          <span className="font-mono">{fmtMoney(tFormatPnl.pnl.crTotal)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Statement Paper Footer */}
              <div className="pt-6 border-t border-slate-200/80 dark:border-slate-800 text-center text-xs text-slate-400">
                Generated on {formatDate(new Date())} · System Administrator
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 2: ANALYSIS TAB ─────────────────────────────────────────────── */}
        {!isMainLoading && !isMainError && !isEmptyState && activeTab === 'analysis' && (
          <div className="space-y-6">
            {/* 4 Metric Tiles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-1">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Operating Income</div>
                <div className="text-2xl font-bold text-[#111111] dark:text-slate-100 font-mono">
                  SAR {formatMoney(verticalPnl.operatingIncomeTotal)}
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-1">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Expenses</div>
                <div className="text-2xl font-bold text-[#111111] dark:text-slate-100 font-mono">
                  SAR {formatMoney(verticalPnl.costOfSalesTotal + verticalPnl.operatingExpenseTotal + verticalPnl.nonOperatingExpenseTotal)}
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-1">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Gross Profit</div>
                <div className={`text-2xl font-bold font-mono ${verticalPnl.grossProfit >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  SAR {formatMoney(verticalPnl.grossProfit)}
                </div>
              </div>

              {/* Net Profit Charcoal Hero Tile */}
              <div className="bg-[#3E3C3D] text-white p-5 rounded-2xl shadow-xs space-y-1">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-300 flex items-center justify-between">
                  <span>Net {verticalPnl.netProfit >= 0 ? 'Profit' : 'Loss'}</span>
                  {verticalPnl.operatingIncomeTotal > 0 && (
                    <span className="bg-white/10 px-2 py-0.5 rounded-full text-[10px] font-mono text-emerald-300">
                      {formatPct((verticalPnl.netProfit / verticalPnl.operatingIncomeTotal) * 100)} margin
                    </span>
                  )}
                </div>
                <div className={`text-2xl font-bold font-mono ${verticalPnl.netProfit >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                  SAR {formatMoney(verticalPnl.netProfit)}
                </div>
              </div>
            </div>

            {/* Profit Waterfall Chart */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
              <div className="text-sm font-bold text-slate-900 dark:text-slate-100">Profit Waterfall Bridge</div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={waterfallData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <RechartsTooltip
                      formatter={(value: any, name: any, item: any) => [
                        `SAR ${formatMoney(item.payload.displayVal)}`,
                        item.payload.name,
                      ]}
                    />
                    <Bar dataKey="base" stackId="a" fill="transparent" />
                    <Bar dataKey="val" stackId="a">
                      {waterfallData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Monthly Trend & Expense Mix Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Monthly Trend Line Chart */}
              <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
                <div className="text-sm font-bold text-slate-900 dark:text-slate-100">Monthly Performance Trend</div>
                <div className="h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={monthlyTrendData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <RechartsTooltip formatter={(v: any) => [`SAR ${formatMoney(v)}`]} />
                      <Line type="monotone" dataKey="Income" stroke="#10B981" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="Expenses" stroke="#F97316" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="Net" stroke="#3E3C3D" strokeWidth={2.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Expense Mix Share Bar */}
              <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4 flex flex-col justify-between">
                <div className="text-sm font-bold text-slate-900 dark:text-slate-100">Expense Share Distribution</div>
                <div className="space-y-4">
                  {(() => {
                    const totalExp = verticalPnl.costOfSalesTotal + verticalPnl.operatingExpenseTotal + verticalPnl.nonOperatingExpenseTotal;
                    if (totalExp === 0) return <div className="text-xs text-slate-400">No expenses recorded.</div>;
                    const cogsPct = (verticalPnl.costOfSalesTotal / totalExp) * 100;
                    const opExpPct = (verticalPnl.operatingExpenseTotal / totalExp) * 100;
                    const nonOpPct = (verticalPnl.nonOperatingExpenseTotal / totalExp) * 100;

                    return (
                      <div className="space-y-4">
                        <div className="h-4 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
                          <div style={{ width: `${cogsPct}%` }} className="bg-orange-500 h-full" title={`Cost of Sales: ${cogsPct.toFixed(1)}%`} />
                          <div style={{ width: `${opExpPct}%` }} className="bg-rose-500 h-full" title={`Operating Exp: ${opExpPct.toFixed(1)}%`} />
                          <div style={{ width: `${nonOpPct}%` }} className="bg-amber-500 h-full" title={`Non-Operating Exp: ${nonOpPct.toFixed(1)}%`} />
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 text-slate-500">
                              <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />
                              <span>Cost of Sales</span>
                            </div>
                            <div className="font-bold font-mono">{formatPct(cogsPct)}</div>
                          </div>
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 text-slate-500">
                              <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
                              <span>Operating Exp</span>
                            </div>
                            <div className="font-bold font-mono">{formatPct(opExpPct)}</div>
                          </div>
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 text-slate-500">
                              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                              <span>Non-Operating</span>
                            </div>
                            <div className="font-bold font-mono">{formatPct(nonOpPct)}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Deterministic Insights Cards (When Compare is Active) */}
            {insights.length > 0 && (
              <div className="space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Key Analytical Insights</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {insights.map((card) => (
                    <div key={card.id} className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-2">
                      <div className="text-xs font-bold text-[#111111] dark:text-slate-100 flex items-center justify-between">
                        <span>{card.title}</span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{card.text}</p>
                      {card.accountId && (
                        <button
                          type="button"
                          onClick={() => navigate(`/finance/general-ledger?account_id=${card.accountId}&date_from=${dateFrom}&date_to=${dateTo}`)}
                          className="text-[11px] font-semibold text-[#FA634E] hover:underline flex items-center gap-1 pt-1"
                        >
                          <span>View ledger</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── CUSTOMIZE SHEET ─────────────────────────────────────────────────── */}
        <Sheet open={isCustomizeOpen} onOpenChange={setIsCustomizeOpen}>
          <SheetContent className="w-full sm:max-w-md space-y-6">
            <SheetHeader>
              <SheetTitle>Customize Report</SheetTitle>
              <SheetDescription>Configure display rules and formatting for this statement.</SheetDescription>
            </SheetHeader>

            <div className="space-y-5 py-2">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="text-xs font-bold">Show account codes</div>
                  <div className="text-[11.5px] text-slate-500">Display GL codes before account names</div>
                </div>
                <Switch checked={customize.showAccountCodes} onCheckedChange={(val) => setCustomize((prev) => ({ ...prev, showAccountCodes: val }))} />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="text-xs font-bold">Show zero-balance accounts</div>
                  <div className="text-[11.5px] text-slate-500">Include accounts with 0 activity in period</div>
                </div>
                <Switch checked={customize.showZeroBalance} onCheckedChange={(val) => setCustomize((prev) => ({ ...prev, showZeroBalance: val }))} />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="text-xs font-bold">Show % of revenue column</div>
                  <div className="text-[11.5px] text-slate-500">Add a column for percentage of operating income</div>
                </div>
                <Switch checked={customize.showPctOfRevenue} onCheckedChange={(val) => setCustomize((prev) => ({ ...prev, showPctOfRevenue: val }))} />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="text-xs font-bold">Expand all groups by default</div>
                  <div className="text-[11.5px] text-slate-500">Keep account group rows expanded on load</div>
                </div>
                <Switch checked={customize.expandAllByDefault} onCheckedChange={(val) => setCustomize((prev) => ({ ...prev, expandAllByDefault: val }))} />
              </div>

              <div className="space-y-2 pt-2 border-t">
                <div className="text-xs font-bold">Negative numbers format</div>
                <RadioGroup value={customize.negativeFormat} onValueChange={(val) => setCustomize((prev) => ({ ...prev, negativeFormat: val as any }))} className="flex gap-4">
                  <div className="flex items-center gap-1.5 text-xs">
                    <RadioGroupItem value="minus" id="neg-minus" />
                    <label htmlFor="neg-minus" className="font-mono">−1,234.00</label>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <RadioGroupItem value="parentheses" id="neg-paren" />
                    <label htmlFor="neg-paren" className="font-mono">(1,234.00)</label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-1.5 pt-2 border-t">
                <div className="text-xs font-bold">Report Basis</div>
                <div className="bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 inline-block">
                  Accrual Basis (Read-only)
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* ── STATEMENT SETUP SHEET ───────────────────────────────────────────── */}
        <Sheet open={isSetupOpen} onOpenChange={setIsSetupOpen}>
          <SheetContent className="w-full sm:max-w-lg space-y-6">
            <SheetHeader>
              <SheetTitle>Statement Setup</SheetTitle>
              <SheetDescription>Map parent account groups to formal P&L statement sections.</SheetDescription>
            </SheetHeader>

            <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-1">
              {setupGroups.map((g) => {
                const currentCls = classifications[g.key] || g.defaultClass;
                return (
                  <div key={g.key} className="p-3 border rounded-xl space-y-2 bg-slate-50/50 dark:bg-slate-900/50">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span>{g.name}</span>
                      <span className="text-[10px] text-slate-400 uppercase">{g.isRevenue ? 'Revenue Group' : 'Expense Group'}</span>
                    </div>

                    <RadioGroup
                      value={currentCls}
                      onValueChange={(val) => setClassifications((prev) => ({ ...prev, [g.key]: val as PnlClass }))}
                      className="space-y-1.5 pt-1"
                    >
                      {g.isRevenue ? (
                        <>
                          <div className="flex items-center gap-2 text-xs">
                            <RadioGroupItem value="operating_income" id={`${g.key}-opinc`} />
                            <label htmlFor={`${g.key}-opinc`}>Operating Income</label>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <RadioGroupItem value="other_income" id={`${g.key}-othinc`} />
                            <label htmlFor={`${g.key}-othinc`}>Other Income / Non-Operating Income</label>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 text-xs">
                            <RadioGroupItem value="cost_of_sales" id={`${g.key}-cogs`} />
                            <label htmlFor={`${g.key}-cogs`}>Cost of Sales</label>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <RadioGroupItem value="operating_expense" id={`${g.key}-opexp`} />
                            <label htmlFor={`${g.key}-opexp`}>Operating Expenses</label>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <RadioGroupItem value="non_operating_expense" id={`${g.key}-nonop`} />
                            <label htmlFor={`${g.key}-nonop`}>Non-Operating Expenses</label>
                          </div>
                        </>
                      )}
                    </RadioGroup>
                  </div>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>

        {/* ── EXPORT MODAL ───────────────────────────────────────────────────── */}
        <ExportModal
          isOpen={isExportOpen}
          onClose={() => setIsExportOpen(false)}
          title="Profit and Loss Statement"
          fileNamePrefix={`Profit_and_Loss_${dateFrom}_${dateTo}`}
          filteredData={exportRows}
          columns={exportColumns}
        />
      </div>
    </DashboardLayout>
  );
}

// ─── Sub-Component: Vertical Section Renderer ────────────────────────────────

interface VerticalSectionProps {
  secKey: PnlClass;
  section: PnlSection;
  customize: CustomizeSettings;
  compareColsMeta: CompareColumnMeta[];
  isGroupExpanded: (key: string) => boolean;
  toggleGroupCollapse: (key: string) => void;
  fmtMoney: (val: number | null | undefined, signed?: boolean) => string;
  navigate: (path: string) => void;
  dateFrom: string;
  dateTo: string;
  operatingIncomeTotal: number;
  isCost?: boolean;
}

function renderVerticalSection({
  secKey,
  section,
  customize,
  compareColsMeta,
  isGroupExpanded,
  toggleGroupCollapse,
  fmtMoney,
  navigate,
  dateFrom,
  dateTo,
  operatingIncomeTotal,
  isCost = false,
}: VerticalSectionProps) {
  if (section.groups.length === 0 && !customize.showZeroBalance) {
    return null;
  }

  return (
    <>
      {/* Section Header Row */}
      <tr className="bg-slate-50/70 dark:bg-slate-800/40 text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
        <td colSpan={2 + compareColsMeta.length + (compareColsMeta.length === 1 ? 2 : 0) + (customize.showPctOfRevenue ? 1 : 0)} className="py-2 px-2 text-[#3E3C3D] dark:text-slate-200">
          {section.name}
        </td>
      </tr>

      {/* Group & Account Rows */}
      {section.groups.map((group) => {
        if (group.total === 0 && !customize.showZeroBalance) return null;
        const expanded = isGroupExpanded(group.key);

        return (
          <React.Fragment key={group.key}>
            {/* Group Header Row */}
            <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40 font-semibold group cursor-pointer" onClick={() => toggleGroupCollapse(group.key)}>
              <td className="py-2 px-2 flex items-center gap-1.5">
                <button type="button" className="p-0.5 text-slate-400 hover:text-slate-700">
                  {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
                <span className="text-[#111111] dark:text-slate-100">{group.name}</span>
              </td>
              <td className="py-2 px-2 text-right font-mono text-slate-900 dark:text-slate-100">
                {fmtMoney(group.total)}
              </td>
              {compareColsMeta.map((col) => (
                <td key={col.key} className="py-2 px-2 text-right font-mono text-slate-700 dark:text-slate-300">
                  {fmtMoney(group.compareTotals?.[col.key] ?? 0)}
                </td>
              ))}
              {compareColsMeta.length === 1 && (
                <VarianceCells current={group.total} previous={group.compareTotals?.[compareColsMeta[0].key] ?? 0} isCost={isCost} fmtMoney={fmtMoney} />
              )}
              {customize.showPctOfRevenue && (
                <td className="py-2 px-2 text-right font-mono text-slate-500 text-xs">
                  {operatingIncomeTotal > 0 ? formatPct((group.total / operatingIncomeTotal) * 100) : '—'}
                </td>
              )}
            </tr>

            {/* Individual Account Rows */}
            {expanded &&
              group.items.map((item) => {
                if (item.amount === 0 && !customize.showZeroBalance) return null;

                return (
                  <tr
                    key={item.id}
                    className="hover:bg-[#FFF8F6] dark:hover:bg-slate-800/60 group/row transition-colors cursor-pointer text-xs"
                    onClick={() => navigate(`/finance/general-ledger?account_id=${item.account_id || ''}&date_from=${dateFrom}&date_to=${dateTo}`)}
                  >
                    <td className="py-1.5 pl-7 pr-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {customize.showAccountCodes && item.code && (
                          <span className="font-mono text-[11px] text-slate-400">{item.code}</span>
                        )}
                        <span className="text-slate-700 dark:text-slate-300 group-hover/row:text-[#FA634E] font-normal">{item.name}</span>
                      </div>
                      <span className="opacity-0 group-hover/row:opacity-100 text-[10px] font-semibold text-[#FA634E] transition-opacity flex items-center gap-0.5">
                        <span>View transactions</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </span>
                    </td>

                    <td className="py-1.5 px-2 text-right font-mono text-slate-800 dark:text-slate-200">
                      {fmtMoney(item.amount)}
                    </td>

                    {compareColsMeta.map((col) => (
                      <td key={col.key} className="py-1.5 px-2 text-right font-mono text-slate-500 dark:text-slate-400">
                        {fmtMoney(item.compareAmounts?.[col.key] ?? 0)}
                      </td>
                    ))}

                    {compareColsMeta.length === 1 && (
                      <VarianceCells current={item.amount} previous={item.compareAmounts?.[compareColsMeta[0].key] ?? 0} isCost={isCost} fmtMoney={fmtMoney} />
                    )}

                    {customize.showPctOfRevenue && (
                      <td className="py-1.5 px-2 text-right font-mono text-slate-400 text-xs">
                        {operatingIncomeTotal > 0 ? formatPct((item.amount / operatingIncomeTotal) * 100) : '—'}
                      </td>
                    )}
                  </tr>
                );
              })}
          </React.Fragment>
        );
      })}

      {/* Section Subtotal Row */}
      <tr className="border-t border-slate-200 dark:border-slate-800 font-semibold text-xs text-slate-800 dark:text-slate-200">
        <td className="py-2 px-2">Total for {section.name}</td>
        <td className="py-2 px-2 text-right font-mono">{fmtMoney(section.total)}</td>
        {compareColsMeta.map((col) => (
          <td key={col.key} className="py-2 px-2 text-right font-mono">
            {fmtMoney(section.compareTotals?.[col.key] ?? 0)}
          </td>
        ))}
        {compareColsMeta.length === 1 && (
          <VarianceCells current={section.total} previous={section.compareTotals?.[compareColsMeta[0].key] ?? 0} isCost={isCost} fmtMoney={fmtMoney} />
        )}
        {customize.showPctOfRevenue && (
          <td className="py-2 px-2 text-right font-mono text-slate-500 text-xs">
            {operatingIncomeTotal > 0 ? formatPct((section.total / operatingIncomeTotal) * 100) : '—'}
          </td>
        )}
      </tr>
    </>
  );
}

// ─── Sub-Component: Variance Cells (Change & Change %) ───────────────────────

function VarianceCells({
  current,
  previous,
  isCost,
  fmtMoney,
}: {
  current: number;
  previous: number;
  isCost: boolean;
  fmtMoney: (v: number, signed?: boolean) => string;
}) {
  const diff = current - previous;
  const tone = varianceTone(diff, isCost);

  let pctStr = '—';
  if (previous !== 0) {
    const pct = (diff / Math.abs(previous)) * 100;
    pctStr = formatPct(pct, 1);
  }

  const toneClass =
    tone === 'positive'
      ? 'text-emerald-700 dark:text-emerald-400'
      : tone === 'negative'
      ? 'text-orange-600 dark:text-orange-400'
      : 'text-slate-500';

  return (
    <>
      <td className={`py-1.5 px-2 text-right font-mono text-xs ${toneClass}`}>
        {diff === 0 ? '—' : fmtMoney(diff, true)}
      </td>
      <td className={`py-1.5 px-2 text-right font-mono text-xs ${toneClass}`}>
        {diff === 0 ? '—' : pctStr}
      </td>
    </>
  );
}

// ─── Sub-Component: T-Format Row Item ────────────────────────────────────────

function TFormatRowItem({
  item,
  fmtMoney,
  navigate,
  dateFrom,
  dateTo,
  showAccountCodes,
}: {
  item: any;
  fmtMoney: (v: number) => string;
  navigate: (p: string) => void;
  dateFrom: string;
  dateTo: string;
  showAccountCodes: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs font-semibold py-0.5">
        <span className="text-slate-800 dark:text-slate-200">{item.label}</span>
        <span className="font-mono">{fmtMoney(item.amount)}</span>
      </div>
      {item.groups && (
        <div className="pl-3 space-y-1 border-l-2 border-slate-100 dark:border-slate-800">
          {item.groups.map((g: PnlGroupRow) => (
            <div key={g.key} className="space-y-0.5">
              <div className="flex items-center justify-between text-[11.5px] font-semibold text-slate-700 dark:text-slate-300">
                <span>{g.name}</span>
                <span className="font-mono text-slate-500">{fmtMoney(g.total)}</span>
              </div>
              <div className="pl-2 space-y-0.5">
                {g.items.map((acc) => (
                  <div
                    key={acc.id}
                    onClick={() => navigate(`/finance/general-ledger?account_id=${acc.account_id || ''}&date_from=${dateFrom}&date_to=${dateTo}`)}
                    className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400 hover:text-[#FA634E] cursor-pointer transition-colors"
                  >
                    <span>{showAccountCodes && acc.code ? `${acc.code} ${acc.name}` : acc.name}</span>
                    <span className="font-mono">{fmtMoney(acc.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

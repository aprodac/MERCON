import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  FileText,
  BarChart3,
  Download,
  Printer,
  SlidersHorizontal,
  Settings2,
  ChevronRight,
  ChevronDown,
  Calendar as CalendarIcon,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import ExportModal, { type ExportColumn } from '@/components/ui/ExportModal';

import { StatementHeaderBar, InsightRail } from '@/components/finance/kit';
import { financeService, type ReportLineItem } from '@/services/financeService';
import { formatMoney, formatDate, formatPct } from '@/lib/finance/format';
import {
  buildStructuredVerticalPnl,
  buildStructuredTFormatPnl,
  getDefaultPnlClass,
  clearPnlStoredOverrides,
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
  density: 'compact' | 'comfortable';
}

const DEFAULT_CUSTOMIZE: CustomizeSettings = {
  showAccountCodes: true,
  showZeroBalance: false,
  showPctOfRevenue: false,
  expandAllByDefault: true,
  negativeFormat: 'minus',
  density: 'compact',
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

  useEffect(() => {
    saveCustomizeSettings(customize);
  }, [customize]);

  const updateParams = (updates: Record<string, string | null>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      Object.entries(updates).forEach(([k, v]) => {
        if (v === null || v === '') next.delete(k);
        else next.set(k, v);
      });
      return next;
    });
  };

  const handlePeriodPresetChange = (preset: PeriodPreset) => {
    const dates = resolvePeriodPreset(preset);
    updateParams({
      preset,
      date_from: dates.from,
      date_to: dates.to,
    });
  };

  // Compare columns meta calculation
  const compareColsMeta = useMemo<CompareColumnMeta[]>(() => {
    return resolveCompareColumns(compareOpt as CompareOption, dateFrom, dateTo);
  }, [compareOpt, dateFrom, dateTo]);

  // Primary Query
  const {
    data: mainRes,
    isLoading: isMainLoading,
    isError: isMainError,
    refetch: refetchMain,
  } = useQuery({
    queryKey: ['finance-reports', 'pnl', dateFrom, dateTo],
    queryFn: () => financeService.getProfitAndLoss({ date_from: dateFrom, date_to: dateTo }),
  });

  const pnlReport = mainRes?.data;
  const revenues = pnlReport?.revenues || [];
  const expenses = pnlReport?.expenses || [];

  // Vertical PnL Data Structure
  const verticalPnl: StructuredVerticalPnl = useMemo(() => {
    return buildStructuredVerticalPnl(revenues, expenses, classifications);
  }, [revenues, expenses, classifications]);

  // T-Format Data Structure
  const tFormatPnl = useMemo(() => {
    return buildStructuredTFormatPnl(verticalPnl);
  }, [verticalPnl]);

  const isEmptyState = revenues.length === 0 && expenses.length === 0;

  const fmtMoney = (val: number) => {
    const formatted = formatMoney(Math.abs(val));
    if (val < 0) {
      return customize.negativeFormat === 'parentheses' ? `(${formatted})` : `−${formatted}`;
    }
    return formatted;
  };

  const toggleGroupCollapse = (key: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const isGroupExpanded = (key: string) => {
    if (collapsedGroups[key] !== undefined) return !collapsedGroups[key];
    return customize.expandAllByDefault;
  };

  const handleResetSetup = () => {
    clearPnlStoredOverrides();
    setClassifications({});
    toast.success('P&L classification overrides reset to defaults');
  };

  const allLines = useMemo(() => [...revenues, ...expenses], [revenues, expenses]);

  const exportData = useMemo(() => {
    return allLines.map((l) => {
      const cls = classifications[l.account_id || l.account_code || l.name] || getDefaultPnlClass(l.name, l.parent_name, revenues.includes(l));
      return {
        account_code: l.account_code || '—',
        name: l.name,
        classification: PNL_CLASS_LABELS[cls] || cls,
        amount: l.amount,
      };
    });
  }, [allLines, classifications, revenues]);

  const exportColumns: ExportColumn<(typeof exportData)[0]>[] = [
    { id: 'account_code', label: 'Code', accessor: (r) => r.account_code },
    { id: 'name', label: 'Account Name', accessor: (r) => r.name },
    { id: 'classification', label: 'P&L Class', accessor: (r) => r.classification },
    { id: 'amount', label: 'Amount (SAR)', accessor: (r) => r.amount },
  ];

  const rowHeightClass = customize.density === 'comfortable' ? 'h-9' : 'h-8';

  return (
    <DashboardLayout active="finance" title="Profit & Loss">
      <div className="p-4 space-y-4 max-w-[1400px] mx-auto print:p-0">
        {/* Single-Row Toolbar (No Card Wrapper) */}
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* View Tabs */}
            <ToggleGroup
              value={[activeTab]}
              onValueChange={(v: string[]) => v[0] && updateParams({ tab: v[0] })}
              className="bg-[#F4F4F5] dark:bg-slate-800/80 p-0.5 rounded-lg border border-slate-200/60 dark:border-slate-700/60"
            >
              <ToggleGroupItem
                value="statement"
                className="h-7 text-xs font-semibold px-3 rounded-md data-[state=on]:bg-white dark:data-[state=on]:bg-slate-900"
              >
                Statement
              </ToggleGroupItem>
              <ToggleGroupItem
                value="analysis"
                className="h-7 text-xs font-semibold px-3 rounded-md data-[state=on]:bg-white dark:data-[state=on]:bg-slate-900"
              >
                Analysis
              </ToggleGroupItem>
            </ToggleGroup>

            <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />

            {/* Period Preset Select */}
            <Select value={periodPreset} onValueChange={(val) => handlePeriodPresetChange(val as PeriodPreset)}>
              <SelectTrigger className="h-8 text-xs w-[130px] bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 font-medium">
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

            {/* Date Range Chip */}
            <div className="bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-md text-[11.5px] font-semibold text-slate-700 dark:text-slate-300">
              {formatDate(dateFrom)} – {formatDate(dateTo)}
            </div>

            {/* Layout Toggle */}
            {activeTab === 'statement' && (
              <ToggleGroup
                value={[layout]}
                onValueChange={(val: string[]) => val[0] && updateParams({ layout: val[0] })}
                className="bg-[#F4F4F5] dark:bg-slate-800/80 p-0.5 rounded-lg border border-slate-200/60 dark:border-slate-700/60"
              >
                <ToggleGroupItem value="vertical" className="h-7 text-xs font-semibold px-2.5 rounded-md data-[state=on]:bg-white dark:data-[state=on]:bg-slate-900">
                  Vertical
                </ToggleGroupItem>
                <ToggleGroupItem value="tformat" className="h-7 text-xs font-semibold px-2.5 rounded-md data-[state=on]:bg-white dark:data-[state=on]:bg-slate-900">
                  T-format
                </ToggleGroupItem>
              </ToggleGroup>
            )}
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs font-semibold border-slate-200 dark:border-slate-700 gap-1.5"
              onClick={() => setIsCustomizeOpen(true)}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
              <span>Customize</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs font-semibold border-slate-200 dark:border-slate-700 gap-1.5"
              onClick={() => setIsSetupOpen(true)}
            >
              <Settings2 className="w-3.5 h-3.5 text-slate-500" />
              <span>Setup</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs font-semibold border-slate-200 dark:border-slate-700 gap-1.5"
              onClick={() => window.print()}
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
              <span>Print</span>
            </Button>

            <Button
              size="sm"
              className="h-8 text-xs font-semibold bg-[#FA634E] hover:bg-[#e05440] text-white shadow-xs gap-1.5 cursor-pointer"
              onClick={() => setIsExportOpen(true)}
              disabled={isMainLoading || isEmptyState}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
            </Button>
          </div>
        </div>

        {/* Error State */}
        {isMainError && (
          <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 rounded-xl p-4 text-rose-800 text-xs font-medium flex items-center justify-between">
            <span>Failed to load Profit & Loss statement. Please try again.</span>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => refetchMain()}>
              Retry
            </Button>
          </div>
        )}

        {/* Loading Skeleton */}
        {isMainLoading && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 p-8 space-y-6">
            <Skeleton className="h-8 w-64 mx-auto" />
            <Skeleton className="h-4 w-40 mx-auto" />
            <div className="space-y-4 pt-6">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          </div>
        )}

        {/* MAIN CONTENT GRID: 2 Column on ≥1280px */}
        {!isMainLoading && !isMainError && activeTab === 'statement' && (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4">
            {/* Left: Statement Card */}
            <div className="space-y-4 min-w-0">
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-800 p-5 shadow-xs w-full print:shadow-none print:border-none print:p-0 space-y-4">
                {/* On-Screen Compact Header Bar */}
                <StatementHeaderBar
                  title="Profit and Loss"
                  subtitle="MERCON LOGISTICS CO."
                  periodLabel={`From ${formatDate(dateFrom)} To ${formatDate(dateTo)}`}
                  sourceLabel="Live ledger"
                />

                {/* Print Only Formal Centred Header */}
                <div className="hidden print:block text-center space-y-1 pb-4 border-b border-slate-200">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500">MERCON Logistics</p>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900">Profit and Loss</h1>
                  <p className="text-xs font-medium text-slate-600">
                    From {formatDate(dateFrom)} To {formatDate(dateTo)}
                  </p>
                  <p className="text-[11px] font-mono text-slate-500">Amounts in SAR</p>
                </div>

                {/* VERTICAL LAYOUT */}
                {layout === 'vertical' && (
                  <div className="space-y-5 text-xs">
                    {/* Operating Income Section */}
                    <div id="section-operating_income" className="space-y-2">
                      <div className="h-[38px] px-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-bold rounded-lg flex items-center justify-between">
                        <span className="flex items-center gap-2 text-xs uppercase tracking-wider">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          <span>Operating Income</span>
                        </span>
                        <span className="fin-num text-xs font-bold">{fmtMoney(verticalPnl.operatingIncomeTotal)}</span>
                      </div>

                      <div className="pl-3 space-y-1">
                        {verticalPnl.sections.operating_income.groups.map((group) => {
                          const expanded = isGroupExpanded(`operating_income_${group.name}`);
                          const isSingle = group.isSingleAccount || group.items.length === 1;

                          return (
                            <div key={group.name} className="space-y-0.5">
                              {!isSingle && (
                                <div
                                  onClick={() => toggleGroupCollapse(`operating_income_${group.name}`)}
                                  className="flex items-center justify-between py-1 px-1 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded cursor-pointer font-semibold text-slate-700 dark:text-slate-300"
                                >
                                  <span className="flex items-center gap-1">
                                    {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                    <span>{group.name}</span>
                                  </span>
                                  <span className="fin-num">{fmtMoney(group.total)}</span>
                                </div>
                              )}
                              {(isSingle || expanded) && (
                                <div className={`${isSingle ? '' : 'pl-4'} space-y-0.5`}>
                                  {group.items.map((item) => (
                                    <div
                                      key={item.id || item.code || item.name}
                                      onClick={() => navigate(`/finance/general-ledger?account_id=${item.id}&date_from=${dateFrom}&date_to=${dateTo}`)}
                                      className={`group flex items-center justify-between ${rowHeightClass} px-2 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 rounded-md cursor-pointer transition-colors text-[13px]`}
                                    >
                                      <div className="flex items-center gap-2">
                                        {customize.showAccountCodes && item.code && (
                                          <span className="font-mono text-slate-500 dark:text-slate-400 text-[11px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                            {item.code}
                                          </span>
                                        )}
                                        <span className="font-medium text-slate-800 dark:text-slate-200 group-hover:text-[#FA634E]">
                                          {item.name}
                                        </span>
                                      </div>
                                      <div className="w-36 text-right fin-num">{fmtMoney(item.amount)}</div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Cost of Sales Section */}
                    <div id="section-cost_of_sales" className="space-y-2">
                      <div className="h-[38px] px-3 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 font-bold rounded-lg flex items-center justify-between">
                        <span className="flex items-center gap-2 text-xs uppercase tracking-wider">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          <span>Cost of Sales</span>
                        </span>
                        <span className="fin-num text-xs font-bold">{fmtMoney(verticalPnl.costOfSalesTotal)}</span>
                      </div>

                      <div className="pl-3 space-y-1">
                        {verticalPnl.sections.cost_of_sales.groups.map((group) => {
                          const expanded = isGroupExpanded(`cost_of_sales_${group.name}`);
                          const isSingle = group.isSingleAccount || group.items.length === 1;

                          return (
                            <div key={group.name} className="space-y-0.5">
                              {!isSingle && (
                                <div
                                  onClick={() => toggleGroupCollapse(`cost_of_sales_${group.name}`)}
                                  className="flex items-center justify-between py-1 px-1 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded cursor-pointer font-semibold text-slate-700 dark:text-slate-300"
                                >
                                  <span className="flex items-center gap-1">
                                    {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                    <span>{group.name}</span>
                                  </span>
                                  <span className="fin-num">{fmtMoney(group.total)}</span>
                                </div>
                              )}
                              {(isSingle || expanded) && (
                                <div className={`${isSingle ? '' : 'pl-4'} space-y-0.5`}>
                                  {group.items.map((item) => (
                                    <div
                                      key={item.id || item.code || item.name}
                                      onClick={() => navigate(`/finance/general-ledger?account_id=${item.id}&date_from=${dateFrom}&date_to=${dateTo}`)}
                                      className={`group flex items-center justify-between ${rowHeightClass} px-2 hover:bg-amber-50/40 dark:hover:bg-amber-950/20 rounded-md cursor-pointer transition-colors text-[13px]`}
                                    >
                                      <div className="flex items-center gap-2">
                                        {customize.showAccountCodes && item.code && (
                                          <span className="font-mono text-slate-500 dark:text-slate-400 text-[11px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                            {item.code}
                                          </span>
                                        )}
                                        <span className="font-medium text-slate-800 dark:text-slate-200 group-hover:text-[#FA634E]">
                                          {item.name}
                                        </span>
                                      </div>
                                      <div className="w-36 text-right fin-num">{fmtMoney(item.amount)}</div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Gross Profit Subtotal */}
                    <div className="h-[34px] bg-slate-100/80 dark:bg-slate-800/80 px-3 rounded-md flex items-center justify-between font-bold text-slate-900 dark:text-slate-100">
                      <span>Gross Profit</span>
                      <span className={`fin-num ${verticalPnl.grossProfit < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                        {fmtMoney(verticalPnl.grossProfit)}
                      </span>
                    </div>

                    {/* Operating Expense Section */}
                    <div id="section-operating_expense" className="space-y-2">
                      <div className="h-[38px] px-3 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 font-bold rounded-lg flex items-center justify-between">
                        <span className="flex items-center gap-2 text-xs uppercase tracking-wider">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                          <span>Operating Expenses</span>
                        </span>
                        <span className="fin-num text-xs font-bold">{fmtMoney(verticalPnl.operatingExpenseTotal)}</span>
                      </div>

                      <div className="pl-3 space-y-1">
                        {verticalPnl.sections.operating_expense.groups.map((group) => {
                          const expanded = isGroupExpanded(`operating_expense_${group.name}`);
                          const isSingle = group.isSingleAccount || group.items.length === 1;

                          return (
                            <div key={group.name} className="space-y-0.5">
                              {!isSingle && (
                                <div
                                  onClick={() => toggleGroupCollapse(`operating_expense_${group.name}`)}
                                  className="flex items-center justify-between py-1 px-1 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded cursor-pointer font-semibold text-slate-700 dark:text-slate-300"
                                >
                                  <span className="flex items-center gap-1">
                                    {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                    <span>{group.name}</span>
                                  </span>
                                  <span className="fin-num">{fmtMoney(group.total)}</span>
                                </div>
                              )}
                              {(isSingle || expanded) && (
                                <div className={`${isSingle ? '' : 'pl-4'} space-y-0.5`}>
                                  {group.items.map((item) => (
                                    <div
                                      key={item.id || item.code || item.name}
                                      onClick={() => navigate(`/finance/general-ledger?account_id=${item.id}&date_from=${dateFrom}&date_to=${dateTo}`)}
                                      className={`group flex items-center justify-between ${rowHeightClass} px-2 hover:bg-rose-50/40 dark:hover:bg-rose-950/20 rounded-md cursor-pointer transition-colors text-[13px]`}
                                    >
                                      <div className="flex items-center gap-2">
                                        {customize.showAccountCodes && item.code && (
                                          <span className="font-mono text-slate-500 dark:text-slate-400 text-[11px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                            {item.code}
                                          </span>
                                        )}
                                        <span className="font-medium text-slate-800 dark:text-slate-200 group-hover:text-[#FA634E]">
                                          {item.name}
                                        </span>
                                      </div>
                                      <div className="w-36 text-right fin-num">{fmtMoney(item.amount)}</div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Operating Profit Subtotal */}
                    <div className="h-[34px] bg-slate-100/80 dark:bg-slate-800/80 px-3 rounded-md flex items-center justify-between font-bold text-slate-900 dark:text-slate-100">
                      <span>Operating Profit</span>
                      <span className={`fin-num ${verticalPnl.operatingProfit < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                        {fmtMoney(verticalPnl.operatingProfit)}
                      </span>
                    </div>

                    {/* Net Profit / Net Loss Grand Total */}
                    <div className="bg-[#3E3C3D] text-white rounded-lg h-[40px] px-4 flex items-center justify-between font-extrabold text-sm shadow-xs mt-3">
                      <span className="uppercase tracking-wider">
                        {verticalPnl.netProfit >= 0 ? 'NET PROFIT' : 'NET LOSS'}
                      </span>
                      <span className={`fin-num text-sm font-extrabold ${verticalPnl.netProfit >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {fmtMoney(verticalPnl.netProfit)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Sticky Insight Rail */}
            <div className="xl:sticky xl:top-4 self-start space-y-4">
              <InsightRail
                mode="pnl"
                data={{
                  operatingIncomeTotal: verticalPnl.operatingIncomeTotal,
                  costOfSalesTotal: verticalPnl.costOfSalesTotal,
                  operatingExpenseTotal: verticalPnl.operatingExpenseTotal,
                  nonOperatingExpenseTotal: verticalPnl.nonOperatingExpenseTotal,
                  otherIncomeTotal: verticalPnl.otherIncomeTotal,
                  netProfit: verticalPnl.netProfit,
                }}
                onJumpTo={(id) => {
                  const el = document.getElementById(id);
                  if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.classList.add('ring-2', 'ring-[#FA634E]', 'transition-all');
                    setTimeout(() => el.classList.remove('ring-2', 'ring-[#FA634E]'), 1500);
                  }
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Customize Sheet */}
      <Sheet open={isCustomizeOpen} onOpenChange={setIsCustomizeOpen}>
        <SheetContent className="w-80 sm:w-96 p-6 space-y-6">
          <SheetHeader>
            <SheetTitle className="text-base font-bold">Customize P&L Statement</SheetTitle>
            <SheetDescription className="text-xs">Adjust view options and density</SheetDescription>
          </SheetHeader>

          <div className="space-y-5 text-xs">
            <div className="flex items-center justify-between">
              <Label htmlFor="pnl-codes" className="cursor-pointer font-medium">Show Account Codes</Label>
              <Switch
                id="pnl-codes"
                checked={customize.showAccountCodes}
                onCheckedChange={(val) => setCustomize((prev) => ({ ...prev, showAccountCodes: val }))}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="pnl-zero" className="cursor-pointer font-medium">Show Zero-Balance Rows</Label>
              <Switch
                id="pnl-zero"
                checked={customize.showZeroBalance}
                onCheckedChange={(val) => setCustomize((prev) => ({ ...prev, showZeroBalance: val }))}
              />
            </div>

            <div className="space-y-2">
              <Label className="font-semibold text-slate-700 dark:text-slate-300">Density</Label>
              <RadioGroup
                value={customize.density}
                onValueChange={(val: 'compact' | 'comfortable') => setCustomize((prev) => ({ ...prev, density: val }))}
                className="grid grid-cols-2 gap-2"
              >
                <div>
                  <RadioGroupItem value="compact" id="pnl-d-compact" className="peer sr-only" />
                  <Label
                    htmlFor="pnl-d-compact"
                    className="flex flex-col items-center justify-between rounded-md border-2 border-slate-200 p-2 hover:bg-slate-50 peer-data-[state=checked]:border-[#FA634E] cursor-pointer text-center"
                  >
                    <span className="font-bold text-xs">Compact</span>
                    <span className="text-[10px] text-slate-500">32px / 34px</span>
                  </Label>
                </div>
                <div>
                  <RadioGroupItem value="comfortable" id="pnl-d-comf" className="peer sr-only" />
                  <Label
                    htmlFor="pnl-d-comf"
                    className="flex flex-col items-center justify-between rounded-md border-2 border-slate-200 p-2 hover:bg-slate-50 peer-data-[state=checked]:border-[#FA634E] cursor-pointer text-center"
                  >
                    <span className="font-bold text-xs">Comfortable</span>
                    <span className="text-[10px] text-slate-500">38px / 40px</span>
                  </Label>
                </div>
              </RadioGroup>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Setup Sheet with Reset to Defaults */}
      <Sheet open={isSetupOpen} onOpenChange={setIsSetupOpen}>
        <SheetContent className="w-80 sm:w-96 p-6 space-y-6">
          <SheetHeader>
            <SheetTitle className="text-base font-bold">Statement Setup</SheetTitle>
            <SheetDescription className="text-xs">Manage P&L account classifications and reset overrides</SheetDescription>
          </SheetHeader>

          <div className="space-y-4 text-xs">
            <p className="text-slate-600 dark:text-slate-400">
              Custom overrides saved in your browser: <span className="font-bold">{Object.keys(classifications).length} entries</span>.
            </p>

            <Button
              variant="outline"
              size="sm"
              onClick={handleResetSetup}
              className="w-full text-xs font-semibold text-rose-600 border-rose-200 hover:bg-rose-50 gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to defaults</span>
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Export Modal */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        data={exportData}
        columns={exportColumns}
        filename={`Profit_Loss_${dateFrom}_${dateTo}`}
        title="Export Profit & Loss Statement"
      />
    </DashboardLayout>
  );
}

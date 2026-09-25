import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Download,
  Printer,
  SlidersHorizontal,
  Settings2,
  ChevronRight,
  ChevronDown,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import ExportModal, { type ExportColumn } from '@/components/ui/ExportModal';

import { StatementHeaderBar, InsightRail, StatementRow } from '@/components/finance/kit';
import { financeService } from '@/services/financeService';
import { formatMoney, formatDate } from '@/lib/finance/format';
import {
  buildStructuredVerticalPnl,
  buildStructuredTFormatPnl,
  getDefaultPnlClass,
  clearPnlStoredOverrides,
  PNL_CLASS_LABELS,
  type PnlClass,
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
    return resolveCompareColumns(dateFrom, dateTo, compareOpt as CompareOption);
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

  return (
    <DashboardLayout active="finance" title="Profit & Loss" fixedViewport>
      <div className="p-4 flex flex-col flex-1 min-h-0 gap-3 overflow-hidden h-full max-md:overflow-y-auto max-md:h-auto max-w-[1400px] mx-auto w-full print:p-0">
        {/* Single-Row Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 shrink-0 print:hidden">
          <div className="flex items-center gap-2 flex-wrap">
            {/* View Tabs */}
            <ToggleGroup
              value={[activeTab]}
              onValueChange={(v: string[]) => v[0] && updateParams({ tab: v[0] })}
              className="bg-muted p-[3px] rounded-lg border border-border/60"
            >
              <ToggleGroupItem
                value="statement"
                className="h-7 text-xs font-medium px-3 rounded-md data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-xs"
              >
                Statement
              </ToggleGroupItem>
              <ToggleGroupItem
                value="analysis"
                className="h-7 text-xs font-medium px-3 rounded-md data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-xs"
              >
                Analysis
              </ToggleGroupItem>
            </ToggleGroup>

            <div className="h-4 w-px bg-border hidden sm:block" />

            {/* Period Preset Select */}
            <Select value={periodPreset} onValueChange={(val) => handlePeriodPresetChange(val as PeriodPreset)}>
              <SelectTrigger className="h-8 text-xs w-[130px] bg-background border-border font-medium text-foreground">
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
            <div className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset bg-muted text-muted-foreground ring-border">
              {formatDate(dateFrom)} – {formatDate(dateTo)}
            </div>

            {/* Layout Toggle */}
            {activeTab === 'statement' && (
              <ToggleGroup
                value={[layout]}
                onValueChange={(val: string[]) => val[0] && updateParams({ layout: val[0] })}
                className="bg-muted p-[3px] rounded-lg border border-border/60"
              >
                <ToggleGroupItem value="vertical" className="h-7 text-xs font-medium px-2.5 rounded-md data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-xs">
                  Vertical
                </ToggleGroupItem>
                <ToggleGroupItem value="tformat" className="h-7 text-xs font-medium px-2.5 rounded-md data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-xs">
                  T-format
                </ToggleGroupItem>
              </ToggleGroup>
            )}
          </div>

          {/* Right Actions - NO FILLED BUTTONS PER R6 (Export is outline) */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs font-medium border-border gap-1.5"
              onClick={() => setIsCustomizeOpen(true)}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
              <span>Customize</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs font-medium border-border gap-1.5"
              onClick={() => setIsSetupOpen(true)}
            >
              <Settings2 className="w-3.5 h-3.5 text-muted-foreground" />
              <span>Setup</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs font-medium border-border gap-1.5"
              onClick={() => window.print()}
            >
              <Printer className="w-3.5 h-3.5 text-muted-foreground" />
              <span>Print</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs font-medium border-border gap-1.5"
              onClick={() => setIsExportOpen(true)}
              disabled={isMainLoading || isEmptyState}
            >
              <Download className="w-3.5 h-3.5 text-muted-foreground" />
              <span>Export</span>
            </Button>
          </div>
        </div>

        {/* Error State */}
        {isMainError && (
          <div className="bg-rose-500/10 border border-rose-600/20 rounded-xl p-4 text-rose-700 dark:text-rose-300 text-xs font-medium flex items-center justify-between">
            <span>Failed to load Profit & Loss statement. Please try again.</span>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => refetchMain()}>
              Retry
            </Button>
          </div>
        )}

        {/* Loading Skeleton */}
        {isMainLoading && (
          <div className="bg-card rounded-xl border border-border p-8 space-y-6 shadow-xs">
            <Skeleton className="h-8 w-64 mx-auto" />
            <Skeleton className="h-4 w-40 mx-auto" />
            <div className="space-y-4 pt-6">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          </div>
        )}

        {/* MAIN CONTENT GRID */}
        {!isMainLoading && !isMainError && activeTab === 'statement' && (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4 flex-1 min-h-0 overflow-hidden max-md:overflow-y-auto">
            {/* Left: Statement Card */}
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="bg-card rounded-xl border border-border shadow-xs w-full p-0 flex flex-col flex-1 min-h-0 overflow-hidden print:shadow-none print:border-none print:p-0">
                {/* On-Screen Header Bar */}
                <StatementHeaderBar
                  title="Profit and Loss"
                  subtitle="MERCON LOGISTICS CO."
                  periodLabel={`From ${formatDate(dateFrom)} To ${formatDate(dateTo)}`}
                  sourceLabel="Live ledger"
                />

                {/* VERTICAL LAYOUT */}
                {layout === 'vertical' && (
                  <div className="table-container flex-1 overflow-auto py-2 text-xs space-y-4">
                    {/* Operating Income Section */}
                    {(customize.showZeroBalance || verticalPnl.operatingIncomeTotal !== 0 || verticalPnl.sections.operating_income.groups.length > 0) && (
                      <div id="section-operating_income" className="space-y-0.5">
                        <StatementRow
                          level={0}
                          variant="section"
                          dotColor="bg-emerald-500"
                          label="Operating income"
                          amounts={verticalPnl.operatingIncomeTotal}
                        />

                        {verticalPnl.sections.operating_income.groups.map((group) => {
                          if (!customize.showZeroBalance && group.total === 0) return null;
                          const expanded = isGroupExpanded(`operating_income_${group.name}`);
                          const isSingle = group.isSingleAccount || group.items.length === 1;

                          return (
                            <div key={group.name} className="space-y-0.5">
                              {!isSingle && (
                                <StatementRow
                                  level={1}
                                  variant="subgroup"
                                  label={group.name}
                                  prefix={
                                    <button
                                      type="button"
                                      onClick={() => toggleGroupCollapse(`operating_income_${group.name}`)}
                                      className="p-0.5 hover:bg-muted rounded text-muted-foreground shrink-0"
                                    >
                                      {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                    </button>
                                  }
                                  amounts={{ value: group.total, className: 'text-muted-foreground font-medium' }}
                                />
                              )}
                              {(isSingle || expanded) && (
                                <div className="space-y-0.5">
                                  {group.items.map((item) => {
                                    if (!customize.showZeroBalance && item.amount === 0) return null;
                                    return (
                                      <StatementRow
                                        key={item.id || item.code || item.name}
                                        level={isSingle ? 1 : 2}
                                        variant="account"
                                        code={customize.showAccountCodes && item.code ? item.code : undefined}
                                        label={item.name}
                                        amounts={item.amount}
                                        onClick={() => navigate(`/finance/general-ledger?account_id=${item.id}&date_from=${dateFrom}&date_to=${dateTo}`)}
                                      />
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Cost of Sales Section */}
                    {(customize.showZeroBalance || verticalPnl.costOfSalesTotal !== 0 || verticalPnl.sections.cost_of_sales.groups.length > 0) && (
                      <div id="section-cost_of_sales" className="space-y-0.5">
                        <StatementRow
                          level={0}
                          variant="section"
                          dotColor="bg-amber-500"
                          label="Cost of sales"
                          amounts={verticalPnl.costOfSalesTotal}
                        />

                        {verticalPnl.sections.cost_of_sales.groups.map((group) => {
                          if (!customize.showZeroBalance && group.total === 0) return null;
                          const expanded = isGroupExpanded(`cost_of_sales_${group.name}`);
                          const isSingle = group.isSingleAccount || group.items.length === 1;

                          return (
                            <div key={group.name} className="space-y-0.5">
                              {!isSingle && (
                                <StatementRow
                                  level={1}
                                  variant="subgroup"
                                  label={group.name}
                                  prefix={
                                    <button
                                      type="button"
                                      onClick={() => toggleGroupCollapse(`cost_of_sales_${group.name}`)}
                                      className="p-0.5 hover:bg-muted rounded text-muted-foreground shrink-0"
                                    >
                                      {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                    </button>
                                  }
                                  amounts={{ value: group.total, className: 'text-muted-foreground font-medium' }}
                                />
                              )}
                              {(isSingle || expanded) && (
                                <div className="space-y-0.5">
                                  {group.items.map((item) => {
                                    if (!customize.showZeroBalance && item.amount === 0) return null;
                                    return (
                                      <StatementRow
                                        key={item.id || item.code || item.name}
                                        level={isSingle ? 1 : 2}
                                        variant="account"
                                        code={customize.showAccountCodes && item.code ? item.code : undefined}
                                        label={item.name}
                                        amounts={item.amount}
                                        onClick={() => navigate(`/finance/general-ledger?account_id=${item.id}&date_from=${dateFrom}&date_to=${dateTo}`)}
                                      />
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Gross Profit Subtotal */}
                    <StatementRow
                      level={1}
                      variant="subtotal"
                      label="Gross profit"
                      amounts={{
                        value: verticalPnl.grossProfit,
                        className: verticalPnl.grossProfit < 0 ? 'text-rose-600 dark:text-rose-400 font-medium' : 'font-medium text-foreground',
                      }}
                    />

                    {/* Operating Expenses Section */}
                    {(customize.showZeroBalance || verticalPnl.operatingExpenseTotal !== 0 || verticalPnl.sections.operating_expense.groups.length > 0) && (
                      <div id="section-operating_expense" className="space-y-0.5">
                        <StatementRow
                          level={0}
                          variant="section"
                          dotColor="bg-rose-500"
                          label="Operating expenses"
                          amounts={verticalPnl.operatingExpenseTotal}
                        />

                        {verticalPnl.sections.operating_expense.groups.map((group) => {
                          if (!customize.showZeroBalance && group.total === 0) return null;
                          const expanded = isGroupExpanded(`operating_expense_${group.name}`);
                          const isSingle = group.isSingleAccount || group.items.length === 1;

                          return (
                            <div key={group.name} className="space-y-0.5">
                              {!isSingle && (
                                <StatementRow
                                  level={1}
                                  variant="subgroup"
                                  label={group.name}
                                  prefix={
                                    <button
                                      type="button"
                                      onClick={() => toggleGroupCollapse(`operating_expense_${group.name}`)}
                                      className="p-0.5 hover:bg-muted rounded text-muted-foreground shrink-0"
                                    >
                                      {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                    </button>
                                  }
                                  amounts={{ value: group.total, className: 'text-muted-foreground font-medium' }}
                                />
                              )}
                              {(isSingle || expanded) && (
                                <div className="space-y-0.5">
                                  {group.items.map((item) => {
                                    if (!customize.showZeroBalance && item.amount === 0) return null;
                                    return (
                                      <StatementRow
                                        key={item.id || item.code || item.name}
                                        level={isSingle ? 1 : 2}
                                        variant="account"
                                        code={customize.showAccountCodes && item.code ? item.code : undefined}
                                        label={item.name}
                                        amounts={item.amount}
                                        onClick={() => navigate(`/finance/general-ledger?account_id=${item.id}&date_from=${dateFrom}&date_to=${dateTo}`)}
                                      />
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Operating Profit Subtotal */}
                    <StatementRow
                      level={1}
                      variant="subtotal"
                      label="Operating profit"
                      amounts={{
                        value: verticalPnl.operatingProfit,
                        className: verticalPnl.operatingProfit < 0 ? 'text-rose-600 dark:text-rose-400 font-medium' : 'font-medium text-foreground',
                      }}
                    />

                    {/* Net Profit / Net Loss Grand Total */}
                    <StatementRow
                      level={0}
                      variant="grandtotal"
                      label={verticalPnl.netProfit >= 0 ? 'Net profit' : 'Net loss'}
                      amounts={{
                        value: verticalPnl.netProfit,
                        className: verticalPnl.netProfit < 0 ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'font-semibold text-foreground',
                      }}
                    />
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
            <SheetTitle className="text-base font-semibold">Customize P&L Statement</SheetTitle>
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
              <Label className="font-semibold text-foreground">Density</Label>
              <RadioGroup
                value={customize.density}
                onValueChange={(val: 'compact' | 'comfortable') => setCustomize((prev) => ({ ...prev, density: val }))}
                className="grid grid-cols-2 gap-2"
              >
                <div>
                  <RadioGroupItem value="compact" id="pnl-d-compact" className="peer sr-only" />
                  <Label
                    htmlFor="pnl-d-compact"
                    className="flex flex-col items-center justify-between rounded-md border-2 border-border p-2 hover:bg-muted peer-data-[state=checked]:border-ring cursor-pointer text-center"
                  >
                    <span className="font-medium text-xs">Compact</span>
                    <span className="text-[10px] text-muted-foreground">32px / 34px</span>
                  </Label>
                </div>
                <div>
                  <RadioGroupItem value="comfortable" id="pnl-d-comf" className="peer sr-only" />
                  <Label
                    htmlFor="pnl-d-comf"
                    className="flex flex-col items-center justify-between rounded-md border-2 border-border p-2 hover:bg-muted peer-data-[state=checked]:border-ring cursor-pointer text-center"
                  >
                    <span className="font-medium text-xs">Comfortable</span>
                    <span className="text-[10px] text-muted-foreground">38px / 40px</span>
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
            <SheetTitle className="text-base font-semibold">Statement Setup</SheetTitle>
            <SheetDescription className="text-xs">Manage P&L account classifications and reset overrides</SheetDescription>
          </SheetHeader>

          <div className="space-y-4 text-xs">
            <p className="text-muted-foreground">
              Custom overrides saved in your browser: <span className="font-medium text-foreground">{Object.keys(classifications).length} entries</span>.
            </p>

            <Button
              variant="outline"
              size="sm"
              onClick={handleResetSetup}
              className="w-full text-xs font-medium text-rose-600 border-border hover:bg-muted gap-1.5"
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


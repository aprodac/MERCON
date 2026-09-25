import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueries } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronRight,
  Download,
  Printer,
  SlidersHorizontal,
  ExternalLink,
  Info,
  Calendar as CalendarIcon,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import ExportModal, { type ExportColumn } from '@/components/ui/ExportModal';

import { StatementHeaderBar, InsightRail } from '@/components/finance/kit';
import { financeService, type ReportLineItem, type BalanceSheetData } from '@/services/financeService';
import { formatMoney, formatDate } from '@/lib/finance/format';
import {
  classifyAssetAccount,
  classifyLiabilityAccount,
  classifyEquityAccount,
  getStoredOverrides,
  saveStoredOverrides,
  clearBsStoredOverrides,
  type AssetCategory,
  type AssetSubCategory,
  type LiabilityCategory,
  type LiabilitySubCategory,
} from '@/lib/finance/bsStructure';

interface ExtendedLineItem extends ReportLineItem {
  category: AssetCategory | LiabilityCategory | 'Capital account';
  subCategory?: AssetSubCategory | LiabilitySubCategory;
}

export default function BalanceSheetPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const todayIso = new Date().toISOString().slice(0, 10);
  const asOf = searchParams.get('as_of') || todayIso;
  const activeTab = searchParams.get('tab') || 'statement';
  const layout = (searchParams.get('layout') as 'vertical' | 'horizontal') || 'vertical';
  const compareMode = searchParams.get('compare') || 'none';
  const showCodes = searchParams.get('codes') !== 'false';
  const showZeroRows = searchParams.get('zeroRows') === 'true';
  const density = (searchParams.get('density') as 'compact' | 'comfortable') || 'compact';
  const negFormat = (searchParams.get('negFormat') as 'minus' | 'parens') || 'minus';

  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [overrides, setOverrides] = useState<Record<string, string>>(() => getStoredOverrides());
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  const updateParam = (key: string, val: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (val === null || val === '') {
        next.delete(key);
      } else {
        next.set(key, val);
      }
      return next;
    });
  };

  // Primary Balance Sheet Query
  const { data: reportRes, isLoading, isError, refetch } = useQuery({
    queryKey: ['finance-reports', 'balance-sheet', asOf],
    queryFn: () => financeService.getBalanceSheet({ as_of: asOf }),
  });

  const report = reportRes?.data;

  // Comparison Dates Calculation
  const compareDateStr = useMemo(() => {
    if (compareMode === 'none') return null;
    const current = new Date(asOf);
    if (compareMode === 'prev_month') {
      const lastMonth = new Date(current.getFullYear(), current.getMonth(), 0);
      return lastMonth.toISOString().slice(0, 10);
    }
    if (compareMode === 'prev_year') {
      const lastYear = new Date(current.getFullYear() - 1, current.getMonth() + 1, 0);
      return lastYear.toISOString().slice(0, 10);
    }
    return null;
  }, [asOf, compareMode]);

  // Comparison Balance Sheet Query
  const { data: compareReportRes } = useQuery({
    queryKey: ['finance-reports', 'balance-sheet', compareDateStr],
    queryFn: () => financeService.getBalanceSheet({ as_of: compareDateStr || undefined }),
    enabled: Boolean(compareDateStr && compareMode !== 'none'),
  });

  const compareReport = compareReportRes?.data;

  // Process & Classify Accounts
  const processedData = useMemo(() => {
    if (!report) return null;

    const classifiedAssets: ExtendedLineItem[] = report.assets
      .filter((a) => showZeroRows || Math.abs(a.amount) > 0.0001)
      .map((a) => {
        const clsf = classifyAssetAccount(a, overrides);
        return { ...a, category: clsf.category, subCategory: clsf.subCategory };
      });

    const classifiedLiabilities: ExtendedLineItem[] = report.liabilities
      .filter((l) => showZeroRows || Math.abs(l.amount) > 0.0001)
      .map((l) => {
        const clsf = classifyLiabilityAccount(l, overrides);
        return { ...l, category: clsf.category, subCategory: clsf.subCategory };
      });

    const classifiedEquity: ExtendedLineItem[] = report.equity
      .filter((e) => showZeroRows || Math.abs(e.amount) > 0.0001)
      .map((e) => {
        const clsf = classifyEquityAccount(e, overrides);
        return { ...e, category: clsf.category };
      });

    // Grouping
    const assetSubGroups: Record<AssetSubCategory, ExtendedLineItem[]> = {
      'Cash & bank': [],
      Receivables: [],
      'Advances & prepayments': [],
      'Other current assets': [],
    };
    const fixedAssets: ExtendedLineItem[] = [];
    const investments: ExtendedLineItem[] = [];

    classifiedAssets.forEach((a) => {
      if (a.category === 'Current assets' && a.subCategory) {
        const target = (assetSubGroups as Record<string, ExtendedLineItem[]>)[a.subCategory];
        if (target) target.push(a);
      } else if (a.category === 'Fixed assets') {
        fixedAssets.push(a);
      } else if (a.category === 'Investments') {
        investments.push(a);
      }
    });

    const liabilitySubGroups: Record<LiabilitySubCategory, ExtendedLineItem[]> = {
      Payables: [],
      'Advances from customers': [],
      'Accruals & other': [],
    };
    const longTermLiabilities: ExtendedLineItem[] = [];

    classifiedLiabilities.forEach((l) => {
      if (l.category === 'Current liabilities' && l.subCategory) {
        const target = (liabilitySubGroups as Record<string, ExtendedLineItem[]>)[l.subCategory];
        if (target) target.push(l);
      } else if (l.category === 'Long-term liabilities') {
        longTermLiabilities.push(l);
      }
    });

    // Subtotals
    const currentAssetsTotal = Object.values(assetSubGroups)
      .flat()
      .reduce((sum, item) => sum + item.amount, 0);
    const fixedAssetsTotal = fixedAssets.reduce((sum, item) => sum + item.amount, 0);
    const investmentsTotal = investments.reduce((sum, item) => sum + item.amount, 0);

    const currentLiabilitiesTotal = Object.values(liabilitySubGroups)
      .flat()
      .reduce((sum, item) => sum + item.amount, 0);
    const longTermLiabilitiesTotal = longTermLiabilities.reduce((sum, item) => sum + item.amount, 0);

    const totalLiabilities = currentLiabilitiesTotal + longTermLiabilitiesTotal;
    const totalEquity = classifiedEquity.reduce((sum, item) => sum + item.amount, 0);
    const totalAssets = currentAssetsTotal + fixedAssetsTotal + investmentsTotal;
    const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;

    return {
      classifiedAssets,
      classifiedLiabilities,
      classifiedEquity,
      assetSubGroups,
      fixedAssets,
      investments,
      liabilitySubGroups,
      longTermLiabilities,
      currentAssetsTotal,
      fixedAssetsTotal,
      investmentsTotal,
      currentLiabilitiesTotal,
      longTermLiabilitiesTotal,
      totalAssets,
      totalLiabilities,
      totalEquity,
      totalLiabilitiesAndEquity,
    };
  }, [report, showZeroRows, overrides]);

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const renderAmount = (amount: number, isTotal = false) => {
    const formatted = formatMoney(Math.abs(amount));
    if (amount < 0) {
      const displayStr = negFormat === 'parens' ? `(${formatted})` : `−${formatted}`;
      return <span className="text-rose-600 dark:text-rose-400 fin-num font-medium">{displayStr}</span>;
    }
    return (
      <span className={`fin-num ${isTotal ? 'font-bold text-slate-900 dark:text-slate-100' : 'font-medium text-slate-800 dark:text-slate-200'}`}>
        {formatted}
      </span>
    );
  };

  const handleAccountClick = (item: ReportLineItem) => {
    if (item.kind === 'current_year_earnings') {
      const year = new Date(asOf).getFullYear();
      navigate(`/finance/profit-and-loss?date_from=${year}-01-01&date_to=${asOf}`);
    } else if (item.kind === 'unclosed_prior_earnings') {
      const prevYear = new Date(asOf).getFullYear() - 1;
      navigate(`/finance/profit-and-loss?date_from=${prevYear}-01-01&date_to=${prevYear}-12-31`);
    } else if (item.account_id) {
      navigate(`/finance/general-ledger?account_id=${item.account_id}&date_to=${asOf}`);
    }
  };

  const handlePreset = (preset: 'today' | 'last_month' | 'last_quarter' | 'last_year') => {
    const now = new Date();
    let targetStr = todayIso;
    if (preset === 'last_month') {
      const d = new Date(now.getFullYear(), now.getMonth(), 0);
      targetStr = d.toISOString().slice(0, 10);
    } else if (preset === 'last_quarter') {
      const currentQuarterMonth = Math.floor(now.getMonth() / 3) * 3;
      const d = new Date(now.getFullYear(), currentQuarterMonth, 0);
      targetStr = d.toISOString().slice(0, 10);
    } else if (preset === 'last_year') {
      const d = new Date(now.getFullYear() - 1, 12, 0);
      targetStr = d.toISOString().slice(0, 10);
    }
    updateParam('as_of', targetStr);
    setIsCalendarOpen(false);
  };

  const exportData = useMemo(() => {
    if (!processedData) return [];
    const rows: (ExtendedLineItem & { section: string })[] = [];
    processedData.classifiedAssets.forEach((a) => rows.push({ ...a, section: 'Assets' }));
    processedData.classifiedLiabilities.forEach((l) => rows.push({ ...l, section: 'Liabilities' }));
    processedData.classifiedEquity.forEach((e) => rows.push({ ...e, section: 'Equity' }));
    return rows;
  }, [processedData]);

  const exportColumns: ExportColumn<ExtendedLineItem & { section: string }>[] = [
    { id: 'section', label: 'Section', accessor: (r) => r.section },
    { id: 'category', label: 'Category', accessor: (r) => r.category },
    { id: 'subCategory', label: 'Sub Category', accessor: (r) => r.subCategory || '—' },
    { id: 'account_code', label: 'Account Code', accessor: (r) => r.account_code || '—' },
    { id: 'name', label: 'Account Name', accessor: (r) => r.name },
    { id: 'amount', label: 'Amount (SAR)', accessor: (r) => r.amount },
  ];

  const handleResetDefaults = () => {
    clearBsStoredOverrides();
    setOverrides({});
    toast.success('Classification overrides reset to defaults');
  };

  const rowHeightClass = density === 'comfortable' ? 'h-9' : 'h-8';

  return (
    <DashboardLayout active="finance" title="Balance Sheet">
      <div className="p-4 space-y-4 max-w-[1400px] mx-auto print:p-0">
        {/* Single-Row Toolbar (No Card Wrapper) */}
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* View Tabs */}
            <ToggleGroup
              value={[activeTab]}
              onValueChange={(v: string[]) => v[0] && updateParam('tab', v[0])}
              className="bg-[#F4F4F5] dark:bg-slate-800/80 p-0.5 rounded-lg border border-slate-200/60 dark:border-slate-700/60"
            >
              <ToggleGroupItem
                value="statement"
                className="h-7 text-xs font-semibold px-3 rounded-md data-[state=on]:bg-white dark:data-[state=on]:bg-slate-900 data-[state=on]:text-[#3E3C3D] dark:data-[state=on]:text-slate-100 data-[state=on]:shadow-2xs"
              >
                Statement
              </ToggleGroupItem>
              <ToggleGroupItem
                value="analysis"
                className="h-7 text-xs font-semibold px-3 rounded-md data-[state=on]:bg-white dark:data-[state=on]:bg-slate-900 data-[state=on]:text-[#3E3C3D] dark:data-[state=on]:text-slate-100 data-[state=on]:shadow-2xs"
              >
                Analysis
              </ToggleGroupItem>
            </ToggleGroup>

            <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />

            {/* As Of Date Popover */}
            <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs font-semibold bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 gap-1.5"
                >
                  <CalendarIcon className="w-3.5 h-3.5 text-[#FA634E]" />
                  <span>As of {formatDate(asOf)}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-3 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 space-y-3" align="start">
                <div className="grid grid-cols-2 gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-2.5">
                  <Button variant="ghost" size="sm" className="h-7 text-[11px] justify-start px-2 font-medium" onClick={() => handlePreset('today')}>
                    Today
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-[11px] justify-start px-2 font-medium" onClick={() => handlePreset('last_month')}>
                    End of last month
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-[11px] justify-start px-2 font-medium" onClick={() => handlePreset('last_quarter')}>
                    End of last quarter
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-[11px] justify-start px-2 font-medium" onClick={() => handlePreset('last_year')}>
                    End of last year
                  </Button>
                </div>
                <Calendar
                  mode="single"
                  selected={new Date(asOf)}
                  onSelect={(date) => {
                    if (date) {
                      updateParam('as_of', date.toISOString().slice(0, 10));
                      setIsCalendarOpen(false);
                    }
                  }}
                />
              </PopoverContent>
            </Popover>

            {/* Layout Switch */}
            {activeTab === 'statement' && (
              <ToggleGroup
                value={[layout]}
                onValueChange={(v: string[]) => v[0] && updateParam('layout', v[0])}
                className="bg-[#F4F4F5] dark:bg-slate-800/80 p-0.5 rounded-lg border border-slate-200/60 dark:border-slate-700/60"
              >
                <ToggleGroupItem value="vertical" className="h-7 text-xs font-semibold px-2.5 rounded-md data-[state=on]:bg-white dark:data-[state=on]:bg-slate-900">
                  Vertical
                </ToggleGroupItem>
                <ToggleGroupItem value="horizontal" className="h-7 text-xs font-semibold px-2.5 rounded-md data-[state=on]:bg-white dark:data-[state=on]:bg-slate-900">
                  Horizontal
                </ToggleGroupItem>
              </ToggleGroup>
            )}

            {/* Compare Select */}
            {activeTab === 'statement' && (
              <Select value={compareMode} onValueChange={(v) => updateParam('compare', v)}>
                <SelectTrigger className="h-8 text-xs w-44 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 font-medium">
                  <SelectValue placeholder="Compare: None" />
                </SelectTrigger>
                <SelectContent className="text-xs font-medium">
                  <SelectItem value="none">Compare: None</SelectItem>
                  <SelectItem value="prev_month">Previous month end</SelectItem>
                  <SelectItem value="prev_year">Previous year end</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs font-semibold text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 gap-1.5"
              onClick={() => setIsCustomizeOpen(true)}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
              <span>Customize</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs font-semibold text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 gap-1.5"
              onClick={() => setIsSetupOpen(true)}
            >
              <span>Setup</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs font-semibold text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 gap-1.5"
              onClick={() => window.print()}
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
              <span>Print</span>
            </Button>

            <Button
              size="sm"
              className="h-8 text-xs font-semibold bg-[#FA634E] hover:bg-[#e05440] text-white shadow-xs gap-1.5 cursor-pointer"
              onClick={() => setIsExportOpen(true)}
              disabled={isLoading || !processedData}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
            </Button>
          </div>
        </div>

        {/* Error State */}
        {isError && (
          <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl p-4 text-rose-800 dark:text-rose-200 text-xs font-medium flex items-center justify-between">
            <span>Failed to load Balance Sheet statement. Please try again.</span>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        )}

        {/* Loading Skeleton */}
        {isLoading && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 p-8 space-y-6">
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
        {!isLoading && report && processedData && activeTab === 'statement' && (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4">
            {/* Left: Statement Card */}
            <div className="space-y-4 min-w-0">
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-800 p-5 shadow-xs w-full print:shadow-none print:border-none print:p-0 space-y-4">
                {/* On-Screen Compact Header Bar */}
                <StatementHeaderBar
                  title="Balance Sheet"
                  subtitle="MERCON LOGISTICS CO."
                  periodLabel={`As of ${formatDate(asOf)}`}
                  sourceLabel={report.using_snapshot ? 'Period snapshot' : 'Live ledger'}
                />

                {/* Print Only Formal Centred Header */}
                <div className="hidden print:block text-center space-y-1 pb-4 border-b border-slate-200">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500">MERCON Logistics</p>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900">Balance Sheet</h1>
                  <p className="text-xs font-medium text-slate-600">As of {formatDate(asOf)}</p>
                  <p className="text-[11px] font-mono text-slate-500">Amounts in SAR</p>
                </div>

                {/* VERTICAL LAYOUT */}
                {layout === 'vertical' && (
                  <div className="space-y-5 text-xs">
                    {/* ── ASSETS SECTION ── */}
                    <div id="section-assets" className="space-y-2">
                      <div className="h-[38px] px-3 bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300 font-bold rounded-lg flex items-center justify-between">
                        <span className="flex items-center gap-2 text-xs uppercase tracking-wider">
                          <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                          <span>Assets</span>
                        </span>
                        <span className="fin-num text-xs font-bold">{renderAmount(processedData.totalAssets, true)}</span>
                      </div>

                      {/* Current Assets Sub-Groups */}
                      <div className="pl-3 space-y-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-400 flex items-center gap-1.5 pt-1">
                          <span className="w-1.2 h-1.2 rounded-full bg-sky-500" />
                          <span>Current Assets</span>
                        </div>

                        <div className="pl-2 space-y-1">
                          {(Object.keys(processedData.assetSubGroups) as AssetSubCategory[]).map((subCat) => {
                            const items = processedData.assetSubGroups[subCat];
                            if (items.length === 0 && !showZeroRows) return null;
                            const subTotal = items.reduce((sum, i) => sum + i.amount, 0);

                            // Fix A1: Single-account collapse
                            const isSingle = items.length === 1;

                            return (
                              <div key={subCat} className="space-y-0.5">
                                {!isSingle && (
                                  <div className="flex items-center justify-between py-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                                    <span>{subCat}</span>
                                    <span className="fin-num">{renderAmount(subTotal)}</span>
                                  </div>
                                )}
                                {items.map((item) => (
                                  <div
                                    key={item.account_id || item.account_code || item.name}
                                    onClick={() => handleAccountClick(item)}
                                    className={`group flex items-center justify-between ${rowHeightClass} px-2 hover:bg-sky-50/50 dark:hover:bg-sky-950/20 rounded-md cursor-pointer transition-colors text-[13px]`}
                                  >
                                    <div className="flex items-center gap-2">
                                      {showCodes && item.account_code && (
                                        <span className="font-mono text-slate-500 dark:text-slate-400 text-[11px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                          {item.account_code}
                                        </span>
                                      )}
                                      <span className="font-medium text-slate-800 dark:text-slate-200 group-hover:text-[#FA634E]">
                                        {item.name}
                                      </span>
                                    </div>
                                    <div className="w-36 text-right">{renderAmount(item.amount)}</div>
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>

                        {/* Total Current Assets Row */}
                        <div className="flex items-center justify-between py-2 px-3 bg-sky-50/60 dark:bg-sky-950/20 rounded-md font-semibold text-slate-900 dark:text-slate-100 border-t border-sky-100 dark:border-sky-900">
                          <span>Total Current Assets</span>
                          <span className="w-36 text-right fin-num">{renderAmount(processedData.currentAssetsTotal, true)}</span>
                        </div>
                      </div>

                      {/* Fixed Assets Sub-Group */}
                      {processedData.fixedAssets.length > 0 && (
                        <div className="pl-3 space-y-1 pt-1">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-400 flex items-center gap-1.5">
                            <span className="w-1.2 h-1.2 rounded-full bg-sky-500" />
                            <span>Fixed Assets</span>
                          </div>
                          <div className="pl-2 space-y-0.5">
                            {processedData.fixedAssets.map((item) => (
                              <div
                                key={item.account_id || item.account_code || item.name}
                                onClick={() => handleAccountClick(item)}
                                className={`group flex items-center justify-between ${rowHeightClass} px-2 hover:bg-sky-50/50 dark:hover:bg-sky-950/20 rounded-md cursor-pointer transition-colors text-[13px]`}
                              >
                                <div className="flex items-center gap-2">
                                  {showCodes && item.account_code && (
                                    <span className="font-mono text-slate-500 dark:text-slate-400 text-[11px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                      {item.account_code}
                                    </span>
                                  )}
                                  <span className="font-medium text-slate-800 dark:text-slate-200 group-hover:text-[#FA634E]">
                                    {item.name}
                                  </span>
                                </div>
                                <div className="w-36 text-right">{renderAmount(item.amount)}</div>
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center justify-between py-2 px-3 bg-sky-50/60 dark:bg-sky-950/20 rounded-md font-semibold text-slate-900 dark:text-slate-100">
                            <span>Total Fixed Assets</span>
                            <span className="w-36 text-right fin-num">{renderAmount(processedData.fixedAssetsTotal, true)}</span>
                          </div>
                        </div>
                      )}

                      {/* Grand Total Assets */}
                      <div className="bg-[#3E3C3D] text-white rounded-lg h-[40px] px-4 flex items-center justify-between font-extrabold text-sm shadow-xs mt-2">
                        <span className="uppercase tracking-wider">TOTAL ASSETS</span>
                        <span className="w-36 text-right fin-num text-white">{renderAmount(processedData.totalAssets, true)}</span>
                      </div>
                    </div>

                    {/* ── LIABILITIES SECTION ── */}
                    <div id="section-liabilities" className="space-y-2 pt-2">
                      <div className="h-[38px] px-3 bg-orange-50 dark:bg-orange-950/40 text-orange-800 dark:text-orange-300 font-bold rounded-lg flex items-center justify-between">
                        <span className="flex items-center gap-2 text-xs uppercase tracking-wider">
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                          <span>Liabilities</span>
                        </span>
                        <span className="fin-num text-xs font-bold">{renderAmount(processedData.totalLiabilities, true)}</span>
                      </div>

                      {/* Current Liabilities Sub-Groups */}
                      <div className="pl-3 space-y-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-orange-700 dark:text-orange-400 flex items-center gap-1.5 pt-1">
                          <span className="w-1.2 h-1.2 rounded-full bg-orange-500" />
                          <span>Current Liabilities</span>
                        </div>

                        <div className="pl-2 space-y-1">
                          {(Object.keys(processedData.liabilitySubGroups) as LiabilitySubCategory[]).map((subCat) => {
                            const items = processedData.liabilitySubGroups[subCat];
                            if (items.length === 0 && !showZeroRows) return null;
                            const subTotal = items.reduce((sum, i) => sum + i.amount, 0);

                            // Fix A1: Single-account collapse
                            const isSingle = items.length === 1;

                            return (
                              <div key={subCat} className="space-y-0.5">
                                {!isSingle && (
                                  <div className="flex items-center justify-between py-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                                    <span>{subCat}</span>
                                    <span className="fin-num">{renderAmount(subTotal)}</span>
                                  </div>
                                )}
                                {items.map((item) => (
                                  <div
                                    key={item.account_id || item.account_code || item.name}
                                    onClick={() => handleAccountClick(item)}
                                    className={`group flex items-center justify-between ${rowHeightClass} px-2 hover:bg-orange-50/50 dark:hover:bg-orange-950/20 rounded-md cursor-pointer transition-colors text-[13px]`}
                                  >
                                    <div className="flex items-center gap-2">
                                      {showCodes && item.account_code && (
                                        <span className="font-mono text-slate-500 dark:text-slate-400 text-[11px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                          {item.account_code}
                                        </span>
                                      )}
                                      <span className="font-medium text-slate-800 dark:text-slate-200 group-hover:text-[#FA634E]">
                                        {item.name}
                                      </span>
                                    </div>
                                    <div className="w-36 text-right">{renderAmount(item.amount)}</div>
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>

                        {/* Total Current Liabilities Row */}
                        <div className="flex items-center justify-between py-2 px-3 bg-orange-50/60 dark:bg-orange-950/20 rounded-md font-semibold text-slate-900 dark:text-slate-100 border-t border-orange-100 dark:border-orange-900">
                          <span>Total Current Liabilities</span>
                          <span className="w-36 text-right fin-num">{renderAmount(processedData.currentLiabilitiesTotal, true)}</span>
                        </div>
                      </div>

                      {/* Total Liabilities Subtotal */}
                      <div className="flex items-center justify-between py-2 px-3 bg-orange-100/60 dark:bg-orange-900/30 rounded-md font-bold text-slate-900 dark:text-slate-100">
                        <span>Total Liabilities</span>
                        <span className="w-36 text-right fin-num">{renderAmount(processedData.totalLiabilities, true)}</span>
                      </div>
                    </div>

                    {/* ── EQUITY SECTION ── */}
                    <div id="section-equity" className="space-y-2 pt-2">
                      <div className="h-[38px] px-3 bg-violet-50 dark:bg-violet-950/40 text-violet-800 dark:text-violet-300 font-bold rounded-lg flex items-center justify-between">
                        <span className="flex items-center gap-2 text-xs uppercase tracking-wider">
                          <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                          <span>Equity</span>
                        </span>
                        <span className="fin-num text-xs font-bold">{renderAmount(processedData.totalEquity, true)}</span>
                      </div>

                      <div className="pl-3 space-y-0.5">
                        {processedData.classifiedEquity.map((item) => (
                          <div
                            key={item.account_id || item.account_code || item.name}
                            onClick={() => handleAccountClick(item)}
                            className={`group flex items-center justify-between ${rowHeightClass} px-2 hover:bg-violet-50/50 dark:hover:bg-violet-950/20 rounded-md cursor-pointer transition-colors text-[13px]`}
                          >
                            <div className="flex items-center gap-2">
                              {showCodes && item.account_code && (
                                <span className="font-mono text-slate-500 dark:text-slate-400 text-[11px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                  {item.account_code}
                                </span>
                              )}
                              <span className="font-medium text-slate-800 dark:text-slate-200 group-hover:text-[#FA634E]">
                                {item.name}
                              </span>
                            </div>
                            <div className="w-36 text-right">{renderAmount(item.amount)}</div>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center justify-between py-2 px-3 bg-violet-50/60 dark:bg-violet-950/20 rounded-md font-semibold text-slate-900 dark:text-slate-100">
                        <span>Total Equity</span>
                        <span className="w-36 text-right fin-num">{renderAmount(processedData.totalEquity, true)}</span>
                      </div>
                    </div>

                    {/* GRAND TOTAL LIABILITIES & EQUITY */}
                    <div className="bg-[#3E3C3D] text-white rounded-lg h-[40px] px-4 flex items-center justify-between font-extrabold text-sm shadow-xs mt-3">
                      <span className="uppercase tracking-wider">TOTAL LIABILITIES & EQUITY</span>
                      <span className="w-36 text-right fin-num text-white">{renderAmount(processedData.totalLiabilitiesAndEquity, true)}</span>
                    </div>
                  </div>
                )}

                {/* HORIZONTAL (T-FORMAT) LAYOUT */}
                {layout === 'horizontal' && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
                    {/* Left: Liabilities & Equity */}
                    <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-3 bg-orange-50/20 dark:bg-slate-900/40">
                      <div className="flex items-center justify-between border-b border-orange-200 dark:border-slate-800 pb-2">
                        <span className="font-bold text-orange-900 dark:text-orange-300 uppercase tracking-wider text-xs flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                          <span>Liabilities & Equity</span>
                        </span>
                        <Badge variant="outline" className="text-[10px] font-mono bg-rose-50 text-rose-700 border-rose-200">
                          Dr
                        </Badge>
                      </div>

                      {/* Liabilities Section */}
                      <div className="space-y-1">
                        <div className="text-[11px] font-bold text-orange-700 dark:text-orange-400 uppercase">Liabilities</div>
                        {processedData.classifiedLiabilities.map((item) => (
                          <div key={item.name} className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
                            <span className="text-slate-700 dark:text-slate-300 font-medium">{item.name}</span>
                            <span className="fin-num">{renderAmount(item.amount)}</span>
                          </div>
                        ))}
                      </div>

                      {/* Equity Section */}
                      <div className="space-y-1 pt-2">
                        <div className="text-[11px] font-bold text-violet-700 dark:text-violet-400 uppercase">Equity</div>
                        {processedData.classifiedEquity.map((item) => (
                          <div key={item.name} className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
                            <span className="text-slate-700 dark:text-slate-300 font-medium">{item.name}</span>
                            <span className="fin-num">{renderAmount(item.amount)}</span>
                          </div>
                        ))}
                      </div>

                      <div className="pt-3 border-t-2 border-slate-900 dark:border-slate-200 flex justify-between font-extrabold text-sm text-slate-900 dark:text-slate-100">
                        <span>TOTAL</span>
                        <span className="fin-num">{renderAmount(processedData.totalLiabilitiesAndEquity, true)}</span>
                      </div>
                    </div>

                    {/* Right: Assets */}
                    <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-3 bg-sky-50/20 dark:bg-slate-900/40">
                      <div className="flex items-center justify-between border-b border-sky-200 dark:border-slate-800 pb-2">
                        <span className="font-bold text-sky-900 dark:text-sky-300 uppercase tracking-wider text-xs flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                          <span>Assets</span>
                        </span>
                        <Badge variant="outline" className="text-[10px] font-mono bg-emerald-50 text-emerald-700 border-emerald-200">
                          Cr
                        </Badge>
                      </div>

                      <div className="space-y-1">
                        <div className="text-[11px] font-bold text-sky-700 dark:text-sky-400 uppercase">Assets</div>
                        {processedData.classifiedAssets.map((item) => (
                          <div key={item.name} className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
                            <span className="text-slate-700 dark:text-slate-300 font-medium">{item.name}</span>
                            <span className="fin-num">{renderAmount(item.amount)}</span>
                          </div>
                        ))}
                      </div>

                      <div className="pt-3 border-t-2 border-slate-900 dark:border-slate-200 flex justify-between font-extrabold text-sm text-slate-900 dark:text-slate-100">
                        <span>TOTAL</span>
                        <span className="fin-num">{renderAmount(processedData.totalAssets, true)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Sticky Insight Rail */}
            <div className="xl:sticky xl:top-4 self-start space-y-4">
              <InsightRail
                mode="balance_sheet"
                data={{
                  totalAssets: processedData.totalAssets,
                  totalLiabilities: processedData.totalLiabilities,
                  totalEquity: processedData.totalEquity,
                  currentAssetsTotal: processedData.currentAssetsTotal,
                  currentLiabilitiesTotal: processedData.currentLiabilitiesTotal,
                }}
                onJumpTo={(id) => {
                  const el = document.getElementById(id);
                  if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.classList.add('ring-2', 'ring-[#FA634E]', 'transition-all');
                    setTimeout(() => el.classList.remove('ring-2', 'ring-[#FA634E]'), 1500);
                  }
                }}
                onNavigateAnalysis={() => updateParam('tab', 'analysis')}
              />
            </div>
          </div>
        )}
      </div>

      {/* Customize Sheet */}
      <Sheet open={isCustomizeOpen} onOpenChange={setIsCustomizeOpen}>
        <SheetContent className="w-80 sm:w-96 p-6 space-y-6">
          <SheetHeader>
            <SheetTitle className="text-base font-bold">Customize Balance Sheet</SheetTitle>
            <SheetDescription className="text-xs">Adjust view options and density</SheetDescription>
          </SheetHeader>

          <div className="space-y-5 text-xs">
            <div className="flex items-center justify-between">
              <Label htmlFor="show-codes" className="cursor-pointer font-medium">Show Account Codes</Label>
              <Switch
                id="show-codes"
                checked={showCodes}
                onCheckedChange={(checked) => updateParam('codes', checked ? 'true' : 'false')}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="zero-rows" className="cursor-pointer font-medium">Show Zero-Balance Rows</Label>
              <Switch
                id="zero-rows"
                checked={showZeroRows}
                onCheckedChange={(checked) => updateParam('zeroRows', checked ? 'true' : 'false')}
              />
            </div>

            <div className="space-y-2">
              <Label className="font-semibold text-slate-700 dark:text-slate-300">Density</Label>
              <RadioGroup
                value={density}
                onValueChange={(val) => updateParam('density', val)}
                className="grid grid-cols-2 gap-2"
              >
                <div>
                  <RadioGroupItem value="compact" id="d-compact" className="peer sr-only" />
                  <Label
                    htmlFor="d-compact"
                    className="flex flex-col items-center justify-between rounded-md border-2 border-slate-200 p-2 hover:bg-slate-50 peer-data-[state=checked]:border-[#FA634E] cursor-pointer text-center"
                  >
                    <span className="font-bold text-xs">Compact</span>
                    <span className="text-[10px] text-slate-500">32px / 34px</span>
                  </Label>
                </div>
                <div>
                  <RadioGroupItem value="comfortable" id="d-comf" className="peer sr-only" />
                  <Label
                    htmlFor="d-comf"
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
            <SheetDescription className="text-xs">Configure classification defaults and reset custom overrides</SheetDescription>
          </SheetHeader>

          <div className="space-y-4 text-xs">
            <p className="text-slate-600 dark:text-slate-400">
              Custom overrides saved in your browser: <span className="font-bold">{Object.keys(overrides).length} entries</span>.
            </p>

            <Button
              variant="outline"
              size="sm"
              onClick={handleResetDefaults}
              className="w-full text-xs font-semibold text-rose-600 border-rose-200 hover:bg-rose-50 gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to defaults</span>
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Export Modal */}
      {processedData && (
        <ExportModal
          isOpen={isExportOpen}
          onClose={() => setIsExportOpen(false)}
          data={exportData}
          columns={exportColumns}
          filename={`Balance_Sheet_${asOf}`}
          title="Export Balance Sheet"
        />
      )}
    </DashboardLayout>
  );
}

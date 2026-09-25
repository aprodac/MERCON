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
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Calendar as CalendarIcon,
  Landmark,
} from 'lucide-react';

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

import { financeService, type ReportLineItem, type BalanceSheetData } from '@/services/financeService';
import { formatMoney, formatDate } from '@/lib/finance/format';
import {
  classifyAssetAccount,
  classifyLiabilityAccount,
  classifyEquityAccount,
  getStoredOverrides,
  saveStoredOverrides,
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
  const showPct = searchParams.get('pct') === 'true';
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

  // Analysis 6-Month Historical Queries
  const last6MonthDates = useMemo(() => {
    const dates: string[] = [];
    const base = new Date(asOf);
    for (let i = 5; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth() - i + 1, 0);
      dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
  }, [asOf]);

  const trendQueries = useQueries({
    queries: last6MonthDates.map((d) => ({
      queryKey: ['finance-reports', 'balance-sheet', d],
      queryFn: () => financeService.getBalanceSheet({ as_of: d }),
      staleTime: 60000,
      enabled: activeTab === 'analysis',
    })),
  });

  const trendData = useMemo(() => {
    return last6MonthDates.map((dateStr, idx) => {
      const data = trendQueries[idx]?.data?.data;
      const assets = data?.total_assets || 0;
      const liab = data?.total_liabilities || 0;
      const eq = data?.total_equity || 0;

      // Current assets & liabilities for working capital
      let ca = 0;
      let cl = 0;

      if (data) {
        data.assets.forEach((a) => {
          const clsf = classifyAssetAccount(a, overrides);
          if (clsf.category === 'Current assets') ca += a.amount;
        });
        data.liabilities.forEach((l) => {
          const clsf = classifyLiabilityAccount(l, overrides);
          if (clsf.category === 'Current liabilities') cl += l.amount;
        });
      }

      return {
        date: dateStr,
        label: new Date(dateStr).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        assets,
        liabilities: liab,
        equity: eq,
        workingCapital: ca - cl,
      };
    });
  }, [last6MonthDates, trendQueries, overrides]);

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

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
        assetSubGroups[a.subCategory as AssetSubCategory].push(a);
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
        liabilitySubGroups[l.subCategory as LiabilitySubCategory].push(l);
      } else if (l.category === 'Long-term liabilities') {
        longTermLiabilities.push(l);
      }
    });

    // Calculate Subtotals
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

    // Computed Earnings Lines
    const currentYearEarningsItem = classifiedEquity.find((e) => e.kind === 'current_year_earnings');
    const priorYearEarningsItem = classifiedEquity.find((e) => e.kind === 'unclosed_prior_earnings');

    // Ratios for Analysis Tab
    const cashBankTotal = assetSubGroups['Cash & bank'].reduce((sum, i) => sum + i.amount, 0);
    const receivablesTotal = assetSubGroups['Receivables'].reduce((sum, i) => sum + i.amount, 0);

    const workingCapital = currentAssetsTotal - currentLiabilitiesTotal;
    const currentRatio = currentLiabilitiesTotal > 0 ? currentAssetsTotal / currentLiabilitiesTotal : 0;
    const quickRatio = currentLiabilitiesTotal > 0 ? (cashBankTotal + receivablesTotal) / currentLiabilitiesTotal : 0;
    const debtToEquity = totalEquity > 0 ? totalLiabilities / totalEquity : 0;
    const cashShare = totalAssets > 0 ? (cashBankTotal / totalAssets) * 100 : 0;

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
      currentYearEarningsItem,
      priorYearEarningsItem,
      ratios: {
        workingCapital,
        currentRatio,
        quickRatio,
        debtToEquity,
        cashShare,
        cashBankTotal,
        receivablesTotal,
      },
    };
  }, [report, showZeroRows, overrides]);

  // Comparison processed map
  const compareMap = useMemo(() => {
    if (!compareReport) return null;
    const map = new Map<string, number>();
    compareReport.assets.forEach((a) => map.set(a.account_id || a.account_code || a.name, a.amount));
    compareReport.liabilities.forEach((l) => map.set(l.account_id || l.account_code || l.name, l.amount));
    compareReport.equity.forEach((e) => map.set(e.account_id || e.account_code || e.name, e.amount));
    return map;
  }, [compareReport]);

  const renderAmount = (amount: number, isTotal = false) => {
    const formatted = formatMoney(Math.abs(amount));
    if (amount < 0) {
      const displayStr = negFormat === 'parens' ? `(${formatted})` : `−${formatted}`;
      return <span className="text-rose-600 dark:text-rose-400 font-mono font-medium">{displayStr}</span>;
    }
    return (
      <span className={`font-mono ${isTotal ? 'font-bold text-slate-900 dark:text-slate-100' : 'font-medium text-slate-800 dark:text-slate-200'}`}>
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

  // Preset Date Selection Handlers
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

  // Export Data Preparation
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

  return (
    <DashboardLayout active="finance" title="Balance Sheet">
      <div className="p-4 sm:p-6 space-y-4 max-w-[1400px] mx-auto print:p-0">
        {/* Toolbar Row — DESIGN.md §4.0a */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 p-3 shadow-xs flex flex-wrap items-center justify-between gap-3 print:hidden">
          {/* Left: Segmented Tabs */}
          <div className="flex items-center gap-3">
            <ToggleGroup
              type="single"
              value={[activeTab]}
              onValueChange={(v) => v[0] && updateParam('tab', v[0])}
              className="bg-[#F4F4F5] dark:bg-slate-800/80 p-1 rounded-xl"
            >
              <ToggleGroupItem
                value="statement"
                className="text-xs font-semibold px-3.5 py-1.5 rounded-[9px] data-[state=on]:bg-white dark:data-[state=on]:bg-slate-900 data-[state=on]:text-[#3E3C3D] dark:data-[state=on]:text-slate-100 data-[state=on]:shadow-xs"
              >
                Statement
              </ToggleGroupItem>
              <ToggleGroupItem
                value="analysis"
                className="text-xs font-semibold px-3.5 py-1.5 rounded-[9px] data-[state=on]:bg-white dark:data-[state=on]:bg-slate-900 data-[state=on]:text-[#3E3C3D] dark:data-[state=on]:text-slate-100 data-[state=on]:shadow-xs"
              >
                Analysis
              </ToggleGroupItem>
            </ToggleGroup>

            {/* As Of Control Popover + Calendar */}
            <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs font-semibold bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 gap-2"
                >
                  <CalendarIcon className="w-3.5 h-3.5 text-[#FA634E]" />
                  <span>As of {formatDate(asOf)}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-3 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 space-y-3" align="start">
                <div className="grid grid-cols-2 gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-2.5">
                  <Button variant="ghost" size="sm" className="h-7 text-[11px] justify-start px-2 font-medium text-slate-700 dark:text-slate-300" onClick={() => handlePreset('today')}>
                    Today
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-[11px] justify-start px-2 font-medium text-slate-700 dark:text-slate-300" onClick={() => handlePreset('last_month')}>
                    End of last month
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-[11px] justify-start px-2 font-medium text-slate-700 dark:text-slate-300" onClick={() => handlePreset('last_quarter')}>
                    End of last quarter
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-[11px] justify-start px-2 font-medium text-slate-700 dark:text-slate-300" onClick={() => handlePreset('last_year')}>
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

            {/* Layout Toggle (Vertical / Horizontal) */}
            {activeTab === 'statement' && (
              <ToggleGroup
                type="single"
                value={[layout]}
                onValueChange={(v) => v[0] && updateParam('layout', v[0])}
                className="bg-[#F4F4F5] dark:bg-slate-800/80 p-1 rounded-xl"
              >
                <ToggleGroupItem value="vertical" className="text-xs font-semibold px-2.5 py-1 rounded-[9px] data-[state=on]:bg-white dark:data-[state=on]:bg-slate-900 text-slate-700 dark:text-slate-300">
                  Vertical (Zoho)
                </ToggleGroupItem>
                <ToggleGroupItem value="horizontal" className="text-xs font-semibold px-2.5 py-1 rounded-[9px] data-[state=on]:bg-white dark:data-[state=on]:bg-slate-900 text-slate-700 dark:text-slate-300">
                  Horizontal (Tally)
                </ToggleGroupItem>
              </ToggleGroup>
            )}

            {/* Compare Select */}
            {activeTab === 'statement' && (
              <div className="flex items-center">
                {layout === 'horizontal' ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <div className="opacity-50 pointer-events-auto">
                          <Select disabled value="none">
                            <SelectTrigger className="h-8 text-xs w-36 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                              <SelectValue placeholder="Compare: None" />
                            </SelectTrigger>
                          </Select>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs bg-slate-900 text-white p-2">
                        Comparison columns are available in Vertical layout
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <Select value={compareMode} onValueChange={(v) => updateParam('compare', v)}>
                    <SelectTrigger className="h-8 text-xs w-44 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 font-medium text-slate-700 dark:text-slate-300">
                      <SelectValue placeholder="Compare: None" />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs font-medium">
                      <SelectItem value="none">Compare: None</SelectItem>
                      <SelectItem value="prev_month">Previous month end</SelectItem>
                      <SelectItem value="prev_year">Previous year end</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
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
              <span>Statement setup</span>
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

        {/* Loading Skeleton Paper */}
        {isLoading && (
          <div className="max-w-4xl mx-auto bg-white dark:bg-slate-900 rounded-[20px] border border-slate-200/80 dark:border-slate-800 p-8 space-y-6">
            <Skeleton className="h-8 w-64 mx-auto" />
            <Skeleton className="h-4 w-40 mx-auto" />
            <div className="space-y-4 pt-6">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          </div>
        )}

        {/* TAB 1: STATEMENT (THE PAPER) */}
        {!isLoading && report && processedData && activeTab === 'statement' && (
          <div className="space-y-4">
            <div
              className={`fin-paper mx-auto bg-white dark:bg-slate-900 rounded-[20px] border border-slate-200/80 dark:border-slate-800 p-6 sm:p-9 shadow-xs print:shadow-none print:border-none print:p-0 space-y-6 transition-all ${
                layout === 'horizontal' ? 'max-w-6xl' : 'max-w-4xl'
              }`}
            >
              {/* Document Header Centred */}
              <div className="text-center space-y-1 border-b border-slate-100 dark:border-slate-800 pb-5">
                <p className="text-xs font-bold uppercase tracking-widest text-[#757583]">
                  MERCON Logistics
                </p>
                <h1 className="text-2xl font-extrabold tracking-tight text-[#3E3C3D] dark:text-slate-100">
                  Balance Sheet
                </h1>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  As of {formatDate(asOf)}
                </p>
                <p className="text-[11px] font-mono text-slate-400 dark:text-slate-500 pt-0.5">
                  Amounts in SAR
                </p>
                <div className="pt-1">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 px-2.5 py-0.5 rounded-full border border-slate-200/60 dark:border-slate-700">
                    <span className={`w-1.5 h-1.5 rounded-full ${report.using_snapshot ? 'bg-indigo-500' : 'bg-emerald-500'}`} />
                    {report.using_snapshot ? 'From period-close snapshots' : 'Calculated live from ledger'}
                  </span>
                </div>
              </div>

              {/* VERTICAL LAYOUT (Zoho Books Style) */}
              {layout === 'vertical' && (
                <div className="space-y-6 text-xs">
                  {/* ASSETS SECTION */}
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-[#757583] pb-1 border-b border-slate-200 dark:border-slate-800">
                      ASSETS
                    </div>

                    {/* Current Assets Sub-Groups */}
                    <div className="space-y-1">
                      <div
                        onClick={() => toggleGroup('current_assets')}
                        className="flex items-center justify-between py-1.5 px-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg cursor-pointer font-semibold text-slate-800 dark:text-slate-200 select-none"
                      >
                        <div className="flex items-center gap-1.5">
                          {collapsedGroups['current_assets'] ? (
                            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                          )}
                          <span>Current Assets</span>
                        </div>
                        <span className="font-mono text-slate-600 dark:text-slate-400">
                          {renderAmount(processedData.currentAssetsTotal)}
                        </span>
                      </div>

                      {!collapsedGroups['current_assets'] && (
                        <div className="pl-4 space-y-2.5">
                          {(Object.keys(processedData.assetSubGroups) as AssetSubCategory[]).map((subCat) => {
                            const items = processedData.assetSubGroups[subCat];
                            if (items.length === 0 && !showZeroRows) return null;
                            const subTotal = items.reduce((sum, i) => sum + i.amount, 0);

                            return (
                              <div key={subCat} className="space-y-1">
                                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 pl-2">
                                  {subCat}
                                </div>
                                {items.map((item) => (
                                  <div
                                    key={item.account_id || item.account_code || item.name}
                                    onClick={() => handleAccountClick(item)}
                                    className="group flex items-center justify-between py-1 pl-5 pr-2 hover:bg-orange-50/50 dark:hover:bg-orange-950/20 rounded-md cursor-pointer transition-colors"
                                  >
                                    <div className="flex items-center gap-2">
                                      {showCodes && item.account_code && (
                                        <span className="font-mono text-slate-400 dark:text-slate-500 text-[11px]">
                                          {item.account_code}
                                        </span>
                                      )}
                                      <span className="font-medium text-slate-800 dark:text-slate-200 group-hover:text-[#FA634E] flex items-center gap-1.5">
                                        {item.name}
                                        {item.is_bank_or_cash && item.account_id && (
                                          <HoverCard>
                                            <HoverCardTrigger asChild>
                                              <span
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  navigate(`/finance/bank-accounts/${item.account_id}`);
                                                }}
                                                className="inline-flex items-center text-[10px] bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.2 rounded font-semibold"
                                              >
                                                <Landmark className="w-2.5 h-2.5 mr-0.5" /> Bank/Cash
                                              </span>
                                            </HoverCardTrigger>
                                            <HoverCardContent className="w-56 p-3 text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 space-y-1">
                                              <p className="font-bold text-slate-900 dark:text-slate-100">{item.name}</p>
                                              <p className="text-[11px] text-slate-500">Book Balance: SAR {formatMoney(item.amount)}</p>
                                              <p className="text-[11px] text-[#FA634E] font-semibold pt-1">Click to view bank details →</p>
                                            </HoverCardContent>
                                          </HoverCard>
                                        )}
                                        <ExternalLink className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 group-hover:text-[#FA634E] transition-opacity" />
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-6">
                                      {renderAmount(item.amount)}
                                      {compareMode !== 'none' && compareMap && (
                                        <span className="font-mono text-slate-400 w-24 text-right">
                                          {formatMoney(compareMap.get(item.account_id || item.account_code || item.name) || 0)}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Subtotal Current Assets */}
                    <div className="flex items-center justify-between py-1.5 px-2 border-t border-slate-200 dark:border-slate-800 font-bold text-slate-900 dark:text-slate-100">
                      <span>Total Current Assets</span>
                      {renderAmount(processedData.currentAssetsTotal, true)}
                    </div>

                    {/* Fixed Assets */}
                    {processedData.fixedAssets.length > 0 && (
                      <div className="space-y-1 pt-2">
                        <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 pl-2">
                          Fixed Assets
                        </div>
                        {processedData.fixedAssets.map((item) => (
                          <div
                            key={item.account_id || item.account_code || item.name}
                            onClick={() => handleAccountClick(item)}
                            className="group flex items-center justify-between py-1 pl-5 pr-2 hover:bg-orange-50/50 dark:hover:bg-orange-950/20 rounded-md cursor-pointer transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              {showCodes && item.account_code && (
                                <span className="font-mono text-slate-400 text-[11px]">{item.account_code}</span>
                              )}
                              <span className="font-medium text-slate-800 dark:text-slate-200 group-hover:text-[#FA634E] flex items-center gap-1.5">
                                {item.name}
                                <ExternalLink className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 group-hover:text-[#FA634E] transition-opacity" />
                              </span>
                            </div>
                            {renderAmount(item.amount)}
                          </div>
                        ))}
                        <div className="flex items-center justify-between py-1.5 px-2 border-t border-slate-200 dark:border-slate-800 font-bold text-slate-900 dark:text-slate-100">
                          <span>Total Fixed Assets</span>
                          {renderAmount(processedData.fixedAssetsTotal, true)}
                        </div>
                      </div>
                    )}

                    {/* Investments */}
                    {processedData.investments.length > 0 && (
                      <div className="space-y-1 pt-2">
                        <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 pl-2">
                          Investments
                        </div>
                        {processedData.investments.map((item) => (
                          <div
                            key={item.account_id || item.account_code || item.name}
                            onClick={() => handleAccountClick(item)}
                            className="group flex items-center justify-between py-1 pl-5 pr-2 hover:bg-orange-50/50 dark:hover:bg-orange-950/20 rounded-md cursor-pointer transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              {showCodes && item.account_code && (
                                <span className="font-mono text-slate-400 text-[11px]">{item.account_code}</span>
                              )}
                              <span className="font-medium text-slate-800 dark:text-slate-200 group-hover:text-[#FA634E]">
                                {item.name}
                              </span>
                            </div>
                            {renderAmount(item.amount)}
                          </div>
                        ))}
                        <div className="flex items-center justify-between py-1.5 px-2 border-t border-slate-200 dark:border-slate-800 font-bold text-slate-900 dark:text-slate-100">
                          <span>Total Investments</span>
                          {renderAmount(processedData.investmentsTotal, true)}
                        </div>
                      </div>
                    )}

                    {/* Grand Total Assets */}
                    <div className="flex items-center justify-between py-2 px-2 border-y-2 border-slate-900 dark:border-slate-100 font-extrabold text-sm text-slate-900 dark:text-slate-100 pt-3 mt-3">
                      <span>TOTAL ASSETS</span>
                      {renderAmount(processedData.totalAssets, true)}
                    </div>
                  </div>

                  {/* LIABILITIES & EQUITY SECTION */}
                  <div className="space-y-2 pt-4">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-[#757583] pb-1 border-b border-slate-200 dark:border-slate-800">
                      LIABILITIES & EQUITY
                    </div>

                    {/* Current Liabilities Sub-Groups */}
                    <div className="space-y-1">
                      <div
                        onClick={() => toggleGroup('current_liabilities')}
                        className="flex items-center justify-between py-1.5 px-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg cursor-pointer font-semibold text-slate-800 dark:text-slate-200 select-none"
                      >
                        <div className="flex items-center gap-1.5">
                          {collapsedGroups['current_liabilities'] ? (
                            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                          )}
                          <span>Current Liabilities</span>
                        </div>
                        <span className="font-mono text-slate-600 dark:text-slate-400">
                          {renderAmount(processedData.currentLiabilitiesTotal)}
                        </span>
                      </div>

                      {!collapsedGroups['current_liabilities'] && (
                        <div className="pl-4 space-y-2.5">
                          {(Object.keys(processedData.liabilitySubGroups) as LiabilitySubCategory[]).map((subCat) => {
                            const items = processedData.liabilitySubGroups[subCat];
                            if (items.length === 0 && !showZeroRows) return null;

                            return (
                              <div key={subCat} className="space-y-1">
                                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 pl-2">
                                  {subCat}
                                </div>
                                {items.map((item) => (
                                  <div
                                    key={item.account_id || item.account_code || item.name}
                                    onClick={() => handleAccountClick(item)}
                                    className="group flex items-center justify-between py-1 pl-5 pr-2 hover:bg-orange-50/50 dark:hover:bg-orange-950/20 rounded-md cursor-pointer transition-colors"
                                  >
                                    <div className="flex items-center gap-2">
                                      {showCodes && item.account_code && (
                                        <span className="font-mono text-slate-400 text-[11px]">
                                          {item.account_code}
                                        </span>
                                      )}
                                      <span className="font-medium text-slate-800 dark:text-slate-200 group-hover:text-[#FA634E] flex items-center gap-1.5">
                                        {item.name}
                                        <ExternalLink className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 group-hover:text-[#FA634E] transition-opacity" />
                                      </span>
                                    </div>
                                    {renderAmount(item.amount)}
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Subtotal Current Liabilities */}
                    <div className="flex items-center justify-between py-1.5 px-2 border-t border-slate-200 dark:border-slate-800 font-bold text-slate-900 dark:text-slate-100">
                      <span>Total Current Liabilities</span>
                      {renderAmount(processedData.currentLiabilitiesTotal, true)}
                    </div>

                    {/* Long-term Liabilities */}
                    {processedData.longTermLiabilities.length > 0 && (
                      <div className="space-y-1 pt-2">
                        <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 pl-2">
                          Long-term Liabilities
                        </div>
                        {processedData.longTermLiabilities.map((item) => (
                          <div
                            key={item.account_id || item.account_code || item.name}
                            onClick={() => handleAccountClick(item)}
                            className="group flex items-center justify-between py-1 pl-5 pr-2 hover:bg-orange-50/50 dark:hover:bg-orange-950/20 rounded-md cursor-pointer transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              {showCodes && item.account_code && (
                                <span className="font-mono text-slate-400 text-[11px]">{item.account_code}</span>
                              )}
                              <span className="font-medium text-slate-800 dark:text-slate-200 group-hover:text-[#FA634E]">
                                {item.name}
                              </span>
                            </div>
                            {renderAmount(item.amount)}
                          </div>
                        ))}
                        <div className="flex items-center justify-between py-1.5 px-2 border-t border-slate-200 dark:border-slate-800 font-bold text-slate-900 dark:text-slate-100">
                          <span>Total Long-term Liabilities</span>
                          {renderAmount(processedData.longTermLiabilitiesTotal, true)}
                        </div>
                      </div>
                    )}

                    {/* Subtotal Liabilities */}
                    <div className="flex items-center justify-between py-1.5 px-2 border-t border-slate-300 dark:border-slate-700 font-extrabold text-slate-900 dark:text-slate-100">
                      <span>Total Liabilities</span>
                      {renderAmount(processedData.totalLiabilities, true)}
                    </div>

                    {/* Equity Sub-section */}
                    <div className="space-y-1 pt-3">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-[#757583] pl-2">
                        Equity
                      </div>
                      {processedData.classifiedEquity.map((item) => (
                        <div
                          key={item.account_id || item.account_code || item.kind || item.name}
                          onClick={() => handleAccountClick(item)}
                          className="group flex items-center justify-between py-1 pl-5 pr-2 hover:bg-orange-50/50 dark:hover:bg-orange-950/20 rounded-md cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            {showCodes && item.account_code && (
                              <span className="font-mono text-slate-400 text-[11px]">{item.account_code}</span>
                            )}
                            <span className="font-medium text-slate-800 dark:text-slate-200 group-hover:text-[#FA634E] flex items-center gap-1.5">
                              {item.name}
                              <ExternalLink className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 group-hover:text-[#FA634E] transition-opacity" />
                            </span>
                          </div>
                          {renderAmount(item.amount)}
                        </div>
                      ))}
                      <div className="flex items-center justify-between py-1.5 px-2 border-t border-slate-200 dark:border-slate-800 font-bold text-slate-900 dark:text-slate-100">
                        <span>Total Equity</span>
                        {renderAmount(processedData.totalEquity, true)}
                      </div>
                    </div>

                    {/* Grand Total Liabilities & Equity */}
                    <div className="flex items-center justify-between py-2 px-2 border-y-2 border-slate-900 dark:border-slate-100 font-extrabold text-sm text-slate-900 dark:text-slate-100 pt-3 mt-3">
                      <span>TOTAL LIABILITIES & EQUITY</span>
                      {renderAmount(processedData.totalLiabilitiesAndEquity, true)}
                    </div>
                  </div>

                  {/* Balanced Check Line */}
                  <div className="pt-4 text-center">
                    {report.is_balanced ? (
                      <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 px-3 py-1.5 rounded-full">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Assets = Liabilities + Equity ✓</span>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-2 text-xs font-semibold text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 px-3 py-1.5 rounded-full">
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>Out of balance by SAR {formatMoney(Math.abs(processedData.totalAssets - processedData.totalLiabilitiesAndEquity))}</span>
                        <span
                          onClick={() => navigate('/finance/trial-balance')}
                          className="underline cursor-pointer hover:text-rose-900 font-bold ml-1"
                        >
                          Check Trial Balance →
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* HORIZONTAL LAYOUT (Tally Style) */}
              {layout === 'horizontal' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden text-xs">
                    {/* Left Column: Liabilities & Equity */}
                    <div className="p-4 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-4">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800 font-bold uppercase tracking-wider text-[#757583]">
                          <span>Liabilities & Equity Particulars</span>
                          <span>Amount (SAR)</span>
                        </div>

                        {/* Capital Account */}
                        <div className="space-y-1">
                          <div className="font-bold text-slate-900 dark:text-slate-100">Capital Account</div>
                          {processedData.classifiedEquity.map((item) => (
                            <div key={item.account_id || item.kind || item.name} className="flex justify-between pl-3 text-slate-700 dark:text-slate-300">
                              <span>{item.name}</span>
                              <span className="font-mono">{formatMoney(item.amount)}</span>
                            </div>
                          ))}
                        </div>

                        {/* Long term liabilities / Loans */}
                        {processedData.longTermLiabilities.length > 0 && (
                          <div className="space-y-1">
                            <div className="font-bold text-slate-900 dark:text-slate-100">Loans (Liability)</div>
                            {processedData.longTermLiabilities.map((item) => (
                              <div key={item.account_id || item.name} className="flex justify-between pl-3 text-slate-700 dark:text-slate-300">
                                <span>{item.name}</span>
                                <span className="font-mono">{formatMoney(item.amount)}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Current Liabilities */}
                        <div className="space-y-1">
                          <div className="flex justify-between font-bold text-slate-900 dark:text-slate-100">
                            <span>Current Liabilities</span>
                            <span className="font-mono">{formatMoney(processedData.currentLiabilitiesTotal)}</span>
                          </div>
                          {(Object.keys(processedData.liabilitySubGroups) as LiabilitySubCategory[]).map((subCat) => (
                            <div key={subCat} className="pl-3 text-slate-600 dark:text-slate-400">
                              <span className="font-medium">{subCat}</span>
                              {processedData.liabilitySubGroups[subCat].map((item) => (
                                <div key={item.account_id || item.name} className="flex justify-between pl-2 text-slate-700 dark:text-slate-300">
                                  <span>{item.name}</span>
                                  <span className="font-mono">{formatMoney(item.amount)}</span>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>

                        {/* Profit & Loss Account (If Profit) */}
                        {report.total_assets >= report.total_liabilities + report.total_equity && (
                          <div className="space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800">
                            <div className="font-bold text-slate-900 dark:text-slate-100">Profit & Loss A/c</div>
                            <div className="flex justify-between pl-3 text-slate-700 dark:text-slate-300">
                              <span>Opening Balance</span>
                              <span className="font-mono">{formatMoney(processedData.priorYearEarningsItem?.amount || 0)}</span>
                            </div>
                            <div className="flex justify-between pl-3 text-slate-700 dark:text-slate-300">
                              <span>Current Period</span>
                              <span className="font-mono">{formatMoney(processedData.currentYearEarningsItem?.amount || 0)}</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Liabilities Total Footer */}
                      <div className="flex justify-between items-center py-2 px-2 border-t-2 border-slate-900 dark:border-slate-100 font-extrabold text-slate-900 dark:text-slate-100">
                        <span>Total Liabilities & Equity</span>
                        <span className="font-mono text-sm">{formatMoney(processedData.totalLiabilitiesAndEquity)}</span>
                      </div>
                    </div>

                    {/* Right Column: Assets */}
                    <div className="p-4 flex flex-col justify-between space-y-4">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800 font-bold uppercase tracking-wider text-[#757583]">
                          <span>Asset Particulars</span>
                          <span>Amount (SAR)</span>
                        </div>

                        {/* Fixed Assets */}
                        {processedData.fixedAssets.length > 0 && (
                          <div className="space-y-1">
                            <div className="flex justify-between font-bold text-slate-900 dark:text-slate-100">
                              <span>Fixed Assets</span>
                              <span className="font-mono">{formatMoney(processedData.fixedAssetsTotal)}</span>
                            </div>
                            {processedData.fixedAssets.map((item) => (
                              <div key={item.account_id || item.name} className="flex justify-between pl-3 text-slate-700 dark:text-slate-300">
                                <span>{item.name}</span>
                                <span className="font-mono">{formatMoney(item.amount)}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Investments */}
                        {processedData.investments.length > 0 && (
                          <div className="space-y-1">
                            <div className="flex justify-between font-bold text-slate-900 dark:text-slate-100">
                              <span>Investments</span>
                              <span className="font-mono">{formatMoney(processedData.investmentsTotal)}</span>
                            </div>
                            {processedData.investments.map((item) => (
                              <div key={item.account_id || item.name} className="flex justify-between pl-3 text-slate-700 dark:text-slate-300">
                                <span>{item.name}</span>
                                <span className="font-mono">{formatMoney(item.amount)}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Current Assets */}
                        <div className="space-y-1">
                          <div className="flex justify-between font-bold text-slate-900 dark:text-slate-100">
                            <span>Current Assets</span>
                            <span className="font-mono">{formatMoney(processedData.currentAssetsTotal)}</span>
                          </div>
                          {(Object.keys(processedData.assetSubGroups) as AssetSubCategory[]).map((subCat) => (
                            <div key={subCat} className="pl-3 text-slate-600 dark:text-slate-400">
                              <span className="font-medium">{subCat}</span>
                              {processedData.assetSubGroups[subCat].map((item) => (
                                <div key={item.account_id || item.name} className="flex justify-between pl-2 text-slate-700 dark:text-slate-300">
                                  <span>{item.name}</span>
                                  <span className="font-mono">{formatMoney(item.amount)}</span>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>

                        {/* Profit & Loss Account (Dr) (If Net Loss) */}
                        {report.total_assets < report.total_liabilities + report.total_equity && (
                          <div className="space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800">
                            <div className="font-bold text-rose-700 dark:text-rose-400">Profit & Loss A/c (Dr)</div>
                            <div className="flex justify-between pl-3 text-slate-700 dark:text-slate-300">
                              <span>Opening Balance</span>
                              <span className="font-mono">{formatMoney(Math.abs(processedData.priorYearEarningsItem?.amount || 0))}</span>
                            </div>
                            <div className="flex justify-between pl-3 text-slate-700 dark:text-slate-300">
                              <span>Current Period (Loss)</span>
                              <span className="font-mono text-rose-600">{formatMoney(Math.abs(processedData.currentYearEarningsItem?.amount || 0))}</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Assets Total Footer */}
                      <div className="flex justify-between items-center py-2 px-2 border-t-2 border-slate-900 dark:border-slate-100 font-extrabold text-slate-900 dark:text-slate-100">
                        <span>Total Assets</span>
                        <span className="font-mono text-sm">{formatMoney(processedData.totalAssets)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-center">
                    <span className="text-xs text-slate-500 font-medium">Tally-style horizontal dual ledger · Double-rule grand totals balance on both sides</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: ANALYSIS (RATIOS, COMPOSITION, HISTORICAL TREND) */}
        {!isLoading && report && processedData && activeTab === 'analysis' && (
          <div className="space-y-6 max-w-5xl mx-auto">
            {/* Deterministic Ratio Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {/* Working Capital */}
              <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#757583]">Working Capital</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger><HelpCircle className="w-3.5 h-3.5 text-slate-400" /></TooltipTrigger>
                      <TooltipContent><p className="text-xs">Current Assets − Current Liabilities. Net operational liquidity.</p></TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <p className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100">
                  SAR {formatMoney(processedData.ratios.workingCapital)}
                </p>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full inline-block ${processedData.ratios.workingCapital >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                  {processedData.ratios.workingCapital >= 0 ? 'Positive Liquidity' : 'Liquidity Deficit'}
                </span>
              </div>

              {/* Current Ratio */}
              <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#757583]">Current Ratio</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger><HelpCircle className="w-3.5 h-3.5 text-slate-400" /></TooltipTrigger>
                      <TooltipContent><p className="text-xs">Current Assets ÷ Current Liabilities (≥1.5 recommended).</p></TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <p className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100">
                  {processedData.ratios.currentRatio.toFixed(2)}
                </p>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full inline-block ${
                    processedData.ratios.currentRatio >= 1.5
                      ? 'bg-emerald-50 text-emerald-700'
                      : processedData.ratios.currentRatio >= 1.0
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-rose-50 text-rose-700'
                  }`}
                >
                  {processedData.ratios.currentRatio >= 1.5 ? 'Healthy (≥1.5)' : processedData.ratios.currentRatio >= 1.0 ? 'Adequate (1–1.5)' : 'Low (<1.0)'}
                </span>
              </div>

              {/* Quick Ratio */}
              <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#757583]">Quick Ratio</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger><HelpCircle className="w-3.5 h-3.5 text-slate-400" /></TooltipTrigger>
                      <TooltipContent><p className="text-xs">(Cash & Bank + Receivables) ÷ Current Liabilities.</p></TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <p className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100">
                  {processedData.ratios.quickRatio.toFixed(2)}
                </p>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 inline-block">
                  Liquid Coverage
                </span>
              </div>

              {/* Debt-to-Equity */}
              <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#757583]">Debt to Equity</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger><HelpCircle className="w-3.5 h-3.5 text-slate-400" /></TooltipTrigger>
                      <TooltipContent><p className="text-xs">Total Liabilities ÷ Total Equity. Financial leverage ratio.</p></TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <p className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100">
                  {processedData.ratios.debtToEquity.toFixed(2)}
                </p>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 inline-block">
                  Leverage Ratio
                </span>
              </div>

              {/* Cash & Bank Share */}
              <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#757583]">Cash & Bank Share</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger><HelpCircle className="w-3.5 h-3.5 text-slate-400" /></TooltipTrigger>
                      <TooltipContent><p className="text-xs">Cash & Bank ÷ Total Assets percentage.</p></TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <p className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100">
                  {processedData.ratios.cashShare.toFixed(1)}%
                </p>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 inline-block">
                  Liquid Assets
                </span>
              </div>
            </div>

            {/* Composition Stacked Bars */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Balance Sheet Composition</h3>
              <div className="space-y-4 text-xs">
                {/* Assets Breakdown */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-slate-700 dark:text-slate-300 font-semibold">
                    <span>Assets Breakdown</span>
                    <span>SAR {formatMoney(processedData.totalAssets)}</span>
                  </div>
                  <div className="h-3.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                    <div
                      style={{ width: `${(processedData.currentAssetsTotal / (processedData.totalAssets || 1)) * 100}%` }}
                      className="bg-emerald-500 h-full"
                      title={`Current Assets: SAR ${formatMoney(processedData.currentAssetsTotal)}`}
                    />
                    <div
                      style={{ width: `${(processedData.fixedAssetsTotal / (processedData.totalAssets || 1)) * 100}%` }}
                      className="bg-blue-500 h-full"
                      title={`Fixed Assets: SAR ${formatMoney(processedData.fixedAssetsTotal)}`}
                    />
                    <div
                      style={{ width: `${(processedData.investmentsTotal / (processedData.totalAssets || 1)) * 100}%` }}
                      className="bg-purple-500 h-full"
                      title={`Investments: SAR ${formatMoney(processedData.investmentsTotal)}`}
                    />
                  </div>
                  <div className="flex items-center gap-4 text-[11px] text-slate-500 pt-0.5">
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Current Assets ({formatMoney(processedData.currentAssetsTotal)})</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Fixed Assets ({formatMoney(processedData.fixedAssetsTotal)})</span>
                    {processedData.investmentsTotal > 0 && (
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-purple-500" /> Investments ({formatMoney(processedData.investmentsTotal)})</span>
                    )}
                  </div>
                </div>

                {/* Liabilities & Equity Breakdown */}
                <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex justify-between text-slate-700 dark:text-slate-300 font-semibold">
                    <span>Liabilities & Equity Breakdown</span>
                    <span>SAR {formatMoney(processedData.totalLiabilitiesAndEquity)}</span>
                  </div>
                  <div className="h-3.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                    <div
                      style={{ width: `${(processedData.currentLiabilitiesTotal / (processedData.totalLiabilitiesAndEquity || 1)) * 100}%` }}
                      className="bg-amber-500 h-full"
                      title={`Current Liabilities: SAR ${formatMoney(processedData.currentLiabilitiesTotal)}`}
                    />
                    <div
                      style={{ width: `${(processedData.longTermLiabilitiesTotal / (processedData.totalLiabilitiesAndEquity || 1)) * 100}%` }}
                      className="bg-rose-500 h-full"
                      title={`Long-term Liabilities: SAR ${formatMoney(processedData.longTermLiabilitiesTotal)}`}
                    />
                    <div
                      style={{ width: `${(processedData.totalEquity / (processedData.totalLiabilitiesAndEquity || 1)) * 100}%` }}
                      className="bg-indigo-500 h-full"
                      title={`Equity: SAR ${formatMoney(processedData.totalEquity)}`}
                    />
                  </div>
                  <div className="flex items-center gap-4 text-[11px] text-slate-500 pt-0.5">
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Current Liabilities ({formatMoney(processedData.currentLiabilitiesTotal)})</span>
                    {processedData.longTermLiabilitiesTotal > 0 && (
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Long-term Liabilities ({formatMoney(processedData.longTermLiabilitiesTotal)})</span>
                    )}
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-indigo-500" /> Equity ({formatMoney(processedData.totalEquity)})</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 6-Month Historical Trend Table */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">6-Month Financial Trend</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase font-bold text-[#757583]">
                      <th className="py-2 px-3">Month</th>
                      <th className="py-2 px-3 text-right">Total Assets</th>
                      <th className="py-2 px-3 text-right">Total Liabilities</th>
                      <th className="py-2 px-3 text-right">Total Equity</th>
                      <th className="py-2 px-3 text-right">Working Capital</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {trendData.map((row) => (
                      <tr key={row.date} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2 px-3 font-semibold text-slate-800 dark:text-slate-200">{row.label} ({row.date})</td>
                        <td className="py-2 px-3 text-right font-mono font-medium text-slate-900 dark:text-slate-100">{formatMoney(row.assets)}</td>
                        <td className="py-2 px-3 text-right font-mono text-slate-700 dark:text-slate-300">{formatMoney(row.liabilities)}</td>
                        <td className="py-2 px-3 text-right font-mono text-slate-700 dark:text-slate-300">{formatMoney(row.equity)}</td>
                        <td className={`py-2 px-3 text-right font-mono font-semibold ${row.workingCapital >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600'}`}>
                          {formatMoney(row.workingCapital)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* CUSTOMIZE SHEET */}
        <Sheet open={isCustomizeOpen} onOpenChange={setIsCustomizeOpen}>
          <SheetContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 sm:max-w-md">
            <SheetHeader>
              <SheetTitle>Customize Statement</SheetTitle>
              <SheetDescription>Configure presentation options for the Balance Sheet.</SheetDescription>
            </SheetHeader>
            <div className="py-6 space-y-5 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-bold">Show Account Codes</Label>
                  <p className="text-[11px] text-slate-500">Display GL account codes in front of account names</p>
                </div>
                <Switch checked={showCodes} onCheckedChange={(c) => updateParam('codes', c ? 'true' : 'false')} />
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-4">
                <div>
                  <Label className="font-bold">Show Zero Balance Rows</Label>
                  <p className="text-[11px] text-slate-500">Include accounts with 0.00 balance</p>
                </div>
                <Switch checked={showZeroRows} onCheckedChange={(z) => updateParam('zeroRows', z ? 'true' : 'false')} />
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-4">
                <div>
                  <Label className="font-bold">Negative Numbers Format</Label>
                  <p className="text-[11px] text-slate-500">Choose between minus sign or parenthesis</p>
                </div>
                <RadioGroup value={negFormat} onValueChange={(v) => updateParam('negFormat', v)} className="flex items-center gap-3 pt-1">
                  <div className="flex items-center space-x-1.5">
                    <RadioGroupItem value="minus" id="neg-minus" />
                    <Label htmlFor="neg-minus" className="text-xs">−1,234.00</Label>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <RadioGroupItem value="parens" id="neg-parens" />
                    <Label htmlFor="neg-parens" className="text-xs">(1,234.00)</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* STATEMENT SETUP SHEET (CLASS OVERRIDES) */}
        <Sheet open={isSetupOpen} onOpenChange={setIsSetupOpen}>
          <SheetContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 sm:max-w-lg overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Statement Setup & Classification</SheetTitle>
              <SheetDescription>Configure parent group and account classification overrides.</SheetDescription>
            </SheetHeader>
            <div className="py-6 space-y-4 text-xs">
              <p className="text-slate-600 dark:text-slate-400">
                Accounts inherit classification from their parent group by default. Select custom overrides below if an account belongs in a different balance sheet category:
              </p>
              {processedData && (
                <div className="space-y-3 pt-2">
                  <div className="font-bold text-slate-900 dark:text-slate-100">Asset Accounts Overrides</div>
                  {processedData.classifiedAssets.map((item) => {
                    const key = item.account_id || item.account_code || item.name;
                    return (
                      <div key={key} className="flex items-center justify-between gap-2 p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                        <div>
                          <p className="font-semibold">{item.name}</p>
                          <p className="text-[10px] text-slate-500">Code: {item.account_code || '—'} · Current: {item.category} ({item.subCategory || '—'})</p>
                        </div>
                        <Select
                          value={overrides[key] || item.subCategory || item.category}
                          onValueChange={(val) => {
                            const next = { ...overrides, [key]: val };
                            setOverrides(next);
                            saveStoredOverrides(next);
                          }}
                        >
                          <SelectTrigger className="h-7 text-[11px] w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="text-[11px]">
                            <SelectItem value="Cash & bank">Cash & bank</SelectItem>
                            <SelectItem value="Receivables">Receivables</SelectItem>
                            <SelectItem value="Advances & prepayments">Advances & prepayments</SelectItem>
                            <SelectItem value="Other current assets">Other current assets</SelectItem>
                            <SelectItem value="Fixed assets">Fixed assets</SelectItem>
                            <SelectItem value="Investments">Investments</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>

        {/* EXPORT MODAL */}
        <ExportModal<ExtendedLineItem & { section: string }>
          isOpen={isExportOpen}
          onClose={() => setIsExportOpen(false)}
          title="Export Balance Sheet"
          subtitle={`As of Date: ${asOf}`}
          fileNamePrefix="balance_sheet"
          sheetName="Balance Sheet"
          filteredData={exportData}
          columns={exportColumns}
          formats={['xlsx', 'csv', 'pdf']}
        />
      </div>
    </DashboardLayout>
  );
}

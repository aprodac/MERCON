import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  SlidersHorizontal,
  ArrowLeft,
  Search,
  Plus,
  Trash2,
  Save,
  Calendar,
  RotateCw,
  Download,
  Table as TableIcon,
  BarChart3,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  BarChart2,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  Filter,
  Sparkles,
  Edit3,
  ArrowRight,
  Check,
  Truck,
  Users,
  Car,
  Wrench,
  Building2,
  MapPin,
  FileText,
  ReceiptText,
  Wallet,
  Building,
  Layers,
  CheckSquare,
  Square,
  HelpCircle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import KpiCard from '@/components/ui/KpiCard';
import DataTable from '@/components/ui/DataTable';
import {
  reportBuilderService,
  ReportModule,
  ReportField,
  ReportQuerySpec,
  ReportResult,
  ReportFilter,
  ReportValueSpec,
  SavedReport,
} from '@/services/reportBuilderService';
import { FilterBuilder } from '@/components/report-builder/FilterBuilder';
import { SaveReportModal } from '@/components/report-builder/SaveReportModal';
import { ScheduleReportModal } from '@/components/report-builder/ScheduleReportModal';
import { downloadCSVTable, exportExcelTable, exportPDFTable } from '@/utils/exportUtils';

const CHART_COLORS = ['#E8450F', '#6366F1', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#3B82F6'];

// Logical category mapping for business areas
const CATEGORY_MAP: Record<
  string,
  { category: 'OPERATIONS' | 'FINANCE' | 'CUSTOMERS'; icon: any; description: string }
> = {
  trips: { category: 'OPERATIONS', icon: Truck, description: 'View and analyze trip activity, charges, and completion status' },
  drivers: { category: 'OPERATIONS', icon: Users, description: 'View driver activity, risk scores, and performance' },
  vehicles: { category: 'OPERATIONS', icon: Car, description: 'View vehicle usage, odometer mileage, and asset details' },
  maintenance: { category: 'OPERATIONS', icon: Wrench, description: 'View vehicle maintenance, service dates, and repair costs' },
  thirdParty: { category: 'OPERATIONS', icon: Building2, description: 'View third-party fleet partners and outsourced trip costs' },
  locations: { category: 'OPERATIONS', icon: MapPin, description: 'View operational pickup and delivery locations' },
  documents: { category: 'OPERATIONS', icon: FileText, description: 'View compliance documents, licenses, and expiry tracking' },
  invoices: { category: 'FINANCE', icon: ReceiptText, description: 'View customer invoices, total billing, and outstanding balances' },
  expenses: { category: 'FINANCE', icon: Wallet, description: 'View operational expenses, fuel costs, labor, and repair payouts' },
  customers: { category: 'CUSTOMERS', icon: Building, description: 'View customer accounts, credit limits, and historical billing' },
};

const TIME_RANGES = [
  { id: 'this_month', label: 'This Month' },
  { id: 'today', label: 'Today' },
  { id: 'this_week', label: 'This Week' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'this_quarter', label: 'This Quarter' },
  { id: 'ytd', label: 'Year to Date (YTD)' },
  { id: 'custom', label: 'Custom Range' },
  { id: 'all', label: 'All Time' },
];

export default function AdvancedBuilderPage() {
  const navigate = useNavigate();
  const location = useLocation();

  // Initial state passed from templates / saved reports
  const initialSpec: ReportQuerySpec | undefined = location.state?.initialSpec;
  const initialReportName: string | undefined = location.state?.reportName;

  // Step state (1: Category/Module selection, 2: Field selection, 3: Live Report & Visualization)
  const [step, setStep] = useState<1 | 2 | 3>(initialSpec ? 3 : 1);
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<'ALL' | 'OPERATIONS' | 'FINANCE' | 'CUSTOMERS'>('ALL');
  const [selectedModuleKey, setSelectedModuleKey] = useState<string>(initialSpec?.rootModule || '');

  // Field selection state
  const [selectedFields, setSelectedFields] = useState<string[]>(() => {
    if (!initialSpec) return [];
    const fields = new Set<string>();
    if (initialSpec.rows) initialSpec.rows.forEach((r) => fields.add(r));
    if (initialSpec.columns) initialSpec.columns.forEach((c) => fields.add(c));
    if (initialSpec.values) initialSpec.values.forEach((v) => fields.add(v.field));
    return Array.from(fields);
  });

  const [fieldSearch, setFieldSearch] = useState<string>('');
  const [fieldAggOverrides, setFieldAggOverrides] = useState<Record<string, 'sum' | 'avg' | 'min' | 'max' | 'count'>>({});

  // Filters & Time Period state
  const [timeRange, setTimeRange] = useState<string>('this_month');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [filters, setFilters] = useState<ReportFilter[]>(initialSpec?.filters || []);
  const [showFilterPanel, setShowFilterPanel] = useState<boolean>(false);

  // Visualization state
  const [visualization, setVisualization] = useState<'table' | 'bar' | 'column' | 'line' | 'pie'>('table');
  const [customTitle, setCustomTitle] = useState<string>(initialReportName || '');
  const [isEditingTitle, setIsEditingTitle] = useState<boolean>(false);

  // Modals state
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [activeReport, setActiveReport] = useState<SavedReport | undefined>(undefined);

  // Fetch schema from backend report engine API
  const { data: schemaModules = [], isLoading: loadingSchema } = useQuery({
    queryKey: ['reportSchema'],
    queryFn: reportBuilderService.getSchema,
  });

  // Flattened schema fields
  const allSchemaFields: ReportField[] = useMemo(() => {
    return schemaModules.flatMap((m) => m.fields);
  }, [schemaModules]);

  // Selected module schema object
  const selectedModuleObj = useMemo(() => {
    return schemaModules.find((m) => m.key === selectedModuleKey);
  }, [schemaModules, selectedModuleKey]);

  // Valid selectable fields (Selected module + valid 1-hop joined modules only!)
  const validSelectableModules = useMemo(() => {
    if (!selectedModuleObj) return [];
    const validJoinedKeys = new Set(selectedModuleObj.joins.map((j) => j.toModule));
    return schemaModules.filter((m) => m.key === selectedModuleKey || validJoinedKeys.has(m.key));
  }, [schemaModules, selectedModuleObj, selectedModuleKey]);

  const validSelectableFields = useMemo(() => {
    return validSelectableModules.flatMap((m) => m.fields);
  }, [validSelectableModules]);

  // Calculate Date Range ISO strings for backend query
  const calculatedDateRange = useMemo(() => {
    const now = new Date();
    if (timeRange === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      return { start: start.toISOString(), end: end.toISOString() };
    }
    if (timeRange === 'this_week') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      const start = new Date(now.setDate(diff));
      start.setHours(0, 0, 0, 0);
      return { start: start.toISOString() };
    }
    if (timeRange === 'this_month') {
      return { start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString() };
    }
    if (timeRange === 'last_month') {
      return {
        start: new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString(),
        end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString(),
      };
    }
    if (timeRange === 'this_quarter') {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      return { start: new Date(now.getFullYear(), qMonth, 1).toISOString() };
    }
    if (timeRange === 'ytd') {
      return { start: new Date(now.getFullYear(), 0, 1).toISOString() };
    }
    if (timeRange === 'custom') {
      return {
        start: customStart ? new Date(customStart).toISOString() : undefined,
        end: customEnd ? new Date(`${customEnd}T23:59:59`).toISOString() : undefined,
      };
    }
    return undefined;
  }, [timeRange, customStart, customEnd]);

  // Automatically assemble ReportQuerySpec from selected module & selected fields
  const currentQuerySpec: ReportQuerySpec | null = useMemo(() => {
    if (!selectedModuleKey || selectedFields.length === 0) return null;

    const selectedObjList = selectedFields.map((k) => allSchemaFields.find((f) => f.key === k)).filter(Boolean) as ReportField[];

    const dimFieldKeys = selectedObjList
      .filter((f) => f.type === 'string' || f.type === 'enum' || f.type === 'date')
      .map((f) => f.key);

    const valFieldObjs = selectedObjList.filter((f) => f.type === 'number' || f.type === 'money');

    let rows: string[] = [];
    let values: ReportValueSpec[] = [];

    if (dimFieldKeys.length > 0) {
      rows = dimFieldKeys;
      values = valFieldObjs.map((f) => ({
        field: f.key,
        agg: fieldAggOverrides[f.key] || 'sum',
      }));

      // If no numeric field was selected, add default module count metric so query resolves rows
      if (values.length === 0) {
        const countFieldKey = `${selectedModuleKey}.count`;
        const hasCountInSchema = allSchemaFields.some((f) => f.key === countFieldKey);
        values = [{ field: hasCountInSchema ? countFieldKey : dimFieldKeys[0], agg: 'count' }];
      }
    } else {
      // Only numeric fields selected -> use default date or identifier as row dimension
      const defaultRowKey = selectedModuleObj?.defaultDateField
        ? `${selectedModuleKey}.${selectedModuleObj.defaultDateField}`
        : `${selectedModuleKey}.ref_id`;

      rows = [allSchemaFields.some((f) => f.key === defaultRowKey) ? defaultRowKey : selectedFields[0]];
      values = valFieldObjs.map((f) => ({
        field: f.key,
        agg: fieldAggOverrides[f.key] || 'sum',
      }));
    }

    return {
      rootModule: selectedModuleKey,
      rows,
      values,
      filters,
      dateRange: calculatedDateRange,
    };
  }, [selectedModuleKey, selectedFields, allSchemaFields, selectedModuleObj, fieldAggOverrides, filters, calculatedDateRange]);

  // Execute report query via existing backend report engine API
  const {
    data: queryResult,
    isLoading: querying,
    isError,
    error,
    refetch,
  } = useQuery<ReportResult>({
    queryKey: ['reportEngineQuery', currentQuerySpec],
    queryFn: () => reportBuilderService.runQuery(currentQuerySpec!),
    enabled: step === 3 && !!currentQuerySpec,
  });

  // Auto-generate human readable report title
  const autoReportTitle = useMemo(() => {
    if (customTitle) return customTitle;
    if (!selectedModuleObj) return 'Business Report';

    const selectedObjList = selectedFields.map((k) => allSchemaFields.find((f) => f.key === k)).filter(Boolean) as ReportField[];

    const dimFields = selectedObjList.filter((f) => f.type === 'string' || f.type === 'enum' || f.type === 'date');
    const valFields = selectedObjList.filter((f) => f.type === 'number' || f.type === 'money');

    const primaryDim = dimFields[0];
    const primaryVal = valFields[0];

    if (primaryDim && primaryVal) {
      if (primaryDim.type === 'date') return `${primaryVal.label} Over Time`;
      return `${primaryVal.label} by ${primaryDim.label}`;
    }
    if (primaryDim && !primaryVal) {
      return `${selectedModuleObj.label} Count by ${primaryDim.label}`;
    }
    if (!primaryDim && primaryVal) {
      return `Total ${primaryVal.label} Report`;
    }
    return `${selectedModuleObj.label} Report`;
  }, [customTitle, selectedModuleObj, selectedFields, allSchemaFields]);

  // Handlers for Module & Field selection
  const handleSelectModule = (modKey: string) => {
    setSelectedModuleKey(modKey);
    // Pre-select first 5 fields belonging to this module
    const modObj = schemaModules.find((m) => m.key === modKey);
    if (modObj) {
      setSelectedFields(modObj.fields.slice(0, 5).map((f) => f.key));
    }
    setStep(2);
  };

  const handleToggleField = (fieldKey: string) => {
    setSelectedFields((prev) =>
      prev.includes(fieldKey) ? prev.filter((k) => k !== fieldKey) : [...prev, fieldKey]
    );
  };

  const handleSelectAllModuleFields = (modKey: string) => {
    const modObj = schemaModules.find((m) => m.key === modKey);
    if (!modObj) return;
    const modFieldKeys = modObj.fields.map((f) => f.key);
    const allSelected = modFieldKeys.every((k) => selectedFields.includes(k));

    if (allSelected) {
      setSelectedFields((prev) => prev.filter((k) => !modFieldKeys.includes(k)));
    } else {
      setSelectedFields((prev) => Array.from(new Set([...prev, ...modFieldKeys])));
    }
  };

  // Chart data prep
  const chartRows = useMemo(() => (queryResult?.rows || []).slice(0, 30), [queryResult]);
  const primaryDimKey = currentQuerySpec?.rows[0] || '';
  const primaryMetricKey = currentQuerySpec?.values[0]?.field || '';

  const chartDimLabel = allSchemaFields.find((f) => f.key === primaryDimKey)?.label || primaryDimKey;
  const chartMetricLabel = allSchemaFields.find((f) => f.key === primaryMetricKey)?.label || primaryMetricKey;

  // Export handlers using actual query data
  const handleExportCSV = () => {
    if (!queryResult?.rows.length) return;
    const headers = Object.keys(queryResult.rows[0]);
    const exportRows = queryResult.rows.map((r) => headers.map((h) => r[h] ?? '—'));
    downloadCSVTable(headers, exportRows, `${selectedModuleKey}_report.csv`);
  };

  const handleExportExcel = () => {
    if (!queryResult?.rows.length) return;
    const headers = Object.keys(queryResult.rows[0]);
    const exportRows = queryResult.rows.map((r) => headers.map((h) => r[h] ?? '—'));
    const subtitle = `Report: ${autoReportTitle} · Time: ${TIME_RANGES.find((r) => r.id === timeRange)?.label} · Generated: ${new Date().toLocaleString()}`;
    exportExcelTable(autoReportTitle, headers, exportRows, `${selectedModuleKey}_report.xlsx`, { subtitle });
  };

  const handleExportPDF = () => {
    if (!queryResult?.rows.length) return;
    const headers = Object.keys(queryResult.rows[0]);
    const exportRows = queryResult.rows.map((r) => headers.map((h) => r[h] ?? '—'));
    const subtitle = `Report: ${autoReportTitle} · Time: ${TIME_RANGES.find((r) => r.id === timeRange)?.label} · Generated: ${new Date().toLocaleString()}`;
    exportPDFTable(autoReportTitle, headers, exportRows, `${selectedModuleKey}_report.pdf`, { subtitle });
  };

  return (
    <DashboardLayout active="Report Builder" title="Business Report Builder">
      <div className="px-4 sm:px-6 lg:px-8 max-w-[1600px] mx-auto space-y-6 pb-16">
        {/* Header Bar & Breadcrumb Stepper */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (step > 1) setStep((s) => (s - 1) as 1 | 2 | 3);
                else navigate('/report-builder');
              }}
              className="text-slate-500 hover:text-slate-900"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              {/* Stepper Breadcrumb */}
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-1">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className={`hover:text-[#E8450F] transition-colors ${step === 1 ? 'text-[#E8450F] font-bold' : ''}`}
                >
                  1. Choose Area
                </button>
                <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                <button
                  type="button"
                  onClick={() => selectedModuleKey && setStep(2)}
                  disabled={!selectedModuleKey}
                  className={`hover:text-[#E8450F] transition-colors ${
                    step === 2 ? 'text-[#E8450F] font-bold' : ''
                  } ${!selectedModuleKey ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  2. Select Information {selectedModuleObj ? `(${selectedModuleObj.label})` : ''}
                </button>
                <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                <span className={step === 3 ? 'text-[#E8450F] font-bold' : ''}>3. View Live Report</span>
              </div>

              <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5 text-[#E8450F]" />
                {step === 1
                  ? 'What area of the business do you want to report on?'
                  : step === 2
                  ? `Select information for ${selectedModuleObj?.label || 'Report'}`
                  : autoReportTitle}
              </h1>
            </div>
          </div>

          {/* Top Bar Actions Group */}
          <div className="flex items-center gap-2.5">
            {step === 3 && (
              <>
                <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-1.5 text-xs font-medium">
                  <Download className="w-3.5 h-3.5" /> Export CSV
                </Button>
                <Button
                  size="sm"
                  onClick={() => setSaveModalOpen(true)}
                  className="gap-1.5 text-xs font-semibold bg-[#E8450F] hover:bg-[#c43809] text-white shadow-2xs"
                >
                  <Save className="w-3.5 h-3.5" /> Save Report
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setScheduleModalOpen(true)}
                  className="gap-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300"
                >
                  <Calendar className="w-3.5 h-3.5" /> Schedule
                </Button>
              </>
            )}
          </div>
        </div>

        {/* ─── SCREEN 1: CATEGORY & MODULE SELECTION ─────────────────────────── */}
        {step === 1 && (
          <div className="space-y-6">
            {/* Category Tabs Filter */}
            <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
              {(['ALL', 'OPERATIONS', 'FINANCE', 'CUSTOMERS'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategoryTab(cat)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    selectedCategoryTab === cat
                      ? 'bg-charcoal text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat === 'ALL' ? 'All Areas' : cat}
                </button>
              ))}
            </div>

            {loadingSchema ? (
              <div className="p-12 text-center text-xs text-slate-400 animate-pulse">Loading business modules...</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {schemaModules
                  .filter((mod) => {
                    const info = CATEGORY_MAP[mod.key] || { category: 'OPERATIONS' };
                    if (selectedCategoryTab === 'ALL') return true;
                    return info.category === selectedCategoryTab;
                  })
                  .map((mod) => {
                    const info = CATEGORY_MAP[mod.key] || {
                      category: 'OPERATIONS',
                      icon: Layers,
                      description: `View and analyze ${mod.label} data`,
                    };
                    const Icon = info.icon;
                    const fieldCount = mod.fields.length;

                    return (
                      <Card
                        key={mod.key}
                        onClick={() => handleSelectModule(mod.key)}
                        className="border-slate-200 hover:border-[#E8450F] hover:shadow-md cursor-pointer transition-all group flex flex-col justify-between"
                      >
                        <CardHeader className="p-5 pb-3">
                          <div className="flex items-center justify-between mb-3">
                            <Icon className="w-8 h-8 text-[#E8450F] group-hover:scale-105 transition-transform" />
                            <Badge variant="outline" className="text-[10px] uppercase font-bold text-slate-600 bg-slate-100 border-slate-200">
                              {info.category}
                            </Badge>
                          </div>
                          <CardTitle className="text-base font-bold text-slate-900 group-hover:text-[#E8450F] transition-colors">
                            {mod.label}
                          </CardTitle>
                          <CardDescription className="text-xs text-slate-600 leading-relaxed pt-1">
                            "{info.description}"
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="p-5 pt-0 flex items-center justify-between border-t border-slate-100 mt-4 text-xs">
                          <span className="text-slate-400 font-medium">{fieldCount} available fields</span>
                          <span className="font-bold text-[#E8450F] flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                            Select Module <ChevronRight className="w-4 h-4" />
                          </span>
                        </CardContent>
                      </Card>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        {/* ─── SCREEN 2: FIELD SELECTION ─────────────────────────────────────── */}
        {step === 2 && selectedModuleObj && (
          <div className="space-y-6">
            {/* Top Bar for Field Selection */}
            <Card className="border-slate-200 p-4 bg-slate-50/70 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-orange-50 text-[#E8450F] rounded-xl border border-orange-200">
                  {(() => {
                    const Icon = (CATEGORY_MAP[selectedModuleKey] || {}).icon || Layers;
                    return <Icon className="w-5 h-5" />;
                  })()}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{selectedModuleObj.label} Fields</h3>
                  <p className="text-xs text-slate-500">
                    Check the fields you want to include in your report preview.
                  </p>
                </div>
              </div>

              {/* Counter & Action */}
              <div className="flex items-center gap-3">
                <Badge className="bg-[#E8450F] text-white px-3 py-1 text-xs font-bold shadow-2xs">
                  {selectedFields.length} fields selected
                </Badge>

                <Button
                  onClick={() => setStep(3)}
                  disabled={selectedFields.length === 0}
                  className="bg-[#E8450F] hover:bg-[#c43809] text-white text-xs font-bold px-4 shadow-2xs gap-1.5"
                >
                  Continue to Live Report <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </Card>

            {/* Field Search Bar */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <Input
                type="text"
                placeholder={`Search fields in ${selectedModuleObj.label} and connected modules...`}
                value={fieldSearch}
                onChange={(e) => setFieldSearch(e.target.value)}
                className="text-xs pl-10 bg-white border-slate-200 h-10 shadow-2xs"
              />
            </div>

            {/* Grouped Field Selection List */}
            <div className="space-y-6">
              {validSelectableModules.map((mod) => {
                const matchingFields = mod.fields.filter(
                  (f) =>
                    f.label.toLowerCase().includes(fieldSearch.toLowerCase()) ||
                    f.key.toLowerCase().includes(fieldSearch.toLowerCase())
                );
                if (fieldSearch && matchingFields.length === 0) return null;

                const isPrimaryModule = mod.key === selectedModuleKey;
                const allModSelected = matchingFields.every((f) => selectedFields.includes(f.key));

                return (
                  <Card key={mod.key} className="border-slate-200 shadow-xs">
                    <CardHeader className="p-4 pb-3 border-b border-slate-100 bg-slate-50/50 flex flex-row items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                          {mod.label} {isPrimaryModule ? '(Primary Module)' : '(Connected Automatically)'}
                        </h4>
                        {!isPrimaryModule && (
                          <Badge variant="outline" className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border-emerald-200">
                            Valid 1-hop relation
                          </Badge>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleSelectAllModuleFields(mod.key)}
                        className="text-xs font-semibold text-[#E8450F] hover:underline cursor-pointer"
                      >
                        {allModSelected ? 'Deselect All' : 'Select All'}
                      </button>
                    </CardHeader>

                    <CardContent className="p-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {matchingFields.map((field) => {
                          const isSelected = selectedFields.includes(field.key);
                          const isNumeric = field.type === 'number' || field.type === 'money';

                          return (
                            <div
                              key={field.key}
                              onClick={() => handleToggleField(field.key)}
                              className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                                isSelected
                                  ? 'bg-orange-50/70 border-[#E8450F] text-slate-900 shadow-2xs'
                                  : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 overflow-hidden">
                                {isSelected ? (
                                  <CheckSquare className="w-4 h-4 text-[#E8450F] shrink-0" />
                                ) : (
                                  <Square className="w-4 h-4 text-slate-300 shrink-0" />
                                )}
                                <div>
                                  <span className="text-xs font-semibold block truncate">{field.label}</span>
                                  <span className="text-[10px] text-slate-400 font-mono">{field.key}</span>
                                </div>
                              </div>

                              <Badge
                                variant="outline"
                                className={`text-[10px] font-mono shrink-0 ml-2 ${
                                  field.type === 'money'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : field.type === 'number'
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : field.type === 'date'
                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                    : 'bg-slate-100 text-slate-600 border-slate-200'
                                }`}
                              >
                                {field.type === 'money' ? '$ Money' : field.type === 'number' ? '# Num' : field.type === 'date' ? 'Date' : 'Aa Text'}
                              </Badge>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Bottom Action Row */}
            <div className="flex items-center justify-between border-t border-slate-200 pt-4">
              <Button variant="outline" size="sm" onClick={() => setStep(1)} className="text-xs font-semibold">
                ← Change Business Area
              </Button>

              <Button
                onClick={() => setStep(3)}
                disabled={selectedFields.length === 0}
                className="bg-[#E8450F] hover:bg-[#c43809] text-white text-xs font-bold px-6 shadow-2xs gap-1.5"
              >
                Continue to Live Report <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ─── SCREEN 3: LIVE REPORT & VISUALIZATION ─────────────────────────── */}
        {step === 3 && (
          <div className="space-y-5">
            {/* Title Bar & Quick Controls */}
            <Card className="border-slate-200 p-4 shadow-2xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  {isEditingTitle ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="text"
                        value={customTitle || autoReportTitle}
                        onChange={(e) => setCustomTitle(e.target.value)}
                        className="text-base font-bold text-slate-900 bg-white border-slate-300 h-9"
                      />
                      <Button size="sm" onClick={() => setIsEditingTitle(false)} className="h-9 px-3 bg-[#E8450F] text-white text-xs font-semibold">
                        Done
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 group cursor-pointer" onClick={() => setIsEditingTitle(true)}>
                      <h2 className="text-lg font-bold text-slate-900 tracking-tight">{autoReportTitle}</h2>
                      <Edit3 className="w-4 h-4 text-slate-400 group-hover:text-[#E8450F] transition-colors" />
                    </div>
                  )}
                  <Badge variant="outline" className="text-[11px] font-semibold bg-orange-50 text-[#E8450F] border-orange-200">
                    Live Data
                  </Badge>
                </div>

                {/* Back to Edit Fields Button */}
                <Button variant="outline" size="sm" onClick={() => setStep(2)} className="text-xs font-semibold text-slate-700">
                  ← Edit Fields ({selectedFields.length})
                </Button>
              </div>

              {/* Time Range & Compact Filter Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Time Range Selector */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-600">Date Range:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {TIME_RANGES.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setTimeRange(r.id)}
                        className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors cursor-pointer ${
                          timeRange === r.id
                            ? 'bg-charcoal text-white border-slate-900 font-semibold shadow-2xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Filter Toggle */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowFilterPanel(!showFilterPanel)}
                  className={`gap-1.5 text-xs font-semibold ${
                    filters.length > 0 ? 'bg-orange-50 text-[#E8450F] border-orange-200' : 'text-slate-700'
                  }`}
                >
                  <Filter className="w-3.5 h-3.5" />
                  {filters.length > 0 ? `${filters.length} Filters Applied` : '+ Add Filter'}
                </Button>
              </div>

              {/* Custom Date Range Picker */}
              {timeRange === 'custom' && (
                <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                  <span className="font-semibold text-slate-600">Start:</span>
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="px-2 py-1 bg-white border border-slate-300 rounded text-xs"
                  />
                  <span className="font-semibold text-slate-600">End:</span>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="px-2 py-1 bg-white border border-slate-300 rounded text-xs"
                  />
                </div>
              )}

              {/* Expandable Filter Panel */}
              {showFilterPanel && (
                <div className="pt-3 border-t border-slate-100">
                  <FilterBuilder filters={filters} onChange={setFilters} availableFields={validSelectableFields} />
                </div>
              )}
            </Card>

            {/* Visualization Switcher Bar */}
            <Card className="border-slate-200 p-3 shadow-2xs flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">View Format:</span>

              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                {[
                  { id: 'table', icon: TableIcon, label: 'Grid / Ledger' },
                  { id: 'bar', icon: BarChart3, label: 'Bar Chart' },
                  { id: 'column', icon: BarChart2, label: 'Column Chart' },
                  { id: 'line', icon: LineChartIcon, label: 'Line Chart' },
                  { id: 'pie', icon: PieChartIcon, label: 'Pie Chart' },
                ].map((mode) => {
                  const Icon = mode.icon;
                  const isActive = visualization === mode.id;
                  return (
                    <button
                      key={mode.id}
                      onClick={() => setVisualization(mode.id as any)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                        isActive ? 'bg-white text-[#E8450F] shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {mode.label}
                    </button>
                  );
                })}
              </div>
            </Card>

            {/* Query Execution Output Canvas */}
            {querying ? (
              <div className="p-16 text-center text-xs text-slate-500 bg-white rounded-2xl border border-slate-200 animate-pulse">
                Fetching live business report records from database...
              </div>
            ) : isError ? (
              <div className="p-5 text-xs bg-red-50 text-red-700 border border-red-200 rounded-2xl flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Failed to load live data: </span>
                  {(error as any)?.response?.data?.error?.message || (error as any)?.message || 'Invalid parameters'}
                </div>
              </div>
            ) : queryResult ? (
              <div className="space-y-4">
                {/* KPI Summary Cards */}
                {Object.keys(queryResult.kpis).length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {Object.entries(queryResult.kpis).slice(0, 4).map(([k, val]) => (
                      <KpiCard
                        key={k}
                        title={k.replace(/_/g, ' ').toUpperCase()}
                        value={typeof val === 'number' ? val.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(val)}
                        variant="amber"
                      />
                    ))}
                  </div>
                )}

                {/* Chart View */}
                {visualization !== 'table' && chartRows.length > 0 && (
                  <Card className="border-slate-200 p-5 h-80 shadow-2xs">
                    <div className="mb-2 text-xs font-bold text-slate-600">
                      {chartMetricLabel} by {chartDimLabel}
                    </div>
                    <ResponsiveContainer width="100%" height="90%">
                      {visualization === 'bar' || visualization === 'column' ? (
                        <BarChart data={chartRows} layout={visualization === 'bar' ? 'vertical' : 'horizontal'}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          {visualization === 'bar' ? (
                            <>
                              <XAxis type="number" tick={{ fontSize: 10 }} />
                              <YAxis dataKey={primaryDimKey} type="category" tick={{ fontSize: 10 }} width={100} />
                            </>
                          ) : (
                            <>
                              <XAxis dataKey={primaryDimKey} tick={{ fontSize: 10 }} />
                              <YAxis tick={{ fontSize: 10 }} />
                            </>
                          )}
                          <RechartsTooltip />
                          <Bar dataKey={primaryMetricKey} fill="#E8450F" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      ) : visualization === 'line' ? (
                        <LineChart data={chartRows}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis dataKey={primaryDimKey} tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <RechartsTooltip />
                          <Line type="monotone" dataKey={primaryMetricKey} stroke="#E8450F" strokeWidth={2.5} />
                        </LineChart>
                      ) : (
                        <PieChart>
                          <RechartsTooltip />
                          <Pie data={chartRows} dataKey={primaryMetricKey} nameKey={primaryDimKey} cx="50%" cy="50%" outerRadius={90} fill="#8884d8">
                            {chartRows.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                        </PieChart>
                      )}
                    </ResponsiveContainer>
                  </Card>
                )}

                {/* Data Table View */}
                <Card className="border-slate-200 shadow-2xs p-4">
                  <DataTable
                    columns={
                      queryResult.rows.length > 0
                        ? Object.keys(queryResult.rows[0]).map((colKey) => {
                            const fieldObj = allSchemaFields.find((f) => f.key === colKey);
                            const headerLabel = fieldObj ? fieldObj.label.toUpperCase() : colKey.replace(/_/g, ' ').toUpperCase();

                            return {
                              header: headerLabel,
                              accessor: (row: any) => {
                                const val = row[colKey];
                                if (val === null || val === undefined) return '—';
                                if (typeof val === 'number') {
                                  if (fieldObj?.type === 'money') {
                                    return `₹${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                                  }
                                  return val.toLocaleString(undefined, { maximumFractionDigits: 2 });
                                }
                                return String(val);
                              },
                            };
                          })
                        : []
                    }
                    data={queryResult.rows}
                    emptyTitle="No records matching selected criteria"
                    emptyMessage="Try adjusting your field selection or date range filters."
                  />
                </Card>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <SaveReportModal
        open={saveModalOpen}
        onOpenChange={setSaveModalOpen}
        spec={currentQuerySpec!}
        visualization={visualization}
        onSaved={() => navigate('/report-builder')}
      />

      <ScheduleReportModal
        open={scheduleModalOpen}
        onOpenChange={setScheduleModalOpen}
        savedReport={activeReport}
        onScheduled={() => navigate('/report-builder')}
      />
    </DashboardLayout>
  );
}


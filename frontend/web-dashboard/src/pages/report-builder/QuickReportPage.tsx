import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Zap,
  ArrowLeft,
  RotateCw,
  Download,
  SlidersHorizontal,
  FileSpreadsheet,
  Users,
  Car,
  Truck,
  Building2,
  ReceiptText,
  Wallet,
  Wrench,
  Search,
  Sliders,
  Calendar,
  BarChart3,
  CheckCircle2,
  X,
  FileText,
  Edit3,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import KpiCard from '@/components/ui/KpiCard';
import DataTable from '@/components/ui/DataTable';
import { reportBuilderService, ReportQuerySpec, ReportResult } from '@/services/reportBuilderService';
import { downloadCSVTable, exportPDFTable, exportExcelTable } from '@/utils/exportUtils';

interface PresetQuestion {
  id: string;
  title: string;
  description: string;
  rows: string[];
  values: { field: string; agg: 'sum' | 'avg' | 'min' | 'max' | 'count' }[];
  filters?: any[];
}

interface PresetOption {
  id: string;
  moduleKey: string;
  moduleLabel: string;
  icon: any;
  questions: PresetQuestion[];
}

const FIELD_LABELS: Record<string, string> = {
  'drivers.full_name': 'Driver Name',
  'drivers.ref_id': 'Driver ID',
  'drivers.phone_primary': 'Phone',
  'drivers.status': 'Driver Status',
  'drivers.createdAt': 'Joining Date',
  'drivers.license_expiry': 'License Expiry',
  'drivers.completed_trips': 'Completed Trips',
  'drivers.dispatched_trips': 'Dispatched Trips',
  'drivers.cancelled_trips': 'Cancelled Trips',
  'drivers.total_trips': 'Total Trips',
  'drivers.revenue': 'Driver Revenue',

  'vehicles.plate_number': 'Vehicle Plate',
  'vehicles.asset_type': 'Vehicle Type',
  'vehicles.status': 'Vehicle Status',
  'vehicles.capacity_kg': 'Capacity (kg)',
  'vehicles.current_odometer': 'Odometer (km)',

  'trips.ref_id': 'Trip ID',
  'trips.createdAt': 'Trip Date',
  'trips.status': 'Trip Status',
  'trips.revenue': 'Revenue',
  'trips.trip_charges': 'Driver Charge',
  'trips.third_party_cost': 'Third-Party Cost',
  'trips.count': 'Trip Count',

  'customers.name': 'Customer Name',
  'customers.contact_phone': 'Contact Phone',

  'thirdParty.name': 'Vendor Name',
  'thirdParty.contact_person': 'Contact Person',
  'thirdParty.rating': 'Vendor Rating',

  'maintenance.workshop_name': 'Workshop Name',
  'maintenance.maintenance_type': 'Service Type',
  'maintenance.status': 'Maintenance Status',
  'maintenance.service_date': 'Service Date',
  'maintenance.next_service_due': 'Next Service Due',
  'maintenance.cost': 'Maintenance Cost',

  'expenses.category': 'Expense Category',
  'expenses.amount': 'Expense Amount',
  'expenses.expense_date': 'Expense Date',
  'expenses.status': 'Expense Status',

  'invoices.ref_id': 'Invoice Number',
  'invoices.createdAt': 'Invoice Date',
  'invoices.total_amount': 'Invoice Amount',
  'invoices.status': 'Invoice Status',
  'invoices.due_date': 'Due Date',
  'invoices.outstanding': 'Outstanding Balance',
};

const MONEY_FIELDS = new Set([
  'drivers.revenue',
  'trips.revenue',
  'trips.trip_charges',
  'trips.third_party_cost',
  'maintenance.cost',
  'expenses.amount',
  'invoices.total_amount',
  'invoices.outstanding',
]);

const PRESETS: PresetOption[] = [
  {
    id: 'drivers',
    moduleKey: 'drivers',
    moduleLabel: 'Drivers',
    icon: Users,
    questions: [
      {
        id: 'driver-trips',
        title: 'Trips per Driver (Completed)',
        description: 'Count of completed trips grouped by driver.',
        rows: ['drivers.full_name', 'drivers.ref_id'],
        values: [
          { field: 'drivers.completed_trips', agg: 'sum' },
          { field: 'drivers.dispatched_trips', agg: 'sum' },
          { field: 'drivers.cancelled_trips', agg: 'sum' },
          { field: 'drivers.total_trips', agg: 'sum' },
          { field: 'drivers.revenue', agg: 'sum' },
        ],
      },
      {
        id: 'driver-revenue',
        title: 'Total Revenue Earned by Driver',
        description: 'Sum of completed trip billing grouped by assigned driver.',
        rows: ['drivers.full_name', 'drivers.ref_id'],
        values: [
          { field: 'drivers.revenue', agg: 'sum' },
          { field: 'drivers.completed_trips', agg: 'sum' },
        ],
      },
    ],
  },
  {
    id: 'vehicles',
    moduleKey: 'vehicles',
    moduleLabel: 'Vehicles',
    icon: Car,
    questions: [
      {
        id: 'vehicle-maint',
        title: 'Vehicle Maintenance Repair Costs',
        description: 'Sum of service and repair expenses per vehicle plate.',
        rows: ['vehicles.plate_number', 'vehicles.asset_type', 'vehicles.status'],
        values: [
          { field: 'maintenance.cost', agg: 'sum' },
          { field: 'trips.revenue', agg: 'sum' },
        ],
      },
      {
        id: 'vehicle-trips',
        title: 'Fleet Trip Revenue Breakdown',
        description: 'Billing generated per truck asset.',
        rows: ['vehicles.plate_number', 'vehicles.capacity_kg'],
        values: [{ field: 'trips.revenue', agg: 'sum' }],
      },
    ],
  },
  {
    id: 'trips',
    moduleKey: 'trips',
    moduleLabel: 'Trips',
    icon: Truck,
    questions: [
      {
        id: 'trips-status',
        title: 'Trip Revenue & Volume by Status',
        description: 'Revenue totals grouped by trip operational status.',
        rows: ['trips.status'],
        values: [
          { field: 'trips.revenue', agg: 'sum' },
          { field: 'trips.count', agg: 'sum' },
        ],
      },
    ],
  },
  {
    id: 'customers',
    moduleKey: 'customers',
    moduleLabel: 'Customers',
    icon: Building2,
    questions: [
      {
        id: 'customer-biling',
        title: 'Top Customer Billing & Invoice Totals',
        description: 'Billed amount across top logistics clients.',
        rows: ['customers.name'],
        values: [{ field: 'invoices.total_amount', agg: 'sum' }],
      },
    ],
  },
  {
    id: 'invoices',
    moduleKey: 'invoices',
    moduleLabel: 'Invoices',
    icon: ReceiptText,
    questions: [
      {
        id: 'invoice-outstanding',
        title: 'Overdue & Pending Invoices Ledger',
        description: 'Outstanding balance breakdowns grouped by status.',
        rows: ['invoices.status'],
        values: [
          { field: 'invoices.total_amount', agg: 'sum' },
          { field: 'invoices.outstanding', agg: 'sum' },
        ],
      },
    ],
  },
  {
    id: 'expenses',
    moduleKey: 'expenses',
    moduleLabel: 'Expenses',
    icon: Wallet,
    questions: [
      {
        id: 'expenses-cat',
        title: 'Operating Expenses by Category',
        description: 'Fuel, toll, labor and repair costs summarized.',
        rows: ['expenses.category'],
        values: [{ field: 'expenses.amount', agg: 'sum' }],
      },
    ],
  },
  {
    id: 'maintenance',
    moduleKey: 'maintenance',
    moduleLabel: 'Maintenance',
    icon: Wrench,
    questions: [
      {
        id: 'maint-type',
        title: 'Repair Costs by Service Type',
        description: 'Preventive vs breakdown repair expenditures.',
        rows: ['maintenance.maintenance_type'],
        values: [{ field: 'maintenance.cost', agg: 'sum' }],
      },
    ],
  },
];

const TIME_RANGES = [
  { id: 'today', label: 'Today' },
  { id: 'this_week', label: 'This Week' },
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'this_quarter', label: 'This Quarter' },
  { id: 'ytd', label: 'Year to Date (YTD)' },
  { id: 'custom', label: 'Custom Range' },
  { id: 'all', label: 'All Time' },
];

export default function QuickReportPage() {
  const navigate = useNavigate();
  const [selectedModule, setSelectedModule] = useState<string>('drivers');
  const [selectedQuestionId, setSelectedQuestionId] = useState<string>('driver-trips');
  const [selectedTimeRange, setSelectedTimeRange] = useState<string>('this_month');

  // Custom date range state
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [dateError, setDateError] = useState<string | null>(null);

  // Filters & Controls
  const [includeZeroTripDrivers, setIncludeZeroTripDrivers] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('completed_desc');
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Report execution state
  const [executedSpec, setExecutedSpec] = useState<ReportQuerySpec | null>(null);
  const [executedContext, setExecutedContext] = useState<{
    moduleLabel: string;
    questionTitle: string;
    timeRangeLabel: string;
    dateRangeText: string;
    timestamp: string;
  } | null>(null);

  const activeModuleObj = PRESETS.find((p) => p.moduleKey === selectedModule) || PRESETS[0];
  const activeQuestion = activeModuleObj.questions.find((q) => q.id === selectedQuestionId) || activeModuleObj.questions[0];

  const calculateDateRange = () => {
    const now = new Date();
    if (selectedTimeRange === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      return { start: start.toISOString(), end: end.toISOString() };
    }
    if (selectedTimeRange === 'this_week') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      const start = new Date(now.setDate(diff));
      start.setHours(0, 0, 0, 0);
      return { start: start.toISOString() };
    }
    if (selectedTimeRange === 'this_month') {
      return { start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString() };
    }
    if (selectedTimeRange === 'last_month') {
      return {
        start: new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString(),
        end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString(),
      };
    }
    if (selectedTimeRange === 'this_quarter') {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      return { start: new Date(now.getFullYear(), qMonth, 1).toISOString() };
    }
    if (selectedTimeRange === 'ytd') {
      return { start: new Date(now.getFullYear(), 0, 1).toISOString() };
    }
    if (selectedTimeRange === 'custom') {
      if (customStart && customEnd && customStart > customEnd) {
        setDateError('Start date must be less than or equal to End date');
        return null;
      }
      setDateError(null);
      return {
        start: customStart ? new Date(customStart).toISOString() : undefined,
        end: customEnd ? new Date(`${customEnd}T23:59:59`).toISOString() : undefined,
      };
    }
    return undefined;
  };

  const buildCurrentSpec = (): ReportQuerySpec | null => {
    const dateRange = calculateDateRange();
    if (selectedTimeRange === 'custom' && dateError) return null;

    return {
      rootModule: selectedModule,
      rows: activeQuestion.rows,
      values: activeQuestion.values,
      filters: activeQuestion.filters || [],
      dateRange: dateRange || undefined,
    };
  };

  const { data: resultData, isLoading, refetch, isError, error } = useQuery<ReportResult>({
    queryKey: ['quickReportQuery', executedSpec],
    queryFn: () => reportBuilderService.runQuery(executedSpec!),
    enabled: !!executedSpec,
  });

  const handleGenerate = () => {
    if (selectedTimeRange === 'custom' && customStart && customEnd && customStart > customEnd) {
      setDateError('Start date must be less than or equal to End date');
      return;
    }
    setDateError(null);
    const spec = buildCurrentSpec();
    if (!spec) return;

    const rangeObj = calculateDateRange();
    let dateRangeText = 'All Time';
    if (rangeObj?.start || rangeObj?.end) {
      const startStr = rangeObj.start ? new Date(rangeObj.start).toLocaleDateString() : 'Beginning';
      const endStr = rangeObj.end ? new Date(rangeObj.end).toLocaleDateString() : 'Present';
      dateRangeText = `${startStr} — ${endStr}`;
    }

    setExecutedSpec(spec);
    setExecutedContext({
      moduleLabel: activeModuleObj.moduleLabel,
      questionTitle: activeQuestion.title,
      timeRangeLabel: TIME_RANGES.find((r) => r.id === selectedTimeRange)?.label || 'This Month',
      dateRangeText,
      timestamp: new Date().toLocaleString(),
    });
    setCurrentPage(1);
  };

  const handleOpenInAdvanced = () => {
    const spec = executedSpec || buildCurrentSpec();
    navigate('/report-builder/advanced', { state: { initialSpec: spec } });
  };

  // Process & Filter Data Rows across all modules
  const processedRows = useMemo(() => {
    if (!resultData?.rows) return [];
    let rows = [...resultData.rows];

    // Filter 0-trip drivers if toggle is OFF for drivers module
    if (!includeZeroTripDrivers && selectedModule === 'drivers') {
      rows = rows.filter((r) => {
        const completed = r['drivers.completed_trips'] ?? r['completed_trips'] ?? 0;
        return Number(completed) > 0;
      });
    }

    // Filter by search query across all row values
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      rows = rows.filter((r) =>
        Object.values(r).some((v) => v != null && String(v).toLowerCase().includes(q))
      );
    }

    // Sort rows flexibly
    rows.sort((a, b) => {
      if (sortBy === 'completed_desc') {
        return Number(b['drivers.completed_trips'] || 0) - Number(a['drivers.completed_trips'] || 0);
      }
      if (sortBy === 'completed_asc') {
        return Number(a['drivers.completed_trips'] || 0) - Number(b['drivers.completed_trips'] || 0);
      }
      if (sortBy === 'name_asc') {
        const nameA = String(a['drivers.full_name'] || a['customers.name'] || a['vehicles.plate_number'] || a['trips.status'] || a['expenses.category'] || a['maintenance.maintenance_type'] || '').toLowerCase();
        const nameB = String(b['drivers.full_name'] || b['customers.name'] || b['vehicles.plate_number'] || b['trips.status'] || b['expenses.category'] || b['maintenance.maintenance_type'] || '').toLowerCase();
        return nameA.localeCompare(nameB);
      }
      if (sortBy === 'name_desc') {
        const nameA = String(a['drivers.full_name'] || a['customers.name'] || a['vehicles.plate_number'] || a['trips.status'] || a['expenses.category'] || a['maintenance.maintenance_type'] || '').toLowerCase();
        const nameB = String(b['drivers.full_name'] || b['customers.name'] || b['vehicles.plate_number'] || a['trips.status'] || a['expenses.category'] || a['maintenance.maintenance_type'] || '').toLowerCase();
        return nameB.localeCompare(nameA);
      }
      if (sortBy === 'val_desc' && executedSpec?.values[0]) {
        const valKey = executedSpec.values[0].field;
        return Number(b[valKey] || 0) - Number(a[valKey] || 0);
      }
      if (sortBy === 'val_asc' && executedSpec?.values[0]) {
        const valKey = executedSpec.values[0].field;
        return Number(a[valKey] || 0) - Number(b[valKey] || 0);
      }
      return 0;
    });

    return rows;
  }, [resultData, includeZeroTripDrivers, selectedModule, searchQuery, sortBy, executedSpec]);

  // Dynamic Table Columns per Module & Spec
  const tableColumns = useMemo(() => {
    if (!executedSpec) return [];

    if (selectedModule === 'drivers') {
      return [
        {
          header: 'DRIVER NAME',
          accessor: (row: any) => row['drivers.full_name'] || '—',
        },
        {
          header: 'DRIVER ID',
          accessor: (row: any) => row['drivers.ref_id'] || '—',
        },
        {
          header: 'COMPLETED TRIPS',
          accessor: (row: any) => row['drivers.completed_trips'] ?? 0,
        },
        {
          header: 'DISPATCHED TRIPS',
          accessor: (row: any) => row['drivers.dispatched_trips'] ?? 0,
        },
        {
          header: 'CANCELLED TRIPS',
          accessor: (row: any) => row['drivers.cancelled_trips'] ?? 0,
        },
        {
          header: 'TOTAL TRIPS',
          accessor: (row: any) => row['drivers.total_trips'] ?? 0,
        },
        {
          header: 'REVENUE',
          accessor: (row: any) => {
            const rev = row['drivers.revenue'];
            if (rev === null || rev === undefined || rev === 0) return '—';
            return `SAR ${Number(rev).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          },
        },
      ];
    }

    const allFieldKeys = [
      ...executedSpec.rows,
      ...executedSpec.values.map((v) => v.field),
    ];

    return allFieldKeys.map((key) => {
      const label = FIELD_LABELS[key] || key.split('.')[1] || key;
      const isMoney = MONEY_FIELDS.has(key);

      return {
        header: label.toUpperCase(),
        accessor: (row: any) => {
          const val = row[key] ?? row[label];
          if (val === null || val === undefined) return '—';
          if (isMoney) {
            const num = Number(val);
            if (isNaN(num) || num === 0) return '—';
            return `SAR ${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          }
          if (typeof val === 'number') return val.toLocaleString();
          if (typeof val === 'boolean') return val ? 'Yes' : 'No';
          return String(val);
        },
      };
    });
  }, [executedSpec, selectedModule]);

  // Dynamic KPI Metrics
  const driverKpis = useMemo(() => {
    if (!resultData || selectedModule !== 'drivers') {
      return {
        totalCompleted: 0,
        totalDrivers: 0,
        activeDrivers: 0,
        inactiveDrivers: 0,
        avgTripsPerActive: 'N/A',
      };
    }

    const totalCompleted = processedRows.reduce((sum, r) => sum + Number(r['drivers.completed_trips'] || 0), 0);
    const totalDrivers = processedRows.length;
    const activeDrivers = processedRows.filter((r) => Number(r['drivers.completed_trips'] || 0) > 0).length;
    const inactiveDrivers = totalDrivers - activeDrivers;
    const avgTripsPerActive = activeDrivers > 0 ? (totalCompleted / activeDrivers).toFixed(1) : 'N/A';

    return {
      totalCompleted,
      totalDrivers,
      activeDrivers,
      inactiveDrivers,
      avgTripsPerActive,
    };
  }, [resultData, processedRows, selectedModule]);

  // Generic Dynamic KPIs for Other Modules
  const genericKpis = useMemo(() => {
    if (!executedSpec || selectedModule === 'drivers' || !processedRows.length) return [];

    const cards = [
      {
        title: 'TOTAL GROUPS / RECORDS',
        value: processedRows.length.toLocaleString(),
        subtitle: 'Grouped records returned',
      },
    ];

    for (const v of executedSpec.values) {
      const label = FIELD_LABELS[v.field] || v.field;
      const isMoney = MONEY_FIELDS.has(v.field);
      const total = processedRows.reduce((sum, r) => sum + Number(r[v.field] || 0), 0);
      const avg = processedRows.length > 0 ? total / processedRows.length : 0;

      cards.push({
        title: `TOTAL ${label.toUpperCase()}`,
        value: isMoney
          ? `SAR ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : total.toLocaleString(),
        subtitle: `Aggregated sum (${v.agg})`,
      });

      if (processedRows.length > 1) {
        cards.push({
          title: `AVG ${label.toUpperCase()}`,
          value: isMoney
            ? `SAR ${avg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : avg.toFixed(1),
          subtitle: `Average per group`,
        });
      }
    }

    return cards.slice(0, 5);
  }, [executedSpec, processedRows, selectedModule]);

  // Pagination calculation
  const totalPages = Math.ceil(processedRows.length / pageSize) || 1;
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return processedRows.slice(start, start + pageSize);
  }, [processedRows, currentPage, pageSize]);

  // Clean export columns and values mapping
  const getExportData = () => {
    if (!executedSpec || !processedRows.length) return { headers: [], exportRows: [] };

    if (selectedModule === 'drivers') {
      const headers = ['Driver Name', 'Driver ID', 'Completed Trips', 'Dispatched Trips', 'Cancelled Trips', 'Total Trips', 'Revenue (SAR)'];
      const exportRows = processedRows.map((r) => [
        r['drivers.full_name'] || '—',
        r['drivers.ref_id'] || '—',
        r['drivers.completed_trips'] ?? 0,
        r['drivers.dispatched_trips'] ?? 0,
        r['drivers.cancelled_trips'] ?? 0,
        r['drivers.total_trips'] ?? 0,
        typeof r['drivers.revenue'] === 'number' ? r['drivers.revenue'] : 0,
      ]);
      return { headers, exportRows };
    }

    const allFieldKeys = [
      ...executedSpec.rows,
      ...executedSpec.values.map((v) => v.field),
    ];

    const headers = allFieldKeys.map((key) => FIELD_LABELS[key] || key.split('.')[1] || key);

    const exportRows = processedRows.map((row) =>
      allFieldKeys.map((key) => {
        const val = row[key] ?? row[FIELD_LABELS[key]];
        if (val === null || val === undefined) return '—';
        return val;
      })
    );

    return { headers, exportRows };
  };

  const handleExportCSV = () => {
    if (!processedRows.length) return;
    const { headers, exportRows } = getExportData();
    downloadCSVTable(headers, exportRows, `${selectedModule}_report.csv`);
  };

  const handleExportExcel = () => {
    if (!processedRows.length) return;
    const { headers, exportRows } = getExportData();
    const subtitle = `Report: ${executedContext?.questionTitle} · Time: ${executedContext?.timeRangeLabel} (${executedContext?.dateRangeText}) · Generated: ${executedContext?.timestamp}`;
    exportExcelTable(executedContext?.questionTitle || 'Quick Report', headers, exportRows, `${selectedModule}_report.xlsx`, { subtitle });
  };

  const handleExportPDF = () => {
    if (!processedRows.length) return;
    const { headers, exportRows } = getExportData();
    const subtitle = `Report: ${executedContext?.questionTitle} · Time: ${executedContext?.timeRangeLabel} (${executedContext?.dateRangeText}) · Generated: ${executedContext?.timestamp}`;
    exportPDFTable(executedContext?.questionTitle || 'Quick Report', headers, exportRows, `${selectedModule}_report.pdf`, { subtitle });
  };

  return (
    <DashboardLayout active="Report Builder" title="Quick Report Wizard">
      <div className="px-4 sm:px-6 lg:px-8 max-w-[1600px] mx-auto space-y-6 pb-16">
        {/* Top Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/report-builder')}
              className="text-slate-500 hover:text-slate-900"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  <Zap className="w-6 h-6 text-amber-500 shrink-0" />
                  Quick Report Wizard
                </h1>
                <Badge className="bg-[#E8450F]/10 text-[#E8450F] border-[#E8450F]/20 font-semibold">
                  Operations Module
                </Badge>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Generate standard logistics reports in 3 easy steps.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenInAdvanced}
              className="gap-1.5 text-xs font-semibold text-slate-700 shadow-2xs"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" /> Customize in Advanced Builder
            </Button>
          </div>
        </div>

        {/* 3-Step Report Configurator */}
        <Card id="report-configurator" className="border-slate-200 shadow-xs">
          <CardContent className="p-6 space-y-6">
            {/* Step 1: Primary Module */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Step 1: Choose Primary Module
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
                {PRESETS.map((p) => {
                  const Icon = p.icon;
                  const isSelected = selectedModule === p.moduleKey;
                  return (
                    <button
                      key={p.moduleKey}
                      type="button"
                      onClick={() => {
                        setSelectedModule(p.moduleKey);
                        setSelectedQuestionId(p.questions[0].id);
                      }}
                      className={`p-3 rounded-xl border text-center flex flex-col items-center gap-2 transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-orange-50/80 border-[#E8450F] text-[#E8450F] font-bold shadow-2xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 font-medium'
                      }`}
                    >
                      <Icon className={`w-5 h-5 ${isSelected ? 'text-[#E8450F]' : 'text-slate-400'}`} />
                      <span className="text-xs">{p.moduleLabel}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 2: Report Question */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Step 2: Choose Report Question
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {activeModuleObj.questions.map((q) => {
                  const isSelected = selectedQuestionId === q.id;
                  return (
                    <div
                      key={q.id}
                      onClick={() => setSelectedQuestionId(q.id)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-amber-50/60 border-amber-400 text-slate-900 shadow-2xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <h4 className="text-xs font-bold mb-0.5">{q.title}</h4>
                      <p className="text-[11px] text-slate-500">{q.description}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Step 3: Time Period & Controls */}
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Step 3: Select Time Period
                </label>
                <div className="flex flex-wrap gap-2">
                  {TIME_RANGES.map((r) => {
                    const isSelected = selectedTimeRange === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          setSelectedTimeRange(r.id);
                          setDateError(null);
                        }}
                        className={`text-xs px-3 py-1.5 rounded-xl border font-medium transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-charcoal text-white border-slate-900 font-semibold shadow-2xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {r.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Date Range Picker */}
              {selectedTimeRange === 'custom' && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-600">Start Date:</span>
                    <input
                      type="date"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-[#E8450F]"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-600">End Date:</span>
                    <input
                      type="date"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-[#E8450F]"
                    />
                  </div>
                  {dateError && (
                    <span className="text-red-600 font-semibold text-xs animate-pulse">
                      {dateError}
                    </span>
                  )}
                </div>
              )}

              {/* Action bar & Zero trip toggle */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={includeZeroTripDrivers}
                      onChange={(e) => setIncludeZeroTripDrivers(e.target.checked)}
                      className="w-4 h-4 rounded text-[#E8450F] focus:ring-[#E8450F] border-slate-300 cursor-pointer"
                    />
                    Include 0 Trip Drivers
                  </label>
                </div>

                <Button
                  onClick={handleGenerate}
                  disabled={isLoading}
                  className="py-2.5 px-6 bg-[#E8450F] hover:bg-[#c43809] text-white font-bold text-xs shadow-xs gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isLoading ? (
                    <RotateCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Zap className="w-4 h-4" />
                  )}
                  {isLoading ? 'Generating Report...' : 'Generate Quick Report'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results Section */}
        {executedSpec && (
          <div className="space-y-6">
            {/* Report Summary Context Box */}
            {executedContext && (
              <Card className="border-amber-200 bg-amber-50/40 shadow-xs">
                <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-[#E8450F]" />
                      <h3 className="text-sm font-bold text-slate-900">
                        {executedContext.questionTitle}
                      </h3>
                      <Badge className="bg-amber-100 text-amber-800 border-amber-300 font-semibold text-[10px]">
                        {executedContext.moduleLabel}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                      <span>Status: <strong className="text-slate-800">Completed Trips</strong></span>
                      <span>•</span>
                      <span>Time Period: <strong className="text-slate-800">{executedContext.timeRangeLabel}</strong></span>
                      <span>•</span>
                      <span>Date Range: <strong className="text-slate-800">{executedContext.dateRangeText}</strong></span>
                      <span>•</span>
                      <span>Generated: <span className="text-slate-500">{executedContext.timestamp}</span></span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end md:self-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const el = document.getElementById('report-configurator');
                        if (el) el.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="gap-1.5 text-xs font-semibold bg-white border-amber-300 hover:bg-amber-100/60"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-amber-700" /> Edit Report
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Results Actions Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-[#E8450F]" />
                Report Execution Ledger
              </h2>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportCSV}
                  disabled={!processedRows.length}
                  className="h-8 text-xs font-semibold cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 mr-1" /> CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportExcel}
                  disabled={!processedRows.length}
                  className="h-8 text-xs font-semibold text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100 cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 mr-1" /> Excel
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportPDF}
                  disabled={!processedRows.length}
                  className="h-8 text-xs font-semibold text-red-700 bg-red-50 border-red-200 hover:bg-red-100 cursor-pointer"
                >
                  PDF
                </Button>
              </div>
            </div>

            {/* Loading / Error States */}
            {isLoading ? (
              <div className="p-12 text-center text-xs text-slate-500 bg-white rounded-2xl border border-slate-200 space-y-3">
                <RotateCw className="w-6 h-6 animate-spin mx-auto text-[#E8450F]" />
                <p className="font-semibold text-slate-700">Executing database report query...</p>
              </div>
            ) : isError ? (
              <div className="p-6 text-xs bg-red-50 text-red-600 border border-red-200 rounded-2xl">
                <p className="font-bold text-sm mb-1">Failed to generate report</p>
                <p>{(error as any)?.response?.data?.error?.message || (error as any)?.message || 'Database error occurred.'}</p>
              </div>
            ) : resultData ? (
              <div className="space-y-6">
                {/* Dynamic Instrument-Panel KPI Cards */}
                {selectedModule === 'drivers' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    <KpiCard
                      title="TOTAL COMPLETED TRIPS"
                      value={driverKpis.totalCompleted.toLocaleString()}
                      subtitle="Completed in period"
                      variant="amber"
                    />
                    <KpiCard
                      title="TOTAL DRIVERS"
                      value={driverKpis.totalDrivers.toLocaleString()}
                      subtitle="Drivers in report"
                    />
                    <KpiCard
                      title="ACTIVE DRIVERS"
                      value={driverKpis.activeDrivers.toLocaleString()}
                      subtitle="Drivers with ≥1 trip"
                    />
                    <KpiCard
                      title="INACTIVE DRIVERS"
                      value={driverKpis.inactiveDrivers.toLocaleString()}
                      subtitle="Drivers with 0 trips"
                    />
                    <KpiCard
                      title="AVG TRIPS / ACTIVE DRIVER"
                      value={driverKpis.avgTripsPerActive}
                      subtitle="Total Completed / Active"
                      variant="amber"
                    />
                  </div>
                ) : genericKpis.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {genericKpis.map((card, idx) => (
                      <KpiCard
                        key={idx}
                        title={card.title}
                        value={card.value}
                        subtitle={card.subtitle}
                        variant={idx === 1 ? 'amber' : undefined}
                      />
                    ))}
                  </div>
                ) : null}

                {/* Horizontal Bar Chart (Trips per Driver) */}
                {processedRows.length > 0 && selectedModule === 'drivers' && (
                  <Card className="border-slate-200 shadow-xs">
                    <CardHeader className="pb-2 pt-4 px-5">
                      <CardTitle className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-[#E8450F]" />
                        Top Drivers by Completed Trips
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-5 pt-2">
                      <div className="space-y-2.5">
                        {processedRows.slice(0, 8).map((row, idx) => {
                          const name = row['drivers.full_name'] || 'Unknown Driver';
                          const count = Number(row['drivers.completed_trips'] || 0);
                          const maxCount = Math.max(...processedRows.map((r) => Number(r['drivers.completed_trips'] || 0)), 1);
                          const pct = Math.min(100, Math.max(8, (count / maxCount) * 100));

                          return (
                            <div key={idx} className="flex items-center gap-3 text-xs">
                              <span className="w-36 font-semibold text-slate-800 truncate" title={name}>
                                {name}
                              </span>
                              <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden relative">
                                <div
                                  style={{ width: `${pct}%` }}
                                  className="bg-[#E8450F] h-full rounded-full transition-all duration-300 flex items-center justify-end pr-2"
                                >
                                  {pct > 15 && (
                                    <span className="text-[10px] font-bold text-white leading-none">
                                      {count}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {pct <= 15 && (
                                <span className="w-8 font-bold text-slate-700 text-right">
                                  {count}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Controls & Ledger Bar */}
                <Card className="border-slate-200 shadow-xs overflow-hidden">
                  <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                    {/* Search & Sort Controls */}
                    <div className="flex flex-col sm:flex-row items-center gap-2.5 flex-1">
                      <div className="relative w-full sm:w-64">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setCurrentPage(1);
                          }}
                          placeholder="Search report records..."
                          className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-[#E8450F]"
                        />
                        {searchQuery && (
                          <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <Sliders className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <select
                          value={sortBy}
                          onChange={(e) => setSortBy(e.target.value)}
                          className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 focus:ring-1 focus:ring-[#E8450F] cursor-pointer"
                        >
                          {selectedModule === 'drivers' ? (
                            <>
                              <option value="completed_desc">Completed Trips — High to Low</option>
                              <option value="completed_asc">Completed Trips — Low to High</option>
                              <option value="name_asc">Driver Name — A to Z</option>
                              <option value="name_desc">Driver Name — Z to A</option>
                            </>
                          ) : (
                            <>
                              <option value="val_desc">Value — High to Low</option>
                              <option value="val_asc">Value — Low to High</option>
                              <option value="name_asc">Name / Key — A to Z</option>
                              <option value="name_desc">Name / Key — Z to A</option>
                            </>
                          )}
                        </select>
                      </div>
                    </div>

                    {/* Active Filter Chips */}
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      {selectedModule === 'drivers' && !includeZeroTripDrivers && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-semibold">
                          Trips &gt; 0
                          <button onClick={() => setIncludeZeroTripDrivers(true)} className="hover:text-amber-950">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      )}
                      {searchQuery && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-200 text-slate-800 text-[11px] font-semibold">
                          "{searchQuery}"
                          <button onClick={() => setSearchQuery('')} className="hover:text-slate-950">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Ledger Data Table */}
                  <div className="p-4">
                    {processedRows.length === 0 ? (
                      <div className="p-12 text-center space-y-3">
                        <FileText className="w-10 h-10 mx-auto text-slate-300" />
                        <h4 className="text-sm font-bold text-slate-800">No report records found</h4>
                        <p className="text-xs text-slate-500 max-w-sm mx-auto">
                          Try changing the date range or adjusting search filters.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const el = document.getElementById('report-configurator');
                            if (el) el.scrollIntoView({ behavior: 'smooth' });
                          }}
                          className="mt-2 text-xs font-semibold text-[#E8450F] border-[#E8450F]/30 hover:bg-orange-50"
                        >
                          Edit Report
                        </Button>
                      </div>
                    ) : (
                      <DataTable
                        columns={tableColumns}
                        data={paginatedRows}
                        emptyTitle="No data matched"
                        emptyMessage="Try adjusting the time period or question filters."
                      />
                    )}
                  </div>

                  {/* Clean Pagination Footer */}
                  {processedRows.length > 0 && (
                    <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
                      <div className="flex items-center gap-3">
                        <span>
                          Showing <strong>{Math.min((currentPage - 1) * pageSize + 1, processedRows.length)}</strong>–
                          <strong>{Math.min(currentPage * pageSize, processedRows.length)}</strong> of{' '}
                          <strong>{processedRows.length}</strong> drivers
                        </span>

                        <div className="flex items-center gap-1.5 ml-2">
                          <span className="text-slate-500 font-medium">Rows per page:</span>
                          <select
                            value={pageSize}
                            onChange={(e) => {
                              setPageSize(Number(e.target.value));
                              setCurrentPage(1);
                            }}
                            className="px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs font-semibold cursor-pointer"
                          >
                            <option value={10}>10</option>
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentPage === 1}
                          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                          className="h-8 px-2 text-xs"
                        >
                          <ChevronLeft className="w-4 h-4 mr-1" /> Previous
                        </Button>
                        <span className="px-3 font-semibold text-slate-700">
                          Page {currentPage} of {totalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentPage >= totalPages}
                          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                          className="h-8 px-2 text-xs"
                        >
                          Next <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

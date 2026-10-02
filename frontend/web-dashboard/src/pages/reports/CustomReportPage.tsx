import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Download,
  FileSpreadsheet,
  FileText,
  Plus,
  X,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Check,
  BarChart2,
  PieChart as PieIcon,
  TrendingUp,
  LayoutGrid,
  BarChart3,
  Filter,
  CheckSquare,
  Square,
  RefreshCw,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { reportsService } from '@/services/reportsService';
import { driverService } from '@/services/driverService';
import { vehicleService } from '@/services/vehicleService';
import { downloadCSVTable, exportExcelTable, exportPDFTable } from '@/utils/exportUtils';

// ─── TYPES & MODULE DATA ───────────────────────────────────────────────────

export interface AvailableModule {
  id: string;
  name: string;
  category: string;
}

const ALL_MODULES: AvailableModule[] = [
  { id: 'trips', name: 'Trips', category: 'Operations' },
  { id: 'drivers', name: 'Drivers', category: 'Operations' },
  { id: 'vehicles', name: 'Vehicles', category: 'Fleet' },
  { id: 'customers', name: 'Customers', category: 'Commercial' },
  { id: 'locations', name: 'Locations', category: 'Operations' },
  { id: 'invoices', name: 'Invoices', category: 'Finance' },
  { id: 'maintenance', name: 'Maintenance', category: 'Fleet' },
  { id: 'third_party', name: 'Third-Party', category: 'Operations' },
];

export interface FieldDefinition {
  id: string;
  name: string;
  moduleId: string;
  moduleName: string;
  defaultChecked?: boolean;
}

const FIELD_DEFINITIONS: FieldDefinition[] = [
  // Trips Module
  { id: 'date', name: 'Date', moduleId: 'trips', moduleName: 'Trips', defaultChecked: true },
  { id: 'driver_name', name: 'Driver Name', moduleId: 'trips', moduleName: 'Trips', defaultChecked: true },
  { id: 'vehicle_number', name: 'Vehicle Number', moduleId: 'trips', moduleName: 'Trips', defaultChecked: true },
  { id: 'trip_status', name: 'Trip Status', moduleId: 'trips', moduleName: 'Trips', defaultChecked: true },
  { id: 'trip_id', name: 'Trip ID', moduleId: 'trips', moduleName: 'Trips', defaultChecked: false },
  { id: 'location', name: 'Location', moduleId: 'trips', moduleName: 'Trips', defaultChecked: false },
  { id: 'customer_name', name: 'Customer Name', moduleId: 'trips', moduleName: 'Trips', defaultChecked: false },
  { id: 'receiver', name: 'Receiver', moduleId: 'trips', moduleName: 'Trips', defaultChecked: false },
  { id: 'carrier_name', name: 'Carrier Name', moduleId: 'trips', moduleName: 'Trips', defaultChecked: false },
  { id: 'vehicle_type', name: 'Vehicle Type', moduleId: 'trips', moduleName: 'Trips', defaultChecked: false },

  // Drivers Module
  { id: 'driver_license', name: 'License Number', moduleId: 'drivers', moduleName: 'Drivers', defaultChecked: false },
  { id: 'driver_phone', name: 'Driver Phone', moduleId: 'drivers', moduleName: 'Drivers', defaultChecked: false },

  // Vehicles Module
  { id: 'plate_number', name: 'Plate Number', moduleId: 'vehicles', moduleName: 'Vehicles', defaultChecked: false },
  { id: 'vehicle_model', name: 'Vehicle Model', moduleId: 'vehicles', moduleName: 'Vehicles', defaultChecked: false },
];

export type CalculationType = 'Count' | 'Total' | 'Average' | 'Minimum' | 'Maximum';

export interface CalculationValueItem {
  id: string;
  name: string;
  defaultCalc: CalculationType;
  defaultChecked?: boolean;
  allowedCalcs: CalculationType[];
}

const CALCULATION_ITEMS: CalculationValueItem[] = [
  { id: 'trip_count', name: 'Trip Count', defaultCalc: 'Count', defaultChecked: true, allowedCalcs: ['Count', 'Total', 'Average'] },
  { id: 'revenue', name: 'Revenue', defaultCalc: 'Total', defaultChecked: true, allowedCalcs: ['Total', 'Average', 'Minimum', 'Maximum'] },
  { id: 'trip_charges', name: 'Driver Charge', defaultCalc: 'Total', defaultChecked: true, allowedCalcs: ['Total', 'Average', 'Minimum', 'Maximum'] },
  { id: 'third_party_cost', name: 'Third-Party Cost', defaultCalc: 'Total', defaultChecked: true, allowedCalcs: ['Total', 'Average', 'Minimum', 'Maximum'] },
  { id: 'distance', name: 'Distance', defaultCalc: 'Total', defaultChecked: false, allowedCalcs: ['Total', 'Average', 'Minimum', 'Maximum'] },
  { id: 'waiting_charges', name: 'Waiting/Labor Charges', defaultCalc: 'Total', defaultChecked: false, allowedCalcs: ['Total', 'Average', 'Minimum', 'Maximum'] },
  { id: 'additional_stops', name: 'Additional Stop Charges', defaultCalc: 'Total', defaultChecked: false, allowedCalcs: ['Total', 'Average', 'Minimum', 'Maximum'] },
  { id: 'balance_amount', name: 'Balance', defaultCalc: 'Total', defaultChecked: false, allowedCalcs: ['Total', 'Average', 'Minimum', 'Maximum'] },
];

export type DateFilterOption = 'this_month' | 'today' | 'this_week' | 'last_month' | 'custom';
export type ViewModeOption = 'Grid' | 'Bar' | 'Column' | 'Line' | 'Pie';

/** yyyy-MM-dd in the browser's local calendar. */
function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The start/end dates a date filter covers, sent to GET /reports/custom. */
function rangeFor(filter: DateFilterOption, customStart: string, customEnd: string): { startDate?: string; endDate?: string } {
  const now = new Date();
  switch (filter) {
    case 'today':
      return { startDate: ymd(now), endDate: ymd(now) };
    case 'this_week': {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      return { startDate: ymd(start), endDate: ymd(now) };
    }
    case 'last_month':
      return {
        startDate: ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        endDate: ymd(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    case 'custom':
      return { startDate: customStart || undefined, endDate: customEnd || undefined };
    case 'this_month':
    default:
      return { startDate: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), endDate: ymd(now) };
  }
}

export default function CustomReportPage() {
  // 1. SELECT DATA STATE
  const [selectedModuleIds, setSelectedModuleIds] = useState<string[]>(['trips', 'drivers', 'vehicles']);
  const [isAddModuleOpen, setIsAddModuleOpen] = useState(false);

  // 2. CHOOSE FIELDS STATE
  const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>([
    'date', 'driver_name', 'vehicle_number', 'trip_status'
  ]);
  const [fieldSearchQuery, setFieldSearchQuery] = useState('');

  // 3. CHOOSE VALUES STATE
  const [selectedCalcConfig, setSelectedCalcConfig] = useState<Record<string, { enabled: boolean; calc: CalculationType }>>({
    trip_count: { enabled: true, calc: 'Count' },
    revenue: { enabled: true, calc: 'Total' },
    trip_charges: { enabled: true, calc: 'Total' },
    third_party_cost: { enabled: true, calc: 'Total' },
    distance: { enabled: false, calc: 'Total' },
    waiting_charges: { enabled: false, calc: 'Total' },
    additional_stops: { enabled: false, calc: 'Total' },
    balance_amount: { enabled: false, calc: 'Total' },
  });

  // 4. FILTERS STATE
  const [dateFilter, setDateFilter] = useState<DateFilterOption>('this_month');
  const [statusFilter, setStatusFilter] = useState<string>('Completed');
  const [driverFilter, setDriverFilter] = useState<string>('All');
  const [vehicleFilter, setVehicleFilter] = useState<string>('All');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  // RIGHT SIDE VIEW & PAGINATION
  const [viewMode, setViewMode] = useState<ViewModeOption>('Grid');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 5;

  // ── Query real backend data when needed ──
  const { data: realTripsData, isLoading: isQueryLoading, refetch: refetchTrips } = useQuery({
    queryKey: ['custom-report-data', dateFilter, customStartDate, customEndDate],
    queryFn: async () => {
      try {
        const res = await reportsService.getCustomReport(rangeFor(dateFilter, customStartDate, customEndDate));
        return res;
      } catch (err) {
        return null;
      }
    },
  });

  // Fetch Drivers and Vehicles for Filter Dropdowns
  const { data: driversResponse } = useQuery({
    queryKey: ['drivers-list-filter'],
    queryFn: () => driverService.getAll({ per_page: 100, mode: 'lookup' }),
  });

  const { data: vehiclesResponse } = useQuery({
    queryKey: ['vehicles-list-filter'],
    queryFn: () => vehicleService.getAll({ per_page: 100, mode: 'lookup' }),
  });

  const availableDrivers = useMemo(() => {
    const list = driversResponse?.data || [];
    return list.map((d: any) => `${d.first_name || ''} ${d.last_name || ''}`.trim() || d.name || 'Driver');
  }, [driversResponse]);

  const availableVehicles = useMemo(() => {
    const list = vehiclesResponse?.data || [];
    return list.map((v: any) => v.plate_number || v.plateNumber || 'Vehicle');
  }, [vehiclesResponse]);

  // Handle Module Toggle
  const toggleModule = (id: string) => {
    if (selectedModuleIds.includes(id)) {
      if (selectedModuleIds.length <= 1) return; // Maintain at least 1 module
      setSelectedModuleIds(prev => prev.filter(m => m !== id));
    } else {
      setSelectedModuleIds(prev => [...prev, id]);
    }
  };

  // Available Fields filtered by Selected Modules
  const visibleFields = useMemo(() => {
    return FIELD_DEFINITIONS.filter(f => selectedModuleIds.includes(f.moduleId))
      .filter(f => f.name.toLowerCase().includes(fieldSearchQuery.toLowerCase()));
  }, [selectedModuleIds, fieldSearchQuery]);

  // Count of selected fields
  const selectedFieldsCount = selectedFieldIds.length;

  // Toggle Field Checkbox
  const toggleField = (fieldId: string) => {
    if (selectedFieldIds.includes(fieldId)) {
      setSelectedFieldIds(prev => prev.filter(id => id !== fieldId));
    } else {
      setSelectedFieldIds(prev => [...prev, fieldId]);
    }
  };

  // Count of selected calculation values
  const selectedValuesCount = useMemo(() => {
    return Object.values(selectedCalcConfig).filter(v => v.enabled).length;
  }, [selectedCalcConfig]);

  // Toggle Value Checkbox
  const toggleValueEnabled = (calcId: string) => {
    setSelectedCalcConfig(prev => ({
      ...prev,
      [calcId]: {
        ...prev[calcId],
        enabled: !prev[calcId]?.enabled,
      },
    }));
  };

  // Change Value Calculation Type
  const changeValueCalc = (calcId: string, calc: CalculationType) => {
    setSelectedCalcConfig(prev => ({
      ...prev,
      [calcId]: {
        ...prev[calcId],
        calc,
      },
    }));
  };

  // Rows straight from the backend — a missing value shows as a dash or 0, never an invented one.
  const combinedRows = useMemo(() => {
    return (realTripsData?.trips || []).map(t => ({
      date: t.date ? t.date.slice(0, 10) : '—',
      driver: t.driver || '—',
      vehicle: t.vehicle || '—',
      status: t.status || '—',
      tripCount: 1,
      revenue: Number(t.total_amount || t.billing_amount || 0),
      tripCharges: Number(t.trip_charges || 0),
      thirdPartyCost: Number(t.balance_amount || 0),
      tripId: t.ref_id || t.id,
      customerName: t.customer || '—',
      receiver: t.receiver || '—',
      carrierName: t.carrier_name || '—',
      vehicleType: t.vehicle_type || '—',
      extraCharges: Number(t.total_charges || 0),
      balanceAmount: Number(t.balance_amount || 0),
    }));
  }, [realTripsData]);

  // Filtered Rows based on Filter selection
  const filteredDataRows = useMemo(() => {
    return combinedRows.filter(row => {
      if (statusFilter !== 'All' && row.status !== statusFilter) return false;
      if (driverFilter !== 'All' && row.driver !== driverFilter) return false;
      if (vehicleFilter !== 'All' && row.vehicle !== vehicleFilter) return false;
      return true;
    });
  }, [combinedRows, statusFilter, driverFilter, vehicleFilter]);

  // Dynamic KPI Summary calculations based on selected values
  const dynamicKpiSummary = useMemo(() => {
    const totalTripsSum = filteredDataRows.reduce((acc, r) => acc + (r.tripCount || 1), 0);
    const totalRevenueSum = filteredDataRows.reduce((acc, r) => acc + (r.revenue || 0), 0);
    const totalTripChargesSum = filteredDataRows.reduce((acc, r) => acc + (r.tripCharges || 0), 0);
    const totalThirdPartyCostSum = filteredDataRows.reduce((acc, r) => acc + (r.thirdPartyCost || 0), 0);
    const avgRevenuePerTrip = totalTripsSum > 0 ? Math.round(totalRevenueSum / totalTripsSum) : 0;

    return {
      totalTrips: totalTripsSum,
      totalRevenue: totalRevenueSum,
      totalTripCharges: totalTripChargesSum,
      totalThirdPartyCost: totalThirdPartyCostSum,
      avgRevenuePerTrip,
    };
  }, [filteredDataRows]);

  // Pagination calculation
  const totalEntries = filteredDataRows.length;
  const totalPages = Math.max(1, Math.ceil(totalEntries / itemsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = totalEntries === 0 ? 0 : (safePage - 1) * itemsPerPage + 1;
  const endIndex = Math.min(safePage * itemsPerPage, totalEntries);
  const paginatedRows = filteredDataRows.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage);
  // Page buttons: first, last, and the pages around the current one.
  const pageButtons: (number | string)[] = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - safePage) <= 1) pageButtons.push(p);
    else if (pageButtons[pageButtons.length - 1] !== '...') pageButtons.push('...');
  }

  // Dynamic Chart Dataset grouped by Driver
  const chartData = useMemo(() => {
    const map: Record<string, { name: string; revenue: number; trips: number; charges: number }> = {};
    filteredDataRows.forEach(r => {
      if (!map[r.driver]) {
        map[r.driver] = { name: r.driver, revenue: 0, trips: 0, charges: 0 };
      }
      map[r.driver].revenue += r.revenue;
      map[r.driver].trips += r.tripCount;
      map[r.driver].charges += r.tripCharges;
    });
    return Object.values(map);
  }, [filteredDataRows]);

  // Handle Export CSV / Excel / PDF
  const handleExport = (format: 'csv' | 'excel' | 'pdf') => {
    const headers = [
      'Date', 'Driver Name', 'Vehicle Number', 'Trip Status', 'Trip Count', 'Revenue', 'Driver Charges', 'Third-Party Cost'
    ];
    const rows = filteredDataRows.map(r => [
      r.date,
      r.driver,
      r.vehicle,
      r.status,
      r.tripCount,
      `SAR ${r.revenue.toLocaleString()}`,
      `SAR ${r.tripCharges.toLocaleString()}`,
      `SAR ${r.thirdPartyCost.toLocaleString()}`,
    ]);

    const title = 'MERCON Logistics - Custom Performance Report';
    if (format === 'csv') {
      downloadCSVTable(headers, rows, 'mercon_custom_report.csv');
    } else if (format === 'excel') {
      exportExcelTable(title, headers, rows, 'mercon_custom_report.xlsx');
    } else if (format === 'pdf') {
      exportPDFTable(title, headers, rows, 'mercon_custom_report.pdf');
    }
  };

  // Generate Report Action
  const handleGenerateReport = () => {
    refetchTrips();
  };

  return (
    <DashboardLayout active="Reports" title="Custom Report">
      <div className="min-h-screen bg-slate-50/60 dark:bg-slate-900/50 pb-12 font-sans">
        
        {/* ==================================================== */}
        {/* MAIN LAYOUT (TWO-COLUMN)                            */}
        {/* ==================================================== */}
        <main className="max-w-[1600px] mx-auto px-4 sm:px-8 pt-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* ==================================================== */}
            {/* LEFT SIDE — CONFIGURATION PANEL (NARROWER)          */}
            {/* ==================================================== */}
            <div className="lg:col-span-4 xl:col-span-4 flex flex-col gap-5">
              
              {/* ------------------------------------------------ */}
              {/* 1. SELECT DATA                                   */}
              {/* ------------------------------------------------ */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs transition-all">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-orange-100 dark:bg-orange-950 text-orange-600 dark:text-orange-400 text-[11px] font-extrabold flex items-center justify-center">1</span>
                    Select Data
                  </h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                  Choose the data you want to analyze
                </p>

                {/* Selected Module Chips */}
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  {selectedModuleIds.map(modId => {
                    const mod = ALL_MODULES.find(m => m.id === modId);
                    if (!mod) return null;
                    return (
                      <span
                        key={mod.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold border border-slate-200/80 dark:border-slate-700"
                      >
                        {mod.name}
                        <button
                          onClick={() => toggleModule(mod.id)}
                          className="hover:text-red-500 transition-colors p-0.5"
                          title="Remove module"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    );
                  })}
                </div>

                {/* Add More Button & Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setIsAddModuleOpen(prev => !prev)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 hover:border-orange-500 text-slate-600 dark:text-slate-300 text-xs font-semibold transition-all hover:bg-orange-50/50 dark:hover:bg-orange-950/20"
                  >
                    <Plus className="w-3.5 h-3.5 text-orange-500" />
                    <span>Add More</span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-1" />
                  </button>

                  {/* Simple Dropdown for Modules */}
                  {isAddModuleOpen && (
                    <div className="absolute left-0 top-full mt-2 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg z-30 p-2 animate-in fade-in zoom-in-95">
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1">
                        Available Related Modules
                      </div>
                      <div className="space-y-1 mt-1 max-h-48 overflow-y-auto">
                        {ALL_MODULES.map(m => {
                          const isSelected = selectedModuleIds.includes(m.id);
                          return (
                            <button
                              key={m.id}
                              onClick={() => {
                                toggleModule(m.id);
                                setIsAddModuleOpen(false);
                              }}
                              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                isSelected
                                  ? 'bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400 font-bold'
                                  : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              <span>{m.name}</span>
                              {isSelected && <Check className="w-3.5 h-3.5 text-orange-500" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ------------------------------------------------ */}
              {/* 2. CHOOSE FIELDS (COLUMNS)                        */}
              {/* ------------------------------------------------ */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs transition-all">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-orange-100 dark:bg-orange-950 text-orange-600 dark:text-orange-400 text-[11px] font-extrabold flex items-center justify-center">2</span>
                    Choose Fields (Columns)
                  </h3>
                  <span className="text-xs font-bold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 px-2.5 py-0.5 rounded-full border border-orange-200/60 dark:border-orange-800/40">
                    {selectedFieldsCount} fields selected
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                  Choose the information you want to see in the report
                </p>

                {/* Optional Search Field */}
                <div className="relative mb-3">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={fieldSearchQuery}
                    onChange={e => setFieldSearchQuery(e.target.value)}
                    placeholder="Search fields..."
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-orange-500"
                  />
                </div>

                {/* Checkbox List */}
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {visibleFields.map(field => {
                    const isChecked = selectedFieldIds.includes(field.id);
                    return (
                      <label
                        key={field.id}
                        onClick={() => toggleField(field.id)}
                        className="flex items-center gap-2.5 py-1 px-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer select-none transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}} // Controlled by label onClick
                          className="rounded border-slate-300 dark:border-slate-600 text-orange-500 focus:ring-orange-500 w-4 h-4 cursor-pointer accent-orange-500"
                        />
                        <span className={`text-xs ${isChecked ? 'font-bold text-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400'}`}>
                          {field.name}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* ------------------------------------------------ */}
              {/* 3. CHOOSE VALUES (CALCULATIONS)                  */}
              {/* ------------------------------------------------ */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs transition-all">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-orange-100 dark:bg-orange-950 text-orange-600 dark:text-orange-400 text-[11px] font-extrabold flex items-center justify-center">3</span>
                    Choose Values (Calculations)
                  </h3>
                  <span className="text-xs font-bold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 px-2.5 py-0.5 rounded-full border border-orange-200/60 dark:border-orange-800/40">
                    {selectedValuesCount} values selected
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                  Choose what values you want to calculate
                </p>

                {/* Calculation Rows */}
                <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                  {CALCULATION_ITEMS.map(item => {
                    const config = selectedCalcConfig[item.id] || { enabled: false, calc: item.defaultCalc };
                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-3 py-1.5 px-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                      >
                        <label className="flex items-center gap-2.5 cursor-pointer select-none flex-1 min-w-0">
                          <input
                            type="checkbox"
                            checked={config.enabled}
                            onChange={() => toggleValueEnabled(item.id)}
                            className="rounded border-slate-300 dark:border-slate-600 text-orange-500 focus:ring-orange-500 w-4 h-4 cursor-pointer accent-orange-500"
                          />
                          <span className={`text-xs truncate ${config.enabled ? 'font-bold text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}>
                            {item.name}
                          </span>
                        </label>

                        {/* Calculation Dropdown */}
                        <select
                          value={config.calc}
                          onChange={e => changeValueCalc(item.id, e.target.value as CalculationType)}
                          disabled={!config.enabled}
                          className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-md px-2 py-1 text-[11px] font-semibold outline-none focus:border-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {item.allowedCalcs.map(c => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ------------------------------------------------ */}
              {/* 4. FILTERS (OPTIONAL)                            */}
              {/* ------------------------------------------------ */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs transition-all">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-orange-100 dark:bg-orange-950 text-orange-600 dark:text-orange-400 text-[11px] font-extrabold flex items-center justify-center">4</span>
                    Filters (Optional)
                  </h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3.5">
                  Filter the data to get the exact report you need
                </p>

                <div className="space-y-3">
                  {/* Date Filter */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Date
                    </label>
                    <select
                      value={dateFilter}
                      onChange={e => setDateFilter(e.target.value as DateFilterOption)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-orange-500"
                    >
                      <option value="this_month">This Month</option>
                      <option value="today">Today</option>
                      <option value="this_week">This Week</option>
                      <option value="last_month">Last Month</option>
                      <option value="custom">Custom Range</option>
                    </select>
                  </div>

                  {dateFilter === 'custom' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 mb-1">Start Date</label>
                        <input
                          type="date"
                          value={customStartDate}
                          onChange={e => setCustomStartDate(e.target.value)}
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 mb-1">End Date</label>
                        <input
                          type="date"
                          value={customEndDate}
                          onChange={e => setCustomEndDate(e.target.value)}
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-900 dark:text-slate-100"
                        />
                      </div>
                    </div>
                  )}

                  {/* Trip Status Filter */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Trip Status
                    </label>
                    <select
                      value={statusFilter}
                      onChange={e => setStatusFilter(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-orange-500"
                    >
                      <option value="All">All</option>
                      <option value="Completed">Completed</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Pending">Pending</option>
                    </select>
                  </div>

                  {/* Driver Filter */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Driver
                    </label>
                    <select
                      value={driverFilter}
                      onChange={e => setDriverFilter(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-orange-500"
                    >
                      <option value="All">All</option>
                      {availableDrivers.map((d, i) => (
                        <option key={i} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>

                  {/* Vehicle Filter */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Vehicle
                    </label>
                    <select
                      value={vehicleFilter}
                      onChange={e => setVehicleFilter(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-orange-500"
                    >
                      <option value="All">All</option>
                      {availableVehicles.map((v, i) => (
                        <option key={i} value={v}>{v}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* ------------------------------------------------ */}
              {/* GENERATE BUTTON                                  */}
              {/* ------------------------------------------------ */}
              <button
                onClick={handleGenerateReport}
                disabled={isQueryLoading}
                className="w-full bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-bold text-sm py-3.5 px-6 rounded-2xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {isQueryLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Generating Report...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Generate Report</span>
                  </>
                )}
              </button>

            </div>

            {/* ==================================================== */}
            {/* RIGHT SIDE — REPORT RESULT (WIDER)                  */}
            {/* ==================================================== */}
            <div className="lg:col-span-8 xl:col-span-8 flex flex-col gap-6">
              
              {/* Report Header Card */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-6 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                      Trip Performance by Driver
                    </h2>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {dateFilter === 'this_month' ? 'This Month' : dateFilter === 'today' ? 'Today' : dateFilter === 'this_week' ? 'This Week' : 'Filtered Period'}
                    </span>
                  </div>

                  {/* Top-Right Export Buttons */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleExport('excel')}
                      className="px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 transition-all flex items-center gap-1.5"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Excel</span>
                    </button>
                    <button
                      onClick={() => handleExport('pdf')}
                      className="px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 transition-all flex items-center gap-1.5"
                    >
                      <FileText className="w-3.5 h-3.5 text-red-500" />
                      <span>PDF</span>
                    </button>
                  </div>
                </div>

                {/* ==================================================== */}
                {/* REPORT VIEW SWITCHER                                 */}
                {/* ==================================================== */}
                <div className="mt-4 flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl w-fit border border-slate-200/60 dark:border-slate-700/60">
                  {(['Grid', 'Bar', 'Column', 'Line', 'Pie'] as ViewModeOption[]).map(mode => {
                    const isActive = viewMode === mode;
                    return (
                      <button
                        key={mode}
                        onClick={() => setViewMode(mode)}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                          isActive
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs border border-slate-200 dark:border-slate-800'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                        }`}
                      >
                        {mode === 'Grid' && <LayoutGrid className="w-3.5 h-3.5" />}
                        {mode === 'Bar' && <BarChart2 className="w-3.5 h-3.5 rotate-90" />}
                        {mode === 'Column' && <BarChart3 className="w-3.5 h-3.5" />}
                        {mode === 'Line' && <TrendingUp className="w-3.5 h-3.5" />}
                        {mode === 'Pie' && <PieIcon className="w-3.5 h-3.5" />}
                        <span>{mode}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ==================================================== */}
              {/* MAIN DISPLAY: GRID RESULT OR CHARTS                   */}
              {/* ==================================================== */}
              {viewMode === 'Grid' ? (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-6 shadow-xs flex flex-col gap-4">
                  
                  {/* Clean Table Ledger */}
                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold">
                          <th className="py-3 px-4">Date</th>
                          <th className="py-3 px-4">Driver Name</th>
                          <th className="py-3 px-4">Vehicle Number</th>
                          <th className="py-3 px-4">Trip Status</th>
                          <th className="py-3 px-4 text-center">Trip Count</th>
                          <th className="py-3 px-4 text-right">Revenue</th>
                          <th className="py-3 px-4 text-right">Driver Charges</th>
                          <th className="py-3 px-4 text-right">Third-Party Cost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200 font-medium">
                        {paginatedRows.length === 0 && (
                          <tr>
                            <td colSpan={8} className="py-10 px-4 text-center text-xs text-slate-400">
                              {isQueryLoading ? 'Loading trips…' : 'No trips in this period.'}
                            </td>
                          </tr>
                        )}
                        {paginatedRows.map((row, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="py-3 px-4 whitespace-nowrap">{row.date}</td>
                            <td className="py-3 px-4 font-bold text-slate-900 dark:text-slate-100">{row.driver}</td>
                            <td className="py-3 px-4 font-mono text-[11px] text-slate-600 dark:text-slate-400">{row.vehicle}</td>
                            <td className="py-3 px-4">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                                {row.status}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center font-bold">{row.tripCount}</td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                              SAR {row.revenue.toLocaleString()}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-slate-700 dark:text-slate-300">
                              SAR {row.tripCharges.toLocaleString()}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-slate-600 dark:text-slate-400">
                              SAR {row.thirdPartyCost.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* ==================================================== */}
                  {/* PAGINATION                                          */}
                  {/* ==================================================== */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs text-slate-500 dark:text-slate-400">
                    <div>
                      Showing <span className="font-bold text-slate-800 dark:text-slate-200">{startIndex}</span> to <span className="font-bold text-slate-800 dark:text-slate-200">{endIndex}</span> of <span className="font-bold text-slate-800 dark:text-slate-200">{totalEntries}</span> entries
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={safePage === 1}
                        className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>

                      {pageButtons.map((p, i) => {
                        if (typeof p === 'string') {
                          return <span key={i} className="px-1 text-slate-400">...</span>;
                        }
                        const isCurrent = safePage === p;
                        return (
                          <button
                            key={i}
                            onClick={() => setCurrentPage(p)}
                            className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                              isCurrent
                                ? 'bg-orange-500 text-white shadow-2xs'
                                : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {p}
                          </button>
                        );
                      })}

                      <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={safePage === totalPages}
                        className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                </div>
              ) : (
                /* Chart View Mode */
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-6 shadow-xs">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-4">
                    {viewMode} Visualization: Revenue by Driver
                  </h3>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      {viewMode === 'Line' ? (
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                          <XAxis dataKey="name" stroke="#64748B" fontSize={11} />
                          <YAxis stroke="#64748B" fontSize={11} />
                          <RechartsTooltip formatter={(v: any) => `SAR ${Number(v).toLocaleString()}`} />
                          <Line type="monotone" dataKey="revenue" stroke="#F97316" strokeWidth={3} activeDot={{ r: 8 }} />
                        </LineChart>
                      ) : viewMode === 'Pie' ? (
                        <PieChart>
                          <Pie
                            data={chartData}
                            dataKey="revenue"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={90}
                            fill="#F97316"
                            label={({ name, value }: any) => `${name}: SAR ${((value || 0) / 1000).toFixed(1)}k`}
                          >
                            {chartData.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={['#F97316', '#3B82F6', '#10B981', '#8B5CF6'][index % 4]} />
                            ))}
                          </Pie>
                          <RechartsTooltip formatter={(v: any) => `SAR ${Number(v).toLocaleString()}`} />
                        </PieChart>
                      ) : (
                        <BarChart data={chartData} layout={viewMode === 'Bar' ? 'vertical' : 'horizontal'}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                          {viewMode === 'Bar' ? (
                            <>
                              <XAxis type="number" stroke="#64748B" fontSize={11} />
                              <YAxis dataKey="name" type="category" stroke="#64748B" fontSize={11} width={100} />
                            </>
                          ) : (
                            <>
                              <XAxis dataKey="name" stroke="#64748B" fontSize={11} />
                              <YAxis stroke="#64748B" fontSize={11} />
                            </>
                          )}
                          <RechartsTooltip formatter={(v: any) => `SAR ${Number(v).toLocaleString()}`} />
                          <Bar dataKey="revenue" fill="#F97316" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* ==================================================== */}
              {/* SUMMARY KPI CARDS (DYNAMICALLY GENERATED)            */}
              {/* ==================================================== */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-6 shadow-xs">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-4">
                  SUMMARY
                </h3>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {/* Total Trips */}
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                      Total Trips
                    </p>
                    <h4 className="text-xl font-black text-slate-900 dark:text-slate-100">
                      {dynamicKpiSummary.totalTrips}
                    </h4>
                  </div>

                  {/* Total Revenue */}
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                      Total Revenue
                    </p>
                    <h4 className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                      SAR {dynamicKpiSummary.totalRevenue.toLocaleString()}
                    </h4>
                  </div>

                  {/* Total Trip Charges */}
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                      Total Driver Charges
                    </p>
                    <h4 className="text-xl font-black text-slate-900 dark:text-slate-100">
                      SAR {dynamicKpiSummary.totalTripCharges.toLocaleString()}
                    </h4>
                  </div>

                  {/* Total Third-Party Cost */}
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                      Total Third-Party Cost
                    </p>
                    <h4 className="text-xl font-black text-slate-900 dark:text-slate-100">
                      SAR {dynamicKpiSummary.totalThirdPartyCost.toLocaleString()}
                    </h4>
                  </div>

                  {/* Average Revenue / Trip */}
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-100 dark:border-slate-800 col-span-2 sm:col-span-1">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                      Average Revenue / Trip
                    </p>
                    <h4 className="text-xl font-black text-orange-600 dark:text-orange-400">
                      SAR {dynamicKpiSummary.avgRevenuePerTrip.toLocaleString()}
                    </h4>
                  </div>
                </div>
              </div>

              {/* ==================================================== */}
              {/* CHART CARD (REVENUE BY DRIVER)                        */}
              {/* ==================================================== */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-6 shadow-xs">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Revenue by Driver
                  </h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Performance breakdown
                  </span>
                </div>

                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="name" stroke="#64748B" fontSize={11} />
                      <YAxis stroke="#64748B" fontSize={11} tickFormatter={(v) => `SAR ${v/1000}k`} />
                      <RechartsTooltip formatter={(v: any) => `SAR ${Number(v).toLocaleString()}`} />
                      <Bar dataKey="revenue" fill="#F97316" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>
          </div>
        </main>



      </div>
    </DashboardLayout>
  );
}

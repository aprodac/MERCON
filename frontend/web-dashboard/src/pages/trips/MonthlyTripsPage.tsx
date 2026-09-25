import { useMemo, useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  CalendarRange, ChevronLeft, ChevronRight, FileSpreadsheet, FileText, Download, ChevronDown,
  Plus, Search, X, Info, SlidersHorizontal, Layers, Trash2, Filter, RotateCw, Building2,
  Truck, User, Wrench, Users
} from 'lucide-react';

import { format, subDays, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { TripDateFilterPicker, DateFilterType } from '@/components/trips/TripDateFilterPicker';
import DashboardLayout from '@/components/layout/DashboardLayout';
import MonthlyCompanyBoard from '@/components/trips/monthly/MonthlyCompanyBoard';
import ConfirmModal from '@/components/ui/ConfirmModal';
import ExportModal, { ExportColumn, ExportFilter } from '@/components/ui/ExportModal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Combobox } from '@/components/ui/combobox';
import { currentMonthKey, monthLabel, monthOptions, shiftMonth } from '@/components/trips/monthly/monthlyBoardUtils';
import { computeMonthlyTripSearchRelevance } from '@/components/trips/monthly/MonthlyCompanyCard';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { tripService } from '@/services/tripService';
import { customerService } from '@/services/customerService';
import { VEHICLE_TYPES, RATE_CATEGORIES, BILLING_TYPES } from '@mercon/shared-types';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { exportExcelTable, exportPDFTable, downloadCSVTable } from '@/utils/exportUtils';

const LABEL = 'text-[10px] font-bold uppercase tracking-wider text-[#9898A4]';

const STATUS_OPTIONS = [
  'Draft', 'Dispatched', 'AtPickup', 'InTransit', 'AtDelivery', 'Completed', 'Invoiced', 'Cancelled',
];

const EXPORT_HEADERS = [
  'Company', 'Date', 'Trip Ref', 'Status', 'Driver', 'Vehicle',
  'Rate Category', 'Vehicle Type', 'Billing Type', 'Origin', 'Destination', 'Amount', 'Currency',
];

export interface MonthlyExportRow {
  id: string;
  company_name: string;
  date: string;
  ref_id: string;
  status: string;
  driver_name: string;
  vehicle_plate: string;
  rate_category: string;
  vehicle_type: string;
  billing_type: string;
  origin: string;
  destination: string;
  billing_amount: number | string;
  currency: string;
}

const MONTHLY_EXPORT_COLUMNS: ExportColumn<MonthlyExportRow>[] = [
  { id: 'company_name', label: 'Company', accessor: (r) => r.company_name },
  { id: 'date', label: 'Date', accessor: (r) => r.date },
  { id: 'ref_id', label: 'Trip Ref', accessor: (r) => r.ref_id },
  { id: 'status', label: 'Status', accessor: (r) => r.status },
  { id: 'driver_name', label: 'Driver', accessor: (r) => r.driver_name },
  { id: 'vehicle_plate', label: 'Vehicle', accessor: (r) => r.vehicle_plate },
  { id: 'rate_category', label: 'Rate Category', accessor: (r) => r.rate_category },
  { id: 'vehicle_type', label: 'Vehicle Type', accessor: (r) => r.vehicle_type },
  { id: 'billing_type', label: 'Billing Type', accessor: (r) => r.billing_type },
  { id: 'origin', label: 'Origin', accessor: (r) => r.origin },
  { id: 'destination', label: 'Destination', accessor: (r) => r.destination },
  { id: 'billing_amount', label: 'Amount', accessor: (r) => r.billing_amount },
  { id: 'currency', label: 'Currency', accessor: (r) => r.currency },
];

const MONTHLY_EXPORT_FILTERS: ExportFilter<MonthlyExportRow>[] = [
  {
    id: 'status',
    label: 'Status',
    options: [
      { label: 'All Statuses', value: 'All' },
      { label: 'Scheduled', value: 'Draft' },
      { label: 'At Pickup', value: 'AtPickup' },
      { label: 'In Transit', value: 'InTransit' },
      { label: 'Completed', value: 'Completed' },
      { label: 'Invoiced', value: 'Invoiced' },
      { label: 'Cancelled', value: 'Cancelled' },
    ],
    filterFn: (row, val) => row.status === val,
  },
];

export default function MonthlyTripsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [month, setMonth] = useState(currentMonthKey());
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilterType>('All');
  const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>(undefined);
  const [customerId, setCustomerId] = useState('All');
  const [rateCategory, setRateCategory] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [billingType, setBillingType] = useState('');
  const [status, setStatus] = useState('');

  const effectiveDateRange = useMemo<DateRange | undefined>(() => {
    const today = new Date();
    if (dateFilter === 'Today') return { from: today, to: today };
    if (dateFilter === 'Yesterday') {
      const y = subDays(today, 1);
      return { from: y, to: y };
    }
    if (dateFilter === '3Days') return { from: subDays(today, 1), to: addDays(today, 1) };
    if (dateFilter === 'ThisWeek') return { from: startOfWeek(today, { weekStartsOn: 0 }), to: endOfWeek(today, { weekStartsOn: 0 }) };
    if (dateFilter === 'Last7Days') return { from: subDays(today, 6), to: today };
    if (dateFilter === 'ThisMonth') return { from: startOfMonth(today), to: endOfMonth(today) };
    if (dateFilter === 'Last30Days') return { from: subDays(today, 29), to: today };
    if (dateFilter === 'Custom') return customDateRange;
    return undefined;
  }, [dateFilter, customDateRange]);

  useEffect(() => {
    if (searchParams.get('bulk') === 'true') {
      navigate(`/trips/new?mode=monthly&month=${month}`, { replace: true });
    }
  }, [searchParams, month, navigate]);

  // Selection & Batch Actions State
  const [selectedTripIds, setSelectedTripIds] = useState<string[]>([]);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isSingleDeleteConfirmOpen, setIsSingleDeleteConfirmOpen] = useState(false);
  const [tripToDelete, setTripToDelete] = useState<string | null>(null);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [selectedMonthlyTripsForExport, setSelectedMonthlyTripsForExport] = useState<MonthlyExportRow[]>([]);

  const filters = {
    month,
    ...(customerId && customerId !== 'All' ? { customer_id: customerId } : {}),
    ...(rateCategory ? { rate_category: rateCategory } : {}),
    ...(vehicleType ? { vehicle_type: vehicleType } : {}),
    ...(billingType ? { billing_type: billingType } : {}),
    ...(status ? { status } : {}),
  };

  const { data: board, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ['trips', 'monthly-board', filters],
    queryFn: () => tripService.getMonthlyBoard(filters),
  });

  const { data: customersRes } = useQuery({
    queryKey: ['customers-select'],
    queryFn: () => customerService.getAll({ per_page: 100 , mode: 'lookup' }),
  });

  const rawCompanies = board?.companies ?? [];
  const summary = board?.summary;
  const customers = customersRes?.data ?? [];

  const companyOptions = useMemo(() => {
    const icon = <Building2 className="h-3.5 w-3.5 text-purple-400 shrink-0" />;
    const opts = [{ value: 'All', label: 'All Companies', icon }];
    customers.forEach((c) => {
      opts.push({ value: c.id, label: c.name, icon });
    });
    return opts;
  }, [customers]);

  const companies = useMemo(() => {
    let fromStr: string | null = null;
    let toStr: string | null = null;

    if (effectiveDateRange?.from) {
      fromStr = format(effectiveDateRange.from, 'yyyy-MM-dd');
      toStr = effectiveDateRange.to ? format(effectiveDateRange.to, 'yyyy-MM-dd') : fromStr;
    }

    if (!search.trim() && !fromStr) return rawCompanies;
    
    const query = search.trim();
    const filtered = rawCompanies.map((c) => {
      const filteredDays = c.days.map((d) => {
        // Date Filter
        if (fromStr && toStr) {
          if (d.date < fromStr || d.date > toStr) return null;
        }

        // Search Filter
        let matchingTrips = d.trips;
        if (query) {
          matchingTrips = d.trips.filter((t) => computeMonthlyTripSearchRelevance(t, query) > 0);
        }

        if (matchingTrips.length === 0) return null;

        return { ...d, trips: matchingTrips };
      }).filter(Boolean) as typeof c.days;

      const totalMatchingTrips = filteredDays.reduce((sum, d) => sum + d.trips.length, 0);

      const totalBilled = filteredDays.reduce((sum, d) => 
        sum + d.trips.reduce((tSum, t) => tSum + (t.billing_amount ?? 0), 0)
      , 0);

      return {
        ...c,
        days: filteredDays,
        total_trips: totalMatchingTrips,
        total_billed: totalBilled,
      };
    }).filter((c) => c.total_trips > 0);

    if (!query) return filtered;

    return filtered.sort((a, b) => {
      const aTrips = a.days.flatMap((d) => d.trips);
      const bTrips = b.days.flatMap((d) => d.trips);
      const scoreA = aTrips.reduce((max, t) => Math.max(max, computeMonthlyTripSearchRelevance(t, query)), 0);
      const scoreB = bTrips.reduce((max, t) => Math.max(max, computeMonthlyTripSearchRelevance(t, query)), 0);
      if (scoreA !== scoreB) return scoreB - scoreA;
      return b.total_trips - a.total_trips;
    });
  }, [rawCompanies, search, effectiveDateRange]);

  const allVisibleTripIds = useMemo(
    () => companies.flatMap((c) => c.days.flatMap((d) => d.trips.map((t) => t.id))),
    [companies],
  );

  const allTripsFlat = useMemo(
    () => companies.flatMap((c) => c.days.flatMap((d) => d.trips)),
    [companies],
  );

  const handleToggleTrip = (id: string) => {
    setSelectedTripIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const handleToggleCompany = (tripIds: string[]) => {
    const allInCompanySelected = tripIds.every((id) => selectedTripIds.includes(id));
    if (allInCompanySelected) {
      setSelectedTripIds((prev) => prev.filter((id) => !tripIds.includes(id)));
    } else {
      setSelectedTripIds((prev) => Array.from(new Set([...prev, ...tripIds])));
    }
  };

  const handleSelectAllVisible = () => {
    if (selectedTripIds.length === allVisibleTripIds.length) {
      setSelectedTripIds([]);
    } else {
      setSelectedTripIds(allVisibleTripIds);
    }
  };

  const handleClearSelection = () => {
    setSelectedTripIds([]);
  };

  const bulkStatusMutation = useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: string }) =>
      tripService.bulkUpdateStatus(ids, status),
    onSuccess: () => {
      refetch();
      setSelectedTripIds([]);
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => tripService.bulkDelete(ids),
    onSuccess: (res) => {
      refetch();
      setSelectedTripIds([]);
      setIsDeleteConfirmOpen(false);
      setIsSingleDeleteConfirmOpen(false);
      setTripToDelete(null);
      if (res?.skippedCount > 0) {
        if (res.deletedCount > 0) {
          toast.warning(`Moved ${res.deletedCount} trip(s) to Trash. ${res.skippedCount} trip(s) were protected from deletion (invoiced/settled).`);
        } else {
          toast.error(`Cannot delete trip(s): selected trip(s) are already invoiced or financially settled.`);
        }
      } else {
        toast.success(`Successfully moved ${res?.deletedCount || 'selected'} trip(s) to Trash`);
      }
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.error?.message || 'Failed to delete trip(s)');
    },
  });

  const resetFilters = () => {
    setCustomerId('All');
    setRateCategory('');
    setVehicleType('');
    setBillingType('');
    setStatus('');
    setSearch('');
    setDateFilter('All');
    setCustomDateRange(undefined);
  };

  const appliedFiltersCount = [
    customerId !== 'All',
    Boolean(rateCategory),
    Boolean(vehicleType),
    Boolean(billingType),
    Boolean(status),
    Boolean(search.trim()),
    dateFilter !== 'All',
  ].filter(Boolean).length;

  const exportRows: MonthlyExportRow[] = useMemo(
    () =>
      companies.flatMap((company) =>
        company.days.flatMap((day) =>
          day.trips.map((trip) => ({
            id: trip.id,
            company_name: company.customer.name,
            date: day.date,
            ref_id: trip.ref_id ?? '',
            status: trip.status,
            driver_name: trip.driver?.name ?? 'Not assigned',
            vehicle_plate: trip.vehicle?.plate_number ?? 'Not assigned',
            rate_category: trip.rate_category ?? '',
            vehicle_type: trip.vehicle_type ?? '',
            billing_type: trip.billing_type ?? '',
            origin: trip.origin ?? '',
            destination: (trip.destination ?? '').replace(/🔁\s*/g, '').trim(),
            billing_amount: trip.billing_amount ?? '',
            currency: trip.currency ?? 'SAR',
          })),
        ),
      ),
    [companies],
  );

  const handleExport = (format: 'excel' | 'pdf' | 'csv') => {
    if (exportRows.length === 0) return;
    const title = `Monthly Trips — ${monthLabel(month)}`;
    const baseName = `MERCON_Monthly_Trips_${month}`;

    const matrix = exportRows.map((r) => [
      r.company_name,
      r.date,
      r.ref_id,
      r.status,
      r.driver_name,
      r.vehicle_plate,
      r.rate_category,
      r.vehicle_type,
      r.billing_type,
      r.origin,
      r.destination,
      r.billing_amount,
      r.currency,
    ]);

    if (format === 'excel') {
      exportExcelTable(title, EXPORT_HEADERS, matrix, `${baseName}.xlsx`, { sheetName: `Monthly ${month}` });
    } else if (format === 'pdf') {
      exportPDFTable(title, EXPORT_HEADERS, matrix, `${baseName}.pdf`, {
        subtitle: `Monthly Trips Board for ${monthLabel(month)} · ${exportRows.length} trips`,
      });
    } else if (format === 'csv') {
      downloadCSVTable(EXPORT_HEADERS, matrix, `${baseName}.csv`);
    }
  };

  return (
    <DashboardLayout active="Trips" title="Monthly Trips">
      <div className="px-4 sm:px-6 pb-6 w-full flex flex-col animate-fade-in gap-4">

        {/* ── Filter Toolbar Row ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 shrink-0 py-1">
          {/* Left: Total Trips Pill + Search + Filters */}
          <div className="flex items-center flex-wrap gap-2.5 min-w-0">
            {/* Total Trips Pill */}
            <div
              onClick={resetFilters}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-purple-50 dark:bg-purple-950/50 border border-purple-200/90 dark:border-purple-800/80 text-purple-700 dark:text-purple-300 text-xs font-bold shadow-2xs hover:bg-purple-100 transition-all cursor-pointer h-9 shrink-0"
              title="Click to reset filters"
            >
              <div className="w-2 h-2 rounded-full bg-purple-600 animate-pulse" />
              <span>Total Trips:</span>
              <span className="font-mono text-xs font-black text-purple-700 bg-white dark:bg-slate-900 px-2 py-0.5 rounded-lg border border-purple-200 shadow-3xs">
                {summary?.total_trips ?? allTripsFlat.length}
              </span>
            </div>

            {/* Search Input */}
            <div className="relative w-56 sm:w-64 lg:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by route, driver, vehicle, trip ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 text-xs h-9 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 w-full rounded-xl shadow-2xs focus-visible:ring-purple-500/20 focus-visible:border-purple-500"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Date Filter Button from Trip Ledger */}
            <div className="w-auto">
              <TripDateFilterPicker
                dateFilter={dateFilter}
                setDateFilter={setDateFilter}
                customDateRange={customDateRange}
                setCustomDateRange={(newRange) => {
                  setCustomDateRange(newRange);
                  if (newRange?.from) {
                    const newMonthKey = format(newRange.from, 'yyyy-MM');
                    if (newMonthKey !== month) {
                      setMonth(newMonthKey);
                    }
                  }
                }}
              />
            </div>

          </div>

          {/* Right: Month Selector, Export & Import, + New Trip */}
          <div className="flex items-center flex-wrap gap-2.5">
            {/* Month Selector Stepper */}
            <MonthStepper month={month} onChange={setMonth} />

            {/* Export & Import Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 text-xs font-bold border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80 shadow-2xs rounded-xl transition-colors"
                >
                  <Download className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                  Export & Import
                  <ChevronDown className="h-3 w-3 text-slate-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 p-1.5 shadow-lg border border-slate-200 bg-white rounded-xl">
                <DropdownMenuItem
                  onClick={() => handleExport('excel')}
                  disabled={exportRows.length === 0}
                  className="cursor-pointer text-xs font-semibold py-1.5 px-2 rounded-md"
                >
                  <FileSpreadsheet className="mr-2 h-3.5 w-3.5 text-emerald-600" />
                  Export Excel (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleExport('pdf')}
                  disabled={exportRows.length === 0}
                  className="cursor-pointer text-xs font-semibold py-1.5 px-2 rounded-md"
                >
                  <FileText className="mr-2 h-3.5 w-3.5 text-rose-600" />
                  Export PDF (.pdf)
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={() => {
                    setSelectedMonthlyTripsForExport([]);
                    setIsExportOpen(true);
                  }}
                  className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md text-purple-700 hover:bg-purple-50"
                >
                  <Filter className="mr-2 h-3.5 w-3.5 text-purple-600" />
                  Custom Export Settings...
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Primary Action Button (New Trip) */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="h-9 rounded-xl px-4 text-xs font-extrabold bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-1.5 cursor-pointer shadow-md">
                  <span>New Trip</span>
                  <ChevronDown className="h-3.5 w-3.5 text-white/80 ml-0.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60 p-1.5 rounded-xl shadow-xl border border-slate-200 bg-white">
                <DropdownMenuItem
                  onClick={() => navigate('/trips/new')}
                  className="cursor-pointer text-xs font-medium py-2.5 px-3 rounded-lg flex items-center gap-3 hover:bg-purple-50"
                >
                  <Plus className="w-4 h-4 text-purple-600 shrink-0" />
                  <div>
                    <div className="font-bold text-[#111111]">Daily / Single Local Trip</div>
                    <div className="text-[10px] text-slate-500">Standard single dispatch trip</div>
                  </div>
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={() => navigate(`/trips/new?mode=monthly&month=${month}`)}
                  className="cursor-pointer text-xs font-medium py-2.5 px-3 rounded-lg flex items-center gap-3 hover:bg-purple-50"
                >
                  <Layers className="w-4 h-4 text-purple-600 shrink-0" />
                  <div>
                    <div className="font-bold text-[#111111]">Monthly / Bulk Add Trips</div>
                    <div className="text-[10px] text-slate-500">Batch contract generator & import</div>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {summary?.truncated && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs text-amber-900 flex items-start gap-2">
            <Info className="h-4 w-4 shrink-0 mt-px text-amber-700" />
            <span>
              This month has more trips than the board loads at once. Filter by company to be sure you are
              seeing everything.
            </span>
          </div>
        )}

        {/* ── 3. Main Body: 4-Column Company Board ── */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-80 w-full rounded-2xl border border-slate-200" />
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-6 py-16 text-center">
            <CalendarRange className="w-8 h-8 text-slate-600 shrink-0 mx-auto" />
            <h3 className="mt-4 text-sm font-bold text-rose-700">Failed to load this month's trips</h3>
            <p className="mt-1.5 text-xs text-rose-600 max-w-sm mx-auto">
              This can happen on a slow or unstable connection. Your data is fine — try again.
            </p>
            <div className="mt-5">
              <Button
                variant="outline"
                className="h-9 rounded-lg text-xs font-bold border-rose-300 text-rose-700 shadow-none"
                onClick={() => refetch()}
              >
                Retry
              </Button>
            </div>
          </div>
        ) : companies.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm px-6 py-16 text-center">
            <CalendarRange className="w-8 h-8 text-slate-600 shrink-0 mx-auto" />
            <h3 className="mt-4 text-sm font-bold text-slate-900">
              {appliedFiltersCount > 0
                ? 'Nothing matches these filters'
                : `No trips planned for ${monthLabel(month)}`}
            </h3>
            <p className="mt-1.5 text-xs text-slate-500 max-w-sm mx-auto">
              {appliedFiltersCount > 0
                ? 'Try clearing a filter, or step to another month.'
                : 'Trips appear here as soon as they are created with a planned start in this month.'}
            </p>
            <div className="mt-5">
              {appliedFiltersCount > 0 ? (
                <Button
                  variant="outline"
                  className="h-9 rounded-lg text-xs font-bold border-slate-200 shadow-none"
                  onClick={resetFilters}
                >
                  <X className="h-3.5 w-3.5 mr-1.5" />
                  Clear filters
                </Button>
              ) : (
                <Button
                  className="h-9 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-700 shadow-none text-white"
                  onClick={() => navigate('/trips/new')}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Create a trip
                </Button>
              )}
            </div>
          </div>
        ) : (
          <MonthlyCompanyBoard
            companies={companies}
            selectedTripIds={selectedTripIds}
            search={search}
            onToggleTrip={handleToggleTrip}
            onToggleCompany={handleToggleCompany}
            onRefresh={refetch}
          />
        )}
      </div>

      {/* Floating Selection & Bulk Action Bar */}
      {selectedTripIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-2xl w-[92vw] sm:w-auto bg-charcoal text-white px-4 py-3 rounded-2xl shadow-2xl border border-slate-800 flex items-center justify-between gap-4 animate-in slide-in-from-bottom-5 duration-200">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs font-extrabold bg-purple-600 text-white px-2.5 py-1 rounded-lg shadow-2xs">
              <span>{selectedTripIds.length}</span>
              <span>Selected</span>
            </div>
            <button
              type="button"
              onClick={handleSelectAllVisible}
              className="text-xs text-slate-300 hover:text-white font-semibold transition-colors hidden sm:inline"
            >
              {selectedTripIds.length === allVisibleTripIds.length ? 'Deselect all' : `Select all (${allVisibleTripIds.length})`}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Select
              onValueChange={(val: string) => {
                if (val) bulkStatusMutation.mutate({ ids: selectedTripIds, status: val });
              }}
            >
              <SelectTrigger className="h-8 rounded-lg bg-slate-800 border-slate-700 text-white text-xs font-medium w-36 focus:ring-0">
                <SelectValue placeholder="Update Status" />
              </SelectTrigger>
              <SelectContent align="end" className="w-44 bg-charcoal border-slate-800 text-white">
                <SelectGroup>
                  <SelectLabel className="text-[10px] uppercase font-bold text-slate-400">Bulk Change Status</SelectLabel>
                  {STATUS_OPTIONS.map((st) => (
                    <SelectItem key={st} value={st} className="text-xs text-slate-200 focus:bg-slate-800 focus:text-white cursor-pointer">
                      Set to {st}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const selectedRows = exportRows.filter(row => selectedTripIds.includes(row.id));
                setSelectedMonthlyTripsForExport(selectedRows);
                setIsExportOpen(true);
              }}
              className="h-8 rounded-lg text-xs font-semibold bg-slate-800 border-slate-700 text-white hover:bg-slate-700 gap-1.5 px-3"
            >
              <Download className="h-3.5 w-3.5 text-slate-300" />
              <span>Export ({selectedTripIds.length})</span>
            </Button>

            <Button
              variant="destructive"
              size="sm"
              disabled={bulkDeleteMutation.isPending}
              onClick={() => setIsDeleteConfirmOpen(true)}
              className="h-8 rounded-lg text-xs font-extrabold bg-rose-600 hover:bg-rose-700 text-white gap-1.5 px-3 shadow-2xs"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete ({selectedTripIds.length})</span>
            </Button>

            <button
              type="button"
              onClick={handleClearSelection}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-1"
              title="Clear selection"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modals */}
      <ConfirmModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={() => bulkDeleteMutation.mutate(selectedTripIds)}
        title={`Delete ${selectedTripIds.length} Selected Trips?`}
        message={`Are you sure you want to permanently delete the ${selectedTripIds.length} selected trips from the database? This action cannot be undone.`}
        confirmLabel={bulkDeleteMutation.isPending ? 'Deleting...' : 'Delete Selected Trips'}
        isDestructive
        isLoading={bulkDeleteMutation.isPending}
      />

      <ConfirmModal
        isOpen={isSingleDeleteConfirmOpen}
        onClose={() => { setIsSingleDeleteConfirmOpen(false); setTripToDelete(null); }}
        onConfirm={() => tripToDelete && bulkDeleteMutation.mutate([tripToDelete])}
        title="Delete Trip?"
        message="Are you sure you want to permanently delete this trip from the database? This action cannot be undone."
        confirmLabel={bulkDeleteMutation.isPending ? 'Deleting...' : 'Delete Trip'}
        isDestructive
        isLoading={bulkDeleteMutation.isPending}
      />

      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        title="Monthly Trips Export"
        fileNamePrefix={`monthly_trips_export_${month}`}
        sheetName={`Monthly ${month}`}
        filteredData={exportRows}
        allData={exportRows}
        selectedData={selectedMonthlyTripsForExport}
        columns={MONTHLY_EXPORT_COLUMNS}
        filters={MONTHLY_EXPORT_FILTERS}
        formats={['xlsx', 'csv', 'pdf']}
        rowDateAccessor={(r) => r.date}
      />
    </DashboardLayout>
  );
}

/** Month Stepper Control */
function MonthStepper({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  const isCurrent = month === currentMonthKey();

  return (
    <div className="flex items-center rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden divide-x divide-slate-200 dark:divide-slate-800 shadow-2xs h-9">
      <button
        type="button"
        onClick={() => onChange(shiftMonth(month, -1))}
        aria-label="Previous month"
        className="h-9 w-8 grid place-items-center text-slate-500 hover:bg-purple-50 dark:hover:bg-purple-950/40 hover:text-purple-600 transition-colors"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>

      <div className="relative h-9 flex items-center">
        <span className="px-3 text-xs font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap min-w-[100px] text-center">
          {monthLabel(month)}
        </span>
        <input
          type="month"
          value={month}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          aria-label="Pick month"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </div>

      <button
        type="button"
        onClick={() => onChange(shiftMonth(month, 1))}
        aria-label="Next month"
        className="h-9 w-8 grid place-items-center text-slate-500 hover:bg-purple-50 dark:hover:bg-purple-950/40 hover:text-purple-600 transition-colors"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>

      {!isCurrent && (
        <button
          type="button"
          onClick={() => onChange(currentMonthKey())}
          className="h-9 px-2.5 text-[11px] font-bold text-purple-600 hover:bg-purple-50 transition-colors whitespace-nowrap"
        >
          Today
        </button>
      )}
    </div>
  );
}

/** Filter dropdown */
function FilterSelect({
  value, onChange, placeholder, label, options, icon,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  options: { value: string; label: string }[];
  icon?: React.ReactNode;
}) {
  const active = !!value;
  return (
    <Select value={value || 'all'} onValueChange={(val: string) => onChange(val === 'all' ? '' : val)}>
      <SelectTrigger
        className={`h-9 w-auto min-w-[130px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs font-semibold shadow-2xs focus:ring-0 flex items-center gap-1.5 ${
          active ? 'text-purple-700 font-bold border-purple-300' : 'text-slate-600'
        }`}
      >
        {icon}
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent align="start" className="w-[200px] max-h-[320px] p-1.5 rounded-xl border border-slate-200 bg-white shadow-md">
        <SelectGroup>
          <SelectLabel className={`${LABEL} px-2 py-1`}>{label}</SelectLabel>
          <SelectItem value="all" className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md">
            {placeholder}
          </SelectItem>
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md"
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

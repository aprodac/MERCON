import { useCallback, useMemo, useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  CalendarRange, ChevronLeft, ChevronRight, FileSpreadsheet, FileText, Download, ChevronDown,
  Plus, Search, X, Info, Layers, Trash2, Filter, AlertTriangle, CheckCircle2,
} from 'lucide-react';

import DashboardLayout from '@/components/layout/DashboardLayout';
import MonthlyRouteGrid, { type GridCompany } from '@/components/trips/monthly/MonthlyRouteGrid';
import MonthlyGroupLedgerModal from '@/components/trips/monthly/MonthlyGroupLedgerModal';
import ConfirmModal from '@/components/ui/ConfirmModal';
import ExportModal, { ExportColumn, ExportFilter } from '@/components/ui/ExportModal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { currentMonthKey, monthLabel, shiftMonth, formatMoney } from '@/components/trips/monthly/monthlyBoardUtils';
import { computeMonthlyTripSearchRelevance } from '@/components/trips/monthly/monthlySearch';
import { buildBookings, buildGroups, CELL_STYLES, OVERDUE_CELL, localDay, totalsOf, type CellState } from '@/components/trips/monthly/monthlyGrid';
import { useAssignmentLookups } from '@/components/trips/monthly/useAssignmentLookups';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { tripService, type MonthlyBoardCompany } from '@/services/tripService';
import { exportExcelTable, exportPDFTable, downloadCSVTable } from '@/utils/exportUtils';

/** The Prisma TripStatus enum — the only values the bulk endpoint accepts. */
const STATUS_OPTIONS = [
  'Draft', 'Scheduled', 'Loading', 'InTransit', 'Delayed', 'Completed', 'Invoiced', 'Cancelled',
];

const LEGEND: CellState[] = ['done', 'active', 'planned', 'gap', 'cancelled'];

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
      { label: 'Scheduled', value: 'Scheduled' },
      { label: 'Loading', value: 'Loading' },
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
  const [searchParams, setSearchParams] = useSearchParams();

  const [month, setMonth] = useState(currentMonthKey());
  const [search, setSearch] = useState('');
  const [companyId, setCompanyId] = useState('All');
  /** Narrow the grid to routes that need attention. */
  const [focus, setFocus] = useState<'gaps' | 'overdue' | null>(null);
  const toggleFocus = (f: 'gaps' | 'overdue') => setFocus((cur) => (cur === f ? null : f));

  useEffect(() => {
    if (searchParams.get('bulk') === 'true') {
      navigate(`/trips/new?mode=monthly&month=${month}`, { replace: true });
    }
  }, [searchParams, month, navigate]);

  // Selection & Batch Actions State
  const [selectedTripIds, setSelectedTripIds] = useState<string[]>([]);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [selectedMonthlyTripsForExport, setSelectedMonthlyTripsForExport] = useState<MonthlyExportRow[]>([]);

  const { data: board, isLoading, isError, refetch } = useQuery({
    queryKey: ['trips', 'monthly-board', { month }],
    queryFn: () => tripService.getMonthlyBoard({ month }),
  });

  const rawCompanies = useMemo(() => board?.companies ?? [], [board]);
  const summary = board?.summary;

  const today = localDay(0);
  const soonUntil = localDay(2);

  /** Companies with trips this month, busiest first. */
  const companyChips = useMemo(
    () => [...rawCompanies].sort((a, b) => b.total_trips - a.total_trips),
    [rawCompanies],
  );

  const companyOptions = useMemo<ComboboxOption[]>(
    () => [
      {
        value: 'All',
        label: `All companies · ${summary?.total_trips ?? 0} trips`,
        selectedLabel: 'All companies',
        keywords: 'all',
      },
      ...companyChips.map((c) => ({
        value: c.customer.id,
        label: `${c.customer.name} · ${c.total_trips}`,
        selectedLabel: c.customer.name,
        keywords: c.customer.name,
      })),
    ],
    [companyChips, summary?.total_trips],
  );

  // Company + search narrow the trips; the grid groups what's left into routes.
  const companies = useMemo<MonthlyBoardCompany[]>(() => {
    const query = search.trim();
    return rawCompanies
      .filter((c) => companyId === 'All' || c.customer.id === companyId)
      .map((c) => {
        if (!query) return c;
        const days = c.days
          .map((d) => ({ ...d, trips: d.trips.filter((t) => computeMonthlyTripSearchRelevance(t, query) > 0) }))
          .filter((d) => d.trips.length > 0);
        return { ...c, days };
      })
      .filter((c) => c.days.length > 0);
  }, [rawCompanies, companyId, search]);

  const gridRows = useMemo<GridCompany[]>(() => {
    return companies
      .map((company) => {
        let groups = buildGroups(company);
        if (focus) {
          groups = groups.filter((g) => {
            const t = totalsOf(g.trips, today, soonUntil);
            return focus === 'gaps' ? t.gapsSoon > 0 : t.overdue > 0;
          });
        }
        const trips = groups.flatMap((g) => g.trips);
        return { company, groups, totals: totalsOf(trips, today, soonUntil) };
      })
      .filter((r) => r.groups.length > 0)
      .sort((a, b) => b.totals.total - a.totals.total);
  }, [companies, focus, today, soonUntil]);

  // Double-booking is checked against the whole month, whatever is filtered.
  const bookings = useMemo(() => buildBookings(rawCompanies), [rawCompanies]);

  const allTripsFlat = useMemo(
    () => companies.flatMap((c) => c.days.flatMap((d) => d.trips)),
    [companies],
  );
  const kpis = useMemo(() => totalsOf(allTripsFlat, today, soonUntil), [allTripsFlat, today, soonUntil]);

  const allVisibleTripIds = useMemo(
    () => gridRows.flatMap((r) => r.groups.flatMap((g) => g.trips.map((t) => t.id))),
    [gridRows],
  );

  // ── Ledger drawer, kept in the URL so Back closes it ──
  const ledgerKey = searchParams.get('route');
  const ledger = useMemo(() => {
    if (!ledgerKey) return null;
    for (const company of rawCompanies) {
      const group = buildGroups(company).find((g) => g.key === ledgerKey);
      if (group) return { group, company };
    }
    return null;
  }, [ledgerKey, rawCompanies]);

  const openLedger = useCallback(
    (group: { key: string }) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('route', group.key);
        return next;
      });
    },
    [setSearchParams],
  );

  const closeLedger = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('route');
      return next;
    }, { replace: true });
  };

  const handleToggleTrips = useCallback((ids: string[]) => {
    setSelectedTripIds((prev) => {
      const all = ids.every((id) => prev.includes(id));
      return all ? prev.filter((id) => !ids.includes(id)) : Array.from(new Set([...prev, ...ids]));
    });
  }, []);

  const handleSelectTrips = useCallback((ids: string[]) => {
    setSelectedTripIds((prev) => Array.from(new Set([...prev, ...ids])));
  }, []);

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
    onError: (e: any) => {
      toast.error(e.response?.data?.error?.message || 'Failed to update status');
    },
  });

  // Driver / truck for a selected range of days, confirmed before it goes out.
  const { driverOptions, vehicleOptions } = useAssignmentLookups(selectedTripIds.length > 0);
  const [pendingAssign, setPendingAssign] = useState<{ field: 'driver_id' | 'vehicle_id'; id: string; label: string } | null>(null);

  const bulkAssignMutation = useMutation({
    mutationFn: (p: { field: 'driver_id' | 'vehicle_id'; id: string }) =>
      tripService.bulkAssign({ trip_ids: selectedTripIds, [p.field]: p.id }),
    onSuccess: () => {
      toast.success(`Updated ${selectedTripIds.length} trip(s)`);
      refetch();
      setSelectedTripIds([]);
      setPendingAssign(null);
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.error?.message || 'Failed to update trips');
    },
  });

  const askAssign = (field: 'driver_id' | 'vehicle_id', id: string) => {
    if (!id) return;
    const options = field === 'driver_id' ? driverOptions : vehicleOptions;
    const label = options.find((o) => o.value === id)?.label;
    setPendingAssign({ field, id, label: typeof label === 'string' ? label : id });
  };

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => tripService.bulkDelete(ids),
    onSuccess: (res) => {
      refetch();
      setSelectedTripIds([]);
      setIsDeleteConfirmOpen(false);
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
    setCompanyId('All');
    setSearch('');
    setFocus(null);
  };

  const appliedFiltersCount = [companyId !== 'All', Boolean(search.trim()), Boolean(focus)].filter(Boolean).length;

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
      <div className="px-4 sm:px-6 pb-6 w-full flex flex-col animate-fade-in gap-3">

        {/* ── Toolbar: month, search, export, new trip ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 shrink-0 py-1">
          <div className="flex items-center flex-wrap gap-2.5 min-w-0">
            <MonthStepper month={month} onChange={(m) => { setMonth(m); setSelectedTripIds([]); }} />
            <div className="relative w-56 sm:w-64 lg:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search route, driver, plate, trip ID"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 text-xs h-9 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 w-full rounded-lg shadow-none"
              />
              {search && (
                <button onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 text-xs font-semibold border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80 shadow-none rounded-lg transition-colors"
                >
                  <Download className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                  Export
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
                  className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md text-slate-700"
                >
                  <Filter className="mr-2 h-3.5 w-3.5 text-slate-500" />
                  Custom Export Settings...
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="h-9 rounded-lg px-4 text-xs font-semibold bg-charcoal hover:bg-charcoal-strong text-white flex items-center gap-1.5 cursor-pointer">
                  <span>New Trip</span>
                  <ChevronDown className="h-3.5 w-3.5 text-white/80 ml-0.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60 p-1.5 rounded-xl shadow-xl border border-slate-200 bg-white">
                <DropdownMenuItem
                  onClick={() => navigate('/trips/new')}
                  className="cursor-pointer text-xs font-medium py-2.5 px-3 rounded-lg flex items-center gap-3"
                >
                  <Plus className="w-4 h-4 text-slate-500 shrink-0" />
                  <div>
                    <div className="font-bold text-[#3E3C3D]">Daily / Single Local Trip</div>
                    <div className="text-[10px] text-slate-500">Standard single dispatch trip</div>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => navigate(`/trips/new?mode=monthly&month=${month}`)}
                  className="cursor-pointer text-xs font-medium py-2.5 px-3 rounded-lg flex items-center gap-3"
                >
                  <Layers className="w-4 h-4 text-slate-500 shrink-0" />
                  <div>
                    <div className="font-bold text-[#3E3C3D]">Monthly / Bulk Add Trips</div>
                    <div className="text-[10px] text-slate-500">Batch contract generator & import</div>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* ── KPI strip ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Trips this month">
            <div className="text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{kpis.total}</div>
            <div className="text-[11px] text-slate-400">across {gridRows.length} {gridRows.length === 1 ? 'company' : 'companies'}</div>
          </StatCard>
          <StatCard label="Completed">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{kpis.done}</span>
              <span className="text-xs text-slate-400 tabular-nums">· {kpis.total ? Math.round((kpis.done / kpis.total) * 100) : 0}%</span>
            </div>
            <div className="mt-1.5 h-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${kpis.total ? (kpis.done / kpis.total) * 100 : 0}%` }} />
            </div>
          </StatCard>
          <StatCard
            label="Needs attention"
            icon={<AlertTriangle className="h-3 w-3" />}
            tone={kpis.gapsSoon + kpis.overdue > 0 ? 'warn' : undefined}
          >
            {kpis.gapsSoon + kpis.overdue === 0 && !focus ? (
              <div className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400 pt-1">
                <CheckCircle2 className="h-4 w-4" /> All clear
              </div>
            ) : (
              <div className="flex gap-1 -mx-1.5">
                <AttentionRow
                  count={kpis.gapsSoon}
                  label="no driver, next 3d"
                  tone="amber"
                  active={focus === 'gaps'}
                  onClick={() => toggleFocus('gaps')}
                />
                <AttentionRow
                  count={kpis.overdue}
                  label="not closed"
                  tone="rose"
                  active={focus === 'overdue'}
                  onClick={() => toggleFocus('overdue')}
                />
              </div>
            )}
          </StatCard>
          <StatCard label="Billed so far">
            <div className="text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{formatMoney(kpis.earned)}</div>
            <div className="text-[11px] text-slate-400 tabular-nums">of {formatMoney(kpis.expected)} planned</div>
          </StatCard>
        </div>

        {/* ── Company filter: searchable, since the list can grow long ── */}
        {companyChips.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-72">
              <Combobox
                options={companyOptions}
                value={companyId}
                onChange={(v) => setCompanyId(v || 'All')}
                placeholder="All companies"
                searchPlaceholder="Search companies"
                className="h-9 text-xs rounded-lg"
                popoverClassName="min-w-[288px]"
              />
            </div>
            {companyId !== 'All' && (
              <button
                type="button"
                onClick={() => setCompanyId('All')}
                className="h-9 px-2 text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-1"
              >
                <X className="h-3.5 w-3.5" /> Show all
              </button>
            )}
          </div>
        )}

        {summary?.truncated && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs text-amber-900 flex items-start gap-2">
            <Info className="h-4 w-4 shrink-0 mt-px text-amber-700" />
            <span>
              This month has more trips than the board loads at once. Pick a company to be sure you are
              seeing everything.
            </span>
          </div>
        )}

        {/* ── Route × day grid ── */}
        {isLoading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl" />
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
        ) : gridRows.length === 0 ? (
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
                  className="h-9 rounded-lg text-xs font-semibold bg-charcoal hover:bg-charcoal-strong shadow-none text-white"
                  onClick={() => navigate(`/trips/new?mode=monthly&month=${month}`)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Add monthly trips
                </Button>
              )}
            </div>
          </div>
        ) : (
          <>
            <MonthlyRouteGrid
              month={month}
              rows={gridRows}
              today={today}
              soonUntil={soonUntil}
              bookings={bookings}
              selectedTripIds={selectedTripIds}
              onToggleTrips={handleToggleTrips}
              onSelectTrips={handleSelectTrips}
              onOpenLedger={openLedger}
            />
            <div className="flex items-center gap-4 flex-wrap text-[11px] text-slate-500">
              {LEGEND.map((s) => (
                <span key={s} className="flex items-center gap-1.5">
                  <span className={`h-3 w-2.5 rounded-[3px] ${CELL_STYLES[s].dot}`} />
                  {CELL_STYLES[s].label}
                </span>
              ))}
              <span className="flex items-center gap-1.5">
                <span className={`h-3 w-2.5 rounded-[3px] ${OVERDUE_CELL}`} />
                Past, not closed
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-2.5 rounded-[3px] bg-slate-100 dark:bg-slate-800" />
                No trip
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-rose-600" />
                Driver or truck double-booked
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3.5 w-3 rounded-[3px] bg-emerald-100 text-emerald-800 text-[9px] font-semibold grid place-items-center">4</span>
                Trips that day, when it differs from the route's usual
              </span>
              <span className="ml-auto text-slate-400">
                Click a day to edit it · shift-click two days to select the range · click a route for its ledger
              </span>
            </div>
          </>
        )}
      </div>

      {/* Floating Selection & Bulk Action Bar */}
      {selectedTripIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-5xl w-[96vw] sm:w-auto bg-charcoal text-white px-4 py-3 rounded-2xl shadow-2xl border border-slate-800 flex items-center justify-between gap-4 animate-in slide-in-from-bottom-5 duration-200">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold bg-white/15 text-white px-2.5 py-1 rounded-lg">
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

          <div className="flex items-center gap-2 flex-wrap justify-end">
            <div className="w-44">
              <Combobox
                options={driverOptions}
                value=""
                onChange={(val) => askAssign('driver_id', val)}
                placeholder="Set driver"
                searchPlaceholder="Search drivers"
                className="h-8 text-xs bg-slate-800 border-slate-700 text-white rounded-lg"
              />
            </div>
            <div className="w-40">
              <Combobox
                options={vehicleOptions}
                value=""
                onChange={(val) => askAssign('vehicle_id', val)}
                placeholder="Set truck"
                searchPlaceholder="Search plates"
                className="h-8 text-xs bg-slate-800 border-slate-700 text-white rounded-lg"
              />
            </div>
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

      <MonthlyGroupLedgerModal
        isOpen={Boolean(ledger)}
        onClose={closeLedger}
        group={ledger?.group ?? null}
        companyName={ledger?.company.customer.name ?? ''}
        companyLogo={ledger?.company.customer.logo_url}
        allCompanyTrips={ledger ? ledger.company.days.flatMap((d) => d.trips) : []}
        onRefresh={refetch}
      />

      <ConfirmModal
        isOpen={Boolean(pendingAssign)}
        onClose={() => setPendingAssign(null)}
        onConfirm={() => pendingAssign && bulkAssignMutation.mutate(pendingAssign)}
        title={`Set ${pendingAssign?.field === 'driver_id' ? 'driver' : 'truck'} on ${selectedTripIds.length} trip(s)?`}
        message={
          pendingAssign?.id === 'unassigned'
            ? `This removes the ${pendingAssign.field === 'driver_id' ? 'driver' : 'truck'} from the ${selectedTripIds.length} selected trips.`
            : `${pendingAssign?.label ?? ''} will be put on all ${selectedTripIds.length} selected trips, replacing whoever is on them now.`
        }
        confirmLabel={bulkAssignMutation.isPending ? 'Saving...' : 'Apply'}
        isLoading={bulkAssignMutation.isPending}
      />

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

function StatCard({
  label,
  icon,
  tone,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  tone?: 'warn';
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border bg-white dark:bg-slate-900 px-4 py-2.5 ${
        tone === 'warn' ? 'border-amber-300/80 dark:border-amber-800' : 'border-slate-200 dark:border-slate-800'
      }`}
    >
      <div
        className={`text-[11px] font-medium flex items-center gap-1 ${
          tone === 'warn' ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500'
        }`}
      >
        {icon}
        {label}
      </div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function AttentionRow({
  count,
  label,
  tone,
  active,
  onClick,
}: {
  count: number;
  label: string;
  tone: 'amber' | 'rose';
  active: boolean;
  onClick: () => void;
}) {
  const hot = count > 0;
  const color = tone === 'amber' ? 'text-amber-700 dark:text-amber-300' : 'text-rose-600 dark:text-rose-400';
  const activeBg = tone === 'amber' ? 'bg-amber-100 dark:bg-amber-950/50' : 'bg-rose-100 dark:bg-rose-950/50';
  const hover = tone === 'amber' ? 'hover:bg-amber-50 dark:hover:bg-amber-950/30' : 'hover:bg-rose-50 dark:hover:bg-rose-950/30';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!hot && !active}
      title={active ? 'Show all routes' : 'Show only these routes'}
      className={`flex items-baseline gap-1.5 rounded-md px-1.5 py-0.5 text-left transition-colors ${
        active ? `${activeBg} ${color}` : hot ? `${hover} ${color}` : 'text-slate-400 cursor-default'
      }`}
    >
      <span className="text-xl font-semibold tabular-nums">{count}</span>
      <span className="text-[11px] font-medium whitespace-nowrap">{label}</span>
      {active && <X className="h-3 w-3 self-center" />}
    </button>
  );
}

/** Month Stepper Control */
function MonthStepper({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  const isCurrent = month === currentMonthKey();
  const step = 'h-9 w-8 grid place-items-center text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white transition-colors';

  return (
    <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden divide-x divide-slate-200 dark:divide-slate-800 h-9">
      <button type="button" onClick={() => onChange(shiftMonth(month, -1))} aria-label="Previous month" className={step}>
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>

      <div className="relative h-9 flex items-center">
        <span className="px-3 text-xs font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap min-w-[110px] text-center">
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

      <button type="button" onClick={() => onChange(shiftMonth(month, 1))} aria-label="Next month" className={step}>
        <ChevronRight className="h-3.5 w-3.5" />
      </button>

      {!isCurrent && (
        <button
          type="button"
          onClick={() => onChange(currentMonthKey())}
          className="h-9 px-2.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
        >
          This month
        </button>
      )}
    </div>
  );
}

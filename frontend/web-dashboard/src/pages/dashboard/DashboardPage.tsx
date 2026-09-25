import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Plus,
  FileText,
  RotateCw,
  Maximize2,
  ChevronUp,
  Activity,
  Truck,
  Building2,
  X,
  Navigation,
  Calendar,
  Search,
  LayoutGrid,
  List,
  Download,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Filter,
  ChevronDown,
  Users,
  Receipt,
  MapPin,
} from 'lucide-react';

import DashboardLayout from '@/components/layout/DashboardLayout';
import OperatorInbox from '@/components/dashboard/inbox/OperatorInbox';
import DataTable, { Column } from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { authStore } from '@/store/authStore';
import { reportsService } from '@/services/reportsService';
import { tripService, Trip, TripStatus } from '@/services/tripService';
import { customerService } from '@/services/customerService';
import { WhatsAppIcon } from '@/components/ui/whatsapp-icon';
import WhatsappShareModal from '@/components/trips/WhatsappShareModal';
import TripKanbanBoard from '@/components/trips/kanban/TripKanbanBoard';
import ConfirmModal from '@/components/ui/ConfirmModal';
import PostTripSettlementModal from '@/components/trips/PostTripSettlementModal';
import CompanyTripKanbanBoard from '@/components/trips/kanban/CompanyTripKanbanBoard';
import QuickAssignModal from '@/components/trips/QuickAssignModal';
import { reverseGeocode } from '@/services/addressSearch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getTripDisplayStatus, normalizeTripStatus } from '@/utils/tripStatus';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import ExportModal, { ExportColumn } from '@/components/ui/ExportModal';
import { exportToCSV } from '@/utils/exportUtils';
import { cn } from '@/lib/utils';
import FleetCommandMap from '@/components/maps/live/FleetCommandMap';
import { useDeploymentTimezone, formatInDeploymentTz } from '@/lib/datetime';

const DATE_FILTER_OPTIONS = [
  { label: 'All Dates', value: 'all' },
  { label: 'Today', value: 'today' },
  { label: 'Yesterday', value: 'yesterday' },
  { label: 'This Week', value: 'this_week' },
  { label: 'This Month', value: 'this_month' },
  { label: 'Upcoming', value: 'upcoming' },
];

function matchesDateFilter(dateStr: string | null | undefined, filter: string, tz: string): boolean {
  if (!dateStr || filter === 'all') return true;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return true;

  const now = new Date();
  const dateFormatted = formatInDeploymentTz(d, tz, 'yyyy-MM-dd');
  const todayFormatted = formatInDeploymentTz(now, tz, 'yyyy-MM-dd');

  if (filter === 'today') {
    return dateFormatted === todayFormatted;
  }
  if (filter === 'yesterday') {
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return dateFormatted === formatInDeploymentTz(yesterday, tz, 'yyyy-MM-dd');
  }
  if (filter === 'this_week') {
    const diffDays = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays >= -7 && diffDays <= 7;
  }
  if (filter === 'this_month') {
    return formatInDeploymentTz(d, tz, 'yyyy-MM') === formatInDeploymentTz(now, tz, 'yyyy-MM');
  }
  if (filter === 'upcoming') {
    return d.getTime() > now.getTime();
  }
  return true;
}

const DASHBOARD_EXPORT_COLUMNS: ExportColumn<any>[] = [
  { id: 'id', label: 'Trip ID', accessor: (t) => t.id || t.tripId || t.ref_id },
  { id: 'customer', label: 'Customer', accessor: (t) => t.customerName || t.customer?.name || '—' },
  { id: 'route', label: 'Route', accessor: (t) => t.route || `${t.pickup || t.stops?.[0]?.location_name || ''} → ${t.dropoff || t.stops?.[t.stops?.length - 1]?.location_name || ''}` },
  { id: 'location', label: 'Current Location', accessor: (t) => {
    const loc = t.vehicle?.resolved_location || t.rawTrip?.vehicle?.resolved_location;
    if (!loc || loc.display_state === 'UNAVAILABLE' || !loc.latitude || !loc.longitude) return 'Location unavailable';
    return `${loc.display_state === 'CURRENT' ? 'Current' : 'Last known'}: ${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)} (${loc.formatted_time_ago || ''})`;
  } },
  { id: 'driver', label: 'Driver', accessor: (t) => t.driver ? (typeof t.driver === 'string' ? t.driver : `${t.driver.first_name} ${t.driver.last_name}`) : '—' },
  { id: 'vehicle', label: 'Vehicle Plate', accessor: (t) => t.vehicle ? (typeof t.vehicle === 'string' ? t.vehicle : t.vehicle.plate_number) : t.plate || '—' },
  { id: 'status', label: 'Status', accessor: (t) => t.status || t.rawStatus },
  { id: 'departure', label: 'Departure', accessor: (t) => t.startTime || (t.planned_start ? formatInDeploymentTz(t.planned_start, 'Asia/Riyadh', 'yyyy-MM-dd') : '—') },
  { id: 'eta', label: 'ETA', accessor: (t) => t.eta || '—' },
  { id: 'price', label: 'Rate (SAR)', accessor: (t) => (t.price || t.billing_amount ? `SAR ${Number(t.price || t.billing_amount).toLocaleString('en-US')}` : '—') },
];

// ─── Fallback Coordinates for Saudi Hubs ────────────────────────────────────
const CITY_COORDS: Record<string, [number, number]> = {
  riyadh: [24.7136, 46.6753],
  jeddah: [21.5433, 39.1728],
  dammam: [26.4207, 50.0888],
  makkah: [21.3891, 39.8579],
  madinah: [24.5247, 39.5692],
  khobar: [26.2172, 50.1971],
  jubail: [27.0046, 49.6601],
  qassim: [26.3260, 43.9750],
  taif: [21.4373, 40.5127],
  tabuk: [28.3835, 36.5662],
  abha: [18.2164, 42.5053],
  jizan: [16.8892, 42.5706],
};

function getApproxCoords(cityName: string = '', index: number = 0): [number, number] {
  const clean = cityName.toLowerCase().trim();
  for (const [key, coords] of Object.entries(CITY_COORDS)) {
    if (clean.includes(key)) {
      // Add slight jitter so multiple trucks in same city don't completely overlap
      const offsetLat = ((index % 5) - 2) * 0.12;
      const offsetLng = (((index * 3) % 5) - 2) * 0.12;
      return [coords[0] + offsetLat, coords[1] + offsetLng];
    }
  }
  // Default central Saudi Arabia coordinates
  return [24.5 + (index % 4) * 0.5, 45.0 + (index % 4) * 0.5];
}

const STATUS_STYLE: Record<string, { dot: string; badge: string; label: string }> = {
  'Scheduled':   { dot: 'bg-indigo-500',  badge: 'bg-indigo-50 text-indigo-700 border-indigo-200',   label: 'Scheduled' },
  'Loading':     { dot: 'bg-sky-500',     badge: 'bg-sky-50 text-sky-700 border-sky-200',           label: 'Loading' },
  'At Pickup':   { dot: 'bg-sky-500',     badge: 'bg-sky-50 text-sky-700 border-sky-200',           label: 'Loading' },
  'To Pickup':   { dot: 'bg-sky-500',     badge: 'bg-sky-50 text-sky-700 border-sky-200',           label: 'Loading' },
  'In Transit':  { dot: 'bg-amber-500',   badge: 'bg-amber-50 text-amber-700 border-amber-200',       label: 'In Transit' },
  'To Delivery': { dot: 'bg-amber-500',   badge: 'bg-amber-50 text-amber-700 border-amber-200',       label: 'In Transit' },
  'Delayed':     { dot: 'bg-rose-500',    badge: 'bg-rose-50 text-rose-700 border-rose-200',         label: 'Delayed' },
  'Completed':   { dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Completed' },
  'Cancelled':   { dot: 'bg-slate-400',   badge: 'bg-slate-100 text-slate-600 border-slate-200',     label: 'Cancelled' },
};

const FALLBACK_KANBAN_TRIPS: Trip[] = [];

function DashboardLocationCell({ rawTrip }: { rawTrip?: any }) {
  const resolvedLoc = rawTrip?.vehicle?.resolved_location || rawTrip?.resolved_location || rawTrip?.rawTrip?.vehicle?.resolved_location;
  const lat = resolvedLoc?.latitude ?? resolvedLoc?.lat;
  const lng = resolvedLoc?.longitude ?? resolvedLoc?.lng;
  const displayState = resolvedLoc?.display_state;
  const hasCoords = typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng);
  const isUnavailable = !resolvedLoc || displayState === 'UNAVAILABLE' || !hasCoords;

  const [placeName, setPlaceName] = useState<string | null>(null);

  useEffect(() => {
    if (!hasCoords || isUnavailable) {
      setPlaceName(null);
      return;
    }

    let isMounted = true;
    reverseGeocode(lat!, lng!)
      .then((res) => {
        if (isMounted) setPlaceName(res);
      })
      .catch(() => {
        if (isMounted) setPlaceName(null);
      });

    return () => {
      isMounted = false;
    };
  }, [lat, lng, isUnavailable, hasCoords]);

  if (isUnavailable) {
    return (
      <div className="flex items-center gap-1 text-[11px] font-medium italic text-slate-400 dark:text-slate-500 py-0.5" title="No live physical GPS telemetry">
        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span className="truncate">Location unavailable</span>
      </div>
    );
  }

  const isCurrent = displayState === 'CURRENT';
  const coordsText = `${lat!.toFixed(4)}, ${lng!.toFixed(4)}`;
  const locationLabel = placeName || coordsText;
  const sourceLabel = resolvedLoc?.source === 'DRIVER_GPS' ? 'Driver GPS' : resolvedLoc?.source === 'PHYSICAL_GPS' ? 'Vehicle GPS' : null;
  const timeAgoText = resolvedLoc?.formatted_time_ago;
  const statePrefix = isCurrent ? 'Current' : 'Last known';

  return (
    <div className="flex flex-col gap-0.5 py-0.5 max-w-[190px] truncate" title={`${statePrefix}: ${locationLabel}`}>
      <div className="flex items-center gap-1 min-w-0">
        <Navigation className={cn("w-3 h-3 shrink-0", isCurrent ? "text-emerald-500" : "text-amber-500")} />
        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate flex items-center gap-1">
          <MapPin className="w-3 h-3 shrink-0 text-slate-400" />
          <span className="truncate">{locationLabel}</span>
        </span>
      </div>
      <div className="flex items-center gap-1 text-[10px] font-medium text-slate-500 dark:text-slate-400 pl-4 truncate">
        {timeAgoText && (
          <span>
            {isCurrent ? `Current · ${timeAgoText}` : `Last known · ${timeAgoText}`}
          </span>
        )}
        {sourceLabel && <span>· {sourceLabel}</span>}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tz = useDeploymentTimezone();

  const [dashboardViewMode, setDashboardViewMode] = useState<'kanban' | 'collapsed' | 'ledger'>('ledger');
  /** Inbox → map: which trip's truck to fly to. The nonce lets the same trip be requested twice. */
  const [mapFocus, setMapFocus] = useState<{ tripId: string; nonce: number } | null>(null);
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');
  const [selectedCompany, setSelectedCompany] = useState<string>('all');
  const [tripSearch, setTripSearch] = useState('');
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isWhatsappOpen, setIsWhatsappOpen] = useState(false);
  const [whatsappMode, setWhatsappMode] = useState<'fleet_summary' | 'single_trip' | 'company_summary'>('fleet_summary');
  const [whatsappSelectedTrip, setWhatsappSelectedTrip] = useState<Trip | null>(null);
  const [whatsappSelectedCompany, setWhatsappSelectedCompany] = useState<string>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRemindersCollapsed, setIsRemindersCollapsed] = useState(false);
  const [quickAssignTrip, setQuickAssignTrip] = useState<Trip | null>(null);

  const handleOpenWhatsappFleet = () => {
    setWhatsappMode(selectedCompany !== 'all' ? 'company_summary' : 'fleet_summary');
    setWhatsappSelectedTrip(null);
    setWhatsappSelectedCompany(selectedCompany);
    setIsWhatsappOpen(true);
  };

  const handleOpenWhatsappTrip = (trip: Trip) => {
    setWhatsappMode('single_trip');
    setWhatsappSelectedTrip(trip);
    setIsWhatsappOpen(true);
  };

  const handleOpenWhatsappCompany = (companyName: string) => {
    setWhatsappMode('company_summary');
    setWhatsappSelectedTrip(null);
    setWhatsappSelectedCompany(companyName);
    setIsWhatsappOpen(true);
  };

  const user = authStore.getUser();
  const isAdmin = user?.role === 'Admin';
  const userName = user?.name ? user.name.split(' ')[0] : 'Mercon';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  // Live Queries for summary (Admin only) + real trips from API
  // Wrapped in try/catch: if reports module returns 403 MODULE_DISABLED,
  // the global axios interceptor redirects to '/' — we swallow it here.
  const { refetch: refetchSummary } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: async () => {
      try {
        return await reportsService.getSummary();
      } catch {
        return null;
      }
    },
    enabled: isAdmin,
    retry: false,
  });

  const { data: tripsRes, refetch: refetchTrips, isLoading: isTripsLoading, isError: isTripsError } = useQuery({
    queryKey: ['dashboard-trips'],
    queryFn: () => tripService.getAll({ per_page: 200 }),
    refetchInterval: 10000,
  });

  const { data: customersRes } = useQuery({
    queryKey: ['dashboard-customers-list'],
    queryFn: () => customerService.getAll({ per_page: 200 , mode: 'lookup' }),
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([isAdmin ? refetchSummary() : Promise.resolve(), refetchTrips()]);
    setTimeout(() => setIsRefreshing(false), 600);
  };

  const [statusConfirmModal, setStatusConfirmModal] = useState<{
    isOpen: boolean;
    trip: Trip | null;
    targetStatus: TripStatus | string | null;
    title: string;
    message: string;
    confirmLabel: string;
    isLoading: boolean;
  }>({
    isOpen: false,
    trip: null,
    targetStatus: null,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    isLoading: false,
  });

  const [settlementModalTrip, setSettlementModalTrip] = useState<Trip | null>(null);

  const handleKanbanStatusChange = (trip: Trip, targetStatus: TripStatus | string) => {
    if (trip.status === targetStatus) return;

    const driverFirstName =
      trip.driver?.first_name ||
      (trip.third_party_driver_name ? trip.third_party_driver_name.split(' ')[0] : '') ||
      (trip.driver ? `${trip.driver.first_name}` : 'the driver');

    const ref = trip.ref_id || 'Draft';

    let title = 'Confirm Status Change';
    let message = `Are you sure you want to change status of trip ${ref} (${driverFirstName}) to ${targetStatus}?`;
    let confirmLabel = 'Confirm Status Change';

    const statusStr = String(targetStatus);

    if (statusStr === 'Completed') {
      title = 'Confirm Trip Completion';
      message = `Did ${driverFirstName} complete trip ${ref}?`;
      confirmLabel = 'Yes, Trip Completed';
    } else if (statusStr === 'Delayed') {
      title = 'Confirm Trip Delay';
      message = `Was ${driverFirstName} delayed on trip ${ref}?`;
      confirmLabel = 'Yes, Mark Delayed';
    } else if (statusStr === 'InTransit') {
      title = 'Confirm In-Transit Status';
      message = `Did ${driverFirstName} start transit for trip ${ref}?`;
      confirmLabel = 'Yes, Mark In Transit';
    } else if (statusStr === 'AtPickup') {
      title = 'Confirm Loading / At Pickup';
      message = `Has ${driverFirstName} arrived at pickup for trip ${ref}?`;
      confirmLabel = 'Yes, Arrived at Pickup';
    } else if (statusStr === 'Draft') {
      title = 'Confirm Revert to Scheduled';
      message = `Revert trip ${ref} for ${driverFirstName} to Scheduled?`;
      confirmLabel = 'Yes, Revert Status';
    } else if (statusStr === 'Emergency') {
      title = 'Confirm Emergency Status';
      message = `Report emergency status for ${driverFirstName} on trip ${ref}?`;
      confirmLabel = 'Report Emergency';
    }

    setStatusConfirmModal({
      isOpen: true,
      trip,
      targetStatus,
      title,
      message,
      confirmLabel,
      isLoading: false,
    });
  };

  const handleConfirmKanbanStatusChange = async () => {
    if (!statusConfirmModal.trip || !statusConfirmModal.targetStatus) return;
    const { trip, targetStatus } = statusConfirmModal;

    try {
      setStatusConfirmModal((prev) => ({ ...prev, isLoading: true }));
      const updated = await tripService.updateStatus(trip.id, targetStatus as TripStatus);
      queryClient.invalidateQueries({ queryKey: ['dashboard-trips'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      toast.success(`Updated ${trip.ref_id} status to ${targetStatus}`);

      setStatusConfirmModal({
        isOpen: false,
        trip: null,
        targetStatus: null,
        title: '',
        message: '',
        confirmLabel: 'Confirm',
        isLoading: false,
      });

      if (targetStatus === 'Completed') {
        setSettlementModalTrip(updated || { ...trip, status: 'Completed' });
      }
    } catch (e) {
      toast.error(`Failed to update status for ${trip.ref_id}`);
      setStatusConfirmModal((prev) => ({ ...prev, isLoading: false }));
    }
  };

  const rawTrips = tripsRes?.data || [];

  // Base active trips for Kanban board (only real operational transit fleet trips from backend API)
  const baseTripsForKanban: Trip[] = useMemo(() => {
    const pool = (rawTrips && rawTrips.length > 0) ? (rawTrips as Trip[]) : [];
    return pool.filter((t) => {
      const s = String(t.status || '').toLowerCase().replace(/[\s_-]/g, '');
      if (['completed', 'invoiced', 'cancelled'].includes(s)) return false;
      return true;
    });
  }, [rawTrips]);

  // Extract unique companies from trips and database customers (prioritize companies with active trips first)
  const companyOptions = useMemo(() => {
    const map = new Map<string, number>();
    baseTripsForKanban.forEach((t) => {
      const name = t.customer?.name || (t as any).customerName;
      if (name) {
        map.set(name, (map.get(name) || 0) + 1);
      }
    });
    (customersRes?.data || []).forEach((c) => {
      if (c.name && !map.has(c.name)) {
        map.set(c.name, 0);
      }
    });
    return Array.from(map.entries()).sort((a, b) => {
      if (a[1] > 0 && b[1] === 0) return -1;
      if (a[1] === 0 && b[1] > 0) return 1;
      if (a[1] !== b[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    });
  }, [baseTripsForKanban, customersRes]);

  // Filtered trips for Kanban board (Active only: Company, Search and Active Status Filter)
  const filteredTripsForKanban: Trip[] = useMemo(() => {
    return baseTripsForKanban.filter((t) => {
      // 1. Company filter
      if (selectedCompany !== 'all') {
        const name = t.customer?.name || (t as any).customerName;
        if (name !== selectedCompany) return false;
      }

      // 2. Status filter (Active tracking statuses)
      if (selectedStatusFilter !== 'all') {
        const display = getTripDisplayStatus(t.status, (t as any).driver_workflow_state, t.planned_end);
        if (selectedStatusFilter === 'Delayed') {
          if (!display.isDelayed) return false;
        } else if (selectedStatusFilter === 'Scheduled') {
          if (display.status !== 'Scheduled' && display.status !== 'Draft') return false;
        } else if (display.status !== selectedStatusFilter && t.status !== selectedStatusFilter) {
          return false;
        }
      }

      // 3. Search filter
      if (tripSearch.trim()) {
        const q = tripSearch.toLowerCase().trim();
        const refStr = (t.ref_id || t.id || '').toLowerCase();
        const custStr = (t.customer?.name || (t as any).customerName || '').toLowerCase();
        const driverStr = t.driver
          ? (typeof t.driver === 'string' ? t.driver : `${t.driver.first_name} ${t.driver.last_name}`).toLowerCase()
          : '';
        const vehicleStr = t.vehicle
          ? (typeof t.vehicle === 'string' ? t.vehicle : t.vehicle.plate_number).toLowerCase()
          : (t as any).plate ? (t as any).plate.toLowerCase() : '';
        const pickupStr = (t.stops?.[0]?.location_name || (t as any).pickup || '').toLowerCase();
        const dropoffStr = (t.stops?.[t.stops.length - 1]?.location_name || (t as any).dropoff || '').toLowerCase();

        const matches =
          refStr.includes(q) ||
          custStr.includes(q) ||
          driverStr.includes(q) ||
          vehicleStr.includes(q) ||
          pickupStr.includes(q) ||
          dropoffStr.includes(q);

        if (!matches) return false;
      }

      return true;
    });
  }, [baseTripsForKanban, selectedCompany, selectedStatusFilter, tripSearch]);

  // Categorize live trips into current, upcoming, completed for Ledger table
  const { currentTrips, upcomingTrips, completedTrips } = useMemo(() => {
    const current: any[] = [];
    const upcoming: any[] = [];
    const completed: any[] = [];

    rawTrips.forEach((t, idx) => {
      const driverName = t.driver
        ? `${t.driver.first_name} ${t.driver.last_name}`.trim()
        : (t.is_third_party ? (t.third_party_driver_name || t.thirdPartyProvider?.name || '3PL Driver') : 'Unassigned Driver');
      const initials = t.driver
        ? `${t.driver.first_name?.[0] || ''}${t.driver.last_name?.[0] || ''}`.toUpperCase() || 'DR'
        : (t.is_third_party ? (t.third_party_driver_name?.[0] || t.thirdPartyProvider?.name?.[0] || '3P').toUpperCase() : 'UN');
      const vehiclePlate = t.vehicle?.plate_number || t.vehicle?.ref_id || (t.is_third_party ? (t.third_party_vehicle_plate || '3PL Truck') : 'VEH-PENDING');

      const origin = (t.stops?.[0]?.location_name || t.rateCard?.route_origin || 'Riyadh Hub').replace(/\]+$/, '').trim();
      const rawDest = (t.stops?.[t.stops.length - 1]?.location_name || t.rateCard?.route_destination || 'Jeddah Gateway').replace(/\]+$/, '').trim();
      // Strip "RETURN: Origin → " prefix — return trips encode destination as "RETURN: From → To"
      const destination = rawDest.includes('→')
        ? rawDest.split('→').pop()?.trim() || rawDest
        : rawDest.replace(/^RETURN:\s*/i, '').trim();
      const route = `${origin} → ${destination}`;
      const customerName = t.customer?.name || 'Saudi Aramco Logistics';
      const price = t.billing_amount ?? t.trip_charges ?? t.rateCard?.base_price ?? (t.planned_distance ? t.planned_distance * 3 : 2450);

      const display = getTripDisplayStatus(t.status, (t as any).driver_workflow_state, t.planned_end, t.planned_start);
      const mappedStatus = display.label;
      const progress = display.progress;

      const formattedEta = t.planned_end
        ? formatInDeploymentTz(t.planned_end, tz, 'd MMM, hh:mm a')
        : t.planned_start
        ? formatInDeploymentTz(new Date(new Date(t.planned_start).getTime() + 24 * 3600 * 1000).toISOString(), tz, 'd MMM, hh:mm a')
        : t.createdAt
        ? formatInDeploymentTz(new Date(new Date(t.createdAt).getTime() + 24 * 3600 * 1000).toISOString(), tz, 'd MMM, hh:mm a')
        : '—';

      const coords = t.stops?.[0]?.location_lat && t.stops?.[0]?.location_lng
        ? [t.stops[0].location_lat, t.stops[0].location_lng] as [number, number]
        : getApproxCoords(origin, idx);

      const item = {
        id: t.ref_id || `TRP-${t.id.slice(0, 6).toUpperCase()}`,
        rawId: t.id,
        pickup: origin,
        dropoff: destination,
        route,
        customerName,
        price,
        driver: driverName,
        initials,
        avatarBg: 'bg-blue-100 text-blue-700',
        vehicle: vehiclePlate,
        status: mappedStatus,
        rawStatus: t.status || mappedStatus,
        startTime: t.planned_start
          ? formatInDeploymentTz(t.planned_start, tz, 'd MMM')
          : formatInDeploymentTz(t.createdAt, tz, 'd MMM'),
        eta: formattedEta,
        progress,
        distance: `${t.planned_distance || 850} km`,
        lat: coords[0],
        lng: coords[1],
        plate: vehiclePlate,
        tripId: t.ref_id || `TRP-${t.id.slice(0, 6).toUpperCase()}`,
        planned_start: t.planned_start,
        createdAt: t.createdAt,
        rawTrip: t,
      };

      // Include active ongoing operational trips in active fleet summary (only started active trips, excluding scheduled/draft)
      const s = String(t.status || '').toLowerCase().replace(/[\s_-]/g, '');
      const isEnded = ['completed', 'invoiced', 'cancelled'].includes(s);
      const isScheduled = ['scheduled', 'draft'].includes(s);

      if (!isEnded && !isScheduled) {
        current.push(item);
      }
      if (t.status === 'Draft' || t.status === 'Scheduled' || (t.planned_start && new Date(t.planned_start) > new Date())) {
        upcoming.push(item);
      }
      if (t.status === 'Completed' || t.status === 'Invoiced') {
        completed.push(item);
      }
    });

    return {
      currentTrips: current,
      upcomingTrips: upcoming,
      completedTrips: completed,
    };
  }, [rawTrips]);

  const companyFilteredCurrent = useMemo(() => {
    return currentTrips.filter((t: any) => {
      if (selectedCompany !== 'all' && t.customerName !== selectedCompany) return false;
      return true;
    });
  }, [currentTrips, selectedCompany]);

  const activeTrips = companyFilteredCurrent;
  const activeFleet = activeTrips;

  const filteredActiveTrips = useMemo(() => {
    return activeTrips.filter((t: any) => {
      // 1. Status Filter (Connect map status filter pills to Ledger view)
      if (selectedStatusFilter !== 'all') {
        const raw = String(t.rawStatus || t.status || '');
        const currentStatus = String(t.status || '');

        if (selectedStatusFilter === 'Delayed') {
          if (currentStatus !== 'Delayed' && raw !== 'Delayed') return false;
        } else if (selectedStatusFilter === 'Scheduled' || selectedStatusFilter === 'Dispatched' || selectedStatusFilter === 'Draft') {
          if (currentStatus !== 'Scheduled' && currentStatus !== 'Draft' && raw !== 'Scheduled' && raw !== 'Draft' && raw !== 'Dispatched') return false;
        } else if (selectedStatusFilter === 'Loading' || selectedStatusFilter === 'AtPickup') {
          if (currentStatus !== 'Loading' && raw !== 'Loading' && raw !== 'AtPickup') return false;
        } else if (selectedStatusFilter === 'InTransit') {
          if (currentStatus !== 'In Transit' && raw !== 'InTransit') return false;
        } else if (selectedStatusFilter === 'AtDelivery' || selectedStatusFilter === 'Completed') {
          if (currentStatus !== 'Completed' && raw !== 'Completed' && raw !== 'AtDelivery') return false;
        }
      }

      // 2. Search Filter
      if (tripSearch.trim()) {
        const q = tripSearch.toLowerCase().trim();
        const idStr = String(t.id || t.tripId || t.ref_id || '').toLowerCase();
        const custStr = String(t.customerName || t.customer?.name || '').toLowerCase();
        const driverStr = String(t.driver || '').toLowerCase();
        const vehicleStr = String(t.vehicle || t.plate || '').toLowerCase();
        const pickupStr = String(t.pickup || '').toLowerCase();
        const dropoffStr = String(t.dropoff || '').toLowerCase();
        const statusStr = String(t.status || t.rawStatus || '').toLowerCase();
        
        const matches = (
          idStr.includes(q) ||
          custStr.includes(q) ||
          driverStr.includes(q) ||
          vehicleStr.includes(q) ||
          pickupStr.includes(q) ||
          dropoffStr.includes(q) ||
          statusStr.includes(q)
        );
        if (!matches) return false;
      }

      return true;
    });
  }, [activeTrips, selectedStatusFilter, tripSearch]);

  // Comprehensive Trip Ledger Columns matching TripListPage + full telemetry
  const tripLedgerColumns = useMemo<Column<any>[]>(() => [
    {
      header: 'Trip ID',
      className: 'w-[100px] shrink-0',
      accessor: (row: any) => (
        <span className="font-mono text-xs font-bold text-brand truncate block">
          {row.id || row.tripId || row.ref_id || 'Draft'}
        </span>
      ),
    },
    {
      header: 'Customer',
      className: 'min-w-[140px] max-w-[180px] truncate',
      accessor: (row: any) => (
        <div className="flex flex-col truncate">
          <span className="font-semibold text-xs text-slate-900 dark:text-slate-100 leading-tight truncate" title={row.customerName || 'Standard Freight'}>
            {row.customerName || 'Standard Freight'}
          </span>
        </div>
      ),
    },
    {
      header: 'Route',
      className: 'min-w-[160px] max-w-[200px] truncate',
      accessor: (row: any) => {
        const pickup = (row.pickup || (row.route || '').split('→')[0]?.trim() || 'Riyadh').replace(/\]+$/, '').trim();
        const rawDropoff = (row.dropoff || (row.route || '').split('→')[1]?.trim() || 'Jeddah').replace(/\]+$/, '').trim();
        // Strip "RETURN: Origin → " prefix — return trips encode destination as "RETURN: From → To"
        const dropoff = rawDropoff.includes('→')
          ? rawDropoff.split('→').pop()?.trim() || rawDropoff
          : rawDropoff.replace(/^RETURN:\s*/i, '').trim();
        return (
          <div className="flex flex-col gap-0 py-0.5 max-w-[180px] truncate" title={`From: ${pickup}\nTo: ${dropoff}`}>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                {pickup}
              </span>
            </div>
            <div className="ml-[2.5px] w-0 h-2 border-l border-dotted border-slate-400 dark:border-slate-500 my-0.5" />
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0" />
              <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                {dropoff}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      header: 'Current Location',
      className: 'min-w-[170px] max-w-[210px] truncate',
      accessor: (row: any) => {
        const matchingTrip = row.rawTrip || (activeTrips.find((t) => (t.ref_id || t.id) === (row.ref_id || row.id)) as any)?.rawTrip || row;
        return <DashboardLocationCell rawTrip={matchingTrip} />;
      },
    },
    {
      header: 'Driver',
      className: 'min-w-[140px] max-w-[180px]',
      accessor: (row: any) => {
        if (row.is_third_party) {
          const name = row.third_party_driver_name || row.driver || '3PL Driver';
          const providerName = row.carrier_name || '3PL Carrier';
          return (
            <div className="flex items-center gap-1.5 truncate" title={`3PL Driver: ${name}\nProvider: ${providerName}`}>
              <div className="w-5 h-5 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-bold text-[9px] flex items-center justify-center shrink-0 border border-purple-200 dark:border-purple-800">
                3P
              </div>
              <div className="flex flex-col min-w-0 truncate leading-tight">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                  {name}
                </span>
                <span className="text-[10px] text-purple-600 dark:text-purple-400 font-medium truncate">
                  3PL: {providerName}
                </span>
              </div>
            </div>
          );
        }

        return (
          <div className="flex items-center gap-1.5 truncate">
            <div className="w-5.5 h-5.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-[9px] flex items-center justify-center shrink-0">
              {row.initials || (row.driver ? `${row.driver[0]}` : 'U')}
            </div>
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate" title={row.driver}>
              {row.driver || 'Unassigned'}
            </span>
          </div>
        );
      },
    },
    {
      header: 'Vehicle',
      className: 'w-[105px] shrink-0',
      accessor: (row: any) => (
        <div className="flex items-center gap-1">
          <Truck size={12} className={row.is_third_party ? "text-purple-500 shrink-0" : "text-slate-400 shrink-0"} />
          {row.vehicle ? (
            <span className={row.is_third_party
              ? "font-mono text-[11px] font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 border border-purple-200/80 dark:border-purple-800/60 px-1.5 py-0.5 rounded truncate"
              : "font-mono text-[11px] font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded truncate"
            }>
              {row.vehicle}
            </span>
          ) : (
            <span className="text-xs text-slate-400 italic">Unassigned</span>
          )}
        </div>
      ),
    },
    {
      header: 'Status',
      className: 'w-[110px] shrink-0',
      accessor: (row: any) => (
        <StatusBadge status={row.rawStatus || row.status} />
      ),
    },
    {
      header: 'Departure',
      className: 'w-[95px] shrink-0',
      accessor: (row: any) => (
        <span className="text-xs text-slate-500 font-medium whitespace-nowrap">
          {row.startTime}
        </span>
      ),
    },
    {
      header: 'ETA',
      className: 'w-[130px] shrink-0',
      accessor: (row: any) => (
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
          {row.eta || '—'}
        </span>
      ),
    },
    {
      header: 'Rate',
      className: 'w-[110px] text-right shrink-0',
      headerClassName: 'text-right',
      accessor: (row: any) => {
        const price = row.price;
        return (
          <div className="flex items-center justify-end font-mono text-xs">
            <span className="font-extrabold text-slate-900 dark:text-slate-200">
              {price !== undefined && price !== null && Number(price) > 0
                ? `SAR ${Number(price).toLocaleString('en-US')}`
                : '—'}
            </span>
          </div>
        );
      },
    },
    {
      header: 'WhatsApp',
      className: 'w-[95px] text-center shrink-0',
      headerClassName: 'text-center',
      accessor: (row: any) => {
        const matchingTrip = activeTrips.find((t) => (t.ref_id || t.id) === (row.ref_id || row.id)) || row.rawTrip || row;
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenWhatsappTrip(matchingTrip);
            }}
            className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/80 dark:border-emerald-800/80 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/80 transition-colors cursor-pointer mx-auto flex items-center justify-center gap-1 text-[10px] font-bold shadow-2xs"
            title="Share status to WhatsApp"
          >
            <WhatsAppIcon className="w-3 h-3 fill-emerald-600 dark:fill-emerald-400 shrink-0" />
            <span>Share</span>
          </button>
        );
      },
    },
  ], [activeTrips]);

  return (
    <TooltipProvider>
      <DashboardLayout active="Dashboard" title="Dashboard" hideBackButton fixedViewport={dashboardViewMode === 'collapsed'}>
        <div className={cn("px-4 sm:px-6 lg:px-8 pb-4 h-full flex flex-col gap-4 animate-fade-in", dashboardViewMode === 'collapsed' && "overflow-hidden flex-1 justify-between pb-2")}>

          {/* ── Page Subheader / Context Bar ─────────────────────────────── */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-1 pb-1 border-b border-black/[0.04]">
            {/* Left: Greeting & Module Badge */}
            <div className="flex items-center gap-2.5">
              <h1 className="text-[17px] font-extrabold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
                <Activity className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span>{greeting}, <span className="text-slate-900 dark:text-slate-100">{userName}</span></span>
              </h1>
              {isAdmin ? (
                <Badge className="bg-[#EEF2FF] text-[#4F46E5] border-[#C7D2FE] font-semibold text-[10px] px-2.5 py-0.5 rounded-full">
                  Admin Module
                </Badge>
              ) : (
                <Badge className="bg-[#ECFDF5] text-[#059669] border-[#A7F3D0] font-semibold text-[10px] px-2.5 py-0.5 rounded-full">
                  Operator Module
                </Badge>
              )}
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2">
              <Button
                onClick={() => navigate('/trips/new')}
                className="h-8 gap-1.5 px-3.5 bg-brand hover:bg-brand-hover text-white text-xs font-extrabold rounded-lg shadow-sm transition-all active:scale-[0.97]"
              >
                New Trip
              </Button>

              {/* More Actions Dropdown Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1 text-xs font-bold border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                    title="More Actions"
                  >
                    <span>More</span>
                    <ChevronDown className="h-3 w-3 text-slate-400" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52 p-1.5 shadow-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl z-50">
                  <DropdownMenuLabel className="text-[10px] font-bold tracking-wider uppercase text-slate-400 px-2 py-1">
                    Quick Workflows
                  </DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => navigate('/vehicles/new')} className="cursor-pointer text-xs font-semibold py-1.5 px-2 rounded-md">
                    <Truck className="w-3.5 h-3.5 mr-2 text-blue-600" /> Register Vehicle
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/drivers/new')} className="cursor-pointer text-xs font-semibold py-1.5 px-2 rounded-md">
                    <Users className="w-3.5 h-3.5 mr-2 text-emerald-600" /> Onboard Driver
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="my-1 bg-slate-200/50 dark:bg-slate-800" />
                  <DropdownMenuItem onClick={() => navigate('/quotations/new')} className="cursor-pointer text-xs font-semibold py-1.5 px-2 rounded-md">
                    <FileText className="w-3.5 h-3.5 mr-2 text-brand" /> Create Rate Card
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/invoices/new')} className="cursor-pointer text-xs font-semibold py-1.5 px-2 rounded-md">
                    <Receipt className="w-3.5 h-3.5 mr-2 text-purple-600" /> Generate Invoice
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/documents')}
                className="h-8 gap-1.5 text-xs font-semibold border-slate-200 bg-white shadow-2xs text-slate-700 hover:bg-slate-50"
              >
                <FileText className="w-3.5 h-3.5 text-slate-500" /> Add Document
              </Button>
            </div>
          </div>

          {/* ── TOP ROW: live fleet map + the operator's inbox ─────────── */}
          <div className="flex flex-col lg:flex-row gap-4 items-stretch transition-all duration-300 ease-in-out">

            {/* 1. Live fleet map — every truck and on-trip driver */}
            <div className={cn("flex-1 min-w-0 rounded-[18px] border border-black/[0.06] shadow-sm overflow-hidden transition-all duration-300 ease-in-out", dashboardViewMode === 'collapsed' ? "h-[calc(100vh-325px)] min-h-[300px] max-h-[365px]" : "h-[390px] max-h-[390px]")}>
              <FleetCommandMap focusTripId={mapFocus?.tripId} focusNonce={mapFocus?.nonce} />
            </div>

            {/* 2. Inbox — driver updates to forward, document expiries, alerts */}
            <div className={cn("w-full lg:w-[40%] xl:w-[38%] shrink-0 transition-all duration-300 ease-in-out", dashboardViewMode === 'collapsed' ? "h-[calc(100vh-325px)] min-h-[300px] max-h-[365px]" : "h-[390px] max-h-[390px]")}>
              <OperatorInbox trips={rawTrips} onFocusTrip={(tripId) => setMapFocus((f) => ({ tripId, nonce: (f?.nonce ?? 0) + 1 }))} />
            </div>

          </div>

          {/* ── BOTTOM ROW: Active Transit Fleet (Kanban Board by default with Ledger switch) ──── */}
          <div className="w-full flex flex-col bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 shadow-sm gap-4">
            
            {/* Header Control Bar (All filters & actions right-aligned) */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              
              {/* Left: Title + Pill Counter */}
              <div className="flex items-center gap-2.5 shrink-0">
                <Truck className="w-5 h-5 text-orange-500 dark:text-orange-400 shrink-0" />
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                    Active Transit Fleet
                  </h2>
                  <span className="font-mono text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full border border-slate-200/70 dark:border-slate-700/70">
                    {dashboardViewMode === 'kanban' ? filteredTripsForKanban.length : filteredActiveTrips.length} {((dashboardViewMode === 'kanban' ? filteredTripsForKanban.length : filteredActiveTrips.length) === 1) ? 'trip' : 'trips'}
                  </span>
                </div>
              </div>

              {/* Right: Filters & Action Group */}
              <div className="flex flex-wrap items-center justify-end gap-2 ml-auto">
                
                {/* Search Input */}
                <div className="relative min-w-[170px] sm:min-w-[210px]">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    type="text"
                    value={tripSearch}
                    onChange={(e) => setTripSearch(e.target.value)}
                    placeholder="Search trip ID, driver, vehicle..."
                    className="h-8 pl-8 pr-7 text-xs font-medium border-slate-200/90 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 rounded-lg focus-visible:ring-brand"
                  />
                  {tripSearch && (
                    <button
                      onClick={() => setTripSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Compact Highlighted Company Filter Button */}
                <div
                  className={`flex items-center gap-1 rounded-lg px-2 py-0.5 shadow-2xs transition-all ${
                    selectedCompany !== 'all'
                      ? 'bg-orange-50 dark:bg-orange-950/50 border border-orange-300 dark:border-orange-700/80 text-brand'
                      : 'bg-slate-100 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 text-slate-700 dark:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60'
                  }`}
                >
                  <Building2
                    className={`w-3.5 h-3.5 shrink-0 ${
                      selectedCompany !== 'all' ? 'text-brand' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  />
                  <Select
                    value={selectedCompany}
                    onValueChange={(val) => {
                      setSelectedCompany(val);
                      setTripSearch('');
                    }}
                  >
                    <SelectTrigger
                      className={`h-7 text-xs border-0 bg-transparent shadow-none px-1 focus:ring-0 focus:ring-offset-0 truncate cursor-pointer ${
                        selectedCompany !== 'all'
                          ? 'font-extrabold text-brand dark:text-orange-400 max-w-[140px]'
                          : 'font-semibold text-slate-700 dark:text-slate-200 max-w-[110px]'
                      }`}
                    >
                      <SelectValue placeholder="Company">
                        {selectedCompany === 'all' ? 'Company' : selectedCompany}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="max-h-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl rounded-xl">
                      <SelectItem value="all" className="text-xs font-bold text-brand cursor-pointer">
                        All Companies (Show All)
                      </SelectItem>
                      {companyOptions.map(([name, tripCount]) => (
                        <SelectItem key={name} value={name} className="text-xs cursor-pointer">
                          <span className="font-semibold">{name}</span>
                          {tripCount > 0 && (
                            <span className="ml-1.5 text-[10px] text-slate-400 font-mono">
                              ({tripCount})
                            </span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {selectedCompany !== 'all' && (
                    <button
                      type="button"
                      onClick={() => setSelectedCompany('all')}
                      className="p-0.5 -mr-0.5 rounded-full hover:bg-orange-200/80 dark:hover:bg-orange-900 text-orange-600 dark:text-orange-300 transition-colors cursor-pointer"
                      title="Clear company filter"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Active Status Filter Dropdown (Only in Kanban/Collapsed mode) */}
                {(dashboardViewMode === 'kanban' || dashboardViewMode === 'collapsed') && (
                  <div
                    className={`flex items-center gap-1 rounded-lg px-2 py-0.5 shadow-2xs transition-all ${
                      selectedStatusFilter !== 'all'
                        ? 'bg-orange-50 dark:bg-orange-950/50 border border-orange-300 dark:border-orange-700/80 text-brand'
                        : 'bg-slate-100 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 text-slate-700 dark:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60'
                    }`}
                  >
                    <Filter
                      className={`w-3.5 h-3.5 shrink-0 ${
                        selectedStatusFilter !== 'all' ? 'text-brand' : 'text-slate-500 dark:text-slate-400'
                      }`}
                    />
                    <Select
                      value={selectedStatusFilter}
                      onValueChange={(val) => setSelectedStatusFilter(val)}
                    >
                      <SelectTrigger
                        className={`h-7 text-xs border-0 bg-transparent shadow-none px-1 focus:ring-0 focus:ring-offset-0 truncate cursor-pointer ${
                          selectedStatusFilter !== 'all'
                            ? 'font-extrabold text-brand dark:text-orange-400 max-w-[150px]'
                            : 'font-semibold text-slate-700 dark:text-slate-200 max-w-[120px]'
                        }`}
                      >
                        <SelectValue placeholder="Status">
                          {selectedStatusFilter === 'all'
                            ? 'All Statuses'
                            : selectedStatusFilter === 'Scheduled' || selectedStatusFilter === 'Draft' || selectedStatusFilter === 'Dispatched'
                            ? 'Scheduled'
                            : selectedStatusFilter === 'AtPickup' || selectedStatusFilter === 'Loading'
                            ? 'Loading'
                            : selectedStatusFilter === 'InTransit'
                            ? 'In Transit'
                            : selectedStatusFilter === 'Emergency'
                            ? 'Emergency'
                            : selectedStatusFilter === 'AtDelivery' || selectedStatusFilter === 'Completed'
                            ? 'Completed'
                            : selectedStatusFilter === 'Delayed'
                            ? 'Delayed'
                            : selectedStatusFilter}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="max-h-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl rounded-xl">
                        <SelectItem value="all" className="text-xs font-bold text-brand cursor-pointer">
                          All Active Statuses
                        </SelectItem>
                        <SelectItem value="Scheduled" className="text-xs font-semibold cursor-pointer">
                          Scheduled
                        </SelectItem>
                        <SelectItem value="Loading" className="text-xs font-semibold cursor-pointer">
                          Loading
                        </SelectItem>
                        <SelectItem value="InTransit" className="text-xs font-semibold cursor-pointer">
                          In Transit
                        </SelectItem>
                        <SelectItem value="Emergency" className="text-xs font-semibold cursor-pointer">
                          Emergency
                        </SelectItem>
                        <SelectItem value="Completed" className="text-xs font-semibold cursor-pointer">
                          Completed
                        </SelectItem>
                        <SelectItem value="Delayed" className="text-xs font-semibold cursor-pointer">
                          Delayed
                        </SelectItem>
                      </SelectContent>
                    </Select>

                    {selectedStatusFilter !== 'all' && (
                      <button
                        type="button"
                        onClick={() => setSelectedStatusFilter('all')}
                        className="p-0.5 -mr-0.5 rounded-full hover:bg-orange-200/80 dark:hover:bg-orange-900 text-orange-600 dark:text-orange-300 transition-colors cursor-pointer"
                        title="Clear status filter"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}

                {/* View Switcher (Kanban Board | Ledger) */}
                <div className="bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg flex items-center border border-slate-200/80 dark:border-slate-700 shadow-2xs shrink-0">
                  <button
                    type="button"
                    onClick={() => setDashboardViewMode('kanban')}
                    className={`px-2.5 py-1 rounded-md text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                      dashboardViewMode === 'kanban'
                        ? 'bg-white dark:bg-slate-900 text-brand shadow-xs'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                    title="Kanban Full Board View"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>Board</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDashboardViewMode('ledger')}
                    className={`px-2.5 py-1 rounded-md text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                      dashboardViewMode === 'ledger'
                        ? 'bg-white dark:bg-slate-900 text-brand shadow-xs'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                    title="Ledger Table View"
                  >
                    <List className="w-3.5 h-3.5" />
                    <span>Ledger</span>
                  </button>
                </div>

              </div>

            </div>

            {/* View Canvas Body */}
            {dashboardViewMode === 'kanban' || dashboardViewMode === 'collapsed' ? (
              <div className={cn("w-full flex-1 flex flex-col transition-all duration-300", dashboardViewMode === 'collapsed' ? "min-h-[145px] max-h-[160px]" : "min-h-[460px]")}>
                <TripKanbanBoard
                  trips={filteredTripsForKanban}
                  collapsed={dashboardViewMode === 'collapsed'}
                  statusFilter={selectedStatusFilter !== 'all' ? selectedStatusFilter : undefined}
                  onStatusChange={handleKanbanStatusChange}
                  onShareWhatsapp={handleOpenWhatsappTrip}
                  onOpenSettlement={(trip) => setSettlementModalTrip(trip)}
                  onCreateTrip={() => navigate('/trips/new')}
                  isLoading={isTripsLoading}
                  isError={isTripsError}
                  onRetry={() => refetchTrips()}
                />
              </div>
            ) : (
              <div className="w-full flex flex-col min-h-[440px]">
                <DataTable
                  title={null}
                  columns={tripLedgerColumns}
                  data={filteredActiveTrips}
                  enableSelection={false}
                  compact={false}
                  pageSize={10}
                  pageSizeOptions={[10, 25, 50, 100]}
                  onRowClick={(row) => navigate(`/trips/${row.rawId || row.id}`)}
                  emptyTitle={
                    selectedCompany !== 'all'
                      ? `No active trips for ${selectedCompany}`
                      : 'No active trips found'
                  }
                  emptyMessage={
                    selectedCompany !== 'all'
                      ? `There are currently no active dispatch records for ${selectedCompany}.`
                      : 'There are currently no active dispatch records in transit or loading.'
                  }
                  className="min-h-[440px] flex flex-col justify-between shadow-none border-0"
                />
              </div>
            )}

          </div>

        </div>

        {/* ── Universal Export Modal ─────────────────────────────────── */}
        <ExportModal
          isOpen={isExportOpen}
          onClose={() => setIsExportOpen(false)}
          title="Export Active Transit Fleet"
          description="Choose your export preferences, filters, and columns."
          fileNamePrefix="active_transit_fleet"
          sheetName="Transit Fleet"
          subtitle={
            selectedCompany !== 'all'
              ? `Filtered by Company: ${selectedCompany}`
              : 'MERCON Logistics Active Transit Fleet'
          }
          filteredData={dashboardViewMode === 'kanban' ? filteredTripsForKanban : filteredActiveTrips}
          allData={dashboardViewMode === 'kanban' ? baseTripsForKanban : activeTrips}
          totalCount={dashboardViewMode === 'kanban' ? baseTripsForKanban.length : activeTrips.length}
          columns={DASHBOARD_EXPORT_COLUMNS}
          formats={['xlsx', 'csv', 'pdf']}
        />

        {/* ── Interactive WhatsApp Status Preview & Dispatcher Modal ── */}
        <WhatsappShareModal
          isOpen={isWhatsappOpen}
          onClose={() => setIsWhatsappOpen(false)}
          mode={whatsappMode}
          trips={dashboardViewMode === 'kanban' ? filteredTripsForKanban : filteredActiveTrips}
          selectedTrip={whatsappSelectedTrip}
          selectedCompany={whatsappSelectedCompany}
        />

        {/* ── Status Transition Confirmation Modal ──────────────────────────── */}
        <ConfirmModal
          isOpen={statusConfirmModal.isOpen}
          onClose={() => setStatusConfirmModal((prev) => ({ ...prev, isOpen: false }))}
          onConfirm={handleConfirmKanbanStatusChange}
          title={statusConfirmModal.title}
          message={statusConfirmModal.message}
          confirmLabel={statusConfirmModal.confirmLabel}
          isLoading={statusConfirmModal.isLoading}
        />

        {/* ── Post-Trip Financial Settlement & Extra Charges Modal ─────────── */}
        <PostTripSettlementModal
          isOpen={!!settlementModalTrip}
          onClose={() => setSettlementModalTrip(null)}
          trip={settlementModalTrip}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['dashboard-trips'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
            queryClient.invalidateQueries({ queryKey: ['trips'] });
            toast.success('Financial settlement & charges updated successfully');
          }}
        />

        {/* ── Quick Dispatch Resource Assignment Modal ─────────────────────── */}
        <QuickAssignModal
          isOpen={!!quickAssignTrip}
          onClose={() => setQuickAssignTrip(null)}
          trip={quickAssignTrip}
        />

      </DashboardLayout>
    </TooltipProvider>
  );
}

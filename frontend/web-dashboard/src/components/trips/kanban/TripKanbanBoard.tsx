import { useState, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  Clock,
  Send,
  MapPin,
  Truck,
  CheckCircle2,
  FileText,
  XCircle,
  Search,
  Plus,
  ArrowUpDown,
  Filter,
  ChevronLeft,
  ChevronRight,
  MoveHorizontal,
  Layers,
  ZoomIn,
  ZoomOut,
  AlertTriangle,
  Siren,
  Maximize2,
  ArrowLeft,
  X,
} from 'lucide-react';
import { Trip, TripStatus, TripStop } from '@/services/tripService';
import { openMultipleWhatsappMessages } from '@/utils/whatsappFormatter';
import TripKanbanCard from './TripKanbanCard';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
export interface TripKanbanBoardRef {
  scroll: (direction: 'left' | 'right') => void;
}

export interface TripKanbanBoardProps {
  trips: Trip[];
  onStatusChange: (trip: Trip, newStatus: TripStatus) => void;
  onLogDelay?: (trip: Trip) => void;
  onShareWhatsapp?: (trip: Trip) => void;
  onDelete?: (trip: Trip) => void;
  onOpenSettlement?: (trip: Trip) => void;
  onCreateTrip?: () => void;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  zoomLevel?: 'fit' | 'normal' | 'in';
  statusFilter?: string;
  focusedStage?: string | null;
  onStageFocusChange?: (stage: string | null) => void;
  collapsed?: boolean;
}

interface ColumnConfig {
  id: TripStatus | 'Delayed';
  label: string;
  icon: any;
  accentColor: string;
  dotColor: string;
  badgeClass: string;
  columnBg: string;
  headerBg: string;
  headerBorder: string;
  emptyBg: string;
  emptyIconBg: string;
  showMoreClass: string;
}

const COLUMNS: ColumnConfig[] = [
  {
    id: 'Draft',
    label: 'Scheduled',
    icon: Clock,
    accentColor: 'text-indigo-600 dark:text-indigo-400',
    dotColor: 'bg-indigo-500',
    badgeClass: 'bg-indigo-100/90 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300 border-indigo-200/90 dark:border-indigo-700/60',
    columnBg: 'bg-indigo-50/45 dark:bg-indigo-950/25 border-indigo-200/80 dark:border-indigo-900/50',
    headerBg: 'bg-indigo-100/50 dark:bg-indigo-950/60',
    headerBorder: 'border-indigo-200/80 dark:border-indigo-800/60',
    emptyBg: 'border-indigo-200/70 dark:border-indigo-900/50 bg-white/60 dark:bg-indigo-950/30',
    emptyIconBg: 'bg-indigo-50 dark:bg-indigo-900/40 border-indigo-200/90 dark:border-indigo-800',
    showMoreClass: 'border-indigo-200/90 hover:border-indigo-300 bg-white hover:bg-indigo-50/60 text-indigo-700 dark:bg-slate-900 dark:hover:bg-slate-800 dark:text-indigo-300',
  },
  {
    id: 'Loading',
    label: 'Loading',
    icon: MapPin,
    accentColor: 'text-sky-600 dark:text-sky-400',
    dotColor: 'bg-sky-500',
    badgeClass: 'bg-sky-100/90 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300 border-sky-200/90 dark:border-sky-700/60',
    columnBg: 'bg-sky-50/45 dark:bg-sky-950/25 border-sky-200/80 dark:border-sky-900/50',
    headerBg: 'bg-sky-100/50 dark:bg-sky-950/60',
    headerBorder: 'border-sky-200/80 dark:border-sky-800/60',
    emptyBg: 'border-sky-200/70 dark:border-sky-900/50 bg-white/60 dark:bg-sky-950/30',
    emptyIconBg: 'bg-sky-50 dark:bg-sky-900/40 border-sky-200/90 dark:border-sky-800',
    showMoreClass: 'border-sky-200/90 hover:border-sky-300 bg-white hover:bg-sky-50/60 text-sky-700 dark:bg-slate-900 dark:hover:bg-slate-800 dark:text-sky-300',
  },
  {
    id: 'InTransit',
    label: 'In Transit',
    icon: Truck,
    accentColor: 'text-amber-600 dark:text-amber-400',
    dotColor: 'bg-amber-500',
    badgeClass: 'bg-amber-100/90 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 border-amber-200/90 dark:border-amber-700/60',
    columnBg: 'bg-amber-50/45 dark:bg-amber-950/25 border-amber-200/80 dark:border-amber-900/50',
    headerBg: 'bg-amber-100/50 dark:bg-amber-950/60',
    headerBorder: 'border-amber-200/80 dark:border-amber-800/60',
    emptyBg: 'border-amber-200/70 dark:border-amber-900/50 bg-white/60 dark:bg-amber-950/30',
    emptyIconBg: 'bg-amber-50 dark:bg-amber-900/40 border-amber-200/90 dark:border-amber-800',
    showMoreClass: 'border-amber-200/90 hover:border-amber-300 bg-white hover:bg-amber-50/60 text-amber-800 dark:bg-slate-900 dark:hover:bg-slate-800 dark:text-amber-300',
  },
  {
    id: 'Delayed',
    label: 'Delayed',
    icon: AlertTriangle,
    accentColor: 'text-rose-600 dark:text-rose-400',
    dotColor: 'bg-rose-500',
    badgeClass: 'bg-rose-100/90 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300 border-rose-200/90 dark:border-rose-700/60',
    columnBg: 'bg-rose-50/45 dark:bg-rose-950/25 border-rose-200/80 dark:border-rose-900/50',
    headerBg: 'bg-rose-100/50 dark:bg-rose-950/60',
    headerBorder: 'border-rose-200/80 dark:border-rose-800/60',
    emptyBg: 'border-rose-200/70 dark:border-rose-900/50 bg-white/60 dark:bg-rose-950/30',
    emptyIconBg: 'bg-rose-50 dark:bg-rose-900/40 border-rose-200/90 dark:border-rose-800',
    showMoreClass: 'border-rose-200/90 hover:border-rose-300 bg-white hover:bg-rose-50/60 text-rose-700 dark:bg-slate-900 dark:hover:bg-slate-800 dark:text-rose-300',
  },
  {
    id: 'Completed',
    label: 'Completed',
    icon: CheckCircle2,
    accentColor: 'text-emerald-600 dark:text-emerald-400',
    dotColor: 'bg-emerald-500',
    badgeClass: 'bg-emerald-100/90 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300 border-emerald-200/90 dark:border-emerald-700/60',
    columnBg: 'bg-emerald-50/45 dark:bg-emerald-950/25 border-emerald-200/80 dark:border-emerald-900/50',
    headerBg: 'bg-emerald-100/50 dark:bg-emerald-950/60',
    headerBorder: 'border-emerald-200/80 dark:border-emerald-800/60',
    emptyBg: 'border-emerald-200/70 dark:border-emerald-900/50 bg-white/60 dark:bg-emerald-950/30',
    emptyIconBg: 'bg-emerald-50 dark:bg-emerald-900/40 border-emerald-200/90 dark:border-emerald-800',
    showMoreClass: 'border-emerald-200/90 hover:border-emerald-300 bg-white hover:bg-emerald-50/60 text-emerald-700 dark:bg-slate-900 dark:hover:bg-slate-800 dark:text-emerald-300',
  },
];

const EMERGENCY_COLUMN: ColumnConfig = {
  id: 'Emergency' as any,
  label: 'Emergency',
  icon: Siren,
  accentColor: 'text-red-700 dark:text-red-400',
  dotColor: 'bg-red-600',
  badgeClass: 'bg-red-100/90 text-red-800 dark:bg-red-900/60 dark:text-red-300 border-red-200/90 dark:border-red-700/60',
  columnBg: 'bg-red-50/45 dark:bg-red-950/25 border-red-200/80 dark:border-red-900/50',
  headerBg: 'bg-red-100/50 dark:bg-red-950/60',
  headerBorder: 'border-red-200/80 dark:border-red-800/60',
  emptyBg: 'border-red-200/70 dark:border-red-900/50 bg-white/60 dark:bg-red-950/30',
  emptyIconBg: 'bg-red-50 dark:bg-red-900/40 border-red-200/90 dark:border-red-800',
  showMoreClass: 'border-red-200/90 hover:border-red-300 bg-white hover:bg-red-50/60 text-red-800 dark:bg-slate-900 dark:hover:bg-slate-800 dark:text-red-300',
};

const isUuidVal = (str?: string | null) => str ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim()) : false;

const stopLabel = (stop: TripStop | undefined) => {
  if (!stop) return '—';
  const code = stop.location?.codes?.[0] || (stop.location as any)?.code;
  const rawName = !isUuidVal(stop.location_name) ? stop.location_name : null;
  const name = code || rawName || stop.location?.name || stop.location_address || stop.location?.address || '—';
  return name.replace(/🔁\s*/g, '').trim();
};

const getRouteName = (trip: Trip) => {
  const pickup = trip.stops?.find((s) => s.stop_type === 'Pickup') || trip.stops?.[0];
  const dropoff = trip.stops?.find((s) => s.stop_type === 'Dropoff') || (trip.stops && trip.stops.length > 1 ? trip.stops[trip.stops.length - 1] : undefined);
  return `${stopLabel(pickup)} → ${stopLabel(dropoff)}`;
};

const TripKanbanBoard = forwardRef<TripKanbanBoardRef, TripKanbanBoardProps>(function TripKanbanBoard(
  {
    trips,
    onStatusChange,
    onLogDelay,
    onShareWhatsapp,
    onDelete,
    onOpenSettlement,
    onCreateTrip,
    isLoading,
    isError,
    onRetry,
    zoomLevel = 'fit',
    statusFilter,
    focusedStage: focusedStageProp,
    onStageFocusChange,
    collapsed = false,
  },
  ref
) {
  const [internalFocusedStage, setInternalFocusedStage] = useState<string | null>(null);
  const [stageSearchTerm, setStageSearchTerm] = useState<string>('');

  const activeFocusedStage = focusedStageProp !== undefined ? focusedStageProp : internalFocusedStage;

  const setFocusedStage = (stage: string | null) => {
    if (onStageFocusChange) {
      onStageFocusChange(stage);
    }
    setInternalFocusedStage(stage);
    setStageSearchTerm('');
  };

  const [dragOverColumn, setDragOverColumn] = useState<TripStatus | 'Delayed' | null>(null);
  const [columnSearch, setColumnSearch] = useState<Record<string, string>>({});
  const [visibleLimits, setVisibleLimits] = useState<Record<string, number>>({});
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [selectedTripIds, setSelectedTripIds] = useState<string[]>([]);
  const [activeSelectionColumn, setActiveSelectionColumn] = useState<string | null>(null);
  const [companySelectionModalCol, setCompanySelectionModalCol] = useState<string | null>(null);
  const [isBulkShareOpen, setIsBulkShareOpen] = useState(false);

  const handleToggleSelect = (trip: Trip) => {
    setSelectedTripIds((prev) => 
      prev.includes(trip.id) ? prev.filter(id => id !== trip.id) : [...prev, trip.id]
    );
  };

  const handleToggleColumnSelection = (colId: string) => {
    if (activeSelectionColumn === colId) {
      setActiveSelectionColumn(null);
      setSelectedTripIds([]);
    } else {
      setActiveSelectionColumn(colId);
      setSelectedTripIds([]);
      setCompanySelectionModalCol(colId);
    }
  };

  const handleClearSelection = () => {
    setSelectedTripIds([]);
    setActiveSelectionColumn(null);
    setCompanySelectionModalCol(null);
  };

  const renderedColumns = useMemo(() => {
    if (statusFilter === 'Emergency') {
      return [EMERGENCY_COLUMN];
    }
    return COLUMNS;
  }, [statusFilter]);

  // Group trips by column category
  const groupedTrips = useMemo(() => {
    const map: Record<string, Trip[]> = {
      Draft: [],
      Scheduled: [],
      Loading: [],
      Dispatched: [],
      AtPickup: [],
      InTransit: [],
      AtDelivery: [],
      Completed: [],
      Invoiced: [],
      Cancelled: [],
      Delayed: [],
      Emergency: [],
    };

    const nowMs = Date.now();

    const sortedTrips = [...trips].sort((a, b) => {
      const timeA = a.planned_start ? new Date(a.planned_start).getTime() : Infinity;
      const timeB = b.planned_start ? new Date(b.planned_start).getTime() : Infinity;
      if (timeA !== timeB) return timeA - timeB;
      const createdA = new Date(a.createdAt || (a as any).created_at || 0).getTime();
      const createdB = new Date(b.createdAt || (b as any).created_at || 0).getTime();
      return createdB - createdA;
    });

    sortedTrips.forEach((t) => {
      // 1. Check if the trip is an emergency
      if ((t.status as string) === 'Emergency' || (t as any).isEmergency) {
        if (statusFilter === 'Emergency') {
          map.Emergency.push(t);
        } else {
          map.Delayed.push(t);
        }
        return;
      }

      // 2. Check if the trip is active and overdue (delayed)
      const isDelayed =
        ['Scheduled', 'Loading', 'InTransit', 'AtPickup', 'Dispatched', 'AtDelivery'].includes(t.status as string) &&
        t.planned_end != null &&
        new Date(t.planned_end).getTime() < nowMs;

      if (isDelayed || (t.status as string) === 'Delayed') {
        map.Delayed.push(t);
      } else if (t.status === 'Draft' || (t.status as string) === 'Scheduled' || t.status === 'Dispatched' || t.status === 'Cancelled') {
        map.Draft.push(t); // Scheduled Column
      } else if (t.status === 'AtPickup' || (t.status as string) === 'Loading') {
        map.Loading.push(t); // Loading Column
      } else if (t.status === 'InTransit') {
        map.InTransit.push(t); // In Transit Column
      } else if (t.status === 'AtDelivery' || t.status === 'Completed' || t.status === 'Invoiced') {
        map.Completed.push(t); // Completed Column
      } else {
        map.Draft.push(t);
      }
    });

    return map;
  }, [trips]);

  const handleDragOver = (e: React.DragEvent, colId: TripStatus | 'Delayed') => {
    if (colId === 'Delayed') return; // Read-only calculated column
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColumn !== colId) {
      setDragOverColumn(colId);
    }
  };

  const handleDragLeave = (colId: TripStatus | 'Delayed') => {
    if (dragOverColumn === colId) {
      setDragOverColumn(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetStatus: TripStatus | 'Delayed') => {
    e.preventDefault();
    setDragOverColumn(null);
    if (targetStatus === 'Delayed') return; // Read-only calculated column
    const tripId = e.dataTransfer.getData('text/plain');
    if (!tripId) return;

    const trip = trips.find((t) => t.id === tripId);
    if (trip && trip.status !== targetStatus) {
      onStatusChange(trip, targetStatus);
    }
  };

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = direction === 'left' ? -350 : 350;
      scrollContainerRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  useImperativeHandle(ref, () => ({
    scroll,
  }));

  const handleWheel = (e: React.WheelEvent) => {
    if (scrollContainerRef.current && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      scrollContainerRef.current.scrollLeft += e.deltaY;
    }
  };

  const columnWidthClass =
    zoomLevel === 'fit'
      ? 'flex-1 min-w-[240px]'
      : zoomLevel === 'normal'
      ? 'w-[290px] min-w-[290px] max-w-[290px]'
      : 'w-[360px] min-w-[360px] max-w-[360px]';

  const cardDensity =
    zoomLevel === 'fit' ? 'compact' : zoomLevel === 'normal' ? 'normal' : 'expanded';

  if (activeFocusedStage) {
    const focusCol = COLUMNS.find((c) => c.id === activeFocusedStage) || COLUMNS.find((c) => c.id === 'InTransit') || COLUMNS[0];
    const FocusIcon = focusCol.icon;
    const rawFocusTrips = groupedTrips[focusCol.id] || [];
    const filterTerm = stageSearchTerm.toLowerCase().trim();

    const focusTrips = filterTerm
      ? rawFocusTrips.filter(
          (t) =>
            t.ref_id.toLowerCase().includes(filterTerm) ||
            (t.customer?.name && t.customer.name.toLowerCase().includes(filterTerm)) ||
            (t.driver && `${t.driver.first_name} ${t.driver.last_name}`.toLowerCase().includes(filterTerm)) ||
            (t.vehicle?.plate_number && t.vehicle.plate_number.toLowerCase().includes(filterTerm))
        )
      : rawFocusTrips;

    return (
      <div className={cn('w-full h-full flex flex-col min-h-0 rounded-2xl border transition-all shadow-xs overflow-hidden', focusCol.columnBg)}>
        {/* Stage Focus Top Header Banner */}
        <div className={cn('px-4 py-3 rounded-t-2xl border-b backdrop-blur-xs flex flex-wrap items-center justify-between gap-3 shrink-0', focusCol.headerBg, focusCol.headerBorder)}>
          {/* Left: Back Button & Stage Title */}
          <div className="flex items-center gap-3 min-w-0">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setFocusedStage(null)}
              className="h-8 gap-1.5 text-xs font-bold bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-2xs rounded-xl cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-slate-500" />
              <span>Full Board</span>
            </Button>

            <div className="h-4 w-px bg-slate-300 dark:bg-slate-700 shrink-0" />

            <div className="flex items-center gap-2 min-w-0">
              <div className={cn('w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-white dark:ring-slate-900', focusCol.dotColor)} />
              <FocusIcon size={16} className={focusCol.accentColor} />
              <h2 className="font-extrabold text-sm text-slate-900 dark:text-slate-100 tracking-tight">
                {focusCol.label}
              </h2>
              <span className={cn('font-mono text-[11px] font-bold px-2 py-0.5 rounded-full border shrink-0', focusCol.badgeClass)}>
                {rawFocusTrips.length} {rawFocusTrips.length === 1 ? 'Trip' : 'Trips'}
              </span>
            </div>
          </div>

          {/* Right: Quick Stage Navigation Pills Bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {COLUMNS.map((c) => {
              const isActive = c.id === activeFocusedStage;
              const count = (groupedTrips[c.id] || []).length;
              const CIcon = c.icon;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setFocusedStage(c.id)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 border transition-all cursor-pointer shrink-0',
                    isActive
                      ? c.badgeClass + ' font-extrabold shadow-3xs'
                      : 'bg-white/70 dark:bg-slate-900/70 border-slate-200/80 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-900'
                  )}
                >
                  <CIcon className={cn('w-3.5 h-3.5', c.accentColor)} />
                  <span>{c.label}</span>
                  <span className="font-mono text-[10px] font-bold opacity-80">({count})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* In-Stage Search Bar */}
        <div className="px-4 py-2 bg-white/80 dark:bg-slate-900/80 border-b border-slate-200/70 dark:border-slate-800 flex items-center gap-3 shrink-0">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <Input
              placeholder={`Filter ${focusCol.label} trips by ID, driver, vehicle...`}
              value={stageSearchTerm}
              onChange={(e) => setStageSearchTerm(e.target.value)}
              className="pl-8 h-7 text-[11px] bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 font-semibold"
            />
            {stageSearchTerm && (
              <button onClick={() => setStageSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden sm:inline">
            {focusTrips.length} of {rawFocusTrips.length} trips shown
          </span>
        </div>

        {/* Compact Table View Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
          {isLoading ? (
            <div className="p-4 flex flex-col gap-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-10 rounded-lg bg-white/60 dark:bg-slate-800/60 animate-pulse border border-slate-200/50" />
              ))}
            </div>
          ) : focusTrips.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <FocusIcon size={36} className={cn('mb-2.5 opacity-50', focusCol.accentColor)} />
              <h3 className="text-sm font-extrabold text-slate-700 dark:text-slate-300">No {focusCol.label} Trips</h3>
              <p className="text-xs text-slate-400 max-w-xs mt-1">
                {stageSearchTerm ? 'No trips match your search term in this stage.' : `There are currently no trips in the ${focusCol.label} stage.`}
              </p>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-b border-slate-200/80 dark:border-slate-800">
                  <th className="text-left px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-[90px]">Trip ID</th>
                  <th className="text-left px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Customer</th>
                  <th className="text-left px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Route</th>
                  <th className="text-left px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Driver</th>
                  <th className="text-left px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Vehicle</th>
                  <th className="text-left px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-[60px]">Rate</th>
                </tr>
              </thead>
              <tbody>
                {focusTrips.map((trip) => {
                  const route = getRouteName(trip);
                  const driverName = trip.is_third_party
                    ? (trip.third_party_driver_name || trip.thirdPartyProvider?.name || '3PL')
                    : trip.driver
                    ? `${trip.driver.first_name || ''} ${trip.driver.last_name || ''}`.trim()
                    : '—';
                  const vehicleInfo = trip.vehicle
                    ? `${trip.vehicle.plate_number || ''}${trip.vehicle.capacity_kg ? ` · ${(trip.vehicle.capacity_kg / 1000).toFixed(0)} TON` : ''}`
                    : trip.is_third_party
                    ? (trip.third_party_vehicle_plate || '3PL Vehicle')
                    : '—';
                  const tripRate = trip.billing_amount ?? trip.applied_rate;
                  const rate = tripRate != null ? `${Number(tripRate).toLocaleString()} SAR` : '—';

                  return (
                    <tr
                      key={trip.id}
                      onClick={() => window.open(`/trips/${trip.id}`, '_self')}
                      className="border-b border-slate-100/80 dark:border-slate-800/60 hover:bg-white/80 dark:hover:bg-slate-800/50 cursor-pointer transition-colors group"
                    >
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-xs font-bold text-brand">{trip.ref_id || 'Draft'}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="font-semibold text-xs text-slate-800 dark:text-slate-200 truncate max-w-[140px] block">
                          {trip.customer?.name || <span className="text-slate-400 italic">Unassigned</span>}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate max-w-[200px] block">
                          {route}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {trip.is_third_party && (
                            <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 shrink-0">3PL</span>
                          )}
                          <span className="font-semibold text-xs text-slate-700 dark:text-slate-300 truncate">{driverName}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="font-mono text-[11px] font-medium text-slate-600 dark:text-slate-400 truncate max-w-[130px] block">
                          {vehicleInfo}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-300">{rate}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  if (collapsed) {
    return (
      <div className="w-full h-full min-h-[145px] max-h-[160px] flex flex-col justify-center overflow-hidden animate-fade-in">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 h-full">
          {renderedColumns.map((col) => {
            const Icon = col.icon;
            const colTrips = groupedTrips[col.id] || [];

            return (
              <div
                key={col.id}
                className={cn(
                  'flex flex-col rounded-xl border p-2.5 transition-all shadow-2xs h-[145px] overflow-hidden',
                  col.columnBg
                )}
              >
                {/* Stage Header */}
                <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-slate-200/60 dark:border-slate-800 shrink-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Icon size={13} className={cn('shrink-0', col.accentColor)} />
                    <span className="font-extrabold text-xs text-slate-900 dark:text-slate-100 truncate">
                      {col.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className={cn('font-mono text-[10px] font-extrabold px-1.5 py-0.5 rounded-full border shrink-0 leading-none', col.badgeClass)}>
                      {colTrips.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFocusedStage(col.id)}
                      className="p-0.5 rounded text-slate-400 hover:text-brand transition-colors cursor-pointer"
                      title={`Expand ${col.label} stage`}
                    >
                      <Maximize2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Compact Trip Pills List */}
                <div className="flex-1 overflow-y-auto custom-scrollbar py-1 flex flex-col gap-1 min-h-0">
                  {colTrips.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-[10px] font-semibold text-slate-400 dark:text-slate-500 italic">
                      No {col.label} trips
                    </div>
                  ) : (
                    <>
                      {colTrips.slice(0, 2).map((trip) => {
                        const driver = trip.is_third_party
                          ? (trip.third_party_driver_name || '3PL')
                          : trip.driver
                          ? `${trip.driver.first_name?.[0] || ''}.${trip.driver.last_name || ''}`
                          : 'Unassigned';
                        const vehicle = trip.vehicle?.plate_number || trip.third_party_vehicle_plate || '—';

                        return (
                          <div
                            key={trip.id}
                            onClick={() => window.open(`/trips/${trip.id}`, '_self')}
                            className="px-2 py-1 rounded-lg bg-white/90 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-[10px] font-semibold hover:border-brand transition-all cursor-pointer group shadow-3xs"
                            title={`Trip ${trip.ref_id || 'Draft'} · ${driver} · ${vehicle}`}
                          >
                            <span className="font-mono font-extrabold text-brand group-hover:underline truncate max-w-[70px]">
                              {trip.ref_id || 'Draft'}
                            </span>
                            <span className="text-slate-700 dark:text-slate-300 font-semibold truncate max-w-[75px]">
                              {driver}
                            </span>
                            <span className="font-mono text-[9px] font-bold text-slate-500 dark:text-slate-400 truncate max-w-[55px]">
                              {vehicle}
                            </span>
                          </div>
                        );
                      })}
                      {colTrips.length > 2 && (
                        <button
                          type="button"
                          onClick={() => setFocusedStage(col.id)}
                          className="text-[9px] font-extrabold text-brand hover:underline text-center py-0.5 cursor-pointer shrink-0"
                        >
                          +{colTrips.length - 2} more trips →
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col min-h-0 overflow-hidden">

      {/* Scrollable Column Track Container */}
      {isError ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-rose-200 dark:border-rose-900/50 rounded-2xl my-2">
          <AlertTriangle className="w-7 h-7 text-rose-500 shrink-0" />
          <h3 className="text-sm font-extrabold text-rose-700 dark:text-rose-400">Failed to load trips</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-sm">
            This can happen on a slow or unstable connection.
          </p>
          {onRetry && (
            <Button size="sm" variant="outline" className="mt-3 h-8 text-xs font-bold" onClick={onRetry}>
              Retry
            </Button>
          )}
        </div>
      ) : (
        <div
          ref={scrollContainerRef}
          onWheel={handleWheel}
          className="flex-1 overflow-x-auto overflow-y-hidden p-1 pb-4 flex gap-4 min-h-0 snap-x custom-scrollbar select-none"
        >
          {renderedColumns.map((col) => {
            const Icon = col.icon;
            const rawColTrips = groupedTrips[col.id] || [];
            const filterTerm = (columnSearch[col.id] || '').toLowerCase().trim();

            const colTrips = filterTerm
              ? rawColTrips.filter(
                  (t) =>
                    t.ref_id.toLowerCase().includes(filterTerm) ||
                    (t.customer?.name && t.customer.name.toLowerCase().includes(filterTerm)) ||
                    (t.driver && `${t.driver.first_name} ${t.driver.last_name}`.toLowerCase().includes(filterTerm)) ||
                    (t.vehicle?.plate_number && t.vehicle.plate_number.toLowerCase().includes(filterTerm))
                )
              : rawColTrips;

            // Limit visible cards in column. Defaults to showing 10 cards.
            const limit = visibleLimits[col.id] ?? 10;
            const displayedColTrips = colTrips.slice(0, limit);

            const isOver = dragOverColumn === col.id;
            const isOtherColumnActive = activeSelectionColumn !== null && activeSelectionColumn !== col.id;

            return (
              <div
                key={col.id}
                onDragOver={(e) => handleDragOver(e, col.id)}
                onDragLeave={() => handleDragLeave(col.id)}
                onDrop={(e) => handleDrop(e, col.id)}
                className={cn(
                  'flex flex-col h-full rounded-2xl border transition-all snap-start shadow-2xs',
                  columnWidthClass,
                  isOver
                    ? 'bg-orange-50/60 dark:bg-orange-950/30 border-brand ring-2 ring-brand/30'
                    : col.columnBg,
                  isOtherColumnActive && 'opacity-40 pointer-events-none grayscale-[30%]'
                )}
              >
                {/* Column Sticky Header */}
                <div
                  className={cn(
                    'px-3 py-2.5 rounded-t-2xl border-b backdrop-blur-xs flex items-center justify-between gap-1.5 shrink-0 select-none',
                    col.headerBg,
                    col.headerBorder
                  )}
                >
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <Checkbox
                      checked={activeSelectionColumn === col.id}
                      onCheckedChange={() => handleToggleColumnSelection(col.id)}
                      disabled={activeSelectionColumn !== null && activeSelectionColumn !== col.id}
                      className="border-slate-300 dark:border-slate-600 data-[state=checked]:bg-brand data-[state=checked]:border-brand shrink-0"
                    />
                    <Icon size={14} className={cn('shrink-0', col.accentColor)} />
                    <span className="font-extrabold text-xs text-slate-900 dark:text-slate-100 tracking-tight whitespace-nowrap">
                      {col.label}
                    </span>
                    <span
                      className={cn(
                        'font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 leading-none',
                        col.badgeClass
                      )}
                    >
                      {rawColTrips.length}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFocusedStage(col.id);
                    }}
                    className="p-1 rounded-md text-slate-400 hover:text-brand hover:bg-slate-200/60 dark:hover:bg-slate-800/80 transition-colors cursor-pointer shrink-0"
                    title={`View all ${col.label} trips in expanded table`}
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Column Scrollable Cards Body */}
                <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-2.5 min-h-0 custom-scrollbar">
                  {isLoading ? (
                    <div className="flex flex-col gap-3 py-4">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-28 rounded-xl bg-white/60 dark:bg-slate-800/60 animate-pulse border border-slate-200/50" />
                      ))}
                    </div>
                  ) : displayedColTrips.length === 0 ? (
                    <div
                      className={cn(
                        'flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-400 dark:text-slate-600 border-2 border-dashed rounded-xl my-1',
                        col.emptyBg
                      )}
                    >
                      <div className={cn('w-9 h-9 rounded-xl border flex items-center justify-center mb-2 shadow-3xs', col.emptyIconBg)}>
                        <Icon size={16} className={col.accentColor} />
                      </div>
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">No {col.label} Trips</span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                        Drag a trip card here to update stage
                      </span>
                    </div>
                  ) : (
                    <>
                      {displayedColTrips.map((trip) => (
                        <TripKanbanCard
                          key={trip.id}
                          trip={trip}
                          onStatusChange={onStatusChange}
                          onLogDelay={onLogDelay}
                          onShareWhatsapp={onShareWhatsapp}
                          onDelete={onDelete}
                          onOpenSettlement={onOpenSettlement}
                          density={cardDensity}
                          showCheckbox={activeSelectionColumn === col.id}
                          isSelected={selectedTripIds.includes(trip.id)}
                          onToggleSelect={handleToggleSelect}
                        />
                      ))}

                      {colTrips.length > limit && (
                        <Button
                          variant="ghost"
                          onClick={() => setVisibleLimits((prev) => ({ ...prev, [col.id]: limit + 10 }))}
                          className={cn(
                            'w-full mt-1 py-1.5 h-8 border border-dashed rounded-xl text-xs font-bold cursor-pointer shadow-3xs transition-colors',
                            col.showMoreClass
                          )}
                        >
                          Show More (+10)
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Bottom Bar for Bulk Actions */}
      {selectedTripIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 bg-charcoal dark:bg-slate-800 text-white px-5 py-3 rounded-full shadow-2xl shadow-slate-900/20 border border-slate-700/50 animate-in slide-in-from-bottom-5">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-brand text-xs font-bold">
              {selectedTripIds.length}
            </span>
            <span className="text-sm font-semibold">Trips Selected</span>
          </div>
          <div className="w-px h-5 bg-slate-700" />
          <Button 
            size="sm" 
            variant="ghost" 
            className="text-white hover:bg-slate-800 hover:text-white"
            onClick={handleClearSelection}
          >
            Cancel
          </Button>
          <Button 
            size="sm" 
            className="bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20 border-none"
            onClick={() => setIsBulkShareOpen(true)}
          >
            <Send className="w-4 h-4 mr-2" />
            Share to WhatsApp
          </Button>
        </div>
      )}

      {/* Bulk Share Dialog */}
      <Dialog open={isBulkShareOpen} onOpenChange={setIsBulkShareOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Share {selectedTripIds.length} Selected Trips</DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-3">
            <p className="text-xs text-slate-500">
              Selected trips to share via WhatsApp:
            </p>
            <div className="max-h-52 overflow-y-auto border rounded-xl p-2.5 flex flex-col gap-2 bg-slate-50 dark:bg-slate-900/50 custom-scrollbar">
              {trips.filter(t => selectedTripIds.includes(t.id)).map(trip => (
                <div key={trip.id} className="text-xs font-semibold flex items-center justify-between border-b last:border-0 pb-2 last:pb-0 border-slate-200 dark:border-slate-800">
                  <span className="font-mono text-slate-800 dark:text-slate-200">{trip.ref_id}</span>
                  <span className="text-slate-500 font-normal truncate max-w-[220px]">{trip.customer?.name}</span>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsBulkShareOpen(false)}>
              Cancel
            </Button>
            {selectedTripIds.length > 1 && (
              <Button
                variant="secondary"
                size="sm"
                className="text-xs font-bold"
                onClick={() => {
                  const selectedTrips = trips.filter(t => selectedTripIds.includes(t.id));
                  if (selectedTrips.length > 0) {
                    openMultipleWhatsappMessages(selectedTrips, 'separate');
                  }
                  setIsBulkShareOpen(false);
                  handleClearSelection();
                }}
              >
                Open {selectedTripIds.length} Tabs
              </Button>
            )}
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5"
              onClick={() => {
                const selectedTrips = trips.filter(t => selectedTripIds.includes(t.id));
                if (selectedTrips.length > 0) {
                  openMultipleWhatsappMessages(selectedTrips, 'combined');
                }
                setIsBulkShareOpen(false);
                handleClearSelection();
              }}
            >
              <Send className="w-3.5 h-3.5" />
              {selectedTripIds.length > 1 ? 'Share Combined Summary' : 'Share to WhatsApp'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Company Auto-Select Dialog */}
      <Dialog open={companySelectionModalCol !== null} onOpenChange={(open) => {
        if (!open) setCompanySelectionModalCol(null);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Quick Select Trips</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-slate-500 mb-4">
              Select a group below to instantly select all matching trips in this column, or cancel to manually pick trips.
            </p>
            <div className="max-h-60 overflow-y-auto border rounded-lg flex flex-col bg-slate-50 dark:bg-slate-900 custom-scrollbar divide-y divide-slate-200 dark:divide-slate-800">
              {(() => {
                if (!companySelectionModalCol) return null;
                const colTrips = groupedTrips[companySelectionModalCol] || [];
                const groups: Record<string, { company: string, route: string, trips: Trip[] }> = {};
                
                colTrips.forEach(trip => {
                  const company = trip.customer?.name || 'Unknown Company';
                  const route = getRouteName(trip);
                  const key = `${company}::${route}`;
                  if (!groups[key]) {
                    groups[key] = { company, route, trips: [] };
                  }
                  groups[key].trips.push(trip);
                });

                const groupArr = Object.values(groups).sort((a, b) => b.trips.length - a.trips.length);

                if (groupArr.length === 0) {
                  return <div className="text-sm text-slate-500 text-center py-6 font-semibold">No trips to select.</div>;
                }

                return groupArr.map((g, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors">
                    <div className="min-w-0 flex-1 pr-4">
                      <div className="text-[13px] font-extrabold text-slate-900 dark:text-slate-100 truncate">{g.company}</div>
                      <div className="text-[11px] font-semibold text-slate-500 truncate mt-0.5">{g.route}</div>
                    </div>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="shrink-0 font-bold border-brand text-brand hover:bg-brand/10 dark:hover:bg-brand/20"
                      onClick={() => {
                        setSelectedTripIds(g.trips.map(t => t.id));
                        setCompanySelectionModalCol(null);
                      }}
                    >
                      Select {g.trips.length}
                    </Button>
                  </div>
                ));
              })()}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCompanySelectionModalCol(null)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});

export default TripKanbanBoard;

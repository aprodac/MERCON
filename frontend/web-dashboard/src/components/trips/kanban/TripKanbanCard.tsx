import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MoreHorizontal,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  DollarSign,
  FileText,
  Trash2,
  Edit2,
  Navigation,
  MapPin,
} from 'lucide-react';
import { Trip, TripStop, TripStatus, getTripPayloadCapacity } from '@/services/tripService';
import { formatInDeploymentTz, useDeploymentTimezone } from '@/lib/datetime';
import DeletedBadge from '@/components/ui/DeletedBadge';
import { cn } from '@/lib/utils';
import { WhatsAppIcon } from '@/components/ui/whatsapp-icon';
import { reverseGeocode } from '@/services/addressSearch';
import { isRoundTrip, parseTripRouteNodes } from '@mercon/shared-types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';

export interface TripKanbanCardProps {
  trip: Trip;
  onStatusChange?: (trip: Trip, newStatus: TripStatus) => void;
  onLogDelay?: (trip: Trip) => void;
  onShareWhatsapp?: (trip: Trip) => void;
  onDelete?: (trip: Trip) => void;
  onOpenSettlement?: (trip: Trip) => void;
  density?: 'compact' | 'normal' | 'expanded';
  hideCustomer?: boolean;
  isSelected?: boolean;
  showCheckbox?: boolean;
  onToggleSelect?: (trip: Trip) => void;
}

// Prefer the compact monthly-sheet code ("RUH") when the stop's Location has
// one saved — falls back to the full name for any place that never had a
// short code (custom facilities, cities the client didn't abbreviate, etc).
const isUuidVal = (str?: string | null) => str ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim()) : false;

const stopLabel = (stop: TripStop | undefined) => {
  if (!stop) return '—';
  const code = stop.location?.codes?.[0] || (stop.location as any)?.code;
  const rawName = !isUuidVal(stop.location_name) ? stop.location_name : null;
  const name = code || rawName || stop.location?.name || stop.location_address || stop.location?.address || '—';
  return name.replace(/🔁\s*/g, '').trim();
};

const getPickupName = (trip: Trip) => {
  const pickup = trip.stops?.find((s) => s.stop_type === 'Pickup') || trip.stops?.[0];
  return stopLabel(pickup);
};

const getDropoffName = (trip: Trip) => {
  const dropoff = trip.stops?.find((s) => s.stop_type === 'Dropoff') || (trip.stops && trip.stops.length > 1 ? trip.stops[trip.stops.length - 1] : undefined);
  return stopLabel(dropoff);
};

// Always the real full name, regardless of whether a code exists — used for
// the hover tooltip so the compact code on the card never loses meaning.
const stopFullLabel = (stop: TripStop | undefined) => {
  if (!stop) return '—';
  const rawName = !isUuidVal(stop.location_name) ? stop.location_name : null;
  const name = rawName || stop.location?.name || stop.location_address || stop.location?.address || '—';
  return name.replace(/🔁\s*/g, '').trim();
};

/** Derive a human-readable trip type label */
const getTripTypeLabel = (trip: Trip): string => {
  if (trip.is_third_party) return '3PL Trip';
  const stopsCount = trip.stops?.length ?? 0;
  if (isRoundTrip(trip)) {
    return 'Round Trip';
  }
  if (stopsCount >= 3) {
    return 'Multi-Stop';
  }
  return 'Single Trip';
};

const getActiveLegInfo = (trip: Trip) => {
  const stops = trip.stops || [];
  const stopsCount = stops.length;
  if (stopsCount === 0) return null;

  const isRound = isRoundTrip(trip);

  // Find active stop: first stop without actual_departure
  const activeIdx = stops.findIndex((s) => !s.actual_departure);
  const currentStopNum = activeIdx >= 0 ? activeIdx + 1 : stopsCount;
  const currentStop = activeIdx >= 0 ? stops[activeIdx] : stops[stopsCount - 1];
  
  const rawName = currentStop?.location_name || currentStop?.location?.name || '—';
  const cleanName = rawName.replace(/🔁\s*/g, '').trim();

  return {
    stopsCount,
    currentStopNum,
    currentStop,
    cleanName,
    isRound,
    badgeText: isRound
      ? `Leg ${currentStopNum}/${stopsCount} (Return)`
      : stopsCount > 2
        ? `Stop ${currentStopNum}/${stopsCount}`
        : null
  };
};

export default function TripKanbanCard({
  trip,
  onStatusChange,
  onLogDelay,
  onShareWhatsapp,
  onDelete,
  onOpenSettlement,
  density = 'normal',
  hideCustomer = false,
  isSelected = false,
  showCheckbox = false,
  onToggleSelect,
}: TripKanbanCardProps) {
  const navigate = useNavigate();
  const tz = useDeploymentTimezone();
  const [isDragging, setIsDragging] = useState(false);

  const routeNodes = Array.isArray((trip as any).route_timeline) && (trip as any).route_timeline.length >= 2
    ? (trip as any).route_timeline
    : parseTripRouteNodes(trip);
  const pickup = trip.stops?.find((s) => s.stop_type === 'Pickup') || trip.stops?.[0];
  const dropoff = trip.stops?.find((s) => s.stop_type === 'Dropoff') || (trip.stops && trip.stops.length > 1 ? trip.stops[trip.stops.length - 1] : undefined);
  const pickupName = routeNodes[0]?.name || getPickupName(trip);
  const dropoffName = routeNodes[routeNodes.length - 1]?.name || getDropoffName(trip);
  const capacity = getTripPayloadCapacity(trip);
  const tripType = getTripTypeLabel(trip);
  const legInfo = getActiveLegInfo(trip);
  const routeText = `${pickupName}  →  ${dropoffName}`;
  const routeTitle = `${stopFullLabel(pickup)} → ${stopFullLabel(dropoff)}`;

  const resolvedLoc = trip.vehicle?.resolved_location;
  const lat = resolvedLoc?.latitude;
  const lng = resolvedLoc?.longitude;
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

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', trip.id);
    e.dataTransfer.effectAllowed = 'move';
    setIsDragging(true);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const driverName = trip.is_third_party
    ? trip.third_party_driver_name || trip.carrier_name || '3PL Driver'
    : trip.driver
      ? `${trip.driver.first_name} ${trip.driver.last_name || ''}`.trim()
      : 'Unassigned';

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={() => navigate(`/trips/${trip.id}`)}
      className={cn(
        'group relative bg-white dark:bg-slate-900 border rounded-xl shadow-xs hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 transition-all cursor-grab active:cursor-grabbing flex flex-col select-none',
        density === 'compact' ? 'p-3 gap-2' : density === 'expanded' ? 'p-4 gap-3' : 'p-3 gap-2.5',
        isDragging && 'opacity-40 border-dashed border-brand bg-orange-50/20 dark:bg-orange-950/10',
        isSelected ? 'border-brand ring-1 ring-brand/30 bg-brand/5 dark:bg-brand/10' : 'border-slate-200/90 dark:border-slate-800'
      )}
    >
      {/* ── ROW 1: Trip Type badge (left) + Trip ID + ··· menu (right) ─────── */}
      <div className="flex items-center justify-between gap-1.5 w-full min-w-0">
        {/* Left cluster: Checkbox + Trip type label */}
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap flex-1">
          {showCheckbox && onToggleSelect && (
            <div onClick={(e) => e.stopPropagation()} className="flex items-center shrink-0">
              <Checkbox 
                checked={isSelected} 
                onCheckedChange={() => onToggleSelect(trip)} 
                className={cn(
                  "w-4 h-4 rounded shadow-sm border-slate-300 dark:border-slate-700 data-[state=checked]:bg-brand data-[state=checked]:border-brand",
                  isSelected && "border-brand"
                )}
              />
            </div>
          )}
          <span className={cn(
            'text-[9px] font-bold px-1.5 py-0.5 rounded border tracking-wide uppercase shrink-0',
            trip.is_third_party
              ? 'bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800'
              : 'bg-slate-50 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400 border-slate-200 dark:border-slate-700'
          )}>
            {tripType}
          </span>
        </div>

        {/* Right cluster: ref_id + actions menu */}
        <div className="flex items-center gap-1 shrink-0 ml-auto">
          <span className="font-mono text-[11px] font-black text-[#FA634E] dark:text-[#FA634E] tracking-tight shrink-0 whitespace-nowrap">
            {trip.ref_id}
          </span>

          {/* Quick Action Dropdown */}
          <div onClick={(e) => e.stopPropagation()} className="shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Trip Actions"
                >
                  <MoreHorizontal size={13} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-48 p-1.5 shadow-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl z-50"
              >
                <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1">
                  Trip Actions
                </DropdownMenuLabel>

                <DropdownMenuItem
                  onClick={() => navigate(`/trips/${trip.id}`)}
                  className="cursor-pointer text-xs font-semibold py-1.5 px-2 rounded-md"
                >
                  <FileText className="mr-2 h-3.5 w-3.5 text-slate-500" />
                  View Details
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={() => navigate(`/trips/${trip.id}/edit`)}
                  className="cursor-pointer text-xs font-semibold py-1.5 px-2 rounded-md"
                >
                  <Edit2 className="mr-2 h-3.5 w-3.5 text-slate-500" />
                  Edit Trip
                </DropdownMenuItem>

                {trip.status === 'InTransit' && (
                  <DropdownMenuItem
                    onClick={() => navigate(`/trips/${trip.id}/track`)}
                    className="cursor-pointer text-xs font-bold py-1.5 px-2 rounded-md text-brand hover:bg-orange-50 dark:hover:bg-orange-950/40"
                  >
                    <Navigation className="mr-2 h-3.5 w-3.5" />
                    Live GPS Track
                  </DropdownMenuItem>
                )}

                {onLogDelay && (
                  <DropdownMenuItem
                    onClick={() => onLogDelay(trip)}
                    className="cursor-pointer text-xs font-semibold py-1.5 px-2 rounded-md text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                  >
                    <AlertTriangle className="mr-2 h-3.5 w-3.5 text-amber-500" />
                    Log Delay Reason
                  </DropdownMenuItem>
                )}

                {onShareWhatsapp && (
                  <DropdownMenuItem
                    onClick={() => onShareWhatsapp(trip)}
                    className="cursor-pointer text-xs font-semibold py-1.5 px-2 rounded-md text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                  >
                    <WhatsAppIcon className="mr-2 h-3.5 w-3.5 text-emerald-500 fill-emerald-500 shrink-0" />
                    Share to WhatsApp
                  </DropdownMenuItem>
                )}

                {onOpenSettlement && (trip.status === 'Completed' || trip.status === 'Invoiced') && (
                  <DropdownMenuItem
                    onClick={() => onOpenSettlement(trip)}
                    className="cursor-pointer text-xs font-bold py-1.5 px-2 rounded-md text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                  >
                    <DollarSign className="mr-2 h-3.5 w-3.5 text-amber-500" />
                    {trip.is_post_trip_settled ? 'View/Edit Extra Charges' : 'Mark Additional Charges'}
                  </DropdownMenuItem>
                )}

                <DropdownMenuSeparator className="my-1 border-slate-100 dark:border-slate-800" />
                <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1">
                  Move Status
                </DropdownMenuLabel>

                {(['Draft', 'AtPickup', 'InTransit', 'Completed', 'Invoiced'] as TripStatus[])
                  .filter((s) => s !== trip.status)
                  .map((s) => (
                    <DropdownMenuItem
                      key={s}
                      onClick={() => onStatusChange?.(trip, s)}
                      className="cursor-pointer text-xs font-semibold py-1 px-2 rounded-md capitalize"
                    >
                      Move to {s === 'Draft' ? 'Scheduled' : s}
                    </DropdownMenuItem>
                  ))}

                {onDelete && (
                  <>
                    <DropdownMenuSeparator className="my-1 border-slate-100 dark:border-slate-800" />
                    <DropdownMenuItem
                      onClick={() => onDelete(trip)}
                      className="cursor-pointer text-xs font-semibold py-1.5 px-2 rounded-md text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5 text-rose-500" />
                      Delete Trip
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* ── ROW 2: Customer Name — most prominent, primary heading ──────────── */}
      {trip.customer?.name && !hideCustomer && (
        <span
          className="text-[13px] font-extrabold text-slate-900 dark:text-slate-100 truncate leading-snug"
          title={trip.customer.name}
        >
          {trip.customer.name}
        </span>
      )}

      {/* ── ROW 3: Route (pickup → dropoff) — location dots kept ──────────── */}
      <div title={routeTitle} className="bg-slate-50/90 dark:bg-slate-800/50 rounded-lg px-2.5 py-1.5 border border-slate-200/70 dark:border-slate-700/50 overflow-hidden min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 ring-1 ring-emerald-200 dark:ring-emerald-900" />
          <div className="flex-1 min-w-0 overflow-hidden">
            <div className="group/route whitespace-nowrap text-[11px] font-bold text-slate-700 dark:text-slate-300">
              <span
                className="inline-block truncate"
              >
                {routeText}
              </span>
            </div>
          </div>
          <div className="w-2 h-2 rounded-full bg-rose-500 shrink-0 ring-1 ring-rose-200 dark:ring-rose-900" />
        </div>
      </div>

      {/* ── ROW 3.5: Resolved Physical Location Row ──────────────────────────── */}
      {(() => {
        if (trip.status === 'Completed' || trip.status === 'Invoiced') return null;
        
        if (isUnavailable) {
          return (
            <div className="flex items-center gap-1.5 text-[10px] font-medium italic text-slate-400 dark:text-slate-500 py-0.5 px-1">
              <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
              <span className="truncate">Location unavailable</span>
            </div>
          );
        }

        const isCurrent = displayState === 'CURRENT';
        const coordsText = `${lat!.toFixed(4)}, ${lng!.toFixed(4)}`;
        const locationLabel = placeName || coordsText;
        const sourceLabel = resolvedLoc?.source === 'DRIVER_GPS' ? 'Driver GPS' : resolvedLoc?.source === 'PHYSICAL_GPS' ? 'Vehicle GPS' : null;
        const timeAgoText = resolvedLoc?.formatted_time_ago;
        const statePrefix = isCurrent ? 'Current location' : 'Last known location';

        return (
          <div className="flex flex-col gap-0.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 rounded-lg px-2 py-1 min-w-0" title={`${statePrefix}: ${locationLabel}`}>
            <div className="flex items-center gap-1.5 min-w-0">
              <Navigation className={cn("w-3 h-3 shrink-0", isCurrent ? "text-emerald-500" : "text-amber-500")} />
              <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate">
                {locationLabel}
              </span>
            </div>
            <div className="flex items-center gap-1 text-[9.5px] font-medium text-slate-500 dark:text-slate-400 pl-4 truncate">
              {timeAgoText && (
                <span>
                  {isCurrent ? `Updated ${timeAgoText}` : `Last known · ${timeAgoText}`}
                </span>
              )}
              {sourceLabel && <span>· {sourceLabel}</span>}
            </div>
          </div>
        );
      })()}

      {/* ── ROW 4: Driver name (left) + Tonnage (right) — no icons ─────────── */}
      <div className="flex items-center justify-between gap-2 overflow-hidden">
        <div className="flex-1 min-w-0 overflow-hidden">
          <span
            className={cn(
              'text-[11px] font-semibold block truncate',
              trip.is_third_party
                ? 'text-purple-600 dark:text-purple-400'
                : 'text-slate-600 dark:text-slate-400'
            )}
            title={driverName}
          >
            {driverName}
            {trip.driver?.deletedAt && <DeletedBadge />}
          </span>
        </div>

        {capacity !== '—' && (
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200/60 dark:border-slate-700/60 shrink-0 tabular-nums">
            {capacity}
          </span>
        )}
      </div>

      {/* ── ROW 4.5: Completed Trip Settlement / Additional Charges Status Banner ────── */}
      {(trip.status === 'Completed' || trip.status === 'Invoiced') && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onOpenSettlement?.(trip);
          }}
          className={cn(
            'flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-all cursor-pointer',
            !trip.is_post_trip_settled
              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700/80 text-amber-900 dark:text-amber-200 hover:bg-amber-100/90 dark:hover:bg-amber-900/60 shadow-xs animate-pulse-subtle'
              : 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100/60 dark:hover:bg-emerald-900/40'
          )}
          title={!trip.is_post_trip_settled ? 'Click to record detention, labor, or extra charges' : 'Click to edit settlement & extra charges'}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            {!trip.is_post_trip_settled ? (
              <AlertCircle size={13} className="text-amber-600 dark:text-amber-400 shrink-0" />
            ) : (
              <CheckCircle2 size={13} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
            )}
            <span className="truncate font-bold">
              {!trip.is_post_trip_settled
                ? 'Additional Charges Not Marked'
                : trip.charges && trip.charges.length > 0
                  ? `Charges Marked (${trip.charges.length})`
                  : 'Charges Settled'}
            </span>
          </div>

          <span
            className={cn(
              'text-[10px] font-extrabold px-1.5 py-0.5 rounded shrink-0 uppercase tracking-tight',
              !trip.is_post_trip_settled
                ? 'bg-amber-600 text-white dark:bg-amber-500 hover:bg-amber-700'
                : 'bg-emerald-200/80 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-100 border border-emerald-300/50 dark:border-emerald-700'
            )}
          >
            {!trip.is_post_trip_settled ? 'Mark Charges' : 'View'}
          </span>
        </div>
      )}

      {/* ── ROW 5: Date & Time (left) + Share to WhatsApp (right) ─────────── */}
      <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-100 dark:border-slate-800/80">
        <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 tabular-nums">
          {trip.planned_start
            ? formatInDeploymentTz(trip.planned_start, tz, 'MMM d, HH:mm')
            : '—'}
        </span>

        {onShareWhatsapp && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onShareWhatsapp(trip);
            }}
            className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 px-1.5 py-0.5 rounded transition-colors cursor-pointer shrink-0"
            title="Share to WhatsApp"
          >
            <WhatsAppIcon className="w-3 h-3 fill-emerald-600 dark:fill-emerald-400 shrink-0" />
            <span>Share to WhatsApp</span>
          </button>
        )}
      </div>
    </div>
  );
}

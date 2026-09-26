import React, { useMemo } from 'react';
import { Check, Navigation, Truck, MapPin, Flag, Clock } from 'lucide-react';
import { formatInDeploymentTz } from '@/lib/datetime';
import { cn } from '@/lib/utils';
import { isRoundTrip as checkIsRoundTrip, parseTripRouteNodes, getTimelineProgress, getTimelineVehiclePosition, timelineStopRole, STOP_ROLE_COLORS, type StopRole } from '@mercon/shared-types';

interface VisualRouteProgressProps {
  stops: any[];
  tz: string;
  tripStatus?: string;
  hideBadges?: boolean;
  hidePulseAnimation?: boolean;
  /**
   * Server-computed route timeline (`route_timeline` on the trip API
   * response), built by the same function backing the driver app's route
   * screen — see backend/api-server/src/services/tripRouteTimeline.ts.
   * When present, this is rendered directly instead of re-deriving a
   * timeline from `stops` here, so web and mobile can never show a
   * different route for the same trip again.
   */
  timeline?: any[];
  trip?: any;
}

interface NormalizedStop {
  id: string;
  seq: number;
  label: string;
  city: string;
  time: string;
  status: 'completed' | 'current' | 'upcoming';
  isFirst: boolean;
  isLast: boolean;
  role?: StopRole;
}

const DEFAULT_STOPS: NormalizedStop[] = [
  { id: '1', seq: 1, label: 'PICKUP', city: 'Riyadh', time: '08:42 AM', status: 'completed', isFirst: true, isLast: false },
  { id: '2', seq: 2, label: 'DESTINATION', city: 'Al Abha', time: 'ETA 20:30 PM', status: 'upcoming', isFirst: false, isLast: true },
];

function getCanonicalCity(stop: any): string {
  if (!stop) return '';
  const rawCity = stop.location?.city || stop.location?.name || stop.location_name || stop.name;
  if (!rawCity) return '';
  return String(rawCity)
    .replace(/\[RETURN:.*?\]/gi, '')
    .replace(/🔁\s*/g, '')
    .replace(/\s*\(\s*\)$/, '')
    .trim();
}

function isTurnaroundPair(prevStop: any, nextStop: any): boolean {
  if (!prevStop || !nextStop) return false;

  const prevLeg = prevStop.leg_index ?? 0;
  const nextLeg = nextStop.leg_index ?? 0;
  const isLegTransition = prevLeg === 0 && nextLeg === 1;

  const prevType = String(prevStop.stop_type || '').toLowerCase();
  const nextType = String(nextStop.stop_type || '').toLowerCase();
  const isDropoffToPickup = (prevType === 'dropoff' || prevType === 'unloading') && (nextType === 'pickup' || nextType === 'loading');

  const prevLocId = prevStop.location_id || prevStop.locationId || prevStop.location?.id;
  const nextLocId = nextStop.location_id || nextStop.locationId || nextStop.location?.id;

  let sameLocation = false;
  if (prevLocId && nextLocId) {
    sameLocation = String(prevLocId) === String(nextLocId);
  } else {
    const prevCity = getCanonicalCity(prevStop);
    const nextCity = getCanonicalCity(nextStop);
    sameLocation = !!prevCity && !!nextCity && prevCity.toLowerCase() === nextCity.toLowerCase();
  }

  return (isLegTransition || isDropoffToPickup) && sameLocation;
}

export default function VisualRouteProgress({ stops, tz, tripStatus, hideBadges, hidePulseAnimation, timeline, trip }: VisualRouteProgressProps) {
  const isTripFullyCompleted = ['completed', 'invoiced'].includes(String(tripStatus || '').trim().toLowerCase());
  const hasServerTimeline = Array.isArray(timeline) && timeline.length >= 2;
  const isDelayed =
    ['delayed', 'late'].includes(String(tripStatus || '').trim().toLowerCase()) ||
    (stops && stops.some((st: any) => st.is_delayed || (st.delay_minutes && st.delay_minutes > 0)));

  const isRoundTrip = useMemo(() => {
    return checkIsRoundTrip(trip || { stops, route_timeline: timeline });
  }, [stops, timeline, trip]);

  const routeNodes: any[] = useMemo(
    () => (hasServerTimeline ? timeline : (trip?.route_timeline || parseTripRouteNodes(trip || { stops }))) || [],
    [stops, timeline, hasServerTimeline, trip],
  );

  // Where the truck is: on a stop, or between two stops once the driver has
  // left one and not yet reached the next (shared rule — see getTimelineVehiclePosition).
  const vehicle = useMemo(() => getTimelineVehiclePosition(routeNodes, isTripFullyCompleted), [routeNodes, isTripFullyCompleted]);

  const normalizedStops: NormalizedStop[] = useMemo(() => {
    const nodes = routeNodes;
    if (!nodes || nodes.length === 0) return DEFAULT_STOPS;

    // Same rule as the driver app: a stop is done once the driver LEFT it,
    // so the truck stays on the pickup while loading.
    const progress = getTimelineProgress(nodes, isTripFullyCompleted);
    return nodes.map((node: any, idx: number) => {
      const isFirst = idx === 0;
      const isLast = idx === nodes.length - 1;
      const completed = progress[idx] === 'completed';
      const isCurrent = progress[idx] === 'current';

      const relevantTime = node.actualArrival || node.plannedArrival;
      const timeStr = relevantTime
        ? formatInDeploymentTz(relevantTime, tz, 'hh:mm a')
        : isLast && !isTripFullyCompleted
        ? 'ETA 20:30 PM'
        : '12:00 PM';

      return {
        id: node.stopId || node.id || `m-${idx}`,
        seq: idx + 1,
        label: node.typeEn || (isFirst ? 'Pickup' : isLast ? 'Destination' : `Stop ${idx}`),
        city: node.name,
        time: timeStr,
        status: completed ? 'completed' : isCurrent ? 'current' : 'upcoming',
        isFirst,
        isLast,
        role: timelineStopRole(node),
      };
    });
  }, [routeNodes, isTripFullyCompleted, tz]);

  const totalStops = normalizedStops.length;
  const completedCount = normalizedStops.filter((s) => s.status === 'completed').length;
  const rawProgress = isTripFullyCompleted
    ? 100
    : totalStops > 1 && routeNodes.length > 1
    ? Math.round(((vehicle.index - (vehicle.enRoute ? 0.5 : 0)) / (totalStops - 1)) * 100)
    : totalStops > 1
    ? Math.round((completedCount / (totalStops - 1)) * 100)
    : 100;
  const progressPercent = rawProgress > 0 ? Math.min(100, rawProgress) : 0;

  const originCity = normalizedStops[0]?.city || 'Origin';
  const turnaroundOrDestCity = useMemo(() => {
    if (isRoundTrip && normalizedStops.length >= 3) {
      const turnaroundNode = normalizedStops.find((s) => (s as any).isTurnaround) || normalizedStops[1];
      return turnaroundNode?.city || 'Turnaround';
    }
    return normalizedStops[normalizedStops.length - 1]?.city || 'Destination';
  }, [isRoundTrip, normalizedStops]);

  const routeTitle = useMemo(() => {
    if (normalizedStops.length <= 2) {
      return isRoundTrip
        ? `${originCity} → ${turnaroundOrDestCity} · Round Trip`
        : `${originCity} → ${turnaroundOrDestCity} Corridor`;
    }
    const cities = normalizedStops.map((s) => s.city).filter(Boolean);
    const chain = cities.join(' → ');
    if (chain.length <= 48) return chain;
    return `${originCity} → ... → ${cities[cities.length - 1]} (${totalStops} Stops)`;
  }, [normalizedStops, originCity, turnaroundOrDestCity, isRoundTrip, totalStops]);

  return (
    <div className="relative w-full rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs overflow-hidden flex flex-col justify-between p-3.5 sm:px-5 sm:py-3.5 gap-3">
      {/* ── 1. TOP HEADER: ROUTE SUMMARY ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 w-full">
        <div className="flex items-center gap-2.5">
          <Navigation className="w-5 h-5 text-[#FA634E] fill-current transform rotate-45 shrink-0" />
          <div>
            <h3 className="font-extrabold text-sm text-[#1F2937] dark:text-slate-100 tracking-tight leading-none" title={routeTitle}>
              {routeTitle}
            </h3>
            <p className="text-[11px] font-medium text-slate-400 mt-0.5">
              {totalStops} {totalStops === 1 ? 'Milestone' : 'Milestones'} • {isRoundTrip ? 'Round Trip Transit' : totalStops > 2 ? 'Multi-Stop Commercial Route' : 'Direct Commercial Transit'}
            </p>
          </div>
        </div>

        {/* Header Telemetry Pills & Status Badge */}
        {!hideBadges && (
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            {/* Status Metric */}
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50/80 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/50">
              <Truck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span className="text-[11px] font-bold text-blue-700 dark:text-blue-300 capitalize">
                {isTripFullyCompleted
                  ? 'Completed'
                  : tripStatus
                  ? String(tripStatus).replace(/([A-Z])/g, ' $1').trim()
                  : 'Scheduled'}
              </span>
            </div>

            {/* Schedule Metric */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60">
              <Clock className={cn("w-3.5 h-3.5", isDelayed ? "text-rose-500" : "text-emerald-500")} />
              <span className={cn("text-[11px] font-bold", isDelayed ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400")}>
                {isTripFullyCompleted ? 'On Time' : isDelayed ? 'Delayed' : 'On Time'}
              </span>
            </div>

            {/* Main Status Pill Badge */}
            <div className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border shadow-2xs",
              isTripFullyCompleted || progressPercent === 100
                ? "bg-[#E6F4EA] dark:bg-emerald-950/50 text-[#0F9D58] dark:text-emerald-400 border-[#CEEAD6] dark:border-emerald-800"
                : isDelayed
                ? "bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border-rose-200/80 dark:border-rose-900/60"
                : "bg-orange-50 dark:bg-orange-950/50 text-[#FA634E] dark:text-orange-400 border-orange-200/80 dark:border-orange-900/60"
            )}>
              <span className={cn(
                "w-2 h-2 rounded-full",
                isTripFullyCompleted || progressPercent === 100
                  ? "bg-[#0F9D58]"
                  : isDelayed
                  ? (hidePulseAnimation ? "bg-rose-500" : "bg-rose-500 animate-pulse")
                  : (hidePulseAnimation ? "bg-[#FA634E]" : "bg-[#FA634E] animate-pulse")
              )} />
              <span>
                {isTripFullyCompleted || progressPercent === 100
                  ? 'Delivered'
                  : isDelayed
                  ? 'Delayed'
                  : progressPercent > 0
                  ? 'In Transit'
                  : 'Scheduled'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── 2. VISUAL ROUTE TRACK & MILESTONES (ALL STOPS RENDERED) ── */}
      <div className="relative w-full pt-4 pb-1">
        <div className="relative w-full px-6 sm:px-10 flex items-start justify-between">
          
          {/* Base Remaining Route Line (Orange) & Completed Route Line (Green) */}
          <div className="absolute left-[54px] sm:left-[82px] right-[54px] sm:right-[82px] top-2.5 -translate-y-1/2 h-[3px] bg-[#FA634E] dark:bg-orange-600 rounded-full pointer-events-none z-0">
            {/* Completed Route Line (Green) */}
            <div
              className="h-full bg-[#10B981] dark:bg-emerald-500 rounded-full transition-all duration-500 relative"
              style={{ width: `${isTripFullyCompleted ? 100 : Math.min(100, Math.max(0, progressPercent))}%` }}
            >
              {/* Official MERCON 3D Truck Image with Operator Highlight */}
              <div className={cn(
                "absolute right-0 top-1/2 -translate-y-[55%] z-40 pointer-events-none flex flex-col items-center transition-all duration-500",
                isTripFullyCompleted ? "translate-x-[50%]" : "translate-x-[40%]"
              )}>
                {/* Glowing Live GPS Target Halo & Radial Glow Backdrop (Active In-Transit Only) */}
                {!isTripFullyCompleted && progressPercent > 0 && (
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[35%] w-10 h-10 sm:w-12 sm:h-12 pointer-events-none z-0 flex items-center justify-center">
                    <div className={cn(
                      "w-full h-full rounded-full border-2",
                      !hidePulseAnimation && "animate-ping",
                      isDelayed
                        ? "border-rose-500/70 bg-rose-500/20"
                        : "border-emerald-400/60 bg-emerald-500/20"
                    )} />
                    <div className={cn(
                      "absolute w-7 h-7 sm:w-8 sm:h-8 rounded-full filter blur-xs",
                      isDelayed
                        ? "bg-rose-500/35 dark:bg-rose-400/45 shadow-[0_0_18px_rgba(244,63,94,0.85)]"
                        : "bg-emerald-500/35 dark:bg-emerald-400/45 shadow-[0_0_18px_rgba(16,185,129,0.85)]"
                    )} />
                  </div>
                )}

                <img
                  src="/mercon_truck_3d.png"
                  alt="MERCON Logistics Truck"
                  className={cn(
                    "h-10 sm:h-12 w-auto object-contain select-none pointer-events-none z-40 relative drop-shadow-md",
                    !isTripFullyCompleted && (
                      isDelayed
                        ? "filter drop-shadow-[0_4px_10px_rgba(244,63,94,0.5)] dark:drop-shadow-[0_4px_12px_rgba(244,63,94,0.7)]"
                        : "filter drop-shadow-[0_4px_10px_rgba(16,185,129,0.45)] dark:drop-shadow-[0_4px_12px_rgba(16,185,129,0.7)]"
                    )
                  )}
                />
              </div>
            </div>
          </div>

          {/* Render ALL Milestone Stops sequentially */}
          {normalizedStops.map((stop, mIdx) => {
            const isLastStop = mIdx === normalizedStops.length - 1;
            const hideCheckmarkForLast = isLastStop && (isTripFullyCompleted || progressPercent >= 100);

            const isDone = (stop.status === 'completed' || isTripFullyCompleted || (mIdx === 0 && (progressPercent > 0 || completedCount > 0))) && !hideCheckmarkForLast;
            const isCurrent = stop.status === 'current' && !isTripFullyCompleted && !hideCheckmarkForLast;
            // Origin/loading = blue, destination/delivery = green, stops in between = red.
            const roleColor = STOP_ROLE_COLORS[(stop as any).role as StopRole] ?? STOP_ROLE_COLORS.stop;

            return (
              <div key={`stop-col-${stop.id}-${mIdx}`} className="relative z-10 flex flex-col items-center text-center min-w-[60px] sm:min-w-[85px] max-w-[120px]">
                <div className="h-5 flex items-center justify-center">
                  {hideCheckmarkForLast ? (
                    <div className="w-5 h-5 rounded-full bg-transparent border-2 border-emerald-500/30" />
                  ) : isDone ? (
                    <div
                      className="w-5 h-5 rounded-full text-white flex items-center justify-center ring-4 shadow-xs"
                      style={{ backgroundColor: roleColor.main, ['--tw-ring-color' as any]: roleColor.soft }}
                    >
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                  ) : isCurrent ? (
                    <div
                      className={cn(
                        "w-5 h-5 rounded-full text-white flex items-center justify-center ring-4 shadow-xs",
                        !hidePulseAnimation && "animate-pulse"
                      )}
                      style={{ backgroundColor: roleColor.main, ['--tw-ring-color' as any]: roleColor.soft }}
                    >
                      <MapPin className="w-3 h-3 fill-current" />
                    </div>
                  ) : (
                    <div
                      className="w-5 h-5 rounded-full bg-white dark:bg-slate-900 border-2 ring-4 shadow-xs"
                      style={{ borderColor: roleColor.main, ['--tw-ring-color' as any]: roleColor.soft }}
                    />
                  )}
                </div>
                <span className="font-extrabold text-xs sm:text-sm text-[#1F2937] dark:text-slate-100 tracking-tight truncate w-full text-center mt-1.5" title={stop.city}>
                  {stop.city}
                </span>
                <span
                  className="mt-0.5 px-2 py-0.5 rounded text-[8.5px] sm:text-[9px] font-extrabold uppercase tracking-wider"
                  style={{ backgroundColor: roleColor.soft, color: roleColor.text }}
                >
                  {stop.label}
                </span>
                <span className="text-[10.5px] font-mono font-bold text-slate-400 dark:text-slate-500 mt-0.5">
                  {stop.time}
                </span>
              </div>
            );
          })}

        </div>
      </div>
    </div>
  );
}

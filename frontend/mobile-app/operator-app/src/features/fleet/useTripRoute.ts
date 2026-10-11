/**
 * One truck's trip on the map: the road ahead, the rest of the trip, where it
 * has driven, its breaks and the ETA — for the Fleet map's picked truck and
 * for a trip's full-screen live view, so both always show the same line and
 * the same arrival (and share the cache when both are open).
 *
 *   road ahead   the server's one route for this trip (the web live map shows
 *                the same), trimmed to what's left at each new GPS fix; the
 *                last answer stays up while the next loads.
 *   rest         next stop onwards, along real roads (drawn faintly).
 *   trail        the driven path (the trip overview's), joined to the truck.
 *   eta          shared fleetRules computeEta — an estimate (≈) without a road route.
 *   final        arrival at the last stop: the ETA plus truck time for the rest.
 */
import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { operatorService, type LiveUnit } from '../../lib/operator';
import { computeEta, nextStop, onTrip, truckDriveSeconds } from './fleetModel';

export function useTripRoute(unit: LiveUnit | null, liveUpdatedAt: number, now: number) {
  const next = unit ? nextStop(unit) : null;
  const target = next && next.lat != null && next.lng != null ? { lat: next.lat, lng: next.lng } : null;
  const running = !!unit && onTrip(unit);

  const aheadQ = useQuery({
    queryKey: ['fleet', 'route-ahead', unit?.trip?.id, next?.id, unit?.position?.recorded_at],
    queryFn: () => operatorService.routeAhead(unit!.trip!.id),
    enabled: !!unit?.position && !!target && running,
    placeholderData: keepPreviousData,
  });
  // Never another trip's or stop's route while the new one loads.
  const routeQ = { ...aheadQ, data: aheadQ.data && aheadQ.data.stopId === next?.id ? aheadQ.data : null };

  const restStops = useMemo(() => {
    const t = unit?.trip;
    if (!t || t.next_stop_index == null) return [];
    return t.stops.slice(t.next_stop_index).filter((x) => x.lat != null && x.lng != null && !(x.lat === 0 && x.lng === 0)).map((x) => ({ lat: x.lat!, lng: x.lng! }));
  }, [unit?.trip]);
  const restQ = useQuery({
    queryKey: ['fleet', 'trip-rest', unit?.trip?.id, unit?.trip?.next_stop_index, restStops.length],
    queryFn: () => operatorService.liveRoute(restStops),
    enabled: restStops.length >= 2,
    staleTime: 10 * 60_000,
  });

  const trailQ = useQuery({
    queryKey: ['fleet', 'trail', unit?.trip?.id],
    queryFn: () => operatorService.tripOverview(unit!.trip!.id),
    enabled: running,
    refetchInterval: 60_000,
    retry: false,
  });
  const here = unit?.position ?? null;
  const trail = useMemo(() => {
    const path = trailQ.data?.path ?? [];
    if (path.length < 2) return null;
    return here ? [...path, [here.lng, here.lat] as [number, number]] : path;
  }, [trailQ.data, here]);

  const eta = unit && running && (routeQ.isFetched || !target)
    ? computeEta(unit, routeQ.data, routeQ.data ? Date.parse(routeQ.data.computedAt) : liveUpdatedAt || now)
    : null;

  const lastStop = unit?.trip?.stops[unit.trip.stops.length - 1] ?? null;
  const restSec = restQ.data ? truckDriveSeconds(restQ.data.distanceMeters, restQ.data.durationSeconds) : null;
  const final = eta?.arrival && restSec != null && restStops.length >= 2 && lastStop
    ? { at: new Date(eta.arrival.getTime() + restSec * 1000), place: lastStop.name || lastStop.address }
    : null;

  return {
    next,
    routeQ,
    routeLine: routeQ.data?.geometry ?? null,
    restLine: restStops.length >= 2 ? restQ.data?.geometry ?? null : null,
    trailQ,
    trail,
    halts: trailQ.data?.halts ?? null,
    timeSplit: trailQ.data?.time_split ?? null,
    eta,
    final,
  };
}

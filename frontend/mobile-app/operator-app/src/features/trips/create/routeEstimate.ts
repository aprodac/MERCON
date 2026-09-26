/**
 * Time for a whole trip, stop by stop: every leg in order (outbound stops,
 * drop-off, and for a round trip the return leg), plus time spent at each
 * stop in between. Road times come from MERCON's routing service (OSRM); a
 * leg it can't route falls back to the app's distance estimate, and a place
 * that can't be located at all is flagged instead of guessed silently.
 */
import type { TripSlotDraft } from '@mercon/shared-types';
import type { OperatorLocation } from '../../../lib/operator';
import { estimateTravelTime, resolveCityCoords } from '../services/travelTimeService';

/** Minutes spent at a stop that isn't the start or the end (unloading, loading). */
export const STOP_DWELL_MIN = 30;
/** Leg time assumed when a place can't be located. */
export const UNKNOWN_LEG_MIN = 240;

export type RoutePointKind = 'pickup' | 'stop' | 'dropoff' | 'returnPickup' | 'returnStop' | 'finalDrop';

export interface RoutePoint {
  name: string;
  kind: RoutePointKind;
  coords: { lat: number; lng: number } | null;
  /** A round trip's drop-off where the return load is picked up too. */
  alsoReturnPickup?: boolean;
}

export interface RouteLegEstimate {
  minutes: number;
  km: number | null;
  source: 'road' | 'approx' | 'unknown';
}

export interface RouteEstimate {
  key: string;
  points: RoutePoint[];
  /** legs[i] runs from points[i] to points[i + 1]. */
  legs: RouteLegEstimate[];
  /** Minutes spent at points[i] before leaving (0 at the start and the end). */
  dwell: number[];
  driveMinutes: number;
  totalMinutes: number;
  totalKm: number | null;
  source: 'road' | 'approx' | 'mixed';
}

const num = (v: unknown) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

/** The trip's places in driving order, each with coordinates when we can find them. */
export function routePoints(slot: TripSlotDraft, isRound: boolean, locations: OperatorLocation[]): RoutePoint[] {
  const coordsOf = (name?: string | null, id?: string | null, lat?: unknown, lng?: unknown) => {
    const la = num(lat);
    const ln = num(lng);
    if (la !== null && ln !== null && !(la === 0 && ln === 0)) return { lat: la, lng: ln };
    const loc = id ? locations.find((l) => l.id === id) : undefined;
    if (loc && loc.lat != null && loc.lng != null) return { lat: Number(loc.lat), lng: Number(loc.lng) };
    return resolveCityCoords(name || '');
  };

  const pts: RoutePoint[] = [];
  pts.push({ name: slot.origin, kind: 'pickup', coords: coordsOf(slot.origin, slot.originLocationId, slot.originLat, slot.originLng) });
  slot.intermediateLocations.forEach((n, i) => {
    if (n?.trim()) pts.push({ name: n, kind: 'stop', coords: coordsOf(n, slot.intermediateLocationIds?.[i]) });
  });
  pts.push({ name: slot.destination, kind: 'dropoff', coords: coordsOf(slot.destination, slot.destinationLocationId, slot.destinationLat, slot.destinationLng) });

  if (isRound) {
    const retStart = slot.returnOrigin?.trim() ? { n: slot.returnOrigin, c: coordsOf(slot.returnOrigin, slot.returnOriginLocationId, slot.returnOriginLat, slot.returnOriginLng) } : { n: slot.destination, c: pts[pts.length - 1].coords };
    const retEnd = slot.returnDestination?.trim()
      ? { n: slot.returnDestination, c: coordsOf(slot.returnDestination, slot.returnDestinationLocationId, slot.returnDestinationLat, slot.returnDestinationLng) }
      : { n: slot.origin, c: pts[0].coords };
    // The return loading point is usually the drop-off itself — then there's no drive, only the loading time.
    const sameAsDrop = !slot.returnOrigin?.trim() || slot.returnOrigin.trim().toLowerCase() === slot.destination.trim().toLowerCase();
    if (!sameAsDrop) pts.push({ name: retStart.n, kind: 'returnPickup', coords: retStart.c });
    else pts[pts.length - 1] = { ...pts[pts.length - 1], alsoReturnPickup: true };
    (slot.returnIntermediateLocations || []).forEach((n, i) => {
      if (n?.trim()) pts.push({ name: n, kind: 'returnStop', coords: coordsOf(n, slot.returnIntermediateLocationIds?.[i]) });
    });
    pts.push({ name: retEnd.n, kind: 'finalDrop', coords: retEnd.c });
  }
  return pts;
}

export function routeKeyOf(points: RoutePoint[]): string {
  return points.map((p) => `${p.kind}:${p.name.trim().toLowerCase()}:${p.coords ? `${p.coords.lat.toFixed(4)},${p.coords.lng.toFixed(4)}` : '-'}`).join('|');
}

/**
 * Estimate every leg. `roadRoute` asks the routing service for all points at
 * once and returns per-leg seconds/metres, or null when it can't.
 */
export async function estimateRoute(
  points: RoutePoint[],
  roadRoute: (pts: { lat: number; lng: number }[]) => Promise<{ legs: { durationSeconds: number; distanceMeters: number }[] } | null>,
): Promise<RouteEstimate> {
  const key = routeKeyOf(points);
  const legs: RouteLegEstimate[] = [];

  const allLocated = points.every((p) => p.coords);
  let road: { durationSeconds: number; distanceMeters: number }[] | null = null;
  if (allLocated && points.length >= 2 && points.length <= 25) {
    try {
      const res = await roadRoute(points.map((p) => p.coords!));
      if (res && res.legs.length === points.length - 1) road = res.legs;
    } catch {
      road = null;
    }
  }

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i].coords;
    const b = points[i + 1].coords;
    if (road) {
      legs.push({ minutes: Math.round(road[i].durationSeconds / 60), km: Math.round(road[i].distanceMeters / 1000), source: 'road' });
    } else if (a && b) {
      const est = await estimateTravelTime(a, b);
      legs.push({ minutes: est.durationMinutes, km: est.distanceKm, source: 'approx' });
    } else {
      legs.push({ minutes: UNKNOWN_LEG_MIN, km: null, source: 'unknown' });
    }
  }

  // Time on the ground at every point between the start and the end.
  const dwell: number[] = points.map((_, i) => (i === 0 || i === points.length - 1 ? 0 : STOP_DWELL_MIN));
  const driveMinutes = legs.reduce((a, l) => a + l.minutes, 0);
  const totalMinutes = driveMinutes + dwell.reduce((a, d) => a + d, 0);
  const kms = legs.map((l) => l.km);
  const sources = new Set(legs.map((l) => l.source));

  return {
    key,
    points,
    legs,
    dwell,
    driveMinutes,
    totalMinutes,
    totalKm: kms.every((k) => k !== null) ? kms.reduce((a, k) => a + (k as number), 0) : null,
    source: sources.size === 1 && sources.has('road') ? 'road' : sources.has('road') ? 'mixed' : 'approx',
  };
}

/**
 * Lane search for the Fleet map: "riyadh to jeddah" → who is on that lane,
 * what is booked on it, and which free trucks near the start can take the
 * next load. Matching rules ported from the web live map
 * (web-dashboard lib/placeSearch.ts — parsePlaceQuery, tripsOnRoute), so
 * both apps count the same trips as "on the lane". Pure; the screen adds
 * road routes.
 */
import type { LiveUnit } from '../../lib/operator';
import { haversineKm, located, onTrip, placeFromQuery, rankTrucksForTrip, type Place, type TruckCandidate } from './fleetModel';
import { SAUDI_CITY_COORDS } from '../trips/services/travelTimeService';

/** Catchment around each end of a lane (city centres), and the wider one offered when nothing is found. */
export const LANE_KM = 50;
export const LANE_WIDE_KM = 100;

/** "riyadh to jeddah", "ruh → jed", "riyadh -> jeddah", "riyadh - jeddah", "from dammam to jubail". */
const LANE_RE = /^(?:from\s+)?(.+?)\s*(\s+to\s+|→|->|–|—|\s-\s)\s*(.+)$/i;

export type LaneQuery =
  | { kind: 'lane'; from: Place; to: Place }
  /** Reads as a lane, but one end isn't a city we know. */
  | { kind: 'unknown'; text: string; suggestion: string | null }
  | null;

/**
 * A lane typed in the search box. Null when the text isn't one — a plate,
 * a ref like "TRP-12", or a customer name stays a normal search.
 */
export function parseLaneQuery(raw: string): LaneQuery {
  const q = raw.trim().replace(/\s+/g, ' ');
  if (q.length < 5) return null;
  const m = LANE_RE.exec(q);
  if (!m) return null;
  const [a, sep, b] = [m[1].trim(), m[2].trim(), m[3].trim()];
  if (a.length < 2 || b.length < 2) return null;
  const from = placeFromQuery(a);
  const to = placeFromQuery(b);
  if (from && to) return from.label === to.label ? null : { kind: 'lane', from, to };
  // One end is a city and the other looks like a place name: a lane with a misspelt end. A plain
  // dash isn't enough to say so — "Al Rajhi - Riyadh" is a customer search, not a lane.
  const other = sep === '-' ? null : from ? b : to ? a : null;
  if (other && /^[a-z][a-z .'-]{2,}$/i.test(other)) return { kind: 'unknown', text: other, suggestion: suggestCity(other) };
  return null;
}

const titleOf = (key: string) => key.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** The closest known city for "Did you mean…?", a little looser than the search's own typo allowance. */
export function suggestCity(raw: string): string | null {
  const n = raw.toLowerCase().replace(/[-_.,]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^al /, '');
  if (n.length < 3) return null;
  let best: { key: string; d: number } | null = null;
  for (const key of Object.keys(SAUDI_CITY_COORDS)) {
    const d = editDistance(n, key.replace(/_/g, ' '));
    if (d <= 3 && (!best || d < best.d)) best = { key, d };
  }
  return best ? titleOf(best.key) : null;
}

type LatLng = { lat: number; lng: number };
const near = (p: LatLng | null, c: LatLng, km: number) => !!p && haversineKm(p, c) <= km;
const realPoint = (lat: number | null | undefined, lng: number | null | undefined): LatLng | null =>
  lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0) ? { lat, lng } : null;

/**
 * Index of the stop near B that comes after a stop near A, or -1. Order
 * matters: Jeddah → Riyadh is not a Riyadh → Jeddah trip. Round trips and
 * multi-stop trips count when A comes before B anywhere in them.
 */
export function laneStopIndex(points: (LatLng | null)[], from: LatLng, to: LatLng, km: number): number {
  const i = points.findIndex((p) => near(p, from, km));
  if (i === -1) return -1;
  for (let j = i + 1; j < points.length; j++) if (near(points[j], to, km)) return j;
  return -1;
}

// ── On the road ────────────────────────────────────────────────────────────

export interface LaneRun {
  unit: LiveUnit;
  /** The trip's stop at B. */
  stop: NonNullable<LiveUnit['trip']>['stops'][number];
  /** 0–1, straight-line share of the A→B distance already behind the truck. */
  progress: number | null;
}

/** Running trips on the lane, those closest to B first. */
export function lanesOnRoad(units: LiveUnit[], from: LatLng, to: LatLng, km: number): LaneRun[] {
  const span = haversineKm(from, to);
  const out: LaneRun[] = [];
  for (const u of units) {
    if (!u.trip || !onTrip(u)) continue;
    const j = laneStopIndex(u.trip.stops.map((s) => realPoint(s.lat, s.lng)), from, to, km);
    if (j === -1) continue;
    const progress = located(u) && span > 0 ? Math.min(1, Math.max(0, 1 - haversineKm(u.position!, to) / span)) : null;
    out.push({ unit: u, stop: u.trip.stops[j], progress });
  }
  return out.sort((a, b) => (b.progress ?? -1) - (a.progress ?? -1));
}

// ── Booked ─────────────────────────────────────────────────────────────────

/** The stop fields the trips list sends (backend tripController list). */
export interface BookedStopLike {
  location_lat?: number | null;
  location_lng?: number | null;
  location?: { lat?: number | null; lng?: number | null } | null;
}

/** Scheduled / draft trips whose stops run A then B. */
export function bookedOnLane<T extends { stops?: BookedStopLike[] | null }>(trips: T[], from: LatLng, to: LatLng, km: number): T[] {
  return trips.filter((t) => {
    const points = (t.stops ?? []).map((s) => realPoint(s.location_lat ?? s.location?.lat, s.location_lng ?? s.location?.lng));
    return laneStopIndex(points, from, to, km) !== -1;
  });
}

// ── Take it ────────────────────────────────────────────────────────────────

/**
 * Free trucks for the next load from A: the "Find a truck" ranking around
 * A's centre. `inRange` are those within the catchment; `nearest` are the
 * closest anywhere, for when nothing is in range.
 */
export function freeTrucksAt(units: LiveUnit[], from: LatLng, km: number, now = Date.now()): { inRange: TruckCandidate[]; nearest: TruckCandidate[] } {
  const ranked = rankTrucksForTrip({ id: '', driver: null }, from, units, now);
  const inRange = ranked.filter((c) => c.km <= km);
  return { inRange, nearest: inRange.length ? [] : [...ranked].sort((a, b) => a.km - b.km).slice(0, 3) };
}

/** Hours of road at truck speed: the router times a car, and a loaded truck averages at most ~80 km/h. */
export function truckSeconds(route: { distanceMeters: number; durationSeconds: number }): number {
  return Math.max(route.durationSeconds, route.distanceMeters / (80 / 3.6));
}

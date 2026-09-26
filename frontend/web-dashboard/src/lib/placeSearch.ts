/**
 * Place-aware search for the Live map page: reads "riyadh to jeddah",
 * "near dammam" or a lone city name out of the search box, resolves Saudi
 * cities instantly from a local table, and ranks trucks and trips by how
 * close they are. Pure — the page adds geocoding for anything not in the table.
 */
import type { LiveUnit } from '@/services/fleetLiveService';
import type { Trip } from '@/services/tripService';
import { SAUDI_CITY_COORDS } from '@/services/travelTimeService';
import { haversineKm, isOffline } from '@/lib/fleetLive';

export interface Place {
  label: string;
  lat: number;
  lng: number;
  /** City centres get a wider catchment than an exact address. */
  kind: 'city' | 'address';
}

export type PlaceQuery =
  | { kind: 'route'; from: string; to: string }
  | { kind: 'near'; place: string }
  | { kind: 'text' };

/** "riyadh to jeddah", "riyadh → jeddah", "riyadh -> jeddah", "from riyadh to jeddah". */
const ROUTE_RE = /^(?:from\s+)?(.+?)\s*(?:\s+to\s+|→|->|–|—|\s-\s)\s*(.+)$/i;
/** "near dammam", "trucks near dammam", "around jubail". */
const NEAR_RE = /^(?:(?:trucks?|vehicles?|units?)\s+)?(?:near|around|close to|nearby)\s+(.+)$/i;

export function parsePlaceQuery(raw: string): PlaceQuery {
  const q = raw.trim().replace(/\s+/g, ' ');
  if (q.length < 3) return { kind: 'text' };
  const near = NEAR_RE.exec(q);
  if (near) return { kind: 'near', place: near[1].trim() };
  const route = ROUTE_RE.exec(q);
  if (route && route[1].trim().length >= 2 && route[2].trim().length >= 2) {
    return { kind: 'route', from: route[1].trim(), to: route[2].trim() };
  }
  return { kind: 'text' };
}

/** Spellings people actually type, mapped onto the city table's keys. */
const CITY_ALIASES: Record<string, string> = {
  jiddah: 'jeddah', jidda: 'jeddah', jedda: 'jeddah', jeda: 'jeddah', jdh: 'jeddah', jed: 'jeddah',
  ruh: 'riyadh', riyad: 'riyadh', riyaz: 'riyadh', ryadh: 'riyadh',
  dmm: 'dammam', damam: 'dammam',
  makka: 'makkah', mekkah: 'makkah', mekka: 'makkah',
  madina: 'madinah', medinah: 'madinah',
  khubar: 'khobar', 'al khobar': 'khobar',
  qaseem: 'qassim', gassim: 'qassim', buraydah: 'buraidah',
  jubayl: 'jubail', yenbo: 'yanbu', tabouk: 'tabuk', hufuf: 'hofuf', 'al hasa': 'ahsa', 'al ahsa': 'ahsa',
  'khamis mushait': 'khamis_mushait', 'al kharj': 'al_kharj', 'hafr al batin': 'hafr_al_batin',
};

const TITLE: Record<string, string> = {};
for (const key of Object.keys(SAUDI_CITY_COORDS)) {
  TITLE[key] = key.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[-_.,]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^(al|el) /, 'al ');
}

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

/**
 * A Saudi city by name, forgiving common spellings and a typo. Null when the
 * text isn't a city we know — the caller can geocode it instead.
 */
export function lookupCity(raw: string): Place | null {
  const n = normalize(raw);
  if (n.length < 3) return null;
  const underscored = n.replace(/ /g, '_');
  const noAl = n.replace(/^al /, '');
  const key =
    CITY_ALIASES[n] ?? CITY_ALIASES[noAl] ??
    (underscored in SAUDI_CITY_COORDS ? underscored : null) ??
    (noAl.replace(/ /g, '_') in SAUDI_CITY_COORDS ? noAl.replace(/ /g, '_') : null) ??
    fuzzyKey(noAl);
  if (!key) return null;
  const [lat, lng] = SAUDI_CITY_COORDS[key];
  return { label: TITLE[key], lat, lng, kind: 'city' };
}

function fuzzyKey(n: string): string | null {
  if (n.length < 5) return null;
  const budget = n.length >= 7 ? 2 : 1;
  let best: { key: string; d: number } | null = null;
  for (const key of Object.keys(SAUDI_CITY_COORDS)) {
    const d = editDistance(n, key.replace(/_/g, ' '));
    if (d <= budget && (!best || d < best.d)) best = { key, d };
  }
  return best?.key ?? null;
}

/** How far around a place counts as "there". */
export function defaultRadiusKm(p: Place): number {
  return p.kind === 'city' ? 50 : 25;
}

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return haversineKm(a, b);
}

export interface NearbyUnit {
  unit: LiveUnit;
  km: number;
}

/** Trucks within `radiusKm` of a place, closest first. Units with no position are left out. */
export function unitsNear(units: LiveUnit[], place: { lat: number; lng: number }, radiusKm: number): NearbyUnit[] {
  return units
    .filter((u) => u.position)
    .map((u) => ({ unit: u, km: haversineKm(u.position!, place) }))
    .filter((x) => x.km <= radiusKm)
    .sort((a, b) => a.km - b.km);
}

type StopLike = { location_lat: number | null; location_lng: number | null };

function stopNear(s: StopLike, p: { lat: number; lng: number }, radiusKm: number): boolean {
  return s.location_lat != null && s.location_lng != null && haversineKm({ lat: s.location_lat, lng: s.location_lng }, p) <= radiusKm;
}

/** Trips with any stop within `radiusKm` of a place. */
export function tripsTouching(trips: Trip[], place: { lat: number; lng: number }, radiusKm: number): Trip[] {
  return trips.filter((t) => (t.stops ?? []).some((s) => stopNear(s, place, radiusKm)));
}

/**
 * Trips that run from A to B: a stop near A with a later stop near B.
 * Stop order matters — Jeddah→Riyadh is not a Riyadh→Jeddah trip.
 */
export function tripsOnRoute(
  trips: Trip[],
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  radiusKm: number,
): Trip[] {
  return trips.filter((t) => {
    const stops = t.stops ?? [];
    const i = stops.findIndex((s) => stopNear(s, from, radiusKm));
    if (i === -1) return false;
    return stops.slice(i + 1).some((s) => stopNear(s, to, radiusKm));
  });
}

/* ─── Nearest free truck for a trip ─────────────────────────────────────── */

export interface TruckCandidate {
  unit: LiveUnit;
  /** Straight-line km to the pickup. */
  km: number;
  /** The driver who would go with the truck — the trip's own, or the truck's standing driver. */
  driver: { id: string; name: string } | null;
  /** Why the one-click assign would need a human instead. */
  blocker: string | null;
  /** Soft warnings shown on the row. */
  notes: string[];
  /** Driver's preferred truck, from the recommendation endpoint. */
  preferred: 'PRIMARY' | 'BACKUP' | 'TEMPORARY' | null;
}

export function isFreeTruck(u: LiveUnit): boolean {
  return !!u.vehicle && u.vehicle.status === 'Available' && (!u.trip || u.trip.phase === 'upcoming');
}

/**
 * Free trucks ranked for a trip's pickup. The trip's own driver goes with
 * whichever truck is picked; without one, the truck's standing driver does,
 * when they are available. Offline and preferred trucks are ranked honestly:
 * a preferred truck gets a nudge, a stale position a small penalty.
 */
export function rankTrucksForTrip(
  trip: Pick<Trip, 'id' | 'driver'>,
  pickup: { lat: number; lng: number },
  units: LiveUnit[],
  preferences: Map<string, 'PRIMARY' | 'BACKUP' | 'TEMPORARY'> = new Map(),
): TruckCandidate[] {
  const tripDriver = trip.driver ? { id: trip.driver.id, name: `${trip.driver.first_name} ${trip.driver.last_name}`.trim() } : null;
  const out: TruckCandidate[] = [];
  for (const u of units) {
    if (!u.vehicle || !u.position || !isFreeTruck(u)) continue;
    if (u.trip?.id === trip.id) continue;
    const km = haversineKm(u.position, pickup);
    const notes: string[] = [];
    let blocker: string | null = null;
    let driver = tripDriver;
    if (!driver) {
      if (!u.driver) blocker = 'No driver on this truck';
      else if (u.driver.status && u.driver.status !== 'Available') blocker = `${u.driver.name} is ${u.driver.status === 'OnTrip' ? 'on a trip' : u.driver.status}`;
      else driver = { id: u.driver.id, name: u.driver.name };
    }
    if (u.trip?.phase === 'upcoming') notes.push(`Booked for ${u.trip.ref_id ?? 'another trip'}`);
    if (isOffline(u)) notes.push('Position may be old');
    out.push({ unit: u, km, driver, blocker, notes, preferred: preferences.get(u.vehicle.id) ?? null });
  }
  const score = (c: TruckCandidate) =>
    c.km * (c.preferred === 'PRIMARY' ? 0.6 : c.preferred ? 0.8 : 1) + (isOffline(c.unit) ? 30 : 0) + (c.unit.trip ? 40 : 0) + (c.blocker ? 1000 : 0);
  return out.sort((a, b) => score(a) - score(b));
}

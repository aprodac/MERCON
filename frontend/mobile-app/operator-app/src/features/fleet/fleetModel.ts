/**
 * Pure helpers for the Fleet map, ported from the web live map
 * (web-dashboard lib/fleetLive.ts and lib/placeSearch.ts) so both apps answer
 * the same questions the same way: which filter a truck is in, what a search
 * matches, where a city is, the ETA to the next stop and the WhatsApp text.
 */
import type { LiveUnit } from '../../lib/operator';
import { SAUDI_CITY_COORDS } from '../trips/services/travelTimeService';

export type FleetFilter = 'all' | 'on_trip' | 'delayed' | 'free' | 'free_soon' | 'long_stop' | 'silent';

/** GPS older than this counts as silent (same threshold as Home's Needs action). */
const QUIET_MS = 30 * 60_000;

export const onTrip = (u: LiveUnit) => !!u.trip && u.trip.phase !== 'upcoming';
export const isDelayed = (u: LiveUnit) => u.trip?.phase === 'delayed';
export const isFree = (u: LiveUnit) => !u.trip || u.trip.phase === 'upcoming';
export function isSilent(u: LiveUnit, now = Date.now()): boolean {
  const seen = u.position?.recorded_at ? new Date(u.position.recorded_at).getTime() : 0;
  return !u.position || now - seen > QUIET_MS;
}

/** Has a real fix (not missing, not the 0,0 a dead tracker reports). */
export const located = (u: LiveUnit) =>
  !!u.position && Number.isFinite(u.position.lat) && Number.isFinite(u.position.lng) && !(u.position.lat === 0 && u.position.lng === 0);

// ── What needs a look: late, ending soon, stopped long, feeds apart ─────────

/** Minutes a delayed truck is past its next stop's planned arrival; null when not late or unknown. */
export function lateMin(u: LiveUnit, now = Date.now()): number | null {
  if (!isDelayed(u)) return null;
  const due = nextStop(u)?.planned_arrival;
  if (!due) return null;
  const min = Math.round((now - new Date(due).getTime()) / 60000);
  return min > 0 ? min : null;
}

/** "+40m" · "+2h 10m" · "+1d 3h" — compact, for a chip on the map. */
export function lateText(min: number): string {
  if (min < 60) return `+${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `+${h}h${min % 60 ? ` ${min % 60}m` : ''}`;
  return `+${Math.floor(h / 24)}d${h % 24 ? ` ${h % 24}h` : ''}`;
}

/** Stops reached of all stops, for a running trip of two or more stops. */
export function tripProgress(u: LiveUnit): { done: number; total: number } | null {
  if (!onTrip(u) || !u.trip || u.trip.stops.length < 2) return null;
  return { done: u.trip.stops.filter((x) => x.actual_arrival).length, total: u.trip.stops.length };
}

/** When the running trip should be over: its last stop's planned arrival, else its planned end. */
export function freeAt(u: LiveUnit): number | null {
  if (!onTrip(u) || !u.trip) return null;
  const last = u.trip.stops[u.trip.stops.length - 1];
  const iso = last?.planned_arrival ?? u.trip.planned_end;
  return iso ? new Date(iso).getTime() : null;
}

/** A truck whose trip ends within this — the one to promise to the next job. */
export const FREE_SOON_MIN = 60;

/** On a trip that's on time and due to end within the hour (a delayed one can't be promised). */
export function isFreeSoon(u: LiveUnit, now = Date.now()): boolean {
  if (!u.vehicle || isDelayed(u) || isSilent(u, now)) return false;
  const at = freeAt(u);
  return at != null && at >= now - 15 * 60_000 && at <= now + FREE_SOON_MIN * 60_000;
}

/** Stopped this long on a running trip, away from its stops, is worth a look. */
export const LONG_STOP_MIN = 30;
/** Within this of one of its stops a truck is working, not stuck. */
const AT_STOP_KM = 0.5;

/** Minutes a running trip's truck has stood still (from the driver app's GPS); null when moving or unknown. */
export function stoppedMin(u: LiveUnit, now = Date.now()): number | null {
  if (!u.stopped_since || u.motion !== 'idle') return null;
  return Math.max(0, Math.round((now - new Date(u.stopped_since).getTime()) / 60000));
}

/** Stopped 30 min+ on a running trip, and not at one of its stops — a breakdown or an unplanned stop. */
export function isLongStop(u: LiveUnit, now = Date.now()): boolean {
  const min = stoppedMin(u, now);
  if (min == null || min < LONG_STOP_MIN || !onTrip(u) || !u.position) return false;
  return !(u.trip?.stops ?? []).some((x) => x.lat != null && x.lng != null && haversineKm(u.position!, { lat: x.lat, lng: x.lng }) <= AT_STOP_KM);
}

/** Tracker and driver phone both live but over a kilometre apart — the driver may not be with the truck. */
export const FEEDS_APART_M = 1000;
export const feedsApart = (u: LiveUnit) => (u.feeds_gap_m ?? 0) > FEEDS_APART_M;

/** "45m" · "2h 5m" — how long, compact. */
export function minText(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  return `${h}h${min % 60 ? ` ${min % 60}m` : ''}`;
}

export function matchesFilter(u: LiveUnit, f: FleetFilter, now = Date.now()): boolean {
  switch (f) {
    case 'all': return true;
    case 'on_trip': return onTrip(u);
    case 'delayed': return isDelayed(u);
    case 'free': return isFree(u);
    case 'free_soon': return isFreeSoon(u, now);
    case 'long_stop': return isLongStop(u, now);
    case 'silent': return isSilent(u, now);
  }
}

export function matchesQuery(u: LiveUnit, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return [u.vehicle?.plate_number, u.vehicle?.ref_id, u.driver?.name, u.driver?.ref_id, u.trip?.ref_id, u.trip?.customer_name]
    .some((v) => v?.toLowerCase().includes(s));
}

/** How much a truck matters in a list: delayed, then running, then planned, then free; moving before parked. */
export function unitPriority(u: LiveUnit): number {
  const phase = u.trip?.phase;
  const base = phase === 'delayed' ? 40 : phase === 'active' ? 30 : phase === 'upcoming' ? 20 : 10;
  return base + (u.motion === 'moving' ? 5 : u.motion === 'idle' ? 3 : 0);
}

export const nextStop = (u: LiveUnit) => (u.trip && u.trip.next_stop_index != null ? u.trip.stops[u.trip.next_stop_index] ?? null : null);

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function formatKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

export function formatDuration(seconds: number): string {
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  // Past two days, hours and minutes stop being useful: "4 d 16 h".
  if (h >= 48) return `${Math.floor(h / 24)} d${h % 24 ? ` ${h % 24} h` : ''}`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function agoText(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'never';
  const min = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  return h < 48 ? `${h} h ago` : `${Math.floor(h / 24)} days ago`;
}

/** "12m" / "3h" / "2d" — the age tag under a truck that isn't live (web `shortAgo`). */
export function shortAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const min = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

// ── ETA ─────────────────────────────────────────────────────────────────────

export interface EtaInfo {
  /** Arrival at the next stop: road drive time, or an approximate one when routing is down; null when the stop can't be placed. */
  arrival: Date | null;
  durationSeconds: number | null;
  /** Road distance when routed, an estimated road distance otherwise. */
  distanceKm: number | null;
  distanceIsRoad: boolean;
  /** No road route: arrival and distance are estimated from the straight line (≈ prefix in the card). */
  approx: boolean;
  /** The next stop is further than any Gulf trip could be — its map location is wrong, so nothing is estimated. */
  stopLooksWrong: boolean;
  /** Minutes late against the stop's planned arrival (road ETA only); negative = early. */
  lateByMin: number | null;
}

/** Roads run about this much longer than the straight line. */
const ROAD_FACTOR = 1.3;
/** A loaded truck's average over a long run, km/h (used only when routing is down). */
const APPROX_KPH = 70;
/** No trip in the Gulf is this far as the crow flies; a next stop further away was placed wrong. */
const IMPLAUSIBLE_KM = 2500;

export function computeEta(u: LiveUnit, route: { distanceMeters: number; durationSeconds: number } | null, now = Date.now()): EtaInfo | null {
  const stop = nextStop(u);
  if (!stop || !u.position) return null;
  const straight = stop.lat != null && stop.lng != null ? haversineKm(u.position, { lat: stop.lat, lng: stop.lng }) : null;
  if (route) {
    const arrival = new Date(now + route.durationSeconds * 1000);
    const lateByMin = stop.planned_arrival ? Math.round((arrival.getTime() - new Date(stop.planned_arrival).getTime()) / 60000) : null;
    return { arrival, durationSeconds: route.durationSeconds, distanceKm: route.distanceMeters / 1000, distanceIsRoad: true, approx: false, stopLooksWrong: false, lateByMin };
  }
  if (straight == null || straight > IMPLAUSIBLE_KM) {
    return { arrival: null, durationSeconds: null, distanceKm: null, distanceIsRoad: false, approx: false, stopLooksWrong: straight != null, lateByMin: null };
  }
  // Routing is down: a rough drive time from the straight line, never "—".
  const km = straight * ROAD_FACTOR;
  const sec = Math.round((km / APPROX_KPH) * 3600);
  return { arrival: new Date(now + sec * 1000), durationSeconds: sec, distanceKm: km, distanceIsRoad: false, approx: true, stopLooksWrong: false, lateByMin: null };
}

/** Five minutes of slack before an arrival counts as late. */
export function punctuality(lateByMin: number | null): { label: string; good: boolean } | null {
  if (lateByMin == null) return null;
  return lateByMin <= 5 ? { label: 'On time', good: true } : { label: `${formatDuration(lateByMin * 60)} late`, good: false };
}

// ── City search ─────────────────────────────────────────────────────────────

export interface Place { label: string; lat: number; lng: number }

/** Spellings people actually type, mapped onto the city table's keys. */
const CITY_ALIASES: Record<string, string> = {
  jiddah: 'jeddah', jidda: 'jeddah', jedda: 'jeddah', jeda: 'jeddah', jed: 'jeddah',
  ruh: 'riyadh', riyad: 'riyadh', ryadh: 'riyadh',
  dmm: 'dammam', damam: 'dammam',
  makka: 'makkah', mekkah: 'makkah', mekka: 'makkah', mecca: 'makkah',
  madina: 'madinah', medina: 'madinah', medinah: 'madinah',
  khubar: 'khobar', 'al khobar': 'khobar',
  qaseem: 'qassim', gassim: 'qassim', buraydah: 'buraidah',
  jubayl: 'jubail', yenbo: 'yanbu', tabouk: 'tabuk', hufuf: 'hofuf', 'al hasa': 'ahsa', 'al ahsa': 'ahsa',
  'khamis mushait': 'khamis_mushait', 'khamis mushayt': 'khamis_mushait', 'al kharj': 'al_kharj', 'hafr al batin': 'hafr_al_batin',
};

const normalize = (s: string) => s.toLowerCase().replace(/[-_.,]/g, ' ').replace(/\s+/g, ' ').trim();
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

/** "near dammam", "trucks around jubail" or a lone city name → the city; null when it isn't one we know. */
export function placeFromQuery(raw: string): Place | null {
  const near = /^(?:(?:trucks?|vehicles?)\s+)?(?:near|around|close to|in)\s+(.+)$/i.exec(raw.trim());
  const n = normalize(near ? near[1] : raw).replace(/^al /, (m) => (near ? m : m));
  if (n.length < 3) return null;
  const candidates = [n, n.replace(/^al /, '')];
  for (const c of candidates) {
    const key = CITY_ALIASES[c] ?? (c.replace(/ /g, '_') in SAUDI_CITY_COORDS ? c.replace(/ /g, '_') : null);
    if (key && SAUDI_CITY_COORDS[key]) {
      const [lat, lng] = SAUDI_CITY_COORDS[key];
      return { label: titleOf(key), lat, lng };
    }
  }
  // One typo allowed for longer names ("damman", "jedah").
  const plain = candidates[1];
  if (plain.length >= 5) {
    let best: { key: string; d: number } | null = null;
    for (const key of Object.keys(SAUDI_CITY_COORDS)) {
      const d = editDistance(plain, key.replace(/_/g, ' '));
      if (d <= (plain.length >= 7 ? 2 : 1) && (!best || d < best.d)) best = { key, d };
    }
    if (best) {
      const [lat, lng] = SAUDI_CITY_COORDS[best.key];
      return { label: titleOf(best.key), lat, lng };
    }
  }
  return null;
}

/** Catchment around a city centre. */
export const NEAR_KM = 50;

// ── Nearest free truck for a trip ──────────────────────────────────────────
// Same rules as the web's "Find a truck" (web-dashboard lib/placeSearch.ts).

export interface TruckCandidate {
  unit: LiveUnit;
  /** Straight-line km to the pickup. */
  km: number;
  /** Who goes with the truck — the trip's own driver, or the truck's standing driver. */
  driver: { id: string; name: string } | null;
  /** Why a one-tap assign would need a human instead. */
  blocker: string | null;
  /** Soft warnings shown on the row. */
  notes: string[];
}

export const isFreeTruck = (u: LiveUnit) => !!u.vehicle && u.vehicle.status === 'Available' && (!u.trip || u.trip.phase === 'upcoming');

/**
 * Free trucks ranked for a trip's pickup, closest first. A stale position or a
 * truck already booked for a later trip costs it a little; one that can't be
 * sent in one tap (no driver to go with it) sinks to the bottom.
 */
export function rankTrucksForTrip(
  trip: { id: string; driver: { id: string; name: string } | null },
  pickup: { lat: number; lng: number },
  units: LiveUnit[],
  now = Date.now(),
): TruckCandidate[] {
  const out: TruckCandidate[] = [];
  for (const u of units) {
    if (!u.vehicle || !located(u) || !isFreeTruck(u) || u.trip?.id === trip.id) continue;
    const notes: string[] = [];
    let blocker: string | null = null;
    let driver = trip.driver;
    if (!driver) {
      if (!u.driver) blocker = 'No driver on this truck';
      else if (u.driver.status && u.driver.status !== 'Available') blocker = `${u.driver.name} is ${u.driver.status === 'OnTrip' ? 'on a trip' : u.driver.status}`;
      else driver = { id: u.driver.id, name: u.driver.name };
    }
    if (u.trip?.phase === 'upcoming') notes.push(`Booked for ${u.trip.ref_id ?? 'another trip'}`);
    if (isSilent(u, now)) notes.push('Position may be old');
    out.push({ unit: u, km: haversineKm(u.position!, pickup), driver, blocker, notes });
  }
  const score = (c: TruckCandidate) => c.km + (isSilent(c.unit, now) ? 30 : 0) + (c.unit.trip ? 40 : 0) + (c.blocker ? 1000 : 0);
  return out.sort((a, b) => score(a) - score(b));
}

/**
 * Pure helpers for the Fleet map. The rules themselves — on trip / delayed /
 * free, silent GPS, late, stopped long, the ETA and its estimate, truck
 * speed, what counts as late — are the shared ones in @mercon/shared-types
 * fleetRules, the very code the web live map and the API's late alerts run.
 * What's here is the phone's own: its filters, search, city lookup, labels.
 */
import {
  formatDriveTime,
  haversineKm,
  isDelayed,
  isFree,
  isLongStop,
  isSilent,
  located,
  onTrip,
  punctuality as sharedPunctuality,
} from '@mercon/shared-types';
import type { LiveUnit } from '../../lib/operator';
import { SAUDI_CITY_COORDS } from '../trips/services/travelTimeService';

export {
  computeEta, feedsApart, FEEDS_APART_M, formatKm, haversineKm, isDelayed, isFree, isLongStop, isSilent, lateMin, located,
  LONG_STOP_MIN, nextStop, onTrip, stoppedMin, truckDriveSeconds, type EtaInfo,
} from '@mercon/shared-types';

/** "45 min" · "2 h 5 min" · "3 d 4 h" (shared fleetRules). */
export const formatDuration = formatDriveTime;

export type FleetFilter = 'all' | 'on_trip' | 'delayed' | 'free' | 'free_soon' | 'long_stop' | 'silent';

// ── What needs a look: late, ending soon, stopped long, feeds apart ─────────

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

/** "On time" / "40 min late" (shared grace), in the phone's shape. */
export function punctuality(lateByMin: number | null): { label: string; good: boolean } | null {
  const p = sharedPunctuality(lateByMin);
  return p ? { label: p.label, good: !p.late } : null;
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

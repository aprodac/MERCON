/**
 * Pure helpers behind the dashboard's live fleet map — naming, filtering,
 * ETA maths and the WhatsApp ETA message. Kept out of the component so they
 * can be tested without a map.
 */
import type { LiveStop, LiveUnit } from '@/services/fleetLiveService';

export type LiveFilter = 'all' | 'on_trip' | 'delayed' | 'free' | 'offline';

export const LIVE_FILTERS: { id: LiveFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'on_trip', label: 'On trip' },
  { id: 'delayed', label: 'Delayed' },
  { id: 'free', label: 'Free' },
  { id: 'offline', label: 'Offline' },
];

/** Offline means no live feed — a stale fix or none at all. */
export function isOffline(u: LiveUnit): boolean {
  return u.motion === 'stale' || u.motion === 'no_signal';
}

export function matchesFilter(u: LiveUnit, f: LiveFilter): boolean {
  switch (f) {
    case 'all': return true;
    case 'on_trip': return !!u.trip && u.trip.phase !== 'upcoming';
    case 'delayed': return u.trip?.phase === 'delayed';
    case 'free': return !u.trip || u.trip.phase === 'upcoming';
    case 'offline': return isOffline(u);
  }
}

export function matchesQuery(u: LiveUnit, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return [u.vehicle?.plate_number, u.vehicle?.ref_id, u.driver?.name, u.driver?.ref_id, u.trip?.ref_id, u.trip?.customer_name]
    .some((v) => v?.toLowerCase().includes(s));
}

/** Plate first — it is what operators say out loud — then the driver. */
export function unitTitle(u: LiveUnit): string {
  return u.vehicle?.plate_number ?? u.driver?.name ?? 'Unknown';
}

export function nextStop(u: LiveUnit): LiveStop | null {
  const i = u.trip?.next_stop_index;
  return i == null ? null : u.trip!.stops[i] ?? null;
}

export function stopLabel(s: LiveStop): string {
  return s.name || s.address || `Stop ${s.sequence}`;
}

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
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'never';
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export interface EtaInfo {
  /** Arrival instant at the next stop, from road drive time. Null when routing is unavailable. */
  arrival: Date | null;
  durationSeconds: number | null;
  /** Road distance when routed, straight-line otherwise. */
  distanceKm: number | null;
  distanceIsRoad: boolean;
  /** Minutes late against the stop's planned arrival; negative = early. Null when either side is unknown. */
  lateByMin: number | null;
}

export function computeEta(
  u: LiveUnit,
  route: { distanceMeters: number; durationSeconds: number } | null,
  now = Date.now(),
): EtaInfo | null {
  const stop = nextStop(u);
  if (!stop || !u.position) return null;
  const arrival = route ? new Date(now + route.durationSeconds * 1000) : null;
  const distanceKm = route
    ? route.distanceMeters / 1000
    : stop.lat != null && stop.lng != null
      ? haversineKm(u.position, { lat: stop.lat, lng: stop.lng })
      : null;
  const lateByMin =
    arrival && stop.planned_arrival
      ? Math.round((arrival.getTime() - new Date(stop.planned_arrival).getTime()) / 60000)
      : null;
  return { arrival, durationSeconds: route?.durationSeconds ?? null, distanceKm, distanceIsRoad: !!route, lateByMin };
}

/** Five minutes of slack before an arrival counts as late. */
export const LATE_GRACE_MIN = 5;

export function punctuality(lateByMin: number | null): { label: string; tone: 'good' | 'bad' } | null {
  if (lateByMin == null) return null;
  if (lateByMin <= LATE_GRACE_MIN) return { label: 'On time', tone: 'good' };
  return { label: `${formatDuration(lateByMin * 60)} late`, tone: 'bad' };
}

/** The WhatsApp message — ETA only, by request; no live-tracking link. */
export function buildEtaShareText(u: LiveUnit, eta: EtaInfo | null, formatTime: (d: Date) => string): string {
  const stop = nextStop(u);
  const head = [u.trip?.ref_id, u.vehicle?.plate_number].filter(Boolean).join(' · ') || unitTitle(u);
  const lines = [`*${head}*`];
  if (stop) lines.push(`Next stop: ${stopLabel(stop)}`);
  if (eta?.arrival && eta.durationSeconds != null) {
    const dist = eta.distanceKm != null ? ` · ${formatKm(eta.distanceKm)}` : '';
    lines.push(`ETA: ${formatTime(eta.arrival)} (in ${formatDuration(eta.durationSeconds)})${dist}`);
  } else if (eta?.distanceKm != null) {
    lines.push(`Distance: about ${formatKm(eta.distanceKm)}`);
  }
  if (u.driver?.name) lines.push(`Driver: ${u.driver.name}`);
  return lines.join('\n');
}

/** How much a unit matters on a crowded map — decides which labels survive and a group's colour. */
export function unitPriority(u: LiveUnit): number {
  const phase = u.trip?.phase;
  const base = phase === 'delayed' ? 40 : phase === 'active' ? 30 : phase === 'upcoming' ? 20 : 10;
  return base + (u.motion === 'moving' ? 5 : u.motion === 'idle' ? 3 : 0);
}

export interface LabelCandidate {
  key: string;
  /** Screen position of the marker centre, in px. */
  x: number;
  y: number;
  priority: number;
  /** Approximate label width in px. */
  width: number;
}

/**
 * Greedy label placement: highest priority first, a label is kept only if its
 * box (drawn centred under the marker) overlaps no kept label or marker.
 */
export function pickLabels(items: LabelCandidate[], opts = { markerRadius: 17, labelHeight: 18, gap: 2 }): Set<string> {
  const { markerRadius: r, labelHeight: h, gap } = opts;
  type Box = [number, number, number, number];
  const hits = (a: Box, b: Box) => a[0] < b[2] + gap && b[0] < a[2] + gap && a[1] < b[3] + gap && b[1] < a[3] + gap;
  const markers: Box[] = items.map((i) => [i.x - r, i.y - r, i.x + r, i.y + r]);
  const kept: Box[] = [];
  const out = new Set<string>();
  const order = items.map((it, idx) => ({ it, idx })).sort((a, b) => b.it.priority - a.it.priority);
  for (const { it, idx } of order) {
    const box: Box = [it.x - it.width / 2, it.y + r, it.x + it.width / 2, it.y + r + h];
    if (kept.some((k) => hits(box, k))) continue;
    if (markers.some((m, j) => j !== idx && hits(box, m))) continue;
    kept.push(box);
    out.add(it.key);
  }
  return out;
}

export interface StopGroup {
  lat: number;
  lng: number;
  /** 1-based stop numbers at this spot, in trip order. */
  numbers: number[];
  name: string;
  done: boolean;
  isNext: boolean;
}

/** Stops at the same place (two Riyadh drops) share one pin — "4·5" — instead of hiding each other. */
export function groupStops(u: LiveUnit): StopGroup[] {
  return u.trip ? groupStopsOf(u.trip) : [];
}

/** Same as groupStops, for a trip without a live unit (planned, finished, cancelled). */
export function groupStopsOf(trip: { stops: LiveStop[]; next_stop_index: number | null }): StopGroup[] {
  const groups = new Map<string, StopGroup>();
  trip.stops.forEach((s, i) => {
    if (s.lat == null || s.lng == null) return;
    const k = `${s.lat.toFixed(3)},${s.lng.toFixed(3)}`;
    const isNext = i === trip.next_stop_index;
    const g = groups.get(k);
    if (g) {
      g.numbers.push(i + 1);
      g.done = g.done && s.actual_arrival != null;
      g.isNext = g.isNext || isNext;
    } else {
      groups.set(k, { lat: s.lat, lng: s.lng, numbers: [i + 1], name: stopLabel(s), done: s.actual_arrival != null, isNext });
    }
  });
  return [...groups.values()];
}

/** "3h" / "12m" — for the small age tag under an offline marker. */
export function shortAgo(iso: string | null | undefined, now = Date.now()): string {
  return timeAgo(iso, now).replace(' ago', '');
}

/** Compass bearing in degrees (0 = north, clockwise) from a to b. */
export function bearingBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Which way the road leads out of the route's first point — the direction a
 * stopped truck will drive off in, for the driver view when there's no heading.
 * Looks past the first few metres so a GPS wobble at the start doesn't decide it.
 */
export function routeBearing(coords: [number, number][], minMeters = 40): number | null {
  if (coords.length < 2) return null;
  const start = { lng: coords[0][0], lat: coords[0][1] };
  for (const [lng, lat] of coords.slice(1)) {
    if (haversineKm(start, { lat, lng }) * 1000 >= minMeters) return bearingBetween(start, { lat, lng });
  }
  const [lng, lat] = coords[coords.length - 1];
  return haversineKm(start, { lat, lng }) > 0 ? bearingBetween(start, { lat, lng }) : null;
}

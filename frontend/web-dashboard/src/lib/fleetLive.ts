/**
 * Pure helpers behind the dashboard's live fleet map — naming, filtering,
 * ETA maths and the WhatsApp ETA message. Kept out of the component so they
 * can be tested without a map.
 *
 * The rules themselves (on trip / delayed / free, the ETA and its estimate,
 * truck speed, what counts as late) are the shared ones in
 * @mercon/shared-types fleetRules — the operator app and the API's late
 * alerts use the very same code. Only the web's own shapes are added here.
 */
import {
  computeEta as sharedComputeEta,
  formatDriveTime,
  formatKm,
  haversineKm,
  isDelayed,
  isFree,
  nextStop as sharedNextStop,
  onTrip,
  punctuality as sharedPunctuality,
  type EtaInfo,
} from '@mercon/shared-types';
import type { LiveStop, LiveUnit } from '@/services/fleetLiveService';

export { formatKm, haversineKm, LATE_GRACE_MIN, truckDriveSeconds, TRUCK_MAX_KPH as TRUCK_MAX_AVG_KMH, type EtaInfo } from '@mercon/shared-types';

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
    case 'on_trip': return onTrip(u);
    case 'delayed': return isDelayed(u);
    case 'free': return isFree(u);
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

export const nextStop = (u: LiveUnit): LiveStop | null => sharedNextStop(u);

export function stopLabel(s: LiveStop): string {
  return s.name || s.address || `Stop ${s.sequence}`;
}

/** Drive time as "45 min" · "2 h 5 min" · "3 d 4 h" (shared fleetRules). */
export const formatDuration = formatDriveTime;

export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'never';
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** ETA to the next stop — the shared rule; `now` should be the route's `computedAt`. */
export const computeEta = (u: LiveUnit, route: { distanceMeters: number; durationSeconds: number } | null, now = Date.now()): EtaInfo | null =>
  sharedComputeEta(u, route, now);

/** "On time" / "15 min late" (shared grace), with the web's tone. */
export function punctuality(lateByMin: number | null): { label: string; tone: 'good' | 'bad' } | null {
  const p = sharedPunctuality(lateByMin);
  return p ? { label: p.label, tone: p.late ? 'bad' : 'good' } : null;
}

/** The WhatsApp ETA message, ending with the trip's customer tracking link when there is one. */
export function buildEtaShareText(u: LiveUnit, eta: EtaInfo | null, formatTime: (d: Date) => string, trackingUrl?: string | null): string {
  const stop = nextStop(u);
  const head = [u.trip?.ref_id, u.vehicle?.plate_number].filter(Boolean).join(' · ') || unitTitle(u);
  const lines = [`*${head}*`];
  if (stop) lines.push(`Next stop: ${stopLabel(stop)}`);
  if (eta?.arrival && eta.durationSeconds != null && eta.approx) {
    // No road route: say it's an estimate rather than promise a minute.
    lines.push(`ETA: around ${formatTime(eta.arrival)} (about ${formatDuration(eta.durationSeconds)}, estimate)`);
  } else if (eta?.arrival && eta.durationSeconds != null) {
    const dist = eta.distanceKm != null ? ` · ${formatKm(eta.distanceKm)}` : '';
    lines.push(`ETA: ${formatTime(eta.arrival)} (in ${formatDuration(eta.durationSeconds)})${dist}`);
  } else if (eta?.distanceKm != null) {
    lines.push(`Distance: about ${formatKm(eta.distanceKm)}`);
  }
  if (u.driver?.name) lines.push(`Driver: ${u.driver.name}`);
  if (trackingUrl) lines.push('', `Track live: ${trackingUrl}`);
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

/**
 * Pins that would overlap on screen at the current zoom share one pin — e.g.
 * Khamis Mushayt and Muhayil seen from far away become "Khamis Mushayt · Muhayil"
 * with stops 1–4 — and split again as the map zooms in. `project` turns a
 * place into screen pixels; `minPx` is how close two pins may be.
 */
export function mergeNearbyStops(groups: StopGroup[], project: (lat: number, lng: number) => [number, number], minPx = 64): StopGroup[] {
  const placed = groups.map((g) => ({ g, p: project(g.lat, g.lng) }));
  const clusters: { members: typeof placed; x: number; y: number }[] = [];
  for (const item of placed) {
    const c = clusters.find((k) => Math.hypot(k.x - item.p[0], k.y - item.p[1]) < minPx);
    if (c) c.members.push(item);
    else clusters.push({ members: [item], x: item.p[0], y: item.p[1] });
  }
  return clusters.map(({ members }) => {
    if (members.length === 1) return members[0].g;
    const gs = members.map((m) => m.g);
    const names = [...new Set(gs.map((g) => g.name))];
    return {
      lat: gs.reduce((s, g) => s + g.lat, 0) / gs.length,
      lng: gs.reduce((s, g) => s + g.lng, 0) / gs.length,
      numbers: gs.flatMap((g) => g.numbers).sort((a, b) => a - b),
      name: names.join(' · '),
      done: gs.every((g) => g.done),
      isNext: gs.some((g) => g.isNext),
    };
  });
}

/** Stop numbers on a pin: runs become ranges — [1,2,3,4] → "1–4", [1,4] → "1·4". */
export function stopNumbersLabel(numbers: number[]): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(j - i >= 2 ? `${sorted[i]}–${sorted[j]}` : sorted.slice(i, j + 1).join('·'));
    i = j + 1;
  }
  return parts.join('·');
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

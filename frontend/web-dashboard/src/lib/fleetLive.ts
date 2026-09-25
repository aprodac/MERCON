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

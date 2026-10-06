/**
 * Where a trip's truck stood still, and for how long — from the driver app's
 * GPS history (TripLocation), the only feed with history.
 *
 * A halt is HALT_MIN_MIN or more within HALT_RADIUS_M of where it began (a
 * light or a queue is shorter). Gaps in the GPS while the truck sits still
 * (phones send less when not moving) are part of the halt; a gap that ends far
 * away is not a halt, just no signal. Each halt is at one of the trip's stops
 * (loading, unloading — within AT_STOP_KM) or a break on the way (rest,
 * prayer, food, fuel, or trouble). The last one is `ongoing` while the truck is
 * still there.
 *
 * Totals split the trip so far into driving, at stops and breaks.
 */
import { AT_STOP_KM, haversineKm } from '@mercon/shared-types';

/** Standing still this long counts as a halt. */
export const HALT_MIN_MIN = 5;
/** Moving no further than this from where it stopped is still the same halt (GPS wanders). */
export const HALT_RADIUS_M = 150;
/** A latest fix older than this: the truck may have left since — the halt isn't "ongoing". */
const ONGOING_MAX_AGE_MIN = 30;
/** A silence longer than this before the next fix (far away) — the phone stopped sending while parked. */
const SILENT_GAP_MIN = 10;
/** Average speed assumed to cover the distance to that next fix, to estimate when the truck left. */
const LEAVE_KPH = 70;

export interface HaltPoint { lat: number; lng: number; recordedAt: Date }
export interface HaltStop { id: string; lat: number | null; lng: number | null }

export interface TripHalt {
  lat: number;
  lng: number;
  from: string;
  to: string;
  minutes: number;
  /** One of the trip's stops (loading / unloading there), or a break on the way. */
  kind: 'at_stop' | 'break';
  stop_id: string | null;
  /** The truck is still standing here (latest fix). */
  ongoing: boolean;
}

export interface TripTimeSplit {
  /** First to latest GPS fix of the trip. */
  total_min: number;
  driving_min: number;
  at_stops_min: number;
  breaks_min: number;
  breaks: number;
}

const minutesBetween = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 60000;

export function detectHalts(points: HaltPoint[], stops: HaltStop[], now = new Date()): { halts: TripHalt[]; split: TripTimeSplit | null } {
  const pts = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && !(p.lat === 0 && p.lng === 0));
  if (pts.length < 2) return { halts: [], split: null };

  const halts: TripHalt[] = [];
  let i = 0;
  while (i < pts.length) {
    const anchor = pts[i];
    let j = i;
    while (j + 1 < pts.length && haversineKm(anchor, pts[j + 1]) * 1000 <= HALT_RADIUS_M) j++;
    const last = pts[j];
    const isLatest = j === pts.length - 1;
    const ongoing = isLatest && minutesBetween(last.recordedAt, now) <= ONGOING_MAX_AGE_MIN;
    let end = ongoing ? now : last.recordedAt;
    const next = pts[j + 1];
    if (next && minutesBetween(last.recordedAt, next.recordedAt) > SILENT_GAP_MIN) {
      // Phones send little while parked: if the next fix came long after and only so far away,
      // the truck stood here until about (next fix − the time to drive there).
      const left = new Date(next.recordedAt.getTime() - (haversineKm(last, next) / LEAVE_KPH) * 3600_000);
      if (left > end) end = left;
    }
    const minutes = minutesBetween(anchor.recordedAt, end);
    if (minutes >= HALT_MIN_MIN) {
      const cluster = pts.slice(i, j + 1);
      const lat = cluster.reduce((s, p) => s + p.lat, 0) / cluster.length;
      const lng = cluster.reduce((s, p) => s + p.lng, 0) / cluster.length;
      const stop = stops.find((s) => s.lat != null && s.lng != null && haversineKm({ lat, lng }, { lat: s.lat, lng: s.lng }) <= AT_STOP_KM);
      halts.push({
        lat, lng,
        from: anchor.recordedAt.toISOString(),
        to: end.toISOString(),
        minutes: Math.round(minutes),
        kind: stop ? 'at_stop' : 'break',
        stop_id: stop?.id ?? null,
        ongoing,
      });
    }
    i = j + 1;
  }

  const first = pts[0].recordedAt;
  const lastFix = pts[pts.length - 1].recordedAt;
  const lastHalt = halts[halts.length - 1];
  const endAt = lastHalt?.ongoing ? now : lastFix;
  const total = Math.max(0, Math.round(minutesBetween(first, endAt)));
  const atStops = halts.filter((h) => h.kind === 'at_stop').reduce((s, h) => s + h.minutes, 0);
  const breaks = halts.filter((h) => h.kind === 'break');
  const breaksMin = breaks.reduce((s, h) => s + h.minutes, 0);
  return {
    halts,
    split: {
      total_min: total,
      driving_min: Math.max(0, total - atStops - breaksMin),
      at_stops_min: atStops,
      breaks_min: breaksMin,
      breaks: breaks.length,
    },
  };
}

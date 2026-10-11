/**
 * The fleet's rules, written once for every screen: the web live map, the
 * operator app's Fleet map and the API (late alerts, customer tracking).
 * They used to be copied into each app and drifted apart (different "late"
 * grace, an estimate on the phone and a dash on the web). Change a rule here
 * and every screen changes with it.
 *
 * Pure functions on the smallest shape they need, so each app's own LiveUnit
 * type fits without conversion.
 */

// ── Shapes ──────────────────────────────────────────────────────────────────

export interface FleetPoint { lat: number; lng: number }

export interface FleetStopLike {
  lat: number | null;
  lng: number | null;
  planned_arrival: string | null;
  actual_arrival?: string | null;
}

export type FleetTripPhase = 'upcoming' | 'active' | 'delayed';

export interface FleetUnitLike<S extends FleetStopLike = FleetStopLike> {
  trip: {
    phase: FleetTripPhase;
    stops: S[];
    next_stop_index: number | null;
    planned_end?: string | null;
  } | null;
  position: (FleetPoint & { recorded_at?: string | null }) | null;
  motion?: 'moving' | 'idle' | 'stale' | 'no_signal' | null;
  stopped_since?: string | null;
  feeds_gap_m?: number | null;
}

// ── Numbers every screen shares ─────────────────────────────────────────────

/** A loaded truck's top average; routes timed for a car are stretched to at least this. */
export const TRUCK_MAX_KPH = 80;
/** Arriving up to this late still reads "On time". */
export const LATE_GRACE_MIN = 5;
/** Predicted this late at a stop → "going to be late" alert to the operators. */
export const LATE_ALERT_MIN = 15;
/** GPS older than this: the truck is "not live". */
export const SILENT_MIN = 30;
/** Stopped this long on a running trip, away from its stops, is worth a look. */
export const LONG_STOP_MIN = 30;
/** Within this of one of its stops a truck is working there, not stuck. */
export const AT_STOP_KM = 0.5;
/** Tracker and driver phone this far apart: the driver may not be with the truck. */
export const FEEDS_APART_M = 1000;
/** With no road route: roads run about this much longer than the straight line… */
export const ROAD_FACTOR = 1.3;
/** …driven at about this average. */
export const APPROX_KPH = 70;
/** No trip in the Gulf is this far as the crow flies; a next stop further away was placed wrong. */
export const IMPLAUSIBLE_KM = 2500;
/** The shown arrival only moves when the new one differs by at least this (no ±1 min flicker). */
export const ETA_STEADY_MIN = 3;

// ── Trip state ──────────────────────────────────────────────────────────────

export const onTrip = (u: FleetUnitLike) => !!u.trip && u.trip.phase !== 'upcoming';
export const isDelayed = (u: FleetUnitLike) => u.trip?.phase === 'delayed';
export const isFree = (u: FleetUnitLike) => !u.trip || u.trip.phase === 'upcoming';

export function nextStop<S extends FleetStopLike>(u: FleetUnitLike<S>): S | null {
  const i = u.trip?.next_stop_index;
  return i == null ? null : u.trip!.stops[i] ?? null;
}

/** Has a real fix (not missing, not the 0,0 a dead tracker reports). */
export const located = (u: FleetUnitLike) =>
  !!u.position && Number.isFinite(u.position.lat) && Number.isFinite(u.position.lng) && !(u.position.lat === 0 && u.position.lng === 0);

/** No GPS for SILENT_MIN (or none at all). */
export function isSilent(u: FleetUnitLike, now = Date.now()): boolean {
  const seen = u.position?.recorded_at ? new Date(u.position.recorded_at).getTime() : 0;
  return !u.position || now - seen > SILENT_MIN * 60_000;
}

/** Minutes a delayed truck is past its next stop's planned arrival; null when not late or unknown. */
export function lateMin(u: FleetUnitLike, now = Date.now()): number | null {
  if (!isDelayed(u)) return null;
  const due = nextStop(u)?.planned_arrival;
  if (!due) return null;
  const min = Math.round((now - new Date(due).getTime()) / 60000);
  return min > 0 ? min : null;
}

/** Minutes a running trip's truck has stood still; null when moving or unknown. */
export function stoppedMin(u: FleetUnitLike, now = Date.now()): number | null {
  if (!u.stopped_since || u.motion !== 'idle') return null;
  return Math.max(0, Math.round((now - new Date(u.stopped_since).getTime()) / 60000));
}

/** Stopped LONG_STOP_MIN+ on a running trip, and not at one of its stops — a breakdown or an unplanned stop. */
export function isLongStop(u: FleetUnitLike, now = Date.now()): boolean {
  const min = stoppedMin(u, now);
  if (min == null || min < LONG_STOP_MIN || !onTrip(u) || !u.position) return false;
  return !(u.trip?.stops ?? []).some((x) => x.lat != null && x.lng != null && haversineKm(u.position!, { lat: x.lat, lng: x.lng }) <= AT_STOP_KM);
}

export const feedsApart = (u: FleetUnitLike) => (u.feeds_gap_m ?? 0) > FEEDS_APART_M;

/** What the truck is doing, in the same words on every screen. */
export const MOTION_LABEL: Record<NonNullable<FleetUnitLike['motion']>, string> = {
  moving: 'Moving',
  idle: 'Stopped',
  stale: 'Offline',
  no_signal: 'No signal',
};

/** Why a GPS feed shows nothing: the truck's tracker… */
export function trackerMissing(u: { vehicle: { has_tracker: boolean } | null }): string {
  return !u.vehicle ? 'No truck' : !u.vehicle.has_tracker ? 'No tracker' : 'No fix yet';
}
/** …or the driver's phone (it only sends on a running trip). */
export function phoneMissing(u: FleetUnitLike & { driver: unknown | null }): string {
  return !u.driver ? 'No driver' : isFree(u) ? 'Off trip' : 'Not sending';
}

/** A live-map stop's name for a card: its name, else its address, else "Stop 2". */
export function liveStopLabel(s: { name: string | null; address: string | null; sequence: number }): string {
  return s.name || s.address || `Stop ${s.sequence}`;
}

// ── Distance and ETA ────────────────────────────────────────────────────────

export function haversineKm(a: FleetPoint, b: FleetPoint): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Compass bearing from a to b, degrees clockwise from north. */
export function bearingBetween(a: FleetPoint, b: FleetPoint): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Car time → truck time: never faster than TRUCK_MAX_KPH over the distance. */
export function truckDriveSeconds(distanceMeters: number, carSeconds: number): number {
  return Math.round(Math.max(carSeconds, distanceMeters / (TRUCK_MAX_KPH / 3.6)));
}

export interface EtaInfo {
  /** Arrival at the next stop: road drive time, or an estimate (approx) when there's no road route; null when the stop can't be placed. */
  arrival: Date | null;
  durationSeconds: number | null;
  /** Road distance when routed, an estimated road distance otherwise. */
  distanceKm: number | null;
  distanceIsRoad: boolean;
  /** No road route: arrival and distance are estimated from the straight line — show them with "≈". */
  approx: boolean;
  /** The next stop is further than any Gulf trip could be — its map location is wrong, so nothing is estimated. */
  stopLooksWrong: boolean;
  /** Minutes late against the stop's planned arrival (road route only); negative = early. */
  lateByMin: number | null;
}

/**
 * ETA to the next stop. `route` is the server's road ahead (already at truck
 * speed); `now` should be the moment it was worked out (`computedAt`) so every
 * screen shows the same arrival. Without a route the arrival is an estimate,
 * never a dash.
 */
export function computeEta(
  u: FleetUnitLike,
  route: { distanceMeters: number; durationSeconds: number } | null,
  now = Date.now(),
): EtaInfo | null {
  const stop = nextStop(u);
  if (!stop || !u.position) return null;
  if (route) {
    const sec = truckDriveSeconds(route.distanceMeters, route.durationSeconds);
    const arrival = new Date(now + sec * 1000);
    const lateByMin = stop.planned_arrival ? Math.round((arrival.getTime() - new Date(stop.planned_arrival).getTime()) / 60000) : null;
    return { arrival, durationSeconds: sec, distanceKm: route.distanceMeters / 1000, distanceIsRoad: true, approx: false, stopLooksWrong: false, lateByMin };
  }
  const straight = stop.lat != null && stop.lng != null ? haversineKm(u.position, { lat: stop.lat, lng: stop.lng }) : null;
  if (straight == null || straight > IMPLAUSIBLE_KM) {
    return { arrival: null, durationSeconds: null, distanceKm: null, distanceIsRoad: false, approx: false, stopLooksWrong: straight != null, lateByMin: null };
  }
  const km = straight * ROAD_FACTOR;
  const sec = Math.round((km / APPROX_KPH) * 3600);
  return { arrival: new Date(now + sec * 1000), durationSeconds: sec, distanceKm: km, distanceIsRoad: false, approx: true, stopLooksWrong: false, lateByMin: null };
}

/** "On time" / "40 min late" against the stop's plan; null when either side is unknown. */
export function punctuality(lateByMin: number | null): { label: string; late: boolean } | null {
  if (lateByMin == null) return null;
  return lateByMin <= LATE_GRACE_MIN ? { label: 'On time', late: false } : { label: `${formatDriveTime(lateByMin * 60)} late`, late: true };
}

/**
 * The arrival to show: the previous one unless the new one moved by at least
 * ETA_STEADY_MIN — so the time on screen doesn't tick ±1–2 min on every
 * refresh, but a real change (a stop, a jam, a detour) shows at once.
 */
export function steadyArrival(previous: number | null | undefined, next: number): number {
  return previous != null && Math.abs(next - previous) < ETA_STEADY_MIN * 60_000 ? previous : next;
}

// ── Text ────────────────────────────────────────────────────────────────────

export function formatKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

export function formatDriveTime(seconds: number): string {
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  // Past two days, hours and minutes stop being useful: "4 d 16 h".
  if (h >= 48) return `${Math.floor(h / 24)} d${h % 24 ? ` ${h % 24} h` : ''}`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// ── Stops and breaks in a trip's activity ───────────────────────────────────

/** A place the truck stood still 5 min+ (API tracking/tripHalts.ts). */
export interface HaltLike {
  from: string;
  to: string;
  minutes: number;
  kind: 'at_stop' | 'break';
  ongoing: boolean;
  /** "Route 40, near Al Quwayiyah" once known. */
  place?: string | null;
}

/** The activity line for a halt: "Break · 45 min · Route 40, near Al Quwayiyah" / "At Jeddah · 1 h 10 min". */
export function haltActivityLabel(h: HaltLike, stopName?: string | null): string {
  const d = formatDriveTime(h.minutes * 60);
  if (h.kind === 'at_stop') return `${h.ongoing ? 'At' : 'Stood at'} ${stopName || 'the stop'} · ${d}${h.ongoing ? ' so far' : ''}`;
  return `${h.ongoing ? 'On a break' : 'Break'} · ${d}${h.ongoing ? ' so far' : ''}${h.place ? ` · ${h.place}` : ''}`;
}

/**
 * Adds timed entries (stops, breaks) into an activity list in time order:
 * each goes right after the last done entry at or before its time; entries
 * still to come (planned, not done) stay after them.
 */
export function insertByTime<T extends { at: number | null; done: boolean }>(steps: T[], extra: T[]): T[] {
  const out = [...steps];
  for (const e of [...extra].sort((a, b) => (a.at ?? 0) - (b.at ?? 0))) {
    let k = -1;
    for (let i = 0; i < out.length; i++) if (out[i].done && out[i].at != null && out[i].at! <= (e.at ?? 0)) k = i;
    out.splice(k + 1, 0, e);
  }
  return out;
}

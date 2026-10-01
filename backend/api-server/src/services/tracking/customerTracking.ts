/**
 * The customer tracking link: one unguessable link per trip that the customer
 * opens from WhatsApp to see where their truck is, when it arrives, and which
 * stops are done — without asking ops "any update?".
 *
 * Links are rows in `trip_update_shares` with `update_key = 'tracking'` (no
 * media), so they get the same unguessable token and expiry as a forwarded
 * photo page without a new table. One live link per trip; "new link" retires
 * the old one.
 *
 * What a customer sees is deliberately narrower than the trip page: no phone
 * numbers, no prices, no internal delay notes, the driver's first name only,
 * and no planned stop times or "delayed" flag — those read as deadlines, and
 * whether customers see them is the owner's call (not yet made).
 * Nothing here invents a position — a truck that has stopped reporting is shown
 * as "last seen", and its ETA is withheld once the fix is too old to trust.
 */
import type { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';
import { getDrivingRouteThrough, MAX_ROUTE_POINTS, RoutingUnavailableError, type GeoPoint, type RouteResult } from '../routing/routeProvider';
import { SHARE_LINK_TTL_DAYS, newShareToken } from '../operatorInbox';
import { loadTripOverview, thinPath, type TripOverview, type TripPhase } from '../tripOverview';
import type { LiveStop } from '../fleetLiveMap';

export const TRACKING_UPDATE_KEY = 'tracking';
export const TRACKING_CHANNEL = 'tracking_link';
/** A finished trip's link keeps showing the delivery summary this long. */
export const TRACKING_AFTER_END_DAYS = 7;
/**
 * The routing provider times a car. A loaded truck averages less, so an ETA
 * never assumes a faster average than this — a customer holds us to the time
 * we show, and arriving early is fine where arriving late is not.
 */
export const TRUCK_MAX_AVG_KMH = 80;
/** Past this, a position is too old to base an ETA on. */
export const ETA_STALE_MS = 30 * 60_000;
const MAX_PUBLIC_PATH_POINTS = 400;
const MAX_PUBLIC_ROUTE_POINTS = 600;

export type TrackingEtaGap = 'no_position' | 'stale' | 'no_route' | null;

export interface PublicTrackingStop {
  name: string;
  type: string;
  state: 'done' | 'next' | 'upcoming';
  lat: number | null;
  lng: number | null;
  actual_arrival: string | null;
  actual_departure: string | null;
}

export interface PublicTracking {
  brand: { name: string; logo_url: string | null; primary_color: string | null };
  timezone: string;
  trip: {
    ref: string | null;
    phase: TripPhase;
    started_at: string | null;
    finished_at: string | null;
    planned_start: string | null;
  };
  vehicle: { plate: string | null; type: string | null };
  driver_first_name: string | null;
  position: {
    lat: number;
    lng: number;
    heading_deg: number | null;
    speed_kph: number | null;
    recorded_at: string;
    fresh: boolean;
    moving: boolean;
  } | null;
  /** Drive to the next stop (to the pickup for a trip that hasn't started). */
  eta: { stop_index: number; arrival: string; seconds: number; distance_m: number } | null;
  eta_gap: TrackingEtaGap;
  /** Road distance covered vs the whole trip, for the progress bar. Active trips only. */
  progress: { done_m: number; total_m: number; pct: number } | null;
  stops: PublicTrackingStop[];
  next_stop_index: number | null;
  /** [lng, lat] driven so far (driver app GPS). */
  path: [number, number][];
  /** [lng, lat] road ahead from the truck through the remaining stops. */
  ahead: [number, number][] | null;
  /** [lng, lat] road route through every stop — for trips with no live truck to draw from. */
  route: [number, number][] | null;
  generated_at: string;
}

export interface TrackingTripMeta {
  ref_id: string | null;
  status: string;
  vehicle_type: string | null;
  planned_start: Date | null;
  actual_start: Date | null;
  actual_end: Date | null;
  updatedAt: Date;
  is_third_party: boolean;
  vehicle: { plate_number: string; asset_type: string } | null;
  driver: { first_name: string } | null;
  subcontract: { vehiclePlate: string | null; vehicleType: string | null; driverName: string | null } | null;
}

// ── Pure helpers ────────────────────────────────────────────────────────────

/** Drive time a truck needs: the provider's time, but never faster than TRUCK_MAX_AVG_KMH on average. */
export function truckSeconds(distanceMeters: number, providerSeconds: number): number {
  const floor = distanceMeters / (TRUCK_MAX_AVG_KMH / 3.6);
  return Math.round(Math.max(providerSeconds, floor));
}

export function firstName(full: string | null | undefined): string | null {
  const f = (full ?? '').trim().split(/\s+/)[0];
  return f ? f.charAt(0).toUpperCase() + f.slice(1).toLowerCase() : null;
}

/** Whether a link may still be opened. A finished trip's link lasts TRACKING_AFTER_END_DAYS past the finish. */
export function trackingLinkState(
  share: { expiresAt: Date },
  trip: { status: string; actual_end: Date | null; updatedAt: Date } | null,
  now: Date,
): 'ok' | 'expired' | 'cancelled' | 'not_found' {
  if (!trip) return 'not_found';
  if (share.expiresAt <= now) return 'expired';
  if (trip.status === 'Cancelled') return 'cancelled';
  if (trip.status === 'Completed' || trip.status === 'Invoiced') {
    const ended = trip.actual_end ?? trip.updatedAt;
    if (now.getTime() - ended.getTime() > TRACKING_AFTER_END_DAYS * 86_400_000) return 'expired';
  }
  return 'ok';
}

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;
const roundCoords = (pts: [number, number][]) => pts.map(([lng, lat]) => [round5(lng), round5(lat)] as [number, number]);

function stopName(s: LiveStop, i: number): string {
  const n = s.name?.trim() || s.address?.split(',')[0]?.trim();
  return n || `Stop ${i + 1}`;
}

const pointOf = (s: LiveStop): GeoPoint | null => (s.lat != null && s.lng != null ? { lat: s.lat, lng: s.lng } : null);

/**
 * Assembles what the customer sees from the trip overview and the road routes.
 * `ahead` is the route from the truck through the remaining stops (planned:
 * through every stop); `all` is the route through every stop.
 */
export function buildPublicTracking(input: {
  overview: TripOverview;
  meta: TrackingTripMeta;
  brand: PublicTracking['brand'];
  timezone: string;
  ahead: RouteResult | null;
  all: RouteResult | null;
  now: Date;
}): PublicTracking {
  const { overview, meta, ahead, all, now } = input;
  const phase = overview.phase;
  const live = phase === 'active' || phase === 'planned';
  const pos = live ? overview.unit?.position ?? null : null;
  const nextIdx = phase === 'planned' ? (overview.stops.length ? 0 : null) : overview.next_stop_index;

  let eta: PublicTracking['eta'] = null;
  let eta_gap: TrackingEtaGap = null;
  if (live && nextIdx != null) {
    if (!pos) eta_gap = 'no_position';
    else if (now.getTime() - new Date(pos.recorded_at).getTime() > ETA_STALE_MS) eta_gap = 'stale';
    else if (!ahead || !ahead.legs.length) eta_gap = 'no_route';
    else {
      const leg = ahead.legs[0];
      const seconds = truckSeconds(leg.distanceMeters, leg.durationSeconds);
      eta = {
        stop_index: nextIdx,
        arrival: new Date(now.getTime() + seconds * 1000).toISOString(),
        seconds,
        distance_m: Math.round(leg.distanceMeters),
      };
    }
  }

  let progress: PublicTracking['progress'] = null;
  if (phase === 'active' && all && all.distanceMeters > 0 && ahead && pos && eta_gap === null) {
    const total = Math.round(all.distanceMeters);
    const left = Math.min(total, Math.round(ahead.distanceMeters));
    progress = { done_m: total - left, total_m: total, pct: Math.round(((total - left) / total) * 100) };
  } else if (phase === 'done' && all) {
    progress = { done_m: Math.round(all.distanceMeters), total_m: Math.round(all.distanceMeters), pct: 100 };
  }

  const stops: PublicTrackingStop[] = overview.stops.map((s, i) => ({
    name: stopName(s, i),
    type: s.type,
    state: phase === 'done' || s.actual_arrival
      ? 'done'
      : i === nextIdx && phase !== 'cancelled' ? 'next' : 'upcoming',
    lat: s.lat != null ? round5(s.lat) : null,
    lng: s.lng != null ? round5(s.lng) : null,
    actual_arrival: s.actual_arrival,
    actual_departure: s.actual_departure,
  }));

  const third = meta.is_third_party ? meta.subcontract : null;
  const showAllRoute = phase === 'planned' || phase === 'cancelled' || (phase === 'done' && overview.path.length < 2);

  return {
    brand: input.brand,
    timezone: input.timezone,
    trip: {
      ref: meta.ref_id,
      phase,
      started_at: meta.actual_start?.toISOString() ?? null,
      finished_at: meta.actual_end?.toISOString() ?? null,
      planned_start: meta.planned_start?.toISOString() ?? null,
    },
    vehicle: {
      plate: third ? third.vehiclePlate : meta.vehicle?.plate_number ?? null,
      type: (third ? third.vehicleType : null) || meta.vehicle_type || meta.vehicle?.asset_type || null,
    },
    driver_first_name: firstName(third ? third.driverName : meta.driver?.first_name),
    position: pos ? {
      lat: round5(pos.lat),
      lng: round5(pos.lng),
      heading_deg: pos.heading_deg,
      speed_kph: pos.speed_kph != null ? Math.round(pos.speed_kph) : null,
      recorded_at: pos.recorded_at,
      fresh: pos.fresh,
      moving: pos.fresh && (pos.speed_kph ?? 0) > 3,
    } : null,
    eta,
    eta_gap,
    progress,
    stops,
    next_stop_index: phase === 'done' || phase === 'cancelled' ? null : nextIdx,
    path: phase === 'active' || phase === 'done' ? roundCoords(thinPath(overview.path, MAX_PUBLIC_PATH_POINTS)) : [],
    ahead: live && ahead && pos ? roundCoords(thinPath(ahead.geometry, MAX_PUBLIC_ROUTE_POINTS)) : null,
    route: showAllRoute && all ? roundCoords(thinPath(all.geometry, MAX_PUBLIC_ROUTE_POINTS)) : null,
    generated_at: now.toISOString(),
  };
}

// ── Routes, cached ──────────────────────────────────────────────────────────
// A tracking page is polled by every customer who has it open. Routing goes
// to a third-party provider, so answers are cached: the road ahead per ~1 km of
// truck movement, the whole-trip route per trip.

const AHEAD_TTL_MS = 5 * 60_000;
const ALL_TTL_MS = 6 * 60 * 60_000;
const CACHE_MAX = 500;
const routeCache = new Map<string, { at: number; route: RouteResult | null }>();

async function cachedRoute(key: string, ttl: number, points: GeoPoint[]): Promise<RouteResult | null> {
  const hit = routeCache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.route;
  let route: RouteResult | null = null;
  try {
    route = await getDrivingRouteThrough(points.slice(0, MAX_ROUTE_POINTS));
  } catch (err) {
    if (!(err instanceof RoutingUnavailableError)) logger.warn({ err }, '[tracking] route failed');
  }
  if (routeCache.size >= CACHE_MAX) routeCache.delete(routeCache.keys().next().value as string);
  routeCache.set(key, { at: Date.now(), route });
  return route;
}

/** For tests. */
export function clearTrackingCaches(): void {
  routeCache.clear();
  payloadCache.clear();
}

// ── Loaders ─────────────────────────────────────────────────────────────────

const META_SELECT = {
  ref_id: true, status: true, vehicle_type: true, planned_start: true, actual_start: true, actual_end: true, updatedAt: true, is_third_party: true,
  vehicle: { select: { plate_number: true, asset_type: true } },
  driver: { select: { first_name: true } },
  subcontract: { select: { vehiclePlate: true, vehicleType: true, driverName: true } },
} as const;

const PAYLOAD_TTL_MS = 20_000;
const payloadCache = new Map<string, { at: number; data: PublicTracking }>();

export type TrackingLookup =
  | { state: 'ok'; data: PublicTracking }
  | { state: 'not_found' | 'expired' | 'cancelled' };

export async function loadPublicTracking(db: PrismaClient, token: string, now = new Date()): Promise<TrackingLookup> {
  if (token.length < 16 || token.length > 64) return { state: 'not_found' };
  const share = await db.tripUpdateShare.findUnique({
    where: { token },
    select: { tripId: true, update_key: true, expiresAt: true },
  });
  if (!share || share.update_key !== TRACKING_UPDATE_KEY) return { state: 'not_found' };

  const meta = await db.trip.findFirst({ where: { id: share.tripId, deletedAt: null }, select: META_SELECT });
  const linkState = trackingLinkState(share, meta, now);
  if (linkState !== 'ok') return { state: linkState };

  const cached = payloadCache.get(token);
  if (cached && now.getTime() - cached.at < PAYLOAD_TTL_MS) return { state: 'ok', data: cached.data };

  const [overview, settings] = await Promise.all([
    loadTripOverview(db, share.tripId, now),
    db.settings.findFirst({ select: { appName: true, logoUrl: true, primaryColor: true, timezone: true } }),
  ]);
  if (!overview) return { state: 'not_found' };

  const stopPts = overview.stops.map(pointOf).filter((p): p is GeoPoint => !!p);
  const allKey = `all:${share.tripId}:${stopPts.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join(';')}`;
  const all = stopPts.length >= 2 ? await cachedRoute(allKey, ALL_TTL_MS, stopPts) : null;

  let ahead: RouteResult | null = null;
  const pos = overview.unit?.position;
  if (pos && (overview.phase === 'active' || overview.phase === 'planned')) {
    const from = overview.phase === 'planned' ? 0 : overview.next_stop_index;
    const remaining = from == null ? [] : overview.stops.slice(from).map(pointOf).filter((p): p is GeoPoint => !!p);
    if (remaining.length) {
      const key = `ahead:${share.tripId}:${from}:${pos.lat.toFixed(2)},${pos.lng.toFixed(2)}`;
      ahead = await cachedRoute(key, AHEAD_TTL_MS, [{ lat: pos.lat, lng: pos.lng }, ...remaining]);
    }
  }

  const data = buildPublicTracking({
    overview,
    meta: meta as unknown as TrackingTripMeta,
    brand: { name: settings?.appName || 'MERCON', logo_url: settings?.logoUrl ?? null, primary_color: settings?.primaryColor ?? null },
    timezone: settings?.timezone || 'Asia/Riyadh',
    ahead,
    all,
    now,
  });
  if (payloadCache.size >= CACHE_MAX) payloadCache.delete(payloadCache.keys().next().value as string);
  payloadCache.set(token, { at: now.getTime(), data });
  return { state: 'ok', data };
}

/**
 * The trip's live tracking link, created on first ask. `renew` retires every
 * existing link (anyone holding an old one sees "expired") and issues a new one.
 */
export async function ensureTrackingLink(
  db: PrismaClient,
  tripId: string,
  opts: { userId: string | null; renew?: boolean; now?: Date },
): Promise<{ token: string; expires_at: string; created: boolean } | null> {
  const now = opts.now ?? new Date();
  const trip = await db.trip.findFirst({ where: { id: tripId, deletedAt: null }, select: { id: true } });
  if (!trip) return null;

  const live = { tripId, update_key: TRACKING_UPDATE_KEY, expiresAt: { gt: now } };
  if (opts.renew) {
    await db.tripUpdateShare.updateMany({ where: live, data: { expiresAt: now } });
  } else {
    const existing = await db.tripUpdateShare.findFirst({ where: live, orderBy: { createdAt: 'desc' }, select: { token: true, expiresAt: true } });
    if (existing) return { token: existing.token, expires_at: existing.expiresAt.toISOString(), created: false };
  }

  const row = await db.tripUpdateShare.create({
    data: {
      tripId,
      update_key: TRACKING_UPDATE_KEY,
      media_ids: [],
      token: newShareToken(),
      channel: TRACKING_CHANNEL,
      recipient: 'customer',
      shared_by: opts.userId,
      expiresAt: new Date(now.getTime() + SHARE_LINK_TTL_DAYS * 86_400_000),
    },
    select: { token: true, expiresAt: true },
  });
  return { token: row.token, expires_at: row.expiresAt.toISOString(), created: true };
}

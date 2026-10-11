/**
 * The customer tracking link: one unguessable link per trip that the customer
 * opens from WhatsApp to see where their truck is, when it arrives, and which
 * stops are done — without asking ops "any update?".
 *
 * Links are rows in `trip_update_shares` with `update_key = 'tracking'` (no
 * media), so they get the same unguessable token and expiry as a forwarded
 * photo page. One live link per trip; "new link" retires the old one.
 *
 * What a customer sees is deliberately narrower than the trip page: no phone
 * numbers, no prices, never the driver's typed notes, the driver's first name
 * only. Per customer (Customer.tracking_*), ops choose whether the page also
 * shows the planned arrival ("on time" / "late by"), the delay reason category,
 * and the loading / delivery photos — and can switch tracking off entirely.
 * Each link can override those, and also hide the driver, the plate or the
 * truck's position (Links page in the operator app — LinkView).
 *
 * Nothing here invents a position — a truck that has stopped reporting is shown
 * as "last seen", and its ETA is withheld once the fix is too old to trust.
 */
import type { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';
import { getDrivingRouteThrough, MAX_ROUTE_POINTS, RoutingUnavailableError, type GeoPoint, type RouteResult } from '../routing/routeProvider';
import { getRouteAhead } from '../routing/routeAhead';
import { SHARE_LINK_TTL_DAYS, newShareToken } from '../operatorInbox';
import { loadTripOverview, thinPath, type TripOverview, type TripPhase } from '../tripOverview';
import { loadTripMedia, type LiveStop, type LiveTripMedia } from '../fleetLiveMap';
import { publicImage } from './publicImages';
import { whatsAppGroupUrl, TRUCK_MAX_KPH, truckDriveSeconds } from '@mercon/shared-types';
import { logLinkOpen } from './linkOpens';

export const TRACKING_UPDATE_KEY = 'tracking';
export const TRACKING_CHANNEL = 'tracking_link';
/** A finished trip's link keeps showing the delivery summary this long. */
export const TRACKING_AFTER_END_DAYS = 7;
/**
 * The routing provider times a car. A loaded truck averages less, so an ETA
 * never assumes a faster average than this — a customer holds us to the time
 * we show, and arriving early is fine where arriving late is not. The one
 * shared number (@mercon/shared-types fleetRules), same as every map.
 */
export const TRUCK_MAX_AVG_KMH = TRUCK_MAX_KPH;
/** Past this, a position is too old to base an ETA on. */
export const ETA_STALE_MS = 30 * 60_000;
/** Minutes of slack before an arrival counts as late — same as the dashboard. */
export const LATE_GRACE_MIN = 5;
const MAX_PUBLIC_PATH_POINTS = 400;
const MAX_PUBLIC_ROUTE_POINTS = 600;
const MAX_PHOTOS_PER_STOP = 12;

export type TrackingEtaGap = 'no_position' | 'stale' | 'no_route' | null;

/** What the page shows: the customer's settings, with the link's own choices on top. */
export interface TrackingOptions {
  show_deadline: boolean;
  show_delay_reason: boolean;
  show_photos: boolean;
  /** The driver's first name and photo. */
  show_driver: boolean;
  /** The truck's plate and photo. */
  show_plate: boolean;
  /** The truck on the map and the road it drove (off: status, stops and ETA only). */
  show_position: boolean;
}

/** A link's own view settings (trip_update_shares / customer_tracking_links). Null = follow the customer. */
export interface LinkView {
  show_deadline: boolean | null;
  show_delay_reason: boolean | null;
  show_photos: boolean | null;
  show_driver: boolean;
  show_plate: boolean;
  show_position: boolean;
}

export const LINK_VIEW_SELECT = {
  show_deadline: true, show_delay_reason: true, show_photos: true, show_driver: true, show_plate: true, show_position: true,
} as const;

export interface TrackingBrand {
  name: string;
  logo_url: string | null;
  primary_color: string | null;
  /** Ops WhatsApp number (digits) for the page's "Ask us" button — the fallback. */
  support_whatsapp: string | null;
  /** The customer's WhatsApp group (invite link): "Ask" opens it when set. */
  ask_group_url: string | null;
}

export interface PublicTrackingPhoto {
  url: string;
  kind: 'pod' | 'photo' | 'video';
  /** Sent by the driver to explain a delay (often a video). */
  delay: boolean;
  captured_at: string;
}

export interface PublicTrackingStop {
  name: string;
  type: string;
  state: 'done' | 'next' | 'upcoming';
  lat: number | null;
  lng: number | null;
  actual_arrival: string | null;
  actual_departure: string | null;
  /** Planned arrival — only when the customer's settings show deadlines. */
  due_at: string | null;
  /** Minutes the truck arrived after `due_at` (beyond the grace); 0 = on time. Done stops with a deadline only. */
  late_min: number | null;
  /** Loading / delivery photos — done stops, when the customer's settings show photos. */
  photos: PublicTrackingPhoto[];
}

export interface PublicTracking {
  brand: TrackingBrand;
  timezone: string;
  options: TrackingOptions;
  trip: {
    ref: string | null;
    phase: TripPhase;
    /** "Khamis Mushayt ⇄ Muhayil" — see routeLabel. */
    route_label: string | null;
    started_at: string | null;
    finished_at: string | null;
    planned_start: string | null;
  };
  /** Whose shipment this is — shown as their logo and name on the page. */
  customer: { name: string; logo_url: string | null } | null;
  vehicle: { plate: string | null; type: string | null; photo_url: string | null };
  driver_first_name: string | null;
  /** The driver's profile photo (MERCON drivers only — none for subcontracted trucks). */
  driver_photo_url: string | null;
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
  /** ETA against the next stop's planned arrival — only when deadlines are shown. */
  punctuality: { late_min: number } | null;
  /** Delay reason category on the stop the truck is heading for — only when the customer's settings show it. */
  delay: { reason: string } | null;
  /** Road distance covered vs the whole trip, for the progress bar. */
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
  vehicle: { id?: string; plate_number: string; asset_type: string; image_url?: string | null } | null;
  driver: { id?: string; first_name: string; avatar_url?: string | null } | null;
  subcontract: { vehiclePlate: string | null; vehicleType: string | null; driverName: string | null } | null;
  /** Who created the trip — the "Ask" fallback when the customer has no WhatsApp group. */
  created_by?: string | null;
}

export interface TrackingCustomerSettings {
  tracking_enabled: boolean;
  tracking_auto_link: boolean;
  tracking_show_deadline: boolean;
  tracking_show_delay_reason: boolean;
  tracking_show_photos: boolean;
  /** Customer.whatsapp_group_link — where "Ask" sends the customer. */
  whatsapp_group_link?: string | null;
}

export const optionsOf = (c: TrackingCustomerSettings | null | undefined, link?: LinkView | null): TrackingOptions => ({
  show_deadline: link?.show_deadline ?? !!c?.tracking_show_deadline,
  show_delay_reason: link?.show_delay_reason ?? !!c?.tracking_show_delay_reason,
  show_photos: link?.show_photos ?? (c ? c.tracking_show_photos : true),
  show_driver: link?.show_driver ?? true,
  show_plate: link?.show_plate ?? true,
  show_position: link?.show_position ?? true,
});

const optionsKey = (o: TrackingOptions) =>
  [o.show_deadline, o.show_delay_reason, o.show_photos, o.show_driver, o.show_plate, o.show_position].map((b) => (b ? 1 : 0)).join('');

// ── Pure helpers ────────────────────────────────────────────────────────────

/** Drive time a truck needs: the provider's time, but never faster than TRUCK_MAX_AVG_KMH on average. */
export const truckSeconds = truckDriveSeconds;

export function firstName(full: string | null | undefined): string | null {
  const f = (full ?? '').trim().split(/\s+/)[0];
  return f ? f.charAt(0).toUpperCase() + f.slice(1).toLowerCase() : null;
}

/** Minutes late beyond the grace (0 = on time), or null when either time is missing. */
export function lateMinutes(actualOrEta: string | Date | null, due: string | Date | null): number | null {
  if (!actualOrEta || !due) return null;
  const min = Math.round((new Date(actualOrEta).getTime() - new Date(due).getTime()) / 60_000);
  return min > LATE_GRACE_MIN ? min : 0;
}

/** WhatsApp wants digits only, with the country code. */
export function waDigits(phone: string | null | undefined): string | null {
  let d = (phone ?? '').replace(/[^0-9]/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  // wa.me needs the international form: a local Saudi mobile "05x…" / "5x…" becomes "9665x…".
  if (/^05\d{8}$/.test(d)) d = `966${d.slice(1)}`;
  else if (/^5\d{8}$/.test(d)) d = `966${d}`;
  return d.length >= 8 ? d : null;
}

/**
 * The WhatsApp number of the team member a customer should ask — the person
 * who created the trip, when they're an active Admin / Operator with a phone
 * on their profile (the team answers customers from their own phones).
 * Cached briefly: every page load asks.
 */
const teamPhoneCache = new Map<string, { at: number; value: string | null }>();
export async function teamWhatsApp(db: PrismaClient, userId: string | null | undefined, nowMs = Date.now()): Promise<string | null> {
  if (!userId) return null;
  const hit = teamPhoneCache.get(userId);
  if (hit && nowMs - hit.at < 10 * 60_000) return hit.value;
  let value: string | null = null;
  try {
    const u = await db.user.findUnique({ where: { id: userId }, select: { phone: true, role: true, isActive: true, deletedAt: true } });
    value = u && u.isActive && !u.deletedAt && u.role !== 'Driver' ? waDigits(u.phone) : null;
  } catch {
    value = null; // not a user id (older rows) — fall back to the company number
  }
  teamPhoneCache.set(userId, { at: nowMs, value });
  return value;
}

export type LinkState = 'ok' | 'expired' | 'cancelled' | 'not_found' | 'disabled';

/**
 * Whether a link may still be opened. A finished trip's link lasts
 * TRACKING_AFTER_END_DAYS past the finish — unless ops set the expiry
 * themselves (`expiry_custom`), which then is the only limit.
 */
export function trackingLinkState(
  share: { expiresAt: Date; revokedAt?: Date | null; expiry_custom?: boolean },
  trip: { status: string; actual_end: Date | null; updatedAt: Date; customer?: { tracking_enabled: boolean } | null } | null,
  now: Date,
): LinkState {
  if (!trip) return 'not_found';
  if (share.revokedAt || share.expiresAt <= now) return 'expired';
  if (trip.customer && !trip.customer.tracking_enabled) return 'disabled';
  if (trip.status === 'Cancelled') return 'cancelled';
  if (!share.expiry_custom && (trip.status === 'Completed' || trip.status === 'Invoiced')) {
    const ended = trip.actual_end ?? trip.updatedAt;
    if (now.getTime() - ended.getTime() > TRACKING_AFTER_END_DAYS * 86_400_000) return 'expired';
  }
  return 'ok';
}

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;
const roundCoords = (pts: [number, number][]) => pts.map(([lng, lat]) => [round5(lng), round5(lat)] as [number, number]);

/**
 * A place name as customers should read it. Ops often type "khamis mushayt" or
 * "RIYADH"; names already in mixed case ("iMile CDC") are left exactly as typed.
 */
export function placeName(raw: string): string {
  const s = raw.trim().replace(/\s+/g, ' ');
  if (s !== s.toLowerCase() && s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s\-/(])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

function stopName(s: LiveStop, i: number): string {
  const n = s.name?.trim() || s.address?.split(',')[0]?.trim();
  return n ? placeName(n) : `Stop ${i + 1}`;
}

/**
 * The trip's route in a few words: "Riyadh → Dawadmi", "Riyadh → Hail → Qurayyat",
 * and a round trip as "Khamis Mushayt ⇄ Muhayil" (monthly trips are entered as
 * out-and-back stops, e.g. Khamis, Muhayil, Muhayil, Khamis).
 */
export function routeLabel(names: string[]): string | null {
  const places = names.filter((n, i) => i === 0 || n !== names[i - 1]);
  if (places.length === 0) return null;
  if (places.length === 1) return places[0];
  if (places.length === 3 && places[0] === places[2]) return `${places[0]} ⇄ ${places[1]}`;
  return places.join(' → ');
}

const pointOf = (s: LiveStop): GeoPoint | null => (s.lat != null && s.lng != null ? { lat: s.lat, lng: s.lng } : null);

/**
 * Media a customer may see for one stop: proof of delivery, cargo photos, and
 * the driver's delay photos / videos (owner decision 2026-10-03: customers see
 * why a truck was held up). All behind the customer's "show photos" setting.
 */
function stopPhotos(media: LiveTripMedia | null, stopId: string): PublicTrackingPhoto[] {
  const items = media?.stops.find((m) => m.stop_id === stopId)?.media ?? [];
  return items
    .slice(0, MAX_PHOTOS_PER_STOP)
    .map((m) => ({ url: m.url, kind: m.kind, delay: m.stage === 'delay', captured_at: m.captured_at }));
}

/**
 * Assembles what the customer sees from the trip overview and the road routes.
 * `ahead` is the route from the truck through the remaining stops (planned:
 * through every stop); `all` is the route through every stop. `media` carries
 * the stop photos and delay reasons; it is only loaded when the options need it.
 */
export function buildPublicTracking(input: {
  overview: TripOverview;
  meta: TrackingTripMeta;
  brand: TrackingBrand;
  timezone: string;
  options: TrackingOptions;
  ahead: RouteResult | null;
  all: RouteResult | null;
  media?: LiveTripMedia | null;
  customer?: { name: string; logo_url: string | null } | null;
  now: Date;
}): PublicTracking {
  const { overview, meta, ahead, all, now, options } = input;
  const media = input.media ?? null;
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

  const stops: PublicTrackingStop[] = overview.stops.map((s, i) => {
    const state: PublicTrackingStop['state'] = phase === 'done' || s.actual_arrival
      ? 'done'
      : i === nextIdx && phase !== 'cancelled' ? 'next' : 'upcoming';
    const due = options.show_deadline ? s.planned_arrival : null;
    return {
      name: stopName(s, i),
      type: s.type,
      state,
      lat: s.lat != null ? round5(s.lat) : null,
      lng: s.lng != null ? round5(s.lng) : null,
      actual_arrival: s.actual_arrival,
      actual_departure: s.actual_departure,
      due_at: due,
      late_min: state === 'done' ? lateMinutes(s.actual_arrival, due) : null,
      photos: options.show_photos && state === 'done' ? stopPhotos(media, s.id) : [],
    };
  });

  const nextStop = nextIdx != null ? overview.stops[nextIdx] : null;
  const punctualityMin = options.show_deadline && eta && nextStop ? lateMinutes(eta.arrival, nextStop.planned_arrival) : null;
  const delayReason = options.show_delay_reason && live && nextStop
    ? media?.stops.find((m) => m.stop_id === nextStop.id)?.delay?.reason ?? null
    : null;

  const third = meta.is_third_party ? meta.subcontract : null;
  // With the position hidden the page draws the planned road instead of where the truck is.
  const showPos = options.show_position;
  const showAllRoute = !showPos || phase === 'planned' || phase === 'cancelled' || (phase === 'done' && overview.path.length < 2);

  return {
    brand: input.brand,
    timezone: input.timezone,
    options,
    trip: {
      ref: meta.ref_id,
      phase,
      route_label: routeLabel(stops.map((s) => s.name)),
      started_at: meta.actual_start?.toISOString() ?? null,
      finished_at: meta.actual_end?.toISOString() ?? null,
      planned_start: meta.planned_start?.toISOString() ?? null,
    },
    customer: input.customer ?? null,
    vehicle: {
      plate: !options.show_plate ? null : third ? third.vehiclePlate : meta.vehicle?.plate_number ?? null,
      type: (third ? third.vehicleType : null) || meta.vehicle_type || meta.vehicle?.asset_type || null,
      photo_url: third || !options.show_plate ? null : meta.vehicle?.image_url ?? null,
    },
    driver_first_name: options.show_driver ? firstName(third ? third.driverName : meta.driver?.first_name) : null,
    driver_photo_url: third || !options.show_driver ? null : meta.driver?.avatar_url ?? null,
    position: pos && showPos ? {
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
    punctuality: punctualityMin != null ? { late_min: punctualityMin } : null,
    delay: delayReason ? { reason: delayReason } : null,
    progress,
    stops,
    next_stop_index: phase === 'done' || phase === 'cancelled' ? null : nextIdx,
    path: showPos && (phase === 'active' || phase === 'done') ? roundCoords(thinPath(overview.path, MAX_PUBLIC_PATH_POINTS)) : [],
    ahead: showPos && live && ahead && pos ? roundCoords(thinPath(ahead.geometry, MAX_PUBLIC_ROUTE_POINTS)) : null,
    route: showAllRoute && all ? roundCoords(thinPath(all.geometry, MAX_PUBLIC_ROUTE_POINTS)) : null,
    generated_at: now.toISOString(),
  };
}

// ── Routes and payloads, cached ─────────────────────────────────────────────
// A tracking page is polled by every customer who has it open, and the
// customer-wide page asks for every truck at once. Routing goes to a
// third-party provider, so answers are cached: the road to the next stop is
// the operators' shared route (routeAhead.ts), the routes through the stops
// are kept per trip, and the finished payload per
// trip for a few seconds.

const ALL_TTL_MS = 6 * 60 * 60_000;
const PAYLOAD_TTL_MS = 20_000;
const CACHE_MAX = 500;
const routeCache = new Map<string, { at: number; route: RouteResult | null }>();
const payloadCache = new Map<string, { at: number; data: PublicTracking }>();

function remember<T>(cache: Map<string, T>, key: string, value: T) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, value);
}

async function cachedRoute(key: string, ttl: number, points: GeoPoint[]): Promise<RouteResult | null> {
  const hit = routeCache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.route;
  let route: RouteResult | null = null;
  try {
    route = await getDrivingRouteThrough(points.slice(0, MAX_ROUTE_POINTS));
  } catch (err) {
    if (!(err instanceof RoutingUnavailableError)) logger.warn({ err }, '[tracking] route failed');
  }
  remember(routeCache, key, { at: Date.now(), route });
  return route;
}

/**
 * The truck's road through its remaining stops, as the customer sees it. To
 * the next stop it is the operators' own shared route (routeAhead.ts: one
 * route per trip, started in the truck's heading, trimmed as it drives, the
 * arrival held steady) — so the customer's ETA is the very one on the
 * operators' maps. From there on, the route through the later stops (cached
 * per trip). Null when the next stop can't be routed.
 */
async function roadAhead(
  tripId: string,
  pos: { lat: number; lng: number; heading_deg: number | null; speed_kph: number | null; accuracy_m: number | null },
  remaining: LiveStop[],
  now: Date,
): Promise<RouteResult | null> {
  const next = remaining[0];
  if (!next || next.lat == null || next.lng == null || (next.lat === 0 && next.lng === 0)) return null;
  let first;
  try {
    first = await getRouteAhead(tripId, pos, { id: next.id, lat: next.lat, lng: next.lng }, now.getTime());
  } catch (err) {
    if (!(err instanceof RoutingUnavailableError)) logger.warn({ err }, '[tracking] road ahead failed');
    return null;
  }
  const later = remaining.map(pointOf).filter((p): p is GeoPoint => !!p);
  const restKey = `rest:${tripId}:${later.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join(';')}`;
  const rest = later.length >= 2 ? await cachedRoute(restKey, ALL_TTL_MS, later) : null;
  return {
    geometry: [...first.geometry, ...(rest?.geometry.slice(1) ?? [])],
    distanceMeters: first.distanceMeters + (rest?.distanceMeters ?? 0),
    durationSeconds: first.durationSeconds + (rest?.durationSeconds ?? 0),
    legs: [{ distanceMeters: first.distanceMeters, durationSeconds: first.durationSeconds }, ...(rest?.legs ?? [])],
    provider: first.provider,
  };
}

/** For tests. */
export function clearTrackingCaches(): void {
  routeCache.clear();
  payloadCache.clear();
}

// ── Loaders ─────────────────────────────────────────────────────────────────

export const CUSTOMER_TRACKING_SELECT = {
  tracking_enabled: true, tracking_auto_link: true, tracking_show_deadline: true,
  tracking_show_delay_reason: true, tracking_show_photos: true, whatsapp_group_link: true,
} as const;

const META_SELECT = {
  created_by: true,
  ref_id: true, status: true, vehicle_type: true, planned_start: true, actual_start: true, actual_end: true, updatedAt: true, is_third_party: true,
  vehicle: { select: { id: true, plate_number: true, asset_type: true, image_url: true } },
  driver: { select: { id: true, first_name: true, avatar_url: true } },
  subcontract: { select: { vehiclePlate: true, vehicleType: true, driverName: true } },
  customer: { select: { ...CUSTOMER_TRACKING_SELECT, id: true, name: true, logo_url: true } },
} as const;

export interface TrackingContext {
  brand: TrackingBrand;
  timezone: string;
}

/** Branding and timezone for a tracking page — the same for every trip. */
export async function loadTrackingContext(db: PrismaClient): Promise<TrackingContext> {
  const s = await db.settings.findFirst({ select: { companyLegalName: true, logoUrl: true, primaryColor: true, timezone: true, supportWhatsapp: true } });
  return {
    brand: {
      // Customers see the company, never the internal app name ("MERCON Operator Platform").
      // The schema's placeholder legal name counts as unset.
      name: (s?.companyLegalName && s.companyLegalName !== 'MERCON Operations Ltd.' ? s.companyLegalName : null) || 'MERCON',
      logo_url: s?.logoUrl ?? null,
      primary_color: s?.primaryColor ?? null,
      support_whatsapp: waDigits(s?.supportWhatsapp),
      ask_group_url: null, // per customer, set by each page
    },
    timezone: s?.timezone || 'Asia/Riyadh',
  };
}

/**
 * The customer's view of one trip, by trip id. Callers have already checked the
 * trip may be shown (link state / customer page). Cached a few seconds per trip,
 * so the trip page and the customer-wide page share the work.
 */
export async function buildTripTracking(
  db: PrismaClient,
  tripId: string,
  meta: TrackingTripMeta & { customer: (TrackingCustomerSettings & { id?: string; name?: string; logo_url?: string | null }) | null },
  ctx: TrackingContext,
  now = new Date(),
  /** The link's view settings on top of the customer's; the customer's alone when absent. */
  view?: LinkView | null,
): Promise<PublicTracking | null> {
  const options = optionsOf(meta.customer, view);
  const cacheKey = `${tripId}:${optionsKey(options)}`;
  const cached = payloadCache.get(cacheKey);
  if (cached && now.getTime() - cached.at < PAYLOAD_TTL_MS) return cached.data;

  const [overview, media] = await Promise.all([
    loadTripOverview(db, tripId, now),
    options.show_photos || options.show_delay_reason ? loadTripMedia(db, tripId) : Promise.resolve(null),
  ]);
  if (!overview) return null;

  const stopPts = overview.stops.map(pointOf).filter((p): p is GeoPoint => !!p);
  const allKey = `all:${tripId}:${stopPts.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join(';')}`;
  const all = stopPts.length >= 2 ? await cachedRoute(allKey, ALL_TTL_MS, stopPts) : null;

  let ahead: RouteResult | null = null;
  const pos = overview.unit?.position;
  if (pos && (overview.phase === 'active' || overview.phase === 'planned')) {
    const from = overview.phase === 'planned' ? 0 : overview.next_stop_index;
    ahead = from == null ? null : await roadAhead(tripId, pos, overview.stops.slice(from), now);
  }

  // Photos go out as links only — an inline (base64) image is moved to a file first.
  const [logo, avatar, truckPhoto] = await Promise.all([
    meta.customer?.id ? publicImage(db, { table: 'customer', field: 'logo_url' }, meta.customer.id, meta.customer.logo_url) : null,
    meta.driver?.id ? publicImage(db, { table: 'driver', field: 'avatar_url' }, meta.driver.id, meta.driver.avatar_url) : null,
    meta.vehicle?.id ? publicImage(db, { table: 'vehicle', field: 'image_url' }, meta.vehicle.id, meta.vehicle.image_url) : null,
  ]);
  const linkedMeta: TrackingTripMeta = {
    ...meta,
    driver: meta.driver ? { ...meta.driver, avatar_url: avatar } : null,
    vehicle: meta.vehicle ? { ...meta.vehicle, image_url: truckPhoto } : null,
  };
  const customer = meta.customer?.name ? { name: meta.customer.name, logo_url: logo } : null;
  // "Ask": the customer's WhatsApp group, else whoever created the trip, else the company number.
  const brand = {
    ...ctx.brand,
    ask_group_url: whatsAppGroupUrl(meta.customer?.whatsapp_group_link),
    support_whatsapp: (await teamWhatsApp(db, meta.created_by)) ?? ctx.brand.support_whatsapp,
  };
  const data = buildPublicTracking({ overview, meta: linkedMeta, brand, timezone: ctx.timezone, options, ahead, all, media, customer, now });
  remember(payloadCache, cacheKey, { at: now.getTime(), data });
  return data;
}

export type TrackingLookup =
  | { state: 'ok'; data: PublicTracking }
  | { state: Exclude<LinkState, 'ok'> };

/** The trip a tracking token points at, if the link may still be opened. */
async function resolveTripToken(db: PrismaClient, token: string, now: Date) {
  if (token.length < 16 || token.length > 64) return { state: 'not_found' as const };
  const share = await db.tripUpdateShare.findUnique({
    where: { token },
    select: { id: true, tripId: true, update_key: true, expiresAt: true, revokedAt: true, expiry_custom: true, ...LINK_VIEW_SELECT },
  });
  if (!share || share.update_key !== TRACKING_UPDATE_KEY) return { state: 'not_found' as const };
  const meta = await db.trip.findFirst({ where: { id: share.tripId, deletedAt: null }, select: META_SELECT });
  const state = trackingLinkState(share, meta, now);
  if (state !== 'ok') return { state };
  return { state: 'ok' as const, share, meta: meta! };
}

export async function loadPublicTracking(
  db: PrismaClient,
  token: string,
  opts: {
    now?: Date; countView?: boolean; device?: string | null; ip?: string | null;
    /** Token of the customer-wide page the trip was opened from (`?c=`): its view settings apply too. */
    via?: string | null;
  } = {},
): Promise<TrackingLookup> {
  const now = opts.now ?? new Date();
  const found = await resolveTripToken(db, token, now);
  if (found.state !== 'ok') return { state: found.state };
  if (opts.countView) recordTripLinkOpen(db, found.share.id, now, opts.device ?? null, opts.ip ?? null);
  const view = await viewWithFleetLink(db, found.share, found.meta.customer, opts.via, now);
  const data = await buildTripTracking(db, found.share.tripId, found.meta as unknown as TrackingTripMeta & { customer: TrackingCustomerSettings | null }, await loadTrackingContext(db), now, view);
  return data ? { state: 'ok', data } : { state: 'not_found' };
}

/**
 * A trip opened from the customer-wide page shows only what both links allow —
 * hiding the position on the all-trucks link must not be undone one tap later.
 */
async function viewWithFleetLink(
  db: PrismaClient,
  share: LinkView,
  customer: (TrackingCustomerSettings & { id: string }) | null,
  via: string | null | undefined,
  now: Date,
): Promise<LinkView> {
  if (!via || !customer || via.length < 16 || via.length > 64) return share;
  const fleet = await db.customerTrackingLink.findUnique({
    where: { token: via },
    select: { customerId: true, revokedAt: true, expiresAt: true, ...LINK_VIEW_SELECT },
  });
  if (!fleet || fleet.customerId !== customer.id || fleet.revokedAt || (fleet.expiresAt && fleet.expiresAt <= now)) return share;
  const a = optionsOf(customer, share);
  const b = optionsOf(customer, fleet);
  return {
    show_deadline: a.show_deadline && b.show_deadline,
    show_delay_reason: a.show_delay_reason && b.show_delay_reason,
    show_photos: a.show_photos && b.show_photos,
    show_driver: a.show_driver && b.show_driver,
    show_plate: a.show_plate && b.show_plate,
    show_position: a.show_position && b.show_position,
  };
}

/** Counts a page load (not a refresh) and logs it in the open history. Never holds up or fails the page. */
function recordTripLinkOpen(db: PrismaClient, shareId: string, now: Date, device: string | null, ip: string | null) {
  db.$executeRaw`
    UPDATE "trip_update_shares"
    SET open_count = open_count + 1, last_opened_at = ${now}, first_opened_at = COALESCE(first_opened_at, ${now})
    WHERE id = ${shareId}::uuid
  `.catch((err) => logger.warn({ err }, '[tracking] could not record a link open'));
  logLinkOpen(db, { tripShareId: shareId }, now, device, ip);
}

// ── Links (ops side) ────────────────────────────────────────────────────────

export interface TripTrackingLinkInfo {
  /** False when the customer has tracking switched off — then there is no link. */
  enabled: boolean;
  /** Whether status / ETA messages should end with the link (customer setting). */
  auto_link: boolean;
  token: string | null;
  expires_at: string | null;
  created: boolean;
  open_count: number;
  first_opened_at: string | null;
  last_opened_at: string | null;
}

const LINK_SELECT = { token: true, expiresAt: true, open_count: true, first_opened_at: true, last_opened_at: true } as const;

function linkInfo(
  row: { token: string; expiresAt: Date; open_count: number; first_opened_at: Date | null; last_opened_at: Date | null },
  autoLink: boolean,
  created: boolean,
): TripTrackingLinkInfo {
  return {
    enabled: true,
    auto_link: autoLink,
    token: row.token,
    expires_at: row.expiresAt.toISOString(),
    created,
    open_count: row.open_count,
    first_opened_at: row.first_opened_at?.toISOString() ?? null,
    last_opened_at: row.last_opened_at?.toISOString() ?? null,
  };
}

const DISABLED_LINK: TripTrackingLinkInfo = {
  enabled: false, auto_link: false, token: null, expires_at: null, created: false, open_count: 0, first_opened_at: null, last_opened_at: null,
};

/**
 * The trip's live tracking link, created on first ask. `renew` retires every
 * existing link (anyone holding an old one sees "expired") and issues a new one.
 * Null when the trip doesn't exist; `enabled: false` when the customer has
 * tracking switched off.
 */
export async function ensureTrackingLink(
  db: PrismaClient,
  tripId: string,
  opts: { userId: string | null; renew?: boolean; now?: Date },
): Promise<TripTrackingLinkInfo | null> {
  const now = opts.now ?? new Date();
  const trip = await db.trip.findFirst({
    where: { id: tripId, deletedAt: null },
    select: { id: true, customer: { select: { tracking_enabled: true, tracking_auto_link: true } } },
  });
  if (!trip) return null;
  if (trip.customer && !trip.customer.tracking_enabled) return DISABLED_LINK;
  const autoLink = trip.customer?.tracking_auto_link ?? true;

  const live = { tripId, update_key: TRACKING_UPDATE_KEY, expiresAt: { gt: now }, revokedAt: null };
  // A new link keeps the old one's label, expiry choice and view settings.
  let carried: Record<string, unknown> = {};
  if (opts.renew) {
    const prev = await db.tripUpdateShare.findFirst({
      where: { tripId, update_key: TRACKING_UPDATE_KEY },
      orderBy: { createdAt: 'desc' },
      select: { label: true, expiry_custom: true, expiresAt: true, ...LINK_VIEW_SELECT },
    });
    if (prev) {
      const { expiry_custom, expiresAt, ...rest } = prev;
      carried = expiry_custom && expiresAt > now ? { ...rest, expiry_custom, expiresAt } : rest;
    }
    await db.tripUpdateShare.updateMany({ where: live, data: { revokedAt: now, revoked_by: opts.userId } });
  } else {
    const existing = await db.tripUpdateShare.findFirst({ where: live, orderBy: { createdAt: 'desc' }, select: LINK_SELECT });
    if (existing) return linkInfo(existing, autoLink, false);
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
      ...carried,
    },
    select: LINK_SELECT,
  });
  return linkInfo(row, autoLink, true);
}

/** Links for many trips at once (trip list share). Trips that don't exist are left out. */
export async function ensureTrackingLinks(
  db: PrismaClient,
  tripIds: string[],
  opts: { userId: string | null; now?: Date },
): Promise<Record<string, TripTrackingLinkInfo>> {
  const out: Record<string, TripTrackingLinkInfo> = {};
  for (const id of [...new Set(tripIds)]) {
    const link = await ensureTrackingLink(db, id, opts);
    if (link) out[id] = link;
  }
  return out;
}

// Re-exported for the customer-wide page and the preview tags.
export { resolveTripToken, META_SELECT as TRACKING_META_SELECT };

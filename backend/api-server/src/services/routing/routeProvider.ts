/**
 * Road routing, behind one interface.
 *
 * The driver app used to call `router.project-osrm.org` directly. That is the
 * OSRM project's public *demo* server: no SLA, rate-limited, and it can change
 * or disappear without notice — while a driver mid-route depends on it. It also
 * meant the driver's live GPS and the customer's delivery coordinates were sent
 * to a third party MERCON has no agreement with.
 *
 * Worse for us: the provider was baked into a shipped mobile binary. Changing
 * it required an app release that drivers may never install.
 *
 * So the app now asks MERCON, and MERCON asks a provider. Swapping to a
 * self-hosted OSRM — or anything else — becomes a server-side config change.
 * `OSRM_BASE_URL` is that switch; it defaults to the public demo so nothing
 * changes operationally until someone decides otherwise.
 *
 * Production points it at its own OSRM container (docker-compose.yml
 * `osrm`, data built by .github/workflows/build-osrm.yml — docs/infra/ROUTING.md).
 * When that server can't be reached (not installed yet, restarting) the
 * public demo answers instead, so routing degrades rather than stops.
 * "No road route" from our own server is an answer, not an outage: no fallback.
 *
 * OSRM times a car. Trucks are slower, so every leg is timed at no more than
 * TRUCK_MAX_KPH (env ROUTE_TRUCK_MAX_KPH, default 80) — the ETAs on the map,
 * the driver app and the create-trip schedule all come from here.
 */
import { TRUCK_MAX_KPH as SHARED_TRUCK_MAX_KPH } from '@mercon/shared-types';
import { logger } from '../../utils/logger';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface RouteResult {
  /**
   * The road path as [lng, lat] pairs — GeoJSON order, which is what OSRM
   * returns and what the driver app already flips into {latitude, longitude}.
   */
  geometry: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
  /**
   * One entry per hop between consecutive points (points.length - 1 of them),
   * so a caller can time each stop — e.g. the create-trip schedule's ETAs.
   */
  legs: { distanceMeters: number; durationSeconds: number }[];
  /** Which provider answered. Diagnostic; lets a support ticket be traced. */
  provider: string;
}

/** Raised when the provider could not produce a route. Callers degrade. */
export class RoutingUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoutingUnavailableError';
  }
}

/**
 * Read straight from process.env rather than through `config/env`, on purpose:
 * that module calls `required('DATABASE_URL')` at import time and throws
 * without it, which would make routing untestable without a database. Routing
 * has no business depending on Postgres being configured.
 */
const PUBLIC_OSRM = 'https://router.project-osrm.org';
const OSRM_BASE_URL = (process.env.OSRM_BASE_URL || PUBLIC_OSRM).replace(/\/+$/, '');
/** Asked only when OSRM_BASE_URL can't be reached. Empty OSRM_FALLBACK_URL turns it off. */
const OSRM_FALLBACK_URL = (process.env.OSRM_FALLBACK_URL ?? PUBLIC_OSRM).replace(/\/+$/, '');

/** A loaded truck's top average; OSRM's car timing is stretched to at least this. */
const TRUCK_MAX_KPH = Number(process.env.ROUTE_TRUCK_MAX_KPH) > 0 ? Number(process.env.ROUTE_TRUCK_MAX_KPH) : SHARED_TRUCK_MAX_KPH;

/** Car time → truck time: never faster than TRUCK_MAX_KPH over the distance. */
export function truckSeconds(distanceMeters: number, carSeconds: number): number {
  return Math.round(Math.max(carSeconds, distanceMeters / (TRUCK_MAX_KPH / 3.6)));
}

/**
 * Routing must never hold a request open indefinitely. A driver waiting on a
 * blue line is better served by a fast failure and a straight line than by a
 * spinner that never resolves.
 */
const ROUTE_TIMEOUT_MS = 8_000;
/** Our own server sits next to the API: if it hasn't answered in this long, it isn't going to. */
const PRIMARY_TIMEOUT_MS = 3_000;

/** The provider could not be asked at all (down, unreachable, 5xx) — worth trying the fallback. */
class ProviderDownError extends RoutingUnavailableError {}

function isFiniteCoord(p: GeoPoint): boolean {
  return (
    Number.isFinite(p.lat) && Number.isFinite(p.lng) &&
    p.lat >= -90 && p.lat <= 90 && p.lng >= -180 && p.lng <= 180
  );
}

/**
 * Ask the configured provider for a driving route.
 *
 * Throws RoutingUnavailableError rather than returning null so the caller can
 * distinguish "the provider is down" from "there is genuinely no road route",
 * and report each honestly.
 */
export async function getDrivingRoute(from: GeoPoint, to: GeoPoint): Promise<RouteResult> {
  return getDrivingRouteThrough([from, to]);
}

/** Most points one request may carry — keeps the provider URL a sane length. */
export const MAX_ROUTE_POINTS = 25;

/**
 * A driving route through every point in order. Used to draw a trip's
 * remaining stops on real roads instead of straight lines.
 */
export interface RouteOptions {
  /**
   * The way the truck at the first point is heading (degrees from north). The
   * route then starts on the side of the road going that way — without it a
   * truck on a divided highway or an interchange is often put on the opposite
   * carriageway or a ramp, and the route shows a U-turn that isn't there.
   */
  startBearing?: number | null;
}

/** How far either side of the heading the start may snap (OSRM bearing range). */
const START_BEARING_RANGE = 45;

export async function getDrivingRouteThrough(points: GeoPoint[], options: RouteOptions = {}): Promise<RouteResult> {
  if (points.length < 2 || points.length > MAX_ROUTE_POINTS || !points.every(isFiniteCoord)) {
    throw new RoutingUnavailableError('Invalid coordinates');
  }

  // OSRM takes lng,lat — the reverse of how the rest of MERCON writes a point.
  let path = `/route/v1/driving/${points.map((p) => `${p.lng},${p.lat}`).join(';')}?overview=full&geometries=geojson`;
  const b = options.startBearing;
  if (b != null && Number.isFinite(b)) {
    // Only the start is constrained; the other points take any direction.
    path += `&bearings=${Math.round(((b % 360) + 360) % 360)},${START_BEARING_RANGE}${';'.repeat(points.length - 1)}`;
  }
  const fallback = OSRM_FALLBACK_URL && OSRM_FALLBACK_URL !== OSRM_BASE_URL ? OSRM_FALLBACK_URL : null;

  try {
    return await askOsrm(OSRM_BASE_URL, path, fallback ? PRIMARY_TIMEOUT_MS : ROUTE_TIMEOUT_MS, 'osrm');
  } catch (err) {
    if (!(err instanceof ProviderDownError) || !fallback) throw err;
    logger.warn({ provider: OSRM_BASE_URL }, '[routing] own route server down — asking the public one');
    return askOsrm(fallback, path, ROUTE_TIMEOUT_MS, 'osrm-public');
  }
}

async function askOsrm(base: string, path: string, timeoutMs: number, provider: string): Promise<RouteResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${base}${path}`, { signal: controller.signal });
    if (!res.ok) {
      // 4xx is a request it understood and refused; 5xx and 429 mean the server itself is in trouble.
      const Err = res.status >= 500 || res.status === 429 ? ProviderDownError : RoutingUnavailableError;
      throw new Err(`Routing provider returned ${res.status}`);
    }

    const data: any = await res.json();
    if (data?.code !== 'Ok' || !Array.isArray(data?.routes) || data.routes.length === 0) {
      throw new RoutingUnavailableError(`No route available (${data?.code ?? 'unknown'})`);
    }

    const route = data.routes[0];
    const geometry = route?.geometry?.coordinates;
    if (!Array.isArray(geometry) || geometry.length === 0) {
      throw new RoutingUnavailableError('Route contained no geometry');
    }

    const distanceMeters = Number(route.distance) || 0;
    return {
      geometry,
      distanceMeters,
      durationSeconds: truckSeconds(distanceMeters, Number(route.duration) || 0),
      legs: Array.isArray(route.legs)
        ? route.legs.map((l: any) => {
          const d = Number(l?.distance) || 0;
          return { distanceMeters: d, durationSeconds: truckSeconds(d, Number(l?.duration) || 0) };
        })
        : [],
      provider,
    };
  } catch (err) {
    if (err instanceof RoutingUnavailableError) throw err;
    // An aborted fetch and a DNS failure are both "we could not route"; the
    // caller does not need to tell them apart, but the log does.
    logger.warn({ err, provider: base }, '[routing] provider request failed');
    throw new ProviderDownError('Routing provider unreachable');
  } finally {
    clearTimeout(timer);
  }
}

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
 */
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
const OSRM_BASE_URL = (process.env.OSRM_BASE_URL || 'https://router.project-osrm.org').replace(/\/+$/, '');

/**
 * Routing must never hold a request open indefinitely. A driver waiting on a
 * blue line is better served by a fast failure and a straight line than by a
 * spinner that never resolves.
 */
const ROUTE_TIMEOUT_MS = 8_000;

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
export async function getDrivingRouteThrough(points: GeoPoint[]): Promise<RouteResult> {
  if (points.length < 2 || points.length > MAX_ROUTE_POINTS || !points.every(isFiniteCoord)) {
    throw new RoutingUnavailableError('Invalid coordinates');
  }

  // OSRM takes lng,lat — the reverse of how the rest of MERCON writes a point.
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';');
  const url = `${OSRM_BASE_URL}/route/v1/driving/${coords}?overview=full&geometries=geojson`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ROUTE_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new RoutingUnavailableError(`Routing provider returned ${res.status}`);
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

    return {
      geometry,
      distanceMeters: Number(route.distance) || 0,
      durationSeconds: Number(route.duration) || 0,
      provider: 'osrm',
    };
  } catch (err) {
    if (err instanceof RoutingUnavailableError) throw err;
    // An aborted fetch and a DNS failure are both "we could not route"; the
    // caller does not need to tell them apart, but the log does.
    logger.warn({ err, provider: 'osrm' }, '[routing] provider request failed');
    throw new RoutingUnavailableError('Routing provider unreachable');
  } finally {
    clearTimeout(timer);
  }
}

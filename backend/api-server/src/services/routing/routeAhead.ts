/**
 * The road ahead of a truck on a trip: one route per trip and next stop,
 * kept on the server and shared by every screen (web live map, trip page,
 * operator app), so they all show the same line, km and ETA.
 *
 * Asking OSRM afresh from every new GPS fix (what the apps used to do every
 * ~100 m) made the line jump between roads and invent U-turns: a bare GPS
 * point on a divided highway or an interchange is often snapped to the other
 * carriageway or a ramp. Instead:
 *
 *   1. The first time, the route is asked from the truck's position *with its
 *      heading* (routeProvider `startBearing`), so it starts on the side of
 *      the road the truck is driving on.
 *   2. Every time after, the truck is located on that same route — searching
 *      forward from where it was last, so a cloverleaf or a road that doubles
 *      back can't pull it backwards — and only the part still ahead is sent:
 *      the road already driven is never drawn as "to go".
 *   3. A new route is asked only when the truck has really left this one
 *      (OFF_ROUTE_M away on OFF_ROUTE_FIXES fixes in a row, or far off at
 *      once), when the next stop changes, or when the route is old — never
 *      more often than REROUTE_MIN_MS per trip.
 *
 * Distance and time left scale with the share of the route still ahead
 * (OSRM's time is already at truck speed — routeProvider TRUCK_MAX_KPH).
 * Kept in memory: an API restart just asks OSRM once more per trip.
 */
import { getDrivingRouteThrough, RoutingUnavailableError, type GeoPoint } from './routeProvider';

type LngLat = [number, number];

/** Further than this from the route (plus the fix's own accuracy, capped) counts as off it. */
export const OFF_ROUTE_M = 250;
/** Off by this much on one fix is a real detour, not GPS noise — re-route at once. */
const FAR_OFF_ROUTE_M = 1500;
/** Fixes in a row off the route before re-routing (one stray fix is GPS noise). */
const OFF_ROUTE_FIXES = 2;
/** At most one new route per trip this often. */
const REROUTE_MIN_MS = 30_000;
/** A route this old is asked again anyway (roads closed, map updated). */
const ROUTE_MAX_AGE_MS = 3 * 3600_000;
/** How far behind its last spot the truck may be placed (GPS jitter); further back is ignored. */
const BACKTRACK_M = 150;
/** Heading is only trusted while actually driving. */
const HEADING_MIN_KPH = 10;
/** Routes not asked for in this long are dropped. */
const PLAN_IDLE_MS = 2 * 3600_000;

export interface TruckFix {
  lat: number;
  lng: number;
  heading_deg: number | null;
  speed_kph: number | null;
  accuracy_m: number | null;
}

export interface RouteAhead {
  /** [lng, lat] from the truck's spot on the route to the stop. */
  geometry: LngLat[];
  distanceMeters: number;
  durationSeconds: number;
  /** When this was worked out — arrival = computedAt + durationSeconds, the same on every screen. */
  computedAt: string;
  /** The stop this route goes to. */
  stopId: string;
  /** False while the truck is off the route but not yet re-routed (a stray fix). */
  onRoute: boolean;
  /** When the route itself was last asked from OSRM. */
  routedAt: string;
  provider: string;
}

interface Plan {
  stopId: string;
  coords: LngLat[];
  /** Metres along the line to each coordinate. */
  cum: number[];
  /** OSRM's distance and (truck) time for the whole route. */
  routeMeters: number;
  routeSeconds: number;
  provider: string;
  routedAt: number;
  usedAt: number;
  /** Where the truck was last placed: segment index and metres along. */
  seg: number;
  along: number;
  /** The truck's last spot on the route. */
  at: LngLat;
  offFixes: number;
}

const plans = new Map<string, Plan>();
const inflight = new Map<string, Promise<RouteAhead>>();

// ── Geometry (local flat-earth around each segment: plenty for metres-scale snapping) ──

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

function metres(a: LngLat, b: LngLat): number {
  const x = rad(b[0] - a[0]) * Math.cos(rad((a[1] + b[1]) / 2));
  const y = rad(b[1] - a[1]);
  return Math.sqrt(x * x + y * y) * R;
}

/** Closest point on segment a→b to p: distance from p, fraction t along the segment, the point. */
function project(p: LngLat, a: LngLat, b: LngLat): { d: number; t: number; at: LngLat } {
  const k = Math.cos(rad(p[1]));
  const ax = a[0] * k, ay = a[1], bx = b[0] * k, by = b[1], px = p[0] * k, py = p[1];
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  const at: LngLat = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  return { d: metres(p, at), t, at };
}

function cumulative(coords: LngLat[]): number[] {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + metres(coords[i - 1], coords[i]));
  return cum;
}

/**
 * Where the truck is on the route: the nearest point at or after its last spot
 * (less a little jitter). Among points about as near, the earliest wins, so a
 * later stretch passing close by (a cloverleaf, a road back the other way)
 * doesn't pull it ahead either.
 */
export function locateOnRoute(coords: LngLat[], cum: number[], p: LngLat, fromAlong = 0): { seg: number; along: number; offM: number; at: LngLat } {
  const minAlong = Math.max(0, fromAlong - BACKTRACK_M);
  const hits: { seg: number; along: number; d: number; at: LngLat }[] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    if (cum[i + 1] < minAlong) continue;
    const pr = project(p, coords[i], coords[i + 1]);
    const along = cum[i] + (cum[i + 1] - cum[i]) * pr.t;
    if (along < minAlong) continue;
    hits.push({ seg: i, along, d: pr.d, at: pr.at });
  }
  if (!hits.length) {
    const last = coords.length - 1;
    return { seg: Math.max(0, last - 1), along: cum[last], offM: metres(p, coords[last]), at: coords[last] };
  }
  const best = Math.min(...hits.map((h) => h.d));
  const pick = hits.find((h) => h.d <= best + 30)!;
  return { seg: pick.seg, along: pick.along, offM: pick.d, at: pick.at };
}

function aheadOf(plan: Plan, seg: number, at: LngLat, along: number, onRoute: boolean, now: number): RouteAhead {
  const geometry: LngLat[] = [at, ...plan.coords.slice(seg + 1)];
  const total = plan.cum[plan.cum.length - 1] || 1;
  const share = Math.max(0, Math.min(1, (total - along) / total));
  return {
    geometry: geometry.length >= 2 ? geometry : [at, plan.coords[plan.coords.length - 1]],
    distanceMeters: Math.round(plan.routeMeters * share),
    durationSeconds: Math.round(plan.routeSeconds * share),
    computedAt: new Date(now).toISOString(),
    stopId: plan.stopId,
    onRoute,
    routedAt: new Date(plan.routedAt).toISOString(),
    provider: plan.provider,
  };
}

async function routeFresh(tripId: string, fix: TruckFix, stop: GeoPoint & { id: string }, now: number): Promise<RouteAhead> {
  const from = { lat: fix.lat, lng: fix.lng };
  const heading = fix.heading_deg != null && (fix.speed_kph ?? 0) >= HEADING_MIN_KPH ? fix.heading_deg : null;
  let route;
  try {
    route = await getDrivingRouteThrough([from, stop], { startBearing: heading });
  } catch (err) {
    // No road leaves in that heading near the truck (a car park, a bad fix): ask without it.
    if (heading == null || !(err instanceof RoutingUnavailableError)) throw err;
    route = await getDrivingRouteThrough([from, stop]);
  }
  const coords = route.geometry as LngLat[];
  const plan: Plan = {
    stopId: stop.id,
    coords,
    cum: cumulative(coords),
    routeMeters: route.distanceMeters,
    routeSeconds: route.durationSeconds,
    provider: route.provider,
    routedAt: now,
    usedAt: now,
    seg: 0,
    along: 0,
    at: coords[0],
    offFixes: 0,
  };
  plans.set(tripId, plan);
  const here = locateOnRoute(coords, plan.cum, [fix.lng, fix.lat], 0);
  Object.assign(plan, { seg: here.seg, along: here.along, at: here.at });
  return aheadOf(plan, here.seg, here.at, here.along, true, now);
}

/**
 * The road ahead for this trip's truck to its next stop. Throws
 * RoutingUnavailableError when no route can be had (the caller shows a
 * straight line and an estimate).
 */
export async function getRouteAhead(tripId: string, fix: TruckFix, stop: GeoPoint & { id: string }, now = Date.now()): Promise<RouteAhead> {
  for (const [id, p] of plans) if (now - p.usedAt > PLAN_IDLE_MS) plans.delete(id);

  const plan = plans.get(tripId);
  if (plan && plan.stopId === stop.id && now - plan.routedAt < ROUTE_MAX_AGE_MS) {
    plan.usedAt = now;
    const here = locateOnRoute(plan.coords, plan.cum, [fix.lng, fix.lat], plan.along);
    const allowed = OFF_ROUTE_M + Math.min(fix.accuracy_m ?? 0, 250);
    if (here.offM <= allowed) {
      Object.assign(plan, { seg: here.seg, along: here.along, at: here.at, offFixes: 0 });
      return aheadOf(plan, here.seg, here.at, here.along, true, now);
    }
    plan.offFixes++;
    const leftIt = here.offM > FAR_OFF_ROUTE_M || plan.offFixes >= OFF_ROUTE_FIXES;
    if (!leftIt || now - plan.routedAt < REROUTE_MIN_MS) {
      // A stray fix (or re-routed moments ago): keep the route from the last good spot.
      return aheadOf(plan, plan.seg, plan.at, plan.along, false, now);
    }
  }

  // One request per trip at a time, however many screens are watching.
  const running = inflight.get(tripId);
  if (running) return running;
  const p = routeFresh(tripId, fix, stop, now).finally(() => inflight.delete(tripId));
  inflight.set(tripId, p);
  return p;
}

/** Tests only. */
export function __resetRouteAhead() {
  plans.clear();
  inflight.clear();
}

import { Request, Response } from 'express';
import { prisma } from '../db';
import { logger } from '../utils/logger';
import { loadLiveUnits, loadTripMedia } from '../services/fleetLiveMap';
import { linkInlineImage } from '../services/inlineImages';
import { loadTripOverview } from '../services/tripOverview';
import { getDrivingRouteThrough, MAX_ROUTE_POINTS, RoutingUnavailableError, type GeoPoint } from '../services/routing/routeProvider';
import { getRouteAhead } from '../services/routing/routeAhead';
import type { LiveUnit } from '../services/fleetLiveMap';

/** GET /vehicles/live-map — every truck and on-trip driver with both GPS feeds. */
export const getFleetLiveMap = async (_req: Request, res: Response) => {
  try {
    const units = await loadLiveUnits(prisma);
    // Every truck's photo and driver's photo inline was megabytes on each 30 s refresh — send links.
    for (const u of units) {
      linkInlineImage(u.vehicle, 'vehicle');
      linkInlineImage(u.driver, 'driver');
    }
    res.json({ success: true, data: { units, generated_at: new Date().toISOString() } });
  } catch (error) {
    logger.error({ err: error }, 'fleet live map failed');
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

function parsePoint(v: unknown): GeoPoint | null {
  const [lat, lng] = String(v ?? '').split(',').map(Number);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

/**
 * GET /vehicles/live-map/route?from=lat,lng&to=lat,lng
 * GET /vehicles/live-map/route?points=lat,lng;lat,lng;…
 *
 * Road route and drive time for the unit selected on the map — either truck →
 * next stop, or through the trip's remaining stops. Goes through the same
 * provider the driver app uses. 503 when routing is down — the map then shows
 * no drive-time ETA and draws no road line for the later stops.
 */
export const getFleetLiveRoute = async (req: Request, res: Response) => {
  const points = req.query.points != null
    ? String(req.query.points).split(';').map(parsePoint)
    : [parsePoint(req.query.from), parsePoint(req.query.to)];
  if (points.length < 2 || points.length > MAX_ROUTE_POINTS || points.some((p) => !p)) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: `Give from and to, or 2–${MAX_ROUTE_POINTS} points, each as "lat,lng"` },
    });
  }
  try {
    const route = await getDrivingRouteThrough(points as GeoPoint[]);
    res.json({ success: true, data: route });
  } catch (error) {
    if (error instanceof RoutingUnavailableError) {
      return res.status(503).json({ success: false, error: { message: 'Routing is temporarily unavailable' } });
    }
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

/**
 * Every screen watching a truck asks about it every ~15 s; one fleet load
 * serves them all for a few seconds.
 */
const UNITS_TTL_MS = 5_000;
let unitsCache: { at: number; units: Promise<LiveUnit[]> } | null = null;
function liveUnitsShared(): Promise<LiveUnit[]> {
  const now = Date.now();
  if (!unitsCache || now - unitsCache.at > UNITS_TTL_MS) {
    const units = loadLiveUnits(prisma);
    unitsCache = { at: now, units };
    units.catch(() => { if (unitsCache?.units === units) unitsCache = null; });
  }
  return unitsCache.units;
}

/**
 * GET /vehicles/live-map/trips/:id/route-ahead — the road from the trip's
 * truck to its next stop, as every screen should show it: one route kept per
 * trip (services/routing/routeAhead.ts), trimmed to what's still ahead,
 * re-routed only when the truck leaves it. `data: null` when there is nothing
 * to route (no truck position, no next stop with a location).
 */
export const getFleetLiveRouteAhead = async (req: Request, res: Response) => {
  try {
    const tripId = req.params.id as string;
    const unit = (await liveUnitsShared()).find((u) => u.trip?.id === tripId);
    const t = unit?.trip;
    const stop = t && t.next_stop_index != null ? t.stops[t.next_stop_index] : null;
    const pos = unit?.position;
    if (!pos || !stop || stop.lat == null || stop.lng == null || (stop.lat === 0 && stop.lng === 0)) {
      return res.json({ success: true, data: null });
    }
    const ahead = await getRouteAhead(tripId, pos, { id: stop.id, lat: stop.lat, lng: stop.lng });
    res.json({ success: true, data: ahead });
  } catch (error) {
    if (error instanceof RoutingUnavailableError) {
      return res.status(503).json({ success: false, error: { message: 'Routing is temporarily unavailable' } });
    }
    logger.error({ err: error }, 'route ahead failed');
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

/** GET /vehicles/live-map/trips/:id/media — POD photos, cargo photos and delay videos, per stop. */
export const getFleetLiveTripMedia = async (req: Request, res: Response) => {
  try {
    const media = await loadTripMedia(prisma, req.params.id as string);
    if (!media) return res.status(404).json({ success: false, error: { message: 'Trip not found' } });
    res.json({ success: true, data: media });
  } catch (error) {
    logger.error({ err: error }, 'fleet live trip media failed');
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

/** GET /vehicles/live-map/trips/:id/overview — the trip details page's map, for a trip in any state. */
export const getFleetLiveTripOverview = async (req: Request, res: Response) => {
  try {
    const overview = await loadTripOverview(prisma, req.params.id as string);
    if (!overview) return res.status(404).json({ success: false, error: { message: 'Trip not found' } });
    res.json({ success: true, data: overview });
  } catch (error) {
    logger.error({ err: error }, 'trip overview failed');
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

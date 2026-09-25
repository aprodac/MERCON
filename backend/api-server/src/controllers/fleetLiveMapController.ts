import { Request, Response } from 'express';
import { prisma } from '../db';
import { logger } from '../utils/logger';
import { loadLiveUnits, loadTripMedia } from '../services/fleetLiveMap';
import { getDrivingRouteThrough, MAX_ROUTE_POINTS, RoutingUnavailableError, type GeoPoint } from '../services/routing/routeProvider';

/** GET /vehicles/live-map — every truck and on-trip driver with both GPS feeds. */
export const getFleetLiveMap = async (_req: Request, res: Response) => {
  try {
    const units = await loadLiveUnits(prisma);
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

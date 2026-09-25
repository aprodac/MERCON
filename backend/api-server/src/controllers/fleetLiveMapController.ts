import { Request, Response } from 'express';
import { prisma } from '../db';
import { logger } from '../utils/logger';
import { loadLiveUnits } from '../services/fleetLiveMap';
import { getDrivingRoute, RoutingUnavailableError } from '../services/routing/routeProvider';

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

/**
 * GET /vehicles/live-map/route?from=lat,lng&to=lat,lng
 *
 * Road route and drive time for the unit selected on the map. Goes through the
 * same provider the driver app uses. 503 when routing is down — the map then
 * draws a straight line and shows no drive-time ETA.
 */
export const getFleetLiveRoute = async (req: Request, res: Response) => {
  const parse = (v: unknown) => {
    const [lat, lng] = String(v ?? '').split(',').map(Number);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  };
  const from = parse(req.query.from);
  const to = parse(req.query.to);
  if (!from || !to) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'from and to must be "lat,lng"' } });
  }
  try {
    const route = await getDrivingRoute(from, to);
    res.json({ success: true, data: route });
  } catch (error) {
    if (error instanceof RoutingUnavailableError) {
      return res.status(503).json({ success: false, error: { message: 'Routing is temporarily unavailable' } });
    }
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

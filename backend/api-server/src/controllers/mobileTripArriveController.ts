/**
 * POST /mobile/trips/:id/log/arrive { stop_id, lat?, lng? } — the driver tapped
 * "Arrived" at a stop of their running customer-app (trip-log) trip. Stamps the
 * stop's arrival once (services/tripLogArrive.ts) and logs where the phone was.
 */
import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { logger } from '../utils/logger';
import { ArriveError, arriveAtStop, type ArriveDb } from '../services/tripLogArrive';
import { recordDriverActivity } from '../services/driverPhone/activity';
import { attachTripDocuments, tripInclude } from './mobileTripController';

const body = z.object({
  stop_id: z.string().uuid(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export const driverArriveAtStop = async (req: Request, res: Response) => {
  const driverId = (req as any).user?.driver_id;
  const id = req.params.id as string;
  if (!driverId) return res.status(403).json({ success: false, error: { message: 'Driver not authenticated' } });
  const parsed = body.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Pick the stop you arrived at' } });

  try {
    const { stop_id, lat, lng } = parsed.data;
    const r = await arriveAtStop(prisma as unknown as ArriveDb, id, driverId, stop_id);
    if (r.stamped) {
      void recordDriverActivity(driverId, 'StopArrived', { tripId: id, lat, lng, metadata: { stopId: stop_id, arrivedAt: r.arrivedAt.toISOString() } });
    }
    const full = await prisma.trip.findUnique({ where: { id }, include: tripInclude });
    res.json({ success: true, data: await attachTripDocuments(full) });
  } catch (error) {
    if (error instanceof ArriveError) {
      return res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
    }
    logger.error({ err: error }, 'driverArriveAtStop error:');
    res.status(500).json({ success: false, error: { message: 'Could not save the arrival' } });
  }
};

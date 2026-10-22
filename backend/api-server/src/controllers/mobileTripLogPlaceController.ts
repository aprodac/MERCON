/**
 * POST /mobile/trips/:id/log/:entry/stop — the driver says where a trip-log
 * send was made: at one of the trip's stops ({ stop_id }), or at a stop the
 * office didn't plan ({ new_stop: { stop_type, name?, lat?, lng? } }). Same work as the
 * office's "Make stop" (services/tripLogPlace.ts); the screenshot's time stays
 * "to check" for the office. Only the driver's own running trip-log trip.
 */
import { Request, Response } from 'express';
import { z } from 'zod';
import { TRIP_LOG_STATE } from '@mercon/shared-types';
import { prisma } from '../db';
import { logger } from '../utils/logger';
import { PlaceLogError, placeLogEntry } from '../services/tripLogPlace';
import { attachTripDocuments, tripInclude } from './mobileTripController';

const body = z.union([
  z.object({ stop_id: z.string().uuid() }),
  // The name is optional (the phone's town, or the screenshot's place, is used); lat/lng is where the phone is now.
  z.object({ new_stop: z.object({
    name: z.string().trim().max(120).optional(),
    stop_type: z.enum(['Pickup', 'Dropoff']),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
  }) }),
]);

export const driverPlaceLogEntry = async (req: Request, res: Response) => {
  const driverId = (req as any).user?.driver_id;
  const { id, entry } = req.params as { id: string; entry: string };
  if (!driverId) return res.status(403).json({ success: false, error: { message: 'Driver not authenticated' } });
  const parsed = body.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Pick a stop, or say what the new stop is (loading or drop-off)' } });

  try {
    const trip = await prisma.trip.findFirst({ where: { id, driverId, deletedAt: null }, select: { id: true, driver_workflow_state: true } });
    if (!trip) return res.status(404).json({ success: false, error: { message: 'Trip not found or not assigned to you' } });
    if (trip.driver_workflow_state !== TRIP_LOG_STATE) {
      return res.status(409).json({ success: false, error: { code: 'NOT_TRIP_LOG', message: 'This trip uses the step-by-step screens' } });
    }
    const b = parsed.data;
    await placeLogEntry(id, entry, 'stop_id' in b
      ? { action: 'attach', stop_id: b.stop_id, byDriver: true }
      : {
        action: 'new', name: b.new_stop.name, stop_type: b.new_stop.stop_type, byDriver: true,
        gps: b.new_stop.lat != null && b.new_stop.lng != null ? { lat: b.new_stop.lat, lng: b.new_stop.lng } : undefined,
      });
    const full = await prisma.trip.findUnique({ where: { id }, include: tripInclude });
    res.json({ success: true, data: await attachTripDocuments(full) });
  } catch (error) {
    if (error instanceof PlaceLogError) {
      return res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
    }
    logger.error({ err: error }, 'driverPlaceLogEntry error:');
    res.status(500).json({ success: false, error: { message: 'Could not save the stop' } });
  }
};

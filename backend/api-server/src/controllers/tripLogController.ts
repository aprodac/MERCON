/**
 * Office side of the trip log (shared-types tripLog): a customer-app trip's
 * driver sends screenshots without stops; here the office turns one entry into
 * a stop, or adds it to a stop the trip already has. The entry's screenshots
 * then sit on that stop, so Check times and the stop's photos work as usual.
 * The work is in services/tripLogPlace.ts (the driver app uses it too).
 */
import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { isUuid } from '../utils/uuid';
import { resolveTripId } from './tripController';
import { PlaceLogError, placeLogEntry, type PlaceLogInput } from '../services/tripLogPlace';

export const logEntryToStop = async (req: Request, res: Response) => {
  try {
    const raw = req.params.id as string;
    const entry = req.params.entry as string;
    const tripId = isUuid(raw) ? raw : await resolveTripId(raw);
    if (!tripId) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Trip not found' } });
    const body = req.body as Omit<PlaceLogInput, 'verifiedBy' | 'byDriver'>;
    const verifiedBy = isUuid((req as any).user?.id) ? (req as any).user.id : null;
    const stopId = await placeLogEntry(tripId, entry, { ...body, verifiedBy });
    res.json({ success: true, data: { stop_id: stopId } });
  } catch (error: any) {
    if (error instanceof PlaceLogError) {
      return res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
    }
    logger.error({ err: error }, 'logEntryToStop error:');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to make the stop' } });
  }
};

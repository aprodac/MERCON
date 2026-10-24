/**
 * Office side of the trip log (shared-types tripLog): a customer-app trip's
 * driver sends screenshots without stops; here the office turns one entry into
 * a stop, or adds it to a stop the trip already has. The entry's screenshots
 * then sit on that stop, so Check times and the stop's photos work as usual.
 * The work is in services/tripLogPlace.ts (the driver app uses it too).
 */
import { Request, Response } from 'express';
import { prisma } from '../db';
import { logger } from '../utils/logger';
import { isUuid } from '../utils/uuid';
import { resolveTripId } from './tripController';
import { PlaceLogError, placeLogEntry, type PlaceLogInput } from '../services/tripLogPlace';
import { trashDocuments } from './documentController';

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

/**
 * DELETE /trips/:id/photos/:docId — the office removes a photo or screenshot the
 * driver sent by mistake (TestFlight 24 Oct: "if he did a trial and uploaded the
 * wrong one, the operator should be able to delete it"). Only a document on this
 * trip or one of its stops; it goes to Recently deleted, where it can be restored.
 * Stop times already saved from it stay as they are.
 */
export const deleteTripPhoto = async (req: Request, res: Response) => {
  try {
    const raw = req.params.id as string;
    const docId = req.params.docId as string;
    const tripId = isUuid(raw) ? raw : await resolveTripId(raw);
    if (!tripId || !isUuid(docId)) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Photo not found on this trip' } });
    const stops = await prisma.tripStop.findMany({ where: { tripId }, select: { id: true } });
    const doc = await prisma.document.findFirst({
      where: {
        id: docId,
        deletedAt: null,
        OR: [
          { entity_type: 'Trip', entity_id: tripId },
          { entity_type: 'TripStop', entity_id: { in: stops.map((s) => s.id) } },
        ],
      },
      select: { id: true },
    });
    if (!doc) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Photo not found on this trip' } });
    await trashDocuments(req, [doc.id]);
    res.json({ success: true, data: { id: doc.id } });
  } catch (error) {
    logger.error({ err: error }, 'deleteTripPhoto error:');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to delete the photo' } });
  }
};

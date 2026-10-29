/**
 * Office side of the trip log (shared-types tripLog): a customer-app trip's
 * driver sends screenshots without stops; here the office turns one entry into
 * a stop, or adds it to a stop the trip already has. The entry's screenshots
 * then sit on that stop, so Check times and the stop's photos work as usual.
 * The work is in services/tripLogPlace.ts (the driver app uses it too).
 */
import { Request, Response } from 'express';
import { DocStatus, Prisma } from '@prisma/client';
import { prisma } from '../db';
import { logger } from '../utils/logger';
import { isUuid } from '../utils/uuid';
import { resolveTripId } from './tripController';
import { PlaceLogError, placeLogEntry, type PlaceLogInput } from '../services/tripLogPlace';
import { trashDocuments } from './documentController';
import { logAuditEvent } from '../services/auditService';

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

/**
 * PATCH /trips/:id/photos/:docId { stop_id } — the office moves a photo or
 * screenshot the driver sent at the wrong stop (TestFlight 25 Oct: "he uploaded
 * the Riyadh reached screenshot as Baha reached"). Only a document on this trip
 * or its stops, to a stop on this trip. A customer-app screenshot goes back to
 * "time to check" for its new stop. The driver's steps are not changed here —
 * "Driver's steps" takes those back.
 */
export const moveTripPhoto = async (req: Request, res: Response) => {
  try {
    const raw = req.params.id as string;
    const docId = req.params.docId as string;
    const stopId = String(req.body?.stop_id ?? '');
    const tripId = isUuid(raw) ? raw : await resolveTripId(raw);
    if (!tripId || !isUuid(docId)) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Photo not found on this trip' } });
    const stops = await prisma.tripStop.findMany({ where: { tripId, deletedAt: null }, select: { id: true, leg_index: true, location_name: true } });
    const stop = stops.find((s) => s.id === stopId);
    if (!stop) return res.status(400).json({ success: false, error: { code: 'UNKNOWN_STOP', message: 'That stop is not on this trip' } });
    const doc = await prisma.document.findFirst({
      where: {
        id: docId,
        deletedAt: null,
        OR: [
          { entity_type: 'Trip', entity_id: tripId },
          { entity_type: 'TripStop', entity_id: { in: stops.map((s) => s.id) } },
        ],
      },
      select: { id: true, entity_type: true, status: true, ai_extracted_json: true },
    });
    if (!doc) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Photo not found on this trip' } });
    const meta = (doc.ai_extracted_json ?? {}) as Record<string, unknown>;
    const userId = isUuid((req as any).user?.id) ? (req as any).user.id : null;
    const screenshot = meta.source === 'external_app_screenshot';
    await prisma.document.update({
      where: { id: doc.id },
      data: {
        ...(doc.entity_type === 'TripStop' ? { entity_id: stop.id } : {}),
        ...(screenshot ? { status: DocStatus.PendingReview, verified_by: null } : {}),
        ai_extracted_json: {
          ...meta,
          stop_id: stop.id,
          leg_index: stop.leg_index ?? 0,
          moved_by_office: { from_stop_id: meta.stop_id ?? null, at: new Date().toISOString(), by: userId },
        } as Prisma.InputJsonValue,
        ...(userId ? { updated_by: userId } : {}),
      },
    });
    void logAuditEvent({ req, action: 'TRIP_PHOTO_MOVED', entityType: 'Trip', entityId: tripId, metadata: { document_id: doc.id, from_stop_id: meta.stop_id ?? null, to_stop_id: stop.id } });
    res.json({ success: true, data: { id: doc.id, stop_id: stop.id } });
  } catch (error) {
    logger.error({ err: error }, 'moveTripPhoto error:');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to move the photo' } });
  }
};

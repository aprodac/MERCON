/**
 * GET  /trips/:id/progress-steps — the trip's steps, which are done, and how many photos each
 *                                  "go back to here" would affect.
 * POST /trips/:id/step-forward    — move the trip on one step for the driver (not the finishing step).
 * POST /trips/:id/step-back       — { to_index, photos: 'move' | 'remove' | 'keep' }: take the trip
 *                                  back to that step (services/tripStepBack.ts). Audited, and the
 *                                  driver is told where their app now is.
 * POST /trips/:id/step-back/undo  — put the latest step-back back the way it was (while the trip
 *                                  hasn't moved on since).
 */
import { Request, Response } from 'express';
import { StepBackError, getTripProgressSteps, restoreStepBackPhotos, stepBackTrip, stepForwardTrip, undoStepBack, type StepBackUndo } from '../services/tripStepBack';
import { prisma } from '../db';
import { createDriverNotification } from './notificationController';
import { logAuditEvent } from '../services/auditService';
import { logger } from '../utils/logger';

const fail = (res: Response, error: unknown, what: string) => {
  if (error instanceof StepBackError) {
    return res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
  }
  logger.error({ err: error }, `Failed to ${what}`);
  return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: `Failed to ${what}` } });
};

export const getProgressSteps = async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await getTripProgressSteps(req.params.id as string) });
  } catch (error) {
    fail(res, error, 'load the trip steps');
  }
};

export const stepBack = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id ?? null;
    const { to_index, photos } = req.body as { to_index: number; photos: 'move' | 'remove' | 'keep' };
    const result = await stepBackTrip(req.params.id as string, to_index, photos, userId);

    void logAuditEvent({
      req,
      action: 'TRIP_STEPPED_BACK',
      entityType: 'Trip',
      entityId: result.trip_id,
      metadata: { from: result.from, to: result.to, cleared: result.cleared, photos: result.photos, undo: result.undo },
    });
    if (result.driver_id) {
      void createDriverNotification(
        result.driver_id,
        'Trip step undone by the office',
        `Your trip was taken back to: ${result.to.label}. Next: ${result.to.next}.`,
        // The driver app's notification types are PascalCase (TripCancelled, TripReassigned …).
        'TripSteppedBack',
        'Trip',
        result.trip_id,
      );
    }
    res.json({ success: true, data: result });
  } catch (error) {
    fail(res, error, 'take the trip back');
  }
};

export const stepForward = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id ?? null;
    const toIndex = Number.isInteger(req.body?.to_index) ? Number(req.body.to_index) : undefined;
    const result = await stepForwardTrip(req.params.id as string, userId, toIndex);
    void logAuditEvent({ req, action: 'TRIP_STEPPED_FORWARD', entityType: 'Trip', entityId: result.trip_id, metadata: { from: result.from, to: result.to } });
    if (result.driver_id) {
      void createDriverNotification(
        result.driver_id,
        'Trip moved on by the office',
        `The office marked: ${result.to.label}. Next: ${result.to.next}.`,
        // Same type as a step-back: driver apps already refresh and reopen the right screen on it.
        'TripSteppedBack',
        'Trip',
        result.trip_id,
      );
    }
    res.json({ success: true, data: result });
  } catch (error) {
    fail(res, error, 'move the trip on');
  }
};

/** POST /trips/:id/step-back/restore-photos { removed_at } — undo the "remove photos" of a step-back. */
export const restoreStepBackPhotosHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id ?? null;
    const removedAt = String(req.body?.removed_at ?? '');
    if (!removedAt) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Which step-back? (removed_at)' } });
    const restored = await restoreStepBackPhotos(req.params.id as string, removedAt, userId);
    void logAuditEvent({ req, action: 'TRIP_STEP_BACK_PHOTOS_RESTORED', entityType: 'Trip', entityId: req.params.id as string, metadata: { removed_at: removedAt, restored } });
    res.json({ success: true, data: { restored } });
  } catch (error) {
    fail(res, error, 'restore the photos');
  }
};

/** POST /trips/:id/step-back/undo — undo the trip's latest step-back. */
export const undoStepBackHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id ?? null;
    const tripId = req.params.id as string;
    const last = await prisma.auditLog.findFirst({
      where: { entityType: 'Trip', entityId: tripId, action: 'TRIP_STEPPED_BACK' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, metadata: true },
    });
    const m = (last?.metadata ?? {}) as { undo?: StepBackUndo; to?: { index?: number } };
    const undone = last && await prisma.auditLog.findFirst({
      where: { entityType: 'Trip', entityId: tripId, action: 'TRIP_STEP_BACK_UNDONE', metadata: { path: ['step_back_id'], equals: last.id } },
      select: { id: true },
    });
    if (!last || !m.undo || typeof m.to?.index !== 'number' || undone) {
      return res.status(409).json({ success: false, error: { code: 'NOTHING_TO_UNDO', message: 'There is no take-back to undo on this trip.' } });
    }
    const result = await undoStepBack(tripId, m.undo, m.to.index, userId);
    void logAuditEvent({ req, action: 'TRIP_STEP_BACK_UNDONE', entityType: 'Trip', entityId: tripId, metadata: { step_back_id: last.id, to: result.to } });
    if (result.driver_id) {
      void createDriverNotification(
        result.driver_id,
        'Trip step put back by the office',
        `The office undid its change. Your trip is at: ${result.to.label}.`,
        'TripSteppedBack',
        'Trip',
        tripId,
      );
    }
    res.json({ success: true, data: result });
  } catch (error) {
    fail(res, error, 'undo the take-back');
  }
};

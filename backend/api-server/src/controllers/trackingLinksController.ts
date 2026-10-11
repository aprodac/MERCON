import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { logger } from '../utils/logger';
import { logAuditEvent } from '../services/auditService';
import { trackingBaseUrl } from './operatorInboxController';
import {
  LinkChangeError, getTrackingLink, listTrackingLinks, replaceTrackingLink, revokeTrackingLink, updateTrackingLink, type LinkKind,
} from '../services/tracking/trackingLinksAdmin';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function actorId(req: Request): string | null {
  const id = (req as { user?: { id?: unknown } }).user?.id;
  return typeof id === 'string' && UUID_RE.test(id) ? id : null;
}

export const linkParams = z.object({
  kind: z.enum(['trip', 'customer']),
  id: z.string().uuid(),
});

export const listLinksQuery = z.object({
  kind: z.enum(['trip', 'customer', 'all']).optional(),
  status: z.enum(['live', 'ended', 'all']).optional(),
  q: z.string().max(100).optional(),
  customer_id: z.string().uuid().optional(),
  trip_id: z.string().uuid().optional(),
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const updateLinkBody = z.object({
  label: z.string().max(120).nullable().optional(),
  expires_at: z.string().datetime().nullable().optional(),
  view: z.object({
    show_deadline: z.boolean().nullable().optional(),
    show_delay_reason: z.boolean().nullable().optional(),
    show_photos: z.boolean().nullable().optional(),
    show_driver: z.boolean().optional(),
    show_plate: z.boolean().optional(),
    show_position: z.boolean().optional(),
  }).optional(),
});

const entityOf = (kind: LinkKind) => (kind === 'trip' ? 'TripTrackingLink' : 'CustomerTrackingLink');

function fail(res: Response, error: unknown, what: string) {
  if (error instanceof LinkChangeError) {
    return res.status(error.status).json({ success: false, error: { message: error.message } });
  }
  logger.error({ err: error }, what);
  return res.status(500).json({ success: false, error: { message: 'Internal server error' } });
}

/** GET /tracking-links — trip and customer links, newest first, with live counts. */
export const getTrackingLinks = async (req: Request, res: Response) => {
  try {
    const data = await listTrackingLinks(prisma, req.query as z.infer<typeof listLinksQuery>, trackingBaseUrl(req));
    res.json({ success: true, data });
  } catch (error) {
    fail(res, error, 'tracking links list failed');
  }
};

/** GET /tracking-links/:kind/:id — one link with its settings, open history and older links. */
export const getTrackingLinkDetail = async (req: Request, res: Response) => {
  try {
    const { kind, id } = req.params as z.infer<typeof linkParams>;
    const data = await getTrackingLink(prisma, kind, id, trackingBaseUrl(req));
    if (!data) return res.status(404).json({ success: false, error: { message: 'Link not found' } });
    res.json({ success: true, data });
  } catch (error) {
    fail(res, error, 'tracking link detail failed');
  }
};

/** PATCH /tracking-links/:kind/:id — label, expiry, what the page shows. */
export const patchTrackingLink = async (req: Request, res: Response) => {
  try {
    const { kind, id } = req.params as z.infer<typeof linkParams>;
    const body = req.body as z.infer<typeof updateLinkBody>;
    await updateTrackingLink(prisma, kind, id, body);
    await logAuditEvent({ req, action: 'TRACKING_LINK_UPDATED', entityType: entityOf(kind), entityId: id, metadata: body });
    const data = await getTrackingLink(prisma, kind, id, trackingBaseUrl(req));
    res.json({ success: true, data });
  } catch (error) {
    fail(res, error, 'tracking link update failed');
  }
};

/** POST /tracking-links/:kind/:id/revoke — the link stops working now. */
export const revokeTrackingLinkHandler = async (req: Request, res: Response) => {
  try {
    const { kind, id } = req.params as z.infer<typeof linkParams>;
    const done = await revokeTrackingLink(prisma, kind, id, actorId(req));
    if (done) await logAuditEvent({ req, action: 'TRACKING_LINK_REVOKED', entityType: entityOf(kind), entityId: id });
    const data = await getTrackingLink(prisma, kind, id, trackingBaseUrl(req));
    if (!data) return res.status(404).json({ success: false, error: { message: 'Link not found' } });
    res.json({ success: true, data });
  } catch (error) {
    fail(res, error, 'tracking link revoke failed');
  }
};

/** POST /tracking-links/:kind/:id/replace — a new link with the same settings; the old one stops. */
export const replaceTrackingLinkHandler = async (req: Request, res: Response) => {
  try {
    const { kind, id } = req.params as z.infer<typeof linkParams>;
    const newId = await replaceTrackingLink(prisma, kind, id, actorId(req));
    if (!newId) return res.status(409).json({ success: false, error: { message: 'Tracking is switched off for this customer.' } });
    await logAuditEvent({ req, action: 'TRACKING_LINK_REPLACED', entityType: entityOf(kind), entityId: id, metadata: { new_id: newId } });
    const data = await getTrackingLink(prisma, kind, newId, trackingBaseUrl(req));
    res.status(201).json({ success: true, data });
  } catch (error) {
    fail(res, error, 'tracking link replace failed');
  }
};

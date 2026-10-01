import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { logger } from '../utils/logger';
import { ensureTrackingLink, loadPublicTracking } from '../services/tracking/customerTracking';
import { publicBaseUrl } from './operatorInboxController';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const trackingLinkBody = z.object({
  renew: z.boolean().optional(),
}).optional().default({});

/**
 * POST /trips/:id/tracking-link — the trip's customer tracking link, created on
 * first ask. `{ renew: true }` retires the current link and issues a new one.
 */
export const getTripTrackingLink = async (req: Request, res: Response) => {
  try {
    const userId = (req as { user?: { id?: unknown } }).user?.id;
    const link = await ensureTrackingLink(prisma, req.params.id as string, {
      userId: typeof userId === 'string' && UUID_RE.test(userId) ? userId : null,
      renew: !!req.body?.renew,
    });
    if (!link) return res.status(404).json({ success: false, error: { message: 'Trip not found' } });
    res.status(link.created ? 201 : 200).json({
      success: true,
      data: { url: `${publicBaseUrl(req)}/t/${link.token}`, token: link.token, expires_at: link.expires_at, created: link.created },
    });
  } catch (error) {
    logger.error({ err: error }, 'tracking link failed');
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

const GONE_MESSAGE = {
  expired: 'This tracking link has expired.',
  cancelled: 'This trip was cancelled.',
} as const;

/** GET /public/track/:token — what the customer's tracking page shows. No login: the token is the permission. */
export const getPublicTracking = async (req: Request, res: Response) => {
  try {
    const result = await loadPublicTracking(prisma, String(req.params.token || ''));
    if (result.state === 'not_found') {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'This tracking link is not valid.' } });
    }
    if (result.state !== 'ok') {
      return res.status(410).json({ success: false, error: { code: result.state.toUpperCase(), message: GONE_MESSAGE[result.state] } });
    }
    res.json({ success: true, data: result.data });
  } catch (error) {
    logger.error({ err: error }, 'public tracking failed');
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

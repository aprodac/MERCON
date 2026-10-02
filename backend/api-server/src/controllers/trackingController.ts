import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { logger } from '../utils/logger';
import { logAuditEvent } from '../services/auditService';
import { ensureTrackingLink, ensureTrackingLinks, loadPublicTracking, type TripTrackingLinkInfo } from '../services/tracking/customerTracking';
import { ensureCustomerTrackingLink, loadCustomerFleetTracking } from '../services/tracking/customerFleetTracking';
import { fleetPreview, renderPreviewTags, tripPreview } from '../services/tracking/trackingPreview';
import { publicBaseUrl } from './operatorInboxController';
import { deviceLabel } from '../utils/deviceLabel';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function actorId(req: Request): string | null {
  const id = (req as { user?: { id?: unknown } }).user?.id;
  return typeof id === 'string' && UUID_RE.test(id) ? id : null;
}

export const trackingLinkBody = z.object({
  renew: z.boolean().optional(),
}).optional().default({});

export const trackingLinksBody = z.object({
  trip_ids: z.array(z.string().uuid()).min(1).max(100),
});

const withUrl = (req: Request, link: TripTrackingLinkInfo) => ({
  ...link,
  url: link.token ? `${publicBaseUrl(req)}/t/${link.token}` : null,
});

/**
 * POST /trips/:id/tracking-link — the trip's customer tracking link, created on
 * first ask. `{ renew: true }` retires the current link and issues a new one.
 * `enabled: false` (and no url) when the customer has tracking switched off.
 */
export const getTripTrackingLink = async (req: Request, res: Response) => {
  try {
    const tripId = req.params.id as string;
    const renew = !!req.body?.renew;
    const link = await ensureTrackingLink(prisma, tripId, { userId: actorId(req), renew });
    if (!link) return res.status(404).json({ success: false, error: { message: 'Trip not found' } });
    if (link.created) {
      await logAuditEvent({ req, action: renew ? 'TRACKING_LINK_RENEWED' : 'TRACKING_LINK_CREATED', entityType: 'Trip', entityId: tripId });
    }
    res.status(link.created ? 201 : 200).json({ success: true, data: withUrl(req, link) });
  } catch (error) {
    logger.error({ err: error }, 'tracking link failed');
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

/** POST /trips/tracking-links — links for several trips at once (trip list share). Keyed by trip id. */
export const getTripTrackingLinks = async (req: Request, res: Response) => {
  try {
    const { trip_ids } = req.body as z.infer<typeof trackingLinksBody>;
    const links = await ensureTrackingLinks(prisma, trip_ids, { userId: actorId(req) });
    const data = Object.fromEntries(Object.entries(links).map(([id, link]) => [id, withUrl(req, link)]));
    res.json({ success: true, data });
  } catch (error) {
    logger.error({ err: error }, 'tracking links failed');
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

/** POST /customers/:id/tracking-link — the customer-wide page (all their trucks on the road). */
export const getCustomerTrackingLink = async (req: Request, res: Response) => {
  try {
    const customerId = req.params.id as string;
    const renew = !!req.body?.renew;
    const link = await ensureCustomerTrackingLink(prisma, customerId, { userId: actorId(req), renew });
    if (!link) return res.status(404).json({ success: false, error: { message: 'Customer not found' } });
    if (link.created) {
      await logAuditEvent({ req, action: renew ? 'CUSTOMER_TRACKING_LINK_RENEWED' : 'CUSTOMER_TRACKING_LINK_CREATED', entityType: 'Customer', entityId: customerId });
    }
    res.status(link.created ? 201 : 200).json({
      success: true,
      data: { ...link, url: link.token ? `${publicBaseUrl(req)}/c/${link.token}` : null },
    });
  } catch (error) {
    logger.error({ err: error }, 'customer tracking link failed');
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

const GONE_MESSAGE = {
  expired: 'This tracking link has expired.',
  cancelled: 'This trip was cancelled.',
  disabled: "Tracking isn't available for this shipment.",
} as const;

function sendGone(res: Response, state: 'not_found' | 'expired' | 'cancelled' | 'disabled') {
  if (state === 'not_found') {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'This tracking link is not valid.' } });
  }
  return res.status(410).json({ success: false, error: { code: state.toUpperCase(), message: GONE_MESSAGE[state] } });
}

/**
 * GET /public/track/:token — what the customer's tracking page shows. No login:
 * the token is the permission. `?view=1` (the page's first load) counts an open.
 */
export const getPublicTracking = async (req: Request, res: Response) => {
  try {
    const result = await loadPublicTracking(prisma, String(req.params.token || ''), { countView: req.query.view === '1', device: deviceLabel(req.headers['user-agent']) });
    if (result.state !== 'ok') return sendGone(res, result.state);
    res.json({ success: true, data: result.data });
  } catch (error) {
    logger.error({ err: error }, 'public tracking failed');
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

/** GET /public/fleet/:token — the customer-wide page: every truck of theirs on the road. */
export const getPublicFleetTracking = async (req: Request, res: Response) => {
  try {
    const result = await loadCustomerFleetTracking(prisma, String(req.params.token || ''), { countView: req.query.view === '1', device: deviceLabel(req.headers['user-agent']) });
    if (result.state !== 'ok') return sendGone(res, result.state);
    res.json({ success: true, data: result.data });
  } catch (error) {
    logger.error({ err: error }, 'public fleet tracking failed');
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

/**
 * GET /public/og/:kind/:token — Open Graph tags for a tracking link's WhatsApp
 * preview, as an HTML fragment. Called by the web container's nginx (SSI) when
 * it serves /t/ or /c/. Never counts as an open. Empty on any problem, so the
 * page is served without a preview rather than not at all.
 */
export const getTrackingPreviewTags = async (req: Request, res: Response) => {
  res.type('text/html');
  try {
    const token = String(req.params.token || '');
    const proto = String(req.get('x-forwarded-proto') || 'https').split(',')[0].trim();
    const host = req.get('x-public-host');
    const base = process.env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, '') || (host ? `${proto}://${host}` : null);
    if (req.params.kind === 't') {
      const r = await loadPublicTracking(prisma, token);
      return res.send(r.state === 'ok' ? renderPreviewTags(tripPreview(r.data), base) : '');
    }
    if (req.params.kind === 'c') {
      const r = await loadCustomerFleetTracking(prisma, token);
      return res.send(r.state === 'ok' ? renderPreviewTags(fleetPreview(r.data), base) : '');
    }
    res.send('');
  } catch (error) {
    logger.warn({ err: error }, 'tracking preview tags failed');
    res.send('');
  }
};

/**
 * GET /customers/:id/tracking-opens — every time this customer opened one of
 * their tracking links (all-trucks page or a trip link), newest first, with the
 * device. `earlier_opens` = opens counted before the history was kept.
 */
export const getCustomerTrackingOpens = async (req: Request, res: Response) => {
  try {
    const customerId = req.params.id as string;
    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
    const where = {
      OR: [
        { customerLink: { customerId } },
        { tripShare: { trip: { customerId } } },
      ],
    };
    const [rows, logged, fleetCounted, tripCounted] = await Promise.all([
      prisma.trackingLinkOpen.findMany({
        where,
        orderBy: { opened_at: 'desc' },
        take: limit,
        select: {
          id: true,
          opened_at: true,
          device: true,
          customerLinkId: true,
          tripShare: { select: { trip: { select: { id: true, ref_id: true } } } },
        },
      }),
      prisma.trackingLinkOpen.count({ where }),
      prisma.customerTrackingLink.aggregate({ where: { customerId }, _sum: { open_count: true } }),
      prisma.tripUpdateShare.aggregate({ where: { trip: { customerId } }, _sum: { open_count: true } }),
    ]);
    const counted = (fleetCounted._sum.open_count ?? 0) + (tripCounted._sum.open_count ?? 0);

    res.json({
      success: true,
      data: {
        total: logged,
        earlier_opens: Math.max(0, counted - logged),
        opens: rows.map((r) => ({
          id: r.id,
          opened_at: r.opened_at.toISOString(),
          device: r.device,
          link: r.customerLinkId
            ? { kind: 'all_trucks' as const }
            : { kind: 'trip' as const, trip_id: r.tripShare?.trip.id ?? null, ref_id: r.tripShare?.trip.ref_id ?? null },
        })),
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'customer tracking opens failed');
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

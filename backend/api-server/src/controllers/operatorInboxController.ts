import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { logger } from '../utils/logger';
import { whatsappService } from '../services/whatsappService';
import {
  SHARE_LINK_TTL_DAYS, buildShareMessage, loadDocumentExpiries, loadDriverUpdates, loadTripDriverUpdates,
  newShareToken, updateHeadline,
} from '../services/operatorInbox';

/** GET /operator-inbox/driver-updates — recent driver photo/video batches with who forwarded them. */
export const getDriverUpdates = async (_req: Request, res: Response) => {
  try {
    const updates = await loadDriverUpdates(prisma);
    res.json({ success: true, data: { updates, whatsapp_api_available: whatsappService.isConfigured() } });
  } catch (error) {
    logger.error({ err: error }, 'operator inbox driver updates failed');
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

/** GET /operator-inbox/document-expiries — expired and soon-expiring documents and licences. */
export const getDocumentExpiries = async (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: { items: await loadDocumentExpiries(prisma) } });
  } catch (error) {
    logger.error({ err: error }, 'operator inbox document expiries failed');
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

/**
 * Where the photo page lives. PUBLIC_BASE_URL wins when set; otherwise the
 * dashboard the operator is using (the request's Origin), so a link shared from
 * mercon.tech points at mercon.tech and one from dev points at dev — the
 * server's old default sent every environment's links to dev.
 */
function publicBaseUrl(req: Request): string {
  const configured = process.env.PUBLIC_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  const origin = req.get('origin');
  if (origin && /^https?:\/\/[^/]+$/.test(origin)) return origin;
  const proto = (req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
  return `${proto}://${req.get('x-forwarded-host') || req.get('host')}`;
}

export const shareDriverUpdateBody = z.object({
  trip_id: z.string().uuid(),
  update_key: z.string().min(1).max(120),
  media_ids: z.array(z.string().uuid()).min(1).max(50),
  recipient: z.enum(['customer_contact', 'customer_group', 'internal', 'other']),
  recipient_phone: z.string().trim().max(32).optional().nullable(),
  channel: z.enum(['link', 'whatsapp_api']),
});

/**
 * POST /operator-inbox/driver-updates/share
 *
 * Records a forward (so every operator sees it as sent) and returns the
 * message and a private photo-page link. With channel "whatsapp_api" the
 * photos are also sent as real images through the WhatsApp Business API —
 * only to a single number, which is all that API allows.
 */
export const shareDriverUpdate = async (req: Request, res: Response) => {
  const body = req.body as z.infer<typeof shareDriverUpdateBody>;
  try {
    const update = (await loadTripDriverUpdates(prisma, body.trip_id)).find((u) => u.key === body.update_key);
    if (!update) return res.status(404).json({ success: false, error: { message: 'That update no longer exists' } });
    const chosen = update.items.filter((i) => body.media_ids.includes(i.id));
    if (chosen.length !== body.media_ids.length) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Some of the chosen photos are not part of this update' } });
    }

    const phone = (body.recipient_phone ?? '').replace(/[^0-9]/g, '');
    if (body.channel === 'whatsapp_api') {
      if (!whatsappService.isConfigured()) {
        return res.status(422).json({ success: false, error: { code: 'WHATSAPP_CONFIG_MISSING', message: 'The WhatsApp Business API is not set up on this server.' } });
      }
      if (!phone) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Sending images directly needs a phone number. WhatsApp does not allow it for groups.' } });
      }
    }

    const token = newShareToken();
    const shareUrl = `${publicBaseUrl(req)}/s/${token}`;
    const text = buildShareMessage(update, chosen, shareUrl);

    if (body.channel === 'whatsapp_api') {
      // Images first, the summary as the first caption — the order a customer reads them in.
      for (const [i, item] of chosen.entries()) {
        const mediaId = await whatsappService.uploadMedia(item.url, item.mime || (item.kind === 'video' ? 'video/mp4' : 'image/jpeg'));
        await whatsappService.sendMediaMessage(phone, mediaId, item.kind === 'video' ? 'video' : 'image', i === 0 ? text : '');
      }
    }

    const userId = (req as { user?: { id?: unknown } }).user?.id;
    await prisma.tripUpdateShare.create({
      data: {
        tripId: body.trip_id,
        update_key: body.update_key,
        media_ids: body.media_ids,
        token,
        channel: body.channel,
        recipient: body.recipient,
        recipient_phone: phone || null,
        shared_by: typeof userId === 'string' ? userId : null,
        expiresAt: new Date(Date.now() + SHARE_LINK_TTL_DAYS * 86_400_000),
      },
    });

    res.status(201).json({
      success: true,
      data: {
        share_url: shareUrl,
        text,
        whatsapp_url: `https://wa.me/${phone}?text=${encodeURIComponent(text)}`,
        sent_via_api: body.channel === 'whatsapp_api',
        headline: updateHeadline(update),
      },
    });
  } catch (error: any) {
    logger.error({ err: error }, 'share driver update failed');
    res.status(502).json({ success: false, error: { message: error?.message || 'Could not share this update' } });
  }
};

/**
 * GET /public/shares/:token — the photo page behind a forwarded link. No login:
 * the unguessable token is the permission, and it shows only the items chosen
 * for that forward, until the link expires.
 */
export const getPublicShare = async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token || '');
    const share = token.length >= 16 && token.length <= 64
      ? await prisma.tripUpdateShare.findUnique({ where: { token } })
      : null;
    if (!share) return res.status(404).json({ success: false, error: { message: 'This link is not valid' } });
    if (share.expiresAt < new Date()) return res.status(410).json({ success: false, error: { message: 'This link has expired' } });

    const update = (await loadTripDriverUpdates(prisma, share.tripId)).find((u) => u.key === share.update_key);
    const items = (update?.items ?? []).filter((i) => share.media_ids.includes(i.id));
    if (!update || items.length === 0) return res.status(404).json({ success: false, error: { message: 'These photos are no longer available' } });

    res.json({
      success: true,
      data: {
        trip_ref: update.trip.ref_id,
        headline: updateHeadline(update),
        customer_name: update.customer?.name ?? null,
        route: update.trip.route,
        vehicle_plate: update.vehicle_plate,
        driver_name: update.driver?.name ?? null,
        delay_note: update.delay_note,
        items: items.map((i) => ({ id: i.id, kind: i.kind, stage: i.stage, url: i.url, captured_at: i.captured_at })),
        shared_at: share.createdAt.toISOString(),
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'public share failed');
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

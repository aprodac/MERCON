import type { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';
import { placeOf } from './ipPlace';

/**
 * Adds one row to a tracking link's open history: when, which device, and the
 * rough place (looked up from the IP, which is not kept). Runs in the
 * background — never holds up or fails the customer's page.
 */
export function logLinkOpen(
  db: PrismaClient,
  link: { tripShareId: string } | { customerLinkId: string },
  now: Date,
  device: string | null,
  ip: string | null,
): void {
  placeOf(ip)
    .then((place) => db.trackingLinkOpen.create({
      data: { ...link, opened_at: now, device, city: place?.city ?? null, country: place?.country ?? null },
    }))
    .catch((err) => logger.warn({ err }, '[tracking] could not log a link open'));
}

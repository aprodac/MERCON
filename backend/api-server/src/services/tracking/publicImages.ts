/**
 * Images on the public tracking pages must be links, never inline data.
 *
 * Some customer logos and driver / truck photos were saved before images were
 * stored as files, so they sit in the database as base64 `data:` URLs — one
 * logo made the iMile tracking page 2.6 MB, re-downloaded every minute on
 * customers' phones. The first time a page meets one, it is written to the
 * uploads folder with the same helper the save paths use (`storeInlineImage`)
 * and the row is pointed at the file, so it is converted once, not per request.
 */
import type { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';
import { isInlineImage, storeInlineImage } from '../inlineImage';

type ImageOwner =
  | { table: 'customer'; field: 'logo_url' }
  | { table: 'driver'; field: 'avatar_url' }
  | { table: 'vehicle'; field: 'image_url' };

/** Conversions in flight, so concurrent page loads don't each write a copy. */
const inFlight = new Map<string, Promise<string | null>>();

/** The image as a link the page can load, or null. Never returns inline data. */
export async function publicImage(db: PrismaClient, owner: ImageOwner, id: string, value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  if (!isInlineImage(value)) return value;
  const key = `${owner.table}:${id}`;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const job = convert(db, owner, id, value).finally(() => inFlight.delete(key));
  inFlight.set(key, job);
  return job;
}

async function convert(db: PrismaClient, owner: ImageOwner, id: string, value: string): Promise<string | null> {
  try {
    const url = (await storeInlineImage(value)) as string;
    // Only if the row still holds this same image — an upload made meanwhile wins.
    const where = { id, [owner.field]: value };
    const data = { [owner.field]: url };
    if (owner.table === 'customer') await db.customer.updateMany({ where, data });
    else if (owner.table === 'driver') await db.driver.updateMany({ where, data });
    else await db.vehicle.updateMany({ where, data });
    logger.info({ table: owner.table, id }, '[tracking] inline image moved to a file');
    return url;
  } catch (err) {
    logger.warn({ err, table: owner.table, id }, '[tracking] could not move an inline image to a file');
    return null; // the page shows initials / an icon instead
  }
}

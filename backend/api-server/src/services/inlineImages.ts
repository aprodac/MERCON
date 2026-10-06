/**
 * Truck photos, driver photos and customer logos are stored inline in the
 * database (base64 "data:image/..." strings, often 100 KB–2 MB each). List
 * endpoints that repeat them on every row — the live map (every truck, every
 * 30 s) and trip lists (100–500 rows) — sent megabytes to the phone each time.
 *
 * Lists now carry a short signed link instead:
 *
 *   /api/media/s/<expiry>/<signature>/<kind>-<id>-<hash>
 *
 * The phone downloads each picture once and caches it; the link stays the same
 * for the hour (same expiry rule as document links), and `hash` (from the
 * picture itself) changes when the picture does. GET /media/s/... (no login,
 * like /uploads) checks the signature and the hash, then sends the bytes.
 *
 * Only list endpoints use this. Detail / edit endpoints keep the inline value,
 * so a form that saves the record back never writes a link over the photo.
 */
import crypto from 'crypto';
import { prisma } from '../db';
import { checkSignedLink, fileSignature, linkExpiry } from './fileLinks';

export type InlineImageKind = 'vehicle' | 'driver' | 'customer';

const FIELD: Record<InlineImageKind, 'image_url' | 'avatar_url' | 'logo_url'> = {
  vehicle: 'image_url',
  driver: 'avatar_url',
  customer: 'logo_url',
};

const DATA_URI = /^data:(image\/[a-z0-9.+-]+);base64,/i;
const NAME = /^(vehicle|driver|customer)-([0-9a-f-]{36})-([0-9a-f]{12})$/;

export const isInlineImage = (v: unknown): v is string => typeof v === 'string' && DATA_URI.test(v);

const hashOf = (dataUri: string) => crypto.createHash('sha1').update(dataUri).digest('hex').slice(0, 12);

/** The signed link for an inline picture; anything else (a /uploads path, null) is returned as it was. */
export function inlineImageLink(kind: InlineImageKind, id: string | null | undefined, value: string | null | undefined, nowMs: number = Date.now()): string | null {
  if (!value) return value ?? null;
  if (!id || !isInlineImage(value)) return value;
  const name = `${kind}-${id}-${hashOf(value)}`;
  const exp = linkExpiry(nowMs);
  return `/api/media/s/${exp}/${fileSignature(name, exp)}/${name}`;
}

/**
 * Replaces `obj[field]` with its link when it holds an inline picture.
 * `obj` may be null; the object is changed in place and returned.
 */
export function linkInlineImage<T extends Record<string, any> | null | undefined>(obj: T, kind: InlineImageKind, nowMs?: number): T {
  if (!obj) return obj;
  const field = FIELD[kind];
  if (isInlineImage(obj[field])) (obj as any)[field] = inlineImageLink(kind, obj.id, obj[field], nowMs);
  return obj;
}

export type InlineImageResult =
  | { status: 'ok'; contentType: string; body: Buffer }
  | { status: 'invalid' | 'expired' | 'not_found' };

/** Checks a /media/s/... link and loads the picture it names. */
export async function loadInlineImage(exp: string, sig: string, name: string): Promise<InlineImageResult> {
  const m = NAME.exec(name);
  if (!m) return { status: 'invalid' };
  const check = checkSignedLink(exp, sig, name);
  if (check !== 'ok') return { status: check };
  const [, kind, id, hash] = m as unknown as [string, InlineImageKind, string, string];
  const where = { where: { id } } as const;
  const row: { value: string | null } | null =
    kind === 'vehicle'
      ? await prisma.vehicle.findUnique({ ...where, select: { image_url: true } }).then((r) => (r ? { value: r.image_url } : null))
      : kind === 'driver'
      ? await prisma.driver.findUnique({ ...where, select: { avatar_url: true } }).then((r) => (r ? { value: r.avatar_url } : null))
      : await prisma.customer.findUnique({ ...where, select: { logo_url: true } }).then((r) => (r ? { value: r.logo_url } : null));
  const value = row?.value;
  // The picture changed since the link was made: the list will hand out the new link.
  if (!isInlineImage(value) || hashOf(value) !== hash) return { status: 'not_found' };
  const header = DATA_URI.exec(value)!;
  return { status: 'ok', contentType: header[1].toLowerCase(), body: Buffer.from(value.slice(header[0].length), 'base64') };
}

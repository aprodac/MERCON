/**
 * Short-lived signed links for private uploaded documents.
 *
 * Every upload sits in one folder served at /uploads, so a driver's passport,
 * Iqama or licence opened for anyone holding the link — no login. Documents
 * owned by a driver, vehicle, customer or the company are now private: the
 * plain /uploads/<file> link is refused, and signed-in users get
 *
 *   /uploads/s/<expiry>/<signature>/<file>
 *
 * in API responses instead. The file name stays last, so code that reads the
 * extension (".pdf", ".jpg") keeps working. Links last 1–2 hours (they change
 * once an hour, so a page that reloads within the hour reuses the cached file).
 *
 * Trip media (POD / loading / delay photos), driver photos, truck pictures and
 * logos stay public: the customer tracking pages — themselves behind secret
 * tokens — show them by plain link.
 */
import crypto from 'crypto';
import { env } from '../config/env';
import { prisma } from '../db';
import { logger } from '../utils/logger';

/** "/uploads/<file>", optionally with an origin. Group 1 = origin, 2 = file. */
const PLAIN_UPLOAD = /^((?:https?:\/\/[^/\s]+)?)\/uploads\/([A-Za-z0-9._~%-]+)$/;
/** "/uploads/s/<exp>/<sig>/<file>". Groups: origin, exp, sig, file. */
const SIGNED_UPLOAD = /^((?:https?:\/\/[^/\s]+)?)\/uploads\/s\/(\d{9,12})\/([A-Za-z0-9_-]{16,64})\/([A-Za-z0-9._~%-]+)$/;

const HOUR_S = 3600;

/** Entity types whose Document files stay public (shown on the tracking pages). */
export const PUBLIC_DOCUMENT_ENTITY_TYPES = ['Trip'];

let keyCache: Buffer | null = null;
function signingKey(): Buffer {
  // Optional dedicated secret; otherwise derived from the JWT secret (never the same bytes).
  if (!keyCache) {
    keyCache = crypto
      .createHmac('sha256', process.env.FILE_LINK_SECRET || env.JWT_SECRET)
      .update('mercon-file-links-v1')
      .digest();
  }
  return keyCache;
}

export function fileSignature(file: string, exp: number): string {
  return crypto.createHmac('sha256', signingKey()).update(`${file}:${exp}`).digest('base64url').slice(0, 32);
}

/** Unix seconds: the end of the next whole hour, so a link lives 1–2 hours and is stable within an hour. */
export function linkExpiry(nowMs: number = Date.now()): number {
  return Math.ceil(nowMs / 1000 / HOUR_S) * HOUR_S + HOUR_S;
}

/** The upload's file name from a plain or signed link, or null when it isn't an upload link. */
export function uploadFileName(url: string): string | null {
  const signed = SIGNED_UPLOAD.exec(url);
  if (signed) return signed[4];
  const plain = PLAIN_UPLOAD.exec(url);
  return plain ? plain[2] : null;
}

/** A plain upload link turned into a signed one; anything else is returned unchanged. */
export function signUploadUrl(url: string, nowMs: number = Date.now()): string {
  const m = PLAIN_UPLOAD.exec(url);
  if (!m) return url;
  const exp = linkExpiry(nowMs);
  return `${m[1]}/uploads/s/${exp}/${fileSignature(m[2], exp)}/${m[2]}`;
}

/** A signed link back to the stored form ("/uploads/<file>"), so it is never saved to the database. */
export function unsignUploadUrl(url: string): string {
  const m = SIGNED_UPLOAD.exec(url);
  return m ? `${m[1]}/uploads/${m[4]}` : url;
}

export type LinkCheck = 'ok' | 'expired' | 'invalid';

export function checkSignedLink(exp: string, sig: string, file: string, nowMs: number = Date.now()): LinkCheck {
  const expNum = Number(exp);
  if (!Number.isInteger(expNum)) return 'invalid';
  const expected = Buffer.from(fileSignature(file, expNum));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return 'invalid';
  return expNum * 1000 > nowMs ? 'ok' : 'expired';
}

/* ── Which files are private ───────────────────────────────────────────────── */

const CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX = 20_000;
const privateCache = new Map<string, { isPrivate: boolean; at: number }>();

/** For tests. */
export function clearPrivateFileCache(): void {
  privateCache.clear();
}

/**
 * The file names (of those given) that belong to a private document: a
 * Document — or one of its extra pages, or a bulk-import item — that is not a
 * Trip document. Deleted documents stay private. Answers are cached for five
 * minutes; a lookup failure is thrown so callers can fail closed.
 */
export async function privateFileNames(names: string[], nowMs: number = Date.now()): Promise<Set<string>> {
  const result = new Set<string>();
  const unknown: string[] = [];
  for (const n of new Set(names)) {
    const hit = privateCache.get(n);
    if (hit && nowMs - hit.at < CACHE_TTL_MS) {
      if (hit.isPrivate) result.add(n);
    } else {
      unknown.push(n);
    }
  }

  for (let i = 0; i < unknown.length; i += 200) {
    const batch = unknown.slice(i, i + 200);
    const endsWith = batch.map((n) => ({ file_url: { endsWith: `/${n}` } }));
    const notPublic = { entity_type: { notIn: PUBLIC_DOCUMENT_ENTITY_TYPES } };
    const [docs, pages, imports] = await Promise.all([
      prisma.document.findMany({ where: { ...notPublic, OR: endsWith }, select: { file_url: true } }),
      prisma.documentFile.findMany({ where: { document: notPublic, OR: endsWith }, select: { file_url: true } }),
      prisma.documentImportItem.findMany({ where: { OR: endsWith }, select: { file_url: true } }),
    ]);
    const found = new Set<string>();
    for (const row of [...docs, ...pages, ...imports]) {
      const name = uploadFileName(row.file_url) ?? row.file_url.split('/').pop() ?? '';
      if (name) found.add(name);
    }
    if (privateCache.size > CACHE_MAX) privateCache.clear();
    for (const n of batch) {
      const isPrivate = found.has(n);
      privateCache.set(n, { isPrivate, at: nowMs });
      if (isPrivate) result.add(n);
    }
  }
  return result;
}

/* ── JSON payloads ────────────────────────────────────────────────────────── */

/** Every plain upload file name mentioned (as a whole string value) anywhere in a JSON payload. */
export function uploadNamesIn(payload: unknown): Set<string> {
  const names = new Set<string>();
  JSON.stringify(payload, (_k, v) => {
    if (typeof v === 'string' && v.length < 600) {
      const m = PLAIN_UPLOAD.exec(v);
      if (m) names.add(m[2]);
    }
    return v;
  });
  return names;
}

/** The payload as JSON text with links to the given private files signed. */
export function stringifyWithSignedLinks(payload: unknown, privateNames: Set<string>, nowMs: number = Date.now()): string {
  return JSON.stringify(payload, (_k, v) => {
    if (typeof v === 'string' && v.length < 600) {
      const m = PLAIN_UPLOAD.exec(v);
      if (m && privateNames.has(m[2])) return signUploadUrl(v, nowMs);
    }
    return v;
  });
}

/** Signed links in a request body put back to their stored form, in place. */
export function unsignInPlace(value: any, depth = 0): any {
  if (depth > 20 || value === null || typeof value !== 'object') return value;
  for (const key of Object.keys(value)) {
    const v = value[key];
    if (typeof v === 'string') {
      if (v.includes('/uploads/s/')) value[key] = unsignUploadUrl(v);
    } else if (v && typeof v === 'object') {
      unsignInPlace(v, depth + 1);
    }
  }
  return value;
}

export function logLinkError(err: unknown, where: string): void {
  logger.error({ err }, `[file-links] ${where}`);
}

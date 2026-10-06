/**
 * Rough place (city, country) of a tracking-link visitor, for the open history
 * on the operator app's Links page. Looked up on this server in the free
 * DB-IP Lite city database (CC BY 4.0 — "IP Geolocation by DB-IP"), so the
 * address never leaves the server, and it is never stored — only the place.
 *
 * The database (~60 MB download, ~130 MB unpacked) is fetched once a month into
 * the uploads volume and only held in memory while opens are coming in: it is
 * dropped again after a few idle minutes, so the API doesn't carry it all day.
 * Until it's there (first start, download failed) opens simply have no place.
 * GEOIP_DISABLED=1 turns all of this off.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { Reader, type CityResponse } from 'maxmind';
import { logger } from '../../utils/logger';

export interface IpPlace {
  city: string | null;
  /** ISO 3166 alpha-2, e.g. "SA". */
  country: string | null;
}

const MAX_AGE_MS = 35 * 86_400_000;
const IDLE_UNLOAD_MS = 10 * 60_000;
const RETRY_AFTER_FAIL_MS = 6 * 60 * 60_000;
const FILE_RE = /^dbip-city-lite-\d{4}-\d{2}\.mmdb$/;

function dbDir(): string {
  if (process.env.GEOIP_DIR) return process.env.GEOIP_DIR;
  // /tmp/uploads is the persistent uploads volume in production (dot folders aren't served).
  return fs.existsSync('/tmp/uploads') ? '/tmp/uploads/.geoip' : path.join(os.tmpdir(), 'mercon-geoip');
}

/** Private, loopback and link-local addresses have no place. */
export function isPublicIp(ip: string): boolean {
  const v = ip.replace(/^::ffff:/i, '');
  if (/^(10|127)\./.test(v) || /^192\.168\./.test(v) || /^169\.254\./.test(v)) return false;
  const m = /^172\.(\d+)\./.exec(v);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return false;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(v)) return false; // carrier-grade NAT
  if (v === '::1' || /^f[cd][0-9a-f]{2}:/i.test(v) || /^fe80:/i.test(v)) return false;
  return /^\d+\.\d+\.\d+\.\d+$/.test(v) || v.includes(':');
}

/** The city and country out of a DB-IP / MaxMind city record. */
export function placeFromRecord(rec: CityResponse | null | undefined): IpPlace | null {
  if (!rec) return null;
  const city = rec.city?.names?.en ?? null;
  const country = rec.country?.iso_code ?? null;
  return city || country ? { city, country } : null;
}

let reader: Reader<CityResponse> | null = null;
let loading: Promise<Reader<CityResponse> | null> | null = null;
let downloading: Promise<void> | null = null;
let lastFailAt = 0;
let idleTimer: NodeJS.Timeout | null = null;

function newestFile(dir: string): { file: string; mtimeMs: number } | null {
  try {
    const files = fs.readdirSync(dir).filter((f) => FILE_RE.test(f)).sort();
    const file = files[files.length - 1];
    return file ? { file: path.join(dir, file), mtimeMs: fs.statSync(path.join(dir, file)).mtimeMs } : null;
  } catch {
    return null;
  }
}

const monthTag = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

/** This month's file (last month's early in the month, before DB-IP publishes). Old files are removed. */
async function download(dir: string): Promise<void> {
  fs.mkdirSync(dir, { recursive: true });
  const now = new Date();
  const months = [monthTag(now), monthTag(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)))];
  for (const m of months) {
    const res = await fetch(`https://download.db-ip.com/free/dbip-city-lite-${m}.mmdb.gz`);
    if (!res.ok || !res.body) continue;
    const target = path.join(dir, `dbip-city-lite-${m}.mmdb`);
    const tmp = `${target}.part`;
    await pipeline(Readable.fromWeb(res.body as never), zlib.createGunzip(), fs.createWriteStream(tmp));
    fs.renameSync(tmp, target);
    for (const f of fs.readdirSync(dir)) {
      if (FILE_RE.test(f) && path.join(dir, f) !== target) fs.rmSync(path.join(dir, f), { force: true });
    }
    logger.info(`[geoip] DB-IP city database ${m} ready`);
    return;
  }
  throw new Error('no DB-IP city database available to download');
}

function ensureFresh(dir: string, existing: { mtimeMs: number } | null): void {
  if (downloading || Date.now() - lastFailAt < RETRY_AFTER_FAIL_MS) return;
  if (existing && Date.now() - existing.mtimeMs < MAX_AGE_MS) return;
  downloading = download(dir)
    .then(() => { reader = null; }) // pick the new file up on the next lookup
    .catch((err) => {
      lastFailAt = Date.now();
      logger.warn({ err }, '[geoip] could not download the city database — opens are logged without a place');
    })
    .finally(() => { downloading = null; });
}

async function getReader(): Promise<Reader<CityResponse> | null> {
  if (reader) return reader;
  if (loading) return loading;
  const dir = dbDir();
  const existing = newestFile(dir);
  ensureFresh(dir, existing);
  if (!existing) return null;
  loading = fs.promises.readFile(existing.file)
    .then((buf) => (reader = new Reader<CityResponse>(buf)))
    .catch((err) => {
      logger.warn({ err }, '[geoip] could not read the city database');
      return null;
    })
    .finally(() => { loading = null; });
  return loading;
}

function touch() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { reader = null; idleTimer = null; }, IDLE_UNLOAD_MS);
  idleTimer.unref?.();
}

/** The visitor's rough place, or null (private address, no database yet, lookups off). Never throws. */
export async function placeOf(ip: string | null | undefined): Promise<IpPlace | null> {
  if (!ip || process.env.GEOIP_DISABLED === '1' || process.env.NODE_ENV === 'test') return null;
  if (!isPublicIp(ip)) return null;
  try {
    const r = await getReader();
    if (!r) return null;
    touch();
    return placeFromRecord(r.get(ip.replace(/^::ffff:/i, '')));
  } catch (err) {
    logger.warn({ err }, '[geoip] lookup failed');
    return null;
  }
}

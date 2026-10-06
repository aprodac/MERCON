/**
 * "Route 40, near Al Quwayiyah" for a point on the map — so a break on a trip
 * reads as a place. Names are kept in PlaceName per ~100 m (lat,lng to 3
 * decimals) and looked up once from OpenStreetMap's Nominatim, in the
 * background and at most one a second (its usage policy): `namesFor` answers
 * from what's known now and queues the rest, so a screen never waits on it —
 * the name shows on its next refresh. Never throws.
 */
import type { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';

const NOMINATIM = 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = 'MERCON-Logistics-Platform/1.0 (https://mercon.tech; ops@mercon.tech)';
const SPACING_MS = 1100;
const QUEUE_MAX = 200;

export const placeKey = (lat: number, lng: number) => `${lat.toFixed(3)},${lng.toFixed(3)}`;

/** A short name from a Nominatim address: the road, then the nearest town. Exported for tests. */
export function shortPlaceName(addr: Record<string, string> | null | undefined, displayName?: string | null): string | null {
  const a = addr ?? {};
  const road = a.road || a.highway || null;
  const town = a.village || a.town || a.city || a.hamlet || a.suburb || a.municipality || a.county || a.state_district || a.state || null;
  if (road && town) return `${road}, near ${town}`;
  if (town) return `Near ${town}`;
  if (road) return road;
  return displayName ? displayName.split(',').slice(0, 2).join(',').trim() || null : null;
}

const queue: { key: string; lat: number; lng: number }[] = [];
const queued = new Set<string>();
let worker: Promise<void> | null = null;
let dbRef: PrismaClient | null = null;

async function lookup(lat: number, lng: number): Promise<string | null> {
  const res = await fetch(`${NOMINATIM}?format=json&lat=${lat}&lon=${lng}&zoom=14&accept-language=en`, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const body: any = await res.json();
  return shortPlaceName(body?.address, body?.display_name);
}

function drain(): void {
  if (worker || !dbRef) return;
  const db = dbRef;
  worker = (async () => {
    while (queue.length) {
      const job = queue.shift()!;
      try {
        const name = await lookup(job.lat, job.lng);
        if (name) await db.placeName.upsert({ where: { key: job.key }, create: { key: job.key, name }, update: { name } });
      } catch (err) {
        logger.debug({ err, key: job.key }, '[PlaceNames] lookup failed');
      } finally {
        queued.delete(job.key);
      }
      await new Promise((r) => setTimeout(r, SPACING_MS));
    }
  })().finally(() => { worker = null; });
}

/** Names known now for these points (by placeKey); unknown ones are looked up in the background. */
export async function namesFor(db: PrismaClient, points: { lat: number; lng: number }[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!points.length) return out;
  try {
    const keys = [...new Set(points.map((p) => placeKey(p.lat, p.lng)))];
    const rows = await db.placeName.findMany({ where: { key: { in: keys } }, select: { key: true, name: true } });
    for (const r of rows) out.set(r.key, r.name);
    dbRef = db;
    for (const p of points) {
      const key = placeKey(p.lat, p.lng);
      if (out.has(key) || queued.has(key) || queue.length >= QUEUE_MAX) continue;
      queued.add(key);
      queue.push({ key, lat: p.lat, lng: p.lng });
    }
    drain();
  } catch (err) {
    logger.warn({ err }, '[PlaceNames] could not read names');
  }
  return out;
}

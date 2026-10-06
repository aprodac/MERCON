/**
 * Keeps the truck tracker's positions during a trip (TripLocation, source
 * 'vehicle'). The tracker only ever overwrote the vehicle's latest position,
 * so a trip whose driver's phone wasn't sending had no path, no distance and
 * no stops or breaks to show. Called from the ICCES poll (every 30 s).
 *
 * Not every poll is kept: a fix is saved when the truck has moved MIN_MOVE_M
 * since the last one saved (and at least MIN_GAP_MS later), or every
 * STILL_EVERY_MS while it stands — enough to draw the road and to time a break,
 * without a row every 30 s for a parked truck. Only running trips (Loading,
 * In transit, Delayed): a Scheduled trip's truck may still be on another job.
 * Never throws.
 */
import type { PrismaClient } from '@prisma/client';
import { haversineKm } from '@mercon/shared-types';
import { logger } from '../../utils/logger';

export const MIN_MOVE_M = 50;
const MIN_GAP_MS = 20_000;
export const STILL_EVERY_MS = 5 * 60_000;
const RUNNING = ['Loading', 'InTransit', 'Delayed'];

export interface TrackerFix { deviceId: string; lat: number; lng: number; speedKph: number | null; headingDeg: number | null; recordedAt: Date }

const lastSaved = new Map<string, { at: number; lat: number; lng: number }>();

/** Whether this fix is worth keeping after the last one kept. Exported for tests. */
export function worthKeeping(prev: { at: number; lat: number; lng: number } | undefined, fix: { lat: number; lng: number; recordedAt: Date }): boolean {
  if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lng) || (fix.lat === 0 && fix.lng === 0)) return false;
  if (!prev) return true;
  const gap = fix.recordedAt.getTime() - prev.at;
  if (gap <= 0) return false;
  const moved = haversineKm(prev, fix) * 1000;
  return (moved >= MIN_MOVE_M && gap >= MIN_GAP_MS) || gap >= STILL_EVERY_MS;
}

export async function recordTrackerHistory(db: PrismaClient, telemetry: TrackerFix[]): Promise<number> {
  if (!telemetry.length) return 0;
  try {
    const trips = await db.trip.findMany({
      where: { deletedAt: null, status: { in: RUNNING as any[] }, vehicle: { icces_device_id: { in: telemetry.map((t) => t.deviceId) } } },
      select: { id: true, vehicle: { select: { icces_device_id: true } } },
    });
    if (!trips.length) return 0;

    // After a restart: the last tracker fix kept per trip, from the database.
    const unknown = trips.filter((t) => !lastSaved.has(t.id)).map((t) => t.id);
    if (unknown.length) {
      const rows = await db.tripLocation.findMany({
        where: { tripId: { in: unknown }, source: 'vehicle' },
        orderBy: { recordedAt: 'desc' },
        distinct: ['tripId'],
        select: { tripId: true, lat: true, lng: true, recordedAt: true },
      });
      for (const r of rows) lastSaved.set(r.tripId, { at: r.recordedAt.getTime(), lat: r.lat, lng: r.lng });
    }

    const byDevice = new Map(telemetry.map((t) => [t.deviceId, t]));
    const rows = [];
    for (const trip of trips) {
      const fix = trip.vehicle?.icces_device_id ? byDevice.get(trip.vehicle.icces_device_id) : undefined;
      if (!fix || !worthKeeping(lastSaved.get(trip.id), fix)) continue;
      rows.push({ tripId: trip.id, lat: fix.lat, lng: fix.lng, speed_kph: fix.speedKph, heading: fix.headingDeg, recordedAt: fix.recordedAt, source: 'vehicle' });
      lastSaved.set(trip.id, { at: fix.recordedAt.getTime(), lat: fix.lat, lng: fix.lng });
    }
    if (rows.length) await db.tripLocation.createMany({ data: rows });
    if (lastSaved.size > 2000) lastSaved.clear();
    return rows.length;
  } catch (err) {
    logger.warn({ err }, '[TrackerHistory] could not save tracker positions');
    return 0;
  }
}

/** Tests only. */
export function __resetTrackerHistory() {
  lastSaved.clear();
}

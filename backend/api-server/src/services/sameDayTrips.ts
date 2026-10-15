import { TripStatus } from '@prisma/client';
import { dateInZone, type SameDayConflict } from '@mercon/shared-types';
import { prisma } from '../db';

/**
 * A driver with two trips on one day does them one after the other: the trip
 * created first goes first, the later one waits until that one is finished.
 * Create Trip warns before booking the second (POST /trips/same-day-check);
 * the driver app shows the trips in that order and the driver can't start the
 * later one early (mobileTripController).
 */

/** Trips that hold the driver's day — planned or on the road, not finished. */
export const DAY_QUEUE_STATUSES: TripStatus[] = [TripStatus.Scheduled, TripStatus.Loading, TripStatus.InTransit, TripStatus.Delayed];

export async function deploymentTimezone(): Promise<string> {
  const settings = await prisma.settings.findUnique({ where: { id: 'singleton' }, select: { timezone: true } });
  return settings?.timezone || 'Asia/Riyadh';
}

const DAY = 86_400_000;

type QueueTrip = { id: string; ref_id?: string | null; planned_start: Date | null; createdAt: Date };

/** The day a trip belongs to (deployment time zone), or null with no start. */
export const tripDay = (t: { planned_start: Date | null }, tz: string) =>
  t.planned_start ? dateInZone(t.planned_start.getTime(), tz) : null;

/**
 * Upcoming trips in the order the driver does them: by day, and within a day
 * by when each was created. Trips with no date come last.
 */
export function orderDriverQueue<T extends QueueTrip>(trips: T[], tz: string): T[] {
  const day = new Map(trips.map((t) => [t.id, tripDay(t, tz)]));
  return [...trips].sort((a, b) => {
    const da = day.get(a.id), db = day.get(b.id);
    if (da !== db) return da == null ? 1 : db == null ? -1 : da < db ? -1 : 1;
    const c = a.createdAt.getTime() - b.createdAt.getTime();
    if (c !== 0) return c;
    return (a.planned_start?.getTime() ?? 0) - (b.planned_start?.getTime() ?? 0);
  });
}

/** The open same-day trip, created earlier, that `trip` waits for — from `others`. */
export function tripAheadIn<T extends QueueTrip & { status: TripStatus }>(trip: QueueTrip, others: T[], tz: string): T | null {
  const day = tripDay(trip, tz);
  if (!day) return null;
  const ahead = others
    .filter((o) => o.id !== trip.id && DAY_QUEUE_STATUSES.includes(o.status) && tripDay(o, tz) === day && o.createdAt < trip.createdAt)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return ahead[0] ?? null;
}

/** Same as tripAheadIn, read from the database for one driver. */
export async function findTripAhead(trip: QueueTrip, driverId: string, tz?: string) {
  if (!trip.planned_start) return null;
  const zone = tz ?? (await deploymentTimezone());
  const t = trip.planned_start.getTime();
  const others = await prisma.trip.findMany({
    where: {
      driverId,
      deletedAt: null,
      id: { not: trip.id },
      status: { in: DAY_QUEUE_STATUSES },
      createdAt: { lt: trip.createdAt },
      planned_start: { gte: new Date(t - DAY), lte: new Date(t + DAY) },
    },
    select: { id: true, ref_id: true, status: true, planned_start: true, createdAt: true },
  });
  return tripAheadIn(trip, others, zone);
}

export interface SameDayCheckItem {
  driverIds: string[];
  plannedStart: string;
}

/** For each new trip: its drivers' open trips already on that day. */
export async function findSameDayTrips(items: SameDayCheckItem[], tz?: string): Promise<SameDayConflict[]> {
  const valid = items
    .map((it, index) => ({ index, driverIds: [...new Set(it.driverIds.filter(Boolean))], ms: Date.parse(it.plannedStart) }))
    .filter((it) => it.driverIds.length > 0 && Number.isFinite(it.ms));
  if (!valid.length) return [];
  const zone = tz ?? (await deploymentTimezone());
  const driverIds = [...new Set(valid.flatMap((it) => it.driverIds))];
  const times = valid.map((it) => it.ms);
  const existing = await prisma.trip.findMany({
    where: {
      deletedAt: null,
      status: { in: DAY_QUEUE_STATUSES },
      planned_start: { gte: new Date(Math.min(...times) - DAY), lte: new Date(Math.max(...times) + DAY) },
      OR: [{ driverId: { in: driverIds } }, { co_driver_id: { in: driverIds } }],
    },
    select: {
      id: true, ref_id: true, status: true, planned_start: true, driverId: true, co_driver_id: true,
      driver: { select: { id: true, first_name: true, last_name: true } },
      coDriver: { select: { id: true, first_name: true, last_name: true } },
      stops: {
        where: { deletedAt: null },
        orderBy: { stop_sequence: 'asc' },
        select: { location_name: true, location: { select: { name: true } } },
      },
    },
    orderBy: [{ planned_start: 'asc' }, { createdAt: 'asc' }],
  });
  const names = await prisma.driver.findMany({ where: { id: { in: driverIds } }, select: { id: true, first_name: true, last_name: true } });
  const nameOf = (id: string) => {
    const d = names.find((n) => n.id === id);
    return [d?.first_name, d?.last_name].filter(Boolean).join(' ') || 'The driver';
  };
  const stopName = (s: { location_name: string | null; location: { name: string } | null } | undefined) => s?.location?.name || s?.location_name || null;

  const out: SameDayConflict[] = [];
  for (const it of valid) {
    const date = dateInZone(it.ms, zone);
    for (const driverId of it.driverIds) {
      const trips = existing.filter((t) => (t.driverId === driverId || t.co_driver_id === driverId) && tripDay(t, zone) === date);
      if (!trips.length) continue;
      out.push({
        index: it.index,
        driverId,
        driverName: nameOf(driverId),
        date,
        trips: trips.map((t) => {
          const from = stopName(t.stops[0]);
          const to = stopName(t.stops[t.stops.length - 1]);
          return {
            id: t.id,
            ref_id: t.ref_id,
            status: t.status,
            planned_start: t.planned_start?.toISOString() ?? null,
            route: from && to ? `${from} → ${to}` : from || to,
          };
        }),
      });
    }
  }
  return out;
}

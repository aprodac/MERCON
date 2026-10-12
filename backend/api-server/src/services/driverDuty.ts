/**
 * What a driver is doing, from their trips — not from `Driver.status`, which
 * is a stored flag that drifts (a round trip started from the driver app, a
 * co-driver, a cleanup reset) and so showed drivers on the road as "Available".
 *
 *   on_trip  — the trip they're out on now (Loading / InTransit / Delayed),
 *              with the leg of a round trip
 *   upcoming — trips booked for them (Scheduled) from a little before today
 *              to two weeks ahead, soonest first, with the days they take
 *
 * As driver or co-driver. Used by the Drivers list and its "On trip" count.
 */
import type { Prisma, TripStatus } from '@prisma/client';
import { liveLegOf, splitLegs, tripEnds } from '@mercon/shared-types';
import { prisma } from '../db';

export const RUNNING_TRIP_STATUSES: TripStatus[] = ['Loading', 'InTransit', 'Delayed'];
const BOOKED_TRIP_STATUSES: TripStatus[] = ['Scheduled'];

/** How far around today booked trips are looked at. */
const LOOK_BACK_MS = 2 * 86_400_000;
const LOOK_AHEAD_MS = 14 * 86_400_000;
const MAX_UPCOMING = 6;

export interface DutyTrip {
  id: string;
  ref_id: string | null;
  status: string;
  /** When it starts and when the driver is free again (round trip: back home). */
  start: string | null;
  end: string | null;
  from: string | null;
  to: string | null;
  round: boolean;
  /** Round trip under way: 1 going, 2 returning. */
  leg: 1 | 2 | null;
  co_driver: boolean;
}

export interface DriverDuty {
  on_trip: DutyTrip | null;
  upcoming: DutyTrip[];
}

const TRIP_SELECT = {
  id: true,
  ref_id: true,
  status: true,
  driverId: true,
  co_driver_id: true,
  planned_start: true,
  planned_end: true,
  rate_category: true,
  stops: {
    where: { deletedAt: null },
    orderBy: { stop_sequence: 'asc' },
    select: {
      stop_sequence: true,
      stop_type: true,
      leg_index: true,
      location_name: true,
      planned_arrival: true,
      actual_arrival: true,
      actual_departure: true,
      location: { select: { name: true } },
    },
  },
} satisfies Prisma.TripSelect;

type DutyRow = Prisma.TripGetPayload<{ select: typeof TRIP_SELECT }>;

const placeOf = (s: DutyRow['stops'][number] | null) =>
  (s?.location?.name || s?.location_name || '').replace(/\[RETURN:.*?\]/gi, '').replace(/🔁\s*/g, '').split(',')[0].trim() || null;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function toDutyTrip(t: DutyRow, driverId: string): DutyTrip {
  const ends = tripEnds(t.stops, t.rate_category);
  const legs = splitLegs(t.stops, t.rate_category);
  // Free again at the latest of planned end and the last stop's planned arrival.
  const lastArrival = t.stops.reduce<Date | null>((m, s) => (s.planned_arrival && (!m || s.planned_arrival > m) ? s.planned_arrival : m), null);
  const end = t.planned_end && lastArrival ? (t.planned_end > lastArrival ? t.planned_end : lastArrival) : t.planned_end || lastArrival;
  return {
    id: t.id,
    ref_id: t.ref_id,
    status: t.status,
    start: iso(t.planned_start),
    end: iso(end),
    from: placeOf(ends.from),
    to: placeOf(ends.to),
    round: ends.round,
    leg: liveLegOf(legs, t.status),
    co_driver: t.driverId !== driverId,
  };
}

export async function driverDutyFor(driverIds: string[], now = new Date()): Promise<Map<string, DriverDuty>> {
  const out = new Map<string, DriverDuty>(driverIds.map((id) => [id, { on_trip: null, upcoming: [] }]));
  if (driverIds.length === 0) return out;

  const byDriver = { OR: [{ driverId: { in: driverIds } }, { co_driver_id: { in: driverIds } }] };
  const trips = await prisma.trip.findMany({
    where: {
      deletedAt: null,
      AND: [
        byDriver,
        {
          OR: [
            { status: { in: RUNNING_TRIP_STATUSES } },
            {
              status: { in: BOOKED_TRIP_STATUSES },
              planned_start: { gte: new Date(now.getTime() - LOOK_BACK_MS), lte: new Date(now.getTime() + LOOK_AHEAD_MS) },
            },
          ],
        },
      ],
    },
    orderBy: { planned_start: 'asc' },
    select: TRIP_SELECT,
  });

  for (const t of trips) {
    for (const id of [t.driverId, t.co_driver_id]) {
      const duty = id ? out.get(id) : undefined;
      if (!duty || !id) continue;
      const trip = toDutyTrip(t, id);
      if (RUNNING_TRIP_STATUSES.includes(t.status)) {
        // Two running trips is bad data; show the one that started first.
        if (!duty.on_trip) duty.on_trip = trip;
      } else if (duty.upcoming.length < MAX_UPCOMING) {
        duty.upcoming.push(trip);
      }
    }
  }
  return out;
}

/** Drivers (as driver or co-driver) on a running trip right now. */
export async function driversOnTripIds(): Promise<Set<string>> {
  const rows = await prisma.trip.findMany({
    where: { deletedAt: null, status: { in: RUNNING_TRIP_STATUSES } },
    select: { driverId: true, co_driver_id: true },
  });
  const ids = new Set<string>();
  for (const r of rows) {
    if (r.driverId) ids.add(r.driverId);
    if (r.co_driver_id) ids.add(r.co_driver_id);
  }
  return ids;
}

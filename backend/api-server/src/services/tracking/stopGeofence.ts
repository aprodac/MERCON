/**
 * Stop arrivals and departures from the truck's own GPS.
 *
 * Many drivers run trips in the customer's app (iMile, JD), not MERCON's, so
 * nobody taps "Arrived" in MERCON and a trip's stops stay empty: the customer's
 * tracking page shows "0 of 4 stops done" all day. The ICCES tracker on the
 * truck already reports every 30 s, so the server can see the truck reach and
 * leave each stop itself.
 *
 * Deliberately conservative — a wrong arrival time is worse than none:
 *  - only running trips (Loading / In transit / Delayed) that started — or were
 *    due to start — within the last few days, so a trip left open for weeks
 *    doesn't get stamped when the truck happens to pass its stops again;
 *  - only fresh fixes, and only stops with a precise location (a stop geocoded
 *    to a city centre isn't a warehouse gate);
 *  - arrival only at the next stop in order; departure only from the stop the
 *    truck last arrived at, once it is clearly away (hysteresis, so standing at
 *    the gate doesn't flicker);
 *  - only ever fills an empty time, like every other stamping path
 *    (`tripLifecycle.ts`): the driver's tap or an ops correction always wins.
 *
 * Switch off with GPS_STOP_DETECTION=off.
 */
import type { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';
import { haversineMeters } from '../fleetLiveMap';

/** Inside this distance of a stop the truck has arrived. */
export const ARRIVE_RADIUS_M = 500;
/** Beyond this distance from the stop it arrived at, the truck has left. */
export const LEAVE_RADIUS_M = 1_000;
/** Fixes older than this are not used — the truck may be somewhere else by now. */
export const FIX_MAX_AGE_MS = 5 * 60_000;
/** Trips that started (or were due to start) longer ago than this are left alone. */
export const MAX_TRIP_AGE_MS = 3 * 24 * 60 * 60_000;

const RUNNING_STATUSES = ['Loading', 'InTransit', 'Delayed'] as const;

export interface GeofenceStop {
  id: string;
  stop_sequence: number;
  lat: number | null;
  lng: number | null;
  /** EXACT, APPROXIMATE, UNKNOWN or null. */
  precision: string | null;
  /** Linked to a saved customer site — those are pinned, not geocoded. */
  saved_site: boolean;
  actual_arrival: Date | null;
  actual_departure: Date | null;
}

export interface GpsFix {
  lat: number;
  lng: number;
  recordedAt: Date;
}

export type StopEvent =
  | { kind: 'arrived'; stopId: string; at: Date }
  | { kind: 'departed'; stopId: string; at: Date };

/** Whether a stop's coordinates are precise enough to draw a fence around. */
export function fenceable(s: GeofenceStop): boolean {
  if (s.lat == null || s.lng == null) return false;
  if (s.precision === 'EXACT') return true;
  // Geocoded addresses (APPROXIMATE) can be a city centre; a saved site is pinned by ops.
  return s.precision !== 'APPROXIMATE' && s.saved_site;
}

/**
 * What this fix means for a trip's stops: at most one departure (from the stop
 * the truck is standing at) and one arrival (at the next stop). Pure — the
 * caller writes the events.
 */
export function detectStopEvents(stops: GeofenceStop[], fix: GpsFix, now: Date): StopEvent[] {
  if (now.getTime() - fix.recordedAt.getTime() > FIX_MAX_AGE_MS) return [];
  const ordered = [...stops].sort((a, b) => a.stop_sequence - b.stop_sequence);
  const events: StopEvent[] = [];
  const dist = (s: GeofenceStop) => haversineMeters(fix, { lat: s.lat!, lng: s.lng! });

  // Departure: the stop it arrived at last and hasn't left.
  const standing = [...ordered].reverse().find((s) => s.actual_arrival && !s.actual_departure);
  const left = standing && fenceable(standing) && dist(standing) > LEAVE_RADIUS_M;
  if (left) events.push({ kind: 'departed', stopId: standing.id, at: fix.recordedAt });

  // Arrival: only the next stop in order, and only once the previous one is left
  // (two stops at the same depot — a round trip — mustn't both arrive at once).
  if (!standing || left) {
    const next = ordered.find((s) => !s.actual_arrival);
    if (next && fenceable(next) && dist(next) <= ARRIVE_RADIUS_M) {
      events.push({ kind: 'arrived', stopId: next.id, at: fix.recordedAt });
    }
  }
  return events;
}

/** Whether a trip is recent enough for GPS to stamp its stops. */
export function tripIsCurrent(trip: { actual_start: Date | null; planned_start: Date | null; createdAt: Date }, now: Date): boolean {
  const started = trip.actual_start ?? trip.planned_start ?? trip.createdAt;
  return now.getTime() - started.getTime() <= MAX_TRIP_AGE_MS;
}

export function stopDetectionEnabled(): boolean {
  return (process.env.GPS_STOP_DETECTION ?? 'on').toLowerCase() !== 'off';
}

/**
 * Applies fresh truck fixes to the running trips those trucks are on. Called by
 * the ICCES poller after positions are saved. Never throws — tracking is a
 * feature, the poller must keep running.
 */
export async function applyGpsStopEvents(
  db: PrismaClient,
  fixes: Array<GpsFix & { deviceId: string }>,
  now = new Date(),
): Promise<number> {
  if (!stopDetectionEnabled() || fixes.length === 0) return 0;
  try {
    const byDevice = new Map(fixes.map((f) => [f.deviceId, f]));
    const trips = await db.trip.findMany({
      where: {
        deletedAt: null,
        status: { in: [...RUNNING_STATUSES] },
        vehicle: { icces_device_id: { in: [...byDevice.keys()] } },
      },
      select: {
        id: true, ref_id: true, actual_start: true, planned_start: true, createdAt: true,
        vehicle: { select: { icces_device_id: true } },
        stops: {
          where: { deletedAt: null },
          select: {
            id: true, stop_sequence: true, location_lat: true, location_lng: true,
            location_coordinate_precision: true, locationId: true, actual_arrival: true, actual_departure: true,
          },
        },
      },
    });

    let written = 0;
    for (const trip of trips) {
      const fix = trip.vehicle?.icces_device_id ? byDevice.get(trip.vehicle.icces_device_id) : undefined;
      if (!fix || !tripIsCurrent(trip, now)) continue;
      const stops: GeofenceStop[] = trip.stops.map((s) => ({
        id: s.id,
        stop_sequence: s.stop_sequence,
        lat: s.location_lat,
        lng: s.location_lng,
        precision: s.location_coordinate_precision,
        saved_site: !!s.locationId,
        actual_arrival: s.actual_arrival,
        actual_departure: s.actual_departure,
      }));
      for (const e of detectStopEvents(stops, fix, now)) {
        const field = e.kind === 'arrived' ? 'actual_arrival' : 'actual_departure';
        // Fill-only, like every stamping path: a driver's tap or an ops correction wins.
        const res = await db.tripStop.updateMany({
          where: { id: e.stopId, tripId: trip.id, deletedAt: null, [field]: null },
          data: { [field]: e.at },
        });
        if (res.count) {
          written += 1;
          logger.info({ tripId: trip.id, ref: trip.ref_id, stopId: e.stopId, event: e.kind }, '[GPS stops] stop time recorded from truck GPS');
        }
      }
    }
    return written;
  } catch (err) {
    logger.warn({ err }, '[GPS stops] could not apply truck positions to trip stops');
    return 0;
  }
}

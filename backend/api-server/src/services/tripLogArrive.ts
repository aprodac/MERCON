/**
 * "Arrived" on a customer-app (trip-log) trip: the driver taps it at the next
 * stop, before sending that stop's screenshot. Stamps the stop's actual_arrival
 * once, with the server's clock — a second tap, or a later screenshot
 * (tripLogPlace only fills an empty arrival), never moves it.
 */
import { TRIP_LOG_STATE } from '@mercon/shared-types';

export class ArriveError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

/** The slice of the database this needs — the real client, or a fake in tests. */
export interface ArriveDb {
  trip: {
    findFirst(args: any): Promise<{ id: string; driver_workflow_state: string | null; stops: { id: string; actual_arrival: Date | null }[] } | null>;
  };
  tripStop: {
    updateMany(args: any): Promise<{ count: number }>;
  };
}

export interface ArriveResult {
  /** False when the stop already had an arrival (a repeat tap): nothing changed. */
  stamped: boolean;
  arrivedAt: Date;
}

export async function arriveAtStop(db: ArriveDb, tripId: string, driverId: string, stopId: string, now = new Date()): Promise<ArriveResult> {
  const trip = await db.trip.findFirst({
    where: { id: tripId, driverId, deletedAt: null },
    select: { id: true, driver_workflow_state: true, stops: { where: { deletedAt: null }, select: { id: true, actual_arrival: true } } },
  });
  if (!trip) throw new ArriveError(404, 'NOT_FOUND', 'Trip not found or not assigned to you');
  // The trip the driver is on: started as a trip log, not some other trip's stop.
  if (trip.driver_workflow_state !== TRIP_LOG_STATE) {
    throw new ArriveError(409, 'WRONG_TRIP', 'This is not the trip you are on. Open the trip from Home.');
  }
  const stop = trip.stops.find((s) => s.id === stopId);
  if (!stop) throw new ArriveError(400, 'UNKNOWN_STOP', 'That stop is not on this trip');
  if (stop.actual_arrival) return { stamped: false, arrivedAt: stop.actual_arrival };
  // The where keeps it once-only even when two taps race.
  const { count } = await db.tripStop.updateMany({ where: { id: stop.id, tripId: trip.id, actual_arrival: null }, data: { actual_arrival: now } });
  return { stamped: count > 0, arrivedAt: now };
}

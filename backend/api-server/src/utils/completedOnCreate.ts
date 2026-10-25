import { TripStatus } from '@prisma/client';

/**
 * A trip created as already Completed never ran through the driver app, so it
 * has no real times. Stamp the planned ones instead — otherwise it has no
 * actual_end and never shows in History on its day or in the Done counts.
 */
export function completedOnCreateTimes(
  status: TripStatus | string,
  plannedStart: Date | null,
  plannedEnd: Date | null,
): { actual_start: Date; actual_end: Date } | null {
  if (status !== TripStatus.Completed || !plannedStart) return null;
  return { actual_start: plannedStart, actual_end: plannedEnd ?? plannedStart };
}

/** Stops of a trip created as Completed: arrival/departure from the planned times where not given. */
export function stampCompletedStops<T extends { planned_arrival?: Date | null }>(
  stops: T[],
  plannedStart: Date,
  plannedEnd: Date | null,
): Array<T & { actual_arrival: Date; actual_departure: Date }> {
  const end = plannedEnd ?? plannedStart;
  return stops.map((stop, i) => {
    const at = i === 0 ? plannedStart : i === stops.length - 1 ? end : stop.planned_arrival ?? plannedStart;
    return { ...stop, actual_arrival: at, actual_departure: at };
  });
}

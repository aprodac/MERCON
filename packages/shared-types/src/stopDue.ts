/**
 * When a trip stop is due — what "late" is measured against.
 *
 * The office judges a stop by the transit time, not the booked clock time
 * (TestFlight 29 Oct: "determine whether it is late by calculating transit
 * time, not the scheduled loading and reaching time"). A truck that loads 26
 * minutes late and then drives the planned 14 h arrives 26 minutes after the
 * booked time, and is on time.
 *
 * So a stop after one the truck has left is due at that departure plus the
 * planned time between the two stops (this stop's planned arrival minus the
 * one before's) — or at its own booked time, whichever is later: leaving early
 * never makes a booked arrival late. The first stop, or one whose previous
 * stop isn't left yet or has no plan, is due at its booked time.
 */

type When = Date | string | null | undefined;

export interface StopTimesLike {
  planned_arrival?: When;
  actual_departure?: When;
}

const ms = (v: When): number | null => {
  if (!v) return null;
  const t = (v instanceof Date ? v : new Date(v)).getTime();
  return Number.isNaN(t) ? null : t;
};

/** When `stops[i]` is due (stops in route order); null when it has no planned time. */
export function stopDueAt(stops: readonly StopTimesLike[], i: number): Date | null {
  const booked = ms(stops[i]?.planned_arrival);
  if (booked == null) return null;
  const prev = i > 0 ? stops[i - 1] : null;
  const left = ms(prev?.actual_departure);
  const prevBooked = ms(prev?.planned_arrival);
  if (left == null || prevBooked == null || booked <= prevBooked) return new Date(booked);
  return new Date(Math.max(booked, left + (booked - prevBooked)));
}

/** Minutes late against `stopDueAt` (negative = early); null when it has no plan or hasn't arrived. */
export function stopMinutesLate(stops: readonly StopTimesLike[], i: number, arrival: When): number | null {
  const due = stopDueAt(stops, i);
  const at = ms(arrival);
  if (!due || at == null) return null;
  return Math.round((at - due.getTime()) / 60000);
}

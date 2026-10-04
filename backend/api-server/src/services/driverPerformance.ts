import { DELAY_THRESHOLD_MINUTES } from './tripLifecycle';

/**
 * The driver app's Performance numbers and trip-history badges, from real trip
 * data only. They used to be placeholders ("98%" on-time, trips × 120 km) sent
 * under names the app didn't read, so the screen showed 0 / 0% / 0 km.
 */

/** Statuses where the trip was driven to the end and earns the driver charge. */
export const FINISHED_TRIP_STATUSES = ['Completed', 'Invoiced'] as const;

export type Punctuality = 'on_time' | 'late';

export interface StopTimes {
  stop_sequence: number;
  stop_type: string;
  planned_arrival: Date | string | null;
  actual_arrival: Date | string | null;
  deletedAt?: Date | string | null;
}

/**
 * On time when the final drop-off was reached no later than its planned
 * arrival plus the delay threshold the office already uses for delay alerts.
 * null when either time is missing — such a trip is not counted either way.
 */
export function deliveryPunctuality(
  stops: StopTimes[] | null | undefined,
  thresholdMinutes: number = DELAY_THRESHOLD_MINUTES,
): Punctuality | null {
  const drops = (stops ?? [])
    .filter((s) => s.stop_type === 'Dropoff' && !s.deletedAt)
    .sort((a, b) => a.stop_sequence - b.stop_sequence);
  const last = drops[drops.length - 1];
  if (!last?.planned_arrival || !last.actual_arrival) return null;
  const lateMs = new Date(last.actual_arrival).getTime() - new Date(last.planned_arrival).getTime();
  if (Number.isNaN(lateMs)) return null;
  return lateMs <= thresholdMinutes * 60_000 ? 'on_time' : 'late';
}

export interface DriverPerformance {
  completed_trips: number;
  /** Completed trips whose final drop-off has both a planned and an actual arrival. */
  on_time_measured_trips: number;
  on_time_trips: number;
  /** Whole percent, or null when no completed trip has the times to judge. */
  on_time_percentage: number | null;
}

export function summarisePerformance(trips: { status: string; stops?: StopTimes[] | null }[]): DriverPerformance {
  const finished = trips.filter((t) => (FINISHED_TRIP_STATUSES as readonly string[]).includes(t.status));
  const judged = finished.map((t) => deliveryPunctuality(t.stops)).filter((p): p is Punctuality => p !== null);
  const onTime = judged.filter((p) => p === 'on_time').length;
  return {
    completed_trips: finished.length,
    on_time_measured_trips: judged.length,
    on_time_trips: onTime,
    on_time_percentage: judged.length ? Math.round((onTime * 100) / judged.length) : null,
  };
}

/**
 * When a past trip ended, for the driver's History list: the delivery time for
 * a finished trip, the cancellation for a cancelled one. There is no
 * cancelled-at column, so a cancelled trip uses its last update (the cancel).
 */
export function historyFinishedAt(t: { status: string; actual_end: Date | null; updatedAt: Date }): Date {
  if (t.status !== 'Cancelled' && t.actual_end) return t.actual_end;
  return t.updatedAt;
}

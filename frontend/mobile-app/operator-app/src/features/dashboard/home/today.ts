/** "Today" in the deployment timezone, shared by Home's ring and Up next. Pure. */
import type { ActionSources } from '../actions/actionModel';

export function dayKeyIn(tz: string, ms: number): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
  } catch {
    return new Date(ms).toDateString();
  }
}

/** Draft / Scheduled trips planned for today, soonest first. */
export function toStartToday(trips: ActionSources['unassigned'], tz: string, now: number) {
  const today = dayKeyIn(tz, now);
  return trips
    .filter((t) => t.planned_start && ['Draft', 'Scheduled'].includes(t.status) && dayKeyIn(tz, new Date(t.planned_start).getTime()) === today)
    .sort((a, b) => new Date(a.planned_start!).getTime() - new Date(b.planned_start!).getTime());
}

/** "Good morning" / "Good afternoon" / "Good evening" by the hour in `tz`. */
export function greeting(tz: string, now: number): string {
  let hour = new Date(now).getHours();
  try {
    hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(new Date(now))) % 24;
  } catch {
    // keep the device hour
  }
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

export function dateLabel(tz: string, now: number): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(now));
  } catch {
    return new Date(now).toDateString();
  }
}

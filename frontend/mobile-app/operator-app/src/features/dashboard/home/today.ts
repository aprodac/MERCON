/** "Today" in the deployment timezone, shared by Home's header and Up next. Pure. */
import type { ActionSources } from '../actions/actionModel';
import type { LiveUnit } from '../../../lib/operator';

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

/** Minutes since midnight in `tz`, clamped to today: 0 for earlier days, 1440 for later ones. */
export function minuteOfDay(tz: string, ms: number, now: number): number {
  const day = dayKeyIn(tz, ms);
  const today = dayKeyIn(tz, now);
  if (day < today) return 0;
  if (day > today) return 1440;
  try {
    const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false })
      .format(new Date(ms)).split(':').map(Number);
    return (h % 24) * 60 + m;
  } catch {
    const d = new Date(ms);
    return d.getHours() * 60 + d.getMinutes();
  }
}

export function clockIn(tz: string, iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
  } catch {
    return '';
  }
}

export interface DayBar { key: string; from: number; to: number; late: boolean }
export interface DayDot { key: string; at: number }

/**
 * Home's day strip, in minutes since midnight: a bar per trip on the road
 * (planned start → planned end, or its last stop's planned arrival) and a dot
 * per trip still to start today, at its planned start.
 */
export function dayStrip(units: LiveUnit[], toStart: ActionSources['unassigned'], tz: string, now: number): { bars: DayBar[]; dots: DayDot[]; now: number } {
  const at = (iso: string | null | undefined, fallback: number) => (iso ? minuteOfDay(tz, new Date(iso).getTime(), now) : fallback);
  const nowMin = minuteOfDay(tz, now, now);
  const bars = units
    .filter((u) => u.trip && u.trip.phase !== 'upcoming')
    .map((u) => {
      const t = u.trip!;
      const from = at(t.planned_start, nowMin);
      const end = t.planned_end ?? t.stops[t.stops.length - 1]?.planned_arrival ?? null;
      const to = Math.max(at(end, Math.min(nowMin + 60, 1440)), from + 15);
      return { key: t.id, from, to: Math.min(to, 1440), late: t.phase === 'delayed' };
    });
  const dots = toStart.map((t) => ({ key: t.id, at: at(t.planned_start, nowMin) }));
  return { bars, dots, now: nowMin };
}

/** The one line under Home's day strip: what happens next today. */
export function nextUp(units: LiveUnit[], toStart: ActionSources['unassigned'], done: number, tz: string, now: number): { lead: string; rest: string } {
  const first = toStart[0];
  if (first?.planned_start) {
    const who = first.vehicle?.plate_number || first.ref_id || first.customer?.name || 'A trip';
    const time = clockIn(tz, first.planned_start);
    return new Date(first.planned_start).getTime() < now
      ? { lead: `${who} hasn't started.`, rest: `Planned for ${time}.` }
      : { lead: `Next start ${time}.`, rest: who };
  }
  const arrivals = units
    .filter((u) => u.trip && u.trip.phase !== 'upcoming' && u.trip.next_stop_index != null)
    .map((u) => ({ u, stop: u.trip!.stops[u.trip!.next_stop_index!] }))
    .filter((x) => x.stop?.planned_arrival)
    .sort((a, b) => new Date(a.stop.planned_arrival!).getTime() - new Date(b.stop.planned_arrival!).getTime());
  if (arrivals.length) {
    const { u, stop } = arrivals[0];
    const who = u.vehicle?.plate_number || u.trip!.ref_id || 'A truck';
    return { lead: 'Nothing else to start today.', rest: `${who} due${stop.name ? ` in ${stop.name}` : ''} at ${clockIn(tz, stop.planned_arrival!)}.` };
  }
  const running = units.filter((u) => u.trip && u.trip.phase !== 'upcoming').length;
  if (running) return { lead: 'Nothing else to start today.', rest: `${running} on the road.` };
  if (done) return { lead: 'Day done.', rest: `${done} ${done === 1 ? 'trip' : 'trips'} finished today.` };
  return { lead: 'No trips planned today.', rest: '' };
}

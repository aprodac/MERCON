/**
 * Copying a trip's real stop times off the customer app's screenshots
 * (EXTERNAL_APP trips). The driver's taps stamp provisional times; the
 * operator reads the true ones off the screenshot — the customer app shows
 * every stop's arrive/departure to the second — and types them in.
 *
 * Shared by the web dashboard and the operator app so both turn "054426" into
 * the same instant, pick the same date, and flag the same mistakes.
 */
import { tzOffsetMs, zonedWallTimeToUtcIso } from './tripCreation';

/** "054426", "0544", "5:44", "05:44:26" → "05:44:26"; null when it isn't a time. */
export function parseClock(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  let h: number, m: number, s = 0;
  if (t.includes(':')) {
    const parts = t.split(':');
    if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d{1,2}$/.test(p))) return null;
    [h, m, s = 0] = parts.map(Number);
  } else {
    if (!/^\d+$/.test(t) || ![3, 4, 5, 6].includes(t.length)) return null;
    const d = t.length % 2 ? `0${t}` : t; // "544" → "0544"
    h = Number(d.slice(0, 2));
    m = Number(d.slice(2, 4));
    s = d.length === 6 ? Number(d.slice(4, 6)) : 0;
  }
  if (h > 23 || m > 59 || s > 59) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(s)}`;
}

/** Live formatting while typing digits: "0544" → "05:44", "054426" → "05:44:26". */
export function formatClockTyping(raw: string): string {
  if (raw.includes(':')) return raw.slice(0, 8);
  const d = raw.replace(/\D/g, '').slice(0, 6);
  return d.length <= 2 ? d : d.length <= 4 ? `${d.slice(0, 2)}:${d.slice(2)}` : `${d.slice(0, 2)}:${d.slice(2, 4)}:${d.slice(4)}`;
}

/** An instant as its wall date (YYYY-MM-DD) and clock (HH:mm:ss) in `tz`. */
export function isoToWall(iso: string, tz: string): { date: string; clock: string } {
  const ms = new Date(iso).getTime();
  const w = new Date(ms + tzOffsetMs(ms, tz));
  const p = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${w.getUTCFullYear()}-${p(w.getUTCMonth() + 1)}-${p(w.getUTCDate())}`,
    clock: `${p(w.getUTCHours())}:${p(w.getUTCMinutes())}:${p(w.getUTCSeconds())}`,
  };
}

function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (both YYYY-MM-DD). */
function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export interface StopTimeRow {
  stopId: string;
  /** What the driver's taps recorded (ISO), if anything. */
  recordedArrival: string | null;
  recordedDeparture: string | null;
  /** What the operator typed; blank keeps the recorded time. */
  arrival: string;
  departure: string;
}

export interface ResolvedTime {
  /** The instant to save, or null when there is nothing (blank and never recorded). */
  iso: string | null;
  /** Typed and different from the recorded time. */
  changed: boolean;
  /** Days after the trip's first day (shown as "+1 day"). */
  dayOffset: number;
  error: string | null;
}

export interface ResolvedStop {
  stopId: string;
  arrival: ResolvedTime;
  departure: ResolvedTime;
}

const sameSecond = (a: string | null, b: string | null) =>
  !!a && !!b && Math.floor(Date.parse(a) / 1000) === Math.floor(Date.parse(b) / 1000);

/**
 * Turns what the operator typed into real instants, stop by stop in order.
 *
 * Only a clock is typed, so the date is inferred: the day that puts it closest
 * to the driver's tap for that same field (taps are minutes-to-hours off, never
 * half a day). With no tap, the first day at or after the previous stop's time.
 * Then flags what can't be true: leaving before arriving, or arriving before
 * the stop before.
 */
export function resolveStopTimes(rows: StopTimeRow[], tz: string, fallbackIso: string): ResolvedStop[] {
  let prevIso: string | null = null;
  let firstDate: string | null = null;

  const resolve = (typed: string, recorded: string | null): ResolvedTime => {
    if (!typed.trim()) {
      return { iso: recorded, changed: false, dayOffset: 0, error: null };
    }
    const clock = parseClock(typed);
    if (!clock) return { iso: recorded, changed: false, dayOffset: 0, error: 'Use hh:mm:ss' };

    let iso: string;
    if (recorded) {
      const anchor = Date.parse(recorded);
      const base = isoToWall(recorded, tz).date;
      iso = [-1, 0, 1]
        .map((d) => zonedWallTimeToUtcIso(shiftDate(base, d), clock, tz))
        .reduce((best, c) => (Math.abs(Date.parse(c) - anchor) < Math.abs(Date.parse(best) - anchor) ? c : best));
    } else {
      const after = prevIso ?? fallbackIso;
      const base = isoToWall(after, tz).date;
      const sameDay = zonedWallTimeToUtcIso(base, clock, tz);
      iso = Date.parse(sameDay) >= Date.parse(after) || !prevIso ? sameDay : zonedWallTimeToUtcIso(shiftDate(base, 1), clock, tz);
    }
    return { iso, changed: !sameSecond(iso, recorded), dayOffset: 0, error: null };
  };

  const out: ResolvedStop[] = rows.map((r) => {
    const arrival = resolve(r.arrival, r.recordedArrival);
    if (arrival.iso) prevIso = arrival.iso;
    const departure = resolve(r.departure, r.recordedDeparture);
    if (departure.iso) prevIso = departure.iso;
    return { stopId: r.stopId, arrival, departure };
  });

  // Day offsets and impossible orderings, now that every instant is known.
  let last: string | null = null;
  for (const s of out) {
    for (const t of [s.arrival, s.departure]) {
      if (!t.iso) continue;
      const date = isoToWall(t.iso, tz).date;
      firstDate ??= date;
      t.dayOffset = dayDiff(firstDate, date);
    }
    if (s.arrival.iso && last && Date.parse(s.arrival.iso) < Date.parse(last) && !s.arrival.error) {
      s.arrival.error = 'Earlier than the stop before';
    }
    if (s.arrival.iso && s.departure.iso && Date.parse(s.departure.iso) < Date.parse(s.arrival.iso) && !s.departure.error) {
      s.departure.error = 'Left before arrived';
    }
    last = s.departure.iso ?? s.arrival.iso ?? last;
  }
  return out;
}

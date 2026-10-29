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
  /**
   * The "Left" time isn't asked for (a drop-off): it follows "Arrived" — typing
   * an arrival moves it too, and a tapped leave time never blocks the next
   * stop's arrival (it's pulled back to the arrival instead).
   */
  leftFollowsArrival?: boolean;
  /**
   * The day (YYYY-MM-DD, in the deployment zone) the operator set for a typed
   * time — taken as is instead of inferred (TestFlight 24 Oct: "a date column
   * we can edit when there is any confusion").
   */
  arrivalDate?: string;
  departureDate?: string;
  /**
   * Which place the stop is (location id or name). Two stops in a row at the
   * same place — a round trip's offload then return loading — are one visit:
   * the truck arrived once (TestFlight 25 Oct: "arrived 18:33:06 at al bahah is
   * before the truck reached al bahah (18:33:28)").
   */
  place?: string | null;
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
 * Only a clock is typed, so the date is inferred (unless the operator set one):
 * the day that puts it closest to the driver's tap for that same field, among
 * the days at or after the previous stop's time and not after a later stop's
 * tap. With no tap, the first day at or after the previous stop's time — a day
 * earlier when that would be in the future or after a later stop's tap — but a
 * time under 3 h before the previous one stays on its day and is flagged.
 * Then flags what can't be true: leaving before arriving, or arriving before
 * the stop before.
 */
export function resolveStopTimes(rows: StopTimeRow[], tz: string, fallbackIso: string, nowIso?: string): ResolvedStop[] {
  let prevIso: string | null = null;
  let firstDate: string | null = null;
  const nowMs = nowIso ? Date.parse(nowIso) : Date.now();
  /** The earliest time the driver's taps recorded after the row being resolved. */
  let limitAfter = Infinity;
  const recordedFrom = (i: number) =>
    rows.slice(i + 1).flatMap((r) => [r.recordedArrival, r.recordedDeparture]).filter((x): x is string => !!x).map(Date.parse);

  const resolve = (typed: string, recorded: string | null, date?: string): ResolvedTime => {
    if (!typed.trim()) {
      return { iso: recorded, changed: false, dayOffset: 0, error: null };
    }
    const clock = parseClock(typed);
    if (!clock) return { iso: recorded, changed: false, dayOffset: 0, error: 'Use hh:mm:ss' };

    let iso: string;
    const limit = Math.min(nowMs, limitAfter);
    if (date) {
      // The operator said which day.
      iso = zonedWallTimeToUtcIso(date, clock, tz);
    } else if (recorded) {
      const anchor = Date.parse(recorded);
      const base = isoToWall(recorded, tz).date;
      const days = [-1, 0, 1].map((d) => zonedWallTimeToUtcIso(shiftDate(base, d), clock, tz));
      // The day nearest the tap — among the days that keep the stops in order and
      // before any later stop's tap. A driver who taps every stop late (TRP-0053:
      // all at 10:56–11:01 the next morning) put "left 23:53" the night before
      // "arrived 18:22" (TestFlight 24 Oct: "says left before arrived, but the
      // times are right").
      // A time just before the one before (under 3 h) stays put and is flagged, as below.
      const nearest = (cs: string[]) => cs.reduce((best, c) => (Math.abs(Date.parse(c) - anchor) < Math.abs(Date.parse(best) - anchor) ? c : best));
      const fits = (c: string) => (!prevIso || Date.parse(c) >= Date.parse(prevIso)) && Date.parse(c) <= limit;
      const best = nearest(days);
      const slip = !!prevIso && Date.parse(best) < Date.parse(prevIso) && Date.parse(prevIso) - Date.parse(best) <= 3 * 3_600_000;
      const ok = days.filter(fits);
      iso = fits(best) || slip || !ok.length ? best : nearest(ok);
    } else {
      const after = prevIso ?? fallbackIso;
      const base = isoToWall(after, tz).date;
      const sameDay = zonedWallTimeToUtcIso(base, clock, tz);
      // A time a little before the one before it (under 3 h) is a slip, or the
      // screenshot's own mix-up: it stays on that day, so the stop where it was
      // typed shows the problem — not the next stop, a whole day later
      // (TestFlight 24 Oct: "departed from Najran is earlier than arrived at Najran").
      const slip = !!prevIso && Date.parse(sameDay) < Date.parse(prevIso) && Date.parse(prevIso) - Date.parse(sameDay) <= 3 * 3_600_000;
      iso = Date.parse(sameDay) >= Date.parse(after) || !prevIso || slip ? sameDay : zonedWallTimeToUtcIso(shiftDate(base, 1), clock, tz);
      if (slip) return { iso, changed: !sameSecond(iso, recorded), dayOffset: 0, error: null };
      // A screenshot time has already happened, and comes before any later
      // stop's tap: never after either. The trip's Start tap is often made
      // late, so its day put "21:05" (the night before) a day ahead and every
      // later stop with it (TRP-0049: "03:22 is before 03:11").
      if (Date.parse(iso) > limit) {
        const dayBefore = zonedWallTimeToUtcIso(shiftDate(isoToWall(iso, tz).date, -1), clock, tz);
        if (!prevIso || Date.parse(dayBefore) >= Date.parse(prevIso)) iso = dayBefore;
      }
    }
    return { iso, changed: !sameSecond(iso, recorded), dayOffset: 0, error: null };
  };

  const out: ResolvedStop[] = rows.map((r, i) => {
    limitAfter = Math.min(Infinity, ...recordedFrom(i));
    const arrival = resolve(r.arrival, r.recordedArrival, r.arrivalDate);
    if (arrival.iso) prevIso = arrival.iso;
    if (r.leftFollowsArrival) {
      const departure: ResolvedTime = arrival.changed
        ? { iso: arrival.iso, changed: !sameSecond(arrival.iso, r.recordedDeparture), dayOffset: 0, error: null }
        : { iso: r.recordedDeparture, changed: false, dayOffset: 0, error: null };
      return { stopId: r.stopId, arrival, departure };
    }
    const departure = resolve(r.departure, r.recordedDeparture, r.departureDate);
    if (departure.iso) prevIso = departure.iso;
    return { stopId: r.stopId, arrival, departure };
  });

  // A hidden "Left" that is after the next stop's arrival (or before its own
  // arrival) can't be right: it goes back to its own stop's arrival.
  out.forEach((s, i) => {
    if (!rows[i].leftFollowsArrival || !s.departure.iso || !s.arrival.iso) return;
    const next = out.slice(i + 1).find((n) => n.arrival.iso)?.arrival.iso;
    const dep = Date.parse(s.departure.iso);
    if (dep < Date.parse(s.arrival.iso) || (next && dep > Date.parse(next))) {
      s.departure = { iso: s.arrival.iso, changed: !sameSecond(s.arrival.iso, rows[i].recordedDeparture), dayOffset: 0, error: null };
    }
  });

  // Day offsets and impossible orderings, now that every instant is known.
  let last: string | null = null;
  for (const [i, s] of out.entries()) {
    const prev = i > 0 ? out[i - 1] : null;
    // Same place as the stop before, arriving a little earlier than its (tapped) arrival:
    // it's the same arrival, so the stop before takes it too instead of flagging this one.
    if (prev && s.arrival.iso && rows[i].place && rows[i].place === rows[i - 1].place
      && prev.arrival.iso && Date.parse(s.arrival.iso) < Date.parse(prev.arrival.iso)
      && Date.parse(prev.arrival.iso) - Date.parse(s.arrival.iso) <= 3 * 3_600_000) {
      if (!rows[i - 1].arrival.trim()) {
        prev.arrival = { ...prev.arrival, iso: s.arrival.iso, changed: !sameSecond(s.arrival.iso, rows[i - 1].recordedArrival), error: null };
        if (rows[i - 1].leftFollowsArrival) {
          prev.departure = { ...prev.departure, iso: s.arrival.iso, changed: !sameSecond(s.arrival.iso, rows[i - 1].recordedDeparture), error: null };
        }
      }
      last = s.arrival.iso;
    } else if (prev && s.arrival.iso && rows[i].place && rows[i].place === rows[i - 1].place && last && Date.parse(s.arrival.iso) < Date.parse(last)) {
      // …or the stop before's (hidden) "Left" is a little after this arrival: still one visit.
      if (Date.parse(last) - Date.parse(s.arrival.iso) <= 3 * 3_600_000) last = s.arrival.iso;
    }
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

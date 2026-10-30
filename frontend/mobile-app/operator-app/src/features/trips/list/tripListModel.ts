/**
 * Pure helpers for the Trips page: what state a trip is in, what's wrong with
 * it (the warning pills), a one-line route, stop progress, and day buckets in
 * the deployment's timezone.
 */
import { isDelayedNotStarted } from '@mercon/shared-types';
import type { OperatorTrip } from '../../../lib/operator';
import { liveLegOf, splitLegs } from '../tripLegs';

export type Phase = 'draft' | 'planned' | 'running' | 'delayed' | 'done' | 'cancelled';

export function phaseOf(status: string): Phase {
  switch (status) {
    case 'Draft': return 'draft';
    case 'Scheduled': return 'planned';
    case 'Loading':
    case 'InTransit': return 'running';
    case 'Delayed':
    case 'Emergency': return 'delayed';
    case 'Completed':
    case 'Invoiced': return 'done';
    case 'Cancelled': return 'cancelled';
    default: return 'planned';
  }
}

export const PHASE_STYLE: Record<Phase, { label: string; bg: string; fg: string; dot: string }> = {
  draft: { label: 'Draft', bg: '#F1F1F3', fg: '#52525B', dot: '#9898A4' },
  planned: { label: 'Scheduled', bg: '#F0EBFC', fg: '#4A2A93', dot: '#7651D6' },
  running: { label: 'On the road', bg: '#E7EEFC', fg: '#2449A8', dot: '#2F5FD0' },
  delayed: { label: 'Delayed', bg: '#FDEDEB', fg: '#912018', dot: '#D92D20' },
  done: { label: 'Delivered', bg: '#E8F5EE', fg: '#146C3C', dot: '#1F9D55' },
  cancelled: { label: 'Cancelled', bg: '#F1F1F3', fg: '#6E6E80', dot: '#B8BCC8' },
};

/**
 * Delayed, but no stop reached yet: waiting to start, not on the road — also when
 * the driver tapped Start but hasn't got to the first pickup (TestFlight 25 Oct:
 * TRP-0066 "not started yet and it's showing arriving late instead of starting late").
 */
export const isLateToStart = (t: OperatorTrip) =>
  isDelayedNotStarted(t) || (t.status === 'Delayed' && stopsOf(t).length > 0 && !stopsOf(t).some((x) => x.actual_arrival || x.actual_departure));

export const statusText = (t: OperatorTrip) =>
  t.status === 'Loading' ? 'Loading'
  : t.status === 'Invoiced' ? 'Invoiced'
  : t.status === 'Delayed' ? (isLateToStart(t) ? 'Starting late' : 'Late arriving')
  : PHASE_STYLE[phaseOf(t.status)].label;

interface Stop {
  id: string;
  stop_sequence: number;
  stop_type: string;
  location_name: string | null;
  location?: { name?: string | null; code?: string | null } | null;
  planned_arrival: string | null;
  actual_arrival: string | null;
  actual_departure?: string | null;
  delay_reason?: string | null;
  leg_index?: number | null;
}

const stopsOf = (t: OperatorTrip): Stop[] => [...((t.stops ?? []) as Stop[])].sort((a, b) => a.stop_sequence - b.stop_sequence);

const isUuid = (s?: string | null) => !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s);

export function placeName(s: Stop | undefined): string {
  const raw = s?.location?.name || s?.location_name || '';
  if (!raw || isUuid(raw)) return '—';
  return raw.replace(/\[RETURN:.*?\]/gi, '').replace(/🔁\s*/g, '').split(',')[0].trim() || '—';
}

/** "Riyadh DC → Jeddah Port" with how many stops sit in between. */
export interface TripRoute {
  from: string;
  to: string;
  /** Stops in between (a round trip: on both legs, not counting where it turns back). */
  via: number;
  /** Round trip: where it ends after the way back (usually `from`). */
  back: string | null;
  /** Round trip under way: 1 on the way out, 2 on the way back (null before it starts / once done). */
  leg: 1 | 2 | null;
}

/** A round trip shows its way out (Riyadh → Jeddah) and "back to Riyadh" — not "Riyadh → Riyadh". */
export function routeOf(t: OperatorTrip): TripRoute {
  const st = stopsOf(t);
  if (st.length === 0) return { from: '—', to: '—', via: 0, back: null, leg: null };
  const legs = splitLegs(st, t.rate_category);
  if (!legs.round) return { from: placeName(st[0]), to: placeName(st[st.length - 1]), via: Math.max(0, st.length - 2), back: null, leg: null };
  const out = legs.outbound;
  const ret = legs.ret;
  return {
    from: placeName(out[0]),
    to: placeName(out[out.length - 1]),
    via: Math.max(0, out.length - 2) + Math.max(0, ret.length - 2),
    back: ret.length ? placeName(ret[ret.length - 1]) : placeName(out[0]),
    // A trip the driver never started isn't on a leg yet (TestFlight 24 Oct: "starting late
    // should show as delayed / to start, not on the road" — its card said "Leg 1 going").
    leg: isLateToStart(t) ? null : liveLegOf(legs, t.status),
  };
}

export function progressOf(t: OperatorTrip): { done: number; total: number; nextIdx: number; next: string | null } {
  const st = stopsOf(t);
  const nextIdx = st.findIndex((s) => !s.actual_arrival);
  return { done: st.filter((s) => s.actual_arrival).length, total: st.length, nextIdx, next: nextIdx >= 0 ? placeName(st[nextIdx]) : null };
}

export const driverNameOf = (t: OperatorTrip) =>
  t.is_third_party
    ? t.subcontract?.driverName || t.subcontract?.provider?.name || 'Third-party'
    : t.driver ? `${t.driver.first_name} ${t.driver.last_name}`.trim() : null;

export const driverPhoneOf = (t: OperatorTrip) =>
  t.is_third_party ? t.subcontract?.driverPhone ?? null : t.driver?.phone_primary ?? null;

export const plateOf = (t: OperatorTrip) =>
  t.is_third_party ? t.subcontract?.vehiclePlate ?? null : t.vehicle?.plate_number ?? null;

export type FlagTone = 'red' | 'amber' | 'gray' | 'violet';
export interface Flag { key: string; label: string; tone: FlagTone }

const minutes = (ms: number) => Math.round(ms / 60000);
export function shortDuration(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 && h < 10 ? `${h}h ${m % 60}m` : `${h}h`;
  return `${Math.round(h / 24)}d`;
}

/**
 * The planned transit time of the trip's first leg, in minutes: from the first stop's
 * planned time (or the trip's start) to the leg's last stop. null when not planned.
 */
export function plannedTransitMin(t: OperatorTrip): number | null {
  const st = stopsOf(t);
  if (st.length < 2) return null;
  const legs = splitLegs(st, t.rate_category);
  const out = legs.round ? legs.outbound : st;
  const from = Date.parse(out[0]?.planned_arrival ?? t.planned_start ?? '');
  const to = Date.parse(out[out.length - 1]?.planned_arrival ?? '');
  return Number.isFinite(from) && Number.isFinite(to) && to > from ? minutes(to - from) : null;
}

/** What's wrong with a trip — the pills on its card, most serious first. */
export function flagsOf(t: OperatorTrip, now = Date.now()): Flag[] {
  const flags: Flag[] = [];
  const phase = phaseOf(t.status);
  const st = stopsOf(t);
  const start = t.planned_start ? new Date(t.planned_start).getTime() : null;
  const open = phase === 'draft' || phase === 'planned' || phase === 'running' || phase === 'delayed';

  if (phase === 'delayed') {
    const reason = st.find((s) => s.delay_reason)?.delay_reason;
    flags.push({ key: 'delayed', label: reason ? `Delayed · ${String(reason).replace(/([a-z])([A-Z])/g, '$1 $2')}` : 'Delayed', tone: 'red' });
  }
  if (phase === 'planned' && start != null && now - start > 15 * 60000) {
    flags.push({ key: 'late', label: `Not started · ${shortDuration(minutes(now - start))} late`, tone: 'red' });
  }
  if (phase === 'running' || phase === 'delayed') {
    const next = st.find((s) => !s.actual_arrival);
    if (next?.planned_arrival && now > new Date(next.planned_arrival).getTime() + 5 * 60000) {
      flags.push({ key: 'overdue', label: `Late to ${placeName(next)} · ${shortDuration(minutes(now - new Date(next.planned_arrival).getTime()))}`, tone: 'amber' });
    }
  }
  if (open && !t.is_third_party && !t.driver) flags.push({ key: 'no-driver', label: 'No driver', tone: 'red' });
  if (open && !t.is_third_party && !t.vehicle) flags.push({ key: 'no-truck', label: 'No truck', tone: 'red' });
  if (t.is_third_party) flags.push({ key: '3pl', label: '3PL', tone: 'violet' });
  if (t.driver_workflow === 'EXTERNAL_APP') flags.push({ key: 'ext', label: 'Customer app', tone: 'gray' });
  return flags;
}

/** The reason the driver gave for the delay, in words ("Traffic Jam"). */
/** "45 min", "3 h", "3 h 20 min", "1 d 4 h". */
export function lateFor(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h >= 24) return `${Math.floor(h / 24)} d ${h % 24} h`;
  return m % 60 >= 5 ? `${h} h ${m % 60} min` : `${h} h`;
}

/**
 * How late a delayed trip is and where, for its card (owner, 23 Oct: "Late
 * arriving" said neither): "3 h late · due 05:11 at Jeddah", "Not started ·
 * 17 h past start". Null when it isn't behind its plan.
 */
export function lateLineOf(t: OperatorTrip, now: number, time: (iso: string) => string): string | null {
  if (phaseOf(t.status) !== 'delayed') return null;
  if (isLateToStart(t)) {
    const start = t.planned_start ? Date.parse(t.planned_start) : NaN;
    return Number.isFinite(start) && start < now ? `Not started · ${lateFor((now - start) / 60000)} past start` : 'Not started';
  }
  // The stop after the furthest one reached — one the truck left counts even without an
  // arrival time (TestFlight 24 Oct: TRP-0013 left Jeddah 20:30, still "due 20:00 at Jeddah").
  const st = stopsOf(t);
  let reached = -1;
  st.forEach((x, i) => { if (x.actual_arrival || x.actual_departure) reached = i; });
  const next = st.slice(reached + 1).find((x) => !x.actual_arrival);
  const due = next?.planned_arrival ? Date.parse(next.planned_arrival) : NaN;
  if (next && Number.isFinite(due) && due < now) {
    const at = placeName(next);
    return `${lateFor((now - due) / 60000)} late · due ${time(next.planned_arrival!)}${at !== '—' ? ` at ${at}` : ''}`;
  }
  const end = t.planned_end ? Date.parse(t.planned_end) : NaN;
  return Number.isFinite(end) && end < now ? `${lateFor((now - end) / 60000)} past planned end` : null;
}

export function delayReasonOf(t: OperatorTrip): string | null {
  const reason = stopsOf(t).find((s) => s.delay_reason)?.delay_reason;
  return reason ? String(reason).replace(/([a-z])([A-Z])/g, '$1 $2') : null;
}

export const needsAttention = (t: OperatorTrip, now = Date.now()) =>
  flagsOf(t, now).some((f) => f.tone === 'red' || f.tone === 'amber');

// ── Time & days (deployment timezone) ─────────────────────────────────────────

export function makeTime(tz: string) {
  const fmt = (iso: string | null | undefined, o: Intl.DateTimeFormatOptions) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    try {
      return new Intl.DateTimeFormat('en-GB', { timeZone: tz, ...o }).format(d);
    } catch {
      return new Intl.DateTimeFormat('en-GB', o).format(d);
    }
  };
  const dayKey = (iso: string | number | Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
  return {
    time: (iso?: string | null) => fmt(iso, { hour: '2-digit', minute: '2-digit', hour12: false }),
    day: (iso?: string | null) => fmt(iso, { weekday: 'short', day: 'numeric', month: 'short' }),
    dayKey,
    /** Midnight at the start of `key` (YYYY-MM-DD) in tz, as an instant. */
    startOfDay(key: string): Date {
      const [y, m, d] = key.split('-').map(Number);
      const guess = Date.UTC(y, m - 1, d);
      // Offset of tz at that moment, applied once (no DST in the Gulf; good enough elsewhere).
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(guess));
      const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
      const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'));
      return new Date(guess - (asUtc - guess));
    },
  };
}
export type TimeFmt = ReturnType<typeof makeTime>;

export const tripDayIso = (t: OperatorTrip) => t.planned_start || t.createdAt || null;
/**
 * History files a trip under the day it started — a trip out on 19 Oct and
 * delivered on the 20th is one of the 19th's trips (TestFlight 21 Oct). The
 * planned day when it never started (cancelled trips).
 */
export const historyDayIso = (t: OperatorTrip) => t.actual_start || tripDayIso(t);

/** "Today", "Tomorrow", "Yesterday" or "Fri 26 Sep". */
export function dayLabel(key: string, todayKey: string, f: TimeFmt): string {
  const toDate = (k: string) => {
    const [y, m, d] = k.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const diff = Math.round((toDate(key) - toDate(todayKey)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  const [y, m, d] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** Days around today for the date strip. */
export function dayRange(todayKey: string, before: number, after: number): string[] {
  const [y, m, d] = todayKey.split('-').map(Number);
  const out: string[] = [];
  for (let i = -before; i <= after; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d + i));
    out.push(dt.toISOString().slice(0, 10));
  }
  return out;
}

/** Whole days from `a` to `b` (YYYY-MM-DD keys); negative when b is before a. */
export function daysBetween(a: string, b: string): number {
  const toDate = (k: string) => {
    const [y, m, d] = k.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toDate(b) - toDate(a)) / 86400000);
}

/**
 * Open trips that double-book a driver or truck: planned windows that overlap
 * (a trip with no end counts as 4 h). Returns trip id → "Overlaps TRP-0026 · same driver".
 */
export function clashesOf(trips: OperatorTrip[]): Map<string, string> {
  const HOUR = 3_600_000;
  const open = trips.filter((t) => {
    const p = phaseOf(t.status);
    return (p === 'draft' || p === 'planned' || p === 'running' || p === 'delayed') && t.planned_start && !t.is_third_party;
  });
  const span = (t: OperatorTrip) => {
    const a = Date.parse(t.planned_start!);
    return [a, t.planned_end ? Date.parse(t.planned_end) : a + 4 * HOUR] as const;
  };
  const out = new Map<string, string>();
  for (let i = 0; i < open.length; i++) {
    for (let j = i + 1; j < open.length; j++) {
      const a = open[i];
      const b = open[j];
      const sameDriver = !!a.driver?.id && a.driver.id === b.driver?.id;
      const sameTruck = !!a.vehicle?.id && a.vehicle.id === b.vehicle?.id;
      if (!sameDriver && !sameTruck) continue;
      const [as, ae] = span(a);
      const [bs, be] = span(b);
      if (as >= be || bs >= ae) continue;
      const what = sameDriver && sameTruck ? 'same driver and truck' : sameDriver ? 'same driver' : 'same truck';
      if (!out.has(a.id)) out.set(a.id, `Overlaps ${b.ref_id ?? 'another trip'} · ${what}`);
      if (!out.has(b.id)) out.set(b.id, `Overlaps ${a.ref_id ?? 'another trip'} · ${what}`);
    }
  }
  return out;
}

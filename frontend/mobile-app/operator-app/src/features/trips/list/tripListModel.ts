/**
 * Pure helpers for the Trips page: what state a trip is in, what's wrong with
 * it (the warning pills), a one-line route, stop progress, and day buckets in
 * the deployment's timezone.
 */
import type { OperatorTrip } from '../../../lib/operator';

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

export const statusText = (t: OperatorTrip) =>
  t.status === 'Loading' ? 'Loading' : t.status === 'Invoiced' ? 'Invoiced' : PHASE_STYLE[phaseOf(t.status)].label;

interface Stop {
  id: string;
  stop_sequence: number;
  stop_type: string;
  location_name: string | null;
  location?: { name?: string | null; code?: string | null } | null;
  planned_arrival: string | null;
  actual_arrival: string | null;
  delay_reason?: string | null;
}

const stopsOf = (t: OperatorTrip): Stop[] => [...((t.stops ?? []) as Stop[])].sort((a, b) => a.stop_sequence - b.stop_sequence);

const isUuid = (s?: string | null) => !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s);

export function placeName(s: Stop | undefined): string {
  const raw = s?.location?.name || s?.location_name || '';
  if (!raw || isUuid(raw)) return '—';
  return raw.replace(/\[RETURN:.*?\]/gi, '').replace(/🔁\s*/g, '').split(',')[0].trim() || '—';
}

/** "Riyadh DC → Jeddah Port" with how many stops sit in between. */
export function routeOf(t: OperatorTrip): { from: string; to: string; via: number } {
  const st = stopsOf(t);
  if (st.length === 0) return { from: '—', to: '—', via: 0 };
  return { from: placeName(st[0]), to: placeName(st[st.length - 1]), via: Math.max(0, st.length - 2) };
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

/** Groups trips into day sections (newest day first for history, soonest first otherwise). */
export function groupByDay(trips: OperatorTrip[], f: TimeFmt, todayKey: string, newestFirst: boolean) {
  const map = new Map<string, OperatorTrip[]>();
  for (const t of trips) {
    const iso = tripDayIso(t);
    const key = iso ? f.dayKey(iso) : 'none';
    map.set(key, [...(map.get(key) ?? []), t]);
  }
  const keys = [...map.keys()].sort((a, b) => (newestFirst ? b.localeCompare(a) : a.localeCompare(b)));
  return keys.map((k) => ({
    key: k,
    title: k === 'none' ? 'No date' : dayLabel(k, todayKey, f),
    data: map.get(k)!.sort((a, b) => {
      const ta = new Date(tripDayIso(a) ?? 0).getTime();
      const tb = new Date(tripDayIso(b) ?? 0).getTime();
      return newestFirst ? tb - ta : ta - tb;
    }),
  }));
}

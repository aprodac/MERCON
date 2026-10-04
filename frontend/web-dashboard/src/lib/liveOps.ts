/**
 * Pure helpers behind the Live map page's operations sidebar — which tab a
 * trip belongs to, what needs attention, how the schedule is grouped by day
 * and which statuses a trip may move to. Kept out of the components so they
 * can be tested without a map.
 */
import type { LiveStop, LiveUnit } from '@/services/fleetLiveService';
import type { Trip, TripStop } from '@/services/tripService';
import { isOffline } from '@/lib/fleetLive';

export type OpsTab = 'active' | 'attention' | 'scheduled' | 'fleet' | 'done';

export const OPS_TABS: { id: OpsTab; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'attention', label: 'Attention' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'fleet', label: 'Fleet' },
  { id: 'done', label: 'Done' },
];

export const ACTIVE_STATUSES = ['Loading', 'InTransit', 'Delayed'] as const;
export const PLANNED_STATUSES = ['Scheduled', 'Draft'] as const;

export const STATUS_LABEL: Record<string, string> = {
  Draft: 'Draft',
  Scheduled: 'Scheduled',
  Loading: 'Loading',
  InTransit: 'In transit',
  Delayed: 'Delayed',
  Completed: 'Completed',
  Invoiced: 'Invoiced',
  Cancelled: 'Cancelled',
};

/**
 * Mirrors `ALLOWED_TRANSITIONS` in `backend/api-server/src/services/tripLifecycle.ts`.
 * The backend re-checks every request; this copy only keeps the menu from
 * offering moves that would bounce. Keep the two in sync.
 */
export const TRIP_TRANSITIONS: Record<string, string[]> = {
  Draft: ['Scheduled', 'Loading', 'InTransit', 'Cancelled'],
  Scheduled: ['Draft', 'Loading', 'InTransit', 'Delayed', 'Cancelled'],
  Loading: ['Draft', 'Scheduled', 'InTransit', 'Delayed', 'Cancelled'],
  InTransit: ['Draft', 'Scheduled', 'Loading', 'Delayed', 'Completed', 'Cancelled'],
  Delayed: ['Draft', 'Scheduled', 'Loading', 'InTransit', 'Completed', 'Cancelled'],
  Completed: ['Invoiced', 'InTransit', 'Loading', 'Scheduled'],
  Invoiced: ['Completed'],
  Cancelled: ['Draft', 'Scheduled'],
};

/** The order a trip normally moves forward in — the menu lists "next" moves before "back" moves. */
const FORWARD_ORDER = ['Draft', 'Scheduled', 'Loading', 'InTransit', 'Delayed', 'Completed', 'Invoiced'];

export function nextStatuses(status: string): { forward: string[]; back: string[]; cancel: boolean } {
  const allowed = TRIP_TRANSITIONS[status] ?? [];
  const here = FORWARD_ORDER.indexOf(status);
  const forward: string[] = [];
  const back: string[] = [];
  for (const s of allowed) {
    if (s === 'Cancelled' || s === 'Invoiced') continue;
    // Delayed is a side-state: from anywhere active it counts as a forward flag, not a step back.
    if (s === 'Delayed' || FORWARD_ORDER.indexOf(s) > here) forward.push(s);
    else back.push(s);
  }
  return { forward, back, cancel: allowed.includes('Cancelled') };
}

/** Wording for the confirm box of a status change that needsConfirm() flags (live map + trip page). */
export function statusChangeCopy(ref: string, from: string, to: string): { title: string; message: string; label: string; destructive: boolean } {
  if (to === 'Cancelled') {
    return {
      title: `Cancel ${ref}?`,
      message: 'The trip leaves the live board. It can be restored to Draft or Scheduled later.',
      label: 'Cancel trip',
      destructive: true,
    };
  }
  if (to === 'Completed') {
    return {
      title: `Complete ${ref}?`,
      message: 'This closes the trip and frees the driver and truck. You can add extra charges straight after.',
      label: 'Mark completed',
      destructive: false,
    };
  }
  if (to === 'Draft') {
    return {
      title: `Send ${ref} back to Draft?`,
      message: 'The driver and truck are freed for other trips.',
      label: 'Move to Draft',
      destructive: false,
    };
  }
  return {
    title: `Reopen ${ref}?`,
    message: `It moves from ${STATUS_LABEL[from] ?? from} back to ${STATUS_LABEL[to] ?? to}.`,
    label: 'Reopen',
    destructive: false,
  };
}

/** Moves that are easy to get wrong and hard to undo ask first. */
export function needsConfirm(from: string, to: string): boolean {
  return to === 'Cancelled' || to === 'Completed' || to === 'Draft' || (from === 'Completed' && to !== 'Invoiced');
}

export function isActiveTrip(t: Pick<Trip, 'status'>): boolean {
  return (ACTIVE_STATUSES as readonly string[]).includes(t.status);
}

export function isPlannedTrip(t: Pick<Trip, 'status'>): boolean {
  return (PLANNED_STATUSES as readonly string[]).includes(t.status);
}

export function driverName(t: Trip): string | null {
  if (t.driver) return `${t.driver.first_name} ${t.driver.last_name}`.trim();
  return t.subcontract?.driverName ?? t.third_party_driver_name ?? null;
}

export function driverPhone(t: Trip): string | null {
  return t.driver?.phone_primary ?? t.subcontract?.driverPhone ?? t.third_party_driver_phone ?? null;
}

export function plateOf(t: Trip): string | null {
  return t.vehicle?.plate_number ?? t.subcontract?.vehiclePlate ?? t.third_party_vehicle_plate ?? null;
}

export function isThirdParty(t: Trip): boolean {
  return !!(t.is_third_party || t.subcontract);
}

export function stopName(s: Pick<TripStop, 'location_name' | 'location_address' | 'stop_sequence'> & { location?: { name?: string | null } | null }): string {
  return s.location_name || s.location?.name || s.location_address || `Stop ${s.stop_sequence}`;
}

/** First stop without an arrival — where the truck is heading. */
export function nextStopIndex(stops: Pick<TripStop, 'actual_arrival'>[]): number | null {
  const i = stops.findIndex((s) => !s.actual_arrival);
  return i === -1 ? null : i;
}

export function stopProgress(t: Trip): { done: number; total: number } {
  const stops = t.stops ?? [];
  return { done: stops.filter((s) => !!s.actual_arrival).length, total: stops.length };
}

/** Converts a trip's stops into the live map's stop shape, for trips that have no truck on the map. */
export function toLiveStops(stops: TripStop[]): LiveStop[] {
  return stops.map((s) => ({
    id: s.id,
    sequence: s.stop_sequence,
    type: s.stop_type,
    name: s.location_name || s.location?.name || null,
    address: s.location_address ?? s.location?.address ?? null,
    lat: s.location_lat ?? null,
    lng: s.location_lng ?? null,
    planned_arrival: s.planned_arrival,
    actual_arrival: s.actual_arrival,
    actual_departure: s.actual_departure,
  }));
}

export type AttentionReason =
  | 'delayed'
  | 'late_start'
  | 'overdue_stop'
  | 'unassigned'
  | 'no_gps';

export const ATTENTION_LABEL: Record<AttentionReason, string> = {
  delayed: 'Delayed',
  late_start: 'Late to start',
  overdue_stop: 'Overdue at stop',
  unassigned: 'Needs driver/truck',
  no_gps: 'No live GPS',
};

/** How far ahead an unassigned trip counts as urgent. */
export const UNASSIGNED_WINDOW_H = 24;

/**
 * Why a trip needs an operator now. Empty when it's fine. `unit` is the
 * trip's truck/driver on the live map, when there is one.
 */
export function attentionReasons(t: Trip, unit: LiveUnit | null, now = Date.now()): AttentionReason[] {
  const out: AttentionReason[] = [];
  const active = isActiveTrip(t);
  if (t.status === 'Delayed' || unit?.trip?.phase === 'delayed') out.push('delayed');
  const start = t.planned_start ? new Date(t.planned_start).getTime() : null;
  if (t.status === 'Scheduled' && start != null && start < now) out.push('late_start');
  if (active) {
    const i = nextStopIndex(t.stops ?? []);
    const s = i == null ? null : t.stops![i];
    if (s?.planned_arrival && new Date(s.planned_arrival).getTime() < now) out.push('overdue_stop');
  }
  const soon = start == null || start - now < UNASSIGNED_WINDOW_H * 3600_000;
  if ((active || (t.status === 'Scheduled' && soon)) && !isThirdParty(t) && (!t.driver || !t.vehicle)) out.push('unassigned');
  if (active && !isThirdParty(t) && (!unit || !unit.position || isOffline(unit))) out.push('no_gps');
  return out;
}

/** Minutes between now and a planned time — positive when it has already passed. */
export function minutesPast(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  return Math.round((now - new Date(iso).getTime()) / 60000);
}

export function formatMinutes(mins: number): string {
  const m = Math.abs(mins);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export interface ScheduleGroup {
  key: string;
  label: string;
  tone: 'bad' | 'normal' | 'muted';
  trips: Trip[];
}

/**
 * Groups upcoming trips for the Scheduled tab: late to start first, then one
 * group per day (Today, Tomorrow, then dated), drafts last. `dayKey` turns an
 * instant into a yyyy-MM-dd day in the deployment's timezone.
 */
export function groupSchedule(
  trips: Trip[],
  dayKey: (d: Date) => string,
  dayLabel: (key: string) => string,
  now = Date.now(),
): ScheduleGroup[] {
  const today = dayKey(new Date(now));
  const tomorrow = dayKey(new Date(now + 86_400_000));
  const late: Trip[] = [];
  const drafts: Trip[] = [];
  const unscheduled: Trip[] = [];
  const byDay = new Map<string, Trip[]>();
  const sorted = [...trips].sort((a, b) => startMs(a) - startMs(b));
  for (const t of sorted) {
    if (t.status === 'Draft') { drafts.push(t); continue; }
    if (!t.planned_start) { unscheduled.push(t); continue; }
    if (new Date(t.planned_start).getTime() < now) { late.push(t); continue; }
    const k = dayKey(new Date(t.planned_start));
    byDay.set(k, [...(byDay.get(k) ?? []), t]);
  }
  const groups: ScheduleGroup[] = [];
  if (late.length) groups.push({ key: 'late', label: 'Late to start', tone: 'bad', trips: late });
  for (const [k, list] of [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const label = k === today ? 'Today' : k === tomorrow ? 'Tomorrow' : dayLabel(k);
    groups.push({ key: k, label, tone: 'normal', trips: list });
  }
  if (unscheduled.length) groups.push({ key: 'no-date', label: 'No start time', tone: 'muted', trips: unscheduled });
  if (drafts.length) groups.push({ key: 'drafts', label: 'Drafts', tone: 'muted', trips: drafts });
  return groups;
}

function startMs(t: Trip): number {
  return t.planned_start ? new Date(t.planned_start).getTime() : Number.MAX_SAFE_INTEGER;
}

/** Active tab order: delayed first, then whoever is due at their next stop soonest. */
export function sortActive(trips: Trip[]): Trip[] {
  const rank = (t: Trip) => (t.status === 'Delayed' ? 0 : 1);
  const due = (t: Trip) => {
    const i = nextStopIndex(t.stops ?? []);
    const p = i == null ? null : t.stops![i].planned_arrival;
    return p ? new Date(p).getTime() : Number.MAX_SAFE_INTEGER;
  };
  return [...trips].sort((a, b) => rank(a) - rank(b) || due(a) - due(b));
}

export function matchesTripQuery(t: Trip, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const hay = [
    t.ref_id, t.customer?.name, driverName(t), plateOf(t), t.awb_number,
    ...(t.stops ?? []).map((st) => stopName(st)),
  ];
  return s.split(/\s+/).every((word) => hay.some((v) => v?.toLowerCase().includes(word)));
}

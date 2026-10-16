/**
 * Round trips: when round 1 ended, when round 2 started, and the break in
 * between — for the "Round 1 completed" page and the trip summary.
 *
 * The server has stop arrival / departure times but no "round 2 started"
 * moment (the driver may rest before tapping Start Round 2), so the two
 * moments the driver creates are kept on the phone per trip. Stop times from
 * the server are the fallback, so a reinstall still shows a sensible summary.
 */
import { safeSecureStore as SecureStore } from '@mercon/mobile-shared/lib/secure-store';
import { getLegEndpoints, type MobileTrip, type TripStop } from '@mercon/mobile-shared/lib/trips';

const round1DoneKey = (tripId: string) => `round1_done_at_${tripId}`;
const round2StartKey = (tripId: string) => `round2_started_at_${tripId}`;

/** Kept in memory too, so a failed SecureStore write can't send the driver round in a loop. */
const memo = new Map<string, string>();

async function read(key: string): Promise<string | null> {
  if (memo.has(key)) return memo.get(key)!;
  const v = await SecureStore.getItemAsync(key).catch(() => null);
  if (v) memo.set(key, v);
  return v;
}

async function write(key: string, iso: string): Promise<void> {
  memo.set(key, iso);
  await SecureStore.setItemAsync(key, iso).catch(() => {});
}

export const roundTimes = {
  /** Called once when the round 1 delivery is confirmed. Keeps the first time if already set. */
  async markRound1Done(tripId: string, at = new Date()): Promise<void> {
    if (await read(round1DoneKey(tripId))) return;
    await write(round1DoneKey(tripId), at.toISOString());
  },
  /** Called when the driver taps Start Round 2. */
  async markRound2Started(tripId: string, at = new Date()): Promise<void> {
    if (await read(round2StartKey(tripId))) return;
    await write(round2StartKey(tripId), at.toISOString());
  },
  async get(tripId: string): Promise<{ round1DoneAt: string | null; round2StartedAt: string | null }> {
    const [round1DoneAt, round2StartedAt] = await Promise.all([read(round1DoneKey(tripId)), read(round2StartKey(tripId))]);
    return { round1DoneAt, round2StartedAt };
  },
};

export interface RoundStep {
  key: string;
  /** English label; screens translate with `labelKey`. */
  label: string;
  labelKey: string;
  /** Stop name for stop steps. */
  place?: string | null;
  at: string | null;
}

export interface RoundSummary {
  steps: RoundStep[];
  start: string | null;
  end: string | null;
  /** Minutes from start to end, or null when either is unknown. */
  minutes: number | null;
}

export interface RoundTripSummary {
  round1: RoundSummary;
  round2: RoundSummary;
  /** Break between the rounds (round 1 end → round 2 start). */
  breakStart: string | null;
  breakEnd: string | null;
  breakMinutes: number | null;
}

export function minutesBetween(a?: string | null, b?: string | null): number | null {
  if (!a || !b) return null;
  const m = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);
  return Number.isFinite(m) && m >= 0 ? m : null;
}

/** "1 h 20 min", "45 min", "0 min". */
export function formatMinutes(mins: number | null | undefined, ur = false): string {
  if (mins == null) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (ur) return h > 0 ? `${h} گھنٹے ${m} منٹ` : `${m} منٹ`;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

/** "14:05", or "12 Oct 14:05" when not today. */
export function formatClock(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (d.toDateString() === new Date().toDateString()) return time;
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${time}`;
}

function earliest(values: (string | null | undefined)[]): string | null {
  const times = values.filter((v): v is string => !!v && !Number.isNaN(new Date(v).getTime()));
  if (times.length === 0) return null;
  return times.reduce((a, b) => (new Date(b).getTime() < new Date(a).getTime() ? b : a));
}

const placeOf = (s: TripStop | null | undefined) =>
  s?.location?.name || s?.location_name || null;

function legSteps(trip: MobileTrip, leg: 0 | 1, start: string | null, end: string | null): RoundStep[] {
  const { loading, delivery, intermediates } = getLegEndpoints(trip, leg);
  const steps: RoundStep[] = [];
  steps.push({ key: `l${leg}-start`, label: leg === 0 ? 'Trip started' : 'Round 2 started', labelKey: leg === 0 ? 'round_step_trip_started' : 'round_step_round2_started', at: start });
  steps.push({ key: `l${leg}-arr-load`, label: 'Arrived at loading', labelKey: 'round_step_arrived_loading', place: placeOf(loading), at: loading?.actual_arrival ?? null });
  steps.push({ key: `l${leg}-dep-load`, label: 'Loading done', labelKey: 'round_step_loading_done', place: placeOf(loading), at: loading?.actual_departure ?? null });
  intermediates.forEach((s, i) => {
    steps.push({ key: `l${leg}-stop-${s.id ?? i}`, label: 'Stop', labelKey: 'round_step_stop', place: placeOf(s), at: s.actual_departure ?? s.actual_arrival ?? null });
  });
  steps.push({ key: `l${leg}-arr-del`, label: 'Arrived at delivery', labelKey: 'round_step_arrived_delivery', place: placeOf(delivery), at: delivery?.actual_arrival ?? null });
  steps.push({ key: `l${leg}-done`, label: 'Delivered', labelKey: 'round_step_delivered', place: placeOf(delivery), at: end });
  return steps;
}

/** Everything the round pages show, from the trip's stop times plus the two moments kept on the phone. */
export function buildRoundTripSummary(
  trip: MobileTrip,
  local: { round1DoneAt: string | null; round2StartedAt: string | null },
): RoundTripSummary {
  const out = getLegEndpoints(trip, 0);
  const ret = getLegEndpoints(trip, 1);

  // Earliest known moment: "Trip started" must never come after "Arrived at loading".
  const r1Start = earliest([trip.actual_start, (trip as any).actual_pickup, out.loading?.actual_arrival]);
  const r1End = local.round1DoneAt ?? out.delivery?.actual_departure ?? out.delivery?.actual_arrival ?? null;
  const r2Start = local.round2StartedAt ?? ret.loading?.actual_arrival ?? null;
  const r2End = trip.actual_end ?? ret.delivery?.actual_departure ?? null;

  return {
    round1: { steps: legSteps(trip, 0, r1Start, r1End), start: r1Start, end: r1End, minutes: minutesBetween(r1Start, r1End) },
    round2: { steps: legSteps(trip, 1, r2Start, r2End), start: r2Start, end: r2End, minutes: minutesBetween(r2Start, r2End) },
    breakStart: r1End,
    breakEnd: r2Start,
    breakMinutes: minutesBetween(r1End, r2Start),
  };
}

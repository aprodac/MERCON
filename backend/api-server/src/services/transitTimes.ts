import { TripStatus } from '@prisma/client';
import { normalizeTruckClass, truckClassOfVehicle } from '@mercon/shared-types';
import { prisma } from '../db';

/**
 * Transit times: how long a customer's routes really take against what Create
 * trip planned. "Actual" is read from finished trips' stop times — the loading
 * stop's departure to the drop-off's arrival, leg by leg. "Planned" is the saved
 * route time (Transit times → "Use … as the planned time", CustomerRouteTransit)
 * when there is one, else what the finished trips themselves were planned at
 * (their drop-off planned arrival minus the loading planned time) — which is
 * what Create trip suggested when they were booked.
 */

/** Actual may run this long past planned and still count as on time (green). */
export const GRACE_MIN = 15;
/** Up to this far past planned is amber; beyond it red. */
export const AMBER_MIN = 60;
/** "Use actual as planned" needs at least this many trips behind the average. */
export const MIN_TRIPS_TO_USE_ACTUAL = 3;
export const PERIODS = [7, 30, 90] as const;

export type Leg = 'out' | 'return';
export type Tone = 'green' | 'amber' | 'red';

export interface StopFacts {
  stop_sequence: number;
  leg_index: number | null;
  location_name: string | null;
  location?: { name: string | null } | null;
  planned_arrival: Date | null;
  actual_arrival: Date | null;
  actual_departure: Date | null;
}

export interface TripFacts {
  id: string;
  ref_id: string | null;
  vehicle_type: string | null;
  vehicle?: { capacity_kg: number | null; asset_type: string | null } | null;
  planned_start: Date | null;
  planned_end: Date | null;
  actual_start: Date | null;
  actual_end: Date | null;
  stops: StopFacts[];
}

/** One finished leg of one trip, with the times that matter. */
export interface LegSample {
  tripId: string;
  ref: string | null;
  leg: Leg;
  from: string;
  to: string;
  size: string;
  /** When the truck left the loading stop. */
  departedAt: Date;
  /** Loading departure → offload arrival, minutes. */
  actualMin: number;
  /** Planned loading → planned drop-off, minutes, when both were planned. */
  plannedMin: number | null;
  /** Arrival → departure at the loading stop. */
  loadingDwellMin: number | null;
  /** Arrival → departure at the drop-off, where recorded. */
  offloadDwellMin: number | null;
}

export type SkipReason = 'missing' | 'out_of_order' | 'stamped';
export interface SkipCounts { missing: number; out_of_order: number; stamped: number; total: number }

const MIN = 60_000;
const minutesBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / MIN);

/** Lower-cased, single-spaced place name — the key a route is grouped by. */
export const placeKey = (name: string | null | undefined) => (name ?? '').trim().toLowerCase().replace(/[\s|]+/g, ' ');

export const routeKeyOf = (leg: Leg, fromKey: string, toKey: string, size: string) => `${leg}|${fromKey}|${toKey}|${size}`;

/**
 * A saved time for every truck size of a route (owner, TestFlight 28 Oct: "every vehicle type
 * 5, 10, 40 ft have same TT"). Stored as the truck class; a size's own saved time still wins.
 */
export const ANY_SIZE = 'ANY';
/** The same route and leg with the size swapped for ANY_SIZE. */
export const anySizeKey = (key: string) => key.split('|').slice(0, 3).concat(ANY_SIZE).join('|');
/** A saved time for a route key: that size's own, else the all-sizes one. */
export const savedFor = (saved: Map<string, number>, key: string): number | undefined => saved.get(key) ?? saved.get(anySizeKey(key));

const stopName = (s: StopFacts) => (s.location_name || s.location?.name || '').trim();

export function sizeOf(trip: Pick<TripFacts, 'vehicle_type' | 'vehicle'>): string {
  if (trip.vehicle_type?.trim()) return normalizeTruckClass(trip.vehicle_type);
  if (trip.vehicle) return truckClassOfVehicle({ capacity_kg: trip.vehicle.capacity_kg, asset_type: trip.vehicle.asset_type });
  return 'Other';
}

/**
 * The usable legs of a finished trip, or why it was left out. A trip created
 * as already Completed carries its planned times as "actual" (no dwell, every
 * stop exactly on plan) — that says nothing about the road, so it is skipped,
 * as is any trip whose times are missing or in the wrong order.
 */
export function legSamplesOf(trip: TripFacts): { samples: LegSample[]; skipped: SkipReason | null } {
  const stops = [...trip.stops].sort((a, b) => a.stop_sequence - b.stop_sequence);
  const size = sizeOf(trip);
  const samples: LegSample[] = [];
  let reason: SkipReason | null = null;

  for (const leg of [0, 1]) {
    const legStops = stops.filter((s) => (s.leg_index ?? 0) === leg);
    if (legStops.length < 2) continue;
    const load = legStops[0];
    const drop = legStops[legStops.length - 1];
    const from = stopName(load);
    const to = stopName(drop);
    if (!from || !to || !load.actual_departure || !drop.actual_arrival) { reason ??= 'missing'; continue; }
    if (drop.actual_arrival <= load.actual_departure || (load.actual_arrival && load.actual_arrival > load.actual_departure)
      || (drop.actual_departure && drop.actual_departure < drop.actual_arrival)) { reason ??= 'out_of_order'; continue; }
    const stamped = load.actual_arrival != null
      && +load.actual_arrival === +load.actual_departure
      && load.planned_arrival != null && +load.actual_departure === +load.planned_arrival
      && drop.planned_arrival != null && +drop.actual_arrival === +drop.planned_arrival
      && (drop.actual_departure == null || +drop.actual_departure === +drop.actual_arrival);
    if (stamped) { reason ??= 'stamped'; continue; }
    const loadPlanned = load.planned_arrival ?? (leg === 0 ? trip.planned_start : null);
    const plannedMin = loadPlanned && drop.planned_arrival && drop.planned_arrival > loadPlanned ? minutesBetween(loadPlanned, drop.planned_arrival) : null;
    samples.push({
      tripId: trip.id,
      ref: trip.ref_id,
      leg: leg === 0 ? 'out' : 'return',
      from,
      to,
      size,
      departedAt: load.actual_departure,
      actualMin: minutesBetween(load.actual_departure, drop.actual_arrival),
      plannedMin,
      loadingDwellMin: load.actual_arrival ? minutesBetween(load.actual_arrival, load.actual_departure) : null,
      offloadDwellMin: drop.actual_departure ? minutesBetween(drop.actual_arrival, drop.actual_departure) : null,
    });
  }
  return { samples, skipped: samples.length ? null : reason ?? 'missing' };
}

const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

/** Nearest-rank percentile ("the slowest 1 in 10" is p90). */
export function percentile(xs: number[], p: number): number | null {
  if (!xs.length) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

/** Green within the grace, amber up to an hour over, red beyond. Null with no planned time. */
export function toneOf(actualMin: number | null, plannedMin: number | null): Tone | null {
  if (actualMin == null || plannedMin == null) return null;
  const over = actualMin - plannedMin;
  return over <= GRACE_MIN ? 'green' : over <= AMBER_MIN ? 'amber' : 'red';
}

export interface SavedTransit { origin_key: string; destination_key: string; leg: string; truck_class: string; planned_minutes: number }

export interface RouteRow {
  key: string;
  leg: Leg;
  from: string;
  to: string;
  size: string;
  trips: number;
  plannedMin: number | null;
  /** True when plannedMin is the saved route time rather than what the trips were planned at. */
  plannedSaved: boolean;
  actualAvgMin: number | null;
  tone: Tone | null;
}

export interface TransitSummary {
  days: number;
  size: string | null;
  sizes: string[];
  kpis: { routes: number; onTimePct: number | null; avgLateMin: number | null };
  routes: RouteRow[];
  skipped: SkipCounts;
}

interface Group { leg: Leg; from: string; to: string; size: string; samples: LegSample[] }

function groupSamples(samples: LegSample[]) {
  const groups = new Map<string, Group>();
  for (const s of samples) {
    const key = routeKeyOf(s.leg, placeKey(s.from), placeKey(s.to), s.size);
    const g = groups.get(key) ?? { leg: s.leg, from: s.from, to: s.to, size: s.size, samples: [] };
    g.samples.push(s);
    groups.set(key, g);
  }
  return groups;
}

/** The planned time of a group: the saved one, else the average the trips were planned at. */
function plannedOf(key: string, g: Group, saved: Map<string, number>) {
  const s = savedFor(saved, key);
  if (s != null) return { min: s, saved: true };
  return { min: mean(g.samples.map((x) => x.plannedMin).filter((x): x is number => x != null)), saved: false };
}

const savedMap = (saved: SavedTransit[]) =>
  new Map(saved.map((r) => [routeKeyOf(r.leg === 'return' ? 'return' : 'out', r.origin_key, r.destination_key, r.truck_class), r.planned_minutes]));

export function summarize(
  samples: LegSample[],
  saved: SavedTransit[],
  opts: { days: number; size: string | null; now?: Date; skipped?: SkipCounts },
): TransitSummary {
  const since = (opts.now ?? new Date()).getTime() - opts.days * 86_400_000;
  const inPeriod = samples.filter((s) => s.departedAt.getTime() >= since);
  const sizes = [...new Set(inPeriod.map((s) => s.size))];
  const wanted = inPeriod.filter((s) => !opts.size || s.size === opts.size);
  const groups = groupSamples(wanted);
  const savedByKey = savedMap(saved);

  const routes: RouteRow[] = [];
  let onTime = 0, judged = 0;
  const late: number[] = [];
  for (const [key, g] of groups) {
    const planned = plannedOf(key, g, savedByKey);
    const actual = mean(g.samples.map((s) => s.actualMin));
    if (planned.min != null) {
      for (const s of g.samples) {
        judged++;
        const over = s.actualMin - planned.min;
        if (over <= GRACE_MIN) onTime++; else late.push(over);
      }
    }
    routes.push({ key, leg: g.leg, from: g.from, to: g.to, size: g.size, trips: g.samples.length, plannedMin: planned.min, plannedSaved: planned.saved, actualAvgMin: actual, tone: toneOf(actual, planned.min) });
  }
  // Saved routes nobody drove in this period still get a row, "no trips yet". An all-sizes time
  // shows once, and not at all when the route was driven in any size.
  const driven = new Set([...groups.keys()].map((k) => k.split('|').slice(0, 3).join('|')));
  for (const r of saved) {
    const leg: Leg = r.leg === 'return' ? 'return' : 'out';
    const key = routeKeyOf(leg, r.origin_key, r.destination_key, r.truck_class);
    const any = r.truck_class === ANY_SIZE;
    if (any ? driven.has(key.split('|').slice(0, 3).join('|')) : groups.has(key)) continue;
    if (!any && opts.size && r.truck_class !== opts.size) continue;
    routes.push({ key, leg, from: r.origin_key, to: r.destination_key, size: r.truck_class, trips: 0, plannedMin: r.planned_minutes, plannedSaved: true, actualAvgMin: null, tone: null });
  }
  routes.sort((a, b) => b.trips - a.trips || a.from.localeCompare(b.from) || a.to.localeCompare(b.to));

  return {
    days: opts.days,
    size: opts.size,
    sizes,
    kpis: { routes: routes.length, onTimePct: judged ? Math.round((onTime / judged) * 100) : null, avgLateMin: mean(late) },
    routes,
    skipped: opts.skipped ?? { missing: 0, out_of_order: 0, stamped: 0, total: 0 },
  };
}

export type DwellKey = 'loading' | 'road' | 'offload';

export interface RouteDetail {
  key: string;
  leg: Leg;
  from: string;
  to: string;
  size: string;
  days: number;
  trips: number;
  plannedMin: number | null;
  plannedSaved: boolean;
  actualAvgMin: number | null;
  /** The slowest 1 in 10 trips. */
  p90Min: number | null;
  tone: Tone | null;
  /** Where the average trip's time goes; a part nobody recorded is null. */
  time: { loadingMin: number | null; roadMin: number | null; offloadMin: number | null; biggest: DwellKey | null };
  /** "Use actual as the planned time" is offered. */
  canUseActual: boolean;
  /** The actual average rounded to 5 minutes — what "use actual" would plan. */
  suggestedMin: number | null;
  recent: Array<{ tripId: string; ref: string | null; departedAt: string; actualMin: number; plannedMin: number | null }>;
}

export const roundTo5 = (min: number) => Math.round(min / 5) * 5;

export function routeDetail(
  samples: LegSample[],
  saved: SavedTransit[],
  key: string,
  opts: { days: number; now?: Date },
): RouteDetail | null {
  const since = (opts.now ?? new Date()).getTime() - opts.days * 86_400_000;
  const g = groupSamples(samples.filter((s) => s.departedAt.getTime() >= since)).get(key);
  const savedByKey = savedMap(saved);
  if (!g) {
    const [leg, from, to, size] = key.split('|');
    const m = savedFor(savedByKey, key);
    if (m == null) return null;
    return { key, leg: leg === 'return' ? 'return' : 'out', from, to, size, days: opts.days, trips: 0, plannedMin: m, plannedSaved: true, actualAvgMin: null, p90Min: null, tone: null, time: { loadingMin: null, roadMin: null, offloadMin: null, biggest: null }, canUseActual: false, suggestedMin: null, recent: [] };
  }
  const planned = plannedOf(key, g, savedByKey);
  const actual = mean(g.samples.map((s) => s.actualMin));
  const loadingMin = mean(g.samples.map((s) => s.loadingDwellMin).filter((x): x is number => x != null));
  const offloadMin = mean(g.samples.map((s) => s.offloadDwellMin).filter((x): x is number => x != null));
  const parts: Array<[DwellKey, number | null]> = [['loading', loadingMin], ['road', actual], ['offload', offloadMin]];
  const biggest = parts.filter((p): p is [DwellKey, number] => p[1] != null).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const suggested = actual != null ? roundTo5(actual) : null;
  return {
    key, leg: g.leg, from: g.from, to: g.to, size: g.size, days: opts.days,
    trips: g.samples.length,
    plannedMin: planned.min,
    plannedSaved: planned.saved,
    actualAvgMin: actual,
    p90Min: percentile(g.samples.map((s) => s.actualMin), 90),
    tone: toneOf(actual, planned.min),
    time: { loadingMin, roadMin: actual, offloadMin, biggest },
    canUseActual: g.samples.length >= MIN_TRIPS_TO_USE_ACTUAL && suggested != null && Math.abs(suggested - (planned.min ?? 0)) > GRACE_MIN,
    suggestedMin: suggested,
    recent: [...g.samples].sort((a, b) => b.departedAt.getTime() - a.departedAt.getTime()).slice(0, 10)
      .map((s) => ({ tripId: s.tripId, ref: s.ref, departedAt: s.departedAt.toISOString(), actualMin: s.actualMin, plannedMin: s.plannedMin })),
  };
}

/** Samples for a customer's finished trips, plus how many trips were left out and why. */
export function samplesOfTrips(trips: TripFacts[]): { samples: LegSample[]; skipped: SkipCounts } {
  const skipped: SkipCounts = { missing: 0, out_of_order: 0, stamped: 0, total: 0 };
  const samples: LegSample[] = [];
  for (const t of trips) {
    const r = legSamplesOf(t);
    samples.push(...r.samples);
    if (r.skipped) { skipped[r.skipped]++; skipped.total++; }
  }
  return { samples, skipped };
}

/** "Planned" for new trips: leg times a customer's trips should be planned with. */
export const FINISHED: TripStatus[] = [TripStatus.Completed, TripStatus.Invoiced];

export async function loadCustomerSamples(customerId: string, days: number, now = new Date()) {
  // A trip's loading departure can lag its planned start by a day or two.
  const from = new Date(now.getTime() - (days + 3) * 86_400_000);
  const trips = await prisma.trip.findMany({
    where: { customerId, deletedAt: null, status: { in: FINISHED }, planned_start: { gte: from } },
    select: {
      id: true, ref_id: true, vehicle_type: true, planned_start: true, planned_end: true, actual_start: true, actual_end: true,
      vehicle: { select: { capacity_kg: true, asset_type: true } },
      stops: {
        where: { deletedAt: null },
        select: { stop_sequence: true, leg_index: true, location_name: true, location: { select: { name: true } }, planned_arrival: true, actual_arrival: true, actual_departure: true },
      },
    },
  });
  return samplesOfTrips(trips as unknown as TripFacts[]);
}

export const loadSavedTransits = (customerId: string): Promise<SavedTransit[]> =>
  prisma.customerRouteTransit.findMany({ where: { customerId }, select: { origin_key: true, destination_key: true, leg: true, truck_class: true, planned_minutes: true } });

export async function transitSummary(customerId: string, opts: { days: number; size: string | null }) {
  const [{ samples, skipped }, saved] = await Promise.all([loadCustomerSamples(customerId, opts.days), loadSavedTransits(customerId)]);
  return summarize(samples, saved, { ...opts, skipped });
}

export async function transitRouteDetail(customerId: string, key: string, days: number) {
  const [{ samples }, saved] = await Promise.all([loadCustomerSamples(customerId, days), loadSavedTransits(customerId)]);
  return routeDetail(samples, saved, key, { days });
}

/** The minimal slice of the database setPlannedTransit needs — a fake in tests. */
export interface TransitStore {
  customerRouteTransit: { upsert(args: any): Promise<unknown>; deleteMany?(args: any): Promise<unknown> };
}

/**
 * Saves the planned time for new trips of one route and truck class. Only the
 * saved route time is written — trips that already exist keep their own planned times.
 */
export async function setPlannedTransit(
  store: TransitStore,
  input: { customerId: string; key: string; plannedMin: number; userId?: string | null },
) {
  const [leg, origin_key, destination_key, truck_class] = input.key.split('|');
  if (!origin_key || !destination_key || !truck_class || (leg !== 'out' && leg !== 'return')) throw new Error('INVALID_ROUTE_KEY');
  const planned_minutes = Math.round(input.plannedMin);
  if (!Number.isFinite(planned_minutes) || planned_minutes < 5 || planned_minutes > 7 * 1440) throw new Error('INVALID_MINUTES');
  const where = { customerId_origin_key_destination_key_leg_truck_class: { customerId: input.customerId, origin_key, destination_key, leg, truck_class } };
  // One time for every size: the sizes' own times go, so nothing overrides it.
  if (truck_class === ANY_SIZE) {
    await store.customerRouteTransit.deleteMany?.({ where: { customerId: input.customerId, origin_key, destination_key, leg, truck_class: { not: ANY_SIZE } } });
  }
  await store.customerRouteTransit.upsert({
    where,
    create: { customerId: input.customerId, origin_key, destination_key, leg, truck_class, planned_minutes, updated_by: input.userId ?? null },
    update: { planned_minutes, updated_by: input.userId ?? null },
  });
  return { key: input.key, plannedMin: planned_minutes };
}

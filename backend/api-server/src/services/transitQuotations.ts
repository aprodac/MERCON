import { normalizeLineTypeToken, normalizeTruckClass } from '@mercon/shared-types';
import { prisma } from '../db';
import { getDrivingRouteThrough, MAX_ROUTE_POINTS, type GeoPoint } from './routing/routeProvider';
import { loadCustomerSamples, loadSavedTransits, placeKey, routeKeyOf, type Leg, type LegSample, type SavedTransit } from './transitTimes';

/**
 * Transit times per quotation line: for each leg of each of the customer's
 * active quotations, the time Create trip would estimate (road route, plus
 * the stop time it adds at stops in between; a 10 / 12 hour duty line plans
 * its duty length), the time saved for that route if someone set one, and
 * what the finished trips actually took.
 */

/** Same as the operator app's routeEstimate: time spent at a stop in between. */
export const STOP_DWELL_MIN = 30;
const ROAD_FACTOR = 1.22;
const TRUCK_KPH = 80;

export interface QuotationLegRow {
  key: string;
  leg: Leg;
  from: string;
  to: string;
  via: number;
  size: string;
  /** What Create trip would plan without a saved time; null when the places can't be located. */
  estimatedMin: number | null;
  estimateSource: 'road' | 'approx' | 'duty' | null;
  savedMin: number | null;
  actualAvgMin: number | null;
  trips: number;
}

export interface QuotationTransit {
  quotationId: string;
  number: number | null;
  name: string;
  lineType: string | null;
  size: string;
  legs: QuotationLegRow[];
}

interface QStop { sequence: number; leg_index: number; source_label: string | null; location: { name: string; lat: number | null; lng: number | null } | null }

export const dutyMinutesOf = (lineType: string | null | undefined) => {
  const t = normalizeLineTypeToken(lineType ?? '');
  return t === '10_HRS' ? 600 : t === '12_HRS' ? 720 : null;
};

/** Straight line × road factor at truck speed — the fallback when the road router can't answer. */
export function approxMinutes(points: GeoPoint[]): number {
  let km = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const r = Math.PI / 180;
    const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
    km += 2 * 6371 * Math.asin(Math.sqrt(h)) * ROAD_FACTOR;
  }
  return Math.round((km / TRUCK_KPH) * 60);
}

const cache = new Map<string, { min: number; source: 'road' | 'approx' }>();

async function driveMinutes(points: GeoPoint[]): Promise<{ min: number; source: 'road' | 'approx' }> {
  const k = points.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join(';');
  const hit = cache.get(k);
  if (hit) return hit;
  let out: { min: number; source: 'road' | 'approx' };
  try {
    const r = await getDrivingRouteThrough(points.slice(0, MAX_ROUTE_POINTS));
    out = { min: Math.round(r.durationSeconds / 60), source: 'road' };
  } catch {
    out = { min: approxMinutes(points), source: 'approx' };
  }
  cache.set(k, out);
  return out;
}

/** The legs of a quotation, in order: way there, and the way back of a round trip. */
export function quotationLegs(stops: QStop[]) {
  const sorted = [...stops].sort((a, b) => a.sequence - b.sequence);
  const legs: Array<{ leg: Leg; stops: QStop[] }> = [];
  for (const i of [0, 1]) {
    const s = sorted.filter((x) => (x.leg_index ?? 0) === i);
    if (s.length >= 2) legs.push({ leg: i === 0 ? 'out' : 'return', stops: s });
  }
  return legs;
}

const nameOf = (s: QStop) => (s.location?.name || s.source_label || '').trim();

export function legStats(samples: LegSample[], key: string) {
  const mine = samples.filter((s) => routeKeyOf(s.leg, placeKey(s.from), placeKey(s.to), s.size) === key);
  return { trips: mine.length, avg: mine.length ? Math.round(mine.reduce((a, s) => a + s.actualMin, 0) / mine.length) : null };
}

export async function quotationTransits(customerId: string, days = 90): Promise<QuotationTransit[]> {
  const [quotes, saved, { samples }] = await Promise.all([
    prisma.quotation.findMany({
      where: { customerId, deletedAt: null, is_active: true },
      select: {
        id: true, quotation_number: true, name: true, line_type: true, vehicle_class: true, source_vehicle_label: true,
        stops: { select: { sequence: true, leg_index: true, source_label: true, location: { select: { name: true, lat: true, lng: true } } } },
      },
      orderBy: [{ quotation_number: 'asc' }],
    }),
    loadSavedTransits(customerId),
    loadCustomerSamples(customerId, days),
  ]);
  const savedBy = new Map(saved.map((r: SavedTransit) => [routeKeyOf(r.leg === 'return' ? 'return' : 'out', r.origin_key, r.destination_key, r.truck_class), r.planned_minutes]));

  const out: QuotationTransit[] = [];
  for (const q of quotes) {
    const size = normalizeTruckClass(q.vehicle_class || q.source_vehicle_label);
    const duty = dutyMinutesOf(q.line_type);
    const legs: QuotationLegRow[] = [];
    for (const l of quotationLegs(q.stops as QStop[])) {
      const from = nameOf(l.stops[0]);
      const to = nameOf(l.stops[l.stops.length - 1]);
      if (!from || !to) continue;
      const key = routeKeyOf(l.leg, placeKey(from), placeKey(to), size);
      const pts = l.stops.map((s) => s.location).filter((p): p is { name: string; lat: number; lng: number } => p?.lat != null && p?.lng != null && !(p.lat === 0 && p.lng === 0));
      let estimatedMin: number | null = null;
      let estimateSource: QuotationLegRow['estimateSource'] = null;
      if (duty && l.leg === 'out') {
        estimatedMin = duty;
        estimateSource = 'duty';
      } else if (pts.length === l.stops.length) {
        const d = await driveMinutes(pts);
        estimatedMin = d.min + STOP_DWELL_MIN * Math.max(0, l.stops.length - 2);
        estimateSource = d.source;
      }
      const st = legStats(samples, key);
      legs.push({ key, leg: l.leg, from, to, via: Math.max(0, l.stops.length - 2), size, estimatedMin, estimateSource, savedMin: savedBy.get(key) ?? null, actualAvgMin: st.avg, trips: st.trips });
    }
    if (legs.length) out.push({ quotationId: q.id, number: q.quotation_number, name: q.name, lineType: q.line_type, size, legs });
  }
  return out;
}

/** Back to the estimate: removes the saved time of one route and size. */
export async function clearPlannedTransit(customerId: string, key: string) {
  const [leg, origin_key, destination_key, truck_class] = key.split('|');
  if (!origin_key || !destination_key || !truck_class || (leg !== 'out' && leg !== 'return')) throw new Error('INVALID_ROUTE_KEY');
  const r = await prisma.customerRouteTransit.deleteMany({ where: { customerId, origin_key, destination_key, leg, truck_class } });
  return { removed: r.count };
}

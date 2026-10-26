import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  legSamplesOf, summarize, routeDetail, percentile, toneOf, setPlannedTransit, samplesOfTrips, routeKeyOf, placeKey,
  type TripFacts, type StopFacts, type LegSample, type SavedTransit,
} from '../services/transitTimes';

const at = (h: number, m = 0, day = 20) => new Date(Date.UTC(2026, 9, day, h, m));
const stop = (seq: number, leg: number, name: string, p: Partial<StopFacts> = {}): StopFacts => ({
  stop_sequence: seq, leg_index: leg, location_name: name, planned_arrival: null, actual_arrival: null, actual_departure: null, ...p,
});

/** A finished one-way trip: load 08:00 (arrive 07:30), drop `driveMin` later, offload dwell 30. */
function trip(id: string, driveMin: number, o: { plannedMin?: number; day?: number; type?: string } = {}): TripFacts {
  const day = o.day ?? 25;
  const dep = at(8, 0, day);
  const arr = new Date(dep.getTime() + driveMin * 60_000);
  return {
    id, ref_id: `TRP-${id}`, vehicle_type: o.type ?? '5 TON', planned_start: at(8, 0, day), planned_end: null, actual_start: dep, actual_end: arr,
    stops: [
      stop(1, 0, 'Khamis', { planned_arrival: at(8, 0, day), actual_arrival: at(7, 30, day), actual_departure: dep }),
      stop(2, 0, 'Najran', { planned_arrival: new Date(at(8, 0, day).getTime() + (o.plannedMin ?? 180) * 60_000), actual_arrival: arr, actual_departure: new Date(arr.getTime() + 30 * 60_000) }),
    ],
  };
}
const samples = (...t: TripFacts[]) => samplesOfTrips(t);
const NOW = at(12, 0, 27);

describe('transit times: reading finished trips', () => {
  it('measures loading departure → offload arrival, with the dwells either side', () => {
    const [s] = legSamplesOf(trip('a', 195)).samples;
    assert.equal(s.actualMin, 195);
    assert.equal(s.plannedMin, 180);
    assert.equal(s.loadingDwellMin, 30);
    assert.equal(s.offloadDwellMin, 30);
    assert.equal(s.size, '5 TON');
    assert.equal(s.leg, 'out');
  });

  it('reads each leg of a round trip on its own', () => {
    const t = trip('r', 180);
    t.stops.push(
      stop(3, 1, 'Najran', { planned_arrival: at(14, 0, 25), actual_arrival: at(12, 0, 25), actual_departure: at(13, 0, 25) }),
      stop(4, 1, 'Khamis', { planned_arrival: at(17, 0, 25), actual_arrival: at(17, 30, 25) }),
    );
    const { samples: s } = legSamplesOf(t);
    assert.deepEqual(s.map((x) => [x.leg, x.from, x.to, x.actualMin]), [['out', 'Khamis', 'Najran', 180], ['return', 'Najran', 'Khamis', 270]]);
    assert.equal(s[1].offloadDwellMin, null, 'no departure recorded at the drop-off');
  });

  it('skips trips with missing times', () => {
    const t = trip('m', 180);
    t.stops[1].actual_arrival = null;
    assert.equal(legSamplesOf(t).skipped, 'missing');
  });

  it('skips trips with times out of order', () => {
    const t = trip('o', 180);
    t.stops[1].actual_arrival = at(7, 0, 25); // before the truck left
    assert.equal(legSamplesOf(t).skipped, 'out_of_order');
    const u = trip('o2', 180);
    u.stops[0].actual_arrival = at(9, 0, 25); // arrived after leaving
    assert.equal(legSamplesOf(u).skipped, 'out_of_order');
  });

  it('skips trips created as completed with their planned times', () => {
    const t = trip('s', 180);
    t.stops[0] = stop(1, 0, 'Khamis', { planned_arrival: at(8, 0), actual_arrival: at(8, 0), actual_departure: at(8, 0) });
    t.stops[1] = stop(2, 0, 'Najran', { planned_arrival: at(11, 0), actual_arrival: at(11, 0), actual_departure: at(11, 0) });
    assert.equal(legSamplesOf(t).skipped, 'stamped');
  });

  it('counts how many trips were skipped and why', () => {
    const bad = trip('b', 180); bad.stops[1].actual_arrival = null;
    const r = samples(trip('a', 180), bad, trip('c', 180));
    assert.equal(r.samples.length, 2);
    assert.deepEqual(r.skipped, { missing: 1, out_of_order: 0, stamped: 0, total: 1 });
  });
});

describe('transit times: maths', () => {
  it('p90 is the slowest 1 in 10 (nearest rank)', () => {
    assert.equal(percentile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 90), 90);
    assert.equal(percentile([100, 10, 20], 90), 100);
    assert.equal(percentile([], 90), null);
  });

  it('colours: green within 15 min, amber to 60, red beyond', () => {
    assert.equal(toneOf(180, 180), 'green');
    assert.equal(toneOf(195, 180), 'green');
    assert.equal(toneOf(196, 180), 'amber');
    assert.equal(toneOf(240, 180), 'amber');
    assert.equal(toneOf(241, 180), 'red');
    assert.equal(toneOf(120, 180), 'green');
    assert.equal(toneOf(200, null), null);
  });

  it('summary: average actual, planned, on-time % and average late', () => {
    const { samples: s, skipped } = samples(trip('1', 180), trip('2', 240), trip('3', 270), trip('4', 150));
    const r = summarize(s, [], { days: 30, size: null, now: NOW, skipped });
    assert.equal(r.routes.length, 1);
    const row = r.routes[0];
    assert.equal(row.actualAvgMin, 210); // (180+240+270+150)/4
    assert.equal(row.plannedMin, 180);
    assert.equal(row.trips, 4);
    assert.equal(row.tone, 'amber'); // 30 over
    // 180 and 150 are on time; 240 (+60) and 270 (+90) are late: avg late 75
    assert.equal(r.kpis.onTimePct, 50);
    assert.equal(r.kpis.avgLateMin, 75);
    assert.equal(r.kpis.routes, 1);
  });

  it('filters by truck size and by period', () => {
    const { samples: s } = samples(trip('1', 180), trip('2', 200, { type: '10 TON' }), trip('3', 200, { day: 2 }));
    const all = summarize(s, [], { days: 30, size: null, now: NOW });
    assert.equal(all.routes.length, 2);
    assert.deepEqual(all.sizes.sort(), ['10 TON', '5 TON']);
    assert.equal(summarize(s, [], { days: 30, size: '10 TON', now: NOW }).routes[0].trips, 1);
    // trip 3 left on the 2nd: outside 7 days and outside 30 days of the 27th? 25 days back → inside 30, outside 7
    assert.equal(summarize(s, [], { days: 30, size: '10 TON', now: NOW }).routes.find((r) => r.size === '10 TON')!.trips, 1);
    assert.equal(summarize(s, [], { days: 90, size: '5 TON', now: NOW }).routes[0].trips, 2);
    assert.equal(summarize(s, [], { days: 7, size: '5 TON', now: NOW }).routes[0].trips, 1);
  });

  it('a saved planned time replaces the trips’ own planned time, and a saved route nobody drove shows "no trips yet"', () => {
    const { samples: s } = samples(trip('1', 220), trip('2', 230));
    const saved: SavedTransit[] = [
      { origin_key: 'khamis', destination_key: 'najran', leg: 'out', truck_class: '5 TON', planned_minutes: 225 },
      { origin_key: 'abha', destination_key: 'jizan', leg: 'out', truck_class: '5 TON', planned_minutes: 150 },
    ];
    const r = summarize(s, saved, { days: 30, size: null, now: NOW });
    const k = r.routes.find((x) => x.trips === 2)!;
    assert.equal(k.plannedMin, 225);
    assert.equal(k.plannedSaved, true);
    assert.equal(k.tone, 'green');
    const empty = r.routes.find((x) => x.trips === 0)!;
    assert.equal(empty.plannedMin, 150);
    assert.equal(empty.actualAvgMin, null);
    assert.equal(empty.tone, null);
  });
});

describe('transit times: route detail', () => {
  const key = routeKeyOf('out', placeKey('Khamis'), placeKey('Najran'), '5 TON');
  const withDwell = (id: string, drive: number, load: number, off: number) => {
    const t = trip(id, drive);
    t.stops[0].actual_arrival = new Date(t.stops[0].actual_departure!.getTime() - load * 60_000);
    t.stops[1].actual_departure = new Date(t.stops[1].actual_arrival!.getTime() + off * 60_000);
    return t;
  };

  it('averages, p90 and where the time goes, highlighting the biggest part', () => {
    const ts = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((i) => withDwell(String(i), 200 + i, 20, 10));
    const d = routeDetail(samples(...ts).samples, [], key, { days: 30, now: NOW })!;
    assert.equal(d.trips, 10);
    assert.equal(d.actualAvgMin, 255);
    assert.equal(d.p90Min, 290);
    assert.deepEqual(d.time, { loadingMin: 20, roadMin: 255, offloadMin: 10, biggest: 'road' });
    assert.equal(d.recent.length, 10);
  });

  it('highlights waiting when offloading is the long part; unrecorded parts stay empty', () => {
    const d = routeDetail(samples(withDwell('1', 20, 10, 90)).samples, [], key, { days: 30, now: NOW })!;
    assert.equal(d.time.biggest, 'offload');
    const t = trip('2', 100); t.stops[0].actual_arrival = null; t.stops[1].actual_departure = null;
    const e = routeDetail(samples(t).samples, [], key, { days: 30, now: NOW })!;
    assert.deepEqual([e.time.loadingMin, e.time.offloadMin, e.time.biggest], [null, null, 'road']);
  });

  it('offers "use actual" only with 3+ trips and more than 15 min off planned', () => {
    const slow = samples(trip('1', 225), trip('2', 225), trip('3', 225)).samples;
    const d = routeDetail(slow, [], key, { days: 30, now: NOW })!;
    assert.equal(d.canUseActual, true);
    assert.equal(d.suggestedMin, 225);
    assert.equal(routeDetail(slow.slice(0, 2), [], key, { days: 30, now: NOW })!.canUseActual, false);
    const close = samples(trip('1', 190), trip('2', 190), trip('3', 190)).samples;
    assert.equal(routeDetail(close, [], key, { days: 30, now: NOW })!.canUseActual, false);
    // once saved at the actual time, it is no longer offered
    const saved: SavedTransit[] = [{ origin_key: 'khamis', destination_key: 'najran', leg: 'out', truck_class: '5 TON', planned_minutes: 225 }];
    assert.equal(routeDetail(slow, saved, key, { days: 30, now: NOW })!.canUseActual, false);
  });

  it('rounds the suggested time to 5 minutes', () => {
    const d = routeDetail(samples(trip('1', 227), trip('2', 228), trip('3', 229)).samples, [], key, { days: 30, now: NOW })!;
    assert.equal(d.suggestedMin, 230);
  });

  it('returns null for an unknown route', () => {
    assert.equal(routeDetail([], [], key, { days: 30, now: NOW }), null);
  });
});

describe('transit times: set planned (new trips only)', () => {
  it('writes only the saved route time for that customer, route and size', async () => {
    const calls: any[] = [];
    const store: any = new Proxy({}, { get: (_t, name) => {
      if (name === 'customerRouteTransit') return { upsert: async (a: any) => { calls.push(a); } };
      throw new Error(`touched ${String(name)} — existing trips must not change`);
    } });
    const r = await setPlannedTransit(store, { customerId: 'c1', key: 'out|khamis|najran|5 TON', plannedMin: 224.6, userId: 'u1' });
    assert.deepEqual(r, { key: 'out|khamis|najran|5 TON', plannedMin: 225 });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].where.customerId_origin_key_destination_key_leg_truck_class, { customerId: 'c1', origin_key: 'khamis', destination_key: 'najran', leg: 'out', truck_class: '5 TON' });
    assert.equal(calls[0].update.planned_minutes, 225);
  });

  it('rejects a bad key or an absurd time', async () => {
    const store: any = { customerRouteTransit: { upsert: async () => {} } };
    await assert.rejects(setPlannedTransit(store, { customerId: 'c', key: 'nope', plannedMin: 100 }), /INVALID_ROUTE_KEY/);
    await assert.rejects(setPlannedTransit(store, { customerId: 'c', key: 'out|a|b|5 TON', plannedMin: 2 }), /INVALID_MINUTES/);
  });
});

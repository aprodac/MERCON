import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ETA_STALE_MS, TRACKING_AFTER_END_DAYS, buildPublicTracking, firstName, trackingLinkState, truckSeconds,
  type TrackingTripMeta,
} from '../services/tracking/customerTracking';
import type { TripOverview } from '../services/tripOverview';
import type { RouteResult } from '../services/routing/routeProvider';

const NOW = new Date('2026-10-02T12:00:00Z');

function overview(over: Partial<TripOverview> = {}, posAgeMs = 30_000): TripOverview {
  return {
    trip_id: 't1',
    status: 'InTransit',
    phase: 'active',
    stops: [
      { id: 's1', sequence: 1, type: 'Pickup', name: 'iMile CDC Riyadh', address: 'Riyadh', lat: 24.6, lng: 46.7, planned_arrival: null, actual_arrival: '2026-10-02T06:00:00Z', actual_departure: '2026-10-02T06:40:00Z' },
      { id: 's2', sequence: 2, type: 'Dropoff', name: null, address: 'Al Baha, Saudi Arabia', lat: 20.01, lng: 41.47, planned_arrival: '2026-10-02T18:00:00Z', actual_arrival: null, actual_departure: null },
    ],
    next_stop_index: 1,
    unit: {
      key: 'v:1', vehicle: null, driver: null, trip: null, vehicle_gps: null, driver_gps: null,
      position: {
        lat: 22.123456789, lng: 43.987654321, speed_kph: 82.4, heading_deg: 210, accuracy_m: null,
        recorded_at: new Date(NOW.getTime() - posAgeMs).toISOString(), fresh: posAgeMs < 180_000, source: 'vehicle',
      },
      feed: 'vehicle', motion: 'moving', feeds_gap_m: null,
    },
    path: [[46.7, 24.6], [45, 23.5], [43.98, 22.12]],
    path_distance_m: 400_000,
    checks: null,
    ...over,
  };
}

const meta: TrackingTripMeta = {
  ref_id: 'TRP-0412', status: 'InTransit', vehicle_type: '10 TON', planned_start: null, actual_start: new Date('2026-10-02T06:40:00Z'), actual_end: null,
  updatedAt: NOW, is_third_party: false,
  vehicle: { plate_number: 'VRA-3358', asset_type: 'Truck10Ton' },
  driver: { first_name: 'UMAR BASHIR' },
  subcontract: null,
};

const route = (distanceMeters: number, durationSeconds: number): RouteResult => ({
  geometry: [[43.98, 22.12], [41.47, 20.01]], distanceMeters, durationSeconds,
  legs: [{ distanceMeters, durationSeconds }], provider: 'osrm',
});

const build = (ov: TripOverview, ahead: RouteResult | null, all: RouteResult | null = route(900_000, 30_000), m = meta) =>
  buildPublicTracking({ overview: ov, meta: m, brand: { name: 'MERCON', logo_url: null, primary_color: null }, timezone: 'Asia/Riyadh', ahead, all, now: NOW });

test('customer tracking', async (t) => {
  await t.test('a truck is never timed faster than the average-speed cap', () => {
    // 300 km the router says takes 2.5 h (120 km/h) → held to 80 km/h = 3.75 h.
    assert.equal(truckSeconds(300_000, 9_000), 13_500);
    // A slow route stays as the router timed it.
    assert.equal(truckSeconds(10_000, 1_200), 1_200);
  });

  await t.test('driver shows by first name only', () => {
    assert.equal(firstName('UMAR BASHIR'), 'Umar');
    assert.equal(firstName('  '), null);
    assert.equal(firstName(null), null);
  });

  await t.test('active trip: ETA to the next stop, progress, no phone or full name', () => {
    const out = build(overview(), route(300_000, 9_000));
    assert.equal(out.eta?.stop_index, 1);
    assert.equal(out.eta?.seconds, 13_500);
    assert.equal(out.eta?.arrival, new Date(NOW.getTime() + 13_500_000).toISOString());
    assert.equal(out.eta_gap, null);
    assert.deepEqual(out.progress, { done_m: 600_000, total_m: 900_000, pct: 67 });
    assert.equal(out.driver_first_name, 'Umar');
    assert.equal(out.vehicle.plate, 'VRA-3358');
    assert.equal(out.vehicle.type, '10 TON');
    assert.ok(!('planned_arrival' in out.stops[1]), 'planned stop times are not shown to customers');
    assert.equal(out.position?.lat, 22.12346);
    assert.equal(out.position?.moving, true);
    assert.deepEqual(out.stops.map((s) => s.state), ['done', 'next']);
    assert.equal(out.stops[1].name, 'Al Baha');
    assert.ok(!JSON.stringify(out).includes('phone'));
  });

  await t.test('an old position gives no ETA instead of a wrong one', () => {
    const out = build(overview({}, ETA_STALE_MS + 60_000), route(300_000, 9_000));
    assert.equal(out.eta, null);
    assert.equal(out.eta_gap, 'stale');
    assert.equal(out.progress, null);
    assert.equal(out.position?.fresh, false);
  });

  await t.test('no position and no route are reported, not guessed', () => {
    assert.equal(build(overview({ unit: null }), null).eta_gap, 'no_position');
    assert.equal(build(overview(), null).eta_gap, 'no_route');
  });

  await t.test('planned trip: ETA is the drive to the pickup', () => {
    const ov = overview({ phase: 'planned', status: 'Scheduled', next_stop_index: 0, path: [] });
    ov.stops = ov.stops.map((s) => ({ ...s, actual_arrival: null, actual_departure: null }));
    const out = build(ov, route(20_000, 1_800));
    assert.equal(out.eta?.stop_index, 0);
    assert.equal(out.next_stop_index, 0);
    assert.deepEqual(out.stops.map((s) => s.state), ['next', 'upcoming']);
    assert.ok(out.route, 'planned trips draw the route through the stops');
    assert.deepEqual(out.path, []);
  });

  await t.test('finished trip: no live truck, every stop done, full progress', () => {
    const out = build(overview({ phase: 'done', status: 'Completed', unit: null }), null);
    assert.equal(out.position, null);
    assert.equal(out.eta, null);
    assert.equal(out.next_stop_index, null);
    assert.deepEqual(out.stops.map((s) => s.state), ['done', 'done']);
    assert.equal(out.progress?.pct, 100);
  });

  await t.test('third-party trip shows the subcontractor truck', () => {
    const out = build(overview(), null, null, {
      ...meta, is_third_party: true, vehicle: null, driver: null,
      subcontract: { vehiclePlate: 'ABC-1234', vehicleType: '5 TON', driverName: 'ali khan' },
    });
    assert.equal(out.vehicle.plate, 'ABC-1234');
    assert.equal(out.driver_first_name, 'Ali');
  });

  await t.test('link lifetime', () => {
    const live = { expiresAt: new Date(NOW.getTime() + 86_400_000) };
    const trip = (status: string, actual_end: Date | null = null) => ({ status, actual_end, updatedAt: NOW });
    assert.equal(trackingLinkState(live, trip('InTransit'), NOW), 'ok');
    assert.equal(trackingLinkState(live, null, NOW), 'not_found');
    assert.equal(trackingLinkState({ expiresAt: NOW }, trip('InTransit'), NOW), 'expired');
    assert.equal(trackingLinkState(live, trip('Cancelled'), NOW), 'cancelled');
    const ended = (days: number) => new Date(NOW.getTime() - days * 86_400_000);
    assert.equal(trackingLinkState(live, trip('Completed', ended(TRACKING_AFTER_END_DAYS - 1)), NOW), 'ok');
    assert.equal(trackingLinkState(live, trip('Completed', ended(TRACKING_AFTER_END_DAYS + 1)), NOW), 'expired');
  });
});

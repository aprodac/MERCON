import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLiveUnits, type LiveVehicleRow, type LiveTripRow, type LiveDriverRow } from '../services/fleetLiveMap';

const NOW = Date.parse('2026-09-26T10:00:00Z');
const ago = (s: number) => new Date(NOW - s * 1000);

const driver = (id: string): LiveDriverRow => ({ id, ref_id: null, first_name: 'Ali', last_name: id, phone_primary: '+9665', avatar_url: null });

const vehicle = (id: string, over: Partial<LiveVehicleRow> = {}): LiveVehicleRow => ({
  id, ref_id: null, plate_number: `P-${id}`, asset_type: 'Truck', status: 'Available', image_url: null,
  icces_device_id: 'dev', last_lat: 24.7, last_lng: 46.7, last_speed_kph: 60, last_heading: 90, last_seen_at: ago(30),
  assignedDriver: null, ...over,
});

const trip = (id: string, over: Partial<LiveTripRow> = {}): LiveTripRow => ({
  id, ref_id: `TRP-${id}`, status: 'InTransit', vehicleId: null, planned_start: null, planned_end: null,
  updatedAt: ago(60), customer: { name: 'SABIC' }, driver: null,
  stops: [
    { stop_sequence: 2, stop_type: 'Dropoff', location_name: 'Jubail', location_address: null, location_lat: 27, location_lng: 49.6, planned_arrival: null, actual_arrival: null, actual_departure: null },
    { stop_sequence: 1, stop_type: 'Pickup', location_name: 'Riyadh', location_address: null, location_lat: 24.7, location_lng: 46.7, planned_arrival: null, actual_arrival: ago(3600), actual_departure: ago(3000) },
  ],
  ...over,
});

const loc = (tripId: string, secondsAgo: number, lat = 24.71) => ({ tripId, lat, lng: 46.7, speed_kph: 55, heading: 80, accuracy_m: 8, recordedAt: ago(secondsAgo) });

test('fleet live map units', async (t) => {
  await t.test('truck on a trip with both feeds live is one unit fed by both, positioned by the phone', () => {
    const [u] = buildLiveUnits({
      vehicles: [vehicle('v1')],
      trips: [trip('t1', { vehicleId: 'v1', driver: driver('d1') })],
      tripLocations: [loc('t1', 20)],
    }, NOW);
    assert.equal(u.key, 'v:v1');
    assert.equal(u.feed, 'both');
    assert.equal(u.position?.source, 'driver');
    assert.equal(u.driver?.id, 'd1');
    assert.equal(u.motion, 'moving');
    assert.ok(u.feeds_gap_m! > 1000 && u.feeds_gap_m! < 1200);
  });

  await t.test('stale phone falls back to the live tracker and the feed says truck only', () => {
    const [u] = buildLiveUnits({
      vehicles: [vehicle('v1')],
      trips: [trip('t1', { vehicleId: 'v1', driver: driver('d1') })],
      tripLocations: [loc('t1', 600)],
    }, NOW);
    assert.equal(u.feed, 'vehicle');
    assert.equal(u.position?.source, 'vehicle');
    assert.equal(u.feeds_gap_m, null);
  });

  await t.test('driver GPS never positions a truck with no trip; the assigned driver is still named', () => {
    const [u] = buildLiveUnits({ vehicles: [vehicle('v1', { assignedDriver: driver('d9') })], trips: [], tripLocations: [] }, NOW);
    assert.equal(u.trip, null);
    assert.equal(u.driver?.id, 'd9');
    assert.equal(u.driver_gps, null);
    assert.equal(u.feed, 'vehicle');
  });

  await t.test('a truck that never reported has no position — nothing is invented', () => {
    const [u] = buildLiveUnits({ vehicles: [vehicle('v1', { last_lat: null, last_lng: null, last_seen_at: null, icces_device_id: null })], trips: [], tripLocations: [] }, NOW);
    assert.equal(u.position, null);
    assert.equal(u.motion, 'no_signal');
    assert.equal(u.feed, 'none');
    assert.equal(u.vehicle?.has_tracker, false);
  });

  await t.test('old tracker fix is shown as stale, and slow fresh fixes read as idle', () => {
    const [stale] = buildLiveUnits({ vehicles: [vehicle('v1', { last_seen_at: ago(3600) })], trips: [], tripLocations: [] }, NOW);
    assert.equal(stale.motion, 'stale');
    const [idle] = buildLiveUnits({ vehicles: [vehicle('v1', { last_speed_kph: 1 })], trips: [], tripLocations: [] }, NOW);
    assert.equal(idle.motion, 'idle');
  });

  await t.test('a driver on a trip without a MERCON truck appears alone only once their phone reports', () => {
    const units = buildLiveUnits({
      vehicles: [],
      trips: [trip('t1', { driver: driver('d1') }), trip('t2', { driver: driver('d2') })],
      tripLocations: [loc('t1', 10)],
    }, NOW);
    assert.equal(units.length, 1);
    assert.equal(units[0].key, 'd:d1');
    assert.equal(units[0].feed, 'driver');
    assert.equal(units[0].vehicle, null);
  });

  await t.test('stops are ordered and the next stop is the first not yet arrived at', () => {
    const [u] = buildLiveUnits({ vehicles: [vehicle('v1')], trips: [trip('t1', { vehicleId: 'v1' })], tripLocations: [] }, NOW);
    assert.deepEqual(u.trip!.stops.map((s) => s.name), ['Riyadh', 'Jubail']);
    assert.equal(u.trip!.next_stop_index, 1);
    assert.equal(u.trip!.phase, 'active');
  });

  await t.test('a running trip wins over a scheduled one on the same truck', () => {
    const [u] = buildLiveUnits({
      vehicles: [vehicle('v1')],
      trips: [trip('sched', { vehicleId: 'v1', status: 'Scheduled', updatedAt: ago(1) }), trip('run', { vehicleId: 'v1', status: 'Loading' })],
      tripLocations: [],
    }, NOW);
    assert.equal(u.trip!.id, 'run');
  });

  await t.test('0,0 coordinates are treated as no fix', () => {
    const [u] = buildLiveUnits({ vehicles: [vehicle('v1', { last_lat: 0, last_lng: 0 })], trips: [], tripLocations: [] }, NOW);
    assert.equal(u.position, null);
  });
});

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
    { id: 's2', stop_sequence: 2, stop_type: 'Dropoff', location_name: 'Jubail', location_address: null, location_lat: 27, location_lng: 49.6, planned_arrival: null, actual_arrival: null, actual_departure: null },
    { id: 's1', stop_sequence: 1, stop_type: 'Pickup', location_name: 'Riyadh', location_address: null, location_lat: 24.7, location_lng: 46.7, planned_arrival: null, actual_arrival: ago(3600), actual_departure: ago(3000) },
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

test('trip media is sorted onto the stop it was taken at', async () => {
  const { groupTripMedia } = await import('../services/fleetLiveMap');
  const stops = [
    { id: 'b', stop_sequence: 2, actual_arrival: null, delay_reason: 'Traffic', delay_note: 'Jam at Medina', delay_logged_at: ago(600) },
    { id: 'a', stop_sequence: 1, actual_arrival: ago(3000), delay_reason: null, delay_note: null, delay_logged_at: null },
  ];
  const doc = (id: string, over: Record<string, unknown> = {}) => ({
    id, doc_type: 'POD', file_url: `/uploads/${id}.jpg`, mime_type: 'image/jpeg', ai_extracted_json: {}, createdAt: ago(100), files: [], ...over,
  });
  const out = groupTripMedia(stops, [
    doc('pod1', { ai_extracted_json: { stop_id: 'b' }, files: [{ id: 'pod1-2', file_url: '/uploads/pod1-2.jpg', mime_type: 'image/jpeg' }] }),
    doc('vid', { doc_type: 'Waybill', file_url: '/uploads/delay.mp4', mime_type: 'video/mp4', ai_extracted_json: { stop_id: 'b' } }),
    doc('cargo', { doc_type: 'Waybill', ai_extracted_json: { stop_id: 'a' } }),
    doc('legacy'),
  ]);
  assert.deepEqual(out.stops.map((s) => s.stop_id), ['a', 'b']);
  assert.deepEqual(out.stops[0].media.map((m) => m.kind), ['photo']);
  assert.deepEqual(out.stops[1].media.map((m) => `${m.id}:${m.kind}`), ['pod1:pod', 'pod1-2:pod', 'vid:video']);
  assert.equal(out.stops[1].delay?.note, 'Jam at Medina');
  assert.equal(out.stops[0].delay, null);
  assert.deepEqual(out.unplaced.map((m) => m.id), ['legacy']);
});

test('photos are labelled by the step the driver took them at', async () => {
  const { mediaStage } = await import('../services/fleetLiveMap');
  assert.equal(mediaStage('pickup', 'Waybill'), 'loaded');
  assert.equal(mediaStage('return_loading', 'Waybill'), 'loaded');
  assert.equal(mediaStage('pickup_arrival', 'Waybill'), 'arrived');
  assert.equal(mediaStage('delivery_arrival', 'POD'), 'arrived');
  assert.equal(mediaStage('intermediate_stop', 'Waybill'), 'stop');
  assert.equal(mediaStage('delivery', 'POD'), 'delivered');
  assert.equal(mediaStage('delay', 'Waybill'), 'delay');
  assert.equal(mediaStage(undefined, 'POD'), 'delivered');
  assert.equal(mediaStage(undefined, 'Waybill'), 'loaded');
});

test('a delay video with no stop goes on the stop the truck was heading for when it was sent', async () => {
  const { groupTripMedia } = await import('../services/fleetLiveMap');
  const stops = [
    { id: 'pickup', stop_sequence: 1, actual_arrival: ago(7200), delay_reason: null, delay_note: null, delay_logged_at: null },
    { id: 'drop1', stop_sequence: 2, actual_arrival: ago(600), delay_reason: null, delay_note: null, delay_logged_at: null },
    { id: 'drop2', stop_sequence: 3, actual_arrival: null, delay_reason: null, delay_note: null, delay_logged_at: null },
  ];
  const video = (id: string, sentSecondsAgo: number) => ({
    id, doc_type: 'Waybill', file_url: `/uploads/${id}.mp4`, mime_type: 'video/mp4',
    ai_extracted_json: { operation: 'delay' }, createdAt: ago(sentSecondsAgo), files: [],
  });
  const out = groupTripMedia(stops, [video('early', 3600), video('late', 60)]);
  assert.deepEqual(out.stops.find((s) => s.stop_id === 'drop1')!.media.map((m) => m.id), ['early']);
  assert.deepEqual(out.stops.find((s) => s.stop_id === 'drop2')!.media.map((m) => m.id), ['late']);
  assert.equal(out.unplaced.length, 0);
});

test('a delay reason sent in the workflow-state slot is recovered as the reason', async () => {
  const { splitDelayReason } = await import('../utils/delayReason');
  assert.deepEqual(splitDelayReason('Delayed', 'Traffic - jam at Medina', undefined), { workflowState: undefined, delayReason: 'Traffic - jam at Medina' });
  assert.deepEqual(splitDelayReason('Delayed', 'IN_TRANSIT_TO_DELIVERY', 'Weather'), { workflowState: 'IN_TRANSIT_TO_DELIVERY', delayReason: 'Weather' });
  assert.deepEqual(splitDelayReason('InTransit', 'GOING_TO_PICKUP', undefined), { workflowState: 'GOING_TO_PICKUP', delayReason: null });
  assert.deepEqual(splitDelayReason('InTransit', undefined, 'ignored'), { workflowState: undefined, delayReason: null });
});

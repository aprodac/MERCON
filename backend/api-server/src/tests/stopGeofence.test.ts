import test from 'node:test';
import assert from 'node:assert/strict';
import { FIX_MAX_AGE_MS, MAX_TRIP_AGE_MS, detectStopEvents, fenceable, tripIsCurrent, type GeofenceStop } from '../services/tracking/stopGeofence';

const NOW = new Date('2026-10-02T12:00:00Z');
// Khamis depot and Muhayil station, ~110 km apart.
const KHAMIS = { lat: 18.3, lng: 42.73 };
const MUHAYIL = { lat: 18.55, lng: 42.05 };

const stop = (id: string, seq: number, at: { lat: number; lng: number }, over: Partial<GeofenceStop> = {}): GeofenceStop => ({
  id, stop_sequence: seq, lat: at.lat, lng: at.lng, precision: 'EXACT', saved_site: true, actual_arrival: null, actual_departure: null, ...over,
});
// Round trip: Khamis → Muhayil → Muhayil → Khamis, as monthly trips are entered.
const roundTrip = (over: Record<string, Partial<GeofenceStop>> = {}) => [
  stop('s1', 1, KHAMIS, over.s1), stop('s2', 2, MUHAYIL, over.s2), stop('s3', 3, MUHAYIL, over.s3), stop('s4', 4, KHAMIS, over.s4),
];
const fixAt = (p: { lat: number; lng: number }, ageMs = 30_000) => ({ ...p, recordedAt: new Date(NOW.getTime() - ageMs) });
// ~200 m and ~2 km north of a point.
const near = (p: { lat: number; lng: number }) => ({ lat: p.lat + 0.0018, lng: p.lng });
const away = (p: { lat: number; lng: number }) => ({ lat: p.lat + 0.018, lng: p.lng });

test('stop times from truck GPS', async (t) => {
  await t.test('truck at the first stop arrives there', () => {
    assert.deepEqual(detectStopEvents(roundTrip(), fixAt(near(KHAMIS)), NOW).map((e) => [e.kind, e.stopId]), [['arrived', 's1']]);
  });

  await t.test('standing at the gate does nothing more', () => {
    const stops = roundTrip({ s1: { actual_arrival: NOW } });
    assert.deepEqual(detectStopEvents(stops, fixAt(near(KHAMIS)), NOW), []);
  });

  await t.test('leaving the depot departs it — and does not arrive at stop 4, which is the same depot', () => {
    const stops = roundTrip({ s1: { actual_arrival: NOW } });
    assert.deepEqual(detectStopEvents(stops, fixAt(away(KHAMIS)), NOW).map((e) => [e.kind, e.stopId]), [['departed', 's1']]);
  });

  await t.test('arrives at the next stop in order only', () => {
    const stops = roundTrip({ s1: { actual_arrival: NOW, actual_departure: NOW } });
    assert.deepEqual(detectStopEvents(stops, fixAt(near(MUHAYIL)), NOW).map((e) => [e.kind, e.stopId]), [['arrived', 's2']]);
    // Passing Khamis again before Muhayil arrives nowhere.
    assert.deepEqual(detectStopEvents(stops, fixAt(near(KHAMIS)), NOW), []);
  });

  await t.test('the return leg reaches the depot as the last stop', () => {
    const done = { actual_arrival: NOW, actual_departure: NOW };
    const stops = roundTrip({ s1: done, s2: done, s3: done });
    assert.deepEqual(detectStopEvents(stops, fixAt(near(KHAMIS)), NOW).map((e) => [e.kind, e.stopId]), [['arrived', 's4']]);
  });

  await t.test('old fixes are ignored', () => {
    assert.deepEqual(detectStopEvents(roundTrip(), fixAt(near(KHAMIS), FIX_MAX_AGE_MS + 1_000), NOW), []);
  });

  await t.test('a stop geocoded to a city is never fenced; pinned or saved sites are', () => {
    assert.equal(fenceable(stop('a', 1, KHAMIS, { precision: 'APPROXIMATE', saved_site: true })), false);
    assert.equal(fenceable(stop('b', 1, KHAMIS, { precision: 'UNKNOWN', saved_site: false })), false);
    assert.equal(fenceable(stop('c', 1, KHAMIS, { precision: null, saved_site: true })), true);
    assert.equal(fenceable(stop('d', 1, KHAMIS, { precision: 'EXACT', saved_site: false })), true);
    const city = [stop('s1', 1, KHAMIS, { precision: 'APPROXIMATE' })];
    assert.deepEqual(detectStopEvents(city, fixAt(near(KHAMIS)), NOW), []);
  });

  await t.test('trips started weeks ago are left alone', () => {
    const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
    assert.equal(tripIsCurrent({ actual_start: daysAgo(1), planned_start: null, createdAt: daysAgo(20) }, NOW), true);
    assert.equal(tripIsCurrent({ actual_start: null, planned_start: daysAgo(16), createdAt: daysAgo(17) }, NOW), false);
    assert.equal(tripIsCurrent({ actual_start: null, planned_start: null, createdAt: new Date(NOW.getTime() - MAX_TRIP_AGE_MS - 1) }, NOW), false);
  });
});

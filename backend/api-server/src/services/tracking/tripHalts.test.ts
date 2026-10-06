import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectHalts } from './tripHalts';

const T0 = new Date('2026-10-07T06:00:00Z').getTime();
const at = (min: number, lat: number, lng = 46.0) => ({ lat, lng, recordedAt: new Date(T0 + min * 60_000) });
/** Driving north ~1 km per minute from `lat`, one fix a minute. */
const drive = (fromMin: number, toMin: number, lat: number) =>
  Array.from({ length: toMin - fromMin + 1 }, (_, k) => at(fromMin + k, lat + k * 0.009));
/** Standing at `lat` (with a few metres of GPS wander), one fix a minute. */
const stand = (fromMin: number, toMin: number, lat: number) =>
  Array.from({ length: toMin - fromMin + 1 }, (_, k) => at(fromMin + k, lat + (k % 2) * 0.0002));

const PICKUP = { id: 'pickup', lat: 24.0, lng: 46.0 };

describe('trip halts', () => {
  it('finds loading at the pickup and a break on the way, and splits the time', () => {
    const pts = [...stand(0, 40, 24.0), ...drive(41, 100, 24.001), ...stand(101, 125, 24.55), ...drive(126, 150, 24.552)];
    const { halts, split } = detectHalts(pts, [PICKUP], new Date(T0 + 151 * 60_000));
    assert.equal(halts.length, 2);
    assert.deepEqual([halts[0].kind, halts[0].stop_id, halts[0].minutes], ['at_stop', 'pickup', 41]);
    assert.deepEqual([halts[1].kind, halts[1].minutes, halts[1].ongoing], ['break', 24, false]);
    assert.equal(split!.breaks, 1);
    assert.equal(split!.breaks_min, 24);
    assert.equal(split!.at_stops_min, 41);
    assert.equal(split!.driving_min, split!.total_min - 41 - 24);
  });

  it('ignores a short wait (a light, a queue)', () => {
    const pts = [...drive(0, 20, 24.1), ...stand(21, 24, 24.3), ...drive(25, 40, 24.301)];
    assert.equal(detectHalts(pts, [], new Date(T0 + 41 * 60_000)).halts.length, 0);
  });

  it('counts a stop still going on up to now', () => {
    const pts = [...drive(0, 30, 24.1), ...stand(31, 50, 24.4)];
    const { halts } = detectHalts(pts, [], new Date(T0 + 62 * 60_000));
    assert.equal(halts.length, 1);
    assert.equal(halts[0].ongoing, true);
    assert.equal(halts[0].minutes, 31); // 06:31 → now (07:02)
  });

  it('a phone that went quiet while parked: the break lasts until it must have left', () => {
    // Parked at 24.4 from 06:30, last fix 06:35; next fix 08:00 only ~20 km on → it left ~07:43.
    const pts = [...drive(0, 29, 24.1), ...stand(30, 35, 24.4), at(120, 24.58), ...drive(121, 130, 24.59)];
    const { halts } = detectHalts(pts, [], new Date(T0 + 131 * 60_000));
    assert.equal(halts.length, 1);
    assert.ok(halts[0].minutes > 60 && halts[0].minutes < 80, `about 73 min, got ${halts[0].minutes}`);
  });

  it('a phone switched off while driving is no signal, not a break', () => {
    const pts = [...drive(0, 30, 24.1), at(80, 24.6), ...drive(81, 90, 24.61)];
    assert.equal(detectHalts(pts, [], new Date(T0 + 91 * 60_000)).halts.length, 0);
  });

  it('no history, nothing to say', () => {
    assert.deepEqual(detectHalts([], []), { halts: [], split: null });
  });
});

import { mergeFeeds } from './tripHalts';
import { worthKeeping, MIN_MOVE_M, STILL_EVERY_MS } from './trackerHistory';
import { shortPlaceName } from '../geo/placeNames';

describe('both GPS feeds', () => {
  const p = (min: number, source: 'driver' | 'vehicle') => ({ lat: 24, lng: 46 + min * 0.001, recordedAt: new Date(T0 + min * 60_000), source });

  it('uses the phone where it sends, and the tracker only in its silences', () => {
    const merged = mergeFeeds([p(0, 'driver'), p(1, 'vehicle'), p(2, 'driver'), p(10, 'vehicle'), p(20, 'vehicle'), p(21, 'driver')]);
    assert.deepEqual(merged.map((m) => `${(m.recordedAt.getTime() - T0) / 60_000}${m.source[0]}`), ['0d', '2d', '10v', '21d']);
  });

  it('a trip with only the tracker still has a history', () => {
    assert.equal(mergeFeeds([p(0, 'vehicle'), p(5, 'vehicle')]).length, 2);
  });

  it('keeps a tracker fix when the truck moved, or every 5 min while it stands', () => {
    const prev = { at: T0, lat: 24, lng: 46 };
    const later = (sec: number, dLat = 0) => ({ lat: 24 + dLat, lng: 46, recordedAt: new Date(T0 + sec * 1000) });
    assert.equal(worthKeeping(undefined, later(0)), true);
    assert.equal(worthKeeping(prev, later(30, 0.001)), true, `moved ~110 m > ${MIN_MOVE_M} m`);
    assert.equal(worthKeeping(prev, later(30)), false, 'standing, 30 s later');
    assert.equal(worthKeeping(prev, later(STILL_EVERY_MS / 1000)), true, 'standing, 5 min later');
    assert.equal(worthKeeping(prev, later(-30, 0.01)), false, 'older than the last kept');
    assert.equal(worthKeeping(prev, { lat: 0, lng: 0, recordedAt: new Date(T0 + 600_000) }), false, 'a dead tracker’s 0,0');
  });
});

describe('place names', () => {
  it('reads as road, near town', () => {
    assert.equal(shortPlaceName({ road: 'Route 40', village: 'Al Quwayiyah', state: 'Riyadh Region' }), 'Route 40, near Al Quwayiyah');
    assert.equal(shortPlaceName({ town: 'Ad Duwadimi' }), 'Near Ad Duwadimi');
    assert.equal(shortPlaceName({}, 'Somewhere, Riyadh Region, Saudi Arabia'), 'Somewhere, Riyadh Region');
    assert.equal(shortPlaceName(null, null), null);
  });
});

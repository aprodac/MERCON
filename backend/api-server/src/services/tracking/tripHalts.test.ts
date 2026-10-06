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

  it('no history, nothing to say', () => {
    assert.deepEqual(detectHalts([], []), { halts: [], split: null });
  });
});

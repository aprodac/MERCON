import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { getRouteAhead, locateOnRoute, __resetRouteAhead } from './routeAhead';

type LngLat = [number, number];
const realFetch = globalThis.fetch;

/** A straight road north from (46.0, 24.0): 0.01° of latitude ≈ 1.1 km per step. */
const NORTH: LngLat[] = Array.from({ length: 11 }, (_, i) => [46.0, 24.0 + i * 0.01] as LngLat);
const STOP = { id: 'stop-1', lat: 24.1, lng: 46.0 };

function osrm(coords: LngLat[], distance = 11000, duration = 600) {
  return { ok: true, status: 200, json: async () => ({ code: 'Ok', routes: [{ distance, duration, geometry: { coordinates: coords }, legs: [{ distance, duration }] }] }) };
}

function stub(handler: (url: string) => any) {
  const calls: string[] = [];
  globalThis.fetch = (async (url: any) => { calls.push(String(url)); return handler(String(url)); }) as typeof fetch;
  return calls;
}

const fix = (lat: number, lng = 46.0, extra: Partial<{ heading_deg: number | null; speed_kph: number | null }> = {}) =>
  ({ lat, lng, heading_deg: 0, speed_kph: 80, accuracy_m: 10, ...extra });

describe('route ahead', () => {
  beforeEach(() => __resetRouteAhead());
  afterEach(() => { globalThis.fetch = realFetch; });

  it('routes once with the truck heading, then only trims as it drives', async () => {
    const calls = stub(() => osrm(NORTH));
    const t0 = 1_000_000;
    const a = await getRouteAhead('trip', fix(24.0), STOP, t0);
    assert.equal(calls.length, 1);
    assert.match(calls[0], /bearings=0,45;/, 'the start is pinned to the way the truck is heading');
    assert.ok(a.distanceMeters > 10000);

    const b = await getRouteAhead('trip', fix(24.05), STOP, t0 + 60_000);
    assert.equal(calls.length, 1, 'no new route while the truck is on this one');
    assert.ok(Math.abs(b.geometry[0][1] - 24.05) < 0.0005, 'the line starts at the truck, not behind it');
    assert.ok(b.geometry.every(([, lat]) => lat >= 24.0499), 'nothing already driven is drawn');
    assert.ok(Math.abs(b.distanceMeters - 5500) < 200, `about half left, got ${b.distanceMeters}`);
    assert.ok(Math.abs(b.durationSeconds - 300) < 15);
    assert.equal(b.onRoute, true);
  });

  it('does not use the heading of a truck standing still', async () => {
    const calls = stub(() => osrm(NORTH));
    await getRouteAhead('trip', fix(24.0, 46.0, { speed_kph: 0 }), STOP, 1);
    assert.doesNotMatch(calls[0], /bearings=/);
  });

  it('asks again without the heading when no road leaves that way', async () => {
    const calls = stub((url) => (url.includes('bearings=') ? { ok: true, status: 200, json: async () => ({ code: 'NoSegment', routes: [] }) } : osrm(NORTH)));
    const a = await getRouteAhead('trip', fix(24.0), STOP, 1);
    assert.equal(calls.length, 2);
    assert.ok(a.geometry.length > 2);
  });

  it('keeps the route through one stray GPS fix, re-routes when the truck really leaves it', async () => {
    const calls = stub(() => osrm(NORTH));
    const t0 = 1_000_000;
    await getRouteAhead('trip', fix(24.02), STOP, t0);
    // 600 m east of the road once: noise.
    const stray = await getRouteAhead('trip', fix(24.03, 46.0066), STOP, t0 + 60_000);
    assert.equal(calls.length, 1);
    assert.equal(stray.onRoute, false);
    assert.ok(Math.abs(stray.geometry[0][1] - 24.02) < 0.001, 'stays at the last good spot');
    // Back on the road: fine again.
    const back = await getRouteAhead('trip', fix(24.035), STOP, t0 + 75_000);
    assert.equal(back.onRoute, true);
    assert.equal(calls.length, 1);
    // Off twice in a row: a real detour → new route from where the truck is.
    await getRouteAhead('trip', fix(24.04, 46.0066), STOP, t0 + 90_000);
    await getRouteAhead('trip', fix(24.045, 46.0066), STOP, t0 + 105_000);
    assert.equal(calls.length, 2);
  });

  it('re-routes at once when far off, but never twice within 30 s', async () => {
    const calls = stub(() => osrm(NORTH));
    const t0 = 1_000_000;
    await getRouteAhead('trip', fix(24.02), STOP, t0);
    await getRouteAhead('trip', fix(24.03, 46.03), STOP, t0 + 60_000); // ~3 km off
    assert.equal(calls.length, 2);
    await getRouteAhead('trip', fix(24.03, 46.06), STOP, t0 + 70_000);
    assert.equal(calls.length, 2, 'rate-limited');
  });

  it('routes again when the next stop changes', async () => {
    const calls = stub(() => osrm(NORTH));
    await getRouteAhead('trip', fix(24.0), STOP, 1);
    await getRouteAhead('trip', fix(24.01), { ...STOP, id: 'stop-2' }, 2);
    assert.equal(calls.length, 2);
  });

  it('shares one OSRM request between screens asking at the same moment', async () => {
    const calls = stub(() => osrm(NORTH));
    await Promise.all([getRouteAhead('trip', fix(24.0), STOP, 1), getRouteAhead('trip', fix(24.0), STOP, 1)]);
    assert.equal(calls.length, 1);
  });
});

describe('locateOnRoute', () => {
  // Out east, a loop (an interchange ramp) that comes back past the start, then north.
  const LOOP: LngLat[] = [[46.0, 24.0], [46.01, 24.0], [46.01, 24.01], [46.0005, 24.01], [46.0005, 24.0003], [45.99, 24.0003]];
  const cum = LOOP.reduce<number[]>((acc, p, i) => {
    if (i === 0) return [0];
    const [a, b] = [LOOP[i - 1], p];
    const x = ((b[0] - a[0]) * Math.PI / 180) * Math.cos((a[1] * Math.PI) / 180);
    const y = ((b[1] - a[1]) * Math.PI / 180);
    return [...acc, acc[i - 1] + Math.hypot(x, y) * 6371008.8];
  }, []);

  it('does not jump ahead to a later stretch that passes close by', () => {
    // At the start, ~33 m from the loop's return leg — still the start.
    const here = locateOnRoute(LOOP, cum, [46.0, 24.0], 0);
    assert.equal(here.seg, 0);
  });

  it('does not slide back to an earlier stretch once past it', () => {
    // Back near the start after the loop: ~6 m from the very first stretch, ~40 m from where it really is.
    const here = locateOnRoute(LOOP, cum, [46.0008, 24.00005], cum[4] + 5);
    assert.ok(here.seg >= 3, `stays after the loop, got segment ${here.seg}`);
  });
});

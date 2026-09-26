import test from 'node:test';
import assert from 'node:assert/strict';
import { pathDistanceMeters, thinPath, tripPhase } from '../services/tripOverview';

test('trip overview helpers', async (t) => {
  await t.test('status maps to the page phase', () => {
    assert.equal(tripPhase('Draft'), 'planned');
    assert.equal(tripPhase('Scheduled'), 'planned');
    assert.equal(tripPhase('Loading'), 'active');
    assert.equal(tripPhase('InTransit'), 'active');
    assert.equal(tripPhase('Delayed'), 'active');
    assert.equal(tripPhase('Completed'), 'done');
    assert.equal(tripPhase('Invoiced'), 'done');
    assert.equal(tripPhase('Cancelled'), 'cancelled');
  });

  await t.test('long paths are thinned but keep both ends', () => {
    const pts = Array.from({ length: 5000 }, (_, i) => i);
    const thin = thinPath(pts, 1500);
    assert.ok(thin.length <= 1501);
    assert.equal(thin[0], 0);
    assert.equal(thin[thin.length - 1], 4999);
    assert.deepEqual(thinPath([1, 2, 3], 10), [1, 2, 3]);
  });

  await t.test('path distance adds up the legs', () => {
    const d = pathDistanceMeters([{ lat: 24, lng: 46 }, { lat: 24.01, lng: 46 }, { lat: 24.02, lng: 46 }]);
    assert.ok(d > 2200 && d < 2250, String(d));
  });
});

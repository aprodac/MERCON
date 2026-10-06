/**
 * The shared fleet rules (@mercon/shared-types fleetRules) — the same code the
 * web live map, the operator app and the API's late alerts run.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeEta, punctuality, steadyArrival, truckDriveSeconds, isLongStop, isSilent, LATE_ALERT_MIN, formatDriveTime } from '@mercon/shared-types';
import { lateAlertText } from '../services/tracking/etaWatcher';

const unit = (stop: { lat: number; lng: number; planned_arrival?: string | null }, extra: Record<string, unknown> = {}) => ({
  trip: { phase: 'active' as const, stops: [{ planned_arrival: null, ...stop }], next_stop_index: 0 },
  position: { lat: 24.71, lng: 46.67, recorded_at: new Date(0).toISOString() },
  ...extra,
});

describe('fleet rules', () => {
  it('times a road route at truck speed and counts arrival from the given moment', () => {
    const eta = computeEta(unit({ lat: 21.42, lng: 39.82 }), { distanceMeters: 848_000, durationSeconds: 32_400 }, 0)!;
    assert.equal(eta.durationSeconds, 38_160); // 848 km at 80 km/h, not the car's 9 h
    assert.equal(eta.arrival!.getTime(), 38_160_000);
    assert.equal(eta.approx, false);
  });

  it('estimates instead of a dash when there is no road route', () => {
    const eta = computeEta(unit({ lat: 24.47, lng: 44.39 }), null, 0)!;
    assert.equal(eta.approx, true);
    assert.ok(eta.distanceKm! > 290 && eta.distanceKm! < 310, `Riyadh → Ad Duwadimi ≈ 300 km, got ${eta.distanceKm}`);
    assert.equal(eta.lateByMin, null, 'an estimate never says late');
  });

  it('calls out a next stop too far away to be real', () => {
    const eta = computeEta(unit({ lat: 51, lng: 10 }), null, 0)!;
    assert.equal(eta.stopLooksWrong, true);
    assert.equal(eta.arrival, null);
  });

  it('says how late against the plan, with the shared grace', () => {
    const planned = new Date(3_600_000).toISOString();
    const eta = computeEta(unit({ lat: 24.8, lng: 46.7, planned_arrival: planned }), { distanceMeters: 10_000, durationSeconds: 3_600 + 40 * 60 }, 0)!;
    assert.equal(eta.lateByMin, 40);
    assert.deepEqual(punctuality(4), { label: 'On time', late: false });
    assert.deepEqual(punctuality(40), { label: '40 min late', late: true });
    assert.ok(40 >= LATE_ALERT_MIN);
  });

  it('keeps the shown arrival unless it moved 3 min or more', () => {
    assert.equal(steadyArrival(1_000_000, 1_000_000 + 170_000), 1_000_000);
    assert.equal(steadyArrival(1_000_000, 1_000_000 + 180_000), 1_180_000);
    assert.equal(steadyArrival(null, 5), 5);
  });

  it('never times a truck faster than 80 km/h, but keeps slower town driving', () => {
    assert.equal(truckDriveSeconds(80_000, 1800), 3600);
    assert.equal(truckDriveSeconds(10_000, 900), 900);
  });

  it('flags silent GPS and long stops away from the trip’s stops', () => {
    const now = 40 * 60_000;
    assert.equal(isSilent(unit({ lat: 1, lng: 1 }), now), true);
    const stopped = unit({ lat: 21, lng: 39 }, { motion: 'idle', stopped_since: new Date(0).toISOString() });
    assert.equal(isLongStop(stopped, now), true);
    const atStop = unit({ lat: 24.71, lng: 46.67 }, { motion: 'idle', stopped_since: new Date(0).toISOString() });
    assert.equal(isLongStop(atStop, now), false, 'standing at its own stop is working, not stuck');
  });

  it('writes the late alert an operator can act on', () => {
    const u: any = { trip: { ref_id: 'TRP-0001' }, vehicle: { plate_number: 'KSA-6102' }, driver: { name: 'Naseeb' } };
    const { title, message } = lateAlertText(u, 'Riyadh', new Date('2026-10-07T07:42:00Z'), new Date('2026-10-07T07:00:00Z'), 42, 'Asia/Riyadh');
    assert.equal(title, 'TRP-0001 is going to be late');
    assert.equal(message, 'KSA-6102 · Naseeb is expected at Riyadh around 10:42 — 42 min after the planned 10:00. Call the driver or let the customer know.');
    assert.equal(formatDriveTime(42 * 60), '42 min');
  });
});

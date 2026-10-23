import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TripStatus } from '@prisma/client';
import { sameDayCheckRows, sameDayWarning } from '@mercon/shared-types';
import { orderDriverQueue, tripAheadIn, tripOnTheRoadIn, tripLogFinishProblem, tripWaitingError } from '../services/sameDayTrips';

const TZ = 'Asia/Riyadh';
const trip = (id: string, start: string | null, created: string, status: TripStatus = TripStatus.Scheduled) => ({
  id, ref_id: id, status, planned_start: start ? new Date(start) : null, createdAt: new Date(created),
});

describe('same-day trips', () => {
  // A: 14 Oct 15:00 Riyadh, created first. B: 14 Oct 08:00, created later. C: 15 Oct.
  const a = trip('A', '2026-10-14T12:00:00Z', '2026-10-10T08:00:00Z');
  const b = trip('B', '2026-10-14T05:00:00Z', '2026-10-12T08:00:00Z');
  const c = trip('C', '2026-10-15T05:00:00Z', '2026-10-01T08:00:00Z');

  it('orders by day, then by which trip was created first', () => {
    assert.deepEqual(orderDriverQueue([c, b, a, trip('D', null, '2026-09-01T00:00:00Z')], TZ).map((t) => t.id), ['A', 'B', 'C', 'D']);
  });

  it('the later-created trip waits for the earlier one on that day', () => {
    assert.equal(tripAheadIn(b, [a, c], TZ)?.id, 'A');
    assert.equal(tripAheadIn(a, [b, c], TZ), null);
    assert.equal(tripAheadIn(c, [a, b], TZ), null);
  });

  it('a finished earlier trip no longer holds the later one', () => {
    assert.equal(tripAheadIn(b, [{ ...a, status: TripStatus.Completed }], TZ), null);
  });

  it('uses the Riyadh day, not the UTC day', () => {
    // 22:30 UTC on the 13th is 01:30 on the 14th in Riyadh.
    const late = trip('L', '2026-10-13T22:30:00Z', '2026-10-11T00:00:00Z');
    assert.equal(tripAheadIn(b, [late], TZ)?.id, 'L');
  });

  it('asks only about own-driver trips', () => {
    assert.deepEqual(sameDayCheckRows([{ driver_id: 'd1', planned_start: 'x' }, { driver_id: 'd2', planned_start: 'y', is_third_party: true }]).map((r) => r.driver_id), ['d1', undefined]);
  });

  it('warning names the driver, the day and the trip', () => {
    const w = sameDayWarning([{ index: 0, driverId: 'd', driverName: 'Naseebullah', date: '2026-10-14', trips: [{ id: 'A', ref_id: 'TRP-0101', status: 'Scheduled', planned_start: '2026-10-14T05:00:00Z', route: 'Riyadh → Jeddah' }] }], TZ);
    assert.equal(w.title, 'Naseebullah already has a trip that day');
    assert.equal(w.lines[0], 'Naseebullah · Wed 14 Oct: TRP-0101 — Riyadh → Jeddah, 08:00');
  });
});

describe('one trip on the road at a time', () => {
  const road = (id: string, status: TripStatus, start: string) => ({ id, ref_id: id, status, actual_start: new Date(start), createdAt: new Date('2026-10-01T00:00:00Z') });

  it('another trip on the road (any day) blocks a start with TRIP_WAITING', () => {
    const blocking = tripOnTheRoadIn('TRP-0054', [road('TRP-0053', TripStatus.InTransit, '2026-10-21T17:38:00Z')]);
    assert.equal(blocking?.id, 'TRP-0053');
    assert.equal(tripWaitingError(blocking!).code, 'TRIP_WAITING');
    assert.match(tripWaitingError(blocking!).message, /Finish TRP-0053 first/);
  });

  it('Loading and Delayed count as on the road', () => {
    assert.ok(tripOnTheRoadIn('X', [road('A', TripStatus.Loading, '2026-10-21T00:00:00Z')]));
    assert.ok(tripOnTheRoadIn('X', [road('A', TripStatus.Delayed, '2026-10-21T00:00:00Z')]));
  });

  it('a previous trip that is completed does not block', () => {
    assert.equal(tripOnTheRoadIn('TRP-0054', [road('TRP-0053', TripStatus.Completed, '2026-10-21T17:38:00Z'), road('S', TripStatus.Scheduled, '2026-10-22T00:00:00Z')]), null);
  });

  it('the trip itself is never its own blocker', () => {
    assert.equal(tripOnTheRoadIn('A', [road('A', TripStatus.InTransit, '2026-10-21T00:00:00Z')]), null);
  });
});

describe('trip-log Finish names the trip', () => {
  it('refuses when the body trip id is another trip', () => {
    assert.equal(tripLogFinishProblem({ id: 'A', driver_workflow_state: 'TRIP_LOG' }, 'B'), 'trip id mismatch');
  });
  it('refuses a trip that was never started as a trip log', () => {
    assert.equal(tripLogFinishProblem({ id: 'A', driver_workflow_state: null }, 'A'), 'trip not started');
  });
  it('allows the started trip, with or without the id (older apps)', () => {
    assert.equal(tripLogFinishProblem({ id: 'A', driver_workflow_state: 'TRIP_LOG' }, 'A'), null);
    assert.equal(tripLogFinishProblem({ id: 'A', driver_workflow_state: 'TRIP_LOG' }, undefined), null);
  });
});

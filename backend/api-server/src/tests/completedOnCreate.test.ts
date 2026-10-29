import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TripStatus } from '@prisma/client';

import { completedOnCreateTimes, stampCompletedStops } from '../utils/completedOnCreate';
import { tripPhase } from '../services/tripOverview';

const start = new Date('2026-10-25T01:00:00Z');
const end = new Date('2026-10-25T17:00:00Z');

describe('trip created as Completed', () => {
  it('gets actual_start/actual_end from the planned times', () => {
    assert.deepEqual(completedOnCreateTimes(TripStatus.Completed, start, end), { actual_start: start, actual_end: end });
  });

  it('falls back to the start when no planned end', () => {
    assert.equal(completedOnCreateTimes(TripStatus.Completed, start, null)?.actual_end, start);
  });

  it('leaves other statuses and trips without a start alone', () => {
    assert.equal(completedOnCreateTimes(TripStatus.Scheduled, start, end), null);
    assert.equal(completedOnCreateTimes(TripStatus.Completed, null, end), null);
  });

  it('stamps stops from the planned times where not given', () => {
    const mid = new Date('2026-10-25T08:00:00Z');
    const stops = stampCompletedStops([{ planned_arrival: null }, { planned_arrival: mid }, { planned_arrival: null }], start, end);
    assert.equal(stops[0].actual_arrival, start);
    assert.equal(stops[1].actual_departure, mid);
    assert.equal(stops[2].actual_arrival, end);
  });

  it('lands in History on its day and counts as done', () => {
    const times = completedOnCreateTimes(TripStatus.Completed, start, end)!;
    // History lists by planned day and shows the finish from actual_end; Done is the 'done' phase.
    assert.ok(times.actual_end >= new Date('2026-10-25T00:00:00Z'));
    assert.equal(tripPhase(TripStatus.Completed), 'done');
  });
});

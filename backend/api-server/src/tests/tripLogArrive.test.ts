import test from 'node:test';
import assert from 'node:assert/strict';
import { ArriveError, arriveAtStop, type ArriveDb } from '../services/tripLogArrive';

type Stop = { id: string; tripId: string; actual_arrival: Date | null };

/** A tiny in-memory database: trips by driver, stops with their arrivals. */
function fakeDb(trips: { id: string; driverId: string; state: string | null }[], stops: Stop[]): ArriveDb {
  return {
    trip: {
      async findFirst({ where }: any) {
        const t = trips.find((x) => x.id === where.id && x.driverId === where.driverId);
        return t ? { id: t.id, driver_workflow_state: t.state, stops: stops.filter((s) => s.tripId === t.id).map((s) => ({ id: s.id, actual_arrival: s.actual_arrival })) } : null;
      },
    },
    tripStop: {
      async updateMany({ where, data }: any) {
        const hit = stops.filter((s) => s.id === where.id && s.tripId === where.tripId && s.actual_arrival === null);
        hit.forEach((s) => { s.actual_arrival = data.actual_arrival; });
        return { count: hit.length };
      },
    },
  };
}

const refused = (p: Promise<unknown>, status: number, code: string) =>
  assert.rejects(p, (e: unknown) => e instanceof ArriveError && e.status === status && e.code === code);

test('trip log: Arrived at a stop', async (t) => {
  const mk = () => {
    const stops: Stop[] = [
      { id: 'a1', tripId: 'A', actual_arrival: null },
      { id: 'a2', tripId: 'A', actual_arrival: null },
      { id: 'b1', tripId: 'B', actual_arrival: null },
    ];
    const db = fakeDb([
      { id: 'A', driverId: 'd1', state: 'TRIP_LOG' },
      { id: 'B', driverId: 'd1', state: null },
      { id: 'C', driverId: 'd2', state: 'TRIP_LOG' },
    ], stops);
    return { stops, db };
  };

  await t.test('stamps the arrival with the given time, once', async () => {
    const { stops, db } = mk();
    const first = new Date('2026-10-23T08:00:00Z');
    const r1 = await arriveAtStop(db, 'A', 'd1', 'a1', first);
    assert.deepEqual([r1.stamped, r1.arrivedAt], [true, first]);
    const r2 = await arriveAtStop(db, 'A', 'd1', 'a1', new Date('2026-10-23T09:00:00Z'));
    assert.deepEqual([r2.stamped, r2.arrivedAt], [false, first]);
    assert.equal(stops[0].actual_arrival, first);
    assert.equal(stops[1].actual_arrival, null);
  });

  await t.test('a stop of another trip is refused', async () => {
    const { stops, db } = mk();
    await refused(arriveAtStop(db, 'A', 'd1', 'b1'), 400, 'UNKNOWN_STOP');
    assert.equal(stops[2].actual_arrival, null);
  });

  await t.test('a trip not started as a trip log is refused', async () => {
    const { db } = mk();
    await refused(arriveAtStop(db, 'B', 'd1', 'b1'), 409, 'WRONG_TRIP');
  });

  await t.test("another driver's trip is not found", async () => {
    const { db } = mk();
    await refused(arriveAtStop(db, 'C', 'd1', 'a1'), 404, 'NOT_FOUND');
  });

  await t.test('the screenshot after it does not move the arrival (placeLogEntry fills only an empty one)', async () => {
    const { stops, db } = mk();
    const first = new Date('2026-10-23T08:00:00Z');
    await arriveAtStop(db, 'A', 'd1', 'a1', first);
    // what tripLogPlace does on attach: updateMany({ id, actual_arrival: null }) — matches nothing now
    const { count } = await db.tripStop.updateMany({ where: { id: 'a1', tripId: 'A', actual_arrival: null }, data: { actual_arrival: new Date('2026-10-23T08:20:00Z') } });
    assert.equal(count, 0);
    assert.equal(stops[0].actual_arrival, first);
  });
});

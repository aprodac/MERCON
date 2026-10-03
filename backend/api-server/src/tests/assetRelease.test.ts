import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseDriversIfFree, releaseVehiclesIfFree } from '../services/tripLifecycle';

/** Counts come from `running` (keyed by driver / vehicle id); records the status writes. */
function fakeTx(running: Record<string, number>) {
  const writes: any[] = [];
  const countFor = (where: any) => running[where.vehicleId ?? where.OR?.[0]?.driverId] ?? 0;
  const tx: any = {
    trip: { count: async ({ where }: any) => countFor(where) },
    driver: { updateMany: async (args: any) => { writes.push({ model: 'driver', ...args }); return { count: 1 }; } },
    vehicle: { updateMany: async (args: any) => { writes.push({ model: 'vehicle', ...args }); return { count: 1 }; } },
  };
  return { tx, writes };
}

test('a driver with another running trip stays On trip', async () => {
  const { tx, writes } = fakeTx({ d1: 1 });
  await releaseDriversIfFree(tx, ['d1']);
  assert.equal(writes.length, 0);
});

test('a driver with nothing else running goes back to Available — only from OnTrip', async () => {
  const { tx, writes } = fakeTx({});
  await releaseDriversIfFree(tx, ['d1', null, 'd1']);
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].where, { id: 'd1', status: 'OnTrip' });
  assert.equal(writes[0].data.status, 'Available');
});

test('a truck in the workshop is never flipped to Available', async () => {
  const { tx, writes } = fakeTx({});
  await releaseVehiclesIfFree(tx, ['v1']);
  assert.deepEqual(writes[0].where, { id: 'v1', status: 'OnTrip' });
});

test('the trip being changed can be left out of the count', async () => {
  let seen: any = null;
  const tx: any = {
    trip: { count: async ({ where }: any) => { seen = where; return 0; } },
    driver: { updateMany: async () => ({ count: 1 }) },
  };
  await releaseDriversIfFree(tx, ['d1'], ['t1']);
  assert.deepEqual(seen.id, { notIn: ['t1'] });
});

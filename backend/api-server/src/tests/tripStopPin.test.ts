import test from 'node:test';
import assert from 'node:assert/strict';
import { writeTripStops } from '../services/tripStopWriter';

const CUSTOMER = '11111111-1111-4111-8111-111111111111';
const RIYADH_ID = '22222222-2222-4222-8222-222222222222';
const DAMMAM_ID = '33333333-3333-4333-8333-333333333333';

const riyadh = { id: RIYADH_ID, name: 'Riyadh', lat: 24.70734, lng: 46.67509, coordinate_precision: 'EXACT', address: 'Gate 2, Sulay', deletedAt: null };
const dammamGuess = { id: DAMMAM_ID, name: 'Dammam', lat: 26.4207, lng: 50.0888, coordinate_precision: 'APPROXIMATE', address: null, deletedAt: null };

/** Only the reads writeTripStops makes for stops that carry a location id. */
function fakeTx() {
  const byId: Record<string, any> = { [RIYADH_ID]: riyadh, [DAMMAM_ID]: dammamGuess };
  return {
    location: {
      findFirst: async ({ where }: any) => byId[where.id] ?? null,
      update: async () => { throw new Error('a trip stop must not move the location here'); },
    },
  } as any;
}

const write = (pickup: Record<string, unknown>) =>
  writeTripStops(fakeTx(), {
    customerId: CUSTOMER,
    stops: [
      { stop_type: 'Pickup', location_id: RIYADH_ID, location_name: 'Riyadh', ...pickup },
      { stop_type: 'Dropoff', location_id: DAMMAM_ID, location_name: 'Dammam', lat: 26.4207, lng: 50.0888 },
    ],
  });

test('a stop at the pinned location, sent as "approximate", is saved exact', async () => {
  const { stopsToCreate } = await write({ lat: riyadh.lat, lng: riyadh.lng, coordinate_precision: 'APPROXIMATE' });
  assert.equal(stopsToCreate[0].location_coordinate_precision, 'EXACT');
  assert.equal(stopsToCreate[0].location_lat, riyadh.lat);
});

test('a stop still on the old city guess takes the location pin', async () => {
  const { stopsToCreate } = await write({ lat: 24.7136, lng: 46.6753 });
  assert.equal(stopsToCreate[0].location_coordinate_precision, 'EXACT');
  assert.deepEqual([stopsToCreate[0].location_lat, stopsToCreate[0].location_lng], [riyadh.lat, riyadh.lng]);
  assert.equal(stopsToCreate[0].location_address, riyadh.address);
});

test('a stop pinned exactly on its own keeps its pin', async () => {
  const { stopsToCreate } = await write({ lat: 24.8, lng: 46.7, coordinate_precision: 'EXACT' });
  assert.deepEqual([stopsToCreate[0].location_lat, stopsToCreate[0].location_lng], [24.8, 46.7]);
});

test('a yard inside the location (another name) keeps its own position', async () => {
  const { stopsToCreate } = await write({ location_name: 'Sulay Dock 4', lat: 24.6, lng: 46.8 });
  assert.deepEqual([stopsToCreate[0].location_lat, stopsToCreate[0].location_lng], [24.6, 46.8]);
  assert.notEqual(stopsToCreate[0].location_coordinate_precision, 'EXACT');
});

test('an unpinned location leaves the stop approximate', async () => {
  const { stopsToCreate } = await write({ lat: riyadh.lat, lng: riyadh.lng });
  assert.equal(stopsToCreate[1].location_coordinate_precision, 'APPROXIMATE');
});

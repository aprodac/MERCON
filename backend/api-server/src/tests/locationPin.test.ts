import test from 'node:test';
import assert from 'node:assert/strict';
import { isSamePlace, pinLocation, pinTripStop, PinError } from '../services/locationPin';
import { extractCoordsFromExpandedUrl, findGoogleMapsUrl, isShortMapsLink, parseRawCoordinates } from '@mercon/shared-types';

const PIN = { lat: 21.5433, lng: 39.1728, address: 'Gate 3, Al Khumrah, Jeddah' };

/** Records the writes a pin makes; reads come from the fixtures passed in. */
function fakeTx(opts: { location?: any; stop?: any; openStops?: any[] }) {
  const writes: { op: string; args: any }[] = [];
  const tx: any = {
    location: {
      update: async (args: any) => {
        writes.push({ op: 'location.update', args });
        return { ...opts.location, ...args.data };
      },
    },
    tripStop: {
      findFirst: async () => opts.stop ?? null,
      findMany: async () => opts.openStops ?? [],
      update: async (args: any) => {
        writes.push({ op: 'tripStop.update', args });
        return { ...opts.stop, ...args.data };
      },
      updateMany: async (args: any) => {
        writes.push({ op: 'tripStop.updateMany', args });
        return { count: args.where.id.in.length };
      },
    },
  };
  return { tx, writes };
}

const jeddahHub = { id: 'loc-1', name: 'Jeddah Hub', lat: 21.4858, lng: 39.1925, coordinate_precision: 'APPROXIMATE', deletedAt: null };

test('isSamePlace: same name (any case/spacing) or an unnamed stop is the location itself', () => {
  assert.equal(isSamePlace('jeddah  hub', 'Jeddah Hub'), true);
  assert.equal(isSamePlace(null, 'Jeddah Hub'), true);
  assert.equal(isSamePlace('Khumrah Dock 4', 'Jeddah'), false);
});

test('pinLocation marks the location exact and re-pins only same-place open stops', async () => {
  const { tx, writes } = fakeTx({
    location: jeddahHub,
    openStops: [
      { id: 's1', tripId: 't1', location_name: 'Jeddah Hub' },
      { id: 's2', tripId: 't2', location_name: null },
      { id: 's3', tripId: 't3', location_name: 'Some other yard' },
    ],
  });
  const r = await pinLocation(tx, 'loc-1', PIN, 'u1');

  const loc = writes.find((w) => w.op === 'location.update')!;
  assert.equal(loc.args.data.coordinate_precision, 'EXACT');
  assert.equal(loc.args.data.address, PIN.address);
  const many = writes.find((w) => w.op === 'tripStop.updateMany')!;
  assert.deepEqual(many.args.where.id.in, ['s1', 's2']);
  assert.equal(many.args.data.location_coordinate_precision, 'EXACT');
  assert.deepEqual(r.tripIds, ['t1', 't2']);
});

test('pinTripStop on the customer location itself also pins the location', async () => {
  const { tx, writes } = fakeTx({
    location: jeddahHub,
    stop: { id: 's1', tripId: 't1', location_name: 'Jeddah Hub', location_lat: 21.4858, location_lng: 39.1925, trip: { status: 'InTransit', deletedAt: null }, location: jeddahHub },
    openStops: [{ id: 's9', tripId: 't9', location_name: 'Jeddah Hub' }],
  });
  const r = await pinTripStop(tx, 't1', 's1', PIN, 'u1');
  assert.equal(writes[0].op, 'tripStop.update');
  assert.equal(writes[0].args.data.location_coordinate_precision, 'EXACT');
  assert.equal(r.locationPinned, true);
  assert.deepEqual(r.otherTripIds, ['t9']);
});

test('pinTripStop on a yard inside a lane-endpoint location leaves the location alone', async () => {
  const riyadh = { ...jeddahHub, id: 'loc-2', name: 'Riyadh' };
  const { tx, writes } = fakeTx({
    location: riyadh,
    stop: { id: 's1', tripId: 't1', location_name: 'Sulay Dock 7', location_lat: 24.6, location_lng: 46.8, trip: { status: 'Dispatched', deletedAt: null }, location: riyadh },
  });
  const r = await pinTripStop(tx, 't1', 's1', PIN, 'u1');
  assert.equal(r.locationPinned, false);
  assert.equal(writes.some((w) => w.op === 'location.update'), false);
});

test('pinTripStop does not overwrite an already-exact location with a different spot', async () => {
  const exact = { ...jeddahHub, coordinate_precision: 'EXACT' };
  const { tx, writes } = fakeTx({
    location: exact,
    stop: { id: 's1', tripId: 't1', location_name: 'Jeddah Hub', location_lat: 21.6, location_lng: 39.2, trip: { status: 'Draft', deletedAt: null }, location: exact },
  });
  const r = await pinTripStop(tx, 't1', 's1', PIN, 'u1');
  assert.equal(r.locationPinned, false);
  assert.equal(writes.some((w) => w.op === 'location.update'), false);
});

test('pinTripStop corrects an exact location when the stop still held its pin', async () => {
  const exact = { ...jeddahHub, coordinate_precision: 'EXACT' };
  const { tx } = fakeTx({
    location: exact,
    stop: { id: 's1', tripId: 't1', location_name: 'Jeddah Hub', location_lat: exact.lat, location_lng: exact.lng, trip: { status: 'Draft', deletedAt: null }, location: exact },
  });
  const r = await pinTripStop(tx, 't1', 's1', PIN, 'u1');
  assert.equal(r.locationPinned, true);
});

test('pinTripStop refuses a closed trip', async () => {
  const { tx } = fakeTx({
    stop: { id: 's1', tripId: 't1', location_name: 'X', trip: { status: 'Completed', deletedAt: null }, location: null },
  });
  await assert.rejects(() => pinTripStop(tx, 't1', 's1', PIN, 'u1'), (e: any) => e instanceof PinError && e.status === 409);
});

/* ─── Pasted location links (shared-types/mapsLink, used by /geocoding/resolve-location) ─── */

test('mapsLink: reads raw coordinates, finds a link inside a WhatsApp message, prefers the place pin over the viewport', () => {
  assert.deepEqual(parseRawCoordinates('21.5433, 39.1728'), { lat: 21.5433, lng: 39.1728 });
  assert.equal(parseRawCoordinates('Gate 5, 12'), null);
  const url = findGoogleMapsUrl('Jubail HUB location https://maps.app.goo.gl/PxkXa9omWQ');
  assert.equal(url, 'https://maps.app.goo.gl/PxkXa9omWQ');
  assert.equal(isShortMapsLink(url!), true);
  assert.deepEqual(
    extractCoordsFromExpandedUrl('https://www.google.com/maps/place/Hub/@21.50,39.10,17z/data=!3d21.5433!4d39.1728'),
    { lat: 21.5433, lng: 39.1728 }
  );
});

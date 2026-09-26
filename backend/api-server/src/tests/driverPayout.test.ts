import test from 'node:test';
import assert from 'node:assert/strict';

const ELIGIBLE_TRIP_STATUSES = ['Completed', 'Invoiced'];

export interface TripMockRow {
  id: string;
  driverId?: string | null;
  co_driver_id?: string | null;
  driver_payout?: number | { toNumber(): number } | null;
  co_driver_payout?: number | { toNumber(): number } | null;
  status: string;
  deletedAt?: Date | string | null;
}

/**
 * Pure function matching the backend driver payout aggregation logic
 */
export function calculateDriverPayouts(
  driverIds: string[],
  trips: TripMockRow[]
): Map<string, number> {
  const payoutMap = new Map<string, number>();

  for (const driverId of driverIds) {
    payoutMap.set(driverId, 0);
  }

  for (const trip of trips) {
    if (trip.deletedAt) continue;
    if (!ELIGIBLE_TRIP_STATUSES.includes(trip.status)) continue;

    if (trip.driverId && driverIds.includes(trip.driverId)) {
      const p =
        trip.driver_payout == null
          ? 0
          : typeof trip.driver_payout === 'number'
          ? trip.driver_payout
          : trip.driver_payout.toNumber();
      payoutMap.set(trip.driverId, (payoutMap.get(trip.driverId) || 0) + p);
    }

    if (trip.co_driver_id && driverIds.includes(trip.co_driver_id)) {
      const p =
        trip.co_driver_payout == null
          ? 0
          : typeof trip.co_driver_payout === 'number'
          ? trip.co_driver_payout
          : trip.co_driver_payout.toNumber();
      payoutMap.set(trip.co_driver_id, (payoutMap.get(trip.co_driver_id) || 0) + p);
    }
  }

  return payoutMap;
}

test('Phase 1C: Driver Payout Aggregation Unit Tests', async (t) => {
  await t.test('Test 1 — Primary driver payout', () => {
    const drivers = ['driver-A'];
    const trips: TripMockRow[] = [
      { id: 'trip-1', driverId: 'driver-A', driver_payout: 100, status: 'Completed' },
    ];
    const payouts = calculateDriverPayouts(drivers, trips);
    assert.equal(payouts.get('driver-A'), 100);
  });

  await t.test('Test 2 — Multiple primary trips (Completed + Invoiced)', () => {
    const drivers = ['driver-A'];
    const trips: TripMockRow[] = [
      { id: 'trip-1', driverId: 'driver-A', driver_payout: 100, status: 'Completed' },
      { id: 'trip-2', driverId: 'driver-A', driver_payout: 200, status: 'Invoiced' },
    ];
    const payouts = calculateDriverPayouts(drivers, trips);
    assert.equal(payouts.get('driver-A'), 300);
  });

  await t.test('Test 3 — Cancelled trip excluded', () => {
    const drivers = ['driver-A'];
    const trips: TripMockRow[] = [
      { id: 'trip-1', driverId: 'driver-A', driver_payout: 100, status: 'Completed' },
      { id: 'trip-2', driverId: 'driver-A', driver_payout: 500, status: 'Cancelled' },
      { id: 'trip-3', driverId: 'driver-A', driver_payout: 300, status: 'Scheduled' },
    ];
    const payouts = calculateDriverPayouts(drivers, trips);
    assert.equal(payouts.get('driver-A'), 100); // 500 cancelled & 300 scheduled excluded
  });

  await t.test('Test 4 — Co-driver payout', () => {
    const drivers = ['driver-A', 'driver-B'];
    const trips: TripMockRow[] = [
      {
        id: 'trip-1',
        driverId: 'driver-A',
        co_driver_id: 'driver-B',
        driver_payout: 100,
        co_driver_payout: 50,
        status: 'Completed',
      },
    ];
    const payouts = calculateDriverPayouts(drivers, trips);
    assert.equal(payouts.get('driver-A'), 100);
    assert.equal(payouts.get('driver-B'), 50);
  });

  await t.test('Test 5 — Mixed primary + co-driver', () => {
    const drivers = ['driver-A'];
    const trips: TripMockRow[] = [
      { id: 'trip-1', driverId: 'driver-A', driver_payout: 100, status: 'Completed' },
      { id: 'trip-2', driverId: 'driver-X', co_driver_id: 'driver-A', co_driver_payout: 40, status: 'Invoiced' },
    ];
    const payouts = calculateDriverPayouts(drivers, trips);
    assert.equal(payouts.get('driver-A'), 140);
  });

  await t.test('Test 6 — Deleted trip excluded', () => {
    const drivers = ['driver-A'];
    const trips: TripMockRow[] = [
      { id: 'trip-1', driverId: 'driver-A', driver_payout: 100, status: 'Completed', deletedAt: null },
      { id: 'trip-2', driverId: 'driver-A', driver_payout: 500, status: 'Completed', deletedAt: new Date() },
    ];
    const payouts = calculateDriverPayouts(drivers, trips);
    assert.equal(payouts.get('driver-A'), 100);
  });

  await t.test('Test 7 — Multiple drivers grouped aggregation isolation', () => {
    const drivers = ['driver-A', 'driver-B', 'driver-C'];
    const trips: TripMockRow[] = [
      { id: 'trip-1', driverId: 'driver-A', driver_payout: 150, status: 'Completed' },
      { id: 'trip-2', driverId: 'driver-B', driver_payout: 250, status: 'Completed' },
      { id: 'trip-3', driverId: 'driver-A', co_driver_id: 'driver-B', driver_payout: 50, co_driver_payout: 75, status: 'Invoiced' },
    ];
    const payouts = calculateDriverPayouts(drivers, trips);
    assert.equal(payouts.get('driver-A'), 200); // 150 + 50
    assert.equal(payouts.get('driver-B'), 325); // 250 + 75
    assert.equal(payouts.get('driver-C'), 0);
  });

  await t.test('Test 8 — Zero/no payout handled safely', () => {
    const drivers = ['driver-A'];
    const trips: TripMockRow[] = [];
    const payouts = calculateDriverPayouts(drivers, trips);
    assert.equal(payouts.get('driver-A'), 0);
  });
});

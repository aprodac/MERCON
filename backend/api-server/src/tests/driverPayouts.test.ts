import test from 'node:test';
import assert from 'node:assert/strict';
import { monthRange, summarisePayouts, type PayoutItem } from '../services/driverPayouts';

const item = (p: Partial<PayoutItem>): PayoutItem => ({
  month: '2026-09', driverId: 'd1', tripId: 't', tripRef: 'TRP-1', day: '2026-09-10', customer: 'SHIPA', lane: 'Riyadh → Dammam',
  role: 'driver', amount: 300, settlement: null, ...p,
});
const paid = { id: 's1', ref: 'DSET-0001', paidDate: '2026-09-30' };

test('months run inclusive and across years', () => {
  assert.deepEqual(monthRange('2026-11', '2027-02'), ['2026-11', '2026-12', '2027-01', '2027-02']);
  assert.deepEqual(monthRange('2026-09', '2026-09'), ['2026-09']);
});

test('earned, paid and still owed per month and per driver', () => {
  const r = summarisePayouts(
    [
      item({ amount: 300, settlement: paid }),
      item({ tripId: 't2', amount: 200 }),
      item({ driverId: 'd2', tripId: 't3', amount: 150, role: 'co_driver', settlement: paid }),
      item({ month: '2026-08', day: '2026-08-20', tripId: 't4', amount: 500 }),
    ],
    ['2026-07', '2026-08', '2026-09'],
  );
  assert.deepEqual(r.months.map((m) => [m.month, m.earned, m.paid, m.owed, m.trips, m.drivers]), [
    ['2026-07', 0, 0, 0, 0, 0],
    ['2026-08', 500, 0, 500, 1, 1],
    ['2026-09', 650, 450, 200, 3, 2],
  ]);
  const d1sep = r.drivers.find((d) => d.driverId === 'd1' && d.month === '2026-09')!;
  assert.deepEqual([d1sep.trips, d1sep.earned, d1sep.paid, d1sep.owed], [2, 500, 300, 200]);
  // Most owed first
  assert.equal(r.drivers[0].owed, 500);
});

test('items outside the months asked for are ignored', () => {
  const r = summarisePayouts([item({ month: '2026-01' })], ['2026-09']);
  assert.equal(r.months[0].earned, 0);
  assert.equal(r.drivers.length, 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { groupTrips, sortRows, totals, tripMargin, type ProfitTrip } from './engine';

const trip = (p: Partial<ProfitTrip>): ProfitTrip => ({
  id: 't', refId: 'TRP-1', day: '2026-09-10', customerId: 'c1', customer: 'SHIPA', lane: 'Riyadh → Dammam',
  vehicleId: 'v1', vehicle: 'ABC-1234', driver: 'Ahmed', thirdParty: false, status: 'Completed',
  revenue: 1000, driverPay: 300, subcontract: 0, expenses: 100, ...p,
});

test('a trip margin is billing minus driver pay, subcontract and its expenses', () => {
  assert.equal(tripMargin(trip({})), 600);
  assert.equal(tripMargin(trip({ thirdParty: true, driverPay: 0, subcontract: 900, expenses: 0 })), 100);
});

test('totals count losses, and trips without a price separately', () => {
  const t = totals([trip({}), trip({ id: 'b', revenue: 200 }), trip({ id: 'c', revenue: 0, driverPay: 300, expenses: 0 })]);
  assert.equal(t.trips, 3);
  assert.equal(t.revenue, 1200);
  assert.equal(t.cost, 1100);
  assert.equal(t.margin, 100);
  assert.equal(t.marginPct, 8.3);
  assert.equal(t.lossTrips, 1);
  assert.equal(t.unpricedTrips, 1);
  assert.equal(totals([]).marginPct, null);
});

test('groups by customer, lane and truck; subcontracted trips have their own truck group', () => {
  const trips = [trip({}), trip({ id: 'b', customerId: 'c2', customer: 'AKS' }), trip({ id: 'c', vehicleId: null, vehicle: null, thirdParty: true })];
  assert.deepEqual(groupTrips(trips, 'customer').map((g) => [g.label, g.trips]), [['SHIPA', 2], ['AKS', 1]]);
  assert.equal(groupTrips(trips, 'lane').length, 1);
  assert.deepEqual(groupTrips(trips, 'vehicle').map((g) => g.label).sort(), ['ABC-1234', 'Subcontracted']);
});

test('sorts worst margin % first, unpriced last', () => {
  const rows = [
    { id: 'a', margin: 50, marginPct: 50, revenue: 100 },
    { id: 'b', margin: -20, marginPct: -10, revenue: 200 },
    { id: 'c', margin: -300, marginPct: null, revenue: 0 },
  ];
  assert.deepEqual(sortRows(rows, 'margin_pct', false).map((r) => r.id), ['b', 'a', 'c']);
  assert.deepEqual(sortRows(rows, 'margin', true).map((r) => r.id), ['a', 'b', 'c']);
});

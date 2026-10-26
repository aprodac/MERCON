import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { copyTripBody, daysBetween, repeatBlocker, repeatSummary, shiftToDay, type SourceTrip, type RepeatResult } from '../services/repeatTrips';

const TZ = 'Asia/Riyadh';
// 20 Oct 08:00 Riyadh = 05:00Z
const source = (o: Partial<SourceTrip> = {}): SourceTrip => ({
  id: 't1', customerId: 'c1', driverId: 'd1', co_driver_id: null, vehicleId: 'v1', quotationId: 'q1',
  vehicle_type: '5 TON', rate_category: 'Round Trip', operation_type: 'Extra',
  billing_amount: '1200.00', driver_payout: '300.00', co_driver_payout: '0', is_third_party: false,
  planned_start: new Date('2026-10-20T05:00:00Z'), planned_end: new Date('2026-10-20T17:00:00Z'),
  charges: [{ charge_type: 'Waiting', rate: '50', quantity: 2, amount: '100', surchargeRuleId: 's1' }],
  stops: [
    { stop_type: 'Dropoff', stop_sequence: 2, leg_index: 0, location_lat: 17.5, location_lng: 44.1, location_name: 'Najran', location_address: 'Najran DC', locationId: 'l2', planned_arrival: new Date('2026-10-20T09:00:00Z') },
    { stop_type: 'Pickup', stop_sequence: 1, leg_index: 0, location_lat: 18.3, location_lng: 42.7, location_name: 'Khamis', location_address: null, locationId: 'l1', planned_arrival: new Date('2026-10-20T05:00:00Z') },
  ],
  ...o,
});

describe('repeat trips: dates', () => {
  it('counts days between two dates', () => {
    assert.equal(daysBetween('2026-10-20', '2026-10-27'), 7);
    assert.equal(daysBetween('2026-10-20', '2026-10-19'), -1);
    assert.equal(daysBetween('2026-12-30', '2027-01-02'), 3);
  });

  it('keeps the time of day in the deployment zone, with an optional shift', () => {
    assert.equal(shiftToDay(new Date('2026-10-20T05:00:00Z'), '2026-10-28', 0, TZ).toISOString(), '2026-10-28T05:00:00.000Z');
    assert.equal(shiftToDay(new Date('2026-10-20T05:00:00Z'), '2026-10-28', 90, TZ).toISOString(), '2026-10-28T06:30:00.000Z');
    assert.equal(shiftToDay(new Date('2026-10-20T05:00:00Z'), '2026-10-28', -60, TZ).toISOString(), '2026-10-28T04:00:00.000Z');
    // 22:00Z on the 20th is 01:00 on the 21st in Riyadh → moves by the Riyadh day
    assert.equal(shiftToDay(new Date('2026-10-20T22:00:00Z'), '2026-10-28', 0, TZ).toISOString(), '2026-10-27T22:00:00.000Z');
  });
});

describe('repeat trips: the copy', () => {
  const body = copyTripBody(source(), { targetDay: '2026-10-28', shiftMin: 0, tz: TZ });

  it('carries customer, quotation, truck, driver, type, price and payout', () => {
    assert.equal(body.customer_id, 'c1');
    assert.equal(body.quotation_id, 'q1');
    assert.equal(body.vehicle_id, 'v1');
    assert.equal(body.driver_id, 'd1');
    assert.equal(body.vehicle_type, '5 TON');
    assert.equal(body.rate_category, 'Round Trip');
    assert.equal(body.billing_type, 'Extra');
    assert.equal(body.billing_amount, 1200);
    assert.equal(body.trip_charges, 300);
    assert.equal(body.status, 'Scheduled');
  });

  it('moves the start, end and every stop to the new day at the same times', () => {
    assert.equal(body.planned_start, '2026-10-28T05:00:00.000Z');
    assert.equal(body.planned_end, '2026-10-28T17:00:00.000Z');
    assert.deepEqual(body.stops.map((s) => s.planned_arrival), ['2026-10-28T05:00:00.000Z', '2026-10-28T09:00:00.000Z']);
  });

  it('copies the route in stop order with places and legs', () => {
    assert.deepEqual(body.stops.map((s) => [s.stop_type, s.location_name, s.leg_index, s.stop_sequence, s.location_id]), [['Pickup', 'Khamis', 0, 1, 'l1'], ['Dropoff', 'Najran', 0, 2, 'l2']]);
    assert.equal(body.stops[1].location_address, 'Najran DC');
    assert.equal(body.stops[0].lat, 18.3);
  });

  it('copies the extras', () => {
    assert.deepEqual(body.charges, [{ charge_type: 'Waiting', rate: 50, quantity: 2, amount: 100, surchargeRuleId: 's1' }]);
  });

  it('shifts every time by the optional shift', () => {
    const b = copyTripBody(source(), { targetDay: '2026-10-28', shiftMin: 30, tz: TZ });
    assert.equal(b.planned_start, '2026-10-28T05:30:00.000Z');
    assert.equal(b.stops[1].planned_arrival, '2026-10-28T09:30:00.000Z');
  });

  it('keeps a co-driver’s payout separate so it is not split again', () => {
    const b = copyTripBody(source({ co_driver_id: 'd2', driver_payout: '150', co_driver_payout: '150' }), { targetDay: '2026-10-28', shiftMin: 0, tz: TZ });
    assert.equal(b.co_driver_id, 'd2');
    assert.equal(b.trip_charges, 150);
    assert.equal(b.co_driver_payout, 150);
  });

  it('copies a subcontracted trip’s carrier', () => {
    const b = copyTripBody(source({ is_third_party: true, driverId: null, vehicleId: null, subcontract: { providerId: 'p1', driverName: 'Sami', driverPhone: '0500000000', vehiclePlate: 'ABC 123', vehicleType: '5 TON', cost: '900' } }), { targetDay: '2026-10-28', shiftMin: 0, tz: TZ });
    assert.equal(b.is_third_party, true);
    assert.equal(b.third_party_provider_id, 'p1');
    assert.equal(b.third_party_cost, 900);
    assert.equal('driver_id' in b, false);
  });
});

describe('repeat trips: what can’t be repeated and the result line', () => {
  const ok = { status: 'Completed', deletedAt: null, planned_start: new Date(), stops: [1, 2] };
  it('blocks cancelled, deleted, unscheduled and route-less trips', () => {
    assert.equal(repeatBlocker(ok), null);
    assert.match(repeatBlocker({ ...ok, status: 'Cancelled' })!, /cancelled/);
    assert.match(repeatBlocker({ ...ok, deletedAt: new Date() })!, /deleted/);
    assert.match(repeatBlocker({ ...ok, planned_start: null })!, /start/);
    assert.match(repeatBlocker({ ...ok, stops: [1] })!, /route/);
  });

  it('says "16 created, 2 skipped (reason)"', () => {
    const results: RepeatResult[] = [
      ...Array.from({ length: 16 }, (_, i) => ({ trip_id: `t${i}`, status: 'created' as const, new_trip_id: `n${i}`, new_ref: `TRP-${i}` })),
      { trip_id: 'x1', status: 'skipped', reason: 'The trip was cancelled' },
      { trip_id: 'x2', status: 'skipped', reason: 'The trip was cancelled' },
    ];
    assert.equal(repeatSummary(results).text, '16 created, 2 skipped (The trip was cancelled)');
    assert.equal(repeatSummary([...results, { trip_id: 'c', status: 'clash', clashes: [] }]).text, '16 created, 2 skipped (The trip was cancelled), 1 needs a decision');
  });
});

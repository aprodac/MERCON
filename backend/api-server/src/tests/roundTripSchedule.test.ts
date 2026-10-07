import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildTripRows, validateTripDraft, zonedWallTimeToUtcIso, slotScheduleFor, type TripSlotDraft } from '@mercon/shared-types';

// Riyadh 20:00 → Jeddah next morning 10:00 → load 20:00 → Riyadh the morning after.
const toUtcIso = (d: string, t: string) => zonedWallTimeToUtcIso(d, t, 'Asia/Riyadh');
const base = { id: 's', origin: 'Riyadh', destination: 'Jeddah', intermediateLocations: [], tripCharges: '190', billingAmount: '1000', driverPayout: '190' };
const common = {
  customerId: 'c', vehicleType: '5 TON', rateCategory: 'ROUND_TRIP', assignmentType: 'own', masterDriver: 'd', masterCoDriver: '', masterVehicle: 'v',
  thirdPartyProviderId: '', thirdPartyDriverName: '', thirdPartyDriverPhone: '', thirdPartyVehiclePlate: '', thirdPartyCost: '', awbNumber: '', dayAssignments: {}, toUtcIso,
};
const times = (slot: TripSlotDraft, billingType: string, selectedDates: string[]) =>
  buildTripRows({ ...common, slots: [slot], billingType, selectedDates }).map((r) => [r.planned_start, ...r.stops.map((s) => s.planned_arrival), r.planned_end]);
const issues = (slot: TripSlotDraft, billingType: string, selectedDates: string[]) =>
  validateTripDraft({ ...common, slots: [slot], billingType, selectedDates }).map((i) => i.message);

const expected = (d: string, d1: string, d2: string) => [`${d}T17:00:00.000Z`, `${d}T17:00:00.000Z`, `${d1}T07:00:00.000Z`, `${d1}T17:00:00.000Z`, `${d2}T07:00:00.000Z`, `${d2}T07:00:00.000Z`];

describe('round trip — return leg on its own day', () => {
  it('single trip: dates on every leg', () => {
    const slot = { ...base, date: '2026-10-07', pickupTime: '20:00', dropoffDate: '2026-10-08', dropoffTime: '10:00', returnPickupDate: '2026-10-08', returnPickupTime: '20:00', returnDropoffDate: '2026-10-09', returnDropoffTime: '10:00' } as TripSlotDraft;
    assert.deepEqual(times(slot, 'Per Trip', []), [expected('2026-10-07', '2026-10-08', '2026-10-09')]);
    assert.deepEqual(issues(slot, 'Per Trip', []), []);
  });

  it('monthly: Day 1 → Day 2 → Day 2 → Day 3, repeated on every operating day', () => {
    const slot = { ...base, date: '', pickupTime: '20:00', dropoffTime: '10:00', dropoffDay: 1, returnPickupTime: '20:00', returnPickupDay: 1, returnDropoffTime: '10:00', returnDropoffDay: 2 } as TripSlotDraft;
    assert.deepEqual(times(slot, 'Monthly', ['2026-10-07', '2026-10-08']), [expected('2026-10-07', '2026-10-08', '2026-10-09'), expected('2026-10-08', '2026-10-09', '2026-10-10')]);
    assert.deepEqual(issues(slot, 'Monthly', ['2026-10-07']), []);
  });

  it('monthly: a day wins over the "earlier time = next day" guess', () => {
    const slot = { ...base, date: '', pickupTime: '20:00', dropoffTime: '10:00', dropoffDay: 1, returnPickupTime: '20:00', returnPickupDay: 3, returnDropoffTime: '10:00', returnDropoffDay: 4 } as TripSlotDraft;
    const [row] = times(slot, 'Monthly', ['2026-10-07']);
    assert.equal(row[3], '2026-10-10T17:00:00.000Z');
    assert.equal(row[5], '2026-10-11T07:00:00.000Z');
  });

  it('monthly: arrival home before loading is refused', () => {
    const slot = { ...base, date: '', pickupTime: '20:00', dropoffTime: '10:00', dropoffDay: 1, returnPickupTime: '20:00', returnPickupDay: 1, returnDropoffTime: '10:00', returnDropoffDay: 1 } as TripSlotDraft;
    assert.deepEqual(issues(slot, 'Monthly', ['2026-10-07']), ['Return arrival must be after return loading']);
  });

  it('monthly: a stale return date left by the arrival estimate no longer breaks the check', () => {
    const slot = { ...base, date: '2026-10-07', pickupTime: '20:00', dropoffTime: '10:00', returnPickupTime: '20:00', returnDropoffTime: '10:53', returnDropoffDate: '2026-10-08' } as TripSlotDraft;
    assert.deepEqual(issues(slotScheduleFor(slot, true, true), 'Monthly', ['2026-10-07']), []);
  });

  it('single trip ignores days left over from monthly', () => {
    const slot = { ...base, date: '2026-10-07', pickupTime: '08:00', dropoffDate: '2026-10-07', dropoffTime: '18:00', dropoffDay: 2 } as TripSlotDraft;
    const [row] = times(slotScheduleFor(slot, false, true), 'Per Trip', []);
    assert.equal(row[2], '2026-10-07T15:00:00.000Z');
  });
});

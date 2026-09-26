import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TripStatus } from '@prisma/client';

import { resolveDriverPayout, resolveInitialTripStatus, splitCoDriverPayout } from '../utils/tripFinancials';

describe('resolveDriverPayout', () => {
  it('an explicit requested payout always wins, even over a third-party subcontract cost', () => {
    const result = resolveDriverPayout({
      currentDriverPayout: 500,
      isThirdParty: true,
      subcontractCost: 900,
      requestedPayoutRaw: 750,
    });
    assert.equal(result, 750);
  });

  it('an explicit requested payout of 0 still wins over the current payout', () => {
    const result = resolveDriverPayout({
      currentDriverPayout: 500,
      isThirdParty: false,
      subcontractCost: null,
      requestedPayoutRaw: 0,
    });
    assert.equal(result, 0);
  });

  it('an explicit but unparseable requested payout falls back to 0, not the current payout', () => {
    const result = resolveDriverPayout({
      currentDriverPayout: 500,
      isThirdParty: false,
      subcontractCost: null,
      requestedPayoutRaw: 'not-a-number',
    });
    assert.equal(result, 0);
  });

  it('a third-party trip with no explicit value uses the subcontract cost', () => {
    const result = resolveDriverPayout({
      currentDriverPayout: 500,
      isThirdParty: true,
      subcontractCost: 900,
      requestedPayoutRaw: undefined,
    });
    assert.equal(result, 900);
  });

  it('a third-party trip with no subcontract cost falls back to the current payout', () => {
    const result = resolveDriverPayout({
      currentDriverPayout: 500,
      isThirdParty: true,
      subcontractCost: null,
      requestedPayoutRaw: undefined,
    });
    assert.equal(result, 500);
  });

  it('a non-third-party trip with no explicit value keeps the current payout', () => {
    const result = resolveDriverPayout({
      currentDriverPayout: 500,
      isThirdParty: false,
      subcontractCost: undefined,
      requestedPayoutRaw: undefined,
    });
    assert.equal(result, 500);
  });

  it('accepts a Prisma Decimal-like value (toNumber()) for currentDriverPayout and subcontractCost', () => {
    const decimal = (n: number) => ({ toNumber: () => n });
    const fromCurrent = resolveDriverPayout({
      currentDriverPayout: decimal(321),
      isThirdParty: false,
      subcontractCost: undefined,
      requestedPayoutRaw: undefined,
    });
    assert.equal(fromCurrent, 321);

    const fromSubcontract = resolveDriverPayout({
      currentDriverPayout: 0,
      isThirdParty: true,
      subcontractCost: decimal(654),
      requestedPayoutRaw: undefined,
    });
    assert.equal(fromSubcontract, 654);
  });

  it('a missing current payout with no other input resolves to 0', () => {
    const result = resolveDriverPayout({
      currentDriverPayout: undefined,
      isThirdParty: false,
      subcontractCost: undefined,
      requestedPayoutRaw: undefined,
    });
    assert.equal(result, 0);
  });
});

describe('resolveInitialTripStatus', () => {
  it('keeps the initial status when there is no planned start', () => {
    const result = resolveInitialTripStatus(TripStatus.Scheduled, TripStatus.Scheduled, null);
    assert.equal(result, TripStatus.Scheduled);
  });

  it('keeps the initial status when the planned start is in the future', () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    const result = resolveInitialTripStatus(TripStatus.Scheduled, TripStatus.Scheduled, future);
    assert.equal(result, TripStatus.Scheduled);
  });

  it('forces Delayed when the planned start has passed and no status was requested', () => {
    const past = new Date(Date.now() - 60 * 60 * 1000);
    const result = resolveInitialTripStatus(TripStatus.Scheduled, undefined, past);
    assert.equal(result, TripStatus.Delayed);
  });

  it('forces Delayed when the planned start has passed and Scheduled was requested', () => {
    const past = new Date(Date.now() - 60 * 60 * 1000);
    const result = resolveInitialTripStatus(TripStatus.Scheduled, TripStatus.Scheduled, past);
    assert.equal(result, TripStatus.Delayed);
  });

  it('forces Delayed when the planned start has passed and Draft was requested', () => {
    const past = new Date(Date.now() - 60 * 60 * 1000);
    const result = resolveInitialTripStatus(TripStatus.Draft, TripStatus.Draft, past);
    assert.equal(result, TripStatus.Delayed);
  });

  it('forces Delayed for the raw string "Scheduled" too, matching createTrip\'s defensive check', () => {
    const past = new Date(Date.now() - 60 * 60 * 1000);
    const result = resolveInitialTripStatus(TripStatus.Scheduled, 'Scheduled', past);
    assert.equal(result, TripStatus.Delayed);
  });

  it('leaves an already-active status alone even with a past planned start', () => {
    const past = new Date(Date.now() - 60 * 60 * 1000);
    const result = resolveInitialTripStatus(TripStatus.InTransit, TripStatus.InTransit, past);
    assert.equal(result, TripStatus.InTransit);
  });
});

describe('splitCoDriverPayout', () => {
  it('no co-driver: driver keeps the full payout, co-driver gets 0', () => {
    const result = splitCoDriverPayout({ totalPayout: 1000, hasCoDriver: false, explicitCoDriverPayout: undefined });
    assert.deepEqual(result, { driverPayout: 1000, coDriverPayout: 0 });
  });

  it('co-driver with an explicit payout: split is not applied, explicit value is used as-is', () => {
    const result = splitCoDriverPayout({ totalPayout: 1000, hasCoDriver: true, explicitCoDriverPayout: 300 });
    assert.deepEqual(result, { driverPayout: 1000, coDriverPayout: 300 });
  });

  it('co-driver with no explicit payout and a positive total: splits evenly', () => {
    const result = splitCoDriverPayout({ totalPayout: 1000, hasCoDriver: true, explicitCoDriverPayout: undefined });
    assert.deepEqual(result, { driverPayout: 500, coDriverPayout: 500 });
  });

  it('co-driver with a null explicit payout is treated the same as undefined', () => {
    const result = splitCoDriverPayout({ totalPayout: 1000, hasCoDriver: true, explicitCoDriverPayout: null });
    assert.deepEqual(result, { driverPayout: 500, coDriverPayout: 500 });
  });

  it('a zero total payout is never split, even with a co-driver', () => {
    const result = splitCoDriverPayout({ totalPayout: 0, hasCoDriver: true, explicitCoDriverPayout: undefined });
    assert.deepEqual(result, { driverPayout: 0, coDriverPayout: 0 });
  });

  it('rounds an odd total to 2 decimal places on each half', () => {
    const result = splitCoDriverPayout({ totalPayout: 999.99, hasCoDriver: true, explicitCoDriverPayout: undefined });
    assert.deepEqual(result, { driverPayout: 500, coDriverPayout: 500 });
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { describeTripAcknowledged, describeTripPhoto, describeTripStatusChange, driverDisplayName, tripName, type DriverUpdateContext } from './messages';

const stop = (id: string, seq: number, name: string, leg = 0) => ({ id, stop_sequence: seq, leg_index: leg, location_name: name });

const oneWay: DriverUpdateContext = {
  trip: 'Trip TRP-0042',
  driverName: 'Ahmed Ali',
  stops: [stop('p', 1, 'Jeddah Port'), stop('m', 2, 'Bahra Yard'), stop('d', 3, 'Riyadh DC')],
};

const roundTrip: DriverUpdateContext = {
  ...oneWay,
  stops: [stop('p', 1, 'Jeddah Port'), stop('d', 2, 'Riyadh DC'), stop('rp', 3, 'Riyadh DC', 1), stop('rd', 4, 'Jeddah Port', 1)],
};

describe('describeTripStatusChange', () => {
  it('names the place for each step of a one-way trip', () => {
    const step = (fromStatus: string, toStatus: string, toWorkflow: string) =>
      describeTripStatusChange({ fromStatus, toStatus, fromWorkflow: null, toWorkflow }, oneWay);

    assert.deepEqual(step('Scheduled', 'Scheduled', 'GOING_TO_PICKUP'), {
      title: 'Trip started',
      message: 'Trip TRP-0042 — Ahmed Ali started the trip and is driving to Jeddah Port.',
    });
    assert.equal(step('Scheduled', 'Loading', 'ARRIVED_AT_PICKUP')?.message, 'Trip TRP-0042 — Ahmed Ali arrived at Jeddah Port.');
    assert.equal(step('Loading', 'Loading', 'LOADING')?.title, 'Loading');
    assert.equal(step('Loading', 'InTransit', 'GOING_TO_STOP')?.message, 'Trip TRP-0042 — Ahmed Ali loaded and left Jeddah Port for Riyadh DC.');
    assert.equal(step('InTransit', 'InTransit', 'ARRIVED_AT_DELIVERY')?.message, 'Trip TRP-0042 — Ahmed Ali arrived at Riyadh DC.');
  });

  it('says which intermediate stop was finished', () => {
    const a = describeTripStatusChange(
      { fromStatus: 'InTransit', toStatus: 'InTransit', fromWorkflow: 'GOING_TO_STOP', toWorkflow: 'IN_TRANSIT', completedStopId: 'm' },
      oneWay,
    );
    assert.deepEqual(a, { title: 'Stop done', message: 'Trip TRP-0042 — Ahmed Ali finished at Bahra Yard and is moving on.' });
  });

  it('follows a round trip onto the return leg', () => {
    const delivered = describeTripStatusChange({ fromStatus: 'InTransit', toStatus: 'Loading', toWorkflow: 'RETURN_LOADING' }, roundTrip);
    assert.equal(delivered?.message, 'Trip TRP-0042 — Ahmed Ali delivered at Riyadh DC and is loading for the return at Riyadh DC.');
    const final = describeTripStatusChange({ fromStatus: 'InTransit', toStatus: 'InTransit', toWorkflow: 'ARRIVED_AT_FINAL_DELIVERY' }, roundTrip);
    assert.equal(final?.message, 'Trip TRP-0042 — Ahmed Ali arrived at Jeddah Port.');
  });

  it('names the last delivery on completion', () => {
    const a = describeTripStatusChange({ fromStatus: 'InTransit', toStatus: 'Completed', toWorkflow: 'COMPLETED' }, roundTrip);
    assert.deepEqual(a, { title: 'Trip completed', message: 'Trip TRP-0042 — Ahmed Ali delivered at Jeddah Port and completed the trip.' });
  });

  it("passes on the driver's delay reason", () => {
    const a = describeTripStatusChange({ fromStatus: 'InTransit', toStatus: 'Delayed', delayReason: ' Traffic at the port gate ' }, oneWay);
    assert.deepEqual(a, { title: 'Delay reported', message: 'Trip TRP-0042 — Ahmed Ali reported a delay: Traffic at the port gate' });
  });

  it('stays quiet when the app re-sends a step it already sent', () => {
    assert.equal(
      describeTripStatusChange({ fromStatus: 'Loading', toStatus: 'Loading', fromWorkflow: 'LOADING', toWorkflow: 'LOADING' }, oneWay),
      null,
    );
    assert.equal(describeTripStatusChange({ fromStatus: 'InTransit', toStatus: 'InTransit', fromWorkflow: 'IN_TRANSIT' }, oneWay), null);
  });

  it('falls back to generic wording without stops or a known workflow', () => {
    const bare = { ...oneWay, stops: [] };
    assert.equal(
      describeTripStatusChange({ fromStatus: 'Scheduled', toStatus: 'Loading', toWorkflow: 'ARRIVED_AT_PICKUP' }, bare)?.message,
      'Trip TRP-0042 — Ahmed Ali arrived at the pickup.',
    );
    assert.equal(describeTripStatusChange({ fromStatus: 'Loading', toStatus: 'InTransit', toWorkflow: 'SOMETHING_NEW' }, bare)?.title, 'On the way');
  });
});

describe('describeTripPhoto', () => {
  it('names the batch and the place', () => {
    assert.deepEqual(describeTripPhoto({ kind: 'cargo', isVideo: false, operation: 'pickup', stopId: 'p' }, oneWay), {
      title: 'Cargo photos',
      message: 'Trip TRP-0042 — Ahmed Ali sent cargo photos at Jeddah Port.',
    });
    assert.equal(describeTripPhoto({ kind: 'pod', isVideo: false, stopId: 'd' }, oneWay).title, 'Delivery photos');
    assert.equal(
      describeTripPhoto({ kind: 'pod', isVideo: false, operation: 'return_delivery' }, roundTrip).message,
      'Trip TRP-0042 — Ahmed Ali sent delivery (POD) photos at Jeddah Port.',
    );
    assert.equal(describeTripPhoto({ kind: 'cargo', isVideo: true, operation: 'delay' }, oneWay).title, 'Delay video');
    assert.equal(describeTripPhoto({ kind: 'cargo', isVideo: true, stopId: 'unknown' }, oneWay).message, 'Trip TRP-0042 — Ahmed Ali sent a video.');
  });
});

describe('names', () => {
  it('falls back when the trip or driver has no name', () => {
    assert.equal(tripName(null), 'A trip');
    assert.equal(driverDisplayName({ first_name: ' ', last_name: null }), 'The driver');
    assert.equal(describeTripAcknowledged(oneWay).title, 'Trip acknowledged');
  });
});

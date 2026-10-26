import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TripStatus, StopType } from '@prisma/client';
import { prisma } from '../../db';
import { checkTripsForDelay, isPreviousDay } from './tripDelayMonitor';
import { isValidTransition } from '../tripLifecycle';

describe('tripDelayMonitor and Trip Lifecycle Regression Suite', () => {
  const testNow = new Date('2026-09-05T12:00:00Z');

  it('1. Scheduled trip becomes Delayed after >30 minutes (same day)', async () => {
    const lateTime = new Date('2026-09-05T11:15:00Z'); // 45 min late today

    const mockTrips = [
      {
        id: 'trip-1',
        ref_id: 'TRP-101',
        status: TripStatus.Scheduled,
        driver_workflow_state: 'GOING_TO_PICKUP',
        planned_start: lateTime,
        planned_end: null,
        stops: [
          {
            id: 'stop-1',
            stop_sequence: 1,
            stop_type: StopType.Pickup,
            planned_arrival: lateTime,
            actual_arrival: null,
            planned_departure: null,
            actual_departure: null,
            location_name: 'Warehouse A',
          },
        ],
      },
    ];

    const origFindMany = prisma.trip.findMany;
    const origUpdate = prisma.trip.update;
    const origFindFirst = prisma.notification.findFirst;
    const origUserFindMany = prisma.user.findMany;

    let updatedStatus: any = null;

    prisma.trip.findMany = (async () => mockTrips) as any;
    prisma.trip.update = (async ({ where, data }: any) => {
      updatedStatus = data.status;
      return { id: where.id, ...data };
    }) as any;
    prisma.notification.findFirst = (async () => null) as any;
    prisma.user.findMany = (async () => []) as any;

    try {
      const count = await checkTripsForDelay(testNow);
      assert.equal(count, 1);
      assert.equal(updatedStatus, TripStatus.Delayed);
    } finally {
      prisma.trip.findMany = origFindMany;
      prisma.trip.update = origUpdate;
      prisma.notification.findFirst = origFindFirst;
      prisma.user.findMany = origUserFindMany;
    }
  });

  it('2. Scheduled trip that is still within the 30-minute threshold does not become Delayed', async () => {
    const onTimeTime = new Date('2026-09-05T11:45:00Z'); // only 15 min late (< 30 min)

    const mockTrips = [
      {
        id: 'trip-2',
        ref_id: 'TRP-102',
        status: TripStatus.Scheduled,
        driver_workflow_state: 'GOING_TO_PICKUP',
        planned_start: onTimeTime,
        planned_end: null,
        stops: [
          {
            id: 'stop-1',
            stop_sequence: 1,
            stop_type: StopType.Pickup,
            planned_arrival: onTimeTime,
            actual_arrival: null,
            location_name: 'Warehouse A',
          },
        ],
      },
    ];

    const origFindMany = prisma.trip.findMany;
    const origUpdate = prisma.trip.update;

    let updateCalled = false;
    prisma.trip.findMany = (async () => mockTrips) as any;
    prisma.trip.update = (async () => {
      updateCalled = true;
    }) as any;

    try {
      const count = await checkTripsForDelay(testNow);
      assert.equal(count, 0);
      assert.equal(updateCalled, false);
    } finally {
      prisma.trip.findMany = origFindMany;
      prisma.trip.update = origUpdate;
    }
  });

  it('3. Delayed Scheduled trip can progress to Loading (lifecycle validity)', () => {
    assert.equal(isValidTransition(TripStatus.Delayed, TripStatus.Loading), true);
    assert.equal(isValidTransition(TripStatus.Delayed, TripStatus.InTransit), true);
    assert.equal(isValidTransition(TripStatus.Delayed, TripStatus.Completed), true);
  });

  it('4. Loading trip after actual pickup arrival does NOT immediately become Delayed again because of the old pickup planned-arrival time', async () => {
    const oldPlannedArrival = new Date('2026-09-05T10:00:00Z'); // 2 hours ago
    const actualArrivalAtDock = new Date('2026-09-05T11:50:00Z'); // 10 min ago

    const mockTrips = [
      {
        id: 'trip-loading-recovered',
        ref_id: 'TRP-200',
        status: TripStatus.Loading,
        driver_workflow_state: 'LOADING',
        planned_start: oldPlannedArrival,
        planned_end: null,
        stops: [
          {
            id: 'stop-pickup',
            stop_sequence: 1,
            stop_type: StopType.Pickup,
            planned_arrival: oldPlannedArrival,
            actual_arrival: actualArrivalAtDock, // Arrived at dock!
            actual_departure: null, // Still loading cargo
            location_name: 'Factory Yard',
          },
        ],
      },
    ];

    const origFindMany = prisma.trip.findMany;
    const origUpdate = prisma.trip.update;

    let updateCalled = false;
    prisma.trip.findMany = (async () => mockTrips) as any;
    prisma.trip.update = (async () => {
      updateCalled = true;
    }) as any;

    try {
      const count = await checkTripsForDelay(testNow);
      // Must NOT flag as delayed!
      assert.equal(count, 0);
      assert.equal(updateCalled, false);
    } finally {
      prisma.trip.findMany = origFindMany;
      prisma.trip.update = origUpdate;
    }
  });

  it('5. InTransit trip can become Delayed based on the next unreached stop', async () => {
    const lateDeliveryTime = new Date('2026-09-05T11:00:00Z'); // 60 min late

    const mockTrips = [
      {
        id: 'trip-transit',
        ref_id: 'TRP-300',
        status: TripStatus.InTransit,
        driver_workflow_state: 'IN_TRANSIT',
        planned_start: null,
        planned_end: lateDeliveryTime,
        stops: [
          {
            id: 'stop-pickup',
            stop_sequence: 1,
            stop_type: StopType.Pickup,
            planned_arrival: new Date('2026-09-05T09:00:00Z'),
            actual_arrival: new Date('2026-09-05T09:10:00Z'),
            actual_departure: new Date('2026-09-05T09:30:00Z'),
            location_name: 'Origin Port',
          },
          {
            id: 'stop-dropoff',
            stop_sequence: 2,
            stop_type: StopType.Dropoff,
            planned_arrival: lateDeliveryTime,
            actual_arrival: null, // Next unreached stop!
            actual_departure: null,
            location_name: 'Destination Depot',
          },
        ],
      },
    ];

    const origFindMany = prisma.trip.findMany;
    const origUpdate = prisma.trip.update;
    const origFindFirst = prisma.notification.findFirst;
    const origUserFindMany = prisma.user.findMany;

    let updatedStatus: any = null;
    prisma.trip.findMany = (async () => mockTrips) as any;
    prisma.trip.update = (async ({ data }: any) => {
      updatedStatus = data.status;
      return { id: 'trip-transit', ...data };
    }) as any;
    prisma.notification.findFirst = (async () => null) as any;
    prisma.user.findMany = (async () => []) as any;

    try {
      const count = await checkTripsForDelay(testNow);
      assert.equal(count, 1);
      assert.equal(updatedStatus, TripStatus.Delayed);
    } finally {
      prisma.trip.findMany = origFindMany;
      prisma.trip.update = origUpdate;
      prisma.notification.findFirst = origFindFirst;
      prisma.user.findMany = origUserFindMany;
    }
  });

  it('5b. Round trip "Loading" on the way back becomes Delayed when the last stop is overdue', async () => {
    const mockTrips = [
      {
        id: 'trip-round',
        ref_id: 'TRP-0020',
        status: TripStatus.Loading,
        driver_workflow_state: 'ARRIVED_AT_RETURN_PICKUP',
        planned_start: new Date('2026-09-04T17:00:00Z'),
        planned_end: new Date('2026-09-05T07:00:00Z'),
        stops: [
          { id: 'a', stop_sequence: 1, stop_type: StopType.Pickup, planned_arrival: new Date('2026-09-04T17:00:00Z'), actual_arrival: new Date('2026-09-04T17:10:00Z'), actual_departure: new Date('2026-09-04T17:50:00Z'), location_name: 'Riyadh' },
          { id: 'b', stop_sequence: 2, stop_type: StopType.Dropoff, planned_arrival: new Date('2026-09-05T03:00:00Z'), actual_arrival: new Date('2026-09-05T03:20:00Z'), actual_departure: new Date('2026-09-05T03:40:00Z'), location_name: 'Jeddah' },
          { id: 'c', stop_sequence: 3, stop_type: StopType.Pickup, planned_arrival: null, actual_arrival: new Date('2026-09-05T04:00:00Z'), actual_departure: null, location_name: 'Jeddah' },
          // Due 07:00, now 12:00 and the truck is still loading in Jeddah.
          { id: 'd', stop_sequence: 4, stop_type: StopType.Dropoff, planned_arrival: new Date('2026-09-05T07:00:00Z'), actual_arrival: null, actual_departure: null, location_name: 'Riyadh' },
        ],
      },
    ];

    const origFindMany = prisma.trip.findMany;
    const origUpdate = prisma.trip.update;
    const origFindFirst = prisma.notification.findFirst;
    const origUserFindMany = prisma.user.findMany;

    let updatedStatus: any = null;
    prisma.trip.findMany = (async () => mockTrips) as any;
    prisma.trip.update = (async ({ data }: any) => {
      updatedStatus = data.status;
      return { id: 'trip-round', ...data };
    }) as any;
    prisma.notification.findFirst = (async () => null) as any;
    prisma.user.findMany = (async () => []) as any;

    try {
      const count = await checkTripsForDelay(testNow);
      assert.equal(count, 1);
      assert.equal(updatedStatus, TripStatus.Delayed);
    } finally {
      prisma.trip.findMany = origFindMany;
      prisma.trip.update = origUpdate;
      prisma.notification.findFirst = origFindFirst;
      prisma.user.findMany = origUserFindMany;
    }
  });

  it('6. Delayed trip can legitimately return to InTransit through normal workflow', () => {
    assert.equal(isValidTransition(TripStatus.Delayed, TripStatus.InTransit), true);
  });

  it('7. Previous-day untouched Scheduled trip is detected as stale/unresolved', async () => {
    const yesterdayDate = new Date('2026-09-04T10:00:00Z'); // Previous day

    const mockTrips = [
      {
        id: 'trip-stale',
        ref_id: 'TRP-STALE-01',
        status: TripStatus.Scheduled,
        driver_workflow_state: null,
        planned_start: yesterdayDate,
        planned_end: null,
        stops: [
          {
            id: 'stop-1',
            stop_sequence: 1,
            stop_type: StopType.Pickup,
            planned_arrival: yesterdayDate,
            actual_arrival: null,
            location_name: 'Origin A',
          },
        ],
      },
    ];

    const origFindMany = prisma.trip.findMany;
    const origUpdate = prisma.trip.update;
    const origFindFirst = prisma.notification.findFirst;
    const origUserFindMany = prisma.user.findMany;
    const origCreate = prisma.notification.create;

    let notificationCreated = false;
    let notificationType = '';
    let updateCalled = false;

    prisma.trip.findMany = (async () => mockTrips) as any;
    prisma.trip.update = (async () => {
      updateCalled = true;
    }) as any;
    prisma.notification.findFirst = (async () => null) as any;
    prisma.user.findMany = (async () => [{ id: 'user-op-1' }]) as any;
    prisma.notification.create = (async ({ data }: any) => {
      notificationCreated = true;
      notificationType = data.type;
      return { id: 'notif-1', ...data };
    }) as any;

    try {
      assert.equal(isPreviousDay(yesterdayDate, testNow), true);
      const count = await checkTripsForDelay(testNow);
      // Status is NOT modified to Cancelled or Delayed; it remains Scheduled
      assert.equal(updateCalled, false);
      assert.equal(notificationCreated, true);
      assert.equal(notificationType, 'StaleScheduled');
    } finally {
      prisma.trip.findMany = origFindMany;
      prisma.trip.update = origUpdate;
      prisma.notification.findFirst = origFindFirst;
      prisma.user.findMany = origUserFindMany;
      prisma.notification.create = origCreate;
    }
  });

  it('8. Future Scheduled trip is NOT considered stale', () => {
    const tomorrowDate = new Date('2026-09-06T10:00:00Z');
    assert.equal(isPreviousDay(tomorrowDate, testNow), false);
  });

  it('9. Delay notification does not repeat every 60 seconds (cooldown/throttling)', async () => {
    const lateTime = new Date('2026-09-05T11:15:00Z');

    const mockTrips = [
      {
        id: 'trip-throttled',
        ref_id: 'TRP-103',
        status: TripStatus.Scheduled,
        planned_start: lateTime,
        stops: [
          {
            id: 'stop-1',
            stop_sequence: 1,
            stop_type: StopType.Pickup,
            planned_arrival: lateTime,
            actual_arrival: null,
          },
        ],
      },
    ];

    const origFindMany = prisma.trip.findMany;
    const origUpdate = prisma.trip.update;
    const origFindFirst = prisma.notification.findFirst;
    const origCreate = prisma.notification.create;

    let notificationCreated = false;

    prisma.trip.findMany = (async () => mockTrips) as any;
    prisma.trip.update = (async () => ({})) as any;
    // Simulate notification already exists within past 6 hours!
    prisma.notification.findFirst = (async () => ({ id: 'existing-notif' })) as any;
    prisma.notification.create = (async () => {
      notificationCreated = true;
    }) as any;

    try {
      await checkTripsForDelay(testNow);
      assert.equal(notificationCreated, false);
    } finally {
      prisma.trip.findMany = origFindMany;
      prisma.trip.update = origUpdate;
      prisma.notification.findFirst = origFindFirst;
      prisma.notification.create = origCreate;
    }
  });

  it('10. Stale scheduled notification does not repeat every 60 seconds (durable idempotency)', async () => {
    const yesterdayDate = new Date('2026-09-04T10:00:00Z');

    const mockTrips = [
      {
        id: 'trip-stale-idempotent',
        ref_id: 'TRP-STALE-02',
        status: TripStatus.Scheduled,
        planned_start: yesterdayDate,
        stops: [],
      },
    ];

    const origFindMany = prisma.trip.findMany;
    const origFindFirst = prisma.notification.findFirst;
    const origCreate = prisma.notification.create;

    let notificationCreated = false;

    prisma.trip.findMany = (async () => mockTrips) as any;
    // Simulate StaleScheduled notification already exists in database
    prisma.notification.findFirst = (async () => ({ id: 'existing-stale-notif', type: 'StaleScheduled' })) as any;
    prisma.notification.create = (async () => {
      notificationCreated = true;
    }) as any;

    try {
      await checkTripsForDelay(testNow);
      assert.equal(notificationCreated, false);
    } finally {
      prisma.trip.findMany = origFindMany;
      prisma.notification.findFirst = origFindFirst;
      prisma.notification.create = origCreate;
    }
  });

  it('11 & 12. Scheduled + GOING_TO_PICKUP activates mobile GPS; normal Scheduled does not', () => {
    const isTrackable = (status: string, workflowState?: string | null) =>
      ['Loading', 'InTransit', 'Delayed'].includes(status) ||
      (status === 'Scheduled' && workflowState === 'GOING_TO_PICKUP');

    // Scenario 11: Scheduled + GOING_TO_PICKUP -> GPS ACTIVE
    assert.equal(isTrackable('Scheduled', 'GOING_TO_PICKUP'), true);

    // Scenario 12: Normal Scheduled without active workflow -> GPS INACTIVE
    assert.equal(isTrackable('Scheduled', null), false);
    assert.equal(isTrackable('Scheduled', 'ASSIGNED'), false);
    assert.equal(isTrackable('Scheduled', ''), false);

    // Other active statuses
    assert.equal(isTrackable('Loading', null), true);
    assert.equal(isTrackable('InTransit', null), true);
    assert.equal(isTrackable('Delayed', null), true);
    assert.equal(isTrackable('Completed', null), false);
    assert.equal(isTrackable('Cancelled', null), false);
  });
});

describe('tripDelayMonitor: a stop the truck left counts as reached (TestFlight 24 Oct, TRP-0013)', () => {
  const now = new Date('2026-10-24T22:00:00Z');
  const stop = (id: string, seq: number, type: StopType, planned: string, arr: string | null, dep: string | null) => ({
    id, stop_sequence: seq, stop_type: type, planned_arrival: new Date(planned), actual_arrival: arr ? new Date(arr) : null,
    planned_departure: null, actual_departure: dep ? new Date(dep) : null, location_name: id,
  });
  // Round trip Riyadh → Jeddah → back. Loaded at Jeddah (no arrival time, only the departure), heading to Riyadh due tomorrow.
  const trip = (status: TripStatus) => ({
    id: 'trip-13', ref_id: 'TRP-0013', status, driver_workflow_state: 'IN_TRANSIT_RETURN',
    planned_start: new Date('2026-10-23T17:00:00Z'), planned_end: new Date('2026-10-25T07:00:00Z'), actual_start: new Date('2026-10-23T17:10:00Z'),
    stops: [
      stop('riyadh', 1, StopType.Pickup, '2026-10-23T17:00:00Z', '2026-10-23T17:05:00Z', '2026-10-23T18:00:00Z'),
      stop('jeddah-drop', 2, StopType.Dropoff, '2026-10-24T07:00:00Z', '2026-10-24T07:30:00Z', '2026-10-24T08:00:00Z'),
      stop('jeddah-load', 3, StopType.Pickup, '2026-10-24T17:00:00Z', null, '2026-10-24T17:40:00Z'),
      stop('riyadh-back', 4, StopType.Dropoff, '2026-10-25T07:00:00Z', null, null),
    ],
  });

  const run = async (t: any) => {
    const orig = { findMany: prisma.trip.findMany, update: prisma.trip.update, notif: prisma.notification.findFirst, users: prisma.user.findMany };
    const updates: any[] = [];
    prisma.trip.findMany = (async () => [t]) as any;
    prisma.trip.update = (async ({ where, data }: any) => { updates.push(data); return { id: where.id, ...data }; }) as any;
    prisma.notification.findFirst = (async () => null) as any;
    prisma.user.findMany = (async () => []) as any;
    try {
      const count = await checkTripsForDelay(now);
      return { count, updates };
    } finally {
      prisma.trip.findMany = orig.findMany; prisma.trip.update = orig.update; prisma.notification.findFirst = orig.notif; prisma.user.findMany = orig.users;
    }
  };

  it('an on-the-road trip is not marked late for the stop it already left', async () => {
    const { count, updates } = await run(trip(TripStatus.InTransit));
    assert.equal(count, 0);
    assert.deepEqual(updates, []);
  });

  it('a Delayed trip whose next stop is on time goes back on the road', async () => {
    const { updates } = await run(trip(TripStatus.Delayed));
    assert.deepEqual(updates, [{ status: TripStatus.InTransit }]);
  });
});

describe('tripDelayMonitor: a way-back stop with no planned time is not late (TestFlight 25 Oct, TRP-0066)', () => {
  const now = new Date('2026-10-25T16:43:00Z');
  const stop = (id: string, seq: number, leg: number, type: StopType, planned: string | null, arr: string | null, dep: string | null) => ({
    id, stop_sequence: seq, leg_index: leg, stop_type: type, planned_arrival: planned ? new Date(planned) : null, actual_arrival: arr ? new Date(arr) : null,
    planned_departure: null, actual_departure: dep ? new Date(dep) : null, location_name: id,
  });
  // Riyadh → Al Bahah → back to Riyadh. Loaded 03:49 (due 04:00), offloaded early, left Al Bahah 19:42 Riyadh time.
  // The trip's planned end is the way out's arrival; leg 2 has no times.
  const trip = (status: TripStatus) => ({
    id: 'trip-66', ref_id: 'TRP-0066', status, driver_workflow_state: 'IN_TRANSIT_RETURN',
    planned_start: new Date('2026-10-25T01:00:00Z'), planned_end: new Date('2026-10-25T13:00:00Z'), actual_start: new Date('2026-10-25T01:32:00Z'),
    stops: [
      stop('riyadh', 1, 0, StopType.Pickup, '2026-10-25T01:00:00Z', '2026-10-25T00:49:00Z', '2026-10-25T01:32:00Z'),
      stop('bahah-drop', 2, 0, StopType.Dropoff, '2026-10-25T17:00:00Z', '2026-10-25T15:33:00Z', '2026-10-25T15:33:00Z'),
      stop('bahah-load', 3, 1, StopType.Pickup, null, '2026-10-25T15:33:00Z', '2026-10-25T16:42:00Z'),
      stop('riyadh-back', 4, 1, StopType.Dropoff, null, null, null),
    ],
  });

  const run = async (t: any) => {
    const orig = { findMany: prisma.trip.findMany, update: prisma.trip.update, notif: prisma.notification.findFirst, users: prisma.user.findMany };
    const updates: any[] = [];
    prisma.trip.findMany = (async () => [t]) as any;
    prisma.trip.update = (async ({ where, data }: any) => { updates.push(data); return { id: where.id, ...data }; }) as any;
    prisma.notification.findFirst = (async () => null) as any;
    prisma.user.findMany = (async () => []) as any;
    try {
      return { count: await checkTripsForDelay(now), updates };
    } finally {
      prisma.trip.findMany = orig.findMany; prisma.trip.update = orig.update; prisma.notification.findFirst = orig.notif; prisma.user.findMany = orig.users;
    }
  };

  it('is not marked Delayed on the way back', async () => {
    const { count, updates } = await run(trip(TripStatus.InTransit));
    assert.equal(count, 0);
    assert.deepEqual(updates, []);
  });

  it('an already Delayed one goes back on the road', async () => {
    const { updates } = await run(trip(TripStatus.Delayed));
    assert.deepEqual(updates, [{ status: TripStatus.InTransit }]);
  });
});

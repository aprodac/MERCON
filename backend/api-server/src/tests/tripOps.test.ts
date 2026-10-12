/**
 * The trip-operations rules added for the office:
 *   - round-trip legs: which leg a trip is on, and only while it's under way (shared-types tripLegs)
 *   - truck ↔ driver reassignment: the knock-on effects and their wording (services/truckAssignment)
 *   - "Undo driver's step": the step list and where the trip is (services/tripStepBack)
 *   - driver duty from trips (services/driverDuty)
 * No database: Prisma calls are replaced by small fakes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeAssignment, legLabel, liveLegOf, splitLegs } from '@mercon/shared-types';
import { previewTruckAssignment } from '../services/truckAssignment';
import { buildSteps, stepState } from '../services/tripStepBack';
import { toDutyTrip } from '../services/driverDuty';

const T = (h: number) => new Date(Date.UTC(2026, 9, 11, 8) + h * 3600_000);

// ── Round-trip legs ──────────────────────────────────────────────────────────

const roundStops = (marks: Array<[Date | null, Date | null]>) =>
  ['Riyadh', 'Jeddah', 'Jeddah', 'Riyadh'].map((name, i) => ({
    id: `s${i + 1}`, stop_sequence: i + 1, leg_index: i < 2 ? 0 : 1, stop_type: i % 2 ? 'Dropoff' : 'Pickup', location_name: name,
    actual_arrival: marks[i][0], actual_departure: marks[i][1],
  }));

test('legs: a scheduled round trip is on no leg; under way it follows the stop it is at or heading to', () => {
  const none = splitLegs(roundStops([[null, null], [null, null], [null, null], [null, null]]));
  assert.equal(liveLegOf(none, 'Scheduled'), null);
  assert.equal(liveLegOf(none, 'InTransit'), 1);

  // At the turn-around (arrived Jeddah, not left): still leg 1 — same as the server and driver app.
  const atJeddah = splitLegs(roundStops([[T(0), T(1)], [T(10), null], [null, null], [null, null]]));
  assert.equal(liveLegOf(atJeddah, 'InTransit'), 1);

  const leftJeddah = splitLegs(roundStops([[T(0), T(1)], [T(10), T(11)], [T(11), null], [null, null]]));
  assert.equal(liveLegOf(leftJeddah, 'Loading'), 2);
  assert.equal(legLabel(2), 'Leg 2 returning');

  const done = splitLegs(roundStops([[T(0), T(1)], [T(10), T(11)], [T(11), T(12)], [T(20), T(21)]]));
  assert.equal(liveLegOf(done, 'Completed'), null);
});

// ── Truck ↔ driver reassignment ──────────────────────────────────────────────

function fakeDb(state: { drivers: any[]; vehicles: any[]; running?: any[] }) {
  const driverRow = (d: any) => {
    const v = state.vehicles.find((x) => x.id === d.assignedVehicleId);
    return { ...d, assignedVehicle: v ? { id: v.id, plate_number: v.plate_number, deletedAt: null } : null };
  };
  return {
    driver: { findFirst: async ({ where }: any) => { const d = state.drivers.find((x) => x.id === where.id); return d ? driverRow(d) : null; } },
    vehicle: {
      findFirst: async ({ where }: any) => {
        const v = state.vehicles.find((x) => x.id === where.id);
        if (!v) return null;
        const holder = state.drivers.find((d) => d.assignedVehicleId === v.id);
        return { id: v.id, plate_number: v.plate_number, assignedDriver: holder ? { ...driverRow(holder), deletedAt: null } : null };
      },
    },
    trip: { findMany: async () => state.running ?? [] },
  } as any;
}

const people = () => ({
  vehicles: [{ id: 'usa', plate_number: 'USA-6010' }, { id: 'ksa', plate_number: 'KSA-6102' }, { id: 'free', plate_number: 'FREE-1' }],
  drivers: [
    { id: 'imtiaz', first_name: 'Imtiaz', last_name: 'Ahmed', phone_primary: null, assignedVehicleId: 'usa' },
    { id: 'abdullah', first_name: 'Abdullah', last_name: null, phone_primary: null, assignedVehicleId: 'ksa' },
    { id: 'sam', first_name: 'Sam', last_name: null, phone_primary: null, assignedVehicleId: null },
  ],
});

test('reassignment: giving a driven truck to a driver who has a truck says what else changes', async () => {
  const db = fakeDb({ ...people(), running: [{ ref_id: 'TRP-0005', driverId: 'imtiaz', co_driver_id: null, vehicle: { plate_number: 'USA-6010' } }] });
  const p = await previewTruckAssignment({ vehicle_id: 'usa', driver_id: 'abdullah' }, db);
  assert.equal(p.no_change, false);
  assert.deepEqual(describeAssignment(p).map((l) => l.text), [
    'Abdullah will drive USA-6010.',
    'KSA-6102 will have no driver — Abdullah moves off it.',
    'Imtiaz Ahmed will have no truck — taken off USA-6010.',
    'Imtiaz Ahmed is on TRP-0005 right now — that trip keeps USA-6010; this applies to new trips.',
  ]);
});

test('reassignment: free truck + free driver is just the pairing; same pair is no change; emptying a truck frees its driver', async () => {
  const free = await previewTruckAssignment({ vehicle_id: 'free', driver_id: 'sam' }, fakeDb(people()));
  assert.deepEqual(describeAssignment(free).map((l) => l.tone), ['main']);

  const same = await previewTruckAssignment({ vehicle_id: 'usa', driver_id: 'imtiaz' }, fakeDb(people()));
  assert.equal(same.no_change, true);

  const empty = await previewTruckAssignment({ vehicle_id: 'usa', driver_id: null }, fakeDb(people()));
  assert.deepEqual(describeAssignment(empty).map((l) => l.text), ['Imtiaz Ahmed will have no truck — taken off USA-6010.']);

  await assert.rejects(previewTruckAssignment({ vehicle_id: 'nope', driver_id: 'sam' }, fakeDb(people())), /Truck not found/);
});

// ── Undo driver's step ───────────────────────────────────────────────────────

const stop = (id: string, seq: number, leg: number, type: string, name: string, a: Date | null = null, d: Date | null = null) =>
  ({ id, stop_sequence: seq, leg_index: leg, stop_type: type, location_name: name, actual_arrival: a, actual_departure: d }) as any;

test('step-back: a one-way trip with a stop in between lists its steps and where the driver goes next', () => {
  const steps = buildSteps([stop('a', 1, 0, 'Pickup', 'Riyadh'), stop('b', 2, 0, 'Dropoff', 'Taif'), stop('c', 3, 0, 'Dropoff', 'Jeddah')]);
  assert.deepEqual(steps.map((s) => s.label), [
    'Started the trip',
    'Arrived at Riyadh (loading)',
    'Loaded and left Riyadh',
    'Stop at Taif done',
    'Arrived at Jeddah (delivery)',
    'Delivered at Jeddah — trip finished',
  ]);
  assert.deepEqual(steps.map((s) => s.workflow), ['GOING_TO_PICKUP', 'ARRIVED_AT_PICKUP', 'GOING_TO_STOP', 'IN_TRANSIT', 'ARRIVED_AT_DELIVERY', 'COMPLETED']);
  assert.equal(steps[2].next, 'Stop at Taif');
});

test('step-back: a round trip merges "delivered" with "return loading", and the state follows the stamped stop times', () => {
  const stops = [
    stop('o', 1, 0, 'Pickup', 'Riyadh', T(0), T(1)),
    stop('d', 2, 0, 'Dropoff', 'Jeddah', T(10), T(11)),
    stop('rl', 3, 1, 'Pickup', 'Jeddah', T(11), null),
    stop('rd', 4, 1, 'Dropoff', 'Riyadh'),
  ];
  const steps = buildSteps(stops);
  const ret = steps.find((s) => s.key === 'return_loading')!;
  assert.deepEqual(ret.marks, [{ stopId: 'd', field: 'actual_departure' }, { stopId: 'rl', field: 'actual_arrival' }]);
  assert.equal(ret.workflow, 'RETURN_LOADING');

  const state = stepState({ stops, status: 'Loading', driver_workflow_state: 'RETURN_LOADING', actual_start: T(1) } as any, steps);
  const current = state.map((s) => s.done).lastIndexOf(true);
  assert.equal(steps[current].key, 'return_loading');
});

// ── Driver duty ──────────────────────────────────────────────────────────────

test('duty: a running round trip reports its leg, way out and when the driver is free; co-driver is marked', () => {
  const row = {
    id: 't1', ref_id: 'TRP-0005', status: 'InTransit', driverId: 'nouman', co_driver_id: 'co', rate_category: 'Round Trip',
    planned_start: T(-24), planned_end: T(4),
    stops: roundStops([[T(-24), T(-23)], [T(-10), T(-5)], [T(-5), T(-4)], [null, null]]).map((s, i) => ({ ...s, planned_arrival: T(i * 3), location: null })),
  } as any;
  const d = toDutyTrip(row, 'nouman');
  assert.equal(d.leg, 2);
  assert.equal(d.from, 'Riyadh');
  assert.equal(d.to, 'Jeddah');
  assert.equal(d.round, true);
  assert.equal(d.end, T(9).toISOString()); // the last stop's planned arrival is later than planned_end
  assert.equal(d.co_driver, false);
  assert.equal(toDutyTrip(row, 'co').co_driver, true);
});

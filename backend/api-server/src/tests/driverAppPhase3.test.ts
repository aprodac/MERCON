/// <reference types="multer" />
/**
 * Server fixes from the Phase 3 real-phone test of the driver app (2026-10-04).
 * Prisma calls are stubbed (no database needed), like userSuperAdminAuth.test.ts.
 * (The multer reference: ts-node compiles file by file and mobileTripController
 * uses req.file, which multer's types add.)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Response } from 'express';
import { prisma } from '../db';
import { env } from '../config/env';
import { changePassword, resolveResetRequester } from '../controllers/authController';
import { mobileLogin, phoneVariants } from '../controllers/mobileAuthController';
import { getDriverDocuments } from '../controllers/mobileDocumentController';
import { getTripHistory } from '../controllers/mobileTripController';
import { deliveryPunctuality, summarisePerformance, historyFinishedAt } from '../services/driverPerformance';
import { findDriverVehicle, pickActiveMaintenance } from '../services/driverVehicle';
import { sumDriverTripCharges } from '../services/driverCharges';

function mockRes() {
  let status = 200;
  let body: any = null;
  const res = {
    status: (code: number) => { status = code; return res; },
    json: (data: any) => { body = data; return res; },
  } as unknown as Response;
  return { res, result: () => ({ status, body }) };
}

/** Swap prisma methods for the length of one test, then put them back. */
function stub(t: any, model: any, method: string, impl: (...args: any[]) => any) {
  const original = model[method];
  model[method] = impl;
  t.after(() => { model[method] = original; });
}

const at = (iso: string) => new Date(iso);

/* ── 1. Wrong current password must not look like an expired login ─────────── */

test('change password: wrong current password answers 400 INVALID_CURRENT_PASSWORD (not 401)', async (t) => {
  const hash = await bcrypt.hash('shahbaz@2026', 4);
  stub(t, prisma.user, 'findUnique', async () => ({ id: 'u1', username: 'drv', password_hash: hash }));
  let updated = false;
  stub(t, prisma.user, 'update', async () => { updated = true; return {}; });

  const { res, result } = mockRes();
  await changePassword({ user: { id: 'u1' }, body: { current_password: 'not-it', new_password: 'NewPass123' } } as any, res);
  assert.equal(result().status, 400);
  assert.equal(result().body.error.code, 'INVALID_CURRENT_PASSWORD');
  assert.equal(result().body.error.message, 'Current password is incorrect');
  assert.equal(updated, false);
});

test('change password: right current password still changes it', async (t) => {
  const hash = await bcrypt.hash('shahbaz@2026', 4);
  stub(t, prisma.user, 'findUnique', async () => ({ id: 'u1', username: 'drv', password_hash: hash }));
  let newHash = '';
  stub(t, prisma.user, 'update', async (args: any) => { newHash = args.data.password_hash; return {}; });
  stub(t, prisma.auditLog, 'create', async () => ({}));

  const { res, result } = mockRes();
  await changePassword({ user: { id: 'u1' }, body: { current_password: 'shahbaz@2026', new_password: 'NewPass123' } } as any, res);
  assert.equal(result().status, 200);
  assert.equal(await bcrypt.compare('NewPass123', newHash), true);
});

/* ── 2. Driver sign-in: passwords exact, licence numbers forgiving ─────────── */

test('driver sign-in: password exactly as typed, mixed case, and licence with spaces/lower case', async (t) => {
  const lowerHash = await bcrypt.hash('shahbaz@2026', 4);
  const mixedHash = await bcrypt.hash('MiXed@Pass9', 4);
  let passwordHash = lowerHash;
  stub(t, prisma.driver, 'findFirst', async () => ({
    id: 'd1', userId: 'u1', isActive: true, first_name: 'CHAUDHRY', last_name: 'SHAHBAZ', ref_id: 'DRV-131', status: 'Available',
    license_number: 'AB-1234 56', user: { password_hash: passwordHash },
  }));
  stub(t, prisma.driverActivityEvent, 'create', async () => ({}));

  // The app sends the same text as both password and licence number.
  const login = async (secret: string) => {
    const { res, result } = mockRes();
    await mobileLogin({ body: { phone_primary: '+966510785259', password: secret, license_number: secret }, ip: '::1' } as any, res);
    return result().status;
  };

  assert.equal(await login('shahbaz@2026'), 200, 'lower-case password');
  assert.equal(await login('SHAHBAZ@2026'), 401, 'capitals are a different password');
  assert.equal(await login('Shahbaz@2026'), 401, 'capital S is a different password');
  passwordHash = mixedHash;
  assert.equal(await login('MiXed@Pass9'), 200, 'mixed-case password');
  assert.equal(await login('mixed@pass9'), 401, 'case matters for passwords');
  assert.equal(await login('ab 1234-56'), 200, 'licence typed in lower case with spaces and dashes');
});

test('phone variants cover +966, leading 0 and local number', () => {
  assert.deepEqual(phoneVariants('+966510785259'), ['+966510785259', '0510785259', '510785259']);
  assert.deepEqual(phoneVariants('0510785259'), ['0510785259', '+966510785259', '+91510785259', '510785259']);
});

/* ── 8. Password reset request names who asked ────────────────────────────── */

test('reset request from the signed-in driver names the driver and links to the driver page', async (t) => {
  stub(t, prisma.driver, 'findFirst', async (args: any) => {
    assert.equal(args.where.id, 'd1');
    return { id: 'd1', first_name: 'CHAUDHRY SHAHBAZ', last_name: 'KHAN', ref_id: 'DRV-131', phone_primary: '+966510785259' };
  });
  const token = jwt.sign({ id: 'u1', driver_id: 'd1', role: 'Driver' }, env.JWT_SECRET);
  const r = await resolveResetRequester(`Bearer ${token}`, undefined);
  assert.equal(r.who, 'Driver CHAUDHRY SHAHBAZ KHAN (DRV-131, +966510785259)');
  assert.equal(r.entityType, 'Driver');
  assert.equal(r.entityId, 'd1');
});

test('reset request from the sign-in screen finds the driver by the phone typed', async (t) => {
  stub(t, prisma.driver, 'findFirst', async (args: any) => {
    const phones = args.where.OR.map((o: any) => o.phone_primary).filter(Boolean);
    return phones.includes('+966510785259')
      ? { id: 'd1', first_name: 'CHAUDHRY SHAHBAZ', last_name: 'KHAN', ref_id: 'DRV-131', phone_primary: '+966510785259' }
      : null;
  });
  const r = await resolveResetRequester(undefined, '0510785259');
  assert.match(r.who, /^Driver CHAUDHRY SHAHBAZ KHAN/);
  assert.equal(r.entityId, 'd1');
});

test('reset request with an unknown phone says so instead of "A user"', async (t) => {
  stub(t, prisma.driver, 'findFirst', async () => null);
  stub(t, prisma.user, 'findFirst', async () => null);
  const r = await resolveResetRequester(undefined, '+966500000000');
  assert.equal(r.who, 'Someone using "+966500000000" (no matching account)');
  assert.equal(r.entityType, undefined);
});

/* ── 3. Performance: real numbers only ────────────────────────────────────── */

const drop = (planned: string, actual: string | null, seq = 2) =>
  ({ stop_sequence: seq, stop_type: 'Dropoff', planned_arrival: planned, actual_arrival: actual });

test('on time = final drop-off reached within 30 minutes of plan', () => {
  assert.equal(deliveryPunctuality([drop('2026-10-04T05:13:00Z', '2026-10-04T00:13:00Z')]), 'on_time');
  assert.equal(deliveryPunctuality([drop('2026-10-04T05:00:00Z', '2026-10-04T05:30:00Z')]), 'on_time', 'exactly 30 min late');
  assert.equal(deliveryPunctuality([drop('2026-10-04T05:00:00Z', '2026-10-04T05:31:00Z')]), 'late');
  assert.equal(deliveryPunctuality([drop('2026-10-04T05:00:00Z', null)]), null, 'no arrival time');
  // The last drop-off decides, not the first.
  assert.equal(deliveryPunctuality([drop('2026-10-04T05:00:00Z', '2026-10-04T09:00:00Z', 2), drop('2026-10-04T12:00:00Z', '2026-10-04T12:05:00Z', 4)]), 'on_time');
});

test('performance summary: completed trips counted, cancelled ignored, no data gives null', () => {
  const s = summarisePerformance([
    { status: 'Completed', stops: [drop('2026-10-04T05:13:00Z', '2026-10-04T00:13:00Z')] },
    { status: 'Invoiced', stops: [drop('2026-10-03T05:00:00Z', '2026-10-03T07:00:00Z')] },
    { status: 'Completed', stops: [drop('2026-10-02T05:00:00Z', null)] },
    { status: 'Cancelled', stops: [drop('2026-10-01T05:00:00Z', '2026-10-01T05:00:00Z')] },
  ]);
  assert.deepEqual(s, { completed_trips: 3, on_time_measured_trips: 2, on_time_trips: 1, on_time_percentage: 50 });
  assert.equal(summarisePerformance([{ status: 'Completed', stops: [] }]).on_time_percentage, null);
});

/* ── 11. History: newest first by when the trip ended ─────────────────────── */

test('history date: delivery time for finished trips, last update (the cancel) for cancelled ones', () => {
  assert.equal(historyFinishedAt({ status: 'Completed', actual_end: at('2026-10-04T00:13:02Z'), updatedAt: at('2026-10-05T00:00:00Z') }).toISOString(), '2026-10-04T00:13:02.000Z');
  assert.equal(historyFinishedAt({ status: 'Cancelled', actual_end: null, updatedAt: at('2026-10-03T23:50:31Z') }).toISOString(), '2026-10-03T23:50:31.000Z');
});

test('GET /mobile/trips/history sorts cancelled and completed trips together, newest first', async (t) => {
  // The Phase 3 data: TRP-0005 completed 05:43 IST; TRP-0001/0002 cancelled earlier, TRP-0006 later.
  const keys = [
    { id: 't1', status: 'Cancelled', actual_end: null, updatedAt: at('2026-10-03T23:46:47Z') },
    { id: 't2', status: 'Cancelled', actual_end: null, updatedAt: at('2026-10-03T23:50:31Z') },
    { id: 't5', status: 'Completed', actual_end: at('2026-10-04T00:13:02Z'), updatedAt: at('2026-10-04T00:13:02Z') },
    { id: 't6', status: 'Cancelled', actual_end: null, updatedAt: at('2026-10-04T00:44:36Z') },
  ];
  let call = 0;
  stub(t, prisma.trip, 'findMany', async (args: any) => {
    call += 1;
    if (call === 1) return keys;
    return args.where.id.in.map((id: string) => ({
      ...keys.find((k) => k.id === id),
      ref_id: id,
      stops: id === 't5' ? [drop('2026-10-04T05:13:04Z', '2026-10-04T00:13:02Z')] : [],
      driver_payout: 1,
    }));
  });

  const { res, result } = mockRes();
  await getTripHistory({ user: { driver_id: 'd1' }, query: { limit: '3' } } as any, res);
  const data = result().body.data;
  assert.deepEqual(data.map((x: any) => x.id), ['t6', 't5', 't2'], 'newest first, limit applied after sorting');
  assert.equal(data[0].finished_at, '2026-10-04T00:44:36.000Z');
  assert.equal(data[0].punctuality, null, 'cancelled trips have no on-time badge');
  assert.equal(data[1].punctuality, 'on_time');
});

/* ── 5. Truck: current trip's truck, else the assigned truck ──────────────── */

const truck = (plate: string, extra: any = {}) => ({
  id: plate, ref_id: `TRK-${plate}`, plate_number: plate, asset_type: 'Box', status: 'Available', capacity_kg: 5000,
  current_odometer: 962556, trailer_number: null, trailer_type: null, deletedAt: null, maintenanceRecords: [], ...extra,
});

test('vehicle: no trip -> the driver\'s assigned truck, not "No vehicle assigned"', async (t) => {
  stub(t, prisma.trip, 'findFirst', async () => null);
  stub(t, prisma.driver, 'findFirst', async () => ({ assignedVehicle: truck('DRA-6487') }));
  const v = await findDriverVehicle('d1');
  assert.equal(v?.plate_number, 'DRA-6487');
  assert.equal(v?.source, 'assigned');
  assert.equal(v?.trip_ref_id, null);
  assert.equal(v?.capacity_kg, 5000);
});

test('vehicle: the current trip\'s truck wins and carries the trip number', async (t) => {
  stub(t, prisma.trip, 'findFirst', async () => ({ ref_id: 'TRP-0007', vehicle: truck('XYZ-1111') }));
  stub(t, prisma.driver, 'findFirst', async () => ({ assignedVehicle: truck('DRA-6487') }));
  const v = await findDriverVehicle('d1');
  assert.equal(v?.plate_number, 'XYZ-1111');
  assert.equal(v?.trip_ref_id, 'TRP-0007');
  assert.equal(v?.source, 'trip');
});

test('vehicle: a trip without a truck falls back to the assigned truck; a deleted truck is skipped', async (t) => {
  stub(t, prisma.trip, 'findFirst', async () => ({ ref_id: 'TRP-0008', vehicle: null }));
  stub(t, prisma.driver, 'findFirst', async () => ({ assignedVehicle: truck('DRA-6487') }));
  assert.equal((await findDriverVehicle('d1'))?.plate_number, 'DRA-6487');

  stub(t, prisma.driver, 'findFirst', async () => ({ assignedVehicle: truck('OLD-1', { deletedAt: at('2026-01-01T00:00:00Z') }) }));
  assert.equal(await findDriverVehicle('d1'), null);
});

test('maintenance banner: in progress first, then scheduled covering today, then next scheduled', () => {
  const now = at('2026-10-04T08:00:00Z');
  const sched = (id: string, start: string, end: string | null) =>
    ({ id, status: 'Scheduled', maintenance_type: 'Service', workshop_name: null, start_date: at(start), end_date: end ? at(end) : null });
  assert.equal(pickActiveMaintenance([sched('a', '2026-10-10T00:00:00Z', null), sched('b', '2026-10-01T00:00:00Z', '2026-10-05T00:00:00Z')], now)?.id, 'b');
  assert.equal(pickActiveMaintenance([sched('a', '2026-10-10T00:00:00Z', null)], now)?.id, 'a');
  assert.equal(pickActiveMaintenance([], now), null);
});

/* ── 4. Driver documents: every document on the driver ────────────────────── */

test('driver documents: only incident photos are hidden — a Driver Card saved as POD shows', async (t) => {
  let where: any = null;
  stub(t, prisma.document, 'findMany', async (args: any) => { where = args.where; return []; });
  const { res } = mockRes();
  await getDriverDocuments({ user: { driver_id: 'd1' } } as any, res);
  assert.equal(where.entity_type, 'Driver');
  assert.equal(where.entity_id, 'd1');
  assert.deepEqual(where.doc_type, { notIn: ['Emergency'] });
});

/* ── 10. Driver pay totals: finished trips only ───────────────────────────── */

test('driver pay totals count Completed/Invoiced trips only and add co-driver pay', async (t) => {
  const wheres: any[] = [];
  stub(t, prisma.trip, 'groupBy', async (args: any) => {
    wheres.push(args.where);
    return args.by[0] === 'driverId'
      ? [{ driverId: 'd1', _sum: { driver_payout: 1 } }]
      : [{ co_driver_id: 'd1', _sum: { co_driver_payout: 2.5 } }, { co_driver_id: 'd2', _sum: { co_driver_payout: 4 } }];
  });
  const totals = await sumDriverTripCharges(['d1', 'd2', 'd3']);
  for (const w of wheres) {
    assert.deepEqual(w.status, { in: ['Completed', 'Invoiced'] }, 'cancelled trips must not count');
    assert.equal(w.deletedAt, null);
  }
  assert.deepEqual(Object.fromEntries(totals), { d1: 3.5, d2: 4, d3: 0 });
});

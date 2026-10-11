/**
 * Driver app login after an operator edits the driver (phone = username,
 * custom password, licence number). Prisma is stubbed, like driverAppPhase3.test.ts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { Response } from 'express';
import { prisma } from '../db';
import { updateDriver, setDriverPassword, getDriverById, createDriver } from '../controllers/driverController';
import { updateUser, deleteUser } from '../controllers/userController';
import { loginAccountKey } from '../middlewares/rateLimit';
import { mobileLogin, phoneVariants } from '../controllers/mobileAuthController';
import { claimLoginPhone, DriverLoginConflict, phoneKey } from '../services/driverLogin';

function mockRes() {
  let status = 200;
  let body: any = null;
  const res = {
    status: (code: number) => { status = code; return res; },
    json: (data: any) => { body = data; return res; },
  } as unknown as Response;
  return { res, result: () => ({ status, body }) };
}

function stub(t: any, model: any, method: string, impl: (...args: any[]) => any) {
  const original = model[method];
  model[method] = impl;
  t.after(() => { model[method] = original; });
}

/** Run `$transaction(fn)` against the (stubbed) client itself. */
function stubTransaction(t: any) {
  stub(t, prisma, '$transaction', async (fn: any) => fn(prisma));
}

const DRIVER = {
  id: 'd1', userId: 'u1', ref_id: 'DRV-001', first_name: 'Ali', last_name: 'Khan',
  phone_primary: '0501111111', license_number: '2123456789', deletedAt: null, isActive: true,
};

test('phone key ignores +966 / 00966 / 0 prefixes and spaces', () => {
  assert.equal(phoneKey('+966 50 222 2222'), '502222222');
  assert.equal(phoneKey('0502222222'), '502222222');
  assert.equal(phoneKey('00966502222222'), '502222222');
});

test('phone variants: bare 9 digits, 00966, 966 and spaces all reach the stored forms', () => {
  assert.ok(phoneVariants('502222222').includes('0502222222'));
  assert.ok(phoneVariants('502222222').includes('+966502222222'));
  assert.ok(phoneVariants('00966502222222').includes('0502222222'));
  assert.ok(phoneVariants('966502222222').includes('+966502222222'));
  assert.ok(phoneVariants('050 222 2222').includes('+966502222222'));
});

test('changing the phone moves the driver login (username + phone) onto the new number', async (t) => {
  stubTransaction(t);
  stub(t, prisma.driver, 'findFirst', async () => DRIVER);
  stub(t, prisma.driver, 'findMany', async () => []);
  let driverData: any = null;
  stub(t, prisma.driver, 'update', async (args: any) => { driverData = args.data; return { ...DRIVER, ...args.data }; });
  stub(t, prisma.user, 'findMany', async () => []);
  let userData: any = null;
  stub(t, prisma.user, 'update', async (args: any) => { userData = args.data; return {}; });

  const { res, result } = mockRes();
  await updateDriver({ params: { id: 'd1' }, body: { phone_primary: '050 222-2222', license_number: ' 2999999999 ' }, user: { id: 'op' } } as any, res);

  assert.equal(result().status, 200);
  assert.equal(driverData.phone_primary, '0502222222');
  assert.equal(driverData.license_number, '2999999999');
  assert.equal(userData.username, '0502222222');
  assert.equal(userData.phone, '0502222222');
});

test('a phone another live driver has is refused with a clear 409, not a 500', async (t) => {
  stub(t, prisma.driver, 'findFirst', async () => DRIVER);
  stub(t, prisma.driver, 'findMany', async () => [
    { id: 'd2', first_name: 'Omar', last_name: 'Ali', ref_id: 'DRV-002', phone_primary: '+966502222222', deletedAt: null },
  ]);
  const { res, result } = mockRes();
  await updateDriver({ params: { id: 'd1' }, body: { phone_primary: '0502222222' } } as any, res);
  assert.equal(result().status, 409);
  assert.match(result().body.error.message, /Omar Ali \(DRV-002\)/);
});

test('editing a deleted / unknown driver answers 404', async (t) => {
  stub(t, prisma.driver, 'findFirst', async () => null);
  const { res, result } = mockRes();
  await updateDriver({ params: { id: 'd1' }, body: { first_name: 'X' } } as any, res);
  assert.equal(result().status, 404);
});

test('a stale login left on the number by an earlier phone change is released, not a conflict', async (t) => {
  // u9 belongs to driver d9 whose phone has since changed — its username still says 0502222222.
  stub(t, prisma.user, 'findMany', async () => [{
    id: 'u9', username: '0502222222', role: 'Driver', isSuperAdmin: false,
    driver: { id: 'd9', first_name: 'Old', last_name: 'Owner', ref_id: 'DRV-009', phone_primary: '0509999999', deletedAt: null },
  }]);
  const released: any[] = [];
  stub(t, prisma.user, 'update', async (args: any) => { released.push(args); return {}; });

  const { adoptable } = await claimLoginPhone(prisma, '0502222222', 'd1', 'u1');
  assert.equal(adoptable, null);
  assert.equal(released.length, 1);
  assert.equal(released[0].where.id, 'u9');
  assert.equal(released[0].data.phone, null);
  assert.notEqual(released[0].data.username, '0502222222');
});

test('a staff account on the number is never touched', async (t) => {
  stub(t, prisma.user, 'findMany', async () => [{ id: 'a1', username: 'operator', role: 'Operator', isSuperAdmin: false, driver: null }]);
  stub(t, prisma.user, 'update', async () => { throw new Error('must not update staff'); });
  await assert.rejects(claimLoginPhone(prisma, '0502222222', 'd1', 'u1'), DriverLoginConflict);
});

test('set password after a phone change: saves the hash and moves the login to the new phone', async (t) => {
  stubTransaction(t);
  stub(t, prisma.driver, 'findUnique', async () => ({ ...DRIVER, phone_primary: '0502222222' }));
  stub(t, prisma.user, 'findMany', async () => [{
    id: 'u9', username: '0502222222', role: 'Driver', isSuperAdmin: false,
    driver: { id: 'd9', first_name: 'Old', last_name: 'Owner', ref_id: 'DRV-009', phone_primary: '0509999999', deletedAt: null },
  }]);
  const updates: any[] = [];
  stub(t, prisma.user, 'update', async (args: any) => { updates.push(args); return { id: args.where.id }; });

  const { res, result } = mockRes();
  await setDriverPassword({ params: { id: 'd1' }, body: { password: '  Pass@123 ' } } as any, res);

  assert.equal(result().status, 200);
  const own = updates.find((u) => u.where.id === 'u1');
  assert.equal(own.data.username, '0502222222');
  assert.equal(own.data.phone, '0502222222');
  assert.equal(await bcrypt.compare('Pass@123', own.data.password_hash), true);
  assert.ok(updates.some((u) => u.where.id === 'u9'), 'stale login released');
});

test('driver detail says whether the app login has a password, without the hash', async (t) => {
  stub(t, prisma.driver, 'findFirst', async () => ({ ...DRIVER, user: { id: 'u1', username: '0501111111', phone: '0501111111', isActive: true, password_hash: 'h' } }));
  stub(t, prisma.document, 'findMany', async () => []);
  const { res, result } = mockRes();
  await getDriverById({ params: { id: '00000000-0000-0000-0000-000000000001' }, query: { mode: 'lookup' } } as any, res);
  assert.equal(result().body.data.hasAccountPassword, true);
  assert.equal(result().body.data.user.password_hash, undefined);
  assert.equal(result().body.data.user.username, '0501111111');
});

test('driver sign-in with the new phone typed without 0 and a trailing space on the password', async (t) => {
  const hash = await bcrypt.hash('Pass@123', 4);
  stub(t, prisma.driver, 'findFirst', async (args: any) => {
    assert.equal(args.where.deletedAt, null);
    const phones = args.where.OR.map((o: any) => o.phone_primary).filter(Boolean);
    return phones.includes('0502222222') ? { ...DRIVER, phone_primary: '0502222222', user: { password_hash: hash } } : null;
  });
  stub(t, prisma.driverActivityEvent, 'create', async () => ({}));
  const { res, result } = mockRes();
  await mobileLogin({ body: { phone_primary: '502222222', password: 'Pass@123 ' }, ip: '::1' } as any, res);
  assert.equal(result().status, 200);
});

test('driver sign-in finds a phone saved from the web with a space ("+966 502222222")', async (t) => {
  const hash = await bcrypt.hash('Pass@123', 4);
  stub(t, prisma.driver, 'findFirst', async () => null);
  stub(t, prisma, '$queryRaw', async () => [{ id: 'd1' }]);
  stub(t, prisma.driver, 'findUnique', async () => ({ ...DRIVER, phone_primary: '+966 502222222', user: { password_hash: hash } }));
  stub(t, prisma.driverActivityEvent, 'create', async () => ({}));
  const { res, result } = mockRes();
  await mobileLogin({ body: { phone_primary: '0502222222', password: 'Pass@123' }, ip: '::1' } as any, res);
  assert.equal(result().status, 200);
});

/* ── Loopholes closed 2026-10-11 ─────────────────────────────────────────── */

test('adding a driver with a number another driver has in another spelling answers 409', async (t) => {
  stub(t, prisma.driver, 'findMany', async () => [
    { id: 'd2', first_name: 'Omar', last_name: 'Ali', ref_id: 'DRV-002', phone_primary: '+966 502222222', deletedAt: null },
  ]);
  stub(t, prisma.driver, 'create', async () => { throw new Error('must not create'); });
  const { res, result } = mockRes();
  await createDriver({ body: { first_name: 'A', last_name: 'B', phone_primary: '0502222222', license_number: '2123456789', license_expiry: '2030-01-01' } } as any, res);
  assert.equal(result().status, 409);
  assert.match(result().body.error.message, /Omar Ali/);
});

test('adding a driver frees the number from a deleted driver instead of "already exists"', async (t) => {
  stub(t, prisma.driver, 'findMany', async (args: any) => args.select?.ref_id && !args.where
    ? []
    : [{ id: 'dx', first_name: 'Gone', last_name: 'Driver', ref_id: 'DRV-009', phone_primary: '0502222222', deletedAt: new Date() }]);
  let released: any = null;
  stub(t, prisma.driver, 'updateMany', async (args: any) => { released = args; return { count: 1 }; });
  stub(t, prisma.driver, 'create', async (args: any) => ({ id: 'new', ...args.data }));
  const { res, result } = mockRes();
  await createDriver({ body: { first_name: 'A', last_name: 'B', phone_primary: '050 222 2222', license_number: '2123456789', license_expiry: '2030-01-01' } } as any, res);
  assert.equal(result().status, 201);
  assert.deepEqual(released.where.id.in, ['dx']);
  assert.equal(result().body.data.phone_primary, '0502222222');
});

test('a driver login cannot be edited or deleted from User management', async (t) => {
  stub(t, prisma.user, 'findUnique', async (args: any) => args.where.id === 'admin'
    ? { role: 'Admin', isSuperAdmin: false }
    : { id: 'u1', role: 'Driver', isSuperAdmin: false, driver: { id: 'd1' } });
  stub(t, prisma.user, 'update', async () => { throw new Error('must not update'); });
  const upd = mockRes();
  await updateUser({ params: { id: 'u1' }, body: { role: 'Admin' }, user: { id: 'admin' } } as any, upd.res);
  assert.equal(upd.result().status, 403);
  const del = mockRes();
  await deleteUser({ params: { id: 'u1' }, body: {}, user: { id: 'admin' } } as any, del.res);
  assert.equal(del.result().status, 403);
});

test('login rate limit counts every spelling of a number as one account', () => {
  const keys = ['0502222222', '+966502222222', '+966 50 222 2222', '502222222', '00966502222222', '966502222222'].map(loginAccountKey);
  assert.equal(new Set(keys).size, 1);
  assert.equal(loginAccountKey('Admin'), 'admin');
});

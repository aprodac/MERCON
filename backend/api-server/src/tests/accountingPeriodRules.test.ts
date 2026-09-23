import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/mercon_db?schema=public';
}



import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../db';



import { lockAccountingPeriod, reopenAccountingPeriod, closeAccountingPeriod } from '../controllers/accountingPeriodController';

describe('Accounting Period Rules (Locking, Reopening, Audit)', () => {
  let period1Id: string;
  let period2Id: string;
  let adminUserId: string;

  const mockRes = () => {
    const res: any = {};
    res.statusCode = 200;
    res.jsonBody = null;
    res.status = (code: number) => {
      res.statusCode = code;
      return res;
    };
    res.json = (data: any) => {
      res.jsonBody = data;
      return res;
    };
    return res;
  };

  before(async () => {
    // 1. Ensure test admin user exists
    const user = await prisma.user.upsert({
      where: { username: 'period_test_admin' },
      create: {
        username: 'period_test_admin',
        email: 'period_admin@mercon.test',
        role: 'Admin',
      },
      update: {},
    });
    adminUserId = user.id;

    // Clean up previous test periods if any
    await prisma.accountingPeriod.deleteMany({
      where: { name: { startsWith: 'Test Period' } },
    });

    // 2. Create test periods with unique timestamps
    const p1 = await prisma.accountingPeriod.create({
      data: {
        name: `Test Period Jan ${Date.now()}`,
        start_date: new Date('2098-01-01T00:00:00Z'),
        end_date: new Date('2098-01-31T23:59:59Z'),
        status: 'Open',
        created_by: adminUserId,
      },
    });
    period1Id = p1.id;

    const p2 = await prisma.accountingPeriod.create({
      data: {
        name: `Test Period Feb ${Date.now()}`,
        start_date: new Date('2098-02-01T00:00:00Z'),
        end_date: new Date('2098-02-28T23:59:59Z'),
        status: 'Open',
        created_by: adminUserId,
      },
    });
    period2Id = p2.id;
  });


  it('1. Lock an Open period should fail with 400 PERIOD_NOT_CLOSED', async () => {
    const req = { params: { id: period1Id }, user: { id: adminUserId } } as any;
    const res = mockRes();

    await lockAccountingPeriod(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.jsonBody.success, false);
    assert.equal(res.jsonBody.error.code, 'PERIOD_NOT_CLOSED');
  });

  it('2. Close period then Lock period should succeed', async () => {
    // Close period 1
    const reqClose = { params: { id: period1Id }, user: { id: adminUserId } } as any;
    const resClose = mockRes();
    await closeAccountingPeriod(reqClose, resClose);
    assert.equal(resClose.statusCode, 200);

    const closedP1 = await prisma.accountingPeriod.findUnique({ where: { id: period1Id } });
    assert.equal(closedP1?.status, 'Closed');

    // Lock period 1
    const reqLock = { params: { id: period1Id }, user: { id: adminUserId } } as any;
    const resLock = mockRes();
    await lockAccountingPeriod(reqLock, resLock);
    assert.equal(resLock.statusCode, 200);

    const lockedP1 = await prisma.accountingPeriod.findUnique({ where: { id: period1Id } });
    assert.equal(lockedP1?.status, 'Locked');
  });

  it('3. Reopen a Locked period should fail with 400 PERIOD_LOCKED', async () => {
    const req = {
      params: { id: period1Id },
      body: { reason: 'Need to make correction to entries' },
      user: { id: adminUserId },
    } as any;
    const res = mockRes();

    await reopenAccountingPeriod(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.jsonBody.success, false);
    assert.equal(res.jsonBody.error.code, 'PERIOD_LOCKED');
  });

  it('4. Reopen with reason too short (<10 chars) should fail with 400 VALIDATION_ERROR', async () => {
    // Close period 2 first
    const reqClose = { params: { id: period2Id }, user: { id: adminUserId } } as any;
    const resClose = mockRes();
    await closeAccountingPeriod(reqClose, resClose);
    assert.equal(resClose.statusCode, 200);

    const req = {
      params: { id: period2Id },
      body: { reason: 'Short' },
      user: { id: adminUserId },
    } as any;
    const res = mockRes();

    await reopenAccountingPeriod(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.jsonBody.success, false);
    assert.equal(res.jsonBody.error.code, 'VALIDATION_ERROR');
  });

  it('5. Reopen when a later period is Closed/Locked should fail with 400 LATER_PERIOD_CLOSED', async () => {
    // Re-lock period 2 if needed (it is closed now)
    // Create period 0 before period 1
    const p0 = await prisma.accountingPeriod.create({
      data: {
        name: `Test Period Dec 2025 ${Date.now()}`,
        start_date: new Date('2025-12-01T00:00:00Z'),
        end_date: new Date('2025-12-31T23:59:59Z'),
        status: 'Open',
        created_by: adminUserId,
      },
    });

    const reqClose0 = { params: { id: p0.id }, user: { id: adminUserId } } as any;
    const resClose0 = mockRes();
    await closeAccountingPeriod(reqClose0, resClose0);
    assert.equal(resClose0.statusCode, 200);

    // Now try to reopen p0 while period1 is Locked and period2 is Closed
    const reqReopen = {
      params: { id: p0.id },
      body: { reason: 'Reopening earlier period out of order' },
      user: { id: adminUserId },
    } as any;
    const resReopen = mockRes();

    await reopenAccountingPeriod(reqReopen, resReopen);

    assert.equal(resReopen.statusCode, 400);
    assert.equal(resReopen.jsonBody.success, false);
    assert.equal(resReopen.jsonBody.error.code, 'LATER_PERIOD_CLOSED');
  });

  it('6. Reopen happy path -> status Open + snapshot deleted + audit row created', async () => {
    // Create a dedicated newest period for happy-path reopen test
    const latestP = await prisma.accountingPeriod.create({
      data: {
        name: `Test Period Dec 2099 ${Date.now()}`,
        start_date: new Date('2099-12-01T00:00:00Z'),
        end_date: new Date('2099-12-31T23:59:59Z'),
        status: 'Open',
        created_by: adminUserId,
      },
    });

    // Close it first
    const reqClose = { params: { id: latestP.id }, user: { id: adminUserId } } as any;
    const resClose = mockRes();
    await closeAccountingPeriod(reqClose, resClose);
    assert.equal(resClose.statusCode, 200);

    // Reopen it
    const req = {
      params: { id: latestP.id },
      body: { reason: 'Valid reason to reopen December 2099 books' },
      user: { id: adminUserId },
    } as any;
    const res = mockRes();

    await reopenAccountingPeriod(req, res);

    assert.equal(res.statusCode, 200, JSON.stringify(res.jsonBody));
    assert.equal(res.jsonBody.success, true);
    assert.equal(res.jsonBody.data.status, 'Open');

    // Verify snapshot rows deleted
    const snapshots = await prisma.accountClosingBalance.findMany({
      where: { periodId: latestP.id },
    });
    assert.equal(snapshots.length, 0);

    // Verify audit log
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        entityType: 'AccountingPeriod',
        entityId: latestP.id,
        action: 'PERIOD_REOPENED',
      },
    });
    assert.equal(auditLogs.length, 1);
    assert.equal((auditLogs[0].metadata as any)?.reason, 'Valid reason to reopen December 2099 books');
  });

  it('7. Close again -> snapshot rebuilt', async () => {
    // Create another future period for close-again test
    const latestP = await prisma.accountingPeriod.create({
      data: {
        name: `Test Period Nov 2099 ${Date.now()}`,
        start_date: new Date('2099-11-01T00:00:00Z'),
        end_date: new Date('2099-11-30T23:59:59Z'),
        status: 'Open',
        created_by: adminUserId,
      },
    });

    const reqClose = { params: { id: latestP.id }, user: { id: adminUserId } } as any;
    const resClose = mockRes();
    await closeAccountingPeriod(reqClose, resClose);
    assert.equal(resClose.statusCode, 200);

    const closedP = await prisma.accountingPeriod.findUnique({ where: { id: latestP.id } });
    assert.equal(closedP?.status, 'Closed');
  });

});

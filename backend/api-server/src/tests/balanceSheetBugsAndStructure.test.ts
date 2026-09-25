if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/mercon_db?schema=public';
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../db';
import { getBalanceSheet } from '../controllers/financeReportsController';
import { closeAccountingPeriodWithSnapshot } from '../utils/periodClosingEngine';

test('Balance Sheet Bugs & Calculation Test Suite', async (t) => {
  let assetAcc: any;
  let liabAcc: any;
  let revAcc: any;
  let expAcc: any;
  let period: any;

  t.before(async () => {
    const timestamp = Date.now();

    // Create Asset GL Account
    assetAcc = await prisma.account.create({
      data: {
        account_code: `TEST-1010-BS-${timestamp}`,
        name: 'Test Bank Asset',
        account_type: 'Asset',
        is_postable: true,
      },
    });

    // Create BankAccount record linked to assetAcc
    await prisma.bankAccount.create({
      data: {
        accountId: assetAcc.id,
        bank_name: 'Test Bank BS',
        account_number: `SA${timestamp}`,
        currency: 'SAR',
      },
    });

    // Create Liability GL Account
    liabAcc = await prisma.account.create({
      data: {
        account_code: `TEST-2010-BS-${timestamp}`,
        name: 'Test Accounts Payable',
        account_type: 'Liability',
        is_postable: true,
      },
    });

    // Create Revenue GL Account
    revAcc = await prisma.account.create({
      data: {
        account_code: `TEST-4010-BS-${timestamp}`,
        name: 'Test Freight Revenue',
        account_type: 'Revenue',
        is_postable: true,
      },
    });

    // Create Expense GL Account
    expAcc = await prisma.account.create({
      data: {
        account_code: `TEST-5010-BS-${timestamp}`,
        name: 'Test Fuel Expense',
        account_type: 'Expense',
        is_postable: true,
      },
    });

    // Create Period for July 2026
    const startDate = new Date(Date.UTC(2026, 6, 1, 0, 0, 0));
    const endDate = new Date(Date.UTC(2026, 6, 31, 23, 59, 59));
    period = await prisma.accountingPeriod.create({
      data: {
        name: `Test BS Period ${timestamp}`,
        start_date: startDate,
        end_date: endDate,
        status: 'Open',
      },
    });
  });

  t.after(async () => {
    try {
      if (period) {
        await prisma.accountClosingBalance.deleteMany({ where: { periodId: period.id } });
        await prisma.journalLine.deleteMany({ where: { journalEntry: { periodId: period.id } } });
        await prisma.journalEntry.deleteMany({ where: { periodId: period.id } });
        await prisma.accountingPeriod.delete({ where: { id: period.id } });
      }
      if (assetAcc) {
        await prisma.bankAccount.deleteMany({ where: { accountId: assetAcc.id } });
        await prisma.account.delete({ where: { id: assetAcc.id } });
      }
      if (liabAcc) await prisma.account.delete({ where: { id: liabAcc.id } });
      if (revAcc) await prisma.account.delete({ where: { id: revAcc.id } });
      if (expAcc) await prisma.account.delete({ where: { id: expAcc.id } });
    } catch {
      // Ignore cleanup error
    }
  });

  await t.test('1. B1 Fix: Includes entries made on the as-of date (31 Jul)', async () => {
    // Create entry on 31 Jul 2026 at 20:00 UTC
    const lateJulyDate = new Date('2026-07-31T20:00:00.000Z');

    await prisma.journalEntry.create({
      data: {
        ref_id: `JE-BS-LATE-${Date.now()}`,
        entry_date: lateJulyDate,
        memo: '31 Jul trip revenue & expense',
        status: 'Posted',
        periodId: period.id,
        source_type: 'Invoice',
        lines: {
          create: [
            { accountId: assetAcc.id, debit: 10000, credit: 0, description: 'Bank debit' },
            { accountId: revAcc.id, debit: 0, credit: 10000, description: 'Revenue credit' },
            { accountId: expAcc.id, debit: 3000, credit: 0, description: 'Expense debit' },
            { accountId: liabAcc.id, debit: 0, credit: 3000, description: 'Payable credit' },
          ],
        },
      },
    });

    let resData: any = null;
    const req = { query: { as_of: '2026-07-31' } } as any;
    const res = {
      json: (d: any) => {
        resData = d;
      },
    } as any;

    await getBalanceSheet(req, res);

    assert.ok(resData && resData.success, 'Balance Sheet API should return success');
    assert.equal(resData.data.is_balanced, true, 'Balance Sheet must balance');

    // Verify asset line item includes our bank account with is_bank_or_cash = true
    const bankItem = resData.data.assets.find((a: any) => a.account_id === assetAcc.id);
    assert.ok(bankItem, 'Bank asset item must be in assets');
    assert.equal(bankItem.amount, 10000);
    assert.equal(bankItem.is_bank_or_cash, true, 'is_bank_or_cash metadata must be true');

    // Verify liability item
    const liabItem = resData.data.liabilities.find((l: any) => l.account_id === liabAcc.id);
    assert.ok(liabItem, 'Liability item must be present');
    assert.equal(liabItem.amount, 3000);

    // Verify current year earnings
    const currentYearItem = resData.data.equity.find((e: any) => e.kind === 'current_year_earnings');
    assert.ok(currentYearItem, 'Current year earnings line must be present');
    assert.equal(currentYearItem.amount, 7000, 'Current year net income should be 10000 - 3000 = 7000');
  });

  await t.test('2. B2 Fix: Snapshot path works and produces identical totals when period is Closed or Locked', async () => {
    // Close the period to generate snapshots
    await closeAccountingPeriodWithSnapshot(period.id);

    // Now Lock the period
    await prisma.accountingPeriod.update({
      where: { id: period.id },
      data: { status: 'Locked' },
    });

    let resData: any = null;
    const req = { query: { as_of: '2026-07-31' } } as any;
    const res = {
      json: (d: any) => {
        resData = d;
      },
    } as any;

    await getBalanceSheet(req, res);

    assert.ok(resData && resData.success);
    assert.equal(resData.data.using_snapshot, true, 'Should use snapshot for locked period');
    assert.equal(resData.data.is_balanced, true, 'Balance sheet must balance when using snapshot');

    const bankItem = resData.data.assets.find((a: any) => a.account_id === assetAcc.id);
    assert.equal(bankItem?.amount, 10000);
  });
});

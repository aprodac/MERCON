if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/mercon_db?schema=public';
}
import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../db';
import {
  getGeneralLedger,
  getGeneralLedgerSummary,
  getGeneralLedgerMonthly,
} from '../controllers/financeReportsController';

test('General Ledger Engine & Report Test Suite', async (t) => {
  let assetAcc: any;
  let equityAcc: any;
  let revAcc: any;
  let expAcc: any;
  let period: any;

  t.before(async () => {
    const timestamp = Date.now();

    assetAcc = await prisma.account.create({
      data: {
        account_code: `TEST-1010-${timestamp}`,
        name: 'Test Bank Account',
        account_type: 'Asset',
        is_postable: true,
      },
    });

    equityAcc = await prisma.account.create({
      data: {
        account_code: `TEST-3100-${timestamp}`,
        name: "Test Owner's Capital",
        account_type: 'Equity',
        is_postable: true,
      },
    });

    revAcc = await prisma.account.create({
      data: {
        account_code: `TEST-4010-${timestamp}`,
        name: 'Test Freight Revenue',
        account_type: 'Revenue',
        is_postable: true,
      },
    });

    expAcc = await prisma.account.create({
      data: {
        account_code: `TEST-5010-${timestamp}`,
        name: 'Test Driver Expense',
        account_type: 'Expense',
        is_postable: true,
      },
    });

    const startDate = new Date(Date.UTC(2026, 6, 1, 0, 0, 0)); // July 1 2026
    const endDate = new Date(Date.UTC(2026, 8, 30, 23, 59, 59)); // Sept 30 2026

    const existingPeriod = await prisma.accountingPeriod.findFirst({
      where: { start_date: startDate, end_date: endDate },
    });
    if (existingPeriod) {
      period = existingPeriod;
    } else {
      period = await prisma.accountingPeriod.create({
        data: {
          name: `Test GL Period ${timestamp}`,
          start_date: startDate,
          end_date: endDate,
          status: 'Open',
        },
      });
    }
  });

  await t.test('1. Contra for a simple 2-line entry and a multi-line entry', async () => {
    // 1. Simple 2-line entry: Debit Asset 10,000, Credit Equity 10,000
    await prisma.journalEntry.create({
      data: {
        ref_id: `JE-TEST-SIMPLE-${Date.now()}`,
        entry_date: new Date('2026-07-05T10:00:00Z'),
        memo: 'Capital Investment',
        status: 'Posted',
        periodId: period.id,
        source_type: 'Manual',
        lines: {
          create: [
            { accountId: assetAcc.id, debit: 10000, credit: 0, description: 'Deposit' },
            { accountId: equityAcc.id, debit: 0, credit: 10000, description: 'Capital' },
          ],
        },
      },
    });

    // 2. Multi-line entry: Credit Equity 15,000, Debit Asset 12,000, Debit Expense 3,000
    await prisma.journalEntry.create({
      data: {
        ref_id: `JE-TEST-MULTI-${Date.now()}`,
        entry_date: new Date('2026-07-10T10:00:00Z'),
        memo: 'Split Entry',
        status: 'Posted',
        periodId: period.id,
        source_type: 'Manual',
        lines: {
          create: [
            { accountId: equityAcc.id, debit: 0, credit: 15000, description: 'Equity' },
            { accountId: assetAcc.id, debit: 12000, credit: 0, description: 'Asset portion' },
            { accountId: expAcc.id, debit: 3000, credit: 0, description: 'Fee portion' },
          ],
        },
      },
    });

    // Query GL for Asset Account
    let resData: any = null;
    const req = {
      query: {
        account_id: assetAcc.id,
        date_from: '2026-07-01',
        date_to: '2026-07-31',
      },
    } as any;
    const res = {
      json: (d: any) => {
        resData = d;
        return res;
      },
      status: () => res,
    } as any;

    await getGeneralLedger(req, res);
    assert.ok(resData?.success);

    const lines = resData.data.lines;
    assert.equal(lines.length, 2);

    // Simple 2-line entry contra check
    const simpleLine = lines[0];
    assert.equal(simpleLine.contra.length, 1);
    assert.equal(simpleLine.contra[0].account_id, equityAcc.id);
    assert.equal(simpleLine.contra[0].amount, 10000);

    // Query GL for Equity Account (multi-line entry)
    let equityResData: any = null;
    const equityReq = {
      query: {
        account_id: equityAcc.id,
        date_from: '2026-07-01',
        date_to: '2026-07-31',
      },
    } as any;
    const equityRes = {
      json: (d: any) => {
        equityResData = d;
        return equityRes;
      },
      status: () => equityRes,
    } as any;

    await getGeneralLedger(equityReq, equityRes);
    assert.ok(equityResData?.success);

    const eqLines = equityResData.data.lines;
    const multiLine = eqLines.find((l: any) => l.credit === 15000);
    assert.ok(multiLine);
    // Should have 2 opposite side contra lines (Asset 12,000 and Expense 3,000)
    assert.equal(multiLine.contra.length, 2);
  });

  await t.test('2. Running balance continuity across two pages', async () => {
    // Page 1 with per_page = 1
    let page1ResData: any = null;
    const req1 = {
      query: {
        account_id: assetAcc.id,
        date_from: '2026-07-01',
        date_to: '2026-07-31',
        page: '1',
        per_page: '1',
      },
    } as any;
    const res1 = {
      json: (d: any) => {
        page1ResData = d;
        return res1;
      },
      status: () => res1,
    } as any;
    await getGeneralLedger(req1, res1);

    assert.equal(page1ResData.data.lines.length, 1);
    const p1Line = page1ResData.data.lines[0];
    assert.equal(p1Line.running_balance, 10000);

    // Page 2 with per_page = 1
    let page2ResData: any = null;
    const req2 = {
      query: {
        account_id: assetAcc.id,
        date_from: '2026-07-01',
        date_to: '2026-07-31',
        page: '2',
        per_page: '1',
      },
    } as any;
    const res2 = {
      json: (d: any) => {
        page2ResData = d;
        return res2;
      },
      status: () => res2,
    } as any;
    await getGeneralLedger(req2, res2);

    assert.equal(page2ResData.data.lines.length, 1);
    const p2Line = page2ResData.data.lines[0];
    assert.equal(page2ResData.data.page_opening_balance, 10000);
    assert.equal(p2Line.running_balance, 22000); // 10,000 + 12,000
  });

  await t.test('3. Range totals ignore pagination', async () => {
    let page1ResData: any = null;
    const req = {
      query: {
        account_id: assetAcc.id,
        date_from: '2026-07-01',
        date_to: '2026-07-31',
        page: '1',
        per_page: '1',
      },
    } as any;
    const res = {
      json: (d: any) => {
        page1ResData = d;
        return res;
      },
      status: () => res,
    } as any;
    await getGeneralLedger(req, res);

    assert.equal(page1ResData.data.total_debit, 22000);
    assert.equal(page1ResData.data.count, 2);
    assert.equal(page1ResData.data.closing_balance, 22000);
  });

  await t.test('4. Summary debits = credits', async () => {
    let summaryResData: any = null;
    const req = {
      query: {
        date_from: '2026-07-01',
        date_to: '2026-07-31',
      },
    } as any;
    const res = {
      json: (d: any) => {
        summaryResData = d;
        return res;
      },
      status: () => res,
    } as any;

    await getGeneralLedgerSummary(req, res);
    assert.ok(summaryResData.success);
    assert.equal(summaryResData.data.is_balanced, true);
    assert.equal(summaryResData.data.total_debit, summaryResData.data.total_credit);
  });

  await t.test('5. Monthly closings chain correctly', async () => {
    // Add entry in August
    await prisma.journalEntry.create({
      data: {
        ref_id: `JE-TEST-AUG-${Date.now()}`,
        entry_date: new Date('2026-08-15T10:00:00Z'),
        memo: 'August Income',
        status: 'Posted',
        periodId: period.id,
        source_type: 'Manual',
        lines: {
          create: [
            { accountId: assetAcc.id, debit: 5000, credit: 0, description: 'Aug Income' },
            { accountId: revAcc.id, debit: 0, credit: 5000, description: 'Aug Income' },
          ],
        },
      },
    });

    let monthlyResData: any = null;
    const req = {
      query: {
        account_id: assetAcc.id,
        date_from: '2026-07-01',
        date_to: '2026-09-30',
      },
    } as any;
    const res = {
      json: (d: any) => {
        monthlyResData = d;
        return res;
      },
      status: () => res,
    } as any;

    await getGeneralLedgerMonthly(req, res);
    assert.ok(monthlyResData.success);

    const items = monthlyResData.data.items;
    assert.equal(items.length, 3); // July, Aug, Sept

    // July closing
    assert.equal(items[0].month, '2026-07');
    assert.equal(items[0].debit, 22000);
    assert.equal(items[0].closing.signed, 22000);

    // Aug closing
    assert.equal(items[1].month, '2026-08');
    assert.equal(items[1].debit, 5000);
    assert.equal(items[1].closing.signed, 27000);

    // Sept closing (no activity, closing chains from August)
    assert.equal(items[2].month, '2026-09');
    assert.equal(items[2].debit, 0);
    assert.equal(items[2].closing.signed, 27000);
  });
});

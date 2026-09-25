if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/mercon_db?schema=public';
}
import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../db';
import { calculateProfitAndLossData, getGeneralLedger } from '../controllers/financeReportsController';

test('P&L Calculation & Date Boundaries Test Suite', async (t) => {
  let parentRevAcc: any;
  let childRevAcc: any;
  let expAcc: any;
  let period: any;

  t.before(async () => {
    const timestamp = Date.now();

    // Create parent revenue account
    parentRevAcc = await prisma.account.create({
      data: {
        account_code: `TEST-4100-${timestamp}`,
        name: 'Operating Sales Group',
        account_type: 'Revenue',
        is_postable: false,
      },
    });

    // Create child revenue account with parentId
    childRevAcc = await prisma.account.create({
      data: {
        account_code: `TEST-4110-${timestamp}`,
        name: 'Freight Revenue Child',
        account_type: 'Revenue',
        parentId: parentRevAcc.id,
        is_postable: true,
      },
    });

    // Create expense account
    expAcc = await prisma.account.create({
      data: {
        account_code: `TEST-5100-${timestamp}`,
        name: 'Fuel Expense',
        account_type: 'Expense',
        is_postable: true,
      },
    });

    // Create or retrieve period for August 2026
    const startDate = new Date(Date.UTC(2026, 7, 1, 0, 0, 0));
    const endDate = new Date(Date.UTC(2026, 7, 31, 23, 59, 59));
    const existingPeriod = await prisma.accountingPeriod.findFirst({
      where: { start_date: startDate, end_date: endDate },
    });
    if (existingPeriod) {
      period = existingPeriod;
    } else {
      period = await prisma.accountingPeriod.create({
        data: {
          name: `Test PnL Period ${timestamp}`,
          start_date: startDate,
          end_date: endDate,
          status: 'Open',
        },
      });
    }
  });

  await t.test('1. Includes entries on the last day of the date range and checks parent fields', async () => {
    // Create entry on 31 August 2026 at 20:00 UTC (which is 23:00 Asia/Riyadh time)
    const lateAugustDate = new Date('2026-08-31T20:00:00.000Z');

    await prisma.journalEntry.create({
      data: {
        ref_id: `JE-TEST-LATE-${Date.now()}`,
        entry_date: lateAugustDate,
        memo: 'End of August trip invoice',
        status: 'Posted',
        periodId: period.id,
        source_type: 'Invoice',
        lines: {
          create: [
            {
              accountId: childRevAcc.id,
              debit: 0,
              credit: 12500,
              description: 'Freight revenue late Aug',
            },
            {
              accountId: expAcc.id,
              debit: 12500,
              credit: 0,
              description: 'Fuel cost late Aug',
            },
          ],
        },
      },
    });

    const pnl = await calculateProfitAndLossData('2026-08-01', '2026-08-31');

    // Verify revenue line includes childRevAcc with parent fields
    const revItem = pnl.revenues.find((r) => r.account_id === childRevAcc.id);
    assert.ok(revItem, 'Child revenue account should be present in P&L');
    assert.equal(revItem.amount, 12500);
    assert.equal(revItem.parent_id, parentRevAcc.id);
    assert.equal(revItem.parent_code, parentRevAcc.account_code);
    assert.equal(revItem.parent_name, parentRevAcc.name);

    // Verify expense line is included
    const expItem = pnl.expenses.find((e) => e.account_id === expAcc.id);
    assert.ok(expItem, 'Expense account should be present in P&L');
    assert.equal(expItem.amount, 12500);
  });

  await t.test('2. FiscalYearClosing entries are excluded from P&L', async () => {
    const pnlBefore = await calculateProfitAndLossData('2026-08-01', '2026-08-31');

    // Create a FiscalYearClosing entry that nets out revenue to 0
    await prisma.journalEntry.create({
      data: {
        ref_id: `JE-TEST-FYCLOSE-${Date.now()}`,
        entry_date: new Date('2026-08-31T21:00:00.000Z'),
        memo: 'Year-End Closing Entry',
        status: 'Posted',
        periodId: period.id,
        source_type: 'FiscalYearClosing',
        lines: {
          create: [
            {
              accountId: childRevAcc.id,
              debit: 12500,
              credit: 0,
              description: 'Close revenue to Retained Earnings',
            },
            {
              accountId: expAcc.id,
              debit: 0,
              credit: 12500,
              description: 'Close expense to Retained Earnings',
            },
          ],
        },
      },
    });

    const pnlAfter = await calculateProfitAndLossData('2026-08-01', '2026-08-31');

    // P&L after year-end closing entry must remain identical to before (not collapse to zero)
    assert.equal(pnlAfter.total_revenue, pnlBefore.total_revenue);
    assert.equal(pnlAfter.total_expense, pnlBefore.total_expense);
    assert.equal(pnlAfter.net_profit, pnlBefore.net_profit);
  });

  await t.test('3. General Ledger sum over range agrees with P&L amount', async () => {
    const pnl = await calculateProfitAndLossData('2026-08-01', '2026-08-31');
    const pnlExpenseItem = pnl.expenses.find((e) => e.account_id === expAcc.id);
    assert.ok(pnlExpenseItem);

    // Call getGeneralLedger handler for expAcc over same date range
    const req = {
      query: {
        account_id: expAcc.id,
        date_from: '2026-08-01',
        date_to: '2026-08-31',
      },
    } as any;

    let resData: any = null;
    const res = {
      json: (d: any) => {
        resData = d;
        return res;
      },
      status: () => res,
    } as any;

    await getGeneralLedger(req, res);
    assert.ok(resData?.success);

    const glLines = resData.data.lines;
    const glNetChange = glLines.reduce((sum: number, l: any) => sum + (l.debit - l.credit), 0);

    assert.equal(glNetChange, pnlExpenseItem.amount, 'GL net change must match P&L amount');
  });
});

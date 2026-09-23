import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/mercon_db?schema=public';
}

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../db';

import { getARAgeing, getAPAgeing } from '../controllers/ageingReportsController';
import { getCashFlow } from '../controllers/financeReportsController';
import { closeFiscalYear } from '../utils/fiscalYearClosingEngine';
import { AccountingError } from '../utils/accountingEngine';

describe('Financial Reports & Fiscal Year-End Closing Integration Suite', () => {
  let createdPeriodId: string;
  let closedPeriodId: string;
  let testCustomerId: string;
  let testProviderId: string;
  let invoiceId: string;
  let billId: string;
  let revenueAccId: string;
  let expenseAccId: string;
  let retainedEarningsAccId: string;
  let cashAccId: string;
  let bankAccountId: string;
  let preExistingOpenPeriodIds: string[] = [];

  const closingDate = new Date('2026-12-31T23:59:59Z');

  before(async () => {
    // 1. Singleton settings
    await prisma.settings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton' },
      update: {},
    });

    // 2. Temporarily close any pre-existing Open periods to isolate test environment
    const preExistingOpen = await prisma.accountingPeriod.findMany({
      where: { status: 'Open', end_date: { lte: closingDate } },
      select: { id: true },
    });
    preExistingOpenPeriodIds = preExistingOpen.map((p: any) => p.id);

    if (preExistingOpenPeriodIds.length > 0) {
      await prisma.accountingPeriod.updateMany({
        where: { id: { in: preExistingOpenPeriodIds } },
        data: { status: 'Closed' },
      });
    }

    // 3. GL Accounts
    const revAcc = await prisma.account.create({
      data: {
        account_code: `4000-TEST-${Date.now().toString().slice(-4)}`,
        name: 'Freight Revenue Test',
        account_type: 'Revenue',
        is_postable: true,
        isActive: true,
      },
    });
    revenueAccId = revAcc.id;

    const expAcc = await prisma.account.create({
      data: {
        account_code: `5000-TEST-${Date.now().toString().slice(-4)}`,
        name: 'Fuel Expense Test',
        account_type: 'Expense',
        is_postable: true,
        isActive: true,
      },
    });
    expenseAccId = expAcc.id;

    const reAcc = await prisma.account.create({
      data: {
        account_code: `3900-TEST-${Date.now().toString().slice(-4)}`,
        name: 'Retained Earnings Test',
        account_type: 'Equity',
        is_postable: true,
        isActive: true,
      },
    });
    retainedEarningsAccId = reAcc.id;

    const cashAcc = await prisma.account.create({
      data: {
        account_code: `1010-TEST-${Date.now().toString().slice(-4)}`,
        name: 'Main Cash GL Test',
        account_type: 'Asset',
        cash_flow_category: 'Operating',
        is_postable: true,
        isActive: true,
      },
    });
    cashAccId = cashAcc.id;

    const bAcc = await prisma.bankAccount.create({
      data: {
        accountId: cashAccId,
        bank_name: 'Test Cash Vault',
        currency: 'SAR',
        is_cash: true,
        opening_balance: 5000,
      },
    });
    bankAccountId = bAcc.id;

    // Update Settings with retained earnings account
    await prisma.settings.update({
      where: { id: 'singleton' },
      data: {
        defaultRetainedEarningsAccountId: retainedEarningsAccId,
      },
    });

    // 4. Accounting Period (Closed)
    const closedP = await prisma.accountingPeriod.create({
      data: {
        name: `FY2026 Test Period ${Date.now()}`,
        start_date: new Date('2026-01-01T00:00:00Z'),
        end_date: new Date('2026-06-30T23:59:59Z'),
        status: 'Closed',
      },
    });
    closedPeriodId = closedP.id;

    // 5. Create Customer and Issued Invoice (45 days overdue)
    const customer = await prisma.customer.create({
      data: {
        name: `Ageing Test Customer ${Date.now()}`,
        contact_phone: '+966580001111',
      },
    });
    testCustomerId = customer.id;

    const fortyFiveDaysAgo = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    const inv = await prisma.invoice.create({
      data: {
        ref_id: `INV-AGE-${Date.now()}`,
        customerId: customer.id,
        invoice_date: fortyFiveDaysAgo,
        due_date: fortyFiveDaysAgo,
        status: 'Issued',
        total_amount: 1200,
        paid_amount: 0,
        balance_due: 1200,
      },
    });
    invoiceId = inv.id;

    // 6. Create Provider and Approved Bill (15 days overdue)
    const provider = await prisma.thirdPartyProvider.create({
      data: {
        name: `Ageing Test Provider ${Date.now()}`,
        phone: '+966580002222',
      },
    });
    testProviderId = provider.id;

    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
    const b = await prisma.bill.create({
      data: {
        ref_id: `BILL-AGE-${Date.now()}`,
        providerId: provider.id,
        bill_date: fifteenDaysAgo,
        due_date: fifteenDaysAgo,
        status: 'Approved',
        total_amount: 800,
        paid_amount: 0,
        balance_due: 800,
      },
    });
    billId = b.id;

    // 7. Create Posted Journal Entry in closedPeriodId for revenue & expense
    await prisma.journalEntry.create({
      data: {
        ref_id: `JE-CLOSING-FIXTURE-${Date.now()}`,
        entry_date: new Date('2026-03-15T12:00:00Z'),
        memo: 'Revenue and Expense Fixture',
        status: 'Posted',
        periodId: closedPeriodId,
        source_type: 'Manual',
        lines: {
          create: [
            { accountId: revenueAccId, debit: 0, credit: 3000, description: 'Freight Sales' },
            { accountId: expenseAccId, debit: 1000, credit: 0, description: 'Fuel Cost' },
            { accountId: cashAccId, debit: 2000, credit: 0, description: 'Cash Inflow' },
          ],
        },
      },
    });
  });

  after(async () => {
    try {
      if (invoiceId) await prisma.invoice.deleteMany({ where: { id: invoiceId } });
      if (billId) await prisma.bill.deleteMany({ where: { id: billId } });
      if (testCustomerId) await prisma.customer.deleteMany({ where: { id: testCustomerId } });
      if (testProviderId) await prisma.thirdPartyProvider.deleteMany({ where: { id: testProviderId } });
      if (bankAccountId) await prisma.bankAccount.deleteMany({ where: { id: bankAccountId } });

      if (closedPeriodId) {
        await prisma.journalLine.deleteMany({ where: { journalEntry: { periodId: closedPeriodId } } });
        await prisma.journalEntry.deleteMany({ where: { periodId: closedPeriodId } });
        await prisma.accountingPeriod.deleteMany({ where: { id: closedPeriodId } });
      }

      if (createdPeriodId) {
        await prisma.journalLine.deleteMany({ where: { journalEntry: { periodId: createdPeriodId } } });
        await prisma.journalEntry.deleteMany({ where: { periodId: createdPeriodId } });
        await prisma.accountingPeriod.deleteMany({ where: { id: createdPeriodId } });
      }

      await prisma.journalLine.deleteMany({ where: { accountId: { in: [revenueAccId, expenseAccId, retainedEarningsAccId, cashAccId] } } });
      await prisma.journalEntry.deleteMany({ where: { source_type: 'FiscalYearClosing' } });
      await prisma.account.deleteMany({ where: { id: { in: [revenueAccId, expenseAccId, retainedEarningsAccId, cashAccId] } } });

      // Restore pre-existing open periods
      if (preExistingOpenPeriodIds.length > 0) {
        await prisma.accountingPeriod.updateMany({
          where: { id: { in: preExistingOpenPeriodIds } },
          data: { status: 'Open' },
        });
      }
    } catch (err) {
      // Ignore cleanup error
    }
  });

  it('1. AR Ageing: buckets sample 45-day overdue invoice under 31-60 days', async () => {
    let responseData: any = null;
    const req: any = { query: {} };
    const res: any = {
      json: (data: any) => {
        responseData = data;
      },
    };

    await getARAgeing(req, res);

    assert.ok(responseData && responseData.success, 'AR Ageing response must be successful');
    const rows = responseData.data.rows;
    const targetRow = rows.find((r: any) => r.party_name.includes('Ageing Test Customer'));

    assert.ok(targetRow, 'Target customer row must exist in report');
    assert.equal(targetRow.days_31_60, 1200, 'Invoice balance of 1200 must be bucketed under 31-60 days');
    assert.equal(targetRow.total, 1200, 'Total for customer must equal 1200');
  });

  it('2. AP Ageing: buckets sample 15-day overdue bill under 1-30 days', async () => {
    let responseData: any = null;
    const req: any = { query: {} };
    const res: any = {
      json: (data: any) => {
        responseData = data;
      },
    };

    await getAPAgeing(req, res);

    assert.ok(responseData && responseData.success, 'AP Ageing response must be successful');
    const rows = responseData.data.rows;
    const targetRow = rows.find((r: any) => r.party_name.includes('Ageing Test Provider'));

    assert.ok(targetRow, 'Target provider row must exist in report');
    assert.equal(targetRow.days_1_30, 800, 'Bill balance of 800 must be bucketed under 1-30 days');
    assert.equal(targetRow.total, 800, 'Total for provider must equal 800');
  });

  it('3. Cash Flow: net_change_in_cash equals operating + investing + financing totals', async () => {
    let responseData: any = null;
    const req: any = { query: { date_from: '2026-01-01', date_to: '2026-12-31' } };
    const res: any = {
      json: (data: any) => {
        responseData = data;
      },
    };

    await getCashFlow(req, res);

    assert.ok(responseData && responseData.success, 'Cash Flow response must be successful');
    const data = responseData.data;

    assert.equal(typeof data.net_change_in_cash, 'number');
    assert.equal(typeof data.opening_cash, 'number');
    assert.equal(typeof data.closing_cash, 'number');

    const expectedNet = data.operating.total + data.investing.total + data.financing.total;
    assert.equal(
      data.net_change_in_cash,
      expectedNet,
      `net_change_in_cash (${data.net_change_in_cash}) must equal sum of operating + investing + financing (${expectedNet})`,
    );
  });

  it('4. closeFiscalYear: rejects when an Open period exists in range', async () => {
    // Create an open period before closingDate
    const openPeriod = await prisma.accountingPeriod.create({
      data: {
        name: `Open Period Test ${Date.now()}`,
        start_date: new Date('2026-07-01T00:00:00Z'),
        end_date: new Date('2026-07-31T23:59:59Z'),
        status: 'Open',
      },
    });
    createdPeriodId = openPeriod.id;

    await assert.rejects(
      async () => {
        await closeFiscalYear(closingDate, 'test-user-id');
      },
      (err: any) => err instanceof AccountingError && err.code === 'OPEN_PERIODS_EXIST',
    );

    // Close the open period so subsequent test can run
    await prisma.accountingPeriod.update({
      where: { id: createdPeriodId },
      data: { status: 'Closed' },
    });
  });

  it('5. closeFiscalYear: rejects when defaultRetainedEarningsAccountId is not set', async () => {
    // Temporarily clear Settings
    await prisma.settings.update({
      where: { id: 'singleton' },
      data: { defaultRetainedEarningsAccountId: null },
    });

    await assert.rejects(
      async () => {
        await closeFiscalYear(closingDate, 'test-user-id');
      },
      (err: any) => err instanceof AccountingError && err.code === 'RETAINED_EARNINGS_ACCOUNT_NOT_SET',
    );

    // Restore Settings
    await prisma.settings.update({
      where: { id: 'singleton' },
      data: { defaultRetainedEarningsAccountId: retainedEarningsAccId },
    });
  });

  it('6. closeFiscalYear: correctly zeroes Revenue & Expense accounts and posts net to Retained Earnings', async () => {
    const postedLines = await prisma.journalLine.findMany({
      where: {
        journalEntry: { status: { in: ['Posted', 'Voided'] }, entry_date: { lte: closingDate } },
        account: { account_type: { in: ['Revenue', 'Expense'] } },
      },
      include: { account: true },
    });

    let totalRev = 0;
    let totalExp = 0;
    for (const l of postedLines) {
      if (l.account.account_type === 'Revenue') {
        totalRev += Number(l.credit) - Number(l.debit);
      } else if (l.account.account_type === 'Expense') {
        totalExp += Number(l.debit) - Number(l.credit);
      }
    }
    const expectedNetIncome = totalRev - totalExp;

    const closingEntry = await closeFiscalYear(closingDate, 'test-user-id');

    assert.ok(closingEntry, 'Closing entry should be returned');
    assert.equal(closingEntry.status, 'Posted');
    assert.equal(closingEntry.source_type, 'FiscalYearClosing');

    // Verify lines balance
    let totalDebit = 0;
    let totalCredit = 0;

    for (const l of closingEntry.lines) {
      totalDebit += Number(l.debit || 0);
      totalCredit += Number(l.credit || 0);
    }

    assert.equal(totalDebit, totalCredit, 'Closing entry debits must equal credits');

    // Verify Revenue account (originally 3000 CR) now has a 3000 DR closing line
    const revLine = closingEntry.lines.find((l: any) => l.accountId === revenueAccId);
    assert.ok(revLine, 'Revenue closing line must exist');
    assert.equal(Number(revLine.debit), 3000);
    assert.equal(Number(revLine.credit), 0);

    // Verify Expense account (originally 1000 DR) now has a 1000 CR closing line
    const expLine = closingEntry.lines.find((l: any) => l.accountId === expenseAccId);
    assert.ok(expLine, 'Expense closing line must exist');
    assert.equal(Number(expLine.debit), 0);
    assert.equal(Number(expLine.credit), 1000);

    // Verify Retained Earnings receives Net Income
    const reLine = closingEntry.lines.find((l: any) => l.accountId === retainedEarningsAccId);
    assert.ok(reLine, 'Retained earnings line must exist');
    assert.equal(Number(reLine.debit), 0);
    assert.equal(Number(reLine.credit), expectedNetIncome);
  });
});

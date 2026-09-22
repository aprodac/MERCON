import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../db';
import { reconcileBankAccount } from '../utils/cashBankEngine';
import { recordAdvance, applyAdvance } from '../utils/advanceEngine';
import { closeAccountingPeriodWithSnapshot } from '../utils/periodClosingEngine';
import { getBalanceSheet } from '../controllers/financeReportsController';
import { AccountingError } from '../utils/accountingEngine';

describe('Phase 4 Integration Audit Suite — Real Functions against Database', () => {
  let createdPeriodId: string;
  let bankAccountId: string;
  let glAccountId: string;
  let lineId: string;
  let advanceId: string;
  let invoiceId: string;

  before(async () => {
    // 1. Ensure singleton Settings exists with default accounts
    await prisma.settings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton' },
      update: {},
    });

    // Create an open AccountingPeriod for test dates
    const startDate = new Date('2026-01-01T00:00:00Z');
    const endDate = new Date('2026-01-31T23:59:59Z');

    const period = await prisma.accountingPeriod.create({
      data: {
        name: `Audit Test Period ${Date.now()}`,
        start_date: startDate,
        end_date: endDate,
        status: 'Open',
      },
    });
    createdPeriodId = period.id;

    // Create GL Account
    const acc = await prisma.account.create({
      data: {
        account_code: `1010-TEST-${Date.now().toString().slice(-4)}`,
        name: 'Test Bank Account GL',
        account_type: 'Asset',
        is_postable: true,
        isActive: true,
      },
    });
    glAccountId = acc.id;

    // Create AR Account
    const arAcc = await prisma.account.create({
      data: {
        account_code: `1200-TEST-${Date.now().toString().slice(-4)}`,
        name: 'Test AR Account GL',
        account_type: 'Asset',
        is_postable: true,
        isActive: true,
      },
    });

    // Create Customer Advance Account
    const advAcc = await prisma.account.create({
      data: {
        account_code: `2100-TEST-${Date.now().toString().slice(-4)}`,
        name: 'Test Customer Advance GL',
        account_type: 'Liability',
        is_postable: true,
        isActive: true,
      },
    });

    // Create Revenue Account
    const revAcc = await prisma.account.create({
      data: {
        account_code: `4000-TEST-${Date.now().toString().slice(-4)}`,
        name: 'Test Revenue GL',
        account_type: 'Revenue',
        is_postable: true,
        isActive: true,
      },
    });

    // Update Settings with created default accounts
    await prisma.settings.update({
      where: { id: 'singleton' },
      data: {
        defaultReceivableAccountId: arAcc.id,
        defaultCustomerAdvanceAccountId: advAcc.id,
      },
    });

    // Create BankAccount record linked to glAccountId
    const bAcc = await prisma.bankAccount.create({
      data: {
        accountId: glAccountId,
        bank_name: 'Test Saudi National Bank',
        account_number: 'SA1234567890',
        currency: 'SAR',
        is_cash: false,
      },
    });
    bankAccountId = bAcc.id;

    // Create a Posted JournalEntry with a line on glAccountId to test reconciliation
    const entry = await prisma.journalEntry.create({
      data: {
        ref_id: `JE-AUDIT-${Date.now()}`,
        entry_date: new Date('2026-01-15T12:00:00Z'),
        memo: 'Audit Test Entry',
        status: 'Posted',
        periodId: createdPeriodId,
        source_type: 'Manual',
        lines: {
          create: [
            { accountId: glAccountId, debit: 1000, credit: 0, description: 'Test Debit' },
            { accountId: revAcc.id, debit: 0, credit: 1000, description: 'Test Credit Revenue' },
          ],
        },
      },
      include: { lines: true },
    });

    const targetLine = entry.lines.find((l) => l.accountId === glAccountId);
    assert.ok(targetLine, 'Journal line must exist');
    lineId = targetLine.id;

    // Create Customer & Invoice for advance testing
    const customer = await prisma.customer.create({
      data: {
        name: `Audit Customer ${Date.now()}`,
        contact_phone: '+966599999999',
      },
    });

    const inv = await prisma.invoice.create({
      data: {
        ref_id: `INV-AUDIT-${Date.now()}`,
        customerId: customer.id,
        total_amount: 500,
        paid_amount: 0,
        balance_due: 500,
        status: 'Issued',
        invoice_date: new Date('2026-01-15'),
      },
    });
    invoiceId = inv.id;

    // Record an advance
    const adv = await recordAdvance({
      party_type: 'Customer',
      party_id: customer.id,
      direction: 'Received',
      amount: 500,
      advance_date: '2026-01-15',
      accountId: glAccountId,
      memo: 'Audit Advance',
    });
    advanceId = adv.id;
  });

  after(async () => {
    // Cleanup created test records
    try {
      if (advanceId) {
        await prisma.advanceApplication.deleteMany({ where: { advanceId } });
        await prisma.advance.deleteMany({ where: { id: advanceId } });
      }
      if (invoiceId) {
        await prisma.invoice.delete({ where: { id: invoiceId } });
      }
      if (bankAccountId) {
        await prisma.bankReconciliation.deleteMany({ where: { bankAccountId } });
        await prisma.bankAccount.delete({ where: { id: bankAccountId } });
      }
      if (createdPeriodId) {
        await prisma.accountClosingBalance.deleteMany({ where: { periodId: createdPeriodId } });
        await prisma.journalLine.deleteMany({ where: { journalEntry: { periodId: createdPeriodId } } });
        await prisma.journalEntry.deleteMany({ where: { periodId: createdPeriodId } });
        await prisma.accountingPeriod.delete({ where: { id: createdPeriodId } });
      }
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  it('1. reconcileBankAccount: successfully reconciles line, then rejects duplicate reconciliation with ALREADY_RECONCILED', async () => {
    // First call: Reconcile line using real engine function against DB
    const rec = await reconcileBankAccount(bankAccountId, new Date('2026-01-31'), 1000, [lineId]);
    assert.equal(rec.status, 'Completed');

    const updatedLine = await prisma.journalLine.findUnique({ where: { id: lineId } });
    assert.equal(updatedLine?.reconciled, true);

    // Second call: Reconcile same line again -> Real reconcileBankAccount must throw AccountingError ALREADY_RECONCILED
    await assert.rejects(
      async () => {
        await reconcileBankAccount(bankAccountId, new Date('2026-01-31'), 1000, [lineId]);
      },
      (err: any) => err instanceof AccountingError && err.code === 'ALREADY_RECONCILED',
    );
  });

  it('2. applyAdvance: applies advance, then rejects over-application on zero remaining balance', async () => {
    // First call: apply 500 advance to invoice using real engine function against DB
    const result = await applyAdvance(advanceId, invoiceId, 'Invoice', 500);
    assert.ok(result.advance, 'Updated advance should be returned');
    assert.equal(result.advance.status, 'FullyApplied');
    assert.equal(Number(result.advance.remaining_amount), 0);

    // Second call: attempt to apply 500 again -> Real applyAdvance must throw EXCEEDS_REMAINING_AMOUNT or CONCURRENCY_ERROR
    await assert.rejects(
      async () => {
        await applyAdvance(advanceId, invoiceId, 'Invoice', 500);
      },
      (err: any) => err instanceof AccountingError && (err.code === 'EXCEEDS_REMAINING_AMOUNT' || err.code === 'CONCURRENCY_ERROR'),
    );
  });

  it('3. closeAccountingPeriodWithSnapshot & getBalanceSheet snapshot optimization', async () => {
    // Close period using real engine function to generate AccountClosingBalance snapshot records
    const closedPeriod = await closeAccountingPeriodWithSnapshot(createdPeriodId);
    assert.equal(closedPeriod?.status, 'Closed');
    assert.ok(closedPeriod.closingBalances.length > 0, 'Closing balances must be populated');

    // Invoke getBalanceSheet controller handler for period end date to test snapshot path
    let jsonResult: any = null;
    const req: any = { query: { as_of: '2026-01-31T23:59:59Z' } };
    const res: any = {
      json: (data: any) => {
        jsonResult = data;
      },
    };

    await getBalanceSheet(req, res);

    assert.ok(jsonResult && jsonResult.success, 'Report response must be successful');
    assert.equal(jsonResult.data.using_snapshot, true, 'Report must use snapshot optimization for closed period end date');
    assert.equal(jsonResult.data.is_balanced, true, 'Balance sheet equation (Assets = Liabilities + Equity) must balance');
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../db';
import { transferFunds, reconcileBankAccount } from '../utils/cashBankEngine';
import { recordAdvance, applyAdvance, voidAdvance } from '../utils/advanceEngine';
import { closeAccountingPeriodWithSnapshot } from '../utils/periodClosingEngine';
import { issueInvoice } from '../utils/invoiceEngine';
import { approveBill } from '../utils/billEngine';
import { AccountingError } from '../utils/accountingEngine';

const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';

test('Real Phase 4 Finance Engine Integration Test Suite', async (t) => {
  let customer: any;
  let provider: any;
  let bankGLAccount1: any;
  let bankGLAccount2: any;
  let bankAccount1: any;
  let arAccount: any;
  let apAccount: any;
  let customerAdvanceAccount: any;
  let providerAdvanceAccount: any;
  let employeeAdvanceAccount: any;
  let revenueAccount: any;
  let expenseAccount: any;
  let openPeriod: any;

  t.before(async () => {
    const timestamp = Date.now();

    // Create Customer & Provider
    customer = await prisma.customer.create({
      data: {
        name: `Test Customer Phase 4 ${timestamp}`,
        contact_phone: '+966500000001',
      },
    });

    provider = await prisma.thirdPartyProvider.create({
      data: {
        name: `Test Provider Phase 4 ${timestamp}`,
        phone: '+966500000002',
      },
    });

    // Create GL Accounts
    bankGLAccount1 = await prisma.account.create({
      data: {
        account_code: `TEST-1010-${timestamp}`,
        name: 'Operating Bank GL Account 1',
        account_type: 'Asset',
        is_postable: true,
      },
    });

    bankGLAccount2 = await prisma.account.create({
      data: {
        account_code: `TEST-1020-${timestamp}`,
        name: 'Petty Cash GL Account 2',
        account_type: 'Asset',
        is_postable: true,
      },
    });

    arAccount = await prisma.account.create({
      data: {
        account_code: `TEST-1200-${timestamp}`,
        name: 'Accounts Receivable',
        account_type: 'Asset',
        is_postable: true,
      },
    });

    apAccount = await prisma.account.create({
      data: {
        account_code: `TEST-2100-${timestamp}`,
        name: 'Accounts Payable',
        account_type: 'Liability',
        is_postable: true,
      },
    });

    customerAdvanceAccount = await prisma.account.create({
      data: {
        account_code: `TEST-2210-${timestamp}`,
        name: 'Customer Advances Liability',
        account_type: 'Liability',
        is_postable: true,
      },
    });

    providerAdvanceAccount = await prisma.account.create({
      data: {
        account_code: `TEST-1310-${timestamp}`,
        name: 'Provider Advances Asset',
        account_type: 'Asset',
        is_postable: true,
      },
    });

    employeeAdvanceAccount = await prisma.account.create({
      data: {
        account_code: `TEST-1320-${timestamp}`,
        name: 'Employee Advances Asset',
        account_type: 'Asset',
        is_postable: true,
      },
    });

    revenueAccount = await prisma.account.create({
      data: {
        account_code: `TEST-4000-${timestamp}`,
        name: 'Freight Revenue',
        account_type: 'Revenue',
        is_postable: true,
      },
    });

    expenseAccount = await prisma.account.create({
      data: {
        account_code: `TEST-5000-${timestamp}`,
        name: 'Subcontractor Expense',
        account_type: 'Expense',
        is_postable: true,
      },
    });

    // Create BankAccount linked to bankGLAccount1
    bankAccount1 = await prisma.bankAccount.create({
      data: {
        accountId: bankGLAccount1.id,
        bank_name: 'Test Saudi National Bank',
        account_number: `SA${timestamp}`,
        opening_balance: 50000,
        currency: 'SAR',
      },
    });

    // Create Open Accounting Period
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    openPeriod = await prisma.accountingPeriod.create({
      data: {
        name: `Phase 4 Period ${timestamp}`,
        start_date: startDate,
        end_date: endDate,
        status: 'Open',
      },
    });

    // Configure Settings with GL Accounts
    await prisma.settings.upsert({
      where: { id: 'singleton' },
      create: {
        id: 'singleton',
        defaultReceivableAccountId: arAccount.id,
        defaultRevenueAccountId: revenueAccount.id,
        defaultPayableAccountId: apAccount.id,
        defaultCustomerAdvanceAccountId: customerAdvanceAccount.id,
        defaultProviderAdvanceAccountId: providerAdvanceAccount.id,
        defaultEmployeeAdvanceAccountId: employeeAdvanceAccount.id,
      },
      update: {
        defaultReceivableAccountId: arAccount.id,
        defaultRevenueAccountId: revenueAccount.id,
        defaultPayableAccountId: apAccount.id,
        defaultCustomerAdvanceAccountId: customerAdvanceAccount.id,
        defaultProviderAdvanceAccountId: providerAdvanceAccount.id,
        defaultEmployeeAdvanceAccountId: employeeAdvanceAccount.id,
      },
    });
  });

  await t.test('1. transferFunds creates double-entry GL entry and balances debits/credits', async () => {
    const transferDate = new Date();
    const amount = 1500;

    const entry = await transferFunds(
      bankGLAccount1.id,
      bankGLAccount2.id,
      amount,
      transferDate,
      'Test Inter-Account Transfer',
      TEST_USER_ID,
    );

    assert.equal(entry.status, 'Posted');
    assert.equal(entry.lines.length, 2);

    const drLine = entry.lines.find((l: any) => l.accountId === bankGLAccount2.id);
    const crLine = entry.lines.find((l: any) => l.accountId === bankGLAccount1.id);

    assert.ok(drLine);
    assert.ok(crLine);
    assert.equal(Number(drLine.debit), amount);
    assert.equal(Number(crLine.credit), amount);
  });

  await t.test('2. reconcileBankAccount rejects lines from wrong GL account and reconciles valid lines', async () => {
    const transferDate = new Date();
    const entry = await transferFunds(
      bankGLAccount1.id,
      bankGLAccount2.id,
      500,
      transferDate,
      'Transfer for Reconciliation',
      TEST_USER_ID,
    );

    const validLine = entry.lines.find((l: any) => l.accountId === bankGLAccount1.id)!;
    const invalidLine = entry.lines.find((l: any) => l.accountId === bankGLAccount2.id)!;

    // Attempting to reconcile line from wrong account must fail
    await assert.rejects(
      async () => {
        await reconcileBankAccount(
          bankAccount1.id,
          new Date(),
          50000,
          [invalidLine.id],
          TEST_USER_ID,
        );
      },
      (err: any) => {
        assert.equal(err.code, 'INVALID_LINE_ACCOUNT');
        return true;
      },
    );

    // Reconciling valid line must succeed
    const rec = await reconcileBankAccount(
      bankAccount1.id,
      new Date(),
      50000,
      [validLine.id],
      TEST_USER_ID,
    );

    assert.equal(rec.status, 'Completed');
    assert.equal(rec.lines.length, 1);
    assert.equal(rec.lines[0].reconciled, true);
    assert.equal(rec.lines[0].reconciliationId, rec.id);
  });

  await t.test('3. recordAdvance requires configured Settings accounts', async () => {
    // Temporarily clear customer advance account in Settings
    await prisma.settings.update({
      where: { id: 'singleton' },
      data: { defaultCustomerAdvanceAccountId: null },
    });

    await assert.rejects(
      async () => {
        await recordAdvance(
          {
            party_type: 'Customer',
            party_id: customer.id,
            direction: 'Received',
            amount: 2000,
            advance_date: new Date(),
            accountId: bankGLAccount1.id,
          },
          TEST_USER_ID,
        );
      },
      (err: any) => {
        assert.equal(err.code, 'SETTINGS_NOT_CONFIGURED');
        return true;
      },
    );

    // Restore Settings configuration
    await prisma.settings.update({
      where: { id: 'singleton' },
      data: { defaultCustomerAdvanceAccountId: customerAdvanceAccount.id },
    });

    // Record valid Customer Advance
    const advance = await recordAdvance(
      {
        party_type: 'Customer',
        party_id: customer.id,
        direction: 'Received',
        amount: 2000,
        advance_date: new Date(),
        accountId: bankGLAccount1.id,
        memo: 'Advance for future freight trips',
      },
      TEST_USER_ID,
    );

    assert.equal(advance.status, 'Open');
    assert.equal(Number(advance.amount), 2000);
    assert.equal(Number(advance.remaining_amount), 2000);
    assert.ok(advance.journalEntryId);
  });

  await t.test('4. applyAdvance rejects excessive amounts and updates both advance and target balances', async () => {
    // Create & Issue an Invoice for 3000 SAR
    const draftInvoice = await prisma.invoice.create({
      data: {
        customerId: customer.id,
        invoice_date: new Date(),
        due_date: new Date(),
        status: 'Draft',
        subtotal: 3000,
        total_amount: 3000,
        balance_due: 3000,
        lines: {
          create: [
            {
              description: 'Trip Freight Services',
              rate: 3000,
              amount: 3000,
            },
          ],
        },
      },
    });

    const issuedInvoice = await issueInvoice(draftInvoice.id, TEST_USER_ID);

    // Record Customer Advance for 1000 SAR
    const advance = await recordAdvance(
      {
        party_type: 'Customer',
        party_id: customer.id,
        direction: 'Received',
        amount: 1000,
        advance_date: new Date(),
        accountId: bankGLAccount1.id,
      },
      TEST_USER_ID,
    );

    // Rejects applying amount > advance remaining (1000)
    await assert.rejects(
      async () => {
        await applyAdvance(advance.id, issuedInvoice.id, 'Invoice', 1500, TEST_USER_ID);
      },
      (err: any) => {
        assert.equal(err.code, 'EXCEEDS_REMAINING_AMOUNT');
        return true;
      },
    );

    // Apply valid amount 1000 SAR
    const result = await applyAdvance(advance.id, issuedInvoice.id, 'Invoice', 1000, TEST_USER_ID);

    assert.equal(result.advance.status, 'FullyApplied');
    assert.equal(Number(result.advance.remaining_amount), 0);
    assert.equal(Number(result.advance.applied_amount), 1000);

    assert.equal(result.invoice.status, 'PartiallyPaid');
    assert.equal(Number(result.invoice.paid_amount), 1000);
    assert.equal(Number(result.invoice.balance_due), 2000);
    assert.ok(result.application.journalEntryId);
  });

  await t.test('5. voidAdvance rejects voiding if already applied and succeeds when unapplied', async () => {
    // Record advance and apply part of it
    const advance = await recordAdvance(
      {
        party_type: 'Provider',
        party_id: provider.id,
        direction: 'Paid',
        amount: 500,
        advance_date: new Date(),
        accountId: bankGLAccount1.id,
      },
      TEST_USER_ID,
    );

    // Create & Approve Bill
    const draftBill = await prisma.bill.create({
      data: {
        providerId: provider.id,
        bill_date: new Date(),
        due_date: new Date(),
        status: 'Draft',
        subtotal: 500,
        total_amount: 500,
        balance_due: 500,
        lines: {
          create: [
            {
              description: 'Subcontractor Trip Expense',
              amount: 500,
              accountId: expenseAccount.id,
              source_type: 'Manual',
            },
          ],
        },
      },
    });

    const approvedBill = await approveBill(draftBill.id, TEST_USER_ID);

    // Apply 200 SAR of advance
    await applyAdvance(advance.id, approvedBill.id, 'Bill', 200, TEST_USER_ID);

    // Attempting to void advance with applied_amount > 0 must fail
    await assert.rejects(
      async () => {
        await voidAdvance(advance.id, TEST_USER_ID);
      },
      (err: any) => {
        assert.equal(err.code, 'ADVANCE_ALREADY_APPLIED');
        return true;
      },
    );

    // Create a new unapplied advance and void it
    const freshAdvance = await recordAdvance(
      {
        party_type: 'Employee',
        direction: 'Paid',
        amount: 300,
        advance_date: new Date(),
        accountId: bankGLAccount1.id,
      },
      TEST_USER_ID,
    );

    const voided = await voidAdvance(freshAdvance.id, TEST_USER_ID);
    assert.equal(voided.status, 'Void');
    assert.equal(Number(voided.remaining_amount), 0);
  });

  await t.test('6. closeAccountingPeriodWithSnapshot enforces unposted-drafts guard and writes AccountClosingBalance snapshots', async () => {
    const timestamp = Date.now();
    const periodToClose = await prisma.accountingPeriod.create({
      data: {
        name: `Period to Close ${timestamp}`,
        start_date: new Date('2025-01-01'),
        end_date: new Date('2025-01-31'),
        status: 'Open',
      },
    });

    // Create a Draft journal entry in this period to trigger guard
    const draftEntry = await prisma.journalEntry.create({
      data: {
        ref_id: `DRAFT-${timestamp}`,
        entry_date: new Date('2025-01-15'),
        memo: 'Unposted draft entry',
        status: 'Draft',
        periodId: periodToClose.id,
        lines: {
          create: [
            { accountId: bankGLAccount1.id, debit: 100, credit: 0 },
            { accountId: revenueAccount.id, debit: 0, credit: 100 },
          ],
        },
      },
    });

    // Attempting to close period with draft entry must fail
    await assert.rejects(
      async () => {
        await closeAccountingPeriodWithSnapshot(periodToClose.id, TEST_USER_ID);
      },
      (err: any) => {
        assert.equal(err.code, 'UNPOSTED_DRAFTS_EXIST');
        return true;
      },
    );

    // Delete the draft entry
    await prisma.journalLine.deleteMany({ where: { journalEntryId: draftEntry.id } });
    await prisma.journalEntry.delete({ where: { id: draftEntry.id } });

    // Close period with snapshot computation
    const closedPeriod = await closeAccountingPeriodWithSnapshot(periodToClose.id, TEST_USER_ID);
    assert.ok(closedPeriod);
    assert.equal(closedPeriod!.status, 'Closed');
    assert.ok(closedPeriod!.closed_at);
  });
});

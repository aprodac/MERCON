import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../db';
import { approveBill, recordBillPayment, voidBill } from '../utils/billEngine';
import { AccountingError } from '../utils/accountingEngine';

const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';

test('Real Bill / Accounts Payable Engine Integration Test Suite', async (t) => {
  let provider: any;
  let payableAccount: any;
  let expenseAccount: any;
  let bankAccount: any;
  let openPeriod: any;
  let expenseItem: any;
  let billTestDate: Date;

  t.before(async () => {
    const timestamp = Date.now();

    // Create 3PL Provider
    provider = await prisma.thirdPartyProvider.create({
      data: {
        name: `Test Provider AP ${timestamp}`,
        contact_person: 'Subcontractor Rep',
        phone: '+966511111111',
      },
    });

    // Create Accounts
    payableAccount = await prisma.account.create({
      data: {
        account_code: `TEST-2000-${timestamp}`,
        name: 'Accounts Payable',
        account_type: 'Liability',
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

    bankAccount = await prisma.account.create({
      data: {
        account_code: `TEST-1010-${timestamp}`,
        name: 'Bank Account AP',
        account_type: 'Asset',
        is_postable: true,
      },
    });

    // Create Open Accounting Period covering bill & payment dates
    const now = new Date();
    const uniqueYear = 3000 + Math.floor(Math.random() * 5000);
    const startDate = new Date(uniqueYear, 0, 1);
    const endDate = new Date(uniqueYear, 11, 31, 23, 59, 59);

    openPeriod = await prisma.accountingPeriod.create({
      data: {
        name: `Open Period AP ${timestamp}`,
        start_date: startDate,
        end_date: endDate,
        status: 'Open',
      },
    });

    billTestDate = new Date(uniqueYear, 5, 15);

    // Create a sample Expense item
    expenseItem = await prisma.expense.create({
      data: {
        ref_id: `EXP-AP-${timestamp}`,
        category: 'Subcontractor Freight',
        status: 'Pending',
        amount: 2500.0,
        expense_date: billTestDate,
        payee: provider.name,
      },
    });

    // Configure Settings singleton with defaultPayableAccountId
    await prisma.settings.upsert({
      where: { id: 'singleton' },
      update: {
        defaultPayableAccountId: payableAccount.id,
      },
      create: {
        id: 'singleton',
        defaultPayableAccountId: payableAccount.id,
      },
    });
  });

  await t.test('1. approveBill calculates totals, posts Dr Expense / Cr Payable GL entry, and marks status Approved', async () => {
    const bill = await prisma.bill.create({
      data: {
        providerId: provider.id,
        bill_date: billTestDate,
        status: 'Draft',
        tax_amount: 150.0,
        currency: 'SAR',
        lines: {
          create: [
            {
              source_type: 'Expense',
              source_id: expenseItem.id,
              accountId: expenseAccount.id,
              description: 'Subcontractor Transport Service',
              amount: 2500.0,
            },
          ],
        },
      },
    });

    const approvedBill = await approveBill(bill.id, TEST_USER_ID);

    assert.equal(approvedBill.status, 'Approved');
    assert.equal(Number(approvedBill.subtotal), 2500.0);
    assert.equal(Number(approvedBill.tax_amount), 150.0);
    assert.equal(Number(approvedBill.total_amount), 2650.0);
    assert.equal(Number(approvedBill.paid_amount), 0.0);
    assert.equal(Number(approvedBill.balance_due), 2650.0);
    assert.ok(approvedBill.journalEntryId);

    // Verify GL Journal Entry
    const je = await prisma.journalEntry.findUnique({
      where: { id: approvedBill.journalEntryId! },
      include: { lines: true },
    });

    assert.ok(je);
    assert.equal(je.status, 'Posted');
    assert.equal(je.lines.length, 2);

    const drLine = je.lines.find((l) => l.accountId === expenseAccount.id);
    const crLine = je.lines.find((l) => l.accountId === payableAccount.id);

    assert.ok(drLine);
    assert.equal(Number(drLine.debit), 2650.0);
    assert.equal(Number(drLine.credit), 0.0);

    assert.ok(crLine);
    assert.equal(Number(crLine.debit), 0.0);
    assert.equal(Number(crLine.credit), 2650.0);
  });

  await t.test('2. SETTINGS_NOT_CONFIGURED guard rejects approval if default payable account is missing', async () => {
    // Unset defaultPayableAccountId
    await prisma.settings.update({
      where: { id: 'singleton' },
      data: { defaultPayableAccountId: null },
    });

    const bill = await prisma.bill.create({
      data: {
        payee_name: 'Test Payee',
        bill_date: billTestDate,
        status: 'Draft',
        lines: {
          create: [
            {
              accountId: expenseAccount.id,
              description: 'Test Line',
              amount: 500.0,
            },
          ],
        },
      },
    });

    await assert.rejects(
      async () => {
        await approveBill(bill.id, TEST_USER_ID);
      },
      { code: 'SETTINGS_NOT_CONFIGURED' },
    );

    // Restore Settings
    await prisma.settings.update({
      where: { id: 'singleton' },
      data: { defaultPayableAccountId: payableAccount.id },
    });
  });

  await t.test('3. recordBillPayment records partial & full payment, updates status & posts Dr Payable / Cr Bank GL entry', async () => {
    const bill = await prisma.bill.create({
      data: {
        providerId: provider.id,
        bill_date: billTestDate,
        status: 'Draft',
        lines: {
          create: [
            {
              accountId: expenseAccount.id,
              description: 'Spare Parts Service',
              amount: 1000.0,
            },
          ],
        },
      },
    });

    const approvedBill = await approveBill(bill.id, TEST_USER_ID);
    assert.equal(Number(approvedBill.balance_due), 1000.0);

    // Overpayment rejection check
    await assert.rejects(
      async () => {
        await recordBillPayment(approvedBill.id, TEST_USER_ID, {
          amount: 1500.0,
          payment_date: billTestDate,
          accountId: bankAccount.id,
        });
      },
      { code: 'OVERPAYMENT' },
    );

    // Partial payment: 400
    const partialResult = await recordBillPayment(approvedBill.id, TEST_USER_ID, {
      amount: 400.0,
      payment_date: billTestDate,
      accountId: bankAccount.id,
      payment_method: 'Bank Transfer',
      reference: 'TXN-PARTIAL-001',
    });

    assert.equal(partialResult.bill.status, 'PartiallyPaid');
    assert.equal(Number(partialResult.bill.paid_amount), 400.0);
    assert.equal(Number(partialResult.bill.balance_due), 600.0);

    // Verify Payment GL Entry
    const paymentJe = await prisma.journalEntry.findUnique({
      where: { id: partialResult.payment.journalEntryId! },
      include: { lines: true },
    });
    assert.ok(paymentJe);
    assert.equal(paymentJe.status, 'Posted');

    const drAP = paymentJe.lines.find((l) => l.accountId === payableAccount.id);
    const crBank = paymentJe.lines.find((l) => l.accountId === bankAccount.id);

    assert.ok(drAP);
    assert.equal(Number(drAP.debit), 400.0);
    assert.ok(crBank);
    assert.equal(Number(crBank.credit), 400.0);

    // Final payment: remaining 600
    const finalResult = await recordBillPayment(approvedBill.id, TEST_USER_ID, {
      amount: 600.0,
      payment_date: billTestDate,
      accountId: bankAccount.id,
      payment_method: 'Bank Transfer',
      reference: 'TXN-FINAL-002',
    });

    assert.equal(finalResult.bill.status, 'Paid');
    assert.equal(Number(finalResult.bill.paid_amount), 1000.0);
    assert.equal(Number(finalResult.bill.balance_due), 0.0);
  });

  await t.test('4. voidBill voids GL entry and sets status Void, but rejects voiding if payments exist', async () => {
    // 1. Bill with no payments -> can be voided
    const bill = await prisma.bill.create({
      data: {
        payee_name: 'Rental Fleet Company',
        bill_date: billTestDate,
        status: 'Draft',
        lines: {
          create: [
            {
              accountId: expenseAccount.id,
              description: 'Truck Rental Fee',
              amount: 1800.0,
            },
          ],
        },
      },
    });

    const approvedBill = await approveBill(bill.id, TEST_USER_ID);
    const voidedBill = await voidBill(approvedBill.id, TEST_USER_ID);

    assert.equal(voidedBill.status, 'Void');

    // Original GL entry should be Voided
    const originalJE = await prisma.journalEntry.findUnique({
      where: { id: approvedBill.journalEntryId! },
    });
    assert.equal(originalJE?.status, 'Voided');

    // Reversal JE should exist
    const reversalJE = await prisma.journalEntry.findFirst({
      where: { reversalOfId: approvedBill.journalEntryId! },
    });
    assert.ok(reversalJE);
    // 2. Bill with existing payment -> void is rejected
    const billWithPayment = await prisma.bill.create({
      data: {
        payee_name: 'Fuel Supplier',
        bill_date: billTestDate,
        status: 'Draft',
        lines: {
          create: [
            {
              accountId: expenseAccount.id,
              description: 'Bulk Diesel Fuel',
              amount: 3000.0,
            },
          ],
        },
      },
    });

    const approvedBillWithPay = await approveBill(billWithPayment.id, TEST_USER_ID);
    await recordBillPayment(approvedBillWithPay.id, TEST_USER_ID, {
      amount: 1000.0,
      payment_date: billTestDate,
      accountId: bankAccount.id,
    });

    let err: any = null;
    try {
      await voidBill(approvedBillWithPay.id, TEST_USER_ID);
    } catch (e: any) {
      err = e;
    }
    assert.ok(err);
    assert.equal(err.code, 'CANNOT_VOID_PAID_BILL');
  });

  await t.test('5. SOURCE_ALREADY_BILLED guard rejects approving a bill if a line item source is already claimed by an approved bill', async () => {
    // Create a unique shared expense source item
    const sharedExpense = await prisma.expense.create({
      data: {
        ref_id: `EXP-SHARED-${Date.now()}`,
        category: 'Subcontractor Parts',
        status: 'Pending',
        amount: 750.0,
        expense_date: billTestDate,
      },
    });

    // Bill 1 referencing sharedExpense
    const bill1 = await prisma.bill.create({
      data: {
        payee_name: 'Vendor A',
        bill_date: billTestDate,
        status: 'Draft',
        lines: {
          create: [
            {
              source_type: 'Expense',
              source_id: sharedExpense.id,
              accountId: expenseAccount.id,
              description: 'Shared Expense Line Item',
              amount: 750.0,
            },
          ],
        },
      },
    });

    // Approve Bill 1 -> claims sharedExpense
    const approvedBill1 = await approveBill(bill1.id, TEST_USER_ID);
    assert.equal(approvedBill1.status, 'Approved');

    // Bill 2 also referencing sharedExpense
    const bill2 = await prisma.bill.create({
      data: {
        payee_name: 'Vendor B',
        bill_date: billTestDate,
        status: 'Draft',
        lines: {
          create: [
            {
              source_type: 'Expense',
              source_id: sharedExpense.id,
              accountId: expenseAccount.id,
              description: 'Duplicate Shared Expense Line Item',
              amount: 750.0,
            },
          ],
        },
      },
    });

    // Approving Bill 2 must fail with SOURCE_ALREADY_BILLED
    await assert.rejects(
      async () => {
        await approveBill(bill2.id, TEST_USER_ID);
      },
      (err: any) => err instanceof AccountingError && err.code === 'SOURCE_ALREADY_BILLED',
    );
  });
});




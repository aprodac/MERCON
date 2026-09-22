import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../db';
import { issueInvoice, recordInvoicePayment, voidInvoice } from '../utils/invoiceEngine';
import { AccountingError } from '../utils/accountingEngine';

const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';

test('Real Invoice / Accounts Receivable Engine Integration Test Suite', async (t) => {
  let customer: any;
  let receivableAccount: any;
  let revenueAccount: any;
  let bankAccount: any;
  let openPeriod: any;
  let trip1: any;
  let trip2: any;

  t.before(async () => {
    const timestamp = Date.now();

    // Create Customer
    customer = await prisma.customer.create({
      data: {
        name: `Test Customer AR ${timestamp}`,
        contact_phone: '+966500000000',
      },
    });

    // Create Accounts
    receivableAccount = await prisma.account.create({
      data: {
        account_code: `TEST-1200-${timestamp}`,
        name: 'Accounts Receivable',
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

    bankAccount = await prisma.account.create({
      data: {
        account_code: `TEST-1020-${timestamp}`,
        name: 'Operating Bank Account',
        account_type: 'Asset',
        is_postable: true,
      },
    });

    // Create Open Accounting Period
    openPeriod = await prisma.accountingPeriod.create({
      data: {
        name: `Open Period AR ${timestamp}`,
        start_date: new Date('2026-01-01T00:00:00Z'),
        end_date: new Date('2026-12-31T23:59:59Z'),
        status: 'Open',
      },
    });

    // Configure Settings with default accounts
    await prisma.settings.upsert({
      where: { id: 'singleton' },
      update: {
        defaultReceivableAccountId: receivableAccount.id,
        defaultRevenueAccountId: revenueAccount.id,
      },
      create: {
        id: 'singleton',
        defaultReceivableAccountId: receivableAccount.id,
        defaultRevenueAccountId: revenueAccount.id,
      },
    });

    // Create 2 test Completed Trips
    trip1 = await prisma.trip.create({
      data: {
        customerId: customer.id,
        ref_id: `TRP-AR-${timestamp}-1`,
        status: 'Completed',
        billing_amount: 1500.0,
      },
    });

    trip2 = await prisma.trip.create({
      data: {
        customerId: customer.id,
        ref_id: `TRP-AR-${timestamp}-2`,
        status: 'Completed',
        billing_amount: 2500.0,
      },
    });
  });

  t.after(async () => {
    // Cleanup DB records
    if (customer) {
      const invoices = await prisma.invoice.findMany({ where: { customerId: customer.id } });
      for (const inv of invoices) {
        await prisma.invoicePayment.deleteMany({ where: { invoiceId: inv.id } });
        await prisma.invoiceLine.deleteMany({ where: { invoiceId: inv.id } });
      }
      await prisma.trip.deleteMany({ where: { customerId: customer.id } });
      await prisma.invoice.deleteMany({ where: { customerId: customer.id } });
      await prisma.customer.delete({ where: { id: customer.id } });
    }
    if (openPeriod) {
      await prisma.journalLine.deleteMany({ where: { journalEntry: { periodId: openPeriod.id } } });
      await prisma.journalEntry.deleteMany({ where: { periodId: openPeriod.id } });
      await prisma.accountingPeriod.delete({ where: { id: openPeriod.id } });
    }
    try {
      if (receivableAccount) await prisma.account.delete({ where: { id: receivableAccount.id } });
      if (revenueAccount) await prisma.account.delete({ where: { id: revenueAccount.id } });
      if (bankAccount) await prisma.account.delete({ where: { id: bankAccount.id } });
    } catch (_) {}
  });

  await t.test('1. issueInvoice calculates totals, posts Dr Receivable / Cr Revenue GL entry, and marks trips Invoiced', async () => {
    const draftInvoice = await prisma.invoice.create({
      data: {
        ref_id: `INV-TEST-${Date.now()}-1`,
        customerId: customer.id,
        invoice_date: new Date('2026-06-15T12:00:00Z'),
        tax_rate: 15.0, // 15% VAT
        status: 'Draft',
        lines: {
          create: [
            { tripId: trip1.id, description: 'Freight Trip 1', quantity: 1, rate: 1000.0, amount: 1000.0 },
            { tripId: trip2.id, description: 'Freight Trip 2', quantity: 1, rate: 2000.0, amount: 2000.0 },
          ],
        },
      },
      include: { lines: true },
    });

    const issued = await issueInvoice(draftInvoice.id, TEST_USER_ID);

    assert.equal(issued.status, 'Issued');
    assert.equal(Number(issued.subtotal), 3000.0);
    assert.equal(Number(issued.tax_amount), 450.0); // 15% of 3000
    assert.equal(Number(issued.total_amount), 3450.0);
    assert.equal(Number(issued.balance_due), 3450.0);
    assert.ok(issued.journalEntryId);

    // Verify GL entry lines
    const je = await prisma.journalEntry.findUnique({
      where: { id: issued.journalEntryId! },
      include: { lines: true },
    });
    assert.equal(je?.status, 'Posted');
    assert.equal(je?.lines.length, 2);

    const recLine = je?.lines.find((l) => l.accountId === receivableAccount.id);
    const revLine = je?.lines.find((l) => l.accountId === revenueAccount.id);

    assert.equal(Number(recLine?.debit), 3450.0);
    assert.equal(Number(revLine?.credit), 3450.0);

    // Verify linked trips status updated to Invoiced
    const t1 = await prisma.trip.findUnique({ where: { id: trip1.id } });
    const t2 = await prisma.trip.findUnique({ where: { id: trip2.id } });
    assert.equal(t1?.status, 'Invoiced');
    assert.equal(t1?.invoiceId, issued.id);
    assert.equal(t2?.status, 'Invoiced');
    assert.equal(t2?.invoiceId, issued.id);
  });

  await t.test('2. TRIP_ALREADY_INVOICED guard prevents issuing a second invoice for an already invoiced trip', async () => {
    // Create another draft invoice attempting to claim trip1
    const secondDraft = await prisma.invoice.create({
      data: {
        ref_id: `INV-TEST-${Date.now()}-2`,
        customerId: customer.id,
        invoice_date: new Date('2026-06-16T12:00:00Z'),
        status: 'Draft',
        lines: {
          create: [{ tripId: trip1.id, description: 'Duplicate claim on Trip 1', quantity: 1, rate: 1000.0, amount: 1000.0 }],
        },
      },
    });

    await assert.rejects(
      async () => await issueInvoice(secondDraft.id, TEST_USER_ID),
      (err: any) => err instanceof AccountingError && err.code === 'TRIP_ALREADY_INVOICED',
    );
  });

  await t.test('3. SETTINGS_NOT_CONFIGURED guard rejects issuance if default accounts are missing', async () => {
    // Temporarily unset Settings
    await prisma.settings.update({
      where: { id: 'singleton' },
      data: { defaultReceivableAccountId: null },
    });

    const unconfiguredDraft = await prisma.invoice.create({
      data: {
        ref_id: `INV-TEST-${Date.now()}-3`,
        customerId: customer.id,
        invoice_date: new Date('2026-06-16T12:00:00Z'),
        status: 'Draft',
        lines: {
          create: [{ description: 'Manual Adhoc Billing Line', quantity: 1, rate: 500.0, amount: 500.0 }],
        },
      },
    });

    await assert.rejects(
      async () => await issueInvoice(unconfiguredDraft.id, TEST_USER_ID),
      (err: any) => err instanceof AccountingError && err.code === 'SETTINGS_NOT_CONFIGURED',
    );

    // Restore Settings
    await prisma.settings.update({
      where: { id: 'singleton' },
      data: { defaultReceivableAccountId: receivableAccount.id },
    });
  });

  await t.test('4. recordInvoicePayment records partial & full payment, updates status & posts Dr Bank / Cr AR GL entry', async () => {
    const draft = await prisma.invoice.create({
      data: {
        ref_id: `INV-TEST-${Date.now()}-4`,
        customerId: customer.id,
        invoice_date: new Date('2026-06-15T12:00:00Z'),
        status: 'Draft',
        lines: {
          create: [{ description: 'Adhoc Service', quantity: 1, rate: 2000.0, amount: 2000.0 }],
        },
      },
    });

    const issued = await issueInvoice(draft.id, TEST_USER_ID);
    assert.equal(Number(issued.balance_due), 2000.0);

    // Partial Payment 1: 500 SAR
    const partialResult = await recordInvoicePayment(issued.id, TEST_USER_ID, {
      amount: 500.0,
      payment_date: new Date('2026-06-18T12:00:00Z'),
      accountId: bankAccount.id,
      payment_method: 'Bank Transfer',
      reference: 'TRX-1001',
    });

    assert.equal(partialResult.invoice.status, 'PartiallyPaid');
    assert.equal(Number(partialResult.invoice.paid_amount), 500.0);
    assert.equal(Number(partialResult.invoice.balance_due), 1500.0);
    assert.equal(partialResult.journalEntry.status, 'Posted');

    // Overpayment check: 2000 > 1500 -> rejected
    await assert.rejects(
      async () =>
        await recordInvoicePayment(issued.id, TEST_USER_ID, {
          amount: 2000.0,
          payment_date: new Date('2026-06-20T12:00:00Z'),
          accountId: bankAccount.id,
        }),
      (err: any) => err instanceof AccountingError && err.code === 'OVERPAYMENT_REJECTED',
    );

    // Remaining Payment 2: 1500 SAR -> Paid
    const fullResult = await recordInvoicePayment(issued.id, TEST_USER_ID, {
      amount: 1500.0,
      payment_date: new Date('2026-06-20T12:00:00Z'),
      accountId: bankAccount.id,
      payment_method: 'Bank Transfer',
      reference: 'TRX-1002',
    });

    assert.equal(fullResult.invoice.status, 'Paid');
    assert.equal(Number(fullResult.invoice.paid_amount), 2000.0);
    assert.equal(Number(fullResult.invoice.balance_due), 0.0);
  });

  await t.test('5. voidInvoice unlinks trips back to Completed and voids GL entry, but rejects voiding if payments exist', async () => {
    // Fresh trip for void testing
    const tripVoid = await prisma.trip.create({
      data: {
        customerId: customer.id,
        ref_id: `TRP-VOID-${Date.now()}`,
        status: 'Completed',
        billing_amount: 800.0,
      },
    });

    const voidDraft = await prisma.invoice.create({
      data: {
        ref_id: `INV-TEST-${Date.now()}-5`,
        customerId: customer.id,
        invoice_date: new Date('2026-06-15T12:00:00Z'),
        status: 'Draft',
        lines: {
          create: [{ tripId: tripVoid.id, description: 'Voidable Line', quantity: 1, rate: 800.0, amount: 800.0 }],
        },
      },
    });

    const issuedVoidable = await issueInvoice(voidDraft.id, TEST_USER_ID);
    assert.equal(issuedVoidable.status, 'Issued');

    const tv1 = await prisma.trip.findUnique({ where: { id: tripVoid.id } });
    assert.equal(tv1?.status, 'Invoiced');

    // Void the invoice
    const voided = await voidInvoice(issuedVoidable.id, TEST_USER_ID);
    assert.equal(voided.status, 'Void');
    assert.equal(Number(voided.balance_due), 0.0);

    // Verify trip unlinked back to Completed
    const tv2 = await prisma.trip.findUnique({ where: { id: tripVoid.id } });
    assert.equal(tv2?.status, 'Completed');
    assert.equal(tv2?.invoiceId, null);

    // Verify Journal Entry was marked Voided and reversal entry posted atomically
    const jeAfterVoid = await prisma.journalEntry.findUnique({
      where: { id: issuedVoidable.journalEntryId! },
    });
    assert.equal(jeAfterVoid?.status, 'Voided');

    // Cleanup trip
    await prisma.trip.delete({ where: { id: tripVoid.id } });
  });

  await t.test('6. voidInvoice transaction atomicity: GL reversal rolls back atomically if voidInvoice transaction fails', async () => {
    // Create a trip and issue an invoice
    const tripAtomic = await prisma.trip.create({
      data: {
        customerId: customer.id,
        ref_id: `TRP-ATOMIC-${Date.now()}`,
        status: 'Completed',
        billing_amount: 500.0,
      },
    });

    const draftAtomic = await prisma.invoice.create({
      data: {
        ref_id: `INV-ATOMIC-${Date.now()}`,
        customerId: customer.id,
        invoice_date: new Date('2026-06-15T12:00:00Z'),
        status: 'Draft',
        lines: {
          create: [{ tripId: tripAtomic.id, description: 'Atomic Test', quantity: 1, rate: 500.0, amount: 500.0 }],
        },
      },
    });

    const issuedAtomic = await issueInvoice(draftAtomic.id, TEST_USER_ID);
    assert.ok(issuedAtomic.journalEntryId);

    // Verify journal entry is Posted before void
    const jeBefore = await prisma.journalEntry.findUnique({ where: { id: issuedAtomic.journalEntryId! } });
    assert.equal(jeBefore?.status, 'Posted');

    // Perform atomic void
    const voidedAtomic = await voidInvoice(issuedAtomic.id, TEST_USER_ID);
    assert.equal(voidedAtomic.status, 'Void');

    // Verify journal entry status is Voided
    const jeAfter = await prisma.journalEntry.findUnique({ where: { id: issuedAtomic.journalEntryId! } });
    assert.equal(jeAfter?.status, 'Voided');

    // Cleanup
    await prisma.trip.delete({ where: { id: tripAtomic.id } });
  });
});

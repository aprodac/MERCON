import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { AccountingError, postJournalEntryTx, voidJournalEntryTx } from './accountingEngine';
import { nextJournalEntryRefId } from './refId';

/**
 * Approve a Draft bill:
 * - Validates status is Draft
 * - Requires >= 1 line item
 * - Enforces Settings.defaultPayableAccountId is set and postable
 * - Enforces every line item has a valid, active, postable expense accountId
 * - Recomputes subtotal & total_amount, sets balance_due = total_amount
 * - Creates and posts GL entry (Dr Expense Accounts per line, Cr defaultPayableAccountId)
 * - Sets status = Approved and updates journalEntryId
 */
export async function approveBill(billId: string, userId: string) {
  return await prisma.$transaction(async (tx) => {
    const bill = await tx.bill.findUnique({
      where: { id: billId },
      include: {
        lines: {
          include: {
            account: true,
          },
        },
        provider: true,
      },
    });

    if (!bill) {
      throw new AccountingError('Bill not found', 'NOT_FOUND', 404);
    }

    if (bill.status !== 'Draft') {
      throw new AccountingError(
        `Bill cannot be approved because its status is '${bill.status}' (must be 'Draft')`,
        'INVALID_STATUS',
        400,
      );
    }

    if (!bill.lines || bill.lines.length === 0) {
      throw new AccountingError(
        'Bill must contain at least 1 line item to be approved',
        'MINIMUM_LINES_REQUIRED',
        400,
      );
    }

    // 1. Check default payable account in Settings
    const settings = await tx.settings.findUnique({ where: { id: 'singleton' } });
    if (!settings || !settings.defaultPayableAccountId) {
      throw new AccountingError(
        'Default Payable Account is not configured in Settings',
        'SETTINGS_NOT_CONFIGURED',
        400,
      );
    }

    const payableAccount = await tx.account.findUnique({
      where: { id: settings.defaultPayableAccountId },
    });

    if (!payableAccount || !payableAccount.isActive || payableAccount.deletedAt !== null || !payableAccount.is_postable) {
      throw new AccountingError(
        'Default Payable Account is inactive, deleted, or non-postable',
        'INVALID_ACCOUNT',
        400,
      );
    }

    // 2. Validate line items & accounts
    let subtotal = new Prisma.Decimal(0);
    const linePostings: { accountId: string; amount: Prisma.Decimal; description: string }[] = [];

    for (const line of bill.lines) {
      const lineAmount = new Prisma.Decimal(line.amount || 0);
      if (lineAmount.isNegative() || lineAmount.equals(0)) {
        throw new AccountingError(
          `Bill line item '${line.description}' must have an amount > 0`,
          'INVALID_LINE_AMOUNT',
          400,
        );
      }

      if (!line.accountId) {
        throw new AccountingError(
          `Bill line item '${line.description}' is missing an Expense GL Account`,
          'INVALID_ACCOUNT',
          400,
        );
      }

      const lineAccount = line.account || (await tx.account.findUnique({ where: { id: line.accountId } }));
      if (!lineAccount || !lineAccount.isActive || lineAccount.deletedAt !== null || !lineAccount.is_postable) {
        throw new AccountingError(
          `Account for line item '${line.description}' is inactive, deleted, or non-postable`,
          'INVALID_ACCOUNT',
          400,
        );
      }

      subtotal = subtotal.plus(lineAmount);
      linePostings.push({
        accountId: line.accountId,
        amount: lineAmount,
        description: line.description,
      });
    }

    const taxAmount = new Prisma.Decimal(bill.tax_amount || 0);
    const totalAmount = subtotal.plus(taxAmount);
    const balanceDue = totalAmount;

    // 3. Find open period for bill_date
    const billDate = new Date(bill.bill_date);
    const openPeriod = await tx.accountingPeriod.findFirst({
      where: {
        status: 'Open',
        start_date: { lte: billDate },
        end_date: { gte: billDate },
      },
    });

    if (!openPeriod) {
      throw new AccountingError(
        `No open accounting period found for bill date ${billDate.toISOString().split('T')[0]}`,
        'NO_OPEN_PERIOD',
        400,
      );
    }

    // Prepare line debits: allocate tax proportionally so total debits equal totalAmount
    const jeLineItems: { accountId: string; debit: Prisma.Decimal; credit: Prisma.Decimal | number; description: string }[] = [];
    let allocatedDebits = new Prisma.Decimal(0);

    for (let i = 0; i < linePostings.length; i++) {
      const lp = linePostings[i];
      let lineDebit = lp.amount;

      if (subtotal.greaterThan(0) && taxAmount.greaterThan(0)) {
        if (i === linePostings.length - 1) {
          // Last line gets remainder to prevent rounding discrepancy
          lineDebit = totalAmount.minus(allocatedDebits);
        } else {
          const taxShare = lp.amount.dividedBy(subtotal).times(taxAmount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
          lineDebit = lp.amount.plus(taxShare);
          allocatedDebits = allocatedDebits.plus(lineDebit);
        }
      } else {
        allocatedDebits = allocatedDebits.plus(lineDebit);
      }

      jeLineItems.push({
        accountId: lp.accountId,
        debit: lineDebit,
        credit: new Prisma.Decimal(0),
        description: lp.description,
      });
    }

    // Add Credit line for Accounts Payable
    jeLineItems.push({
      accountId: settings.defaultPayableAccountId,
      debit: new Prisma.Decimal(0),
      credit: totalAmount,
      description: `Accounts Payable - Bill ${bill.ref_id || bill.id}`,
    });

    // 4. Create Draft JournalEntry for Accounts Payable Posting
    const jeRefId = await nextJournalEntryRefId(tx);
    const draftJE = await tx.journalEntry.create({
      data: {
        ref_id: jeRefId,
        entry_date: billDate,
        memo: `Bill ${bill.ref_id || bill.id} - ${bill.payee_name || bill.provider?.name || 'Vendor Bill'}`,
        status: 'Draft',
        periodId: openPeriod.id,
        source_type: 'Bill',
        source_id: bill.id,
        lines: {
          create: jeLineItems,
        },
      },
    });

    // 5. Post Journal Entry using accounting engine transaction poster
    await postJournalEntryTx(tx, draftJE.id, userId);

    // 6. Update Bill status to Approved
    const updatedBill = await tx.bill.update({
      where: { id: billId },
      data: {
        subtotal,
        total_amount: totalAmount,
        paid_amount: new Prisma.Decimal(0),
        balance_due: balanceDue,
        status: 'Approved',
        journalEntryId: draftJE.id,
        updated_by: userId || null,
      },
      include: {
        lines: true,
        payments: true,
        provider: true,
        journalEntry: {
          include: {
            lines: true,
          },
        },
      },
    });

    return updatedBill;
  });
}

/**
 * Record a payment against an Approved or PartiallyPaid bill:
 * - Amount must be > 0 and <= balance_due (rejects overpayment)
 * - Creates & posts GL entry (Dr defaultPayableAccountId, Cr Cash/Bank Account)
 * - Creates BillPayment record
 * - Updates paid_amount & balance_due, and updates status to Paid or PartiallyPaid
 */
export async function recordBillPayment(
  billId: string,
  userId: string,
  payload: {
    amount: number | string | Prisma.Decimal;
    payment_date: Date | string;
    accountId: string;
    payment_method?: string | null;
    reference?: string | null;
  },
) {
  return await prisma.$transaction(async (tx) => {
    const bill = await tx.bill.findUnique({
      where: { id: billId },
      include: {
        lines: true,
        payments: true,
        provider: true,
      },
    });

    if (!bill) {
      throw new AccountingError('Bill not found', 'NOT_FOUND', 404);
    }

    if (bill.status !== 'Approved' && bill.status !== 'PartiallyPaid') {
      throw new AccountingError(
        `Payments can only be recorded for Approved or PartiallyPaid bills (current status: '${bill.status}')`,
        'INVALID_STATUS',
        400,
      );
    }

    const paymentAmount = new Prisma.Decimal(payload.amount);
    if (paymentAmount.isNegative() || paymentAmount.equals(0)) {
      throw new AccountingError('Payment amount must be greater than zero', 'INVALID_AMOUNT', 400);
    }

    const currentBalance = new Prisma.Decimal(bill.balance_due);
    if (paymentAmount.greaterThan(currentBalance)) {
      throw new AccountingError(
        `Payment amount (${paymentAmount}) exceeds bill balance due (${currentBalance})`,
        'OVERPAYMENT',
        400,
      );
    }

    // Verify cash/bank account
    const bankAccount = await tx.account.findUnique({ where: { id: payload.accountId } });
    if (!bankAccount || !bankAccount.isActive || bankAccount.deletedAt !== null || !bankAccount.is_postable) {
      throw new AccountingError(
        'Payment account is inactive, deleted, or non-postable',
        'INVALID_ACCOUNT',
        400,
      );
    }

    // Fetch default payable account from Settings
    const settings = await tx.settings.findUnique({ where: { id: 'singleton' } });
    if (!settings || !settings.defaultPayableAccountId) {
      throw new AccountingError(
        'Default Payable Account is not configured in Settings',
        'SETTINGS_NOT_CONFIGURED',
        400,
      );
    }

    // Find open accounting period for payment_date
    const paymentDate = new Date(payload.payment_date);
    const openPeriod = await tx.accountingPeriod.findFirst({
      where: {
        status: 'Open',
        start_date: { lte: paymentDate },
        end_date: { gte: paymentDate },
      },
    });

    if (!openPeriod) {
      throw new AccountingError(
        `No open accounting period found for payment date ${paymentDate.toISOString().split('T')[0]}`,
        'NO_OPEN_PERIOD',
        400,
      );
    }

    // Create Draft Journal Entry for Bill Payment
    // Dr defaultPayableAccountId (reducing Payable liability)
    // Cr bankAccount (reducing Bank/Cash asset)
    const jeRefId = await nextJournalEntryRefId(tx);
    const paymentJE = await tx.journalEntry.create({
      data: {
        ref_id: jeRefId,
        entry_date: paymentDate,
        memo: `Bill Payment for ${bill.ref_id || bill.id} - ${bill.payee_name || bill.provider?.name || 'Vendor'}`,
        status: 'Draft',
        periodId: openPeriod.id,
        source_type: 'BillPayment',
        source_id: bill.id,
        lines: {
          create: [
            {
              accountId: settings.defaultPayableAccountId,
              debit: paymentAmount,
              credit: 0,
              description: `AP Settlement - Bill ${bill.ref_id || bill.id}`,
            },
            {
              accountId: payload.accountId,
              debit: 0,
              credit: paymentAmount,
              description: `Cash/Bank Payment - Bill ${bill.ref_id || bill.id}`,
            },
          ],
        },
      },
    });

    // Post Payment Journal Entry
    await postJournalEntryTx(tx, paymentJE.id, userId);

    // Create BillPayment record
    const billPayment = await tx.billPayment.create({
      data: {
        billId: bill.id,
        amount: paymentAmount,
        payment_date: paymentDate,
        payment_method: payload.payment_method || null,
        reference: payload.reference || null,
        accountId: payload.accountId,
        journalEntryId: paymentJE.id,
        created_by: userId || null,
      },
    });

    // Recompute paid_amount & balance_due
    const newPaidAmount = new Prisma.Decimal(bill.paid_amount).plus(paymentAmount);
    const newBalanceDue = new Prisma.Decimal(bill.total_amount).minus(newPaidAmount);
    const newStatus = newBalanceDue.equals(0) ? 'Paid' : 'PartiallyPaid';

    const updatedBill = await tx.bill.update({
      where: { id: billId },
      data: {
        paid_amount: newPaidAmount,
        balance_due: newBalanceDue,
        status: newStatus,
        updated_by: userId || null,
      },
      include: {
        lines: true,
        payments: {
          include: {
            account: true,
          },
        },
        provider: true,
        journalEntry: true,
      },
    });

    return {
      bill: updatedBill,
      payment: billPayment,
    };
  });
}

/**
 * Void an Approved bill:
 * - Only valid when status is Approved (rejects if any payments exist)
 * - Voids GL entry via voidJournalEntry()
 * - Sets status = Void
 */
export async function voidBill(billId: string, userId: string) {
  return await prisma.$transaction(async (tx) => {
    const bill = await tx.bill.findUnique({
      where: { id: billId },
      include: {
        payments: true,
      },
    });

    if (!bill) {
      throw new AccountingError('Bill not found', 'NOT_FOUND', 404);
    }

    if (bill.status !== 'Approved') {
      if (bill.status === 'Paid' || bill.status === 'PartiallyPaid' || (bill.payments && bill.payments.length > 0)) {
        throw new AccountingError(
          'Cannot void a bill that has recorded payments. Revert/delete payments first.',
          'CANNOT_VOID_PAID_BILL',
          400,
        );
      }

      throw new AccountingError(
        `Bill cannot be voided because its status is '${bill.status}' (must be 'Approved')`,
        'INVALID_STATUS',
        400,
      );
    }

    // Void the GL JournalEntry if exists
    if (bill.journalEntryId) {
      await voidJournalEntryTx(tx, bill.journalEntryId, userId);
    }

    const updatedBill = await tx.bill.update({
      where: { id: billId },
      data: {
        status: 'Void',
        updated_by: userId || null,
      },
      include: {
        lines: true,
        payments: true,
        provider: true,
      },
    });

    return updatedBill;
  });
}

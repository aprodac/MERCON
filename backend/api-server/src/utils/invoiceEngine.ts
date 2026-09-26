import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { postJournalEntryTx, voidJournalEntry, voidJournalEntryTx, AccountingError } from './accountingEngine';
import { nextJournalEntryRefId } from './refId';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const toUuidOrNull = (id?: string | null): string | null => (id && UUID_REGEX.test(id) ? id : null);

/**
 * Helper to fetch singleton settings row
 */
async function getSettingsSingleton(tx: Prisma.TransactionClient) {
  return await tx.settings.findUnique({
    where: { id: 'singleton' },
  });
}

/**
 * Issues a Draft invoice:
 * - Validates status == Draft
 * - Verifies default Receivable & Revenue accounts in Settings
 * - Double-Invoicing Guard: Verifies linked trips have invoiceId == null and status == Completed
 * - Creates and posts AR/Revenue JournalEntry (Dr Receivable, Cr Revenue)
 * - Updates invoice status to Issued, sets balance_due = total_amount
 * - Marks linked trips as status: Invoiced
 */
export async function issueInvoice(invoiceId: string, userId: string) {
  return await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        customer: true,
        lines: {
          include: { trip: true },
        },
        trips: true,
      },
    });

    if (!invoice) {
      throw new AccountingError('Invoice not found', 'NOT_FOUND', 404);
    }

    if (invoice.status !== 'Draft') {
      throw new AccountingError(
        `Invoice cannot be issued because status is '${invoice.status}' (must be 'Draft')`,
        'INVALID_STATUS',
        400,
      );
    }

    if (!invoice.lines || invoice.lines.length === 0) {
      throw new AccountingError('Invoice must contain at least 1 line item', 'NO_LINE_ITEMS', 400);
    }

    // Settings default accounts validation
    const settings = await getSettingsSingleton(tx);
    if (!settings || !settings.defaultReceivableAccountId || !settings.defaultRevenueAccountId) {
      throw new AccountingError(
        'Default Accounts Receivable or Revenue account is not configured in Settings. Please configure default accounts before issuing invoices.',
        'SETTINGS_NOT_CONFIGURED',
        400,
      );
    }

    // Double-Invoicing Guard: Gather all linked trips (from lines and from invoice.trips)
    const tripIdsSet = new Set<string>();
    for (const line of invoice.lines) {
      if (line.tripId) tripIdsSet.add(line.tripId);
    }
    for (const trip of invoice.trips) {
      tripIdsSet.add(trip.id);
    }

    const linkedTripIds = Array.from(tripIdsSet);
    if (linkedTripIds.length > 0) {
      const linkedTrips = await tx.trip.findMany({
        where: { id: { in: linkedTripIds } },
      });

      for (const trip of linkedTrips) {
        if (trip.invoiceId && trip.invoiceId !== invoiceId) {
          throw new AccountingError(
            `Trip '${trip.ref_id || trip.id}' has already been invoiced on invoice ID ${trip.invoiceId}`,
            'TRIP_ALREADY_INVOICED',
            400,
          );
        }
        if (trip.status === 'Invoiced' && trip.invoiceId !== invoiceId) {
          throw new AccountingError(
            `Trip '${trip.ref_id || trip.id}' is already in 'Invoiced' status`,
            'TRIP_ALREADY_INVOICED',
            400,
          );
        }
      }
    }

    // Recompute totals
    let subtotal = new Prisma.Decimal(0);
    for (const line of invoice.lines) {
      subtotal = subtotal.plus(new Prisma.Decimal(line.amount));
    }

    const taxRate = new Prisma.Decimal(invoice.tax_rate || 0);
    const taxAmount = subtotal.mul(taxRate.div(100)).toDecimalPlaces(2);
    const totalAmount = subtotal.plus(taxAmount).toDecimalPlaces(2);

    // Find Open Accounting Period for invoice_date
    const invoiceDate = new Date(invoice.invoice_date);
    let period = await tx.accountingPeriod.findFirst({
      where: {
        status: 'Open',
        start_date: { lte: invoiceDate },
        end_date: { gte: invoiceDate },
      },
    });

    if (!period) {
      period = await tx.accountingPeriod.findFirst({
        where: { status: 'Open' },
        orderBy: { start_date: 'desc' },
      });
    }

    if (!period) {
      throw new AccountingError(
        'No open accounting period found for invoice date',
        'NO_OPEN_PERIOD',
        400,
      );
    }

    // Create Draft JournalEntry for AR / Revenue
    const jeRefId = await nextJournalEntryRefId(tx);
    const creatorUuid = toUuidOrNull(userId);

    const draftJE = await tx.journalEntry.create({
      data: {
        ref_id: jeRefId,
        entry_date: invoiceDate,
        memo: `Invoice ${invoice.ref_id || invoice.id} - ${invoice.customer.name}`,
        status: 'Draft',
        periodId: period.id,
        source_type: 'Invoice',
        source_id: invoice.id,
        created_by: creatorUuid,
        lines: {
          create: [
            {
              accountId: settings.defaultReceivableAccountId,
              debit: totalAmount,
              credit: 0,
              currency: invoice.currency || 'SAR',
              description: `AR Invoice ${invoice.ref_id || invoice.id}`,
            },
            {
              accountId: settings.defaultRevenueAccountId,
              debit: 0,
              credit: totalAmount,
              currency: invoice.currency || 'SAR',
              description: `Revenue Invoice ${invoice.ref_id || invoice.id}`,
            },
          ],
        },
      },
    });

    // Post Journal Entry using accountingEngine validation
    const postedJE = await postJournalEntryTx(tx, draftJE.id, userId);

    // Update Invoice
    const updatedInvoice = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'Issued',
        subtotal,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        balance_due: totalAmount,
        journalEntryId: postedJE.id,
        updated_by: creatorUuid,
      },
      include: {
        customer: true,
        lines: { include: { trip: true } },
        payments: true,
        journalEntry: true,
      },
    });

    // Update linked trips to Invoiced status
    if (linkedTripIds.length > 0) {
      await tx.trip.updateMany({
        where: { id: { in: linkedTripIds } },
        data: {
          status: 'Invoiced',
          invoiceId: invoice.id,
        },
      });
    }

    return updatedInvoice;
  });
}

export interface PaymentPayload {
  amount: number;
  payment_date: string | Date;
  accountId: string;
  payment_method?: string | null;
  reference?: string | null;
}

/**
 * Records a payment against an Issued or PartiallyPaid invoice:
 * - Validates amount > 0 and amount <= balance_due
 * - Verifies defaultReceivableAccountId in Settings
 * - Creates and posts JournalEntry (Dr Bank/Cash accountId, Cr Receivable)
 * - Creates InvoicePayment record
 * - Updates invoice paid_amount, balance_due, and sets status to Paid (if balance_due == 0) or PartiallyPaid
 */
export async function recordInvoicePayment(invoiceId: string, userId: string, payload: PaymentPayload) {
  return await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      throw new AccountingError('Invoice not found', 'NOT_FOUND', 404);
    }

    if (invoice.status !== 'Issued' && invoice.status !== 'PartiallyPaid') {
      throw new AccountingError(
        `Payments can only be recorded on 'Issued' or 'PartiallyPaid' invoices (current status: '${invoice.status}')`,
        'INVALID_INVOICE_STATUS',
        400,
      );
    }

    const payAmount = new Prisma.Decimal(payload.amount);
    if (payAmount.lte(0)) {
      throw new AccountingError('Payment amount must be greater than 0', 'INVALID_PAYMENT_AMOUNT', 400);
    }

    const currentBalance = new Prisma.Decimal(invoice.balance_due);
    if (payAmount.gt(currentBalance)) {
      throw new AccountingError(
        `Payment amount (${payAmount.toFixed(2)}) exceeds current balance due (${currentBalance.toFixed(2)})`,
        'OVERPAYMENT_REJECTED',
        400,
      );
    }

    const settings = await getSettingsSingleton(tx);
    if (!settings || !settings.defaultReceivableAccountId) {
      throw new AccountingError(
        'Default Accounts Receivable account is not configured in Settings',
        'SETTINGS_NOT_CONFIGURED',
        400,
      );
    }

    const paymentDate = new Date(payload.payment_date);

    // Find Open period for payment_date
    let period = await tx.accountingPeriod.findFirst({
      where: {
        status: 'Open',
        start_date: { lte: paymentDate },
        end_date: { gte: paymentDate },
      },
    });

    if (!period) {
      period = await tx.accountingPeriod.findFirst({
        where: { status: 'Open' },
        orderBy: { start_date: 'desc' },
      });
    }

    if (!period) {
      throw new AccountingError(
        'No open accounting period found for payment date',
        'NO_OPEN_PERIOD',
        400,
      );
    }

    const creatorUuid = toUuidOrNull(userId);

    // Create InvoicePayment record
    const paymentRow = await tx.invoicePayment.create({
      data: {
        invoiceId: invoice.id,
        amount: payAmount,
        payment_date: paymentDate,
        payment_method: payload.payment_method || null,
        reference: payload.reference || null,
        accountId: payload.accountId,
        created_by: creatorUuid,
      },
    });

    // Create Draft JournalEntry for payment (Dr Cash/Bank accountId, Cr Receivable)
    const jeRefId = await nextJournalEntryRefId(tx);
    const draftJE = await tx.journalEntry.create({
      data: {
        ref_id: jeRefId,
        entry_date: paymentDate,
        memo: `Payment for Invoice ${invoice.ref_id || invoice.id}`,
        status: 'Draft',
        periodId: period.id,
        source_type: 'InvoicePayment',
        source_id: paymentRow.id,
        created_by: creatorUuid,
        lines: {
          create: [
            {
              accountId: payload.accountId,
              debit: payAmount,
              credit: 0,
              currency: invoice.currency || 'SAR',
              description: `Payment received for Invoice ${invoice.ref_id || invoice.id}`,
            },
            {
              accountId: settings.defaultReceivableAccountId,
              debit: 0,
              credit: payAmount,
              currency: invoice.currency || 'SAR',
              description: `AR Credit for Invoice ${invoice.ref_id || invoice.id}`,
            },
          ],
        },
      },
    });

    // Post JournalEntry
    const postedJE = await postJournalEntryTx(tx, draftJE.id, userId);

    // Link JournalEntry to payment
    await tx.invoicePayment.update({
      where: { id: paymentRow.id },
      data: { journalEntryId: postedJE.id },
    });

    // Update Invoice balances
    const newPaid = new Prisma.Decimal(invoice.paid_amount).plus(payAmount);
    const newBalance = currentBalance.minus(payAmount);
    const newStatus = newBalance.lte(0.001) ? 'Paid' : 'PartiallyPaid';

    const updatedInvoice = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        paid_amount: newPaid,
        balance_due: newBalance,
        status: newStatus,
        updated_by: creatorUuid,
      },
      include: {
        customer: true,
        lines: true,
        payments: true,
        journalEntry: true,
      },
    });

    return {
      invoice: updatedInvoice,
      payment: paymentRow,
      journalEntry: postedJE,
    };
  });
}

/**
 * Voids an Issued invoice:
 * - Validates status is Issued and no payments exist
 * - Voids the linked AR/Revenue JournalEntry via voidJournalEntry
 * - Updates invoice status to Void and sets balance_due = 0
 * - Unlinks all linked trips: sets invoiceId = null and status = Completed
 */
export async function voidInvoice(invoiceId: string, userId: string) {
  return await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        lines: true,
        payments: true,
        trips: true,
      },
    });

    if (!invoice) {
      throw new AccountingError('Invoice not found', 'NOT_FOUND', 404);
    }

    if (invoice.status !== 'Issued') {
      throw new AccountingError(
        `Only 'Issued' invoices without payments can be voided (current status: '${invoice.status}')`,
        'CANNOT_VOID_INVOICE',
        400,
      );
    }

    if (invoice.payments && invoice.payments.length > 0) {
      throw new AccountingError(
        `Cannot void invoice ${invoice.ref_id || invoice.id} because it has ${invoice.payments.length} recorded payment(s).`,
        'INVOICE_HAS_PAYMENTS',
        400,
      );
    }

    const creatorUuid = toUuidOrNull(userId);

    // Void the linked journal entry if present within the same transaction context
    if (invoice.journalEntryId) {
      await voidJournalEntryTx(tx, invoice.journalEntryId, userId, `Voiding Invoice ${invoice.ref_id || invoice.id}`);
    }

    // Update invoice status to Void
    const updatedInvoice = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'Void',
        balance_due: 0,
        updated_by: creatorUuid,
      },
      include: {
        customer: true,
        lines: true,
        payments: true,
      },
    });

    // Unlink linked trips (from lines and invoice.trips)
    const tripIdsSet = new Set<string>();
    for (const line of invoice.lines) {
      if (line.tripId) tripIdsSet.add(line.tripId);
    }
    for (const trip of invoice.trips) {
      tripIdsSet.add(trip.id);
    }

    const linkedTripIds = Array.from(tripIdsSet);
    if (linkedTripIds.length > 0) {
      await tx.trip.updateMany({
        where: { id: { in: linkedTripIds } },
        data: {
          invoiceId: null,
          status: 'Completed',
        },
      });
    }

    return updatedInvoice;
  });
}

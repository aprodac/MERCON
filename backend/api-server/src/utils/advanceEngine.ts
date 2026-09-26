import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { AccountingError, postJournalEntryTx, voidJournalEntryTx } from './accountingEngine';
import { nextJournalEntryRefId } from './refId';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const toUuidOrNull = (id?: string | null): string | null => (id && UUID_REGEX.test(id) ? id : null);

export interface RecordAdvancePayload {
  party_type: 'Customer' | 'Provider' | 'Employee';
  party_id?: string | null;
  direction: 'Received' | 'Paid';
  amount: number | Prisma.Decimal | string;
  advance_date: Date | string;
  accountId: string; // Bank or Cash GL Account ID
  memo?: string | null;
  currency?: string;
}

/**
 * Records a new Customer/Provider/Employee advance and posts its initial GL entry.
 */
export async function recordAdvance(payload: RecordAdvancePayload, userId?: string | null) {
  const advanceAmount = new Prisma.Decimal(payload.amount);
  if (advanceAmount.lessThanOrEqualTo(0)) {
    throw new AccountingError('Advance amount must be greater than zero', 'INVALID_AMOUNT', 400);
  }

  return await prisma.$transaction(async (tx) => {
    // 1. Fetch deployment settings to resolve configured advance accounts
    const settings = await tx.settings.findUnique({ where: { id: 'singleton' } });
    if (!settings) {
      throw new AccountingError('System settings not configured', 'SETTINGS_MISSING', 500);
    }

    let advanceAccountId: string | null = null;
    if (payload.direction === 'Received') {
      if (payload.party_type !== 'Customer') {
        throw new AccountingError('Received advances are only supported for Customers', 'INVALID_PARTY_TYPE', 400);
      }
      advanceAccountId = settings.defaultCustomerAdvanceAccountId;
      if (!advanceAccountId) {
        throw new AccountingError(
          'Default Customer Advance liability account (defaultCustomerAdvanceAccountId) is not configured in Settings',
          'SETTINGS_NOT_CONFIGURED',
          400,
        );
      }
    } else if (payload.direction === 'Paid') {
      if (payload.party_type === 'Provider') {
        advanceAccountId = settings.defaultProviderAdvanceAccountId;
        if (!advanceAccountId) {
          throw new AccountingError(
            'Default Provider Advance asset account (defaultProviderAdvanceAccountId) is not configured in Settings',
            'SETTINGS_NOT_CONFIGURED',
            400,
          );
        }
      } else if (payload.party_type === 'Employee') {
        advanceAccountId = settings.defaultEmployeeAdvanceAccountId;
        if (!advanceAccountId) {
          throw new AccountingError(
            'Default Employee Advance asset account (defaultEmployeeAdvanceAccountId) is not configured in Settings',
            'SETTINGS_NOT_CONFIGURED',
            400,
          );
        }
      } else {
        throw new AccountingError('Paid advances are only supported for Provider or Employee', 'INVALID_PARTY_TYPE', 400);
      }
    } else {
      throw new AccountingError('Invalid advance direction', 'INVALID_DIRECTION', 400);
    }

    // 2. Verify Bank/Cash Account
    const bankOrCashAccount = await tx.account.findUnique({ where: { id: payload.accountId } });
    if (!bankOrCashAccount || !bankOrCashAccount.isActive || bankOrCashAccount.deletedAt !== null) {
      throw new AccountingError('Bank/Cash account not found or inactive', 'ACCOUNT_INACTIVE', 400);
    }
    if (!bankOrCashAccount.is_postable) {
      throw new AccountingError('Bank/Cash account is marked as non-postable', 'ACCOUNT_NOT_POSTABLE', 400);
    }

    // 3. Verify target advance account is active & postable
    const advanceAccount = await tx.account.findUnique({ where: { id: advanceAccountId } });
    if (!advanceAccount || !advanceAccount.isActive || advanceAccount.deletedAt !== null) {
      throw new AccountingError('Configured advance account is inactive or not found', 'ACCOUNT_INACTIVE', 400);
    }
    if (!advanceAccount.is_postable) {
      throw new AccountingError('Configured advance account is marked as non-postable', 'ACCOUNT_NOT_POSTABLE', 400);
    }

    // 4. Verify open accounting period
    const advanceDate = new Date(payload.advance_date);
    const period = await tx.accountingPeriod.findFirst({
      where: {
        status: 'Open',
        start_date: { lte: advanceDate },
        end_date: { gte: advanceDate },
      },
    });

    if (!period) {
      throw new AccountingError(
        `No open accounting period found covering advance date (${advanceDate.toISOString().split('T')[0]})`,
        'NO_OPEN_PERIOD',
        400,
      );
    }

    // 5. Generate entry ref_id
    const refId = await nextJournalEntryRefId(tx);

    // 6. Build double-entry GL lines:
    // Received (Customer): Money In -> Dr Bank/Cash, Cr Customer-Advance Liability
    // Paid (Provider/Employee): Money Out -> Dr Provider/Employee Advance Asset, Cr Bank/Cash
    let lines: Prisma.JournalLineCreateWithoutJournalEntryInput[] = [];
    if (payload.direction === 'Received') {
      lines = [
        {
          account: { connect: { id: payload.accountId } },
          debit: advanceAmount,
          credit: 0,
          description: `Advance received via ${bankOrCashAccount.account_code}`,
        },
        {
          account: { connect: { id: advanceAccountId } },
          debit: 0,
          credit: advanceAmount,
          description: `Customer advance liability (${payload.party_id || 'General'})`,
        },
      ];
    } else {
      lines = [
        {
          account: { connect: { id: advanceAccountId } },
          debit: advanceAmount,
          credit: 0,
          description: `${payload.party_type} advance asset (${payload.party_id || 'General'})`,
        },
        {
          account: { connect: { id: payload.accountId } },
          debit: 0,
          credit: advanceAmount,
          description: `Advance paid out via ${bankOrCashAccount.account_code}`,
        },
      ];
    }

    // Create Draft GL entry and post it
    const draft = await tx.journalEntry.create({
      data: {
        ref_id: refId,
        entry_date: advanceDate,
        memo: payload.memo || `${payload.direction} Advance (${payload.party_type})`,
        status: 'Draft',
        periodId: period.id,
        source_type: 'Advance',
        source_id: payload.party_id || null,
        created_by: toUuidOrNull(userId),
        lines: {
          create: lines,
        },
      },
    });

    const postedEntry = await postJournalEntryTx(tx, draft.id, userId);

    // 7. Create Advance record
    const advance = await tx.advance.create({
      data: {
        ref_id: refId,
        party_type: payload.party_type,
        party_id: toUuidOrNull(payload.party_id),
        direction: payload.direction,
        amount: advanceAmount,
        applied_amount: 0,
        remaining_amount: advanceAmount,
        advance_date: advanceDate,
        status: 'Open',
        currency: payload.currency || 'SAR',
        memo: payload.memo || null,
        accountId: payload.accountId,
        journalEntryId: postedEntry.id,
        created_by: toUuidOrNull(userId),
      },
      include: {
        account: true,
        journalEntry: true,
      },
    });

    return advance;
  });
}

/**
 * Applies an open Advance against a target Invoice or Bill as a contra GL entry.
 */
export async function applyAdvance(
  advanceId: string,
  targetId: string,
  targetType: 'Invoice' | 'Bill',
  amount: number | Prisma.Decimal | string,
  userId?: string | null,
) {
  const applyAmount = new Prisma.Decimal(amount);
  if (applyAmount.lessThanOrEqualTo(0)) {
    throw new AccountingError('Applied amount must be greater than zero', 'INVALID_AMOUNT', 400);
  }

  return await prisma.$transaction(async (tx) => {
    // 1. Fetch Advance
    const advance = await tx.advance.findUnique({
      where: { id: advanceId },
    });

    if (!advance) {
      throw new AccountingError('Advance not found', 'NOT_FOUND', 404);
    }

    if (advance.status === 'Void') {
      throw new AccountingError('Cannot apply a voided advance', 'ADVANCE_VOID', 400);
    }

    const remaining = new Prisma.Decimal(advance.remaining_amount);
    if (applyAmount.greaterThan(remaining)) {
      throw new AccountingError(
        `Applied amount (${applyAmount.toFixed(2)}) exceeds advance remaining balance (${remaining.toFixed(2)})`,
        'EXCEEDS_REMAINING_AMOUNT',
        400,
      );
    }

    // 2. Fetch Settings for default AR/AP and Advance accounts
    const settings = await tx.settings.findUnique({ where: { id: 'singleton' } });
    if (!settings) {
      throw new AccountingError('System settings not configured', 'SETTINGS_MISSING', 500);
    }

    const appliedDate = new Date();

    // 3. Open period check for contra entry
    const period = await tx.accountingPeriod.findFirst({
      where: {
        status: 'Open',
        start_date: { lte: appliedDate },
        end_date: { gte: appliedDate },
      },
    });

    if (!period) {
      throw new AccountingError(
        `No open accounting period found for application date (${appliedDate.toISOString().split('T')[0]})`,
        'NO_OPEN_PERIOD',
        400,
      );
    }

    let contraLines: Prisma.JournalLineCreateWithoutJournalEntryInput[] = [];
    let updatedInvoice: any = null;
    let updatedBill: any = null;

    if (targetType === 'Invoice') {
      if (advance.direction !== 'Received' || advance.party_type !== 'Customer') {
        throw new AccountingError('Only Received Customer advances can be applied to Invoices', 'MISMATCHED_ADVANCE_TYPE', 400);
      }

      const invoice = await tx.invoice.findUnique({ where: { id: targetId } });
      if (!invoice) {
        throw new AccountingError('Invoice not found', 'NOT_FOUND', 404);
      }

      const balanceDue = new Prisma.Decimal(invoice.balance_due);
      if (applyAmount.greaterThan(balanceDue)) {
        throw new AccountingError(
          `Applied amount (${applyAmount.toFixed(2)}) exceeds invoice balance due (${balanceDue.toFixed(2)})`,
          'EXCEEDS_BALANCE_DUE',
          400,
        );
      }

      const arAccountId = settings.defaultReceivableAccountId;
      const advanceAccountId = settings.defaultCustomerAdvanceAccountId;
      if (!arAccountId || !advanceAccountId) {
        throw new AccountingError('AR or Customer Advance accounts not configured in Settings', 'SETTINGS_NOT_CONFIGURED', 400);
      }

      // Contra entry: Dr Customer Advance Liability, Cr Accounts Receivable
      contraLines = [
        {
          account: { connect: { id: advanceAccountId } },
          debit: applyAmount,
          credit: 0,
          description: `Advance application to Invoice ${invoice.ref_id || invoice.id}`,
        },
        {
          account: { connect: { id: arAccountId } },
          debit: 0,
          credit: applyAmount,
          description: `Settlement via Advance ${advance.ref_id || advance.id}`,
        },
      ];

      const newPaid = new Prisma.Decimal(invoice.paid_amount).plus(applyAmount);
      const newBalance = new Prisma.Decimal(invoice.total_amount).minus(newPaid);
      const newStatus = newBalance.equals(0) ? 'Paid' : 'PartiallyPaid';

      updatedInvoice = await tx.invoice.update({
        where: { id: targetId },
        data: {
          paid_amount: newPaid,
          balance_due: newBalance,
          status: newStatus,
          updated_by: toUuidOrNull(userId),
        },
      });

    } else if (targetType === 'Bill') {
      if (advance.direction !== 'Paid' || advance.party_type !== 'Provider') {
        throw new AccountingError('Only Paid Provider advances can be applied to Bills', 'MISMATCHED_ADVANCE_TYPE', 400);
      }

      const bill = await tx.bill.findUnique({ where: { id: targetId } });
      if (!bill) {
        throw new AccountingError('Bill not found', 'NOT_FOUND', 404);
      }

      const balanceDue = new Prisma.Decimal(bill.balance_due);
      if (applyAmount.greaterThan(balanceDue)) {
        throw new AccountingError(
          `Applied amount (${applyAmount.toFixed(2)}) exceeds bill balance due (${balanceDue.toFixed(2)})`,
          'EXCEEDS_BALANCE_DUE',
          400,
        );
      }

      const apAccountId = settings.defaultPayableAccountId;
      const advanceAccountId = settings.defaultProviderAdvanceAccountId;
      if (!apAccountId || !advanceAccountId) {
        throw new AccountingError('AP or Provider Advance accounts not configured in Settings', 'SETTINGS_NOT_CONFIGURED', 400);
      }

      // Contra entry: Dr Accounts Payable, Cr Provider Advance Asset
      contraLines = [
        {
          account: { connect: { id: apAccountId } },
          debit: applyAmount,
          credit: 0,
          description: `Settlement via Advance ${advance.ref_id || advance.id}`,
        },
        {
          account: { connect: { id: advanceAccountId } },
          debit: 0,
          credit: applyAmount,
          description: `Advance application to Bill ${bill.ref_id || bill.id}`,
        },
      ];

      const newPaid = new Prisma.Decimal(bill.paid_amount).plus(applyAmount);
      const newBalance = new Prisma.Decimal(bill.total_amount).minus(newPaid);
      const newStatus = newBalance.equals(0) ? 'Paid' : 'PartiallyPaid';

      updatedBill = await tx.bill.update({
        where: { id: targetId },
        data: {
          paid_amount: newPaid,
          balance_due: newBalance,
          status: newStatus,
          updated_by: toUuidOrNull(userId),
        },
      });
    }

    // 4. Create and post Contra GL entry
    const refId = await nextJournalEntryRefId(tx);
    const contraDraft = await tx.journalEntry.create({
      data: {
        ref_id: refId,
        entry_date: appliedDate,
        memo: `Contra advance application (${targetType} ${targetId})`,
        status: 'Draft',
        periodId: period.id,
        source_type: 'AdvanceApplication',
        source_id: advance.id,
        created_by: toUuidOrNull(userId),
        lines: {
          create: contraLines,
        },
      },
    });

    const contraEntry = await postJournalEntryTx(tx, contraDraft.id, userId);

    // 5. Create AdvanceApplication
    const application = await tx.advanceApplication.create({
      data: {
        advanceId: advance.id,
        invoiceId: targetType === 'Invoice' ? targetId : null,
        billId: targetType === 'Bill' ? targetId : null,
        amount: applyAmount,
        applied_date: appliedDate,
        journalEntryId: contraEntry.id,
        created_by: toUuidOrNull(userId),
      },
    });

    // 6. Update Advance amounts and status (atomic update check)
    const newApplied = new Prisma.Decimal(advance.applied_amount).plus(applyAmount);
    const newRemaining = new Prisma.Decimal(advance.amount).minus(newApplied);
    const newAdvanceStatus = newRemaining.equals(0) ? 'FullyApplied' : 'PartiallyApplied';

    const advanceUpdate = await tx.advance.updateMany({
      where: {
        id: advance.id,
        remaining_amount: { gte: applyAmount },
        status: { in: ['Open', 'PartiallyApplied'] },
      },
      data: {
        applied_amount: newApplied,
        remaining_amount: newRemaining,
        status: newAdvanceStatus,
      },
    });

    if (advanceUpdate.count === 0) {
      throw new AccountingError(
        'Advance balance was modified concurrently by another transaction',
        'CONCURRENCY_ERROR',
        409,
      );
    }

    const updatedAdvance = await tx.advance.findUnique({
      where: { id: advance.id },
      include: {
        account: true,
        journalEntry: true,
      },
    });

    return {
      application,
      advance: updatedAdvance,
      invoice: updatedInvoice,
      bill: updatedBill,
    };
  });
}

/**
 * Voids an unapplied Advance. Rejects if applied_amount > 0.
 */
export async function voidAdvance(advanceId: string, userId?: string | null) {
  return await prisma.$transaction(async (tx) => {
    const advance = await tx.advance.findUnique({
      where: { id: advanceId },
    });

    if (!advance) {
      throw new AccountingError('Advance not found', 'NOT_FOUND', 404);
    }

    if (advance.status === 'Void') {
      throw new AccountingError('Advance is already voided', 'ALREADY_VOID', 400);
    }

    const appliedAmount = new Prisma.Decimal(advance.applied_amount);
    if (appliedAmount.greaterThan(0)) {
      throw new AccountingError(
        'Cannot void an advance that has already been applied. Revert applications first.',
        'ADVANCE_ALREADY_APPLIED',
        400,
      );
    }

    // Void initial GL entry if present
    if (advance.journalEntryId) {
      await voidJournalEntryTx(tx, advance.journalEntryId, userId, `Voiding Advance ${advance.ref_id || advance.id}`);
    }

    const updatedAdvance = await tx.advance.update({
      where: { id: advanceId },
      data: {
        status: 'Void',
        remaining_amount: 0,
      },
    });

    return updatedAdvance;
  });
}

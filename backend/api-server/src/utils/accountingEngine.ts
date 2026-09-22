import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { nextJournalEntryRefId } from './refId';

export class AccountingError extends Error {
  code: string;
  statusCode: number;

  constructor(message: string, code: string = 'INVALID_JOURNAL_ENTRY', statusCode: number = 400) {
    super(message);
    this.name = 'AccountingError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const toUuidOrNull = (id?: string | null): string | null => (id && UUID_REGEX.test(id) ? id : null);

/**
 * Transaction-scoped posting logic for a Draft journal entry.
 * Validates double-entry correctness, active/postable accounts, and open accounting period requirements.
 */
export async function postJournalEntryTx(tx: Prisma.TransactionClient, entryId: string, userId?: string | null) {
  const entry = await tx.journalEntry.findUnique({
    where: { id: entryId },
    include: {
      lines: {
        include: {
          account: true,
        },
      },
      period: true,
    },
  });

  if (!entry) {
    throw new AccountingError('Journal entry not found', 'NOT_FOUND', 404);
  }

  if (entry.status !== 'Draft') {
    throw new AccountingError(
      `Journal entry cannot be posted because its status is '${entry.status}' (must be 'Draft')`,
      'INVALID_STATUS',
      400,
    );
  }

  // 1. Minimum 2 lines required
  if (!entry.lines || entry.lines.length < 2) {
    throw new AccountingError(
      'Journal entry must contain at least 2 line items',
      'MINIMUM_LINES_REQUIRED',
      400,
    );
  }

  let totalDebit = new Prisma.Decimal(0);
  let totalCredit = new Prisma.Decimal(0);

  // 2. Each line must be debit-xor-credit and > 0, and referenced account active & postable
  for (const line of entry.lines) {
    const debit = new Prisma.Decimal(line.debit || 0);
    const credit = new Prisma.Decimal(line.credit || 0);

    if (debit.isNegative() || credit.isNegative()) {
      throw new AccountingError(
        `Journal line contains negative values (debit: ${debit}, credit: ${credit})`,
        'NEGATIVE_LINE_AMOUNT',
        400,
      );
    }

    const isDebit = debit.greaterThan(0) && credit.equals(0);
    const isCredit = credit.greaterThan(0) && debit.equals(0);

    if (!isDebit && !isCredit) {
      throw new AccountingError(
        `Journal line must be exclusively debit or credit > 0 (received debit: ${debit}, credit: ${credit})`,
        'INVALID_LINE_BALANCING',
        400,
      );
    }

    totalDebit = totalDebit.plus(debit);
    totalCredit = totalCredit.plus(credit);

    // Account postable check
    const acc = line.account;
    if (!acc || !acc.isActive || acc.deletedAt !== null) {
      throw new AccountingError(
        `Account '${acc?.name || line.accountId}' is inactive or deleted and cannot receive postings`,
        'ACCOUNT_INACTIVE',
        400,
      );
    }

    if (!acc.is_postable) {
      throw new AccountingError(
        `Account '${acc.account_code} - ${acc.name}' is marked as non-postable (parent/header account)`,
        'ACCOUNT_NOT_POSTABLE',
        400,
      );
    }
  }

  // 3. sum(debit) === sum(credit)
  if (!totalDebit.equals(totalCredit)) {
    throw new AccountingError(
      `Journal entry is unbalanced: total debits (${totalDebit.toFixed(2)}) != total credits (${totalCredit.toFixed(2)})`,
      'UNBALANCED_JOURNAL_ENTRY',
      400,
    );
  }

  // 4. Period checks
  const period = entry.period;
  if (!period) {
    throw new AccountingError('Accounting period is missing for this entry', 'MISSING_PERIOD', 400);
  }

  if (period.status !== 'Open') {
    throw new AccountingError(
      `Cannot post into accounting period '${period.name}' because status is '${period.status}' (must be 'Open')`,
      'PERIOD_NOT_OPEN',
      400,
    );
  }

  const entryDate = new Date(entry.entry_date);
  const startDate = new Date(period.start_date);
  const endDate = new Date(period.end_date);

  if (entryDate < startDate || entryDate > endDate) {
    throw new AccountingError(
      `Entry date (${entryDate.toISOString().split('T')[0]}) is outside period '${period.name}' range (${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]})`,
      'ENTRY_DATE_OUT_OF_PERIOD',
      400,
    );
  }

  // Update status to Posted
  const updated = await tx.journalEntry.update({
    where: { id: entryId },
    data: {
      status: 'Posted',
      posted_by: toUuidOrNull(userId),
      posted_at: new Date(),
    },
    include: {
      lines: {
        include: {
          account: true,
        },
      },
      period: true,
    },
  });

  return updated;
}

/**
 * Posts a Draft journal entry.
 */
export async function postJournalEntry(entryId: string, userId?: string | null) {
  return await prisma.$transaction(async (tx) => {
    return await postJournalEntryTx(tx, entryId, userId);
  });
}

/**
 * Core voiding logic operating within an existing transaction context.
 */
export async function voidJournalEntryTx(
  tx: Prisma.TransactionClient,
  entryId: string,
  userId?: string | null,
  reversalMemo?: string,
) {
  const original = await tx.journalEntry.findUnique({
    where: { id: entryId },
    include: {
      lines: true,
      period: true,
    },
  });

  if (!original) {
    throw new AccountingError('Journal entry not found', 'NOT_FOUND', 404);
  }

  if (original.status !== 'Posted') {
    throw new AccountingError(
      `Only 'Posted' journal entries can be voided. Current status is '${original.status}'.`,
      'CANNOT_VOID_NON_POSTED',
      400,
    );
  }

  const reversalDate = new Date();

  // Find current active Open accounting period matching the reversal entry date
  let openPeriod = await tx.accountingPeriod.findFirst({
    where: {
      status: 'Open',
      start_date: { lte: reversalDate },
      end_date: { gte: reversalDate },
    },
  });

  // Fallback: check if original's period is currently Open and covers reversalDate
  if (!openPeriod && original.period && original.period.status === 'Open') {
    const pStart = new Date(original.period.start_date);
    const pEnd = new Date(original.period.end_date);
    if (reversalDate >= pStart && reversalDate <= pEnd) {
      openPeriod = original.period;
    }
  }

  // Fallback 2: if no open period matches reversal date, find any currently Open period
  if (!openPeriod) {
    openPeriod = await tx.accountingPeriod.findFirst({
      where: { status: 'Open' },
      orderBy: { start_date: 'desc' },
    });
  }

  if (!openPeriod) {
    throw new AccountingError(
      'No open accounting period found to post reversal entry. Please create or open an accounting period first.',
      'NO_OPEN_PERIOD',
      400,
    );
  }

  // Generate ref_id for reversal entry using shared utility
  const reversalRefId = await nextJournalEntryRefId(tx);
  const memoText = reversalMemo || `Reversal of ${original.ref_id || original.id}`;

  const creatorUuid = toUuidOrNull(userId);

  // Create reversing entry in Draft status
  const reversalDraft = await tx.journalEntry.create({
    data: {
      ref_id: reversalRefId,
      entry_date: reversalDate,
      memo: memoText,
      status: 'Draft',
      periodId: openPeriod.id,
      source_type: original.source_type,
      source_id: original.source_id,
      reversalOfId: original.id,
      created_by: creatorUuid,
      lines: {
        create: original.lines.map((line) => ({
          accountId: line.accountId,
          debit: line.credit,
          credit: line.debit,
          currency: line.currency,
          description: `Reversal: ${line.description || ''}`.trim(),
        })),
      },
    },
  });

  // Mark original entry as Voided
  const updatedOriginal = await tx.journalEntry.update({
    where: { id: original.id },
    data: { status: 'Voided' },
  });

  // Run full posting engine validation on the reversal entry
  const postedReversal = await postJournalEntryTx(tx, reversalDraft.id, userId);

  return {
    original: updatedOriginal,
    reversal: postedReversal,
  };
}

/**
 * Voids a Posted journal entry by creating and posting an automated reversing entry with swapped debits and credits.
 */
export async function voidJournalEntry(entryId: string, userId?: string | null, reversalMemo?: string) {
  return await prisma.$transaction(async (tx) => {
    return await voidJournalEntryTx(tx, entryId, userId, reversalMemo);
  });
}

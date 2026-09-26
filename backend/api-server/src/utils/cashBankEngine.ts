import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { AccountingError, postJournalEntryTx } from './accountingEngine';
import { nextJournalEntryRefId } from './refId';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const toUuidOrNull = (id?: string | null): string | null => (id && UUID_REGEX.test(id) ? id : null);

/**
 * Transfers funds between two GL cash/bank accounts by posting a 2-line JournalEntry.
 */
export async function transferFunds(
  fromAccountId: string,
  toAccountId: string,
  amount: number | Prisma.Decimal | string,
  date: Date | string,
  memo?: string,
  userId?: string | null,
) {
  const transferAmount = new Prisma.Decimal(amount);
  if (transferAmount.lessThanOrEqualTo(0)) {
    throw new AccountingError('Transfer amount must be greater than zero', 'INVALID_AMOUNT', 400);
  }

  if (fromAccountId === toAccountId) {
    throw new AccountingError('Source and destination accounts must be different', 'SAME_ACCOUNT', 400);
  }

  return await prisma.$transaction(async (tx) => {
    // 1. Verify accounts exist, active, postable
    const fromAccount = await tx.account.findUnique({ where: { id: fromAccountId } });
    if (!fromAccount || !fromAccount.isActive || fromAccount.deletedAt !== null) {
      throw new AccountingError('Source account is inactive or not found', 'ACCOUNT_INACTIVE', 400);
    }
    if (!fromAccount.is_postable) {
      throw new AccountingError('Source account is marked as non-postable', 'ACCOUNT_NOT_POSTABLE', 400);
    }

    const toAccount = await tx.account.findUnique({ where: { id: toAccountId } });
    if (!toAccount || !toAccount.isActive || toAccount.deletedAt !== null) {
      throw new AccountingError('Destination account is inactive or not found', 'ACCOUNT_INACTIVE', 400);
    }
    if (!toAccount.is_postable) {
      throw new AccountingError('Destination account is marked as non-postable', 'ACCOUNT_NOT_POSTABLE', 400);
    }

    // 2. Lookup open accounting period covering transfer date
    const transferDate = new Date(date);
    const period = await tx.accountingPeriod.findFirst({
      where: {
        status: 'Open',
        start_date: { lte: transferDate },
        end_date: { gte: transferDate },
      },
    });

    if (!period) {
      throw new AccountingError(
        `No open accounting period found covering transfer date (${transferDate.toISOString().split('T')[0]})`,
        'NO_OPEN_PERIOD',
        400,
      );
    }

    // 3. Generate entry ref_id
    const refId = await nextJournalEntryRefId(tx);

    // 4. Create Draft 2-line JournalEntry (Dr destination account, Cr source account)
    const draft = await tx.journalEntry.create({
      data: {
        ref_id: refId,
        entry_date: transferDate,
        memo: memo || `Transfer from ${fromAccount.account_code} to ${toAccount.account_code}`,
        status: 'Draft',
        periodId: period.id,
        source_type: 'BankTransfer',
        created_by: toUuidOrNull(userId),
        lines: {
          create: [
            {
              accountId: toAccountId,
              debit: transferAmount,
              credit: 0,
              description: `Transfer in from ${fromAccount.account_code} - ${fromAccount.name}`,
            },
            {
              accountId: fromAccountId,
              debit: 0,
              credit: transferAmount,
              description: `Transfer out to ${toAccount.account_code} - ${toAccount.name}`,
            },
          ],
        },
      },
    });

    // 5. Post entry using transaction-scoped posting logic
    const posted = await postJournalEntryTx(tx, draft.id, userId);
    return posted;
  });
}

/**
 * Reconciles a BankAccount against a bank statement date and closing balance.
 * Validates that all supplied JournalLine IDs belong to the GL Account linked to the BankAccount.
 */
export async function reconcileBankAccount(
  bankAccountId: string,
  statement_date: Date | string,
  statement_closing_balance: number | Prisma.Decimal | string,
  journalLineIds: string[],
  userId?: string | null,
) {
  return await prisma.$transaction(async (tx) => {
    const bankAccount = await tx.bankAccount.findUnique({
      where: { id: bankAccountId },
      include: { account: true },
    });

    if (!bankAccount || !bankAccount.isActive || bankAccount.deletedAt !== null) {
      throw new AccountingError('Bank account not found or inactive', 'NOT_FOUND', 404);
    }

    if (!journalLineIds || journalLineIds.length === 0) {
      throw new AccountingError('At least one journal line must be selected for reconciliation', 'NO_LINES', 400);
    }

    // Verify all specified lines exist and belong to bankAccount.accountId
    const lines = await tx.journalLine.findMany({
      where: {
        id: { in: journalLineIds },
      },
      include: {
        account: true,
      },
    });

    if (lines.length !== journalLineIds.length) {
      throw new AccountingError('One or more selected journal lines were not found', 'LINE_NOT_FOUND', 400);
    }

    for (const line of lines) {
      if (line.accountId !== bankAccount.accountId) {
        throw new AccountingError(
          `Journal line '${line.id}' account '${line.account?.account_code || line.accountId}' does not match bank account GL account '${bankAccount.account?.account_code}'`,
          'INVALID_LINE_ACCOUNT',
          400,
        );
      }
      if (line.reconciled) {
        throw new AccountingError(
          `Journal line '${line.id}' is already reconciled`,
          'ALREADY_RECONCILED',
          400,
        );
      }
    }

    const statementDate = new Date(statement_date);
    const closingBalance = new Prisma.Decimal(statement_closing_balance);

    // Create BankReconciliation record with status Completed
    const rec = await tx.bankReconciliation.create({
      data: {
        bankAccountId,
        statement_date: statementDate,
        statement_closing_balance: closingBalance,
        status: 'Completed',
        reconciled_by: toUuidOrNull(userId),
        reconciled_at: new Date(),
      },
    });

    // Mark lines as reconciled
    await tx.journalLine.updateMany({
      where: { id: { in: journalLineIds } },
      data: {
        reconciled: true,
        reconciliationId: rec.id,
      },
    });

    const updatedRec = await tx.bankReconciliation.findUnique({
      where: { id: rec.id },
      include: {
        bankAccount: { include: { account: true } },
        lines: { include: { account: true } },
      },
    });

    return updatedRec!;
  });
}

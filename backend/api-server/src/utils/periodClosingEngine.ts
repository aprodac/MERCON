import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { AccountingError } from './accountingEngine';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const toUuidOrNull = (id?: string | null): string | null => (id && UUID_REGEX.test(id) ? id : null);

/**
 * Closes an open AccountingPeriod while creating snapshot AccountClosingBalance records
 * for all active accounts that had journal line activity in this period.
 * Enforces the unposted-drafts guard.
 */
export async function closeAccountingPeriodWithSnapshot(periodId: string, userId?: string | null) {
  return await prisma.$transaction(async (tx) => {
    // 1. Fetch target period
    const period = await tx.accountingPeriod.findUnique({
      where: { id: periodId },
    });

    if (!period) {
      throw new AccountingError('Accounting period not found', 'NOT_FOUND', 404);
    }

    if (period.status !== 'Open') {
      throw new AccountingError(
        `Cannot close accounting period '${period.name}' because status is '${period.status}' (must be 'Open')`,
        'INVALID_STATUS',
        400,
      );
    }

    // 2. Unposted drafts guard: reject if any Draft journal entries exist in this period
    const unpostedDraftsCount = await tx.journalEntry.count({
      where: {
        periodId: period.id,
        status: 'Draft',
      },
    });

    if (unpostedDraftsCount > 0) {
      throw new AccountingError(
        `Cannot close accounting period '${period.name}' because it contains ${unpostedDraftsCount} unposted draft journal entry(ies). Please post or void them first.`,
        'UNPOSTED_DRAFTS_EXIST',
        400,
      );
    }

    // 3. Mark period status as Closed
    const updatedPeriod = await tx.accountingPeriod.update({
      where: { id: periodId },
      data: {
        status: 'Closed',
        closed_by: toUuidOrNull(userId),
        closed_at: new Date(),
      },
    });

    // 4. Query aggregated debits & credits for all accounts with Posted JournalLines in this period
    const lineAggregations = await tx.journalLine.groupBy({
      by: ['accountId'],
      where: {
        journalEntry: {
          periodId: period.id,
          status: 'Posted',
        },
      },
      _sum: {
        debit: true,
        credit: true,
      },
    });

    // 5. Fetch account definitions for account_type normal balance computation
    const accountIds = lineAggregations.map((a) => a.accountId);
    const accounts = await tx.account.findMany({
      where: { id: { in: accountIds } },
    });

    const accountMap = new Map(accounts.map((acc) => [acc.id, acc]));

    // 6. Write AccountClosingBalance snapshot rows
    for (const agg of lineAggregations) {
      const debitTotal = new Prisma.Decimal(agg._sum.debit || 0);
      const creditTotal = new Prisma.Decimal(agg._sum.credit || 0);

      const acc = accountMap.get(agg.accountId);
      const accountType = acc?.account_type || 'Asset';

      let closingBalance: Prisma.Decimal;
      if (accountType === 'Asset' || accountType === 'Expense') {
        closingBalance = debitTotal.minus(creditTotal);
      } else {
        // Liability, Equity, Revenue
        closingBalance = creditTotal.minus(debitTotal);
      }

      await tx.accountClosingBalance.upsert({
        where: {
          periodId_accountId: {
            periodId: period.id,
            accountId: agg.accountId,
          },
        },
        create: {
          periodId: period.id,
          accountId: agg.accountId,
          closing_debit_total: debitTotal,
          closing_credit_total: creditTotal,
          closing_balance: closingBalance,
        },
        update: {
          closing_debit_total: debitTotal,
          closing_credit_total: creditTotal,
          closing_balance: closingBalance,
          computed_at: new Date(),
        },
      });
    }

    // Return closed period with created snapshot rows
    return await tx.accountingPeriod.findUnique({
      where: { id: periodId },
      include: {
        closingBalances: {
          include: {
            account: true,
          },
        },
      },
    });
  });
}

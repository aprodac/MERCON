import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { AccountingError, postJournalEntryTx } from './accountingEngine';
import { nextJournalEntryRefId } from './refId';

export async function closeFiscalYear(closingDate: Date, userId: string) {
  // 1. Validate all AccountingPeriods with end_date <= closingDate are Closed or Locked
  const openPeriods = await prisma.accountingPeriod.findMany({
    where: {
      end_date: { lte: closingDate },
      status: 'Open',
    },
  });

  if (openPeriods.length > 0) {
    const periodNames = openPeriods.map((p) => p.name).join(', ');
    throw new AccountingError(
      `Cannot close fiscal year ending ${closingDate.toISOString().split('T')[0]}: open accounting period(s) exist in range (${periodNames}). Please close individual periods first.`,
      'OPEN_PERIODS_EXIST',
      400,
    );
  }

  // 2. Check Settings for defaultRetainedEarningsAccountId
  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
  });

  if (!settings || !settings.defaultRetainedEarningsAccountId) {
    throw new AccountingError(
      'Default Retained Earnings account is not configured in Settings.',
      'RETAINED_EARNINGS_ACCOUNT_NOT_SET',
      400,
    );
  }

  const retainedEarningsAccountId = settings.defaultRetainedEarningsAccountId;
  const reAccount = await prisma.account.findUnique({
    where: { id: retainedEarningsAccountId },
  });

  if (!reAccount || !reAccount.isActive || reAccount.deletedAt !== null) {
    throw new AccountingError(
      'Configured Retained Earnings account is invalid, inactive, or deleted.',
      'INVALID_RETAINED_EARNINGS_ACCOUNT',
      400,
    );
  }

  // 3. Compute cumulative balances for Revenue and Expense accounts up to closingDate
  const lines = await prisma.journalLine.findMany({
    where: {
      journalEntry: {
        status: 'Posted',
        entry_date: { lte: closingDate },
      },
      account: {
        account_type: { in: ['Revenue', 'Expense'] },
      },
    },
    include: {
      account: true,
    },
  });

  const revenueBalMap = new Map<string, { accountId: string; code: string; name: string; balance: Prisma.Decimal }>();
  const expenseBalMap = new Map<string, { accountId: string; code: string; name: string; balance: Prisma.Decimal }>();

  let cumulativeRevenue = new Prisma.Decimal(0);
  let cumulativeExpense = new Prisma.Decimal(0);

  for (const l of lines) {
    const acc = l.account;
    const debit = new Prisma.Decimal(l.debit || 0);
    const credit = new Prisma.Decimal(l.credit || 0);

    if (acc.account_type === 'Revenue') {
      const current = revenueBalMap.get(acc.id) || {
        accountId: acc.id,
        code: acc.account_code,
        name: acc.name,
        balance: new Prisma.Decimal(0),
      };
      const net = credit.minus(debit);
      current.balance = current.balance.plus(net);
      revenueBalMap.set(acc.id, current);
      cumulativeRevenue = cumulativeRevenue.plus(net);
    } else if (acc.account_type === 'Expense') {
      const current = expenseBalMap.get(acc.id) || {
        accountId: acc.id,
        code: acc.account_code,
        name: acc.name,
        balance: new Prisma.Decimal(0),
      };
      const net = debit.minus(credit);
      current.balance = current.balance.plus(net);
      expenseBalMap.set(acc.id, current);
      cumulativeExpense = cumulativeExpense.plus(net);
    }
  }

  const netIncome = cumulativeRevenue.minus(cumulativeExpense);

  // 4. Build closing lines
  const lineCreates: { accountId: string; debit: number; credit: number; description: string }[] = [];

  // Zero Revenue accounts: if balance > 0 (credit balance), debit it; if balance < 0, credit it.
  for (const item of revenueBalMap.values()) {
    if (item.balance.equals(0)) continue;
    if (item.balance.greaterThan(0)) {
      lineCreates.push({
        accountId: item.accountId,
        debit: item.balance.toNumber(),
        credit: 0,
        description: `Close Revenue account ${item.code} - ${item.name}`,
      });
    } else {
      lineCreates.push({
        accountId: item.accountId,
        debit: 0,
        credit: item.balance.abs().toNumber(),
        description: `Close Revenue account ${item.code} - ${item.name}`,
      });
    }
  }

  // Zero Expense accounts: if balance > 0 (debit balance), credit it; if balance < 0, debit it.
  for (const item of expenseBalMap.values()) {
    if (item.balance.equals(0)) continue;
    if (item.balance.greaterThan(0)) {
      lineCreates.push({
        accountId: item.accountId,
        debit: 0,
        credit: item.balance.toNumber(),
        description: `Close Expense account ${item.code} - ${item.name}`,
      });
    } else {
      lineCreates.push({
        accountId: item.accountId,
        debit: item.balance.abs().toNumber(),
        credit: 0,
        description: `Close Expense account ${item.code} - ${item.name}`,
      });
    }
  }

  // Balancing line on Retained Earnings
  if (!netIncome.equals(0)) {
    if (netIncome.greaterThan(0)) {
      lineCreates.push({
        accountId: retainedEarningsAccountId,
        debit: 0,
        credit: netIncome.toNumber(),
        description: `Transfer Net Income to Retained Earnings (${reAccount.account_code} - ${reAccount.name})`,
      });
    } else {
      lineCreates.push({
        accountId: retainedEarningsAccountId,
        debit: netIncome.abs().toNumber(),
        credit: 0,
        description: `Transfer Net Loss to Retained Earnings (${reAccount.account_code} - ${reAccount.name})`,
      });
    }
  }

  if (lineCreates.length < 2) {
    throw new AccountingError(
      'No non-zero Revenue or Expense account balances found to close.',
      'NO_BALANCES_TO_CLOSE',
      400,
    );
  }

  // 5. Execute transaction: housing period -> draft JE -> postJournalEntryTx -> close period
  return await prisma.$transaction(async (tx) => {
    // Find an Open period covering closingDate or create/reopen a dedicated closing period
    let openPeriod = await tx.accountingPeriod.findFirst({
      where: {
        status: 'Open',
        start_date: { lte: closingDate },
        end_date: { gte: closingDate },
      },
    });

    let createdClosingPeriod = false;
    let reopenedClosingPeriod = false;

    if (!openPeriod) {
      const existingPeriod = await tx.accountingPeriod.findFirst({
        where: {
          start_date: closingDate,
          end_date: closingDate,
        },
      });

      if (existingPeriod) {
        openPeriod = await tx.accountingPeriod.update({
          where: { id: existingPeriod.id },
          data: { status: 'Open' },
        });
        reopenedClosingPeriod = true;
      } else {
        const year = closingDate.getFullYear();
        openPeriod = await tx.accountingPeriod.create({
          data: {
            name: `FY ${year} Closing Period`,
            start_date: closingDate,
            end_date: closingDate,
            status: 'Open',
          },
        });
        createdClosingPeriod = true;
      }
    }

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const toUuidOrNull = (id?: string | null): string | null => (id && UUID_REGEX.test(id) ? id : null);

    const refId = await nextJournalEntryRefId(tx);
    const draftEntry = await tx.journalEntry.create({
      data: {
        ref_id: refId,
        entry_date: closingDate,
        memo: `Fiscal Year-End Closing as of ${closingDate.toISOString().split('T')[0]}`,
        status: 'Draft',
        periodId: openPeriod.id,
        source_type: 'FiscalYearClosing',
        created_by: toUuidOrNull(userId),
        lines: {
          create: lineCreates,
        },
      },
    });

    const posted = await postJournalEntryTx(tx, draftEntry.id, userId);

    if (createdClosingPeriod || reopenedClosingPeriod) {
      await tx.accountingPeriod.update({
        where: { id: openPeriod.id },
        data: {
          status: 'Closed',
          closed_by: toUuidOrNull(userId),
          closed_at: new Date(),
        },
      });
    }

    return posted;
  });
}

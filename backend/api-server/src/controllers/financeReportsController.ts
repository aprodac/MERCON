import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';

export const getTrialBalance = async (req: Request, res: Response) => {
  try {
    const { period_id } = req.query;

    let periodName: string | undefined = undefined;
    if (period_id) {
      const period = await prisma.accountingPeriod.findUnique({
        where: { id: String(period_id) },
      });
      if (period) {
        periodName = period.name;
      }
    }

    const lineAggregations = await prisma.journalLine.groupBy({
      by: ['accountId'],
      where: {
        journalEntry: {
          status: 'Posted',
          periodId: period_id ? String(period_id) : undefined,
        },
      },
      _sum: {
        debit: true,
        credit: true,
      },
    });

    const accountIds = lineAggregations.map((l) => l.accountId);
    const accounts = await prisma.account.findMany({
      where: { id: { in: accountIds } },
      orderBy: { account_code: 'asc' },
    });

    const accountMap = new Map(accounts.map((a) => [a.id, a]));

    let totalDebit = new Prisma.Decimal(0);
    let totalCredit = new Prisma.Decimal(0);

    const items = lineAggregations
      .map((agg) => {
        const acc = accountMap.get(agg.accountId);
        if (!acc) return null;

        const debit = new Prisma.Decimal(agg._sum.debit || 0);
        const credit = new Prisma.Decimal(agg._sum.credit || 0);

        totalDebit = totalDebit.plus(debit);
        totalCredit = totalCredit.plus(credit);

        let balance = 0;
        if (acc.account_type === 'Asset' || acc.account_type === 'Expense') {
          balance = debit.minus(credit).toNumber();
        } else {
          balance = credit.minus(debit).toNumber();
        }

        return {
          account_code: acc.account_code,
          name: acc.name,
          account_type: acc.account_type,
          debit: debit.toNumber(),
          credit: credit.toNumber(),
          balance,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => a.account_code.localeCompare(b.account_code));

    const is_balanced = totalDebit.equals(totalCredit);

    res.json({
      success: true,
      data: {
        period_id: period_id ? String(period_id) : undefined,
        period_name: periodName,
        items,
        total_debit: totalDebit.toNumber(),
        total_credit: totalCredit.toNumber(),
        is_balanced,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getProfitAndLoss = async (req: Request, res: Response) => {
  try {
    const { date_from, date_to } = req.query;

    const entryDateFilter: Prisma.DateTimeFilter = {};
    if (date_from) {
      entryDateFilter.gte = new Date(String(date_from));
    }
    if (date_to) {
      entryDateFilter.lte = new Date(String(date_to));
    }

    const lines = await prisma.journalLine.findMany({
      where: {
        journalEntry: {
          status: 'Posted',
          entry_date: Object.keys(entryDateFilter).length > 0 ? entryDateFilter : undefined,
        },
        account: {
          account_type: { in: ['Revenue', 'Expense'] },
        },
      },
      include: {
        account: true,
      },
    });

    const revenueMap = new Map<string, { account_code: string; name: string; amount: Prisma.Decimal }>();
    const expenseMap = new Map<string, { account_code: string; name: string; amount: Prisma.Decimal }>();

    for (const line of lines) {
      const acc = line.account;
      const debit = new Prisma.Decimal(line.debit || 0);
      const credit = new Prisma.Decimal(line.credit || 0);

      if (acc.account_type === 'Revenue') {
        const current = revenueMap.get(acc.id) || {
          account_code: acc.account_code,
          name: acc.name,
          amount: new Prisma.Decimal(0),
        };
        current.amount = current.amount.plus(credit.minus(debit));
        revenueMap.set(acc.id, current);
      } else if (acc.account_type === 'Expense') {
        const current = expenseMap.get(acc.id) || {
          account_code: acc.account_code,
          name: acc.name,
          amount: new Prisma.Decimal(0),
        };
        current.amount = current.amount.plus(debit.minus(credit));
        expenseMap.set(acc.id, current);
      }
    }

    let totalRevenue = new Prisma.Decimal(0);
    const revenues = Array.from(revenueMap.values())
      .map((r) => {
        totalRevenue = totalRevenue.plus(r.amount);
        return {
          account_code: r.account_code,
          name: r.name,
          amount: r.amount.toNumber(),
        };
      })
      .sort((a, b) => a.account_code.localeCompare(b.account_code));

    let totalExpense = new Prisma.Decimal(0);
    const expenses = Array.from(expenseMap.values())
      .map((e) => {
        totalExpense = totalExpense.plus(e.amount);
        return {
          account_code: e.account_code,
          name: e.name,
          amount: e.amount.toNumber(),
        };
      })
      .sort((a, b) => a.account_code.localeCompare(b.account_code));

    const netProfit = totalRevenue.minus(totalExpense).toNumber();

    res.json({
      success: true,
      data: {
        date_from: date_from ? String(date_from) : undefined,
        date_to: date_to ? String(date_to) : undefined,
        revenues,
        expenses,
        total_revenue: totalRevenue.toNumber(),
        total_expense: totalExpense.toNumber(),
        net_profit: netProfit,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getBalanceSheet = async (req: Request, res: Response) => {
  try {
    const { as_of } = req.query;
    const asOfDate = as_of ? new Date(String(as_of)) : new Date();

    // Check if as_of matches a Closed accounting period's end_date for snapshot optimization
    let matchedClosedPeriod = await prisma.accountingPeriod.findFirst({
      where: {
        status: 'Closed',
        end_date: {
          gte: new Date(asOfDate.getFullYear(), asOfDate.getMonth(), asOfDate.getDate(), 0, 0, 0),
          lte: new Date(asOfDate.getFullYear(), asOfDate.getMonth(), asOfDate.getDate(), 23, 59, 59),
        },
      },
      include: {
        closingBalances: {
          include: { account: true },
        },
      },
    });

    let using_snapshot = false;
    const assets: { account_code: string; name: string; amount: number }[] = [];
    const liabilities: { account_code: string; name: string; amount: number }[] = [];
    const equity: { account_code: string; name: string; amount: number }[] = [];

    let totalAssets = new Prisma.Decimal(0);
    let totalLiabilities = new Prisma.Decimal(0);
    let totalEquity = new Prisma.Decimal(0);

    if (matchedClosedPeriod && matchedClosedPeriod.closingBalances.length > 0) {
      using_snapshot = true;
      for (const cb of matchedClosedPeriod.closingBalances) {
        const acc = cb.account;
        const bal = new Prisma.Decimal(cb.closing_balance);

        const item = {
          account_code: acc.account_code,
          name: acc.name,
          amount: bal.toNumber(),
        };

        if (acc.account_type === 'Asset') {
          assets.push(item);
          totalAssets = totalAssets.plus(bal);
        } else if (acc.account_type === 'Liability') {
          liabilities.push(item);
          totalLiabilities = totalLiabilities.plus(bal);
        } else if (acc.account_type === 'Equity') {
          equity.push(item);
          totalEquity = totalEquity.plus(bal);
        }
      }
    } else {
      // Raw calculation from Posted journal lines up to asOfDate
      using_snapshot = false;
      const lines = await prisma.journalLine.findMany({
        where: {
          journalEntry: {
            status: 'Posted',
            entry_date: { lte: asOfDate },
          },
          account: {
            account_type: { in: ['Asset', 'Liability', 'Equity'] },
          },
        },
        include: {
          account: true,
        },
      });

      const accountBalMap = new Map<string, { account_code: string; name: string; account_type: string; amount: Prisma.Decimal }>();

      for (const line of lines) {
        const acc = line.account;
        const debit = new Prisma.Decimal(line.debit || 0);
        const credit = new Prisma.Decimal(line.credit || 0);

        const current = accountBalMap.get(acc.id) || {
          account_code: acc.account_code,
          name: acc.name,
          account_type: acc.account_type,
          amount: new Prisma.Decimal(0),
        };

        if (acc.account_type === 'Asset') {
          current.amount = current.amount.plus(debit.minus(credit));
        } else {
          // Liability, Equity
          current.amount = current.amount.plus(credit.minus(debit));
        }

        accountBalMap.set(acc.id, current);
      }

      for (const val of accountBalMap.values()) {
        const item = {
          account_code: val.account_code,
          name: val.name,
          amount: val.amount.toNumber(),
        };

        if (val.account_type === 'Asset') {
          assets.push(item);
          totalAssets = totalAssets.plus(val.amount);
        } else if (val.account_type === 'Liability') {
          liabilities.push(item);
          totalLiabilities = totalLiabilities.plus(val.amount);
        } else if (val.account_type === 'Equity') {
          equity.push(item);
          totalEquity = totalEquity.plus(val.amount);
        }
      }
    }

    assets.sort((a, b) => a.account_code.localeCompare(b.account_code));
    liabilities.sort((a, b) => a.account_code.localeCompare(b.account_code));
    equity.sort((a, b) => a.account_code.localeCompare(b.account_code));

    const is_balanced = totalAssets.equals(totalLiabilities.plus(totalEquity));

    res.json({
      success: true,
      data: {
        as_of: asOfDate.toISOString(),
        using_snapshot,
        assets,
        liabilities,
        equity,
        total_assets: totalAssets.toNumber(),
        total_liabilities: totalLiabilities.toNumber(),
        total_equity: totalEquity.toNumber(),
        is_balanced,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

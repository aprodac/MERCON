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

export const calculateProfitAndLossData = async (date_from?: string, date_to?: string) => {
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

  return {
    date_from: date_from ? String(date_from) : undefined,
    date_to: date_to ? String(date_to) : undefined,
    revenues,
    expenses,
    total_revenue: totalRevenue.toNumber(),
    total_expense: totalExpense.toNumber(),
    net_profit: netProfit,
  };
};

export const getProfitAndLoss = async (req: Request, res: Response) => {
  try {
    const { date_from, date_to } = req.query;
    const data = await calculateProfitAndLossData(
      date_from ? String(date_from) : undefined,
      date_to ? String(date_to) : undefined,
    );
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getCashFlow = async (req: Request, res: Response) => {
  try {
    const { date_from, date_to } = req.query;

    const fromDate = date_from ? new Date(String(date_from)) : undefined;
    const toDate = date_to ? new Date(String(date_to)) : undefined;

    const pnl = await calculateProfitAndLossData(
      date_from ? String(date_from) : undefined,
      date_to ? String(date_to) : undefined,
    );
    const netIncome = pnl.net_profit;

    const entryDateFilter: Prisma.DateTimeFilter = {};
    if (fromDate) entryDateFilter.gte = fromDate;
    if (toDate) entryDateFilter.lte = toDate;

    const lines = await prisma.journalLine.findMany({
      where: {
        journalEntry: {
          status: 'Posted',
          entry_date: Object.keys(entryDateFilter).length > 0 ? entryDateFilter : undefined,
        },
        account: {
          cash_flow_category: { in: ['Operating', 'Investing', 'Financing'] },
        },
      },
      include: { account: true },
    });

    const operatingItems: { account_code: string; name: string; amount: number }[] = [];
    const investingItems: { account_code: string; name: string; amount: number }[] = [];
    const financingItems: { account_code: string; name: string; amount: number }[] = [];

    const operatingMap = new Map<string, { account_code: string; name: string; amount: Prisma.Decimal }>();
    const investingMap = new Map<string, { account_code: string; name: string; amount: Prisma.Decimal }>();
    const financingMap = new Map<string, { account_code: string; name: string; amount: Prisma.Decimal }>();

    for (const l of lines) {
      const acc = l.account;
      const debit = new Prisma.Decimal(l.debit || 0);
      const credit = new Prisma.Decimal(l.credit || 0);
      const netActivity = debit.minus(credit);

      if (acc.cash_flow_category === 'Operating') {
        const cur = operatingMap.get(acc.id) || { account_code: acc.account_code, name: acc.name, amount: new Prisma.Decimal(0) };
        cur.amount = cur.amount.plus(netActivity);
        operatingMap.set(acc.id, cur);
      } else if (acc.cash_flow_category === 'Investing') {
        const cur = investingMap.get(acc.id) || { account_code: acc.account_code, name: acc.name, amount: new Prisma.Decimal(0) };
        cur.amount = cur.amount.plus(netActivity);
        investingMap.set(acc.id, cur);
      } else if (acc.cash_flow_category === 'Financing') {
        const cur = financingMap.get(acc.id) || { account_code: acc.account_code, name: acc.name, amount: new Prisma.Decimal(0) };
        cur.amount = cur.amount.plus(netActivity);
        financingMap.set(acc.id, cur);
      }
    }

    let operatingAdjTotal = 0;
    for (const v of operatingMap.values()) {
      const amt = v.amount.toNumber();
      operatingItems.push({ account_code: v.account_code, name: v.name, amount: amt });
      operatingAdjTotal += amt;
    }

    let investingTotal = 0;
    for (const v of investingMap.values()) {
      const amt = v.amount.toNumber();
      investingItems.push({ account_code: v.account_code, name: v.name, amount: amt });
      investingTotal += amt;
    }

    let financingTotal = 0;
    for (const v of financingMap.values()) {
      const amt = v.amount.toNumber();
      financingItems.push({ account_code: v.account_code, name: v.name, amount: amt });
      financingTotal += amt;
    }

    const totalOperating = netIncome + operatingAdjTotal;
    const netChangeInCash = totalOperating + investingTotal + financingTotal;

    const cashBankAccounts = await prisma.bankAccount.findMany({
      select: { opening_balance: true, accountId: true },
    });

    let totalOpeningBal = cashBankAccounts.reduce((sum, b) => sum + Number(b.opening_balance || 0), 0);

    if (fromDate) {
      const priorLines = await prisma.journalLine.findMany({
        where: {
          journalEntry: {
            status: 'Posted',
            entry_date: { lt: fromDate },
          },
          account: {
            bankAccount: { isNot: null },
          },
        },
      });

      const priorNet = priorLines.reduce((sum, l) => sum + Number(l.debit || 0) - Number(l.credit || 0), 0);
      totalOpeningBal += priorNet;
    }

    const closingCash = totalOpeningBal + netChangeInCash;

    res.json({
      success: true,
      data: {
        date_from: date_from ? String(date_from) : undefined,
        date_to: date_to ? String(date_to) : undefined,
        net_income: netIncome,
        operating: {
          net_income: netIncome,
          adjustments: operatingItems,
          total: totalOperating,
        },
        investing: {
          items: investingItems,
          total: investingTotal,
        },
        financing: {
          items: financingItems,
          total: financingTotal,
        },
        net_change_in_cash: netChangeInCash,
        opening_cash: totalOpeningBal,
        closing_cash: closingCash,
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

    const assets: { account_code: string; name: string; amount: number }[] = [];
    const liabilities: { account_code: string; name: string; amount: number }[] = [];
    const equity: { account_code: string; name: string; amount: number }[] = [];

    let totalAssets = new Prisma.Decimal(0);
    let totalLiabilities = new Prisma.Decimal(0);
    let totalEquity = new Prisma.Decimal(0);
    let using_snapshot = false;

    // Check if as_of matches a Closed accounting period's end_date for snapshot optimization
    const matchedClosedPeriod = await prisma.accountingPeriod.findFirst({
      where: {
        status: 'Closed',
        end_date: {
          gte: new Date(asOfDate.getFullYear(), asOfDate.getMonth(), asOfDate.getDate(), 0, 0, 0),
          lte: new Date(asOfDate.getFullYear(), asOfDate.getMonth(), asOfDate.getDate(), 23, 59, 59),
        },
      },
      include: {
        closingBalances: { include: { account: true } },
      },
    });

    if (matchedClosedPeriod && matchedClosedPeriod.closingBalances.length > 0) {
      using_snapshot = true;
      // Fetch AccountClosingBalance snapshot records for all closed periods up to matchedClosedPeriod.end_date
      const closingBalances = await prisma.accountClosingBalance.findMany({
        where: {
          period: {
            status: 'Closed',
            end_date: { lte: matchedClosedPeriod.end_date },
          },
        },
        include: { account: true },
      });

      const accountBalMap = new Map<string, { account_code: string; name: string; account_type: string; amount: Prisma.Decimal }>();
      let cumulativeRevenue = new Prisma.Decimal(0);
      let cumulativeExpense = new Prisma.Decimal(0);

      for (const cb of closingBalances) {
        const acc = cb.account;
        const bal = new Prisma.Decimal(cb.closing_balance);

        if (acc.account_type === 'Revenue') {
          cumulativeRevenue = cumulativeRevenue.plus(bal);
          continue;
        }
        if (acc.account_type === 'Expense') {
          cumulativeExpense = cumulativeExpense.plus(bal);
          continue;
        }

        const current = accountBalMap.get(acc.id) || {
          account_code: acc.account_code,
          name: acc.name,
          account_type: acc.account_type,
          amount: new Prisma.Decimal(0),
        };
        current.amount = current.amount.plus(bal);
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

      const retainedEarnings = cumulativeRevenue.minus(cumulativeExpense);
      if (!retainedEarnings.equals(0)) {
        equity.push({
          account_code: '3999',
          name: 'Retained Earnings (Unclosed Net Income)',
          amount: retainedEarnings.toNumber(),
        });
        totalEquity = totalEquity.plus(retainedEarnings);
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
        },
        include: {
          account: true,
        },
      });

      const accountBalMap = new Map<string, { account_code: string; name: string; account_type: string; amount: Prisma.Decimal }>();
      let cumulativeRevenue = new Prisma.Decimal(0);
      let cumulativeExpense = new Prisma.Decimal(0);

      for (const line of lines) {
        const acc = line.account;
        const debit = new Prisma.Decimal(line.debit || 0);
        const credit = new Prisma.Decimal(line.credit || 0);

        if (acc.account_type === 'Revenue') {
          cumulativeRevenue = cumulativeRevenue.plus(credit.minus(debit));
          continue;
        }
        if (acc.account_type === 'Expense') {
          cumulativeExpense = cumulativeExpense.plus(debit.minus(credit));
          continue;
        }

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

      // Retained Earnings = Cumulative Revenue - Cumulative Expense up to asOfDate
      const retainedEarnings = cumulativeRevenue.minus(cumulativeExpense);
      if (!retainedEarnings.equals(0)) {
        equity.push({
          account_code: '3999',
          name: 'Retained Earnings (Unclosed Net Income)',
          amount: retainedEarnings.toNumber(),
        });
        totalEquity = totalEquity.plus(retainedEarnings);
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

export const getGeneralLedger = async (req: Request, res: Response) => {
  try {
    const { account_id, date_from, date_to } = req.query;

    if (!account_id) {
      return res.json({
        success: true,
        data: {
          account: null,
          opening_balance: 0,
          lines: [],
          closing_balance: 0,
        },
      });
    }

    const accountIdStr = String(account_id);
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(accountIdStr)) {
      return res.status(400).json({ error: { code: 'INVALID_ACCOUNT_ID' } });
    }

    const account = await prisma.account.findUnique({
      where: { id: accountIdStr },
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'Account not found',
      });
    }

    const isDebitNormal = account.account_type === 'Asset' || account.account_type === 'Expense';

    const fromDate = date_from ? new Date(String(date_from)) : undefined;
    const toDate = date_to ? new Date(String(date_to)) : undefined;

    let openingBalance = new Prisma.Decimal(0);

    if (fromDate) {
      const priorLines = await prisma.journalLine.findMany({
        where: {
          accountId: account.id,
          journalEntry: {
            status: 'Posted',
            entry_date: { lt: fromDate },
          },
        },
      });

      for (const line of priorLines) {
        const debit = new Prisma.Decimal(line.debit || 0);
        const credit = new Prisma.Decimal(line.credit || 0);
        if (isDebitNormal) {
          openingBalance = openingBalance.plus(debit.minus(credit));
        } else {
          openingBalance = openingBalance.plus(credit.minus(debit));
        }
      }
    }

    const entryDateFilter: Prisma.DateTimeFilter = {};
    if (fromDate) entryDateFilter.gte = fromDate;
    if (toDate) entryDateFilter.lte = toDate;

    const lines = await prisma.journalLine.findMany({
      where: {
        accountId: account.id,
        journalEntry: {
          status: 'Posted',
          entry_date: Object.keys(entryDateFilter).length > 0 ? entryDateFilter : undefined,
        },
      },
      include: {
        journalEntry: {
          select: {
            ref_id: true,
            entry_date: true,
            memo: true,
            source_type: true,
            source_id: true,
          },
        },
      },
      orderBy: [
        { journalEntry: { entry_date: 'asc' } },
        { journalEntry: { createdAt: 'asc' } },
      ],
    });

    let currentBalance = openingBalance;
    const formattedLines = lines.map((line) => {
      const debit = new Prisma.Decimal(line.debit || 0);
      const credit = new Prisma.Decimal(line.credit || 0);
      const lineImpact = isDebitNormal ? debit.minus(credit) : credit.minus(debit);
      currentBalance = currentBalance.plus(lineImpact);

      return {
        entry_date: line.journalEntry.entry_date.toISOString(),
        ref_id: line.journalEntry.ref_id,
        memo: line.description || line.journalEntry.memo || null,
        source_type: line.journalEntry.source_type || null,
        source_id: line.journalEntry.source_id || null,
        debit: debit.toNumber(),
        credit: credit.toNumber(),
        running_balance: currentBalance.toNumber(),
      };
    });

    res.json({
      success: true,
      data: {
        account: {
          id: account.id,
          account_code: account.account_code,
          name: account.name,
          account_type: account.account_type,
        },
        opening_balance: openingBalance.toNumber(),
        lines: formattedLines,
        closing_balance: currentBalance.toNumber(),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};


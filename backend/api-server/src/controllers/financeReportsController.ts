import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';

const FALLBACK_TZ = 'Asia/Riyadh';

function localDateToUtc(dateStr: string, tz: string, endOfDay: boolean): Date {
  const time = endOfDay ? '23:59:59' : '00:00:00';
  const probe = new Date(`${dateStr}T${time}Z`);

  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts: Record<string, number> = {};
  for (const p of fmt.formatToParts(probe)) {
    if (p.type !== 'literal') parts[p.type] = parseInt(p.value, 10);
  }

  const hour = parts['hour'] === 24 ? 0 : parts['hour'];
  const tzMs = Date.UTC(
    parts['year'],
    parts['month'] - 1,
    parts['day'],
    hour,
    parts['minute'],
    parts['second'],
  );

  const offsetMs = tzMs - probe.getTime();

  const result = new Date(probe.getTime() - offsetMs);
  if (endOfDay) result.setUTCMilliseconds(999);
  return result;
}

export async function parseReportDateRange(date_from?: string, date_to?: string) {
  let tz = FALLBACK_TZ;
  try {
    const settings = await prisma.settings.findUnique({
      where: { id: 'singleton' },
      select: { timezone: true },
    });
    if (settings?.timezone) {
      tz = settings.timezone;
    }
  } catch {
    // fallback to default
  }

  let fromDate: Date | undefined;
  let toDate: Date | undefined;

  if (date_from) {
    const cleanFrom = String(date_from).split('T')[0];
    fromDate = localDateToUtc(cleanFrom, tz, false);
  }
  if (date_to) {
    const cleanTo = String(date_to).split('T')[0];
    toDate = localDateToUtc(cleanTo, tz, true);
  }

  return { fromDate, toDate, tz };
}

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
          status: { in: ['Posted', 'Voided'] },
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
          account_id: acc.id,
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
  const { fromDate, toDate } = await parseReportDateRange(date_from, date_to);

  const entryDateFilter: Prisma.DateTimeFilter = {};
  if (fromDate) {
    entryDateFilter.gte = fromDate;
  }
  if (toDate) {
    entryDateFilter.lte = toDate;
  }

  // Exclude FiscalYearClosing entries because year-end closing entries net revenues/expenses to retained earnings for the balance sheet, but should not collapse the period P&L statement to zero.
  const lines = await prisma.journalLine.findMany({
    where: {
      journalEntry: {
        status: { in: ['Posted', 'Voided'] },
        source_type: { not: 'FiscalYearClosing' },
        entry_date: Object.keys(entryDateFilter).length > 0 ? entryDateFilter : undefined,
      },
      account: {
        account_type: { in: ['Revenue', 'Expense'] },
      },
    },
    include: {
      account: {
        include: {
          parent: {
            select: {
              id: true,
              account_code: true,
              name: true,
            },
          },
        },
      },
    },
  });

  type MapItem = {
    account_id: string;
    account_code: string;
    name: string;
    parent_id?: string | null;
    parent_code?: string | null;
    parent_name?: string | null;
    amount: Prisma.Decimal;
  };

  const revenueMap = new Map<string, MapItem>();
  const expenseMap = new Map<string, MapItem>();

  for (const line of lines) {
    const acc = line.account;
    const debit = new Prisma.Decimal(line.debit || 0);
    const credit = new Prisma.Decimal(line.credit || 0);

    if (acc.account_type === 'Revenue') {
      const current = revenueMap.get(acc.id) || {
        account_id: acc.id,
        account_code: acc.account_code,
        name: acc.name,
        parent_id: acc.parent?.id || null,
        parent_code: acc.parent?.account_code || null,
        parent_name: acc.parent?.name || null,
        amount: new Prisma.Decimal(0),
      };
      current.amount = current.amount.plus(credit.minus(debit));
      revenueMap.set(acc.id, current);
    } else if (acc.account_type === 'Expense') {
      const current = expenseMap.get(acc.id) || {
        account_id: acc.id,
        account_code: acc.account_code,
        name: acc.name,
        parent_id: acc.parent?.id || null,
        parent_code: acc.parent?.account_code || null,
        parent_name: acc.parent?.name || null,
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
        account_id: r.account_id,
        account_code: r.account_code,
        name: r.name,
        parent_id: r.parent_id || null,
        parent_code: r.parent_code || null,
        parent_name: r.parent_name || null,
        amount: r.amount.toNumber(),
      };
    })
    .sort((a, b) => a.account_code.localeCompare(b.account_code));

  let totalExpense = new Prisma.Decimal(0);
  const expenses = Array.from(expenseMap.values())
    .map((e) => {
      totalExpense = totalExpense.plus(e.amount);
      return {
        account_id: e.account_id,
        account_code: e.account_code,
        name: e.name,
        parent_id: e.parent_id || null,
        parent_code: e.parent_code || null,
        parent_name: e.parent_name || null,
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

    const { fromDate, toDate } = await parseReportDateRange(
      date_from ? String(date_from) : undefined,
      date_to ? String(date_to) : undefined,
    );

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
          status: { in: ['Posted', 'Voided'] },
          entry_date: Object.keys(entryDateFilter).length > 0 ? entryDateFilter : undefined,
        },
        account: {
          cash_flow_category: { in: ['Operating', 'Investing', 'Financing'] },
        },
      },
      include: { account: true },
    });

    const operatingItems: { account_id?: string; account_code: string; name: string; amount: number }[] = [];
    const investingItems: { account_id?: string; account_code: string; name: string; amount: number }[] = [];
    const financingItems: { account_id?: string; account_code: string; name: string; amount: number }[] = [];

    const operatingMap = new Map<string, { account_id: string; account_code: string; name: string; amount: Prisma.Decimal }>();
    const investingMap = new Map<string, { account_id: string; account_code: string; name: string; amount: Prisma.Decimal }>();
    const financingMap = new Map<string, { account_id: string; account_code: string; name: string; amount: Prisma.Decimal }>();

    for (const l of lines) {
      const acc = l.account;
      const debit = new Prisma.Decimal(l.debit || 0);
      const credit = new Prisma.Decimal(l.credit || 0);
      const netActivity = debit.minus(credit);

      if (acc.cash_flow_category === 'Operating') {
        const cur = operatingMap.get(acc.id) || { account_id: acc.id, account_code: acc.account_code, name: acc.name, amount: new Prisma.Decimal(0) };
        cur.amount = cur.amount.plus(netActivity);
        operatingMap.set(acc.id, cur);
      } else if (acc.cash_flow_category === 'Investing') {
        const cur = investingMap.get(acc.id) || { account_id: acc.id, account_code: acc.account_code, name: acc.name, amount: new Prisma.Decimal(0) };
        cur.amount = cur.amount.plus(netActivity);
        investingMap.set(acc.id, cur);
      } else if (acc.cash_flow_category === 'Financing') {
        const cur = financingMap.get(acc.id) || { account_id: acc.id, account_code: acc.account_code, name: acc.name, amount: new Prisma.Decimal(0) };
        cur.amount = cur.amount.plus(netActivity);
        financingMap.set(acc.id, cur);
      }
    }

    let operatingAdjTotal = 0;
    for (const v of operatingMap.values()) {
      const amt = v.amount.toNumber();
      operatingItems.push({ account_id: v.account_id, account_code: v.account_code, name: v.name, amount: amt });
      operatingAdjTotal += amt;
    }

    let investingTotal = 0;
    for (const v of investingMap.values()) {
      const amt = v.amount.toNumber();
      investingItems.push({ account_id: v.account_id, account_code: v.account_code, name: v.name, amount: amt });
      investingTotal += amt;
    }

    let financingTotal = 0;
    for (const v of financingMap.values()) {
      const amt = v.amount.toNumber();
      financingItems.push({ account_id: v.account_id, account_code: v.account_code, name: v.name, amount: amt });
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
            status: { in: ['Posted', 'Voided'] },
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
    const asOfStr = as_of ? String(as_of) : new Date().toISOString().slice(0, 10);
    const { toDate } = await parseReportDateRange(undefined, asOfStr);
    const finalAsOfDate = toDate || new Date();

    const assets: {
      account_id: string | null;
      account_code: string | null;
      name: string;
      parent_id?: string | null;
      parent_code?: string | null;
      parent_name?: string | null;
      is_bank_or_cash?: boolean;
      kind?: string;
      amount: number;
    }[] = [];

    const liabilities: {
      account_id: string | null;
      account_code: string | null;
      name: string;
      parent_id?: string | null;
      parent_code?: string | null;
      parent_name?: string | null;
      is_bank_or_cash?: boolean;
      kind?: string;
      amount: number;
    }[] = [];

    const equity: {
      account_id: string | null;
      account_code: string | null;
      name: string;
      parent_id?: string | null;
      parent_code?: string | null;
      parent_name?: string | null;
      is_bank_or_cash?: boolean;
      kind?: string;
      amount: number;
    }[] = [];

    let totalAssets = new Prisma.Decimal(0);
    let totalLiabilities = new Prisma.Decimal(0);
    let totalEquity = new Prisma.Decimal(0);
    let using_snapshot = false;

    const cleanAsOfDateStr = asOfStr.split('T')[0];
    const asOfMaxUtc = new Date(`${cleanAsOfDateStr}T23:59:59.999Z`);
    const queryLte = finalAsOfDate.getTime() > asOfMaxUtc.getTime() ? finalAsOfDate : asOfMaxUtc;

    // Check accounting periods ending on or before finalAsOfDate
    const periodsOnOrBefore = await prisma.accountingPeriod.findMany({
      where: {
        end_date: { lte: queryLte },
      },
      orderBy: { end_date: 'asc' },
      include: {
        _count: { select: { closingBalances: true } },
      },
    });
    const targetPeriod = periodsOnOrBefore.find((p) => {
      const pEndStr = p.end_date.toISOString().slice(0, 10);
      return pEndStr === cleanAsOfDateStr;
    });

    let matchedPeriod: typeof targetPeriod | undefined = undefined;

    if (targetPeriod && periodsOnOrBefore.length > 0) {
      const targetIndex = periodsOnOrBefore.findIndex((p) => p.id === targetPeriod.id);
      const relevantPeriods = periodsOnOrBefore.slice(0, targetIndex + 1);

      const allEligible = relevantPeriods.every(
        (p) => p.status === 'Closed' || p.status === 'Locked',
      );

      if (allEligible) {
        using_snapshot = true;
        matchedPeriod = targetPeriod;
      }
    }

    type AccountMapItem = {
      account_id: string;
      account_code: string;
      name: string;
      account_type: string;
      parent_id: string | null;
      parent_code: string | null;
      parent_name: string | null;
      is_bank_or_cash: boolean;
      amount: Prisma.Decimal;
    };

    const accountBalMap = new Map<string, AccountMapItem>();

    if (using_snapshot && matchedPeriod) {
      const closingBalances = await prisma.accountClosingBalance.findMany({
        where: {
          period: {
            status: { in: ['Closed', 'Locked'] },
            end_date: { lte: matchedPeriod.end_date },
          },
        },
        include: {
          account: {
            include: {
              parent: { select: { id: true, account_code: true, name: true } },
              bankAccount: { select: { id: true } },
            },
          },
        },
      });

      for (const cb of closingBalances) {
        const acc = cb.account;
        if (acc.account_type === 'Revenue' || acc.account_type === 'Expense') {
          continue;
        }

        const bal = new Prisma.Decimal(cb.closing_balance);
        const current = accountBalMap.get(acc.id) || {
          account_id: acc.id,
          account_code: acc.account_code,
          name: acc.name,
          account_type: acc.account_type,
          parent_id: acc.parent?.id || null,
          parent_code: acc.parent?.account_code || null,
          parent_name: acc.parent?.name || null,
          is_bank_or_cash: Boolean(acc.bankAccount),
          amount: new Prisma.Decimal(0),
        };
        current.amount = current.amount.plus(bal);
        accountBalMap.set(acc.id, current);
      }
    } else {
      const lines = await prisma.journalLine.findMany({
        where: {
          journalEntry: {
            status: { in: ['Posted', 'Voided'] },
            entry_date: { lte: finalAsOfDate },
          },
        },
        include: {
          account: {
            include: {
              parent: { select: { id: true, account_code: true, name: true } },
              bankAccount: { select: { id: true } },
            },
          },
        },
      });

      for (const line of lines) {
        const acc = line.account;
        if (acc.account_type === 'Revenue' || acc.account_type === 'Expense') {
          continue;
        }

        const debit = new Prisma.Decimal(line.debit || 0);
        const credit = new Prisma.Decimal(line.credit || 0);

        const current = accountBalMap.get(acc.id) || {
          account_id: acc.id,
          account_code: acc.account_code,
          name: acc.name,
          account_type: acc.account_type,
          parent_id: acc.parent?.id || null,
          parent_code: acc.parent?.account_code || null,
          parent_name: acc.parent?.name || null,
          is_bank_or_cash: Boolean(acc.bankAccount),
          amount: new Prisma.Decimal(0),
        };

        if (acc.account_type === 'Asset') {
          current.amount = current.amount.plus(debit.minus(credit));
        } else {
          current.amount = current.amount.plus(credit.minus(debit));
        }

        accountBalMap.set(acc.id, current);
      }
    }

    for (const val of accountBalMap.values()) {
      const item = {
        account_id: val.account_id,
        account_code: val.account_code,
        name: val.name,
        parent_id: val.parent_id,
        parent_code: val.parent_code,
        parent_name: val.parent_name,
        is_bank_or_cash: val.is_bank_or_cash,
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

    // Earnings split:
    // 1. current_year_earnings = P&L net from 1 Jan of the as_of year to as_of
    const asOfYear = finalAsOfDate.getFullYear();
    const startOfYearStr = `${asOfYear}-01-01`;
    const currentYearPnl = await calculateProfitAndLossData(startOfYearStr, cleanAsOfDateStr);
    const currentYearEarnings = currentYearPnl.net_profit;

    // 2. unclosed_prior_earnings = total cumulative unclosed net income up to as_of - current_year_earnings
    const totalCumulativePnl = await calculateProfitAndLossData(undefined, cleanAsOfDateStr);
    const totalCumulativeNetIncome = totalCumulativePnl.net_profit;
    const unclosedPriorEarnings = totalCumulativeNetIncome - currentYearEarnings;

    if (Math.abs(unclosedPriorEarnings) > 0.0001) {
      equity.push({
        account_id: null,
        account_code: null,
        name: 'Retained Earnings (Unclosed Prior Years)',
        parent_id: null,
        parent_code: null,
        parent_name: null,
        is_bank_or_cash: false,
        kind: 'unclosed_prior_earnings',
        amount: unclosedPriorEarnings,
      });
      totalEquity = totalEquity.plus(unclosedPriorEarnings);
    }

    if (Math.abs(currentYearEarnings) > 0.0001) {
      equity.push({
        account_id: null,
        account_code: null,
        name: 'Current Year Earnings',
        parent_id: null,
        parent_code: null,
        parent_name: null,
        is_bank_or_cash: false,
        kind: 'current_year_earnings',
        amount: currentYearEarnings,
      });
      totalEquity = totalEquity.plus(currentYearEarnings);
    }

    assets.sort((a, b) => (a.account_code || '').localeCompare(b.account_code || ''));
    liabilities.sort((a, b) => (a.account_code || '').localeCompare(b.account_code || ''));
    equity.sort((a, b) => (a.account_code || '').localeCompare(b.account_code || ''));

    const is_balanced = totalAssets.equals(totalLiabilities.plus(totalEquity));

    res.json({
      success: true,
      data: {
        as_of: finalAsOfDate.toISOString(),
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
    const {
      account_id,
      date_from,
      date_to,
      page: pageQuery,
      per_page: perPageQuery,
      source_type,
      search,
      side,
      min_amount,
      max_amount,
    } = req.query;

    const page = Math.max(1, parseInt(String(pageQuery || '1'), 10) || 1);
    const per_page = Math.max(1, parseInt(String(perPageQuery || '100'), 10) || 100);

    if (!account_id) {
      return res.json({
        success: true,
        data: {
          account: null,
          opening_balance: 0,
          opening_balance_side: 'Dr',
          page_opening_balance: 0,
          page_opening_signed_balance: 0,
          lines: [],
          closing_balance: 0,
          closing_balance_side: 'Dr',
          total_debit: 0,
          total_credit: 0,
          count: 0,
          pagination: {
            page,
            per_page,
            total: 0,
            total_pages: 0,
          },
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
      include: {
        parent: { select: { id: true, account_code: true, name: true } },
      },
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'Account not found',
      });
    }

    const isDebitNormal = account.account_type === 'Asset' || account.account_type === 'Expense';

    const { fromDate, toDate } = await parseReportDateRange(
      date_from ? String(date_from) : undefined,
      date_to ? String(date_to) : undefined,
    );

    let openingNet = new Prisma.Decimal(0);

    if (fromDate) {
      const priorLines = await prisma.journalLine.findMany({
        where: {
          accountId: account.id,
          journalEntry: {
            status: { in: ['Posted', 'Voided'] },
            entry_date: { lt: fromDate },
          },
        },
      });

      for (const line of priorLines) {
        const debit = new Prisma.Decimal(line.debit || 0);
        const credit = new Prisma.Decimal(line.credit || 0);
        openingNet = openingNet.plus(debit.minus(credit));
      }
    }

    const entryDateFilter: Prisma.DateTimeFilter = {};
    if (fromDate) entryDateFilter.gte = fromDate;
    if (toDate) entryDateFilter.lte = toDate;

    const rawLines = await prisma.journalLine.findMany({
      where: {
        accountId: account.id,
        journalEntry: {
          status: { in: ['Posted', 'Voided'] },
          entry_date: Object.keys(entryDateFilter).length > 0 ? entryDateFilter : undefined,
        },
      },
      include: {
        journalEntry: {
          select: {
            id: true,
            ref_id: true,
            entry_date: true,
            memo: true,
            status: true,
            source_type: true,
            source_id: true,
            reversalOfId: true,
            reversedBy: { select: { id: true } },
          },
        },
      },
      orderBy: [
        { journalEntry: { entry_date: 'asc' } },
        { journalEntry: { createdAt: 'asc' } },
        { id: 'asc' },
      ],
    });

    // In-memory filter parameters:
    const sourceTypes = source_type
      ? String(source_type)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : null;

    const sideFilter = side ? String(side).toLowerCase() : null;
    const minAmt = min_amount ? parseFloat(String(min_amount)) : null;
    const maxAmt = max_amount ? parseFloat(String(max_amount)) : null;
    const searchFilter = search ? String(search).trim().toLowerCase() : null;

    const filteredLines = rawLines.filter((line) => {
      const lineDebit = Number(line.debit || 0);
      const lineCredit = Number(line.credit || 0);
      const lineAmount = lineDebit > 0 ? lineDebit : lineCredit;

      if (sourceTypes && sourceTypes.length > 0) {
        if (!line.journalEntry.source_type || !sourceTypes.includes(line.journalEntry.source_type)) {
          return false;
        }
      }

      if (sideFilter === 'debit' && lineDebit <= 0) return false;
      if (sideFilter === 'credit' && lineCredit <= 0) return false;

      if (minAmt !== null && !isNaN(minAmt) && lineAmount < minAmt) return false;
      if (maxAmt !== null && !isNaN(maxAmt) && lineAmount > maxAmt) return false;

      if (searchFilter) {
        const refMatch = line.journalEntry.ref_id?.toLowerCase().includes(searchFilter);
        const memoMatch = line.journalEntry.memo?.toLowerCase().includes(searchFilter);
        const descMatch = line.description?.toLowerCase().includes(searchFilter);
        if (!refMatch && !memoMatch && !descMatch) {
          return false;
        }
      }

      return true;
    });

    const total_debit = filteredLines.reduce((sum, l) => sum + Number(l.debit || 0), 0);
    const total_credit = filteredLines.reduce((sum, l) => sum + Number(l.credit || 0), 0);
    const count = filteredLines.length;

    const total_pages = Math.ceil(count / per_page) || (count === 0 ? 0 : 1);
    const startIndex = (page - 1) * per_page;
    const pageLines = filteredLines.slice(startIndex, startIndex + per_page);

    // Compute page opening balance
    let pageOpeningNet = openingNet;
    for (let i = 0; i < startIndex && i < filteredLines.length; i++) {
      const l = filteredLines[i];
      pageOpeningNet = pageOpeningNet.plus(new Prisma.Decimal(l.debit || 0).minus(l.credit || 0));
    }

    // Contra resolution batched in 1 query per page
    const pageEntryIds = Array.from(new Set(pageLines.map((l) => l.journalEntryId)));
    const contraLinesRaw =
      pageEntryIds.length > 0
        ? await prisma.journalLine.findMany({
            where: { journalEntryId: { in: pageEntryIds } },
            include: {
              account: {
                select: { id: true, account_code: true, name: true },
              },
            },
          })
        : [];

    const contraMap = new Map<string, typeof contraLinesRaw>();
    for (const cl of contraLinesRaw) {
      const existing = contraMap.get(cl.journalEntryId) || [];
      existing.push(cl);
      contraMap.set(cl.journalEntryId, existing);
    }

    let currentNet = pageOpeningNet;
    const formattedLines = pageLines.map((line) => {
      const debit = Number(line.debit || 0);
      const credit = Number(line.credit || 0);
      currentNet = currentNet.plus(debit - credit);

      const jeLines = contraMap.get(line.journalEntryId) || [];
      // Opposite side lines
      let oppositeLines = jeLines.filter((cl) => {
        if (cl.id === line.id) return false;
        if (debit > 0) return Number(cl.credit || 0) > 0;
        if (credit > 0) return Number(cl.debit || 0) > 0;
        return true;
      });
      if (oppositeLines.length === 0) {
        oppositeLines = jeLines.filter((cl) => cl.id !== line.id);
      }

      const contra = oppositeLines.map((cl) => ({
        account_id: cl.account.id,
        account_code: cl.account.account_code,
        name: cl.account.name,
        amount: Number(cl.credit || 0) > 0 ? Number(cl.credit) : Number(cl.debit || 0),
      }));

      const runningBal = isDebitNormal ? currentNet.toNumber() : currentNet.negated().toNumber();
      const signedVal = currentNet.toNumber();
      const balanceSide = signedVal >= 0 ? 'Dr' : 'Cr';

      return {
        line_id: line.id,
        journal_entry_id: line.journalEntryId,
        journal_entry_status: line.journalEntry.status as 'Posted' | 'Voided',
        reversal_of_id: line.journalEntry.reversalOfId || null,
        reversed_by_id: line.journalEntry.reversedBy?.id || null,
        entry_date: line.journalEntry.entry_date.toISOString(),
        ref_id: line.journalEntry.ref_id,
        memo: line.journalEntry.memo || null,
        description: line.description || null,
        source_type: line.journalEntry.source_type || null,
        source_id: line.journalEntry.source_id || null,
        debit,
        credit,
        running_balance: runningBal,
        signed_balance: Math.abs(signedVal),
        balance_side: balanceSide,
        contra,
      };
    });

    const openingBal = isDebitNormal ? openingNet.toNumber() : openingNet.negated().toNumber();
    const openingSide = openingNet.toNumber() >= 0 ? 'Dr' : 'Cr';
    const pageOpeningBal = isDebitNormal ? pageOpeningNet.toNumber() : pageOpeningNet.negated().toNumber();
    const pageOpeningSigned = pageOpeningNet.toNumber();

    // Range closing balance
    const closingNet = openingNet.plus(total_debit - total_credit);
    const closingBal = isDebitNormal ? closingNet.toNumber() : closingNet.negated().toNumber();
    const closingSide = closingNet.toNumber() >= 0 ? 'Dr' : 'Cr';

    res.json({
      success: true,
      data: {
        account: {
          id: account.id,
          account_code: account.account_code,
          name: account.name,
          account_type: account.account_type,
          parent_id: account.parent?.id || null,
          parent_code: account.parent?.account_code || null,
          parent_name: account.parent?.name || null,
        },
        opening_balance: openingBal,
        opening_balance_side: openingSide,
        page_opening_balance: pageOpeningBal,
        page_opening_signed_balance: pageOpeningSigned,
        lines: formattedLines,
        closing_balance: closingBal,
        closing_balance_side: closingSide,
        total_debit,
        total_credit,
        count,
        pagination: {
          page,
          per_page,
          total: count,
          total_pages,
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getGeneralLedgerSummary = async (req: Request, res: Response) => {
  try {
    const { date_from, date_to, include_zero } = req.query;
    const includeZero = include_zero === 'true';

    const { fromDate, toDate } = await parseReportDateRange(
      date_from ? String(date_from) : undefined,
      date_to ? String(date_to) : undefined,
    );

    const accounts = await prisma.account.findMany({
      where: { is_postable: true },
      include: {
        parent: {
          select: { id: true, account_code: true, name: true },
        },
      },
      orderBy: { account_code: 'asc' },
    });

    let priorAgg: Record<string, { debit: number; credit: number }> = {};
    if (fromDate) {
      const priorLinesGroup = await prisma.journalLine.groupBy({
        by: ['accountId'],
        where: {
          journalEntry: {
            status: { in: ['Posted', 'Voided'] },
            entry_date: { lt: fromDate },
          },
        },
        _sum: { debit: true, credit: true },
      });
      priorLinesGroup.forEach((g) => {
        priorAgg[g.accountId] = {
          debit: Number(g._sum.debit || 0),
          credit: Number(g._sum.credit || 0),
        };
      });
    }

    const entryDateFilter: Prisma.DateTimeFilter = {};
    if (fromDate) entryDateFilter.gte = fromDate;
    if (toDate) entryDateFilter.lte = toDate;

    const periodLinesGroup = await prisma.journalLine.groupBy({
      by: ['accountId'],
      where: {
        journalEntry: {
          status: { in: ['Posted', 'Voided'] },
          entry_date: Object.keys(entryDateFilter).length > 0 ? entryDateFilter : undefined,
        },
      },
      _sum: { debit: true, credit: true },
      _count: { id: true },
    });

    const periodAgg: Record<string, { debit: number; credit: number; count: number }> = {};
    periodLinesGroup.forEach((g) => {
      periodAgg[g.accountId] = {
        debit: Number(g._sum.debit || 0),
        credit: Number(g._sum.credit || 0),
        count: g._count.id || 0,
      };
    });

    let totalPeriodDebit = 0;
    let totalPeriodCredit = 0;

    const items = accounts
      .map((acc) => {
        const prior = priorAgg[acc.id] || { debit: 0, credit: 0 };
        const period = periodAgg[acc.id] || { debit: 0, credit: 0, count: 0 };

        const openingNet = prior.debit - prior.credit;
        const periodDebit = period.debit;
        const periodCredit = period.credit;
        const closingNet = openingNet + periodDebit - periodCredit;

        totalPeriodDebit += periodDebit;
        totalPeriodCredit += periodCredit;

        return {
          account_id: acc.id,
          code: acc.account_code,
          name: acc.name,
          type: acc.account_type as any,
          parent_id: acc.parent?.id || null,
          parent_code: acc.parent?.account_code || null,
          parent_name: acc.parent?.name || null,
          opening: {
            signed: Math.abs(openingNet),
            side: (openingNet >= 0 ? 'Dr' : 'Cr') as 'Dr' | 'Cr',
            net: openingNet,
          },
          period_debit: periodDebit,
          period_credit: periodCredit,
          closing: {
            signed: Math.abs(closingNet),
            side: (closingNet >= 0 ? 'Dr' : 'Cr') as 'Dr' | 'Cr',
            net: closingNet,
          },
          line_count: period.count,
        };
      })
      .filter((item) => {
        if (includeZero) return true;
        return (
          item.opening.net !== 0 ||
          item.period_debit !== 0 ||
          item.period_credit !== 0 ||
          item.closing.net !== 0
        );
      });

    const is_balanced = Math.abs(totalPeriodDebit - totalPeriodCredit) < 0.0001;

    res.json({
      success: true,
      data: {
        items,
        total_debit: totalPeriodDebit,
        total_credit: totalPeriodCredit,
        is_balanced,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getGeneralLedgerMonthly = async (req: Request, res: Response) => {
  try {
    const { account_id, date_from, date_to } = req.query;

    if (!account_id) {
      return res.json({
        success: true,
        data: {
          account_id: '',
          items: [],
          total_debit: 0,
          total_credit: 0,
        },
      });
    }

    const { fromDate, toDate, tz } = await parseReportDateRange(
      date_from ? String(date_from) : undefined,
      date_to ? String(date_to) : undefined,
    );

    const accountIdStr = String(account_id);
    const account = await prisma.account.findUnique({
      where: { id: accountIdStr },
    });

    if (!account) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }

    // Build list of YYYY-MM months spanning date_from..date_to
    let startY = fromDate ? fromDate.getUTCFullYear() : new Date().getFullYear();
    let startM = fromDate ? fromDate.getUTCMonth() : 0;
    let endY = toDate ? toDate.getUTCFullYear() : new Date().getFullYear();
    let endM = toDate ? toDate.getUTCMonth() : 11;

    if (date_from) {
      const parts = String(date_from).split('T')[0].split('-').map(Number);
      if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        startY = parts[0];
        startM = parts[1] - 1;
      }
    }

    if (date_to) {
      const parts = String(date_to).split('T')[0].split('-').map(Number);
      if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        endY = parts[0];
        endM = parts[1] - 1;
      }
    }

    const months: string[] = [];
    let curY = startY;
    let curM = startM;

    while (curY < endY || (curY === endY && curM <= endM)) {
      const monthStr = String(curM + 1).padStart(2, '0');
      months.push(`${curY}-${monthStr}`);
      curM++;
      if (curM > 11) {
        curM = 0;
        curY++;
      }
    }

    // Opening balance net prior to fromDate
    let openingNet = 0;
    if (fromDate) {
      const priorLines = await prisma.journalLine.aggregate({
        where: {
          accountId: account.id,
          journalEntry: {
            status: { in: ['Posted', 'Voided'] },
            entry_date: { lt: fromDate },
          },
        },
        _sum: { debit: true, credit: true },
      });
      openingNet = Number(priorLines._sum.debit || 0) - Number(priorLines._sum.credit || 0);
    }

    let runningNet = openingNet;
    let grandTotalDebit = 0;
    let grandTotalCredit = 0;

    const items = [];
    for (const mStr of months) {
      const [y, m] = mStr.split('-').map(Number);
      const mFrom = localDateToUtc(`${mStr}-01`, tz, false);
      const lastDay = new Date(y, m, 0).getDate();
      const mTo = localDateToUtc(`${mStr}-${String(lastDay).padStart(2, '0')}`, tz, true);

      const agg = await prisma.journalLine.aggregate({
        where: {
          accountId: account.id,
          journalEntry: {
            status: { in: ['Posted', 'Voided'] },
            entry_date: { gte: mFrom, lte: mTo },
          },
        },
        _sum: { debit: true, credit: true },
        _count: { id: true },
      });

      const mDebit = Number(agg._sum.debit || 0);
      const mCredit = Number(agg._sum.credit || 0);
      const mCount = agg._count.id || 0;

      runningNet += mDebit - mCredit;
      grandTotalDebit += mDebit;
      grandTotalCredit += mCredit;

      items.push({
        month: mStr,
        debit: mDebit,
        credit: mCredit,
        closing: {
          signed: Math.abs(runningNet),
          side: (runningNet >= 0 ? 'Dr' : 'Cr') as 'Dr' | 'Cr',
          net: runningNet,
        },
        count: mCount,
      });
    }

    res.json({
      success: true,
      data: {
        account_id: account.id,
        items,
        total_debit: grandTotalDebit,
        total_credit: grandTotalCredit,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};



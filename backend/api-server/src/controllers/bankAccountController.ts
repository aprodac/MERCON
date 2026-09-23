import { Request, Response } from 'express';
import { prisma } from '../db';
import { transferFunds } from '../utils/cashBankEngine';
import { AccountingError } from '../utils/accountingEngine';

/**
 * Enriches bank account records with:
 * - ledger_balance = sum(debit - credit) in Posted/Voided entries
 * - book_balance = opening_balance + ledger_balance
 * - month_in / month_out = sum debit / credit in current calendar month
 * - last_reconciled_at / last_reconciled_balance = latest Completed reconciliation
 * - unreconciled_count = count of unreconciled lines dated up to today
 * - balance_series = weekly closing book_balance for last 13 weeks
 */
export async function enrichBankAccountsBatch(accounts: any[]) {
  if (!accounts || accounts.length === 0) return [];

  const accountIds = accounts.map((a) => a.accountId).filter(Boolean);
  const bankAccountIds = accounts.map((a) => a.id);

  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
  const endOfToday = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999));

  // 1. Fetch all posted & voided journal lines for these accounts
  const lines = await prisma.journalLine.findMany({
    where: {
      accountId: { in: accountIds },
      journalEntry: {
        status: { in: ['Posted', 'Voided'] },
      },
    },
    select: {
      accountId: true,
      debit: true,
      credit: true,
      reconciled: true,
      journalEntry: {
        select: {
          status: true,
          entry_date: true,
        },
      },
    },
  });

  // 2. Fetch completed reconciliations
  const reconciliations = await prisma.bankReconciliation.findMany({
    where: {
      bankAccountId: { in: bankAccountIds },
      status: 'Completed',
    },
    orderBy: { statement_date: 'desc' },
  });

  const lastRecMap = new Map<string, { date: string; balance: number }>();
  for (const r of reconciliations) {
    if (!lastRecMap.has(r.bankAccountId)) {
      lastRecMap.set(r.bankAccountId, {
        date: r.statement_date.toISOString().split('T')[0],
        balance: Number(r.statement_closing_balance),
      });
    }
  }

  // Pre-calculate 13 weekly points ending today
  const weekDates: Date[] = [];
  for (let i = 12; i >= 0; i--) {
    const d = new Date(endOfToday);
    d.setDate(d.getDate() - i * 7);
    weekDates.push(d);
  }

  // Group lines by accountId
  const linesByAccount = new Map<string, typeof lines>();
  for (const l of lines) {
    const list = linesByAccount.get(l.accountId) || [];
    list.push(l);
    linesByAccount.set(l.accountId, list);
  }

  return accounts.map((ba) => {
    const accLines = linesByAccount.get(ba.accountId) || [];
    const opening = Number(ba.opening_balance || 0);

    let ledgerBalance = 0;
    let monthIn = 0;
    let monthOut = 0;
    let unreconciledCount = 0;

    for (const l of accLines) {
      const d = Number(l.debit || 0);
      const c = Number(l.credit || 0);
      ledgerBalance += d - c;

      const entryDate = new Date(l.journalEntry.entry_date);
      if (entryDate >= startOfMonth && entryDate <= endOfToday) {
        monthIn += d;
        monthOut += c;
      }

      if (!l.reconciled && l.journalEntry.status === 'Posted' && entryDate <= endOfToday) {
        unreconciledCount++;
      }
    }

    const bookBalance = opening + ledgerBalance;

    // Build 13 week sparkline points
    const balance_series = weekDates.map((wDate) => {
      let sumAtW = 0;
      for (const l of accLines) {
        const entryDate = new Date(l.journalEntry.entry_date);
        if (entryDate <= wDate) {
          sumAtW += Number(l.debit || 0) - Number(l.credit || 0);
        }
      }
      return {
        date: wDate.toISOString().split('T')[0],
        balance: Number((opening + sumAtW).toFixed(2)),
      };
    });

    const lastRec = lastRecMap.get(ba.id);

    return {
      ...ba,
      opening_balance: opening,
      ledger_balance: Number(ledgerBalance.toFixed(2)),
      book_balance: Number(bookBalance.toFixed(2)),
      month_in: Number(monthIn.toFixed(2)),
      month_out: Number(monthOut.toFixed(2)),
      last_reconciled_at: lastRec ? lastRec.date : null,
      last_reconciled_balance: lastRec ? lastRec.balance : null,
      unreconciled_count: unreconciledCount,
      balance_series,
    };
  });
}

export const listBankAccounts = async (req: Request, res: Response) => {
  try {
    const accounts = await prisma.bankAccount.findMany({
      where: {
        deletedAt: null,
      },
      include: {
        account: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const enriched = await enrichBankAccountsBatch(accounts);
    res.json({ success: true, data: enriched });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getBankAccountById = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const account = await prisma.bankAccount.findUnique({
      where: { id },
      include: {
        account: true,
        reconciliations: {
          orderBy: { statement_date: 'desc' },
          take: 10,
        },
      },
    });

    if (!account || account.deletedAt !== null) {
      return res.status(404).json({ success: false, error: 'Bank account not found' });
    }

    const [enriched] = await enrichBankAccountsBatch([account]);
    return res.json({ success: true, data: enriched });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getBankAccountTransactions = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const bankAccount = await prisma.bankAccount.findUnique({
      where: { id },
      include: { account: true },
    });

    if (!bankAccount || bankAccount.deletedAt !== null) {
      return res.status(404).json({ success: false, error: 'Bank account not found' });
    }

    const { date_from, date_to, direction, reconciled, search } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const per_page = Math.max(1, Number(req.query.per_page) || 20);

    const fromDate = date_from ? new Date(String(date_from)) : null;
    const toDate = date_to ? new Date(String(date_to) + 'T23:59:59.999Z') : null;

    // 1. Calculate opening balance just before date_from
    const opening = Number(bankAccount.opening_balance || 0);
    let rangeOpeningBalance = opening;

    if (fromDate) {
      const priorLines = await prisma.journalLine.aggregate({
        where: {
          accountId: bankAccount.accountId,
          journalEntry: {
            status: { in: ['Posted', 'Voided'] },
            entry_date: { lt: fromDate },
          },
        },
        _sum: { debit: true, credit: true },
      });
      const priorNet = Number(priorLines._sum.debit || 0) - Number(priorLines._sum.credit || 0);
      rangeOpeningBalance = opening + priorNet;
    }

    // 2. Query matching journal lines in chronological order
    const whereClause: any = {
      accountId: bankAccount.accountId,
      journalEntry: {
        status: { in: ['Posted', 'Voided'] },
      },
    };

    if (fromDate || toDate) {
      whereClause.journalEntry.entry_date = {};
      if (fromDate) whereClause.journalEntry.entry_date.gte = fromDate;
      if (toDate) whereClause.journalEntry.entry_date.lte = toDate;
    }

    if (reconciled === 'true') whereClause.reconciled = true;
    if (reconciled === 'false') whereClause.reconciled = false;

    if (direction === 'in') whereClause.debit = { gt: 0 };
    if (direction === 'out') whereClause.credit = { gt: 0 };

    if (search) {
      const q = String(search).trim();
      whereClause.OR = [
        { description: { contains: q, mode: 'insensitive' } },
        { journalEntry: { ref_id: { contains: q, mode: 'insensitive' } } },
        { journalEntry: { memo: { contains: q, mode: 'insensitive' } } },
        { journalEntry: { source_type: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const lines = await prisma.journalLine.findMany({
      where: whereClause,
      include: {
        journalEntry: true,
      },
      orderBy: [
        { journalEntry: { entry_date: 'asc' } },
        { createdAt: 'asc' },
      ],
    });

    // 3. Calculate running balance chronologically
    let currentBalance = rangeOpeningBalance;
    const allRows = lines.map((line) => {
      const d = Number(line.debit || 0);
      const c = Number(line.credit || 0);
      currentBalance = Number((currentBalance + d - c).toFixed(2));

      return {
        line_id: line.id,
        date: line.journalEntry.entry_date.toISOString().split('T')[0],
        journal_entry: {
          id: line.journalEntry.id,
          ref_id: line.journalEntry.ref_id,
          source_type: line.journalEntry.source_type,
          source_id: line.journalEntry.source_id,
          memo: line.journalEntry.memo,
          status: line.journalEntry.status,
        },
        description: line.description || line.journalEntry.memo,
        money_in: d,
        money_out: c,
        running_balance: currentBalance,
        reconciled: line.reconciled,
        reconciliation_id: line.reconciliationId,
      };
    });

    const rangeClosingBalance = currentBalance;
    const total = allRows.length;
    const total_pages = Math.ceil(total / per_page) || 1;

    // Display newest first while preserving calculated running_balance continuity
    const displayRows = [...allRows].reverse();
    const paginatedRows = displayRows.slice((page - 1) * per_page, page * per_page);

    return res.json({
      success: true,
      data: {
        opening_balance: Number(rangeOpeningBalance.toFixed(2)),
        closing_balance: Number(rangeClosingBalance.toFixed(2)),
        rows: paginatedRows,
        pagination: {
          page,
          per_page,
          total,
          total_pages,
        },
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getBankAccountBalanceHistory = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const bankAccount = await prisma.bankAccount.findUnique({
      where: { id },
    });

    if (!bankAccount || bankAccount.deletedAt !== null) {
      return res.status(404).json({ success: false, error: 'Bank account not found' });
    }

    const days = Math.min(365, Math.max(7, Number(req.query.days) || 90));
    const now = new Date();
    const startDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - days));
    const endDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999));

    // 1. Initial balance at start_date
    const opening = Number(bankAccount.opening_balance || 0);
    const priorLines = await prisma.journalLine.aggregate({
      where: {
        accountId: bankAccount.accountId,
        journalEntry: {
          status: { in: ['Posted', 'Voided'] },
          entry_date: { lt: startDate },
        },
      },
      _sum: { debit: true, credit: true },
    });
    const initialNet = Number(priorLines._sum.debit || 0) - Number(priorLines._sum.credit || 0);
    let runningBalance = opening + initialNet;

    // 2. Fetch lines between startDate and endDate
    const lines = await prisma.journalLine.findMany({
      where: {
        accountId: bankAccount.accountId,
        journalEntry: {
          status: { in: ['Posted', 'Voided'] },
          entry_date: { gte: startDate, lte: endDate },
        },
      },
      select: {
        debit: true,
        credit: true,
        journalEntry: {
          select: { entry_date: true },
        },
      },
    });

    const moveMap = new Map<string, { in: number; out: number }>();
    for (const l of lines) {
      const dateStr = l.journalEntry.entry_date.toISOString().split('T')[0];
      const curr = moveMap.get(dateStr) || { in: 0, out: 0 };
      curr.in += Number(l.debit || 0);
      curr.out += Number(l.credit || 0);
      moveMap.set(dateStr, curr);
    }

    const history: Array<{ date: string; balance: number; money_in: number; money_out: number }> = [];
    const curDate = new Date(startDate);
    while (curDate <= endDate) {
      const dateStr = curDate.toISOString().split('T')[0];
      const move = moveMap.get(dateStr) || { in: 0, out: 0 };
      runningBalance = runningBalance + move.in - move.out;

      history.push({
        date: dateStr,
        balance: Number(runningBalance.toFixed(2)),
        money_in: Number(move.in.toFixed(2)),
        money_out: Number(move.out.toFixed(2)),
      });

      curDate.setDate(curDate.getDate() + 1);
    }

    return res.json({ success: true, data: history });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const createBankAccount = async (req: Request, res: Response) => {
  try {
    const {
      accountId,
      bank_name,
      account_number,
      iban,
      swift_code,
      is_cash,
      opening_balance,
      opening_date,
      currency,
    } = req.body;

    if (!accountId) {
      return res.status(400).json({ success: false, error: 'accountId is required' });
    }

    // Verify linked GL account exists
    const glAccount = await prisma.account.findUnique({ where: { id: accountId } });
    if (!glAccount || !glAccount.isActive || glAccount.deletedAt !== null) {
      return res.status(400).json({ success: false, error: 'Linked GL account is inactive or not found' });
    }

    const userId = (req as any).user?.id;

    const bankAccount = await prisma.bankAccount.create({
      data: {
        accountId,
        bank_name: is_cash ? null : bank_name || null,
        account_number: is_cash ? null : account_number || null,
        iban: is_cash ? null : iban || null,
        swift_code: is_cash ? null : swift_code || null,
        is_cash: Boolean(is_cash),
        opening_balance: opening_balance || 0,
        opening_date: opening_date ? new Date(opening_date) : null,
        currency: currency || 'SAR',
        created_by: userId || null,
      },
      include: {
        account: true,
      },
    });

    const [enriched] = await enrichBankAccountsBatch([bankAccount]);
    res.status(201).json({ success: true, data: enriched });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ success: false, error: 'A BankAccount is already linked to this GL account' });
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateBankAccount = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const {
      bank_name,
      account_number,
      iban,
      swift_code,
      is_cash,
      opening_balance,
      opening_date,
      currency,
      isActive,
    } = req.body;

    const userId = (req as any).user?.id;

    const existing = await prisma.bankAccount.findUnique({ where: { id } });
    if (!existing || existing.deletedAt !== null) {
      return res.status(404).json({ success: false, error: 'Bank account not found' });
    }

    const updated = await prisma.bankAccount.update({
      where: { id },
      data: {
        bank_name: is_cash !== undefined ? (is_cash ? null : bank_name) : bank_name,
        account_number: is_cash !== undefined ? (is_cash ? null : account_number) : account_number,
        iban: is_cash !== undefined ? (is_cash ? null : iban) : iban,
        swift_code: is_cash !== undefined ? (is_cash ? null : swift_code) : swift_code,
        is_cash: is_cash !== undefined ? Boolean(is_cash) : undefined,
        opening_balance: opening_balance !== undefined ? opening_balance : undefined,
        opening_date: opening_date !== undefined ? (opening_date ? new Date(opening_date) : null) : undefined,
        currency: currency || undefined,
        isActive: isActive !== undefined ? Boolean(isActive) : undefined,
        updated_by: userId || null,
      },
      include: {
        account: true,
      },
    });

    const [enriched] = await enrichBankAccountsBatch([updated]);
    res.json({ success: true, data: enriched });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const transferFundsHandler = async (req: Request, res: Response) => {
  try {
    const { fromAccountId, toAccountId, amount, date, memo } = req.body;
    const userId = (req as any).user?.id;

    if (!fromAccountId || !toAccountId || !amount || !date) {
      return res.status(400).json({
        success: false,
        error: 'fromAccountId, toAccountId, amount, and date are required',
      });
    }

    const result = await transferFunds(fromAccountId, toAccountId, amount, date, memo, userId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    if (error instanceof AccountingError) {
      return res.status(error.statusCode).json({ success: false, error: error.message, code: error.code });
    }
    res.status(500).json({ success: false, error: error.message });
  }
};


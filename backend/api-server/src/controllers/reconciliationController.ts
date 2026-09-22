import { Request, Response } from 'express';
import { prisma } from '../db';
import { reconcileBankAccount } from '../utils/cashBankEngine';
import { AccountingError } from '../utils/accountingEngine';

export const reconcileBankAccountHandler = async (req: Request, res: Response) => {
  try {
    const { bankAccountId, statement_date, statement_closing_balance, journalLineIds } = req.body;
    const userId = (req as any).user?.id;

    if (!bankAccountId || !statement_date || statement_closing_balance === undefined || !journalLineIds) {
      return res.status(400).json({
        success: false,
        error: 'bankAccountId, statement_date, statement_closing_balance, and journalLineIds are required',
      });
    }

    const reconciliation = await reconcileBankAccount(
      bankAccountId,
      statement_date,
      statement_closing_balance,
      journalLineIds,
      userId,
    );

    res.status(201).json({ success: true, data: reconciliation });
  } catch (error: any) {
    if (error instanceof AccountingError) {
      return res.status(error.statusCode).json({ success: false, error: error.message, code: error.code });
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

export const listReconciliations = async (req: Request, res: Response) => {
  try {
    const bankAccountId = typeof req.query.bankAccountId === 'string' ? req.query.bankAccountId : undefined;

    const reconciliations = await prisma.bankReconciliation.findMany({
      where: {
        bankAccountId: bankAccountId || undefined,
      },
      include: {
        bankAccount: { include: { account: true } },
        _count: { select: { lines: true } },
      },
      orderBy: {
        statement_date: 'desc',
      },
    });

    res.json({ success: true, data: reconciliations });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getReconciliationById = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);

    const reconciliation = await prisma.bankReconciliation.findUnique({
      where: { id },
      include: {
        bankAccount: { include: { account: true } },
        lines: { include: { account: true } },
      },
    });

    if (!reconciliation) {
      return res.status(404).json({ success: false, error: 'Bank reconciliation record not found' });
    }

    res.json({ success: true, data: reconciliation });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

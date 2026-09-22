import { Request, Response } from 'express';
import { prisma } from '../db';
import { transferFunds } from '../utils/cashBankEngine';
import { AccountingError } from '../utils/accountingEngine';

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

    res.json({ success: true, data: accounts });
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
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!account || account.deletedAt !== null) {
      return res.status(404).json({ success: false, error: 'Bank account not found' });
    }

    return res.json({ success: true, data: account });
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

    res.status(201).json({ success: true, data: bankAccount });
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

    res.json({ success: true, data: updated });
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

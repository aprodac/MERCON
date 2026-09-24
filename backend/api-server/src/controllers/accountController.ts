import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { logger } from '../utils/logger';

const createAccountSchema = z.object({
  account_code: z.string().min(1, 'Account code is required'),
  name: z.string().min(1, 'Account name is required'),
  account_type: z.enum(['Asset', 'Liability', 'Equity', 'Revenue', 'Expense']),
  cash_flow_category: z.enum(['Operating', 'Investing', 'Financing']).nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  description: z.string().nullable().optional(),
  is_postable: z.boolean().default(true),
  isActive: z.boolean().default(true),
});

const updateAccountSchema = createAccountSchema.partial();

/**
 * List accounts with search, category filtering, parent/child hierarchy support.
 */
export const getAccounts = async (req: Request, res: Response) => {
  try {
    const { type, search, include_inactive, tree } = req.query;

    const whereClause: any = { deletedAt: null };

    if (type && type !== 'all') {
      whereClause.account_type = type as string;
    }

    if (include_inactive !== 'true') {
      whereClause.isActive = true;
    }

    if (search) {
      const q = String(search).trim();
      whereClause.OR = [
        { account_code: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
    }

    const accounts = await prisma.account.findMany({
      where: whereClause,
      include: {
        parent: {
          select: { id: true, account_code: true, name: true },
        },
        children: {
          where: { deletedAt: null },
          select: { id: true, account_code: true, name: true, is_postable: true, account_type: true },
        },
      },
      orderBy: { account_code: 'asc' },
    });

    // Calculate live balances from posted journal lines
    const balances = await prisma.journalLine.groupBy({
      by: ['accountId'],
      where: {
        journalEntry: { status: 'Posted', deletedAt: null },
      },
      _sum: {
        debit: true,
        credit: true,
      },
    });

    const balanceMap = new Map<string, { debit: number; credit: number }>();
    balances.forEach((b) => {
      balanceMap.set(b.accountId, {
        debit: Number(b._sum?.debit || 0),
        credit: Number(b._sum?.credit || 0),
      });
    });

    const accountsWithBalance = accounts.map((acc) => {
      const b = balanceMap.get(acc.id) || { debit: 0, credit: 0 };
      let currentBalance = 0;
      if (acc.account_type === 'Asset' || acc.account_type === 'Expense') {
        currentBalance = b.debit - b.credit;
      } else {
        currentBalance = b.credit - b.debit;
      }
      return {
        ...acc,
        current_balance: currentBalance,
        total_debit: b.debit,
        total_credit: b.credit,
      };
    });

    // Rollup child balances to parent accounts if header/non-postable
    accountsWithBalance.forEach((acc) => {
      if (!acc.is_postable && acc.children && acc.children.length > 0) {
        const childIds = new Set(acc.children.map((c: any) => c.id));
        let childSum = 0;
        accountsWithBalance.forEach((child) => {
          if (childIds.has(child.id)) {
            childSum += child.current_balance;
          }
        });
        if (childSum !== 0) {
          acc.current_balance = childSum;
        }
      }
    });

    if (tree === 'true') {
      const rootAccounts = accountsWithBalance.filter((acc) => !acc.parentId);
      return res.json({ success: true, data: rootAccounts, total: accountsWithBalance.length });
    }

    return res.json({ success: true, data: accountsWithBalance, total: accountsWithBalance.length });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to fetch accounts');
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

/**
 * Get account by ID
 */
export const getAccountById = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const account = await prisma.account.findFirst({
      where: { id, deletedAt: null },
      include: {
        parent: true,
        children: { where: { deletedAt: null } },
      },
    });

    if (!account) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Account not found' } });
    }

    return res.json({ success: true, data: account });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to fetch account');
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

/**
 * Create new account
 */
export const createAccount = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const parseResult = createAccountSchema.safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parseResult.error.issues[0].message },
      });
    }

    const data = parseResult.data;

    // Check unique account code
    const existing = await prisma.account.findUnique({
      where: { account_code: data.account_code },
    });

    if (existing) {
      if (existing.deletedAt === null) {
        return res.status(400).json({
          success: false,
          error: { code: 'DUPLICATE_CODE', message: `Account code '${data.account_code}' already exists` },
        });
      } else {
        // Un-delete soft deleted record if code is reused
        const restored = await prisma.account.update({
          where: { id: existing.id },
          data: {
            ...data,
            deletedAt: null,
            deleted_by: null,
            updated_by: userId,
          },
        });
        return res.status(201).json({ success: true, data: restored });
      }
    }

    const account = await prisma.account.create({
      data: {
        ...data,
        created_by: userId,
        updated_by: userId,
      },
      include: { parent: true },
    });

    return res.status(201).json({ success: true, data: account });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to create account');
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

/**
 * Update account
 */
export const updateAccount = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user?.id;

    const parseResult = updateAccountSchema.safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parseResult.error.issues[0].message },
      });
    }

    const data = parseResult.data;

    const existing = await prisma.account.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Account not found' } });
    }

    if (data.account_code && data.account_code !== existing.account_code) {
      const codeCheck = await prisma.account.findFirst({
        where: { account_code: data.account_code, id: { not: id }, deletedAt: null },
      });
      if (codeCheck) {
        return res.status(400).json({
          success: false,
          error: { code: 'DUPLICATE_CODE', message: `Account code '${data.account_code}' already exists` },
        });
      }
    }

    const updated = await prisma.account.update({
      where: { id },
      data: {
        ...data,
        updated_by: userId,
      },
      include: { parent: true },
    });

    return res.json({ success: true, data: updated });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to update account');
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

/**
 * Soft delete account
 */
export const deleteAccount = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user?.id;

    const existing = await prisma.account.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Account not found' } });
    }

    // Check if account has posted journal lines
    const lineCount = await prisma.journalLine.count({
      where: { accountId: id },
    });

    if (lineCount > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'ACCOUNT_HAS_TRANSACTIONS',
          message: `Cannot delete account '${existing.account_code}' because it has ${lineCount} recorded journal line(s). Deactivate the account instead.`,
        },
      });
    }

    const deleted = await prisma.account.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deleted_by: userId,
        isActive: false,
      },
    });

    return res.json({ success: true, data: deleted });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to delete account');
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

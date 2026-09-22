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

    if (tree === 'true') {
      const rootAccounts = accounts.filter((acc) => !acc.parentId);
      return res.json({ success: true, data: rootAccounts, total: accounts.length });
    }

    return res.json({ success: true, data: accounts, total: accounts.length });
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

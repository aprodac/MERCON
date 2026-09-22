import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { generateRefId, nextJournalEntryRefId } from '../utils/refId';
import { logger } from '../utils/logger';
import { postJournalEntry, voidJournalEntry, AccountingError } from '../utils/accountingEngine';

const journalLineSchema = z.object({
  accountId: z.string().uuid('Invalid account ID'),
  debit: z.number().min(0, 'Debit cannot be negative').default(0),
  credit: z.number().min(0, 'Credit cannot be negative').default(0),
  currency: z.string().default('SAR'),
  description: z.string().nullable().optional(),
});

const createJournalEntrySchema = z.object({
  entry_date: z.string().min(1, 'Entry date is required'),
  memo: z.string().nullable().optional(),
  periodId: z.string().uuid('Invalid period ID'),
  source_type: z.string().default('Manual'),
  source_id: z.string().uuid().nullable().optional(),
  lines: z.array(journalLineSchema).min(2, 'Journal entry must have at least 2 lines'),
});

const updateJournalEntrySchema = createJournalEntrySchema.partial();

/**
 * List journal entries with filters
 */
export const getJournalEntries = async (req: Request, res: Response) => {
  try {
    const { period_id, status, source_type, account_id, date_from, date_to, search, page = '1', per_page = '50' } = req.query;

    const pageNumber = Math.max(1, parseInt(page as string) || 1);
    const limit = Math.max(1, parseInt(per_page as string) || 50);
    const skip = (pageNumber - 1) * limit;

    const whereClause: any = {};

    if (period_id && period_id !== 'all') {
      whereClause.periodId = period_id as string;
    }

    if (status && status !== 'all') {
      whereClause.status = status as string;
    }

    if (source_type && source_type !== 'all') {
      whereClause.source_type = source_type as string;
    }

    if (account_id && account_id !== 'all') {
      whereClause.lines = {
        some: { accountId: account_id as string },
      };
    }

    if (date_from || date_to) {
      whereClause.entry_date = {};
      if (date_from) whereClause.entry_date.gte = new Date(date_from as string);
      if (date_to) whereClause.entry_date.lte = new Date(date_to as string);
    }

    if (search) {
      const q = String(search).trim();
      whereClause.OR = [
        { ref_id: { contains: q, mode: 'insensitive' } },
        { memo: { contains: q, mode: 'insensitive' } },
        { lines: { some: { description: { contains: q, mode: 'insensitive' } } } },
      ];
    }

    const [entries, total] = await Promise.all([
      prisma.journalEntry.findMany({
        where: whereClause,
        include: {
          period: { select: { id: true, name: true, status: true } },
          lines: {
            include: {
              account: { select: { id: true, account_code: true, name: true, account_type: true } },
            },
          },
          reversalOf: { select: { id: true, ref_id: true } },
          reversedBy: { select: { id: true, ref_id: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.journalEntry.count({ where: whereClause }),
    ]);

    return res.json({
      success: true,
      data: entries,
      pagination: {
        page: pageNumber,
        per_page: limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to fetch journal entries');
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

/**
 * Get single journal entry by ID with lines
 */
export const getJournalEntryById = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    const entry = await prisma.journalEntry.findUnique({
      where: { id },
      include: {
        period: true,
        lines: {
          include: {
            account: true,
          },
        },
        reversalOf: { select: { id: true, ref_id: true, memo: true } },
        reversedBy: { select: { id: true, ref_id: true, memo: true } },
      },
    });

    if (!entry) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Journal entry not found' } });
    }

    return res.json({ success: true, data: entry });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to fetch journal entry');
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

/**
 * Create a new Draft journal entry
 */
export const createDraftJournalEntry = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const parseResult = createJournalEntrySchema.safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parseResult.error.issues[0].message },
      });
    }

    const { entry_date, memo, periodId, source_type, source_id, lines } = parseResult.data;

    // Verify period exists
    const period = await prisma.accountingPeriod.findFirst({ where: { id: periodId } });
    if (!period) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PERIOD', message: 'Accounting period not found' },
      });
    }

    const ref_id = await nextJournalEntryRefId(prisma);

    const entry = await prisma.journalEntry.create({
      data: {
        ref_id,
        entry_date: new Date(entry_date),
        memo,
        periodId,
        source_type: source_type || 'Manual',
        source_id: source_id || null,
        status: 'Draft',
        created_by: userId,
        lines: {
          create: lines.map((l) => ({
            accountId: l.accountId,
            debit: l.debit,
            credit: l.credit,
            currency: l.currency || 'SAR',
            description: l.description || null,
          })),
        },
      },
      include: {
        period: true,
        lines: { include: { account: true } },
      },
    });

    return res.status(201).json({ success: true, data: entry });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to create draft journal entry');
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

/**
 * Update Draft journal entry
 */
export const updateDraftJournalEntry = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.journalEntry.findUnique({
      where: { id },
      include: { lines: true },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Journal entry not found' } });
    }

    if (existing.status !== 'Draft') {
      return res.status(403).json({
        success: false,
        error: { code: 'ENTRY_NOT_DRAFT', message: `Cannot modify journal entry because status is '${existing.status}'` },
      });
    }

    const parseResult = updateJournalEntrySchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parseResult.error.issues[0].message },
      });
    }

    const data = parseResult.data;

    // Use transaction to replace lines if provided
    const updated = await prisma.$transaction(async (tx) => {
      if (data.lines) {
        await tx.journalLine.deleteMany({ where: { journalEntryId: id } });
      }

      return await tx.journalEntry.update({
        where: { id },
        data: {
          entry_date: data.entry_date ? new Date(data.entry_date) : undefined,
          memo: data.memo !== undefined ? data.memo : undefined,
          periodId: data.periodId || undefined,
          source_type: data.source_type || undefined,
          source_id: data.source_id !== undefined ? data.source_id : undefined,
          lines: data.lines
            ? {
                create: data.lines.map((l) => ({
                  accountId: l.accountId,
                  debit: l.debit,
                  credit: l.credit,
                  currency: l.currency || 'SAR',
                  description: l.description || null,
                })),
              }
            : undefined,
        },
        include: {
          period: true,
          lines: { include: { account: true } },
        },
      });
    });

    return res.json({ success: true, data: updated });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to update draft journal entry');
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

/**
 * Hard delete a Draft journal entry
 */
export const deleteDraftJournalEntry = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    const existing = await prisma.journalEntry.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Journal entry not found' } });
    }

    if (existing.status !== 'Draft') {
      return res.status(400).json({
        success: false,
        error: { code: 'CANNOT_DELETE_POSTED', message: `Posted or Voided entries cannot be deleted. Use void action instead.` },
      });
    }

    await prisma.journalEntry.delete({ where: { id } });

    return res.json({ success: true, message: `Journal entry ${existing.ref_id || existing.id} deleted` });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to delete draft journal entry');
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

/**
 * Post a Draft journal entry
 */
export const postJournalEntryHandler = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user?.id;

    const posted = await postJournalEntry(id, userId);

    return res.json({ success: true, data: posted });
  } catch (error: any) {
    if (error instanceof AccountingError) {
      return res.status(error.statusCode).json({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }
    logger.error({ err: error }, 'Failed to post journal entry');
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

/**
 * Void a Posted journal entry
 */
export const voidJournalEntryHandler = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user?.id;
    const { memo } = req.body || {};

    const result = await voidJournalEntry(id, userId, memo);

    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error instanceof AccountingError) {
      return res.status(error.statusCode).json({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }
    logger.error({ err: error }, 'Failed to void journal entry');
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

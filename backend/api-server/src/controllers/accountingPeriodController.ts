import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { logger } from '../utils/logger';

const createPeriodSchema = z.object({
  name: z.string().min(1, 'Period name is required'),
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().min(1, 'End date is required'),
});

/**
 * List accounting periods
 */
export const getAccountingPeriods = async (req: Request, res: Response) => {
  try {
    const { status } = req.query;

    const whereClause: any = {};
    if (status && status !== 'all') {
      whereClause.status = status as string;
    }

    const periods = await prisma.accountingPeriod.findMany({
      where: whereClause,
      include: {
        _count: {
          select: { journalEntries: true },
        },
      },
      orderBy: { start_date: 'desc' },
    });

    return res.json({ success: true, data: periods, total: periods.length });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to fetch accounting periods');
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

/**
 * Create a new accounting period
 */
export const createAccountingPeriod = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const parseResult = createPeriodSchema.safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parseResult.error.issues[0].message },
      });
    }

    const { name, start_date, end_date } = parseResult.data;

    const startDate = new Date(start_date);
    const endDate = new Date(end_date);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_DATES', message: 'Invalid start or end date format' },
      });
    }

    if (startDate >= endDate) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_DATE_RANGE', message: 'Start date must be strictly before end date' },
      });
    }

    // Check unique start_date, end_date
    const existing = await prisma.accountingPeriod.findFirst({
      where: { start_date: startDate, end_date: endDate },
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        error: { code: 'DUPLICATE_PERIOD', message: 'An accounting period with the exact start and end dates already exists' },
      });
    }

    const period = await prisma.accountingPeriod.create({
      data: {
        name,
        start_date: startDate,
        end_date: endDate,
        status: 'Open',
        created_by: userId,
        updated_by: userId,
      },
    });

    return res.status(201).json({ success: true, data: period });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to create accounting period');
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

/**
 * Close accounting period
 */
export const closeAccountingPeriod = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user?.id;

    const period = await prisma.accountingPeriod.findFirst({ where: { id } });
    if (!period) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Accounting period not found' } });
    }

    if (period.status !== 'Open') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_TRANSITION', message: `Period is already ${period.status}` },
      });
    }

    // Ensure no Draft entries remain in this period before closing
    const draftCount = await prisma.journalEntry.count({
      where: { periodId: id, status: 'Draft' },
    });

    if (draftCount > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'UNPOSTED_DRAFTS_EXIST',
          message: `Cannot close period because it contains ${draftCount} unposted draft journal entry/entries. Post or delete drafts first.`,
        },
      });
    }

    const updated = await prisma.accountingPeriod.update({
      where: { id },
      data: {
        status: 'Closed',
        closed_by: userId,
        closed_at: new Date(),
        updated_by: userId,
      },
    });

    return res.json({ success: true, data: updated });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to close accounting period');
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

/**
 * Lock accounting period (permanently read-only)
 */
export const lockAccountingPeriod = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user?.id;

    const period = await prisma.accountingPeriod.findFirst({ where: { id } });
    if (!period) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Accounting period not found' } });
    }

    if (period.status === 'Locked') {
      return res.status(400).json({
        success: false,
        error: { code: 'ALREADY_LOCKED', message: 'Accounting period is already locked' },
      });
    }

    // Ensure no Draft entries remain in this period before locking
    const draftCount = await prisma.journalEntry.count({
      where: { periodId: id, status: 'Draft' },
    });

    if (draftCount > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'UNPOSTED_DRAFTS_EXIST',
          message: `Cannot lock period because it contains ${draftCount} unposted draft journal entry/entries. Post or delete drafts first.`,
        },
      });
    }

    const updated = await prisma.accountingPeriod.update({
      where: { id },
      data: {
        status: 'Locked',
        updated_by: userId,
      },
    });

    return res.json({ success: true, data: updated });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to lock accounting period');
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

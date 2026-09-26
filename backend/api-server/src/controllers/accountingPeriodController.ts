import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { logger } from '../utils/logger';
import { closeAccountingPeriodWithSnapshot } from '../utils/periodClosingEngine';
import { AccountingError } from '../utils/accountingEngine';
import { closeFiscalYear } from '../utils/fiscalYearClosingEngine';
import { logAuditEvent } from '../services/auditService';

const createPeriodSchema = z.object({
  name: z.string().min(1, 'Period name is required'),
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().min(1, 'End date is required'),
});

const closeFiscalYearSchema = z.object({
  closing_date: z.string().min(1, 'Closing date is required'),
});

const reopenPeriodSchema = z.object({
  reason: z.string().trim().min(10, 'Reason must be at least 10 characters long').max(500, 'Reason cannot exceed 500 characters'),
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

    await logAuditEvent({
      req,
      userId,
      action: 'PERIOD_CREATED',
      entityType: 'AccountingPeriod',
      entityId: period.id,
      metadata: { name: period.name },
    });

    return res.status(201).json({ success: true, data: period });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to create accounting period');
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

/**
 * Close accounting period with AccountClosingBalance snapshot computation
 */
export const closeAccountingPeriod = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user?.id;

    const result = await closeAccountingPeriodWithSnapshot(id, userId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error instanceof AccountingError) {
      return res.status(error.statusCode).json({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }
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

    if (period.status !== 'Closed') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'PERIOD_NOT_CLOSED',
          message: `Only a closed period can be locked. Close '${period.name}' first so its balances are snapshotted.`,
        },
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

    await logAuditEvent({
      req,
      userId,
      action: 'PERIOD_LOCKED',
      entityType: 'AccountingPeriod',
      entityId: id,
      metadata: { name: period.name },
    });

    return res.json({ success: true, data: updated });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to lock accounting period');
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

/**
 * Reopen a closed accounting period
 */
export const reopenAccountingPeriod = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user?.id;

    const parseResult = reopenPeriodSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parseResult.error.issues[0].message },
      });
    }

    const { reason } = parseResult.data;

    const result = await prisma.$transaction(async (tx) => {
      const period = await tx.accountingPeriod.findUnique({ where: { id } });
      if (!period) {
        throw new AccountingError('Accounting period not found', 'NOT_FOUND', 404);
      }

      if (period.status === 'Locked') {
        throw new AccountingError('Locked periods are permanent and can\'t be reopened', 'PERIOD_LOCKED', 400);
      }

      if (period.status === 'Open') {
        throw new AccountingError(`Accounting period '${period.name}' is already open`, 'PERIOD_NOT_CLOSED', 400);
      }

      // Check if any period starting after this one is Closed or Locked
      const laterClosedOrLocked = await tx.accountingPeriod.findFirst({
        where: {
          start_date: { gt: period.start_date },
          status: { in: ['Closed', 'Locked'] },
        },
      });

      if (laterClosedOrLocked) {
        throw new AccountingError(
          `Cannot reopen period '${period.name}' because a later period ('${laterClosedOrLocked.name}') is closed or locked. Periods must be reopened in reverse order (newest first).`,
          'LATER_PERIOD_CLOSED',
          400
        );
      }

      // Check if a Posted 'FiscalYearClosing' journal entry exists dated on or after this period's start
      const fyClosing = await tx.journalEntry.findFirst({
        where: {
          source_type: 'FiscalYearClosing',
          status: 'Posted',
          entry_date: { gte: period.start_date },
        },
      });

      if (fyClosing) {
        throw new AccountingError(
          `Cannot reopen period '${period.name}' because a fiscal year closing has already been posted on or after ${period.start_date.toISOString().split('T')[0]}.`,
          'FISCAL_YEAR_CLOSED',
          400
        );
      }

      // Delete snapshot AccountClosingBalance rows
      await tx.accountClosingBalance.deleteMany({
        where: { periodId: id },
      });

      const reopened = await tx.accountingPeriod.update({
        where: { id },
        data: {
          status: 'Open',
          closed_by: null,
          closed_at: null,
          updated_by: userId,
        },
      });

      return {
        reopened,
        name: period.name,
        previous_closed_by: period.closed_by,
        previous_closed_at: period.closed_at,
      };
    });

    await logAuditEvent({
      req,
      userId,
      action: 'PERIOD_REOPENED',
      entityType: 'AccountingPeriod',
      entityId: id,
      metadata: {
        name: result.name,
        reason,
        previous_closed_by: result.previous_closed_by,
        previous_closed_at: result.previous_closed_at,
      },
    });

    return res.json({ success: true, data: result.reopened });
  } catch (error: any) {
    if (error instanceof AccountingError) {
      return res.status(error.statusCode).json({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }
    logger.error({ err: error }, 'Failed to reopen accounting period');
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

/**
 * Get audit activity for an accounting period
 */
export const getAccountingPeriodActivity = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const logs = await prisma.auditLog.findMany({
      where: {
        entityType: 'AccountingPeriod',
        entityId: id,
      },
      include: {
        user: {
          select: { id: true, username: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ success: true, data: logs });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to fetch accounting period activity');
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

/**
 * Explicit Fiscal Year-End Closing Handler
 */
export const closeFiscalYearHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || 'system';
    const parseResult = closeFiscalYearSchema.safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parseResult.error.issues[0].message },
      });
    }

    const { closing_date } = parseResult.data;
    const closingDate = new Date(closing_date);

    if (isNaN(closingDate.getTime())) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_DATE', message: 'Invalid closing_date format' },
      });
    }

    const closingEntry = await closeFiscalYear(closingDate, userId);
    return res.json({ success: true, data: closingEntry });
  } catch (error: any) {
    if (error instanceof AccountingError) {
      return res.status(error.statusCode).json({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }
    logger.error({ err: error }, 'Failed to close fiscal year');
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};


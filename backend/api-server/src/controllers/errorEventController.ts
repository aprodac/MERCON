import { Request, Response } from 'express';
import { prisma } from '../db';
import { logger } from '../utils/logger';

export const getErrorEvents = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.per_page as string, 10) || 20));
    const status = req.query.status as string | undefined;
    const source = req.query.source as string | undefined;

    const where = {
      ...(status ? { status } : {}),
      ...(source ? { source } : {}),
    };

    const [events, total] = await Promise.all([
      prisma.errorEvent.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.errorEvent.count({ where }),
    ]);

    res.json({
      success: true,
      data: events,
      meta: { page, per_page: limit, total, total_pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch error events');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch error events' } });
  }
};

export const getErrorEventById = async (req: Request, res: Response) => {
  try {
    const event = await prisma.errorEvent.findUnique({ where: { id: req.params.id as string } });
    if (!event) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Error event not found' } });
    }
    res.json({ success: true, data: event });
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch error event');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch error event' } });
  }
};

export const updateErrorEventStatus = async (req: Request, res: Response) => {
  try {
    const { status, notes } = req.body as { status: string; notes?: string };
    const event = await prisma.errorEvent.update({
      where: { id: req.params.id as string },
      data: { status, ...(notes !== undefined ? { notes } : {}) },
    });
    res.json({ success: true, data: event });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Error event not found' } });
    }
    logger.error({ err: error }, 'Failed to update error event');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to update error event' } });
  }
};

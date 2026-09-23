import { Request, Response } from 'express';
import { prisma } from '../db';
import { recordAdvance, applyAdvance, voidAdvance } from '../utils/advanceEngine';
import { AccountingError } from '../utils/accountingEngine';

export const createAdvance = async (req: Request, res: Response) => {
  try {
    const { party_type, party_id, direction, amount, advance_date, accountId, memo, currency } = req.body;
    const userId = (req as any).user?.id;

    if (!party_type || !direction || !amount || !advance_date || !accountId) {
      return res.status(400).json({
        success: false,
        error: 'party_type, direction, amount, advance_date, and accountId are required',
      });
    }

    const advance = await recordAdvance(
      {
        party_type,
        party_id,
        direction,
        amount,
        advance_date,
        accountId,
        memo,
        currency,
      },
      userId,
    );

    res.status(201).json({ success: true, data: advance });
  } catch (error: any) {
    if (error instanceof AccountingError) {
      return res.status(error.statusCode).json({ success: false, error: error.message, code: error.code });
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

export const listAdvances = async (req: Request, res: Response) => {
  try {
    const { party_type, party_id, status, direction } = req.query;

    const advances = await prisma.advance.findMany({
      where: {
        party_type: party_type ? (String(party_type) as any) : undefined,
        party_id: party_id ? String(party_id) : undefined,
        status: status ? (String(status) as any) : undefined,
        direction: direction ? (String(direction) as any) : undefined,
      },
      include: {
        account: true,
        journalEntry: true,
        _count: { select: { applications: true } },
      },
      orderBy: {
        advance_date: 'desc',
      },
    });

    res.json({ success: true, data: advances });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getAdvanceById = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    const advance = await prisma.advance.findUnique({
      where: { id },
      include: {
        account: true,
        journalEntry: {
          include: { lines: { include: { account: true } } },
        },
        applications: {
          include: {
            invoice: true,
            bill: true,
            journalEntry: { include: { lines: { include: { account: true } } } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!advance) {
      return res.status(404).json({ success: false, error: 'Advance not found' });
    }

    res.json({ success: true, data: advance });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const applyAdvanceHandler = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { targetId, targetType, amount } = req.body;
    const userId = (req as any).user?.id;

    if (!targetId || !targetType || !amount) {
      return res.status(400).json({
        success: false,
        error: 'targetId, targetType (Invoice or Bill), and amount are required',
      });
    }

    if (targetType !== 'Invoice' && targetType !== 'Bill') {
      return res.status(400).json({
        success: false,
        error: 'targetType must be either Invoice or Bill',
      });
    }

    const result = await applyAdvance(id, targetId, targetType, amount, userId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    if (error instanceof AccountingError) {
      return res.status(error.statusCode).json({ success: false, error: error.message, code: error.code });
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

export const voidAdvanceHandler = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user?.id;

    const result = await voidAdvance(id, userId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    if (error instanceof AccountingError) {
      return res.status(error.statusCode).json({ success: false, error: error.message, code: error.code });
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

import { Request, Response } from 'express';
import { loadVatReturn } from '../services/vatReturn';
import { logger } from '../utils/logger';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** GET /finance/reports/vat-return?from=YYYY-MM-DD&to=YYYY-MM-DD */
export const getVatReturn = async (req: Request, res: Response) => {
  try {
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');
    if (!DAY.test(from) || !DAY.test(to) || from > to) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'from and to must be dates (YYYY-MM-DD), from on or before to' } });
    }
    res.json({ success: true, data: await loadVatReturn(from, to) });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to build the VAT return');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

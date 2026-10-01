import { Request, Response } from 'express';
import { loadTripProfitability, type ProfitabilityQuery } from '../services/tripProfitability/loader';
import { logger } from '../utils/logger';

/**
 * GET /finance/reports/trip-profitability — earned trips with their margin after driver pay,
 * subcontract and trip expenses. `group` = trip | customer | lane | vehicle; `only` = loss | unpriced.
 */
export const getTripProfitability = async (req: Request, res: Response) => {
  try {
    const data = await loadTripProfitability(req.query as ProfitabilityQuery);
    res.json({ success: true, data });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to load trip profitability');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

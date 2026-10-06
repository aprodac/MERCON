import { Request, Response } from 'express';
import { prisma } from '../db';
import { logger } from '../utils/logger';
import { loadEtaAccuracy } from '../services/tracking/etaAccuracy';

/** GET /settings/eta-accuracy?days=30 — predicted vs actual arrival per stop (services/tracking/etaAccuracy.ts). */
export const getEtaAccuracy = async (req: Request, res: Response) => {
  const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
  try {
    res.json({ success: true, data: await loadEtaAccuracy(prisma, days) });
  } catch (error) {
    logger.error({ err: error }, 'eta accuracy failed');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: "Couldn't load ETA accuracy." } });
  }
};

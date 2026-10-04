import { Request, Response } from 'express';
import { previewCleanup, runCleanup, CleanupError } from '../services/dataCleanup';
import { logAuditEvent } from '../services/auditService';
import { logger } from '../utils/logger';

/** GET /settings/data-cleanup — what would be removed (changes nothing). */
export const getDataCleanupPreview = async (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await previewCleanup() });
  } catch (error) {
    logger.error({ err: error }, 'data cleanup preview failed');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: "Couldn't load the clean-up overview." } });
  }
};

/** POST /settings/data-cleanup — remove what was chosen. SuperAdmin, dev databases only. */
export const runDataCleanup = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id ?? null;
    const result = await runCleanup(req.body ?? {}, userId);
    await logAuditEvent({
      req,
      action: 'DATA_CLEANUP',
      entityType: 'Settings',
      entityId: result.database,
      metadata: { ...result.counts, filesMoved: result.filesMoved },
    } as any).catch(() => undefined);
    res.json({ success: true, data: result });
  } catch (error: any) {
    if (error instanceof CleanupError) {
      return res.status(error.status).json({ success: false, error: { code: 'CLEANUP_REFUSED', message: error.message } });
    }
    logger.error({ err: error }, 'data cleanup failed');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Clean up failed — nothing was changed.' } });
  }
};

import { Request, Response } from 'express';
import { getSnapshotStatus, takeSnapshot, SnapshotError } from '../services/hostinger/vpsSnapshot';
import { logAuditEvent } from '../services/auditService';
import { logger } from '../utils/logger';

const fail = (res: Response, error: unknown, fallback: string) => {
  if (error instanceof SnapshotError) {
    return res.status(error.status).json({ success: false, error: { code: 'SNAPSHOT_FAILED', message: error.message } });
  }
  logger.error({ err: error }, fallback);
  return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: fallback } });
};

/** GET /settings/server-snapshot — the server's current Hostinger snapshot. Superadmin. */
export const getServerSnapshot = async (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await getSnapshotStatus() });
  } catch (error) {
    fail(res, error, "Couldn't load the server snapshot.");
  }
};

/** POST /settings/server-snapshot { confirm: true } — replace it with a new one. Superadmin. */
export const createServerSnapshot = async (req: Request, res: Response) => {
  if (req.body?.confirm !== true) {
    return res.status(400).json({ success: false, error: { code: 'CONFIRM_REQUIRED', message: 'Confirm that the current snapshot will be replaced.' } });
  }
  try {
    const started = await takeSnapshot();
    await logAuditEvent({ req, action: 'SERVER_SNAPSHOT', entityType: 'Settings', entityId: 'server', metadata: started } as any).catch(() => undefined);
    res.json({ success: true, data: started });
  } catch (error) {
    fail(res, error, "Couldn't start the snapshot.");
  }
};

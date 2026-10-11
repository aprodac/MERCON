/**
 * POST /drivers/truck-assignment/preview — what changing a truck's driver (or a
 * driver's truck) will do, for the confirm step in the web and operator app.
 * POST /drivers/truck-assignment — do it. See services/truckAssignment.ts.
 */
import { Request, Response } from 'express';
import { AssignmentError, applyTruckAssignment, previewTruckAssignment, type AssignmentRequest } from '../services/truckAssignment';
import { logger } from '../utils/logger';

const fail = (res: Response, error: unknown, what: string) => {
  if (error instanceof AssignmentError) {
    return res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
  }
  logger.error({ err: error }, `Failed to ${what} truck assignment`);
  return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: `Failed to ${what} the truck assignment` } });
};

export const previewAssignment = async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await previewTruckAssignment(req.body as AssignmentRequest) });
  } catch (error) {
    fail(res, error, 'preview');
  }
};

export const applyAssignment = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id ?? null;
    res.json({ success: true, data: await applyTruckAssignment(req.body as AssignmentRequest, userId) });
  } catch (error) {
    fail(res, error, 'save');
  }
};

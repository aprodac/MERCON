import { Request, Response } from 'express';
import { captureError } from '../services/errorCapture';

/** Fed by the web dashboard's ErrorBoundary and window.onerror/unhandledrejection
 *  listener (src/lib/errorReporting.ts). Always 204s — a failed error report
 *  should never itself become something the client needs to handle. */
export const reportClientError = async (req: Request, res: Response) => {
  const { message, stack, route } = req.body as { message: string; stack?: string; route: string };
  const err = new Error(message);
  if (stack) err.stack = stack;
  await captureError({ err, source: 'web', route });
  res.status(204).end();
};

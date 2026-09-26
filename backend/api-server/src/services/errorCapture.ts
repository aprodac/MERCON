/**
 * Persists a deduplicated record of every error the app logs, so the Admin
 * Error Console has something to show. Fed automatically from every
 * logger.error/fatal({ err, ... }) call via a pino hook (utils/logger.ts) —
 * no per-controller wiring needed — and explicitly from the web dashboard's
 * ErrorBoundary/window.onerror via POST /api/client-errors.
 *
 * Deliberately never uses `logger` internally: logger.error is what
 * triggers this in the first place, so logging a capture failure through it
 * would recurse. A capture failure is swallowed after a console.error —
 * losing one error-console row is fine, breaking the request that raised
 * the original error is not.
 */
import { createHash } from 'crypto';
import { prisma } from '../db';
import { getRequestId, getRequestRoute, getRequestUserId } from '../middlewares/requestContext';

export interface CaptureErrorInput {
  err: unknown;
  code?: string;
  source?: 'api' | 'web';
  route?: string;
}

export async function captureError(input: CaptureErrorInput): Promise<void> {
  try {
    const err = input.err;
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    const code = input.code || (err as any)?.code || (err instanceof Error ? err.name : 'UNKNOWN') || 'UNKNOWN';
    const route = input.route ?? getRequestRoute() ?? 'unknown';
    const source = input.source ?? 'api';
    const requestId = getRequestId();
    const userId = getRequestUserId();
    const firstStackLine = (stack?.split('\n')[1] || '').trim();
    const fingerprint = createHash('sha1').update(`${source}|${code}|${route}|${firstStackLine}`).digest('hex');

    const existing = await prisma.errorEvent.findUnique({
      where: { fingerprint },
      select: { status: true },
    });

    await prisma.errorEvent.upsert({
      where: { fingerprint },
      create: {
        fingerprint,
        code,
        message,
        stack,
        route,
        source,
        count: 1,
        status: 'New',
        lastRequestId: requestId ?? null,
        firstUserId: userId ?? null,
      },
      update: {
        count: { increment: 1 },
        message,
        stack,
        lastRequestId: requestId ?? null,
        // A fingerprint marked Resolved that fires again means the fix didn't
        // hold (or never shipped) — reopen it rather than leaving it hidden
        // as resolved while it keeps recurring.
        ...(existing?.status === 'Resolved' ? { status: 'New' } : {}),
      },
    });
  } catch (captureErr) {
    // eslint-disable-next-line no-console
    console.error('[errorCapture] failed to persist error event:', captureErr);
  }
}

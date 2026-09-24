/**
 * Per-request correlation ID.
 *
 * Attaches a UUID to every incoming request (req.id, X-Request-Id response
 * header) and makes it available anywhere in that request's async call
 * chain via AsyncLocalStorage — including inside logger.ts's pino mixin, so
 * every logger.error/warn(...) call anywhere in a controller automatically
 * picks up the request ID without needing to be touched individually.
 */
import { randomUUID } from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';
import { Request, Response, NextFunction } from 'express';

interface RequestStore {
  requestId: string;
  route: string;
  userId?: string;
}

const als = new AsyncLocalStorage<RequestStore>();

export function getRequestId(): string | undefined {
  return als.getStore()?.requestId;
}

export function getRequestRoute(): string | undefined {
  return als.getStore()?.route;
}

export function getRequestUserId(): string | undefined {
  return als.getStore()?.userId;
}

/** Called once auth middleware resolves the caller, so later error captures
 *  for this request carry a user id even though this store was created
 *  before authentication ran. */
export function setRequestUserId(userId: string) {
  const store = als.getStore();
  if (store) store.userId = userId;
}

export function requestContext(req: Request, res: Response, next: NextFunction) {
  const requestId = randomUUID();
  (req as Request & { id: string }).id = requestId;
  res.setHeader('X-Request-Id', requestId);
  als.run({ requestId, route: `${req.method} ${req.path}` }, next);
}

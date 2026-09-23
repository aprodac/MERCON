import { Request } from 'express';
import { prisma } from '../db';
import { AuthenticatedRequest } from '../middlewares/auth';

interface AuditLogOptions {
  req?: Request | AuthenticatedRequest;
  userId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, any>;
}

/**
 * Strips sensitive keys (passwords, PINs, tokens, hashes) from metadata objects.
 */
function sanitizeMetadata(data?: Record<string, any>): Record<string, any> | undefined {
  if (!data) return undefined;

  const forbiddenKeys = [
    'password',
    'confirmPassword',
    'password_hash',
    'pin',
    'token',
    'secret',
    'authorization',
    'cookie',
  ];

  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(data)) {
    const keyLower = key.toLowerCase();
    if (forbiddenKeys.some((fk) => keyLower.includes(fk))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeMetadata(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const toUuidOrNull = (id?: string | null): string | null => (id && UUID_REGEX.test(id) ? id : null);

/**
 * Records a security or administrative audit log entry in PostgreSQL.
 */
export async function logAuditEvent(options: AuditLogOptions): Promise<void> {
  try {
    const { req, userId: explicitUserId, action, entityType, entityId, metadata } = options;

    const authReq = req as AuthenticatedRequest | undefined;
    const rawActorId = explicitUserId || authReq?.user?.id || undefined;
    const actorId = toUuidOrNull(rawActorId);


    const ipAddress =
      req?.headers?.['x-forwarded-for'] ||
      req?.socket?.remoteAddress ||
      undefined;

    const userAgent = req?.headers?.['user-agent'] || undefined;

    const safeMetadata = {
      ...sanitizeMetadata(metadata),
      ...(ipAddress ? { ipAddress: String(ipAddress) } : {}),
      ...(userAgent ? { userAgent: String(userAgent) } : {}),
    };

    await prisma.auditLog.create({
      data: {
        userId: actorId,
        action,
        entityType,
        entityId: entityId ? String(entityId) : null,
        metadata: safeMetadata,
      },
    });
  } catch (error) {
    // Non-blocking: Audit log failure should log to console error but not break main request execution
    console.error('Failed to write audit log entry:', error);
  }
}

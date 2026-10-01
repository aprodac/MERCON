/**
 * Driver activity log — the driver-side audit trail (logins, status changes,
 * photos, emergencies, permission changes, online/offline).
 *
 * Best-effort: a failed log write must never fail the request that caused it.
 */
import { prisma } from '../../db';
import { logger } from '../../utils/logger';

export type DriverActivityType =
  | 'Login'
  | 'Logout'
  | 'AppOpened'
  | 'WentOffline'
  | 'CameOnline'
  | 'PermissionChanged'
  | 'TripStatusChanged'
  | 'PhotoUploaded'
  | 'Emergency'
  | 'Acknowledged';

export interface DriverActivityInput {
  tripId?: string | null;
  /** Numbers or numeric strings (multipart bodies); anything else is dropped. */
  lat?: number | string | null;
  lng?: number | string | null;
  metadata?: Record<string, unknown>;
}

function coord(v: unknown, limit: number): number | null {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
}

export async function recordDriverActivity(
  driverId: string,
  type: DriverActivityType,
  input: DriverActivityInput = {},
): Promise<void> {
  try {
    await prisma.driverActivityEvent.create({
      data: {
        driverId,
        type,
        tripId: input.tripId ?? null,
        lat: coord(input.lat, 90),
        lng: coord(input.lng, 180),
        metadata: (input.metadata ?? undefined) as any,
      },
    });
  } catch (err) {
    logger.warn({ err, driverId, type }, '[DriverActivity] Failed to record event');
  }
}

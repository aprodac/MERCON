/**
 * Driver phone health + acknowledgement endpoints (driver app).
 *   POST /mobile/health                         phone snapshot / heartbeat
 *   POST /mobile/devices/logout                 the driver logged out on this phone
 *   POST /mobile/notifications/:id/opened       the driver tapped a push
 *   GET  /mobile/trips/pending-acknowledgements trips waiting for "Got it"
 *   POST /mobile/trips/:id/acknowledge          "Got it"
 * Plan: docs/DRIVER_PHONE_AUDIT_PLAN.md.
 */
import { NextFunction, Request, Response } from 'express';
import { TripStatus } from '@prisma/client';
import { prisma } from '../db';
import { logger } from '../utils/logger';
import { recordDriverActivity } from '../services/driverPhone/activity';
import { notifyStaffOfTripAcknowledged } from '../services/staffAlerts/notify';
import { publicBaseUrl } from './operatorInboxController';
import { getDriverAppMinVersion } from '../services/driverPhone/attention';
import { isBelowMinVersion } from '../services/driverPhone/rules';

const driverIdOf = (req: Request): string | undefined => (req as any).user?.driver_id;

const NOTIF = ['granted', 'denied', 'undetermined'] as const;
const LOCATION = ['always', 'while_using', 'denied', 'undetermined'] as const;
const NETWORK = ['wifi', 'cellular', 'none', 'unknown', 'other'] as const;

const oneOf = <T extends readonly string[]>(v: unknown, list: T): T[number] | null =>
  typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T[number]) : null;
const str = (v: unknown, max = 64): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The health fields of a request body, sanitised. Undefined = not sent (leave the column alone). */
export function parseHealth(body: any) {
  if (!body || typeof body !== 'object') return null;
  const battery = num(body.battery_level);
  const parsed = {
    app_version: str(body.app_version),
    build_number: str(body.build_number),
    os_name: str(body.os_name),
    os_version: str(body.os_version),
    device_model: str(body.device_model, 120),
    notif_permission: oneOf(body.notif_permission, NOTIF),
    location_permission: oneOf(body.location_permission, LOCATION),
    location_services_on: bool(body.location_services_on),
    battery_level: battery != null && battery >= 0 && battery <= 1 ? battery : null,
    low_power_mode: bool(body.low_power_mode),
    network_type: oneOf(body.network_type, NETWORK),
  };
  // Only what this request actually reported: the push-token call at sign-in
  // carries no health fields and must not blank what the health report just
  // saved (model, permissions, battery all showed empty after every login).
  const reported = Object.fromEntries(Object.entries(parsed).filter(([, v]) => v !== null)) as Partial<typeof parsed>;
  return Object.keys(reported).length ? reported : null;
}

const INSTALL_ID_RE = /^[A-Za-z0-9-]{8,64}$/;

/**
 * Finds or creates the device row for this install (and/or push token),
 * merging a row an older build registered by token alone. Returns the row
 * before and after, so callers can log what changed.
 */
export async function upsertDriverDevice(
  driverId: string,
  input: { installId: string | null; token: string | null; platform: string | null; health: ReturnType<typeof parseHealth> },
) {
  const { installId, token, platform, health } = input;
  const byInstall = installId ? await prisma.driverDevice.findUnique({ where: { install_id: installId } }) : null;
  const byToken = token ? await prisma.driverDevice.findUnique({ where: { token } }) : null;

  // The same token on another row (an older registration of this phone): free it.
  if (byInstall && byToken && byInstall.id !== byToken.id) {
    await prisma.driverDevice.update({ where: { id: byToken.id }, data: { token: null, isActive: false } });
  }
  const existing = byInstall ?? byToken;

  const now = new Date();
  const data = {
    driverId,
    isActive: true,
    lastSeenAt: now,
    ...(installId ? { install_id: installId } : {}),
    ...(token ? { token } : {}),
    ...(platform ? { platform } : {}),
    ...(health ? { ...health, health_reported_at: now } : {}),
  };

  const after = existing
    ? await prisma.driverDevice.update({ where: { id: existing.id }, data })
    : await prisma.driverDevice.create({ data: { ...data, platform: platform ?? 'unknown' } });

  // Rows an older build registered by token alone are this driver's previous
  // registration(s); once a build that reports an install id appears they'd
  // only receive duplicate pushes or mask the real status, so retire them.
  if (installId) {
    await prisma.driverDevice.updateMany({
      where: { driverId, install_id: null, isActive: true, id: { not: after.id } },
      data: { isActive: false },
    });
  }
  return { before: existing, after };
}

/**
 * Bumps "last seen" for the calling install on any authenticated driver
 * request (header `X-Install-Id`), at most once a minute per install.
 */
const lastTouch = new Map<string, number>();
export function touchDriverDevice(req: Request, _res: Response, next: NextFunction) {
  const driverId = driverIdOf(req);
  const installId = req.header('x-install-id');
  if (driverId && installId && INSTALL_ID_RE.test(installId)) {
    const now = Date.now();
    if (now - (lastTouch.get(installId) ?? 0) > 60_000) {
      lastTouch.set(installId, now);
      prisma.driverDevice
        .updateMany({ where: { install_id: installId, driverId }, data: { lastSeenAt: new Date(now) } })
        .catch((err) => logger.warn({ err }, '[Phone] touch failed'));
    }
  }
  next();
}

export const reportHealth = async (req: Request, res: Response) => {
  const driverId = driverIdOf(req);
  if (!driverId) return res.status(403).json({ success: false, error: { message: 'Driver not authenticated' } });

  const installId = str(req.body?.install_id);
  if (!installId || !INSTALL_ID_RE.test(installId)) {
    return res.status(400).json({ success: false, error: { message: 'install_id is required' } });
  }

  try {
    const health = parseHealth(req.body);
    const token = str(req.body?.token, 255);
    const platform = str(req.body?.platform, 16);
    const { before, after } = await upsertDriverDevice(driverId, { installId, token, platform, health });

    // Permission changes are what break things silently — log each one.
    if (before && health) {
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      for (const key of ['notif_permission', 'location_permission', 'location_services_on'] as const) {
        if (health[key] != null && before[key] != null && before[key] !== health[key]) {
          changes[key] = { from: before[key], to: health[key] };
        }
      }
      if (Object.keys(changes).length) {
        await recordDriverActivity(driverId, 'PermissionChanged', { metadata: { changes, deviceId: after.id } });
      }
    }
    if (req.body?.event === 'AppOpened') {
      await recordDriverActivity(driverId, 'AppOpened', {
        lat: req.body?.lat,
        lng: req.body?.lng,
        metadata: { app_version: after.app_version, network_type: after.network_type },
      });
    }

    const minVersion = await getDriverAppMinVersion();
    res.json({
      success: true,
      data: { minVersion, updateRequired: isBelowMinVersion(after.app_version, minVersion) },
    });
  } catch (error: any) {
    logger.error({ err: error }, 'reportHealth error');
    res.status(500).json({ success: false, error: { message: 'Failed to save phone status' } });
  }
};

export const logoutDevice = async (req: Request, res: Response) => {
  const driverId = driverIdOf(req);
  if (!driverId) return res.status(403).json({ success: false, error: { message: 'Driver not authenticated' } });
  const installId = str(req.body?.install_id);
  const token = str(req.body?.token, 255);
  try {
    const or = [installId ? { install_id: installId } : null, token ? { token } : null].filter(Boolean) as any[];
    if (or.length) {
      await prisma.driverDevice.updateMany({ where: { driverId, OR: or }, data: { isActive: false } });
    }
    await recordDriverActivity(driverId, 'Logout', { metadata: { install_id: installId } });
    res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, 'logoutDevice error');
    res.status(500).json({ success: false, error: { message: 'Failed to log out device' } });
  }
};

export const markNotificationOpened = async (req: Request, res: Response) => {
  const driverId = driverIdOf(req);
  const id = req.params.id as string;
  if (!driverId) return res.status(403).json({ success: false, error: { message: 'Driver not authenticated' } });
  try {
    const now = new Date();
    // First open only; opening also counts as read.
    await prisma.notification.updateMany({ where: { id, driverId, opened_at: null }, data: { opened_at: now } });
    await prisma.notification.updateMany({ where: { id, driverId, read_at: null }, data: { read_at: now, is_read: true } });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: 'Failed to record notification open' } });
  }
};

const CLOSED: TripStatus[] = [TripStatus.Completed, TripStatus.Invoiced, TripStatus.Cancelled];

/** Trips assigned to this driver whose latest assignment hasn't been acknowledged. */
export async function findPendingAcknowledgements(driverId: string) {
  const assigned = await prisma.notification.findMany({
    where: { driverId, type: 'TripAssigned', entity_type: 'Trip', createdAt: { gte: new Date(Date.now() - 14 * 24 * 3600_000) } },
    select: { entity_id: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  const latest = new Map<string, Date>();
  for (const n of assigned) if (n.entity_id && !latest.has(n.entity_id)) latest.set(n.entity_id, n.createdAt);
  if (latest.size === 0) return [];

  const ids = [...latest.keys()];
  const [trips, acks] = await Promise.all([
    prisma.trip.findMany({
      where: { id: { in: ids }, driverId, deletedAt: null, status: { notIn: CLOSED } },
      select: {
        id: true,
        ref_id: true,
        planned_start: true,
        customer: { select: { name: true } },
        stops: {
          where: { deletedAt: null },
          orderBy: { stop_sequence: 'asc' },
          select: { stop_type: true, location_name: true },
        },
      },
    }),
    prisma.tripAcknowledgement.findMany({ where: { tripId: { in: ids }, driverId }, select: { tripId: true, createdAt: true } }),
  ]);
  return trips
    .filter((t) => !acks.some((a) => a.tripId === t.id && a.createdAt >= (latest.get(t.id) as Date)))
    .map((t) => ({
      id: t.id,
      ref_id: t.ref_id,
      planned_start: t.planned_start,
      customer: t.customer?.name ?? null,
      from: t.stops[0]?.location_name ?? null,
      to: t.stops.length > 1 ? t.stops[t.stops.length - 1].location_name : null,
      assigned_at: latest.get(t.id),
    }))
    .sort((a, b) => (a.planned_start?.getTime() ?? 0) - (b.planned_start?.getTime() ?? 0));
}

export const getPendingAcknowledgements = async (req: Request, res: Response) => {
  const driverId = driverIdOf(req);
  if (!driverId) return res.status(403).json({ success: false, error: { message: 'Driver not authenticated' } });
  try {
    res.json({ success: true, data: await findPendingAcknowledgements(driverId) });
  } catch (error: any) {
    logger.error({ err: error }, 'getPendingAcknowledgements error');
    res.status(500).json({ success: false, error: { message: 'Failed to load trips to acknowledge' } });
  }
};

export const acknowledgeTrip = async (req: Request, res: Response) => {
  const driverId = driverIdOf(req);
  const id = req.params.id as string;
  if (!driverId) return res.status(403).json({ success: false, error: { message: 'Driver not authenticated' } });
  try {
    const trip = await prisma.trip.findFirst({ where: { id, driverId, deletedAt: null }, select: { id: true, ref_id: true } });
    if (!trip) return res.status(404).json({ success: false, error: { message: 'Trip not found or not assigned to you' } });

    const lat = num(req.body?.lat);
    const lng = num(req.body?.lng);
    const ack = await prisma.tripAcknowledgement.create({
      data: {
        tripId: id,
        driverId,
        lat: lat != null && Math.abs(lat) <= 90 ? lat : null,
        lng: lng != null && Math.abs(lng) <= 180 ? lng : null,
      },
    });
    await recordDriverActivity(driverId, 'Acknowledged', { tripId: id, lat, lng });
    void notifyStaffOfTripAcknowledged(driverId, id, publicBaseUrl(req));
    res.status(201).json({ success: true, data: ack });
  } catch (error: any) {
    logger.error({ err: error }, 'acknowledgeTrip error');
    res.status(500).json({ success: false, error: { message: 'Failed to acknowledge trip' } });
  }
};

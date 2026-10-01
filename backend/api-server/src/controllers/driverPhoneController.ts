/**
 * Driver phone audit — dashboard endpoints (Admin, Operator).
 *   GET  /drivers/phone-status          dot + reasons for every driver
 *   GET  /drivers/:id/phone             devices, status, recent pushes, activity
 *   POST /drivers/:id/test-push         send a test notification
 *   GET  /trips/:id/driver-trail        notifications/acks/activity for one trip
 *   GET  /operator-inbox/attention      the inbox "Attention" tab
 *   PUT  /settings/driver-app-version   minimum driver-app version (Admin)
 * Plan: docs/DRIVER_PHONE_AUDIT_PLAN.md.
 */
import { Request, Response } from 'express';
import { prisma } from '../db';
import { logger } from '../utils/logger';
import { createDriverNotification } from './notificationController';
import { logAuditEvent } from '../services/auditService';
import { computePhoneStatus } from '../services/driverPhone/rules';
import {
  computeAttention,
  getDriverAppMinVersion,
  getLatestDriverAppVersion,
  loadDevicesByDriver,
  pushFailureText,
} from '../services/driverPhone/attention';

const fail = (res: Response, err: unknown, message: string) => {
  logger.error({ err }, message);
  return res.status(500).json({ success: false, error: { message } });
};

const DEVICE_SELECT = {
  id: true,
  install_id: true,
  token: true,
  platform: true,
  isActive: true,
  lastSeenAt: true,
  createdAt: true,
  app_version: true,
  build_number: true,
  os_name: true,
  os_version: true,
  device_model: true,
  notif_permission: true,
  location_permission: true,
  location_services_on: true,
  battery_level: true,
  low_power_mode: true,
  network_type: true,
  health_reported_at: true,
} as const;

const DELIVERY_SELECT = {
  id: true,
  status: true,
  error_code: true,
  error_message: true,
  attempts: true,
  sent_at: true,
  receipt_checked_at: true,
  device: { select: { platform: true, device_model: true } },
} as const;

/** Notification + its deliveries → one row the dashboard can render. */
function trailRow(n: {
  id: string;
  title: string;
  message: string;
  type: string;
  createdAt: Date;
  opened_at: Date | null;
  read_at: Date | null;
  is_read: boolean;
  entity_type: string | null;
  entity_id: string | null;
  pushDeliveries: Array<{
    id: string;
    status: string;
    error_code: string | null;
    error_message: string | null;
    attempts: number;
    sent_at: Date;
    receipt_checked_at: Date | null;
    device: { platform: string; device_model: string | null } | null;
  }>;
}) {
  const deliveries = n.pushDeliveries.map((d) => ({
    ...d,
    reason: d.status === 'Failed' || d.status === 'NoDevice' ? pushFailureText(d.status, d.error_code, d.error_message) : null,
  }));
  // Best outcome across the driver's phones decides the summary.
  const rank = ['Delivered', 'Sent', 'Unknown', 'Failed', 'NoDevice'];
  const push =
    deliveries.length === 0
      ? null
      : deliveries.map((d) => d.status).sort((a, b) => rank.indexOf(a) - rank.indexOf(b))[0];
  return {
    id: n.id,
    title: n.title,
    message: n.message,
    type: n.type,
    entity_type: n.entity_type,
    entity_id: n.entity_id,
    createdAt: n.createdAt,
    opened_at: n.opened_at,
    read_at: n.read_at ?? (n.is_read ? n.opened_at : null),
    is_read: n.is_read,
    push,
    deliveries,
  };
}

const TRAIL_SELECT = {
  id: true,
  title: true,
  message: true,
  type: true,
  createdAt: true,
  opened_at: true,
  read_at: true,
  is_read: true,
  entity_type: true,
  entity_id: true,
  pushDeliveries: { select: DELIVERY_SELECT, orderBy: { sent_at: 'asc' as const } },
} as const;

export const getDriversPhoneStatus = async (_req: Request, res: Response) => {
  try {
    const drivers = await prisma.driver.findMany({ where: { deletedAt: null }, select: { id: true } });
    const [devices, minVersion, latestVersion] = await Promise.all([
      loadDevicesByDriver(drivers.map((d) => d.id)),
      getDriverAppMinVersion(),
      getLatestDriverAppVersion(),
    ]);
    const now = new Date();
    const data = drivers.map((d) => {
      const st = computePhoneStatus(devices.get(d.id) ?? [], { now, minVersion, latestVersion });
      return {
        driverId: d.id,
        level: st.level,
        reasons: st.reasons,
        lastSeenAt: st.lastSeenAt,
        platform: st.device?.platform ?? null,
        app_version: st.device?.app_version ?? null,
      };
    });
    res.json({ success: true, data });
  } catch (err) {
    return fail(res, err, 'Failed to load driver phone status');
  }
};

export const getDriverPhone = async (req: Request, res: Response) => {
  const driverId = req.params.id as string;
  try {
    const driver = await prisma.driver.findFirst({ where: { id: driverId, deletedAt: null }, select: { id: true } });
    if (!driver) return res.status(404).json({ success: false, error: { message: 'Driver not found' } });

    const [devices, minVersion, latestVersion, notifications, activity] = await Promise.all([
      prisma.driverDevice.findMany({ where: { driverId }, select: DEVICE_SELECT, orderBy: { lastSeenAt: 'desc' } }),
      getDriverAppMinVersion(),
      getLatestDriverAppVersion(),
      prisma.notification.findMany({ where: { driverId }, select: TRAIL_SELECT, orderBy: { createdAt: 'desc' }, take: 30 }),
      prisma.driverActivityEvent.findMany({
        where: { driverId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { trip: { select: { ref_id: true } } },
      }),
    ]);
    const status = computePhoneStatus(devices, { minVersion, latestVersion });

    res.json({
      success: true,
      data: {
        status: { level: status.level, reasons: status.reasons, lastSeenAt: status.lastSeenAt },
        minVersion,
        latestVersion,
        // Never send push tokens to the browser — just whether there is one.
        devices: devices.map(({ token, ...d }) => ({ ...d, hasPushToken: !!token })),
        notifications: notifications.map(trailRow),
        activity: activity.map(({ trip, ...a }) => ({ ...a, tripRef: trip?.ref_id ?? null })),
      },
    });
  } catch (err) {
    return fail(res, err, 'Failed to load driver phone');
  }
};

export const sendTestPush = async (req: Request, res: Response) => {
  const driverId = req.params.id as string;
  try {
    const driver = await prisma.driver.findFirst({
      where: { id: driverId, deletedAt: null },
      select: { id: true, first_name: true, last_name: true },
    });
    if (!driver) return res.status(404).json({ success: false, error: { message: 'Driver not found' } });

    const notification = await createDriverNotification(
      driverId,
      'Test notification',
      'This is a test from the MERCON office to check your phone receives alerts. No action needed.',
      'TestPush',
    );
    await logAuditEvent({
      req,
      action: 'DRIVER_TEST_PUSH',
      entityType: 'Driver',
      entityId: driverId,
      metadata: { notificationId: notification?.id, driver: `${driver.first_name} ${driver.last_name}` },
    });
    res.status(201).json({ success: true, data: { notificationId: notification?.id ?? null } });
  } catch (err) {
    return fail(res, err, 'Failed to send test notification');
  }
};

export const getTripDriverTrail = async (req: Request, res: Response) => {
  const tripId = req.params.id as string;
  try {
    const [notifications, acks, activity] = await Promise.all([
      prisma.notification.findMany({
        where: { entity_type: 'Trip', entity_id: tripId, driverId: { not: null } },
        select: { ...TRAIL_SELECT, driver: { select: { id: true, first_name: true, last_name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.tripAcknowledgement.findMany({
        where: { tripId },
        orderBy: { createdAt: 'asc' },
        include: { driver: { select: { first_name: true, last_name: true } } },
      }),
      prisma.driverActivityEvent.findMany({
        where: { tripId, type: { notIn: ['Acknowledged'] } },
        orderBy: { createdAt: 'asc' },
        take: 300,
      }),
    ]);
    res.json({
      success: true,
      data: {
        notifications: notifications.map(({ driver, ...n }) => ({
          ...trailRow(n),
          driverId: driver?.id ?? null,
          driverName: driver ? `${driver.first_name} ${driver.last_name}` : null,
        })),
        acknowledgements: acks.map((a) => ({
          id: a.id,
          driverId: a.driverId,
          driverName: `${a.driver.first_name} ${a.driver.last_name}`,
          createdAt: a.createdAt,
          lat: a.lat,
          lng: a.lng,
        })),
        activity,
      },
    });
  } catch (err) {
    return fail(res, err, 'Failed to load the driver trail');
  }
};

export const getAttention = async (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await computeAttention() });
  } catch (err) {
    return fail(res, err, 'Failed to load items needing attention');
  }
};

const VERSION_RE = /^\d{1,4}(\.\d{1,4}){0,3}$/;

export const updateDriverAppMinVersion = async (req: Request, res: Response) => {
  const raw = req.body?.minVersion;
  const minVersion = typeof raw === 'string' && raw.trim() ? raw.trim() : null;
  if (raw != null && raw !== '' && (!minVersion || !VERSION_RE.test(minVersion))) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Version must look like 1.2.0, or be empty to switch the check off' } });
  }
  try {
    const userId = (req as any).user?.id;
    const settings = await prisma.settings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', driverAppMinVersion: minVersion, updated_by: userId },
      update: { driverAppMinVersion: minVersion, updated_by: userId },
    });
    await logAuditEvent({ req, action: 'DRIVER_APP_MIN_VERSION_UPDATED', entityType: 'Settings', entityId: 'singleton', metadata: { minVersion } });
    res.json({ success: true, data: { driverAppMinVersion: settings.driverAppMinVersion } });
  } catch (err) {
    return fail(res, err, 'Failed to update the minimum app version');
  }
};

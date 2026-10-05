/**
 * Driver updates → staff alerts. Every step a driver takes in the app (start,
 * arrive, load, finish a stop, deliver, complete, report a delay, send photos,
 * "Got it" on a trip) becomes a notification for every active Admin and
 * Operator, which createNotification also pushes to their operator-app phones.
 *
 * Not updates: GPS pings, and app/phone state (opened, online, permissions) —
 * a phone that stops working already reaches staff through driverWatch.
 *
 * Best-effort like the delay and emergency broadcasts: never throws, so a
 * failed alert can't fail or slow down the driver's request (callers `void` it).
 */
import { Role } from '@prisma/client';
import { prisma } from '../../db';
import { logger } from '../../utils/logger';
import { createNotification } from '../../controllers/notificationController';
import {
  describeTripAcknowledged,
  describeTripPhoto,
  describeTripStatusChange,
  driverDisplayName,
  tripName,
  type DriverUpdateContext,
  type StaffAlert,
  type TripPhotoUpload,
  type TripStatusChange,
} from './messages';

/** Photos of one step arrive one upload at a time — one alert per this window. */
const PHOTO_BATCH_MS = 15 * 60_000;
/** The app may send "Got it" again (retry, second phone); one alert is enough. */
const ACK_REPEAT_MS = 15 * 60_000;

async function loadContext(tripId: string, driverId: string): Promise<DriverUpdateContext | null> {
  const [trip, driver] = await Promise.all([
    prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        ref_id: true,
        stops: {
          where: { deletedAt: null },
          orderBy: { stop_sequence: 'asc' },
          select: {
            id: true,
            stop_sequence: true,
            leg_index: true,
            stop_type: true,
            location_name: true,
            location_address: true,
            location: { select: { name: true, address: true } },
          },
        },
      },
    }),
    prisma.driver.findUnique({ where: { id: driverId }, select: { first_name: true, last_name: true } }),
  ]);
  if (!trip) return null;
  return { trip: tripName(trip.ref_id), driverName: driverDisplayName(driver), stops: trip.stops };
}

/** Sends one alert to every active Admin and Operator (each also gets a push). */
async function notifyAllStaff(type: string, tripId: string, a: StaffAlert, repeatWithinMs?: number): Promise<void> {
  if (repeatWithinMs) {
    const recent = await prisma.notification.findFirst({
      where: {
        type,
        entity_type: 'Trip',
        entity_id: tripId,
        message: a.message,
        userId: { not: null },
        createdAt: { gte: new Date(Date.now() - repeatWithinMs) },
      },
      select: { id: true },
    });
    if (recent) return;
  }
  const staff = await prisma.user.findMany({
    where: { role: { in: [Role.Admin, Role.Operator] }, isActive: true, deletedAt: null },
    select: { id: true },
  });
  await Promise.all(staff.map((u) => createNotification(u.id, a.title, a.message, type, 'Trip', tripId)));
}

export async function notifyStaffOfTripStatus(driverId: string, tripId: string, change: TripStatusChange): Promise<void> {
  try {
    const ctx = await loadContext(tripId, driverId);
    const a = ctx && describeTripStatusChange(change, ctx);
    if (!a) return;
    await notifyAllStaff(change.delayReason?.trim() ? 'DriverDelay' : 'TripUpdate', tripId, a);
  } catch (error) {
    logger.error({ err: error, tripId, driverId }, '[StaffAlerts] Failed to alert staff of a status update');
  }
}

export async function notifyStaffOfTripPhoto(driverId: string, tripId: string, upload: TripPhotoUpload): Promise<void> {
  try {
    const ctx = await loadContext(tripId, driverId);
    if (!ctx) return;
    await notifyAllStaff('TripPhoto', tripId, describeTripPhoto(upload, ctx), PHOTO_BATCH_MS);
  } catch (error) {
    logger.error({ err: error, tripId, driverId }, '[StaffAlerts] Failed to alert staff of a trip photo');
  }
}

export async function notifyStaffOfTripAcknowledged(driverId: string, tripId: string): Promise<void> {
  try {
    const ctx = await loadContext(tripId, driverId);
    if (!ctx) return;
    await notifyAllStaff('TripAcknowledged', tripId, describeTripAcknowledged(ctx), ACK_REPEAT_MS);
  } catch (error) {
    logger.error({ err: error, tripId, driverId }, '[StaffAlerts] Failed to alert staff of a trip acknowledgement');
  }
}

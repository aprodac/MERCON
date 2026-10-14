/**
 * When a driver hears about a trip ("Trip Assigned" push + the "Got it"
 * prompt). A month plan books 20–30 trips at once; telling the driver about
 * all of them on the spot buried them in alerts. Each trip is announced on
 * its own day instead:
 *
 *   at 07:00 (deployment timezone) on the day the trip starts,
 *   or 12 h before pickup when that is earlier (early-morning / night pickups)
 *
 * A trip already inside that window is announced at once, as before. The
 * driverWatch job sends the rest when they fall due. The "Trip Assigned"
 * notification row is what the driver app's "Got it" list and the office's
 * "not acknowledged" alert read, so they follow the same schedule.
 */
import { TripStatus } from '@prisma/client';
import { dateInZone, zonedWallTimeToUtcIso } from '@mercon/shared-types';
import { prisma } from '../../db';
import { logger } from '../../utils/logger';
import { createDriverNotification } from '../../controllers/notificationController';

const HOUR = 3_600_000;
export const ASSIGNMENT_NOTICE = {
  /** Local time on the trip day when its notice goes out. */
  morning: '07:00',
  /** Never later than this before pickup. */
  maxLeadMs: 12 * HOUR,
  /** Trips that started longer ago than this are never announced late. */
  staleAfterMs: 24 * HOUR,
} as const;

/** When the driver should be told about a trip starting at `plannedStart`. Pure. */
export function assignmentNoticeAt(plannedStart: Date, tz: string): Date {
  const start = plannedStart.getTime();
  let morning: number;
  try {
    morning = Date.parse(zonedWallTimeToUtcIso(dateInZone(start, tz), ASSIGNMENT_NOTICE.morning, tz));
  } catch {
    morning = start - ASSIGNMENT_NOTICE.maxLeadMs;
  }
  return new Date(Math.min(morning, start - ASSIGNMENT_NOTICE.maxLeadMs));
}

async function deploymentTimezone(): Promise<string> {
  const s = await prisma.settings.findFirst({ select: { timezone: true } }).catch(() => null);
  return s?.timezone || 'Asia/Riyadh';
}

async function sendNotice(driverId: string, trip: { id: string; ref_id: string | null }) {
  await createDriverNotification(
    driverId,
    'Trip Assigned',
    `You've been assigned trip ${trip.ref_id ?? ''}. Open the app to start.`.replace('  ', ' '),
    'TripAssigned',
    'Trip',
    trip.id,
    { tripId: trip.id, ref_id: trip.ref_id, event: 'TripAssigned' },
  );
}

/**
 * Tell the driver about a trip now if it is due, else leave it to
 * `sendDueAssignmentNotices`. Returns whether the notice went out now.
 */
export async function notifyDriverAssigned(driverId: string, trip: { id: string; ref_id: string | null }, now = new Date()): Promise<boolean> {
  try {
    const row = await prisma.trip.findUnique({ where: { id: trip.id }, select: { planned_start: true } });
    if (row?.planned_start && assignmentNoticeAt(row.planned_start, await deploymentTimezone()) > now) {
      return false;
    }
    await sendNotice(driverId, trip);
    return true;
  } catch (err) {
    logger.error({ err }, 'Failed to send driver assignment notification');
    return false;
  }
}

/**
 * Whether the driver has been told about this trip. A month-plan trip that is
 * cancelled or reassigned before its day was never announced, so the driver
 * gets no "cancelled" / "no longer yours" message about it either.
 */
export async function driverWasTold(driverId: string, tripId: string): Promise<boolean> {
  const n = await prisma.notification.findFirst({
    where: { driverId, type: 'TripAssigned', entity_type: 'Trip', entity_id: tripId },
    select: { id: true },
  }).catch(() => ({ id: 'unknown' }));
  return !!n;
}

/**
 * Sends every assignment notice that has fallen due: planned trips with a
 * driver, starting soon, whose driver hasn't been told about them yet.
 * Idempotent (skips trips that already have a notice for that driver).
 */
export async function sendDueAssignmentNotices(now = new Date()): Promise<number> {
  const tz = await deploymentTimezone();
  const t = now.getTime();
  // The notice is never more than ~31 h before pickup (07:00 the day before a 23:59 night pickup … 12 h lead).
  const trips = await prisma.trip.findMany({
    where: {
      deletedAt: null,
      status: TripStatus.Scheduled,
      driverId: { not: null },
      planned_start: { gt: new Date(t - ASSIGNMENT_NOTICE.staleAfterMs), lt: new Date(t + 36 * HOUR) },
    },
    select: { id: true, ref_id: true, driverId: true, planned_start: true },
    take: 500,
  });
  const due = trips.filter((tr) => tr.planned_start && assignmentNoticeAt(tr.planned_start, tz).getTime() <= t);
  if (!due.length) return 0;

  const told = await prisma.notification.findMany({
    where: { type: 'TripAssigned', entity_type: 'Trip', entity_id: { in: due.map((tr) => tr.id) } },
    select: { entity_id: true, driverId: true },
  });
  const done = new Set(told.map((n) => `${n.entity_id}:${n.driverId}`));
  let sent = 0;
  for (const tr of due) {
    if (!tr.driverId || done.has(`${tr.id}:${tr.driverId}`)) continue;
    await sendNotice(tr.driverId, tr).catch((err) => logger.warn({ err, tripId: tr.id }, '[AssignmentNotice] Send failed'));
    sent++;
  }
  if (sent) logger.info({ sent }, '[AssignmentNotice] Sent the day\'s trip notices');
  return sent;
}

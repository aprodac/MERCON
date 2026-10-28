/**
 * Deleting a finished trip. A Completed trip whose charges were reviewed
 * ("settled" after delivery) may still be deleted — only an invoiced or paid
 * trip is kept (TestFlight 26 Oct: "Should be able to delete trips even the
 * drivers has uploaded pod's … but with a warning and notification to other
 * operators"). The app warns before; every other active Admin / Operator gets
 * a notification afterwards. Permanent delete from Trash keeps the stricter
 * rule (isFinanciallyProtectedTrip).
 */
import { Role, TripStatus } from '@prisma/client';
import { prisma } from '../db';
import { logger } from '../utils/logger';
import { createNotification } from '../controllers/notificationController';

/** Kept from a soft delete: invoiced, paid, or money received against it. */
export function blocksTripDelete(trip: { status: string; paid_amount?: unknown }): boolean {
  const s = (trip.status || '').trim().toUpperCase();
  if (s === 'INVOICED' || s === 'PAID') return true;
  return trip.paid_amount != null && Number(trip.paid_amount) > 0;
}

/** "Admin deleted completed trip TRP-0066" / "… 3 completed trips: TRP-1, TRP-2, TRP-3". */
export function completedDeleteMessage(who: string, refs: string[]): { title: string; message: string } {
  const one = refs.length === 1;
  return {
    title: one ? `Completed trip ${refs[0]} deleted` : `${refs.length} completed trips deleted`,
    message: `${who} deleted ${one ? `completed trip ${refs[0]}` : `${refs.length} completed trips: ${refs.join(', ')}`}. Its photos and proof of delivery went with it — an Admin can restore it from Trash.`,
  };
}

/** Tells every other active Admin / Operator. Best-effort: never throws. */
export async function notifyCompletedTripsDeleted(
  trips: Array<{ id: string; ref_id: string | null; status: string }>,
  userId: string | null | undefined,
): Promise<void> {
  try {
    const done = trips.filter((t) => t.status === TripStatus.Completed);
    if (!done.length) return;
    const [me, staff] = await Promise.all([
      userId ? prisma.user.findUnique({ where: { id: userId }, select: { name: true, username: true } }) : null,
      prisma.user.findMany({
        where: { role: { in: [Role.Admin, Role.Operator] }, isActive: true, deletedAt: null, ...(userId ? { id: { not: userId } } : {}) },
        select: { id: true },
      }),
    ]);
    const who = me?.name?.trim() || me?.username || 'Someone';
    const { title, message } = completedDeleteMessage(who, done.map((t) => t.ref_id?.replace('TRP-DEL-', 'TRP-') ?? 'a trip'));
    await Promise.all(staff.map((u) => createNotification(u.id, title, message, 'TRIP_DELETED', 'Trip', done.length === 1 ? done[0].id : undefined)));
  } catch (err) {
    logger.warn({ err }, 'Could not notify staff of deleted completed trips');
  }
}

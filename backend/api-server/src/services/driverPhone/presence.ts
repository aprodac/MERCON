/**
 * Online / offline entries in the driver activity log, from the driver app's
 * socket connection.
 *
 * A dropped connection is only logged as "WentOffline" if the driver is still
 * disconnected after a grace period — tunnels, lifts and app switches drop
 * the socket for seconds at a time and would otherwise flood the log. The
 * matching "CameOnline" is logged only after a logged "WentOffline".
 * State is in memory: after an API restart nobody is "offline", so the
 * reconnect wave doesn't log anything.
 */
import { prisma } from '../../db';
import { recordDriverActivity } from './activity';

const GRACE_MS = 2 * 60_000;

const pendingOffline = new Map<string, NodeJS.Timeout>();
const offlineSince = new Map<string, Date>();

export function driverSocketConnected(driverId: string): void {
  const pending = pendingOffline.get(driverId);
  if (pending) {
    clearTimeout(pending);
    pendingOffline.delete(driverId);
  }
  const since = offlineSince.get(driverId);
  if (since) {
    offlineSince.delete(driverId);
    void recordDriverActivity(driverId, 'CameOnline', {
      metadata: { offlineMinutes: Math.round((Date.now() - since.getTime()) / 60_000) },
    });
  }
}

export function driverSocketDisconnected(driverId: string, stillConnected: () => boolean): void {
  if (pendingOffline.has(driverId)) return;
  const timer = setTimeout(async () => {
    pendingOffline.delete(driverId);
    if (stillConnected()) return;
    const at = new Date(Date.now() - GRACE_MS);
    offlineSince.set(driverId, at);
    // Tie it to the active trip, if any, so it shows on that trip's timeline.
    const trip = await prisma.trip
      .findFirst({
        where: { driverId, deletedAt: null, status: { in: ['Loading', 'InTransit', 'Delayed'] } },
        select: { id: true },
      })
      .catch(() => null);
    void recordDriverActivity(driverId, 'WentOffline', { tripId: trip?.id ?? null });
  }, GRACE_MS);
  timer.unref?.();
  pendingOffline.set(driverId, timer);
}

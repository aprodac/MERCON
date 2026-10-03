/**
 * driverWatch — the timed job behind the driver phone audit
 * (docs/DRIVER_PHONE_AUDIT_PLAN.md). Ticks every minute inside the API
 * process, like tripDelayMonitor, and runs each check on its own cadence:
 *
 *  - push receipts (5 min):  ask Expo whether Apple/Google accepted each push
 *  - push retry   (5 min):   re-send pushes that failed because Expo was unreachable
 *  - alerts       (5 min):   driver not ready / trip not acknowledged / silent driver
 *                            → one notification to every Admin and Operator
 *  - cleanup      (daily):   delete activity + push history past retention
 *
 * Every step is idempotent and alerts are de-duplicated against existing
 * notifications, so a second API container running it does no harm.
 */
import { Role } from '@prisma/client';
import { prisma } from '../../db';
import { logger } from '../../utils/logger';
import { createNotification } from '../../controllers/notificationController';
import { checkPushReceipts, retryPushDelivery } from '../pushNotificationService';
import { computeAttention, type AttentionItem } from '../driverPhone/attention';
import { isRetryablePushError, WATCH_TIMINGS } from '../driverPhone/rules';

const TICK_MS = 60_000;
const FIVE_MIN = 5 * 60_000;
const DAY = 24 * 3600_000;

let timer: NodeJS.Timeout | null = null;
let running = false;
const lastRun: Record<string, number> = {};

function due(key: string, everyMs: number, now: number): boolean {
  if (now - (lastRun[key] ?? 0) < everyMs) return false;
  lastRun[key] = now;
  return true;
}

async function retryFailedPushes(now: Date): Promise<number> {
  const rows = await prisma.pushDelivery.findMany({
    where: {
      status: 'Failed',
      attempts: { lt: WATCH_TIMINGS.maxPushAttempts },
      error_code: { in: ['ExpoUnreachable', 'MessageRateExceeded'] },
      // Back off: wait 2, then 4 minutes between attempts; never retry after an hour.
      sent_at: { lt: new Date(now.getTime() - 2 * 60_000), gt: new Date(now.getTime() - 3600_000) },
    },
    select: { id: true, error_code: true, attempts: true, sent_at: true },
    take: 200,
  });
  let retried = 0;
  for (const r of rows) {
    if (!isRetryablePushError(r.error_code)) continue;
    if (now.getTime() - r.sent_at.getTime() < r.attempts * 2 * 60_000) continue;
    await retryPushDelivery(r.id).catch((err) => logger.warn({ err, id: r.id }, '[DriverWatch] Retry failed'));
    retried++;
  }
  return retried;
}

const ALERT: Partial<Record<AttentionItem['kind'], { type: string; title: string }>> = {
  NotReady: { type: 'DriverNotReady', title: 'Driver phone not ready' },
  NotAcknowledged: { type: 'TripNotAcknowledged', title: 'Trip not acknowledged' },
  Silent: { type: 'DriverSilent', title: 'Driver app silent' },
};

/** Turns the serious attention items into operator notifications, once per trip per window. */
async function sendAlerts(now: Date): Promise<number> {
  const items = await computeAttention(now);
  const toSend = items.filter((i) => ALERT[i.kind] && i.tripId && (i.kind !== 'NotReady' || i.level === 'red'));
  if (toSend.length === 0) return 0;

  const staff = await prisma.user.findMany({
    where: { role: { in: [Role.Admin, Role.Operator] }, isActive: true, deletedAt: null },
    select: { id: true },
  });
  if (staff.length === 0) return 0;

  let sent = 0;
  for (const item of toSend) {
    const { type, title } = ALERT[item.kind]!;
    const recent = await prisma.notification.findFirst({
      where: {
        type,
        entity_type: 'Trip',
        entity_id: item.tripId,
        userId: { not: null },
        createdAt: { gte: new Date(now.getTime() - WATCH_TIMINGS.alertDedupeMs) },
      },
      select: { id: true },
    });
    if (recent) continue;

    const trip = item.tripRef ? `Trip ${item.tripRef}` : 'A trip';
    const message =
      item.kind === 'NotReady'
        ? `${trip} starts soon but ${item.driverName}'s phone isn't ready: ${item.reasons.slice(0, 3).join('; ')}.`
        : `${trip} — ${item.driverName}: ${item.detail}.${item.driverPhone ? ` Call ${item.driverPhone}.` : ''}`;
    await Promise.all(staff.map((u) => createNotification(u.id, title, message, type, 'Trip', item.tripId as string)));
    sent++;
  }
  return sent;
}

async function cleanup(now: Date): Promise<void> {
  const before = new Date(now.getTime() - WATCH_TIMINGS.retentionMs);
  const [events, pushes] = await Promise.all([
    prisma.driverActivityEvent.deleteMany({ where: { createdAt: { lt: before } } }),
    prisma.pushDelivery.deleteMany({ where: { sent_at: { lt: before } } }),
  ]);
  if (events.count || pushes.count) {
    logger.info({ events: events.count, pushes: pushes.count }, '[DriverWatch] Removed history past retention');
  }
}

export async function runDriverWatch(now: Date = new Date()): Promise<void> {
  if (running) return;
  running = true;
  const t = now.getTime();
  try {
    const steps: Array<[string, number, () => Promise<unknown>]> = [
      ['receipts', FIVE_MIN, () => checkPushReceipts(now)],
      ['retry', FIVE_MIN, () => retryFailedPushes(now)],
      ['alerts', FIVE_MIN, () => sendAlerts(now)],
      ['cleanup', DAY, () => cleanup(now)],
    ];
    for (const [key, every, fn] of steps) {
      if (!due(key, every, t)) continue;
      try {
        const result = await fn();
        if (result && (typeof result === 'number' ? result > 0 : true)) {
          logger.debug({ step: key, result }, '[DriverWatch] Step done');
        }
      } catch (err) {
        logger.error({ err, step: key }, '[DriverWatch] Step failed');
      }
    }
  } finally {
    running = false;
  }
}

export function initDriverWatch(): void {
  if (timer) return;
  logger.info('[DriverWatch] Initializing driver phone watch (tick 60s)');
  // First pass a little after startup, so boot isn't slowed down.
  setTimeout(() => void runDriverWatch(), 20_000);
  timer = setInterval(() => void runDriverWatch(), TICK_MS);
}

export function stopDriverWatch(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

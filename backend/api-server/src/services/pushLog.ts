/**
 * Push log — did staff pushes reach the operator app, and how fast? For
 * Admins in the operator app (GET /notifications/push-log).
 *
 * One row per push to one staff phone (PushDelivery with a userDeviceId),
 * told the way the office asks about it:
 *   arrived    — the phone itself said it got it (iOS extension, received_at)
 *   delivered  — Apple / Google accepted it (Expo receipt); the phone hasn't
 *                said (Android never does)
 *   sending    — handed to Expo, Apple's / Google's answer not in yet
 *                (the receipt check runs ~15 min after sending)
 *   retrying   — Expo couldn't be reached; it is tried again
 *   failed     — it will not arrive; `reason` says why in plain words
 *   unknown    — the answer was never available (Expo keeps receipts ~24 h)
 * Delay is from the moment the alert was created to the moment the phone got
 * it, so retries count. Over a minute is "slow".
 */
import { Role } from '@prisma/client';
import { prisma } from '../db';
import { isRetryablePushError, WATCH_TIMINGS } from './driverPhone/rules';

export type PushOutcome = 'arrived' | 'delivered' | 'sending' | 'retrying' | 'failed' | 'unknown';
export type PushLogFilter = 'all' | 'failed' | 'slow';

export const SLOW_MS = 60_000;

const REASONS: Record<string, string> = {
  DeviceNotRegistered: 'The phone no longer accepts pushes from the app — it was uninstalled, signed out, or notifications were turned off.',
  InvalidCredentials: "The push keys for the app (Apple / Firebase) aren't set up or are wrong.",
  MismatchSenderId: "The Android push key (Firebase) doesn't match the app.",
  MessageTooBig: 'The message was too long to send.',
  MessageRateExceeded: 'Too many pushes to this phone at once.',
  ExpoUnreachable: "Couldn't reach the push service.",
  ExpoBadResponse: 'The push service gave an unexpected answer.',
};

export function plainReason(code: string | null | undefined, message?: string | null): string | null {
  if (!code) return message ?? null;
  return REASONS[code] ?? message ?? code;
}

export interface DeliveryFacts {
  status: string;
  error_code: string | null;
  attempts: number;
  received_at: Date | null;
  createdAt: Date; // when the alert was made
}

export function outcomeOf(d: DeliveryFacts): PushOutcome {
  if (d.received_at) return 'arrived';
  switch (d.status) {
    case 'Delivered':
      return 'delivered';
    case 'Sent':
    case 'Sending':
      return 'sending';
    case 'Failed':
      return isRetryablePushError(d.error_code) && d.attempts < WATCH_TIMINGS.maxPushAttempts ? 'retrying' : 'failed';
    default:
      return 'unknown';
  }
}

export function delayMs(d: Pick<DeliveryFacts, 'received_at' | 'createdAt'>): number | null {
  return d.received_at ? Math.max(0, d.received_at.getTime() - d.createdAt.getTime()) : null;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export interface PushLogSummary {
  total: number;
  arrived: number;
  delivered: number;
  sending: number;
  failed: number;
  slow: number;
  /** Middle arrival delay, ms — null until a phone has reported one. */
  typicalDelayMs: number | null;
}

export function summarize(rows: DeliveryFacts[]): PushLogSummary {
  const delays: number[] = [];
  const s: PushLogSummary = { total: rows.length, arrived: 0, delivered: 0, sending: 0, failed: 0, slow: 0, typicalDelayMs: null };
  for (const r of rows) {
    const o = outcomeOf(r);
    if (o === 'arrived') s.arrived++;
    else if (o === 'delivered') s.delivered++;
    else if (o === 'sending' || o === 'retrying') s.sending++;
    else if (o === 'failed') s.failed++;
    const ms = delayMs(r);
    if (ms != null) {
      delays.push(ms);
      if (ms > SLOW_MS) s.slow++;
    }
  }
  s.typicalDelayMs = median(delays);
  return s;
}

const DAY_MS = 24 * 3600_000;

export async function loadPushLog(opts: { filter?: PushLogFilter; userId?: string | null; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const filter = opts.filter ?? 'all';
  const staffPush = {
    userDeviceId: { not: null },
    notification: { userId: opts.userId ? opts.userId : { not: null } },
  };

  const [last24h, recent, staff] = await Promise.all([
    prisma.pushDelivery.findMany({
      where: { ...staffPush, sent_at: { gte: new Date(now.getTime() - DAY_MS) } },
      select: { status: true, error_code: true, attempts: true, received_at: true, notification: { select: { createdAt: true } } },
    }),
    prisma.pushDelivery.findMany({
      where: {
        ...staffPush,
        sent_at: { gte: new Date(now.getTime() - 7 * DAY_MS) },
        // Failed and never reached the phone (a phone's own "arrived" outranks Apple's answer).
        ...(filter === 'failed' ? { status: 'Failed', received_at: null } : {}),
        ...(filter === 'slow' ? { received_at: { not: null } } : {}),
      },
      orderBy: { sent_at: 'desc' },
      take: filter === 'slow' ? 1000 : 200,
      select: {
        id: true,
        status: true,
        error_code: true,
        error_message: true,
        attempts: true,
        sent_at: true,
        received_at: true,
        receipt_checked_at: true,
        userDevice: { select: { id: true, platform: true } },
        notification: {
          select: {
            id: true,
            title: true,
            message: true,
            type: true,
            entity_type: true,
            entity_id: true,
            createdAt: true,
            is_read: true,
            user: { select: { id: true, name: true, username: true, role: true } },
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { role: { in: [Role.Admin, Role.Operator] }, isActive: true, deletedAt: null, ...(opts.userId ? { id: opts.userId } : {}) },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        devices: {
          orderBy: { lastSeenAt: 'desc' },
          select: { id: true, platform: true, isActive: true, lastSeenAt: true, token: true },
        },
      },
    }),
  ]);

  const items = recent
    .map((d) => {
      const facts = { ...d, createdAt: d.notification.createdAt };
      return {
        id: d.id,
        outcome: outcomeOf(facts),
        delayMs: delayMs(facts),
        reason: d.status === 'Failed' ? plainReason(d.error_code, d.error_message) : null,
        attempts: d.attempts,
        createdAt: d.notification.createdAt,
        sentAt: d.sent_at,
        receivedAt: d.received_at,
        appleGoogleCheckedAt: d.receipt_checked_at,
        title: d.notification.title,
        message: d.notification.message,
        type: d.notification.type,
        entity_type: d.notification.entity_type,
        entity_id: d.notification.entity_id,
        readInApp: d.notification.is_read,
        recipient: d.notification.user,
        phone: d.userDevice ? { id: d.userDevice.id, platform: d.userDevice.platform } : null,
      };
    })
    .filter((i) => filter !== 'slow' || (i.delayMs ?? 0) > SLOW_MS)
    .slice(0, 200);

  return {
    summary: summarize(last24h.map((d) => ({ ...d, createdAt: d.notification.createdAt }))),
    items,
    people: staff.map((u) => ({
      id: u.id,
      name: u.name,
      username: u.username,
      role: u.role,
      phones: u.devices.map((p) => ({
        id: p.id,
        platform: p.platform,
        pushOn: p.isActive && !!p.token,
        lastSeenAt: p.lastSeenAt,
      })),
    })),
    generatedAt: now,
  };
}

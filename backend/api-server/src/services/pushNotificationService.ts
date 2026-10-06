import axios from 'axios';
import { prisma } from '../db';
import { logger } from '../utils/logger';
import { WATCH_TIMINGS } from './driverPhone/rules';
import { pushReceiptLink, receiptBase } from './pushReceipts';

export interface ExpoPushMessage {
  to: string;
  sound?: 'default' | null;
  title: string;
  body: string;
  data?: Record<string, any>;
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
  /**
   * iOS: 'time-sensitive' shows the push at once even when the phone holds
   * ordinary ones back (a Focus such as Driving, the Scheduled Summary).
   * Needs the app's Time Sensitive entitlement; without it iOS treats it as 'active'.
   */
  interruptionLevel?: 'passive' | 'active' | 'time-sensitive' | 'critical';
  /** iOS: lets the operator app's Notification Service Extension rewrite the push. */
  mutableContent?: boolean;
  /** Android shows the image as the notification's picture. */
  richContent?: { image?: string };
}

/** Who a staff push is from, when it is a driver's own update. */
export interface PushSender {
  id: string;
  name: string;
  /** Full https link to their photo (signed — the phone fetches it without signing in). */
  image?: string | null;
}

/**
 * How a staff alert looks on the phone when it differs from the in-app
 * notification: a driver's update reads like a message from that driver
 * (their name as the title, their photo on Android; the iOS extension puts
 * the photo on iPhones).
 */
export interface StaffPushOptions {
  title?: string;
  body?: string;
  sender?: PushSender;
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const EXPO_HEADERS = {
  Accept: 'application/json',
  'Accept-Encoding': 'gzip, deflate',
  'Content-Type': 'application/json',
};

/**
 * The text a driver sees. The delay monitor tags its prompt with "[stop:<id>]"
 * so it can tell which stop it already asked about; that tag stays in the
 * database but never reaches the phone or the office trail.
 */
/**
 * Every driver push is about a trip they are driving now (assigned, cancelled,
 * late, phone needs attention) — on an iPhone it must not wait for the driver's
 * Focus or summary. Staff pushes already arrive at once as messages from the
 * driver (Communication Notifications), so they stay as they are.
 */
const DRIVER_PUSH = { sound: 'default', channelId: 'default', priority: 'high', interruptionLevel: 'time-sensitive' } as const;

export function visibleNotificationMessage(message: string): string {
  return message.replace(/\s*\[stop:[^\]]*\]/g, '');
}

export function isExpoPushToken(token: string | null | undefined): token is string {
  return !!token && (token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken['));
}

/** One phone to push to: a driver's DriverDevice or a staff UserDevice. */
interface Target {
  deviceId?: string;
  userDeviceId?: string;
  token: string;
  /** Existing PushDelivery row when this is a retry. */
  deliveryId?: string;
  /** Staff phones: the API address it uses, for the "it arrived" receipt link. */
  apiBase?: string | null;
}

/**
 * Hands messages to Expo and records the outcome of each one in PushDelivery:
 * `Sent` with the ticket id (the driverWatch job later fetches the receipt),
 * or `Failed` with Expo's error code. A token Expo says is no longer
 * registered deactivates its device so we stop sending to it.
 */
async function deliver(
  notificationId: string,
  targets: Target[],
  message: Omit<ExpoPushMessage, 'to'>,
): Promise<void> {
  if (targets.length === 0) return;

  // A staff phone reports arrival through a link naming its delivery row, so
  // that row is created before the push goes out (status 'Sending').
  const created = new Set<Target>();
  for (const t of targets) {
    if (t.deliveryId || !t.userDeviceId || !receiptBase(t.apiBase)) continue;
    const row = await prisma.pushDelivery.create({
      data: { notificationId, userDeviceId: t.userDeviceId, status: 'Sending' },
      select: { id: true },
    });
    t.deliveryId = row.id;
    created.add(t);
  }
  const receiptOf = (t: Target) => (t.userDeviceId && t.deliveryId ? pushReceiptLink(t.apiBase, t.deliveryId) : null);

  const record = async (t: Target, data: { status: string; expo_ticket_id?: string | null; error_code?: string | null; error_message?: string | null }) => {
    if (created.has(t)) {
      await prisma.pushDelivery.update({ where: { id: t.deliveryId }, data: { ...data, sent_at: new Date() } });
    } else if (t.deliveryId) {
      await prisma.pushDelivery.update({
        where: { id: t.deliveryId },
        data: { ...data, attempts: { increment: 1 }, sent_at: new Date() },
      });
    } else {
      await prisma.pushDelivery.create({
        data: { notificationId, deviceId: t.deviceId ?? null, userDeviceId: t.userDeviceId ?? null, ...data },
      });
    }
  };

  let tickets: any[] | null = null;
  try {
    const response = await axios.post(
      EXPO_PUSH_URL,
      targets.map((t) => {
        const receipt = receiptOf(t);
        return { to: t.token, ...message, ...(receipt ? { data: { ...message.data, receipt } } : {}) };
      }),
      { headers: EXPO_HEADERS, timeout: 10000 },
    );
    tickets = Array.isArray(response.data?.data) ? response.data.data : null;
    if (!tickets) {
      const err = response.data?.errors?.[0];
      await Promise.all(targets.map((t) => record(t, {
        status: 'Failed',
        error_code: err?.code ?? 'ExpoBadResponse',
        error_message: err?.message ?? 'Expo returned no tickets',
      })));
      return;
    }
  } catch (error: any) {
    logger.error({ err: error?.message || error, notificationId }, '[PushService] Expo push request failed');
    const rateLimited = error?.response?.status === 429;
    await Promise.all(targets.map((t) => record(t, {
      status: 'Failed',
      error_code: rateLimited ? 'MessageRateExceeded' : 'ExpoUnreachable',
      error_message: String(error?.message ?? error).slice(0, 500),
    }))).catch((err) => logger.error({ err }, '[PushService] Failed to record push failure'));
    return;
  }

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const ticket = tickets[i];
    try {
      if (ticket?.status === 'ok') {
        await record(t, { status: 'Sent', expo_ticket_id: ticket.id ?? null, error_code: null, error_message: null });
        continue;
      }
      const code = ticket?.details?.error ?? 'Error';
      logger.warn({ ticket, deviceId: t.deviceId, userDeviceId: t.userDeviceId }, '[PushService] Push ticket error');
      await record(t, { status: 'Failed', error_code: code, error_message: ticket?.message ?? null });
      if (code === 'DeviceNotRegistered') await deactivateTarget(t);
    } catch (err) {
      logger.error({ err, deviceId: t.deviceId, userDeviceId: t.userDeviceId }, '[PushService] Failed to record push ticket');
    }
  }
}

export async function deactivateDevice(deviceId: string): Promise<void> {
  logger.info({ deviceId }, '[PushService] Token not registered. Deactivating device');
  await prisma.driverDevice
    .update({ where: { id: deviceId }, data: { isActive: false } })
    .catch((err: any) => logger.error({ err }, '[PushService] Failed to deactivate device'));
}

export async function deactivateUserDevice(userDeviceId: string): Promise<void> {
  logger.info({ userDeviceId }, '[PushService] Token not registered. Deactivating staff device');
  await prisma.userDevice
    .update({ where: { id: userDeviceId }, data: { isActive: false } })
    .catch((err: any) => logger.error({ err }, '[PushService] Failed to deactivate staff device'));
}

async function deactivateTarget(t: { deviceId?: string | null; userDeviceId?: string | null }): Promise<void> {
  if (t.deviceId) await deactivateDevice(t.deviceId);
  else if (t.userDeviceId) await deactivateUserDevice(t.userDeviceId);
}

/**
 * Sends a driver notification to every active device of the driver via Expo
 * and records one PushDelivery per device — or a single `NoDevice` row when
 * the driver has nowhere to receive it, so the dashboard can say so.
 * Safe and non-blocking: errors in push delivery never throw to caller.
 */
export async function sendDriverPushNotification(
  driverId: string,
  title: string,
  body: string,
  data: Record<string, any> = {},
  notificationId?: string,
): Promise<void> {
  try {
    const devices = await prisma.driverDevice.findMany({
      where: { driverId, isActive: true },
      select: { id: true, token: true },
    });

    const targets: Target[] = devices
      .filter((d) => isExpoPushToken(d.token))
      .map((d) => ({ deviceId: d.id, token: d.token as string }));

    if (targets.length === 0) {
      logger.debug({ driverId }, '[PushService] No push-capable device for driver');
      if (notificationId) {
        await prisma.pushDelivery.create({
          data: {
            notificationId,
            status: 'NoDevice',
            error_message: devices.length
              ? 'The driver\'s phone has notifications turned off'
              : 'The driver has no phone registered',
          },
        });
      }
      return;
    }

    if (!notificationId) {
      // Nothing to record against — send without a trail (not used by the app today).
      await axios.post(EXPO_PUSH_URL, targets.map((t) => ({ to: t.token, ...DRIVER_PUSH, title, body, data })), { headers: EXPO_HEADERS, timeout: 10000 });
      return;
    }

    await deliver(notificationId, targets, { ...DRIVER_PUSH, title, body, data });
  } catch (error: any) {
    logger.error({ err: error?.message || error, driverId }, '[PushService] Failed to send push notification');
  }
}

/**
 * Sends a staff notification (Admin/Operator) to every active operator-app
 * install signed in as that user, recording one PushDelivery per phone. Staff
 * without the app get nothing recorded — the web dashboard is their inbox.
 * Safe and non-blocking: errors in push delivery never throw to caller.
 */
export async function sendUserPushNotification(
  userId: string,
  title: string,
  body: string,
  data: Record<string, any>,
  notificationId: string,
  options: StaffPushOptions = {},
): Promise<void> {
  try {
    const devices = await prisma.userDevice.findMany({
      where: { userId, isActive: true, user: { isActive: true, deletedAt: null } },
      select: { id: true, token: true, api_base: true },
    });
    const targets: Target[] = devices
      .filter((d) => isExpoPushToken(d.token))
      .map((d) => ({ userDeviceId: d.id, token: d.token as string, apiBase: d.api_base }));
    if (targets.length === 0) return;

    const { sender } = options;
    await deliver(notificationId, targets, {
      sound: 'default',
      title: options.title ?? title,
      body: options.body ?? body,
      data: sender ? { ...data, sender } : data,
      channelId: 'default',
      priority: 'high',
      // iOS runs the operator app's extension only for mutable pushes: it
      // reports the arrival, and for a driver's update shows them as the sender.
      mutableContent: true,
      ...(sender?.image ? { richContent: { image: sender.image } } : {}),
    });
  } catch (error: any) {
    logger.error({ err: error?.message || error, userId }, '[PushService] Failed to send staff push notification');
  }
}

/** Re-sends one failed delivery (used by the driverWatch retry check). */
export async function retryPushDelivery(deliveryId: string): Promise<void> {
  const row = await prisma.pushDelivery.findUnique({
    where: { id: deliveryId },
    include: {
      notification: true,
      device: { select: { id: true, token: true, isActive: true } },
      userDevice: { select: { id: true, token: true, isActive: true, api_base: true } },
    },
  });
  if (!row) return;
  const phone = row.device ?? row.userDevice;
  if (!phone || !phone.isActive || !isExpoPushToken(phone.token)) return;
  const n = row.notification;
  await deliver(
    n.id,
    [{
      ...(row.device ? { deviceId: phone.id } : { userDeviceId: phone.id, apiBase: row.userDevice?.api_base }),
      token: phone.token,
      deliveryId: row.id,
    }],
    {
      sound: 'default',
      title: n.title,
      body: visibleNotificationMessage(n.message),
      data: {
        type: n.type,
        entity_type: n.entity_type,
        entity_id: n.entity_id,
        notificationId: n.id,
        ...(n.entity_type === 'Trip' && n.entity_id ? { tripId: n.entity_id } : {}),
        ...(n.target ? { target: n.target } : {}),
      },
      channelId: 'default',
      priority: 'high',
      ...(row.userDevice ? { mutableContent: true } : { interruptionLevel: DRIVER_PUSH.interruptionLevel }),
    },
  );
}

/**
 * Asks Expo whether Apple/Google accepted each `Sent` push old enough to have
 * a receipt. Expo answers per ticket: ok → Delivered, error → Failed (and a
 * dead token deactivates its device). Tickets with no receipt after Expo's
 * ~24 h retention become Unknown.
 */
export async function checkPushReceipts(now: Date = new Date()): Promise<{ checked: number; delivered: number; failed: number }> {
  const result = { checked: 0, delivered: 0, failed: 0 };

  await prisma.pushDelivery.updateMany({
    where: { status: 'Sent', sent_at: { lt: new Date(now.getTime() - WATCH_TIMINGS.receiptGiveUpMs) } },
    data: { status: 'Unknown', receipt_checked_at: now, error_message: 'Expo no longer had a receipt for this push' },
  });

  const pending = await prisma.pushDelivery.findMany({
    where: {
      status: 'Sent',
      expo_ticket_id: { not: null },
      sent_at: { lt: new Date(now.getTime() - WATCH_TIMINGS.receiptAfterMs) },
    },
    select: { id: true, expo_ticket_id: true, deviceId: true, userDeviceId: true },
    orderBy: { sent_at: 'asc' },
    take: 1000, // Expo's per-request limit
  });
  if (pending.length === 0) return result;

  const response = await axios.post(
    EXPO_RECEIPTS_URL,
    { ids: pending.map((p) => p.expo_ticket_id) },
    { headers: EXPO_HEADERS, timeout: 15000 },
  );
  const receipts: Record<string, any> = response.data?.data ?? {};

  for (const p of pending) {
    const receipt = receipts[p.expo_ticket_id as string];
    if (!receipt) {
      // Not ready yet — stamp it so the dashboard shows we looked.
      await prisma.pushDelivery.update({ where: { id: p.id }, data: { receipt_checked_at: now } });
      continue;
    }
    result.checked++;
    if (receipt.status === 'ok') {
      result.delivered++;
      await prisma.pushDelivery.update({ where: { id: p.id }, data: { status: 'Delivered', receipt_checked_at: now } });
    } else {
      result.failed++;
      const code = receipt.details?.error ?? 'Error';
      await prisma.pushDelivery.update({
        where: { id: p.id },
        data: { status: 'Failed', error_code: code, error_message: receipt.message ?? null, receipt_checked_at: now },
      });
      if (code === 'DeviceNotRegistered') await deactivateTarget(p);
    }
  }
  return result;
}

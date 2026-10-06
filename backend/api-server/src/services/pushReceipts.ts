/**
 * "This push reached the phone" — the operator app's iOS extension calls the
 * signed link carried in each staff push the moment it arrives, so the Push
 * log can say it arrived and how long it took (Apple's own receipt only says
 * Apple accepted it). No login: the signature is the permission, like /media.
 *
 *   POST <api_base>/api/push-receipts/<deliveryId>/<signature>
 */
import crypto from 'crypto';
import { prisma } from '../db';
import { fileSignature } from './fileLinks';

const signatureOf = (deliveryId: string) => fileSignature(`push-receipt-${deliveryId}`, 0);

/** The phone's API address when it is one a phone can report to (https), else null. */
export function receiptBase(apiBase: string | null | undefined): string | null {
  const base = apiBase?.trim().replace(/\/+$/, '');
  return base && /^https:\/\//i.test(base) ? base : null;
}

/** The link for one delivery, on the API address that phone uses; null without an https address. */
export function pushReceiptLink(apiBase: string | null | undefined, deliveryId: string): string | null {
  const base = receiptBase(apiBase);
  return base ? `${base}/api/push-receipts/${deliveryId}/${signatureOf(deliveryId)}` : null;
}

export function checkPushReceiptSignature(deliveryId: string, signature: string): boolean {
  const expected = Buffer.from(signatureOf(deliveryId));
  const given = Buffer.from(String(signature));
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

/** Stamps the first arrival; later calls (a retry reaching the phone twice) keep the first time. */
export async function recordPushReceived(deliveryId: string, at: Date = new Date()): Promise<boolean> {
  const r = await prisma.pushDelivery.updateMany({
    where: { id: deliveryId, userDeviceId: { not: null }, received_at: null },
    data: { received_at: at },
  });
  return r.count > 0;
}

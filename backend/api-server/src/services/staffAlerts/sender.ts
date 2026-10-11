/**
 * The driver a staff push is "from": name and a photo link the phone can load
 * without signing in (operator app — iOS extension and Android both fetch it).
 */
import { inlineImageLink, isInlineImage } from '../inlineImages';
import { signUploadUrl } from '../fileLinks';
import type { PushSender } from '../pushNotificationService';

/**
 * A full https link to the driver's photo, or null when there is none or no
 * public https address to build it on (local dev — phones only fetch https).
 * Photos stored inline get a /api/media link, uploaded files a signed
 * /uploads link; both stay valid for the hour or two a push takes to arrive.
 */
export function driverPhotoLink(
  baseUrl: string | null | undefined,
  driver: { id: string; avatar_url?: string | null },
  nowMs: number = Date.now(),
): string | null {
  const value = driver.avatar_url?.trim();
  if (!value) return null;
  if (/^https:\/\//i.test(value)) return value;
  const base = baseUrl?.trim().replace(/\/+$/, '');
  if (!base || !/^https:\/\//i.test(base)) return null;
  const link = isInlineImage(value) ? inlineImageLink('driver', driver.id, value, nowMs) : signUploadUrl(value, nowMs);
  return link?.startsWith('/') ? `${base}${link}` : null;
}

export function driverSender(
  baseUrl: string | null | undefined,
  driver: { id: string; avatar_url?: string | null },
  name: string,
): PushSender {
  return { id: driver.id, name, image: driverPhotoLink(baseUrl, driver) };
}

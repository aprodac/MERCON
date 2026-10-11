/**
 * A driver's app login is a User row linked from Driver.userId whose
 * `username` and `phone` are the driver's mobile number. The driver app signs
 * in by looking the Driver up by phone_primary and checking that User's
 * password, so the two must move together: when an operator changes a
 * driver's phone, the login's username/phone follow it, and a login left
 * holding a number by an earlier phone change (or a deleted driver) is
 * released instead of blocking the save with a unique-constraint error.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../db';

type Db = Prisma.TransactionClient | typeof prisma;

/** Thrown when a phone already belongs to another live account; carries an operator-facing message. */
export class DriverLoginConflict extends Error {}

/** How a driver's phone is stored: as typed, without spaces or dashes. */
export function cleanPhone(raw: string | null | undefined): string | null {
  const phone = String(raw ?? '').replace(/[\s-]/g, '').trim();
  return phone || null;
}

/** Last 9 digits — the Saudi mobile number with any +966 / 00966 / 0 prefix dropped. */
export function phoneKey(raw: string | null | undefined): string {
  return String(raw ?? '').replace(/\D/g, '').slice(-9);
}

/** The username a driver's login gets: their phone, else their reference. */
export function driverUsername(driver: { id: string; ref_id: string | null }, phone: string | null): string {
  return phone || driver.ref_id || `driver_${driver.id.substring(0, 8)}`;
}

/**
 * Makes `phone` free for the login of `driverId` (whose current login is
 * `keepUserId`, if any). Every other User holding it as phone or username is:
 *  - an Admin/Operator (or superadmin) → conflict; staff logins are never touched;
 *  - the login of another live driver whose phone really is this number → conflict;
 *  - any other Driver login (stale after a phone change, or of a deleted
 *    driver) → released: its phone is cleared and its username renamed, so the
 *    other driver (if any) still signs in by their own current phone.
 * A Driver login linked to no driver at all is returned as `adoptable` (when
 * this driver has no login yet) so setting a password reuses it.
 */
export async function claimLoginPhone(
  db: Db,
  phone: string,
  driverId: string,
  keepUserId: string | null,
): Promise<{ adoptable: string | null }> {
  const holders = await db.user.findMany({
    where: {
      OR: [{ phone }, { username: phone }],
      ...(keepUserId ? { id: { not: keepUserId } } : {}),
    },
    select: {
      id: true, username: true, role: true, isSuperAdmin: true,
      driver: { select: { id: true, first_name: true, last_name: true, ref_id: true, phone_primary: true, deletedAt: true } },
    },
  });

  let adoptable: string | null = null;
  for (const holder of holders) {
    if (holder.role !== 'Driver' || holder.isSuperAdmin) {
      throw new DriverLoginConflict(`This phone is the login of the ${holder.role} account @${holder.username}. Give the driver a different phone.`);
    }
    const other = holder.driver;
    if (other && other.id === driverId) continue;
    if (other && !other.deletedAt && phoneKey(other.phone_primary) === phoneKey(phone)) {
      const name = `${other.first_name} ${other.last_name}`.trim();
      throw new DriverLoginConflict(`This phone is already used by driver ${name}${other.ref_id ? ` (${other.ref_id})` : ''}.`);
    }
    if (!other && !keepUserId && !adoptable) {
      adoptable = holder.id;
      continue;
    }
    await db.user.update({
      where: { id: holder.id },
      data: { phone: null, username: `released_${holder.id.substring(0, 8)}_${Date.now()}` },
    });
  }
  return { adoptable };
}

/**
 * Points a driver's existing login at their current phone and name.
 * No-op for a driver without a login (the password screen creates one).
 */
export async function syncDriverLogin(
  db: Db,
  driver: { id: string; userId: string | null; ref_id: string | null; first_name: string; last_name: string; phone_primary: string | null },
): Promise<void> {
  if (!driver.userId) return;
  const phone = cleanPhone(driver.phone_primary);
  if (phone) await claimLoginPhone(db, phone, driver.id, driver.userId);
  await db.user.update({
    where: { id: driver.userId },
    data: {
      phone,
      username: driverUsername(driver, phone),
      name: `${driver.first_name} ${driver.last_name}`.trim(),
    },
  });
}

/**
 * Other drivers holding the same Saudi number in any spelling ("+966 5…",
 * "05…", "5…"). `live` blocks the save; `deleted` drivers only keep their old
 * number on the unique index and are released by `releaseDeletedDriverPhones`.
 */
export async function findPhoneClash(db: Db, phone: string, excludeDriverId?: string) {
  const key = phoneKey(phone);
  if (key.length < 9) return { live: null, deleted: [] as string[] };
  const rows = await db.driver.findMany({
    where: { ...(excludeDriverId ? { id: { not: excludeDriverId } } : {}), phone_primary: { endsWith: key.slice(-4) } },
    select: { id: true, first_name: true, last_name: true, ref_id: true, phone_primary: true, deletedAt: true },
  });
  const same = rows.filter((d) => phoneKey(d.phone_primary) === key);
  return {
    live: same.find((d) => !d.deletedAt) ?? null,
    deleted: same.filter((d) => d.deletedAt).map((d) => d.id),
  };
}

export function phoneInUseMessage(d: { first_name: string; last_name: string; ref_id: string | null }): string {
  return `This phone is already used by driver ${`${d.first_name} ${d.last_name}`.trim()}${d.ref_id ? ` (${d.ref_id})` : ''}.`;
}

/** A deleted driver keeps its number; let a live driver have it. */
export async function releaseDeletedDriverPhones(db: Db, ids: string[]) {
  if (ids.length) await db.driver.updateMany({ where: { id: { in: ids }, deletedAt: { not: null } }, data: { phone_primary: null } });
}

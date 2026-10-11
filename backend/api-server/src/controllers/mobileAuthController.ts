import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { prisma } from '../db';
import { env } from '../config/env';
import { recordDriverActivity } from '../services/driverPhone/activity';

export function normalizeLicense(value: string): string {
  return value.replace(/[\s\-_.\/]/g, '').toUpperCase();
}

/** The 9-digit Saudi mobile number ("5xxxxxxxx") inside whatever was typed or stored, or null. */
export function saudiLocalNumber(raw: string): string | null {
  const digits = String(raw).replace(/\D/g, '');
  const local = digits.replace(/^(00966|966|0)/, '');
  return /^5\d{8}$/.test(local) ? local : null;
}

/**
 * The ways a driver's phone may be stored: as typed, and with/without the
 * country code or leading 0. The dashboard accepts "+966 5…", "05…", "5…",
 * "00966…" (spaces and dashes allowed) and stores it as typed, so a driver who
 * types the same number another way must still be found.
 */
export function phoneVariants(raw: string): string[] {
  const id = String(raw).trim();
  const variants = [id];
  const compact = id.replace(/[\s-]/g, '');
  if (compact !== id) variants.push(compact);
  const sa = saudiLocalNumber(id);
  if (sa) {
    variants.push(sa, `0${sa}`, `+966${sa}`, `966${sa}`, `00966${sa}`, `+966 ${sa}`);
  } else if (compact.startsWith('+91')) {
    const local = compact.slice(3);
    variants.push(`0${local}`, local);
  } else if (compact.startsWith('0')) {
    variants.push(`+966${compact.slice(1)}`, `+91${compact.slice(1)}`, compact.slice(1));
  }
  return [...new Set(variants)];
}

/**
 * Finds the driver for a typed phone number (or driver ID). Falls back to
 * comparing digits only, so a number stored with spaces in odd places
 * ("055 123 4567") still matches. Deleted drivers never sign in.
 */
async function findDriverForLogin(typed: string) {
  const include = { user: true } as const;
  const byVariant = await prisma.driver.findFirst({
    where: { deletedAt: null, OR: [...phoneVariants(typed).map((p) => ({ phone_primary: p })), { ref_id: typed }] },
    include,
  });
  if (byVariant) return byVariant;
  const sa = saudiLocalNumber(typed);
  if (!sa) return null;
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Driver"
    WHERE "deletedAt" IS NULL AND phone_primary IS NOT NULL
      AND right(regexp_replace(phone_primary, '\\D', '', 'g'), 9) = ${sa}
    LIMIT 2`;
  // Two drivers sharing a number is ambiguous — don't guess.
  if (rows.length !== 1) return null;
  return prisma.driver.findUnique({ where: { id: rows[0].id }, include });
}

export const mobileLogin = async (req: Request, res: Response) => {
  const { phone_primary, password, license_number } = req.body;

  if (!phone_primary || (!password && !license_number)) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Phone number and password (or license number) are required' }
    });
  }

  try {
    const id = String(phone_primary).trim();

    const driver = await findDriverForLogin(id);

    if (!driver || !driver.isActive) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials or inactive account' }
      });
    }

    let isValid = false;

    // Check account password first, exactly as typed (case matters), if the driver has one.
    // The office sets passwords trimmed; phone keyboards often add a trailing space.
    const attempts = password ? Array.from(new Set([String(password), String(password).trim()])).filter(Boolean) : [];
    const passwordMatches = async (hash: string) => {
      for (const attempt of attempts) if (await bcrypt.compare(attempt, hash)) return true;
      return false;
    };
    if (attempts.length && driver.user?.password_hash) {
      isValid = await passwordMatches(driver.user.password_hash);
    } else if (attempts.length && !driver.userId) {
      // A driver login made before it was linked: a Driver account on this phone that no driver owns.
      const linkedUser = await prisma.user.findFirst({
        where: {
          role: 'Driver',
          driver: { is: null },
          OR: phoneVariants(id).flatMap((p) => [{ phone: p }, { username: p }]),
        },
      });
      if (linkedUser?.password_hash) {
        isValid = await passwordMatches(linkedUser.password_hash);
      }
    }

    // Fallback to license number if password not provided or password failed and license match allowed.
    // Drivers type it by hand: ignore case, spaces and dashes ("ab-12 34" matches "AB1234").
    if (!isValid && license_number && driver.license_number) {
      isValid = normalizeLicense(driver.license_number) === normalizeLicense(String(license_number));
    }

    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid phone number or password' }
      });
    }

    const token = jwt.sign(
      { 
        id: driver.userId || driver.id, 
        driver_id: driver.id,
        role: 'Driver' 
      },
      env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    void recordDriverActivity(driver.id, 'Login', { metadata: { ip: req.ip } });

    res.json({
      success: true,
      data: {
        token,
        driver: {
          id: driver.id,
          name: `${driver.first_name} ${driver.last_name}`,
          ref_id: driver.ref_id,
          status: driver.status
        }
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'Mobile login error:');
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Internal server error' }
    });
  }
};

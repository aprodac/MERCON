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

/** The ways a driver's phone may be stored: as typed, and with/without the country code or leading 0. */
export function phoneVariants(raw: string): string[] {
  const id = String(raw).trim();
  const variants = [id];
  if (id.startsWith('+966')) {
    const local = id.slice(4);
    variants.push(`0${local}`, local);
  } else if (id.startsWith('+91')) {
    const local = id.slice(3);
    variants.push(`0${local}`, local);
  } else if (id.startsWith('0')) {
    variants.push(`+966${id.slice(1)}`, `+91${id.slice(1)}`, id.slice(1));
  }
  return variants;
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

    const driver = await prisma.driver.findFirst({
      where: {
        OR: [
          ...phoneVariants(id).map((p) => ({ phone_primary: p })),
          { ref_id: id },
        ],
      },
      include: {
        user: true,
      },
    });

    if (!driver || !driver.isActive) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials or inactive account' }
      });
    }

    let isValid = false;

    // Check account password first, exactly as typed (case matters), if the driver has one.
    if (password && driver.user?.password_hash) {
      isValid = await bcrypt.compare(password, driver.user.password_hash);
    } else if (password) {
      // Also check if a standalone User record exists for this phone number
      const linkedUser = await prisma.user.findFirst({
        where: { OR: [{ phone: id }, { username: id }] },
      });
      if (linkedUser?.password_hash) {
        isValid = await bcrypt.compare(password, linkedUser.password_hash);
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

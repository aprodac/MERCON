import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { prisma } from '../db';
import { env } from '../config/env';

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
    const phoneVariants = [id];
    if (id.startsWith('+966')) {
      const local = id.slice(4);
      phoneVariants.push(`0${local}`, local);
    } else if (id.startsWith('+91')) {
      const local = id.slice(3);
      phoneVariants.push(`0${local}`, local);
    } else if (id.startsWith('0')) {
      phoneVariants.push(`+966${id.slice(1)}`, `+91${id.slice(1)}`, id.slice(1));
    }

    const driver = await prisma.driver.findFirst({
      where: {
        OR: [
          ...phoneVariants.map((p) => ({ phone_primary: p })),
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

    // Check account password first if user record exists with password_hash
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

    // Fallback to license number if password not provided or password failed and license match allowed
    if (!isValid && license_number) {
      isValid = driver.license_number === license_number;
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

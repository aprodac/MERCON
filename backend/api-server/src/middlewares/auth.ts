import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import jwt from 'jsonwebtoken';
import { prisma } from '../db';
import { logger } from '../utils/logger';
import { setRequestUserId } from './requestContext';

export interface AuthenticatedUser {
  id: string;
  role: string;
  isActive: boolean;
  isSuperAdmin?: boolean;
  name?: string | null;
  email?: string | null;
  username?: string | null;
  driver_id?: string | null;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export const authenticateJWT = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as any;
      if (!decoded?.id) {
        return res.status(401).json({ success: false, error: { code: 'TOKEN_EXPIRED', message: 'Invalid or expired token' } });
      }

      const freshUser = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { id: true, role: true, isActive: true, isSuperAdmin: true, name: true, email: true, username: true }
      });

      if (freshUser) {
        if (!freshUser.isActive) {
          return res.status(401).json({ success: false, error: { code: 'ACCOUNT_INACTIVE', message: 'Account is inactive or has been deactivated' } });
        }

        req.user = {
          ...freshUser,
          driver_id: decoded.driver_id ?? null,
        };
        setRequestUserId(freshUser.id);
        return next();
      }

      // Standalone Driver fallback (Driver without an associated User record)
      if (decoded.role === 'Driver' && decoded.driver_id) {
        const driver = await prisma.driver.findFirst({
          where: { id: decoded.driver_id, deletedAt: null },
          select: { id: true, isActive: true, first_name: true, last_name: true }
        });

        if (!driver || !driver.isActive) {
          return res.status(401).json({ success: false, error: { code: 'ACCOUNT_INACTIVE', message: 'Account is inactive or has been deactivated' } });
        }

        req.user = {
          id: driver.id,
          role: 'Driver',
          isActive: driver.isActive,
          isSuperAdmin: false,
          name: `${driver.first_name} ${driver.last_name}`.trim(),
          driver_id: driver.id,
        };
        setRequestUserId(driver.id);
        return next();
      }

      return res.status(401).json({ success: false, error: { code: 'ACCOUNT_INACTIVE', message: 'Account is inactive or has been deactivated' } });
    } catch (err: any) {
      if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        return res.status(401).json({ success: false, error: { code: 'TOKEN_EXPIRED', message: 'Invalid or expired token' } });
      }
      logger.error({ err }, 'Error verifying user status in auth middleware:');
      return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Internal server error' } });
    }
  } else {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authorization token missing' } });
  }
};

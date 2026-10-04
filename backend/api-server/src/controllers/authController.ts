import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { Role } from '@prisma/client';
import { env } from '../config/env';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { prisma } from '../db';
import { createNotification } from './notificationController';
import { phoneVariants } from './mobileAuthController';

/* ─── Unified Login (username + password) ──────────────────────────────────── */
export const login = async (req: Request, res: Response) => {
  const { username, password } = req.body; // validated by loginBody

  try {
    const identifier = String(username).trim();
    const phoneVariants = [identifier];
    if (identifier.startsWith('+966')) {
      const local = identifier.slice(4);
      phoneVariants.push(`0${local}`, local);
    } else if (identifier.startsWith('+91')) {
      const local = identifier.slice(3);
      phoneVariants.push(`0${local}`, local);
    } else if (identifier.startsWith('0')) {
      phoneVariants.push(`+966${identifier.slice(1)}`, `+91${identifier.slice(1)}`, identifier.slice(1));
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          // People type "Admin" for "admin" — usernames and emails match regardless of case.
          { username: { equals: identifier, mode: 'insensitive' } },
          { email: { equals: identifier, mode: 'insensitive' } },
          ...phoneVariants.map((p) => ({ phone: p })),
        ],
      },
      include: { driver: true },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' }
      });
    }

    const passwordHash: string = (user as any).password_hash || '';
    const isValid = passwordHash ? await bcrypt.compare(password, passwordHash) : false;

    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' }
      });
    }

    const jwtPayload = { 
      id: user.id, 
      username: user.username, 
      role: user.role,
      driver_id: user.driver?.id 
    };
    
    const token = jwt.sign(jwtPayload, env.JWT_SECRET, { expiresIn: '7d' });

    return res.json({
      success: true,
      data: {
        token,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          name: user.name,
          isSuperAdmin: user.isSuperAdmin,
          driver: user.driver ? {
            id: user.driver.id,
            first_name: user.driver.first_name,
            last_name: user.driver.last_name
          } : null
        }
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'Login error:');
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Internal server error' } });
  }
};

/* ─── Get current profile ───────────────────────────────────────── */
export const getMe = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;

    const user = await prisma.user.findUnique({ 
      where: { id: userId },
      include: { driver: true }
    });
    
    if (!user) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });

    return res.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isSuperAdmin: user.isSuperAdmin,
        driver: user.driver ? {
          id: user.driver.id,
          first_name: user.driver.first_name,
          last_name: user.driver.last_name
        } : null
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Internal server error' } });
  }
};

/* ─── Update own profile (name / email / phone) ─────────────────────────────── */
export const updateMe = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { name, email, phone } = req.body;

    const data: { name?: string; email?: string | null; phone?: string | null } = {};
    if (name !== undefined) data.name = String(name).trim();
    if (email !== undefined) data.email = email ? String(email).trim() : null;
    if (phone !== undefined) data.phone = phone ? String(phone).trim() : null;

    const user = await prisma.user.update({ where: { id: userId }, data });

    return res.json({
      success: true,
      data: { id: user.id, username: user.username, name: user.name, email: user.email, phone: user.phone, role: user.role }
    });
  } catch (error: any) {
    // Unique constraint (email/phone already taken)
    if (error?.code === 'P2002') {
      return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'That email or phone is already in use' } });
    }
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to update profile' } });
  }
};

/* ─── Change own password (knows current password) ──────────────────────────── */
export const changePassword = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Current and new password are required' } });
    }
    if (String(new_password).length < 8) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'New password must be at least 8 characters' } });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });

    // 400, not 401: every app treats a 401 as "your login expired" and signs the
    // user out, so a mistyped current password used to log the driver out.
    const ok = user.password_hash ? await bcrypt.compare(current_password, user.password_hash) : false;
    if (!ok) return res.status(400).json({ success: false, error: { code: 'INVALID_CURRENT_PASSWORD', message: 'Current password is incorrect' } });

    const hash = await bcrypt.hash(new_password, 10);
    await prisma.user.update({ where: { id: userId }, data: { password_hash: hash } });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'PASSWORD_CHANGED',
        entityType: 'User',
        entityId: user.id,
        metadata: { message: `User ${user.username} changed their password via mobile app` }
      }
    });

    return res.json({ success: true, data: { message: 'Password updated' } });
  } catch (error) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to change password' } });
  }
};

/* ─── Request a password reset: notify every Admin + Operator ────────────────── */

interface ResetRequester {
  /** Sentence start for the office, e.g. "Driver ALI KHAN (DRV-12, +966500000000)". */
  who: string;
  /** Where the office resets it. */
  where: string;
  entityType?: string;
  entityId?: string;
}

const driverRequester = (d: { id: string; first_name: string; last_name: string; ref_id: string | null; phone_primary: string | null }): ResetRequester => ({
  who: `Driver ${`${d.first_name} ${d.last_name}`.trim()} (${[d.ref_id, d.phone_primary].filter(Boolean).join(', ')})`,
  where: 'Reset it on the driver page in the Drivers module.',
  entityType: 'Driver',
  entityId: d.id,
});

const userRequester = (u: { name: string | null; username: string; phone: string | null }): ResetRequester => ({
  who: `${u.name || u.username} (${[u.username, u.phone].filter(Boolean).join(', ')})`,
  where: 'Reset it in User Management.',
});

const driverSelect = { id: true, first_name: true, last_name: true, ref_id: true, phone_primary: true } as const;
const userSelect = { name: true, username: true, phone: true } as const;

/**
 * Who asked: the signed-in user when the request carries a valid token (the
 * driver app's Change Password screen), else the account matching what was
 * typed on the sign-in screen. The office used to get "A user requested a
 * password reset" with no way to tell who.
 */
export async function resolveResetRequester(authHeader: string | undefined, identifier: unknown): Promise<ResetRequester> {
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.slice(7), env.JWT_SECRET) as any;
      if (decoded?.driver_id) {
        const d = await prisma.driver.findFirst({ where: { id: decoded.driver_id, deletedAt: null }, select: driverSelect });
        if (d) return driverRequester(d);
      }
      if (decoded?.id) {
        const u = await prisma.user.findFirst({ where: { id: decoded.id, deletedAt: null }, select: userSelect });
        if (u) return userRequester(u);
      }
    } catch {
      // Expired or invalid token: fall back to what was typed.
    }
  }

  const typed = identifier ? String(identifier).trim() : '';
  if (typed) {
    const phones = phoneVariants(typed);
    const d = await prisma.driver.findFirst({
      where: { deletedAt: null, OR: [...phones.map((p) => ({ phone_primary: p })), { ref_id: typed }] },
      select: driverSelect,
    });
    if (d) return driverRequester(d);
    const u = await prisma.user.findFirst({
      where: { deletedAt: null, OR: [{ username: typed }, { email: typed }, ...phones.map((p) => ({ phone: p }))] },
      select: userSelect,
    });
    if (u) return userRequester(u);
    return { who: `Someone using "${typed}" (no matching account)`, where: 'Check who it is before resetting anything.' };
  }

  return { who: 'Someone (no name or phone given)', where: 'Reset it in User Management (web users) or the Drivers module (drivers).' };
}

export const requestPasswordReset = async (req: Request, res: Response) => {
  try {
    const requester = await resolveResetRequester(req.headers.authorization, req.body?.identifier);

    const staff = await prisma.user.findMany({
      where: { role: { in: [Role.Admin, Role.Operator] }, isActive: true, deletedAt: null },
      select: { id: true },
    });

    await Promise.all(
      staff.map((u) =>
        createNotification(
          u.id,
          'Password Reset Request',
          `${requester.who} requested a password reset. ${requester.where}`,
          'Security',
          requester.entityType,
          requester.entityId,
        ),
      ),
    );

    // Generic response — don't reveal whether the identifier matched an account.
    return res.json({ success: true, data: { message: 'Your operator and admin have been notified.' } });
  } catch (error) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to submit request' } });
  }
};


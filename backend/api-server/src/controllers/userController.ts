import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { prisma } from '../db';
import bcrypt from 'bcrypt';
import { logAuditEvent } from '../services/auditService';

// Get all users (except drivers if we only want dashboard users, but let's just return all non-drivers for now, or all)
export const getUsers = async (req: Request, res: Response) => {
  try {
    const requesterId = (req as any).user?.id;
    const requester = requesterId ? await prisma.user.findUnique({ where: { id: requesterId }, select: { role: true, isSuperAdmin: true } }) : null;
    const isRequesterSuperAdmin = Boolean(requester?.isSuperAdmin || requester?.role === 'SuperAdmin');

    const whereClause: any = { role: { not: 'Driver' } };
    if (!isRequesterSuperAdmin) {
      whereClause.isSuperAdmin = false;
      whereClause.role = { notIn: ['Driver', 'SuperAdmin'] };
    }

    const users = await prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        username: true,
        role: true,
        isActive: true,
        isSuperAdmin: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' }
    });
    
    // Map to frontend expected format
    const formattedUsers = users.map(u => ({
      ...u,
      status: u.isActive ? 'Active' : 'Inactive',
      lastLogin: u.createdAt.toISOString(), // Placeholder since lastLogin is missing
    }));

    res.json({ success: true, data: formattedUsers });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching users:');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Internal server error' } });
  }
};

// Create a new user
export const createUser = async (req: Request, res: Response) => {
  try {
    const { name, phone, email, role, password, username, status } = req.body;
    
    if (!name || (!phone && !email) || !role || !password) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing required fields (Name, Phone/Email, Role, Password)' } });
    }

    const requesterId = (req as any).user?.id;
    const requester = requesterId ? await prisma.user.findUnique({ where: { id: requesterId }, select: { role: true, isSuperAdmin: true } }) : null;
    const isRequesterSuperAdmin = Boolean(requester?.isSuperAdmin || requester?.role === 'SuperAdmin');

    if (role === 'SuperAdmin' && !isRequesterSuperAdmin) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only a SuperAdmin can create a SuperAdmin account' } });
    }

    const cleanPhone = phone ? String(phone).trim() : null;
    const cleanEmail = email ? String(email).trim() : null;
    const cleanUsername = username ? String(username).trim() : (cleanPhone || cleanEmail || name.toLowerCase().replace(/\s+/g, ''));

    const orConditions: any[] = [];
    if (cleanUsername) orConditions.push({ username: cleanUsername });
    if (cleanPhone) orConditions.push({ phone: cleanPhone });
    if (cleanEmail) orConditions.push({ email: cleanEmail });

    if (orConditions.length > 0) {
      const existingUser = await prisma.user.findFirst({
        where: { OR: orConditions }
      });

      if (existingUser) {
        if (existingUser.username === cleanUsername) {
          return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'User with this username already exists' } });
        }
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'User with this phone number or email already exists' } });
      }
    }

    const password_hash = await bcrypt.hash(password, 10);
    const isActive = status ? status === 'Active' : true;

    const newUser = await prisma.user.create({
      data: {
        name,
        phone: cleanPhone,
        email: cleanEmail,
        username: cleanUsername,
        role,
        password_hash,
        isActive
      }
    });

    await logAuditEvent({
      req,
      action: 'USER_CREATED',
      entityType: 'User',
      entityId: newUser.id,
      metadata: { name: newUser.name, role: newUser.role, status: newUser.isActive ? 'Active' : 'Inactive' }
    });

    res.json({
      success: true,
      data: { id: newUser.id, name: newUser.name, username: newUser.username, phone: newUser.phone, email: newUser.email, role: newUser.role, status: newUser.isActive ? 'Active' : 'Inactive', isSuperAdmin: newUser.isSuperAdmin }
    });
  } catch (error) {
    logger.error({ err: error }, 'Error creating user:');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Internal server error' } });
  }
};

// Update an existing user
export const updateUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, username, phone, email, role, status, password, isSuperAdmin } = req.body;

    const requesterId = (req as any).user?.id;
    const requester = requesterId ? await prisma.user.findUnique({ where: { id: requesterId }, select: { role: true, isSuperAdmin: true } }) : null;
    const isRequesterSuperAdmin = Boolean(requester?.isSuperAdmin || requester?.role === 'SuperAdmin');

    const targetUser = await prisma.user.findUnique({ where: { id: id as string }, select: { id: true, role: true, isSuperAdmin: true } });
    if (!targetUser) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    }

    // Protection rule: Only a SuperAdmin can edit a SuperAdmin account
    const isTargetSuperAdmin = Boolean(targetUser.isSuperAdmin || targetUser.role === 'SuperAdmin');
    if (isTargetSuperAdmin && !isRequesterSuperAdmin) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only a SuperAdmin can modify a SuperAdmin account' } });
    }

    // Protection rule: Only a SuperAdmin can assign or promote a user to SuperAdmin role
    if (role === 'SuperAdmin' && !isRequesterSuperAdmin) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only a SuperAdmin can assign the SuperAdmin role' } });
    }

    // Target hierarchy rule: Operators cannot modify Admin accounts
    if (requester?.role === 'Operator' && targetUser.role === 'Admin') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Operators cannot modify Admin accounts' } });
    }

    const dataToUpdate: any = {};
    if (name) dataToUpdate.name = name;
    if (username) dataToUpdate.username = String(username).trim();
    if (phone !== undefined) {
      const cleanPhone = phone ? String(phone).trim() : null;
      dataToUpdate.phone = cleanPhone;
    }
    if (email !== undefined) {
      dataToUpdate.email = email ? String(email).trim() : null;
    }
    if (role) dataToUpdate.role = role;
    if (status) dataToUpdate.isActive = status === 'Active';
    if (password) {
      dataToUpdate.password_hash = await bcrypt.hash(password, 10);
    }

    if (isSuperAdmin !== undefined) {
      if (!isRequesterSuperAdmin) {
        return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only a SuperAdmin can grant or revoke SuperAdmin access' } });
      }

      if (isSuperAdmin === false && targetUser.isSuperAdmin) {
        const remaining = await prisma.user.count({ where: { isSuperAdmin: true, id: { not: id as string } } });
        if (remaining === 0) {
          return res.status(409).json({ success: false, error: { code: 'LAST_SUPERADMIN', message: 'Cannot revoke the last SuperAdmin — grant it to someone else first' } });
        }
      }

      dataToUpdate.isSuperAdmin = isSuperAdmin;
    }

    const updatedUser = await prisma.user.update({
      where: { id: id as string },
      data: dataToUpdate
    });

    const auditAction = isSuperAdmin !== undefined
      ? 'SUPERADMIN_STATUS_CHANGED'
      : role
      ? 'USER_ROLE_UPDATED'
      : password
      ? 'USER_PASSWORD_RESET'
      : status !== undefined
      ? (status === 'Active' ? 'USER_ACTIVATED' : 'USER_DEACTIVATED')
      : 'USER_UPDATED';

    await logAuditEvent({
      req,
      action: auditAction,
      entityType: 'User',
      entityId: updatedUser.id,
      metadata: { role: updatedUser.role, status: updatedUser.isActive ? 'Active' : 'Inactive', isSuperAdmin: updatedUser.isSuperAdmin }
    });

    res.json({
      success: true,
      data: { id: updatedUser.id, name: updatedUser.name, email: updatedUser.email, role: updatedUser.role, status: updatedUser.isActive ? 'Active' : 'Inactive', isSuperAdmin: updatedUser.isSuperAdmin }
    });
  } catch (error) {
    logger.error({ err: error }, 'Error updating user:');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Internal server error' } });
  }
};

// Delete a user
export const deleteUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const requesterId = (req as any).user?.id;

    // Check if it's the current user trying to delete themselves
    if (requesterId === id) {
       return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot delete your own account' } });
    }

    const targetUser = await prisma.user.findUnique({ where: { id: id as string }, select: { id: true, isSuperAdmin: true, role: true } });
    if (!targetUser) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    }

    const requester = requesterId ? await prisma.user.findUnique({ where: { id: requesterId }, select: { isSuperAdmin: true, role: true } }) : null;
    const isRequesterSuperAdmin = Boolean(requester?.isSuperAdmin || requester?.role === 'SuperAdmin');
    const isTargetSuperAdmin = Boolean(targetUser.isSuperAdmin || targetUser.role === 'SuperAdmin');

    if (isTargetSuperAdmin && !isRequesterSuperAdmin) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only a SuperAdmin can delete a SuperAdmin account' } });
    }

    if (requester?.role === 'Operator' && targetUser.role === 'Admin') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Operators cannot delete or deactivate Admin accounts' } });
    }

    if (isTargetSuperAdmin) {
      const remainingSuperAdmins = await prisma.user.count({ where: { isSuperAdmin: true, id: { not: id as string } } });
      if (remainingSuperAdmins === 0) {
        return res.status(409).json({ success: false, error: { code: 'LAST_SUPERADMIN', message: 'Cannot delete the last SuperAdmin account' } });
      }
    }

    await logAuditEvent({
      req,
      action: 'USER_DELETED',
      entityType: 'User',
      entityId: id as string
    });

    // Hard delete user record
    await prisma.$transaction([
      prisma.document.updateMany({ where: { verified_by: id as string }, data: { verified_by: null } }),
      prisma.driver.updateMany({ where: { userId: id as string }, data: { userId: null } }),
      prisma.notification.deleteMany({ where: { userId: id as string } }),
      prisma.user.delete({ where: { id: id as string } })
    ]);

    res.json({ success: true, message: 'User permanently deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting user:');
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Internal server error' } });
  }
};



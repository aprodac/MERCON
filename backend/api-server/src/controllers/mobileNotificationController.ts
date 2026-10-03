import { Request, Response } from 'express';
import { prisma } from '../db';
import { parseHealth, upsertDriverDevice } from './mobilePhoneController';
import { visibleNotificationMessage } from '../services/pushNotificationService';

export const getMobileNotifications = async (req: Request, res: Response) => {
  const driverId = (req as any).user?.driver_id;
  if (!driverId) return res.status(403).json({ success: false, error: { message: 'Driver not authenticated' } });

  try {
    const notifications = await prisma.notification.findMany({
      where: { driverId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({ success: true, data: notifications.map((n) => ({ ...n, message: visibleNotificationMessage(n.message) })) });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

export const markMobileNotificationRead = async (req: Request, res: Response) => {
  const driverId = (req as any).user?.driver_id;
  const id = req.params.id as string;
  if (!driverId) return res.status(403).json({ success: false, error: { message: 'Driver not authenticated' } });

  try {
    // Scope the update to this driver's own notifications.
    const notification = await prisma.notification.findFirst({ where: { id, driverId } });
    if (!notification) return res.status(404).json({ success: false, error: { message: 'Notification not found' } });

    const updated = await prisma.notification.update({
      where: { id },
      data: { is_read: true, read_at: notification.read_at ?? new Date() },
    });
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

export const registerDeviceToken = async (req: Request, res: Response) => {
  const driverId = (req as any).user?.driver_id;
  if (!driverId) {
    return res.status(403).json({ success: false, error: { message: 'Driver not authenticated' } });
  }

  // Builds before the phone-health release send only { token, platform };
  // newer ones also send install_id (and may have no token when the driver
  // denied notifications) plus a health snapshot.
  const { token, platform, install_id } = req.body ?? {};
  const hasToken = typeof token === 'string' && token.length > 0;
  const installId = typeof install_id === 'string' && install_id ? install_id.slice(0, 64) : null;
  if (!hasToken && !installId) {
    return res.status(400).json({ success: false, error: { message: 'Device token is required' } });
  }

  try {
    const { after: device } = await upsertDriverDevice(driverId, {
      installId,
      token: hasToken ? token.slice(0, 255) : null,
      platform: typeof platform === 'string' && platform ? platform.slice(0, 16) : 'android',
      health: installId ? parseHealth(req.body) : null,
    });

    res.json({ success: true, data: device });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message || 'Failed to register device' } });
  }
};

export const unregisterDeviceToken = async (req: Request, res: Response) => {
  const driverId = (req as any).user?.driver_id;
  const token = req.params.token as string;
  if (!driverId) {
    return res.status(403).json({ success: false, error: { message: 'Driver not authenticated' } });
  }

  try {
    await prisma.driverDevice.updateMany({
      where: {
        token,
        driverId,
      },
      data: {
        isActive: false,
      },
    });

    res.json({ success: true, message: 'Device unregistered successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message || 'Failed to unregister device' } });
  }
};

import { Request, Response } from 'express';
import { prisma } from '../db';
import { createNotification } from './notificationController';
import { Role, TripStatus, DocType } from '@prisma/client';

/**
 * A driver raises an emergency. Notifies every active Admin + Operator (reuses
 * createNotification, so it also emits over the socket and shows on the web
 * Notifications page). Location and up to 4 incident photos are optional.
 * Photos arrive as multipart form-data (`photos` field, see `upload.array`
 * in mobileEmergencyRoutes.ts) — multer puts non-file fields into req.body
 * as strings, so lat/lng/notes are coerced here rather than trusted as-is.
 */
export const raiseEmergency = async (req: Request, res: Response) => {
  const driverId = (req as any).user?.driver_id;
  if (!driverId) return res.status(403).json({ success: false, error: { message: 'Driver not authenticated' } });

  const { incident_type, notes } = req.body ?? {};
  if (!incident_type || typeof incident_type !== 'string') {
    return res.status(400).json({ success: false, error: { message: 'incident_type is required' } });
  }

  const rawLat = req.body?.lat;
  const rawLng = req.body?.lng;
  const lat = rawLat !== undefined && rawLat !== '' ? parseFloat(rawLat) : undefined;
  const lng = rawLng !== undefined && rawLng !== '' ? parseFloat(rawLng) : undefined;
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];

  try {
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      select: { first_name: true, last_name: true, ref_id: true },
    });
    if (!driver) return res.status(404).json({ success: false, error: { message: 'Driver not found' } });

    // Link the alert to the driver's active trip when there is one.
    const activeTrip = await prisma.trip.findFirst({
      where: {
        driverId,
        deletedAt: null,
        status: { in: [TripStatus.Draft, TripStatus.Scheduled, TripStatus.Loading, TripStatus.InTransit, TripStatus.Delayed] },
      },
      select: { id: true, ref_id: true },
    });

    const driverName = `${driver.first_name} ${driver.last_name}`;
    const hasCoords = typeof lat === 'number' && !Number.isNaN(lat) && typeof lng === 'number' && !Number.isNaN(lng);
    const locationStr = hasCoords ? ` Location: ${lat!.toFixed(5)}, ${lng!.toFixed(5)}.` : '';
    const tripStr = activeTrip?.ref_id ? ` Trip ${activeTrip.ref_id}.` : '';
    const notesStr = notes && typeof notes === 'string' && notes.trim() ? ` Notes: ${notes.trim()}` : '';
    const photosStr = files.length ? ` (${files.length} photo${files.length > 1 ? 's' : ''} attached)` : '';
    const message = `${driverName} reported: ${incident_type}.${tripStr}${locationStr}${notesStr}${photosStr}`;

    const entityType = activeTrip ? 'Trip' : 'Driver';
    const entityId = activeTrip?.id ?? driverId;

    // Attach incident photos as Documents on the trip (or the driver, if no active trip).
    if (files.length) {
      await prisma.document.createMany({
        data: files.map((f) => ({
          entity_type: entityType,
          entity_id: entityId,
          doc_type: DocType.Emergency,
          file_url: `/uploads/${f.filename}`,
          mime_type: f.mimetype,
        })),
      });
    }

    const staff = await prisma.user.findMany({
      where: { role: { in: [Role.Admin, Role.Operator] }, isActive: true, deletedAt: null },
      select: { id: true },
    });

    await Promise.all(
      staff.map((u) =>
        createNotification(u.id, '🚨 Driver Emergency', message, 'Emergency', entityType, entityId),
      ),
    );

    res.status(201).json({ success: true, data: { notified: staff.length, photos: files.length } });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

/**
 * Who the driver's "Call operator" button dials. There is no dedicated
 * emergency-number setting, so this picks a real person: the user who created
 * the driver's active trip, else the most recently active Operator, else an
 * Admin — the first of those with a phone on their account. `data: null` when
 * nobody has one; the app then says so instead of dialling a made-up number
 * (it used to ship a placeholder). The emergency report itself still notifies
 * every active Admin/Operator.
 */
export const getEmergencyContact = async (req: Request, res: Response) => {
  const driverId = (req as any).user?.driver_id;
  if (!driverId) return res.status(403).json({ success: false, error: { message: 'Driver not authenticated' } });

  const staffWithPhone = { isActive: true, deletedAt: null, phone: { not: null } } as const;
  const pick = { name: true, username: true, phone: true } as const;

  try {
    const activeTrip = await prisma.trip.findFirst({
      where: {
        driverId,
        deletedAt: null,
        status: { in: [TripStatus.Draft, TripStatus.Scheduled, TripStatus.Loading, TripStatus.InTransit, TripStatus.Delayed] },
      },
      orderBy: { updatedAt: 'desc' },
      select: { created_by: true },
    });

    const creator = activeTrip?.created_by
      ? await prisma.user.findFirst({
          where: { id: activeTrip.created_by, role: { in: [Role.Admin, Role.Operator] }, ...staffWithPhone },
          select: pick,
        })
      : null;
    const contact =
      creator ??
      (await prisma.user.findFirst({ where: { role: Role.Operator, ...staffWithPhone }, orderBy: { updatedAt: 'desc' }, select: pick })) ??
      (await prisma.user.findFirst({ where: { role: Role.Admin, ...staffWithPhone }, orderBy: { updatedAt: 'desc' }, select: pick }));

    res.json({
      success: true,
      data: contact?.phone ? { name: contact.name || contact.username, phone: contact.phone } : null,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

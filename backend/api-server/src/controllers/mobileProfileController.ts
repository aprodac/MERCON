import { Request, Response } from 'express';
import { prisma } from '../db';
import { TripStatus } from '@prisma/client';

export const getProfile = async (req: Request, res: Response) => {
  const driverId = (req as any).user?.driver_id;
  const userId = (req as any).user?.id;

  if (!driverId && !userId) {
    return res.status(403).json({ success: false, error: { message: 'Driver not authenticated' } });
  }

  try {
    let driver = null;
    if (driverId) {
      driver = await prisma.driver.findFirst({
        where: { id: driverId, deletedAt: null },
        include: { assignedVehicle: { select: { id: true, plate_number: true, asset_type: true } } },
      });
    }
    if (!driver && userId) {
      driver = await prisma.driver.findFirst({
        where: { userId, deletedAt: null },
        include: { assignedVehicle: { select: { id: true, plate_number: true, asset_type: true } } },
      });
    }

    if (!driver) return res.status(404).json({ success: false, error: { message: 'Driver profile not found' } });

    const activeTrip = await prisma.trip.findFirst({
      where: {
        driverId: driver.id,
        deletedAt: null,
        status: { in: [TripStatus.Draft, TripStatus.Scheduled, TripStatus.Loading, TripStatus.InTransit, TripStatus.Delayed] },
      },
      select: { vehicle: { select: { id: true, plate_number: true, asset_type: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const currentVehicle = activeTrip?.vehicle ?? driver.assignedVehicle ?? null;

    // Compute stats
    const totalTrips = await prisma.trip.count({
      where: { driverId: driver.id, status: TripStatus.Completed, deletedAt: null }
    });

    // Dummy values for now for distance and on time
    const onTimeRate = totalTrips > 0 ? "98%" : "100%";
    const totalDistance = `${totalTrips * 120} km`;

    res.json({
      success: true,
      data: {
        id: driver.id,
        ref_id: driver.ref_id,
        first_name: driver.first_name,
        last_name: driver.last_name,
        name: `${driver.first_name} ${driver.last_name}`.trim(),
        phone_primary: driver.phone_primary,
        status: driver.status,
        license_number: driver.license_number,
        license_expiry: driver.license_expiry,
        avatar_url: driver.avatar_url,
        createdAt: driver.createdAt,
        current_vehicle: currentVehicle,
        stats: {
          total_trips: totalTrips,
          on_time_rate: onTimeRate,
          total_distance: totalDistance
        }
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

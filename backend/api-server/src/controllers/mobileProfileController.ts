import { Request, Response } from 'express';
import { prisma } from '../db';
import { findDriverVehicle } from '../services/driverVehicle';
import { FINISHED_TRIP_STATUSES, summarisePerformance } from '../services/driverPerformance';

export const getProfile = async (req: Request, res: Response) => {
  const driverId = (req as any).user?.driver_id;
  const userId = (req as any).user?.id;

  if (!driverId && !userId) {
    return res.status(403).json({ success: false, error: { message: 'Driver not authenticated' } });
  }

  try {
    let driver = null;
    if (driverId) {
      driver = await prisma.driver.findFirst({ where: { id: driverId, deletedAt: null } });
    }
    if (!driver && userId) {
      driver = await prisma.driver.findFirst({ where: { userId, deletedAt: null } });
    }

    if (!driver) return res.status(404).json({ success: false, error: { message: 'Driver profile not found' } });

    // Same rule as GET /mobile/vehicle: the current trip's truck, else the assigned truck.
    const vehicle = await findDriverVehicle(driver.id);

    // Real numbers only (they used to be "98%" and trips × 120 km placeholders).
    // There is no stored driven distance, so no distance figure is sent.
    const finishedTrips = await prisma.trip.findMany({
      where: { driverId: driver.id, deletedAt: null, status: { in: [...FINISHED_TRIP_STATUSES] } },
      select: {
        status: true,
        stops: {
          where: { deletedAt: null },
          select: { stop_sequence: true, stop_type: true, planned_arrival: true, actual_arrival: true },
        },
      },
    });

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
        current_vehicle: vehicle ? { id: vehicle.id, plate_number: vehicle.plate_number, asset_type: vehicle.asset_type } : null,
        stats: summarisePerformance(finishedTrips),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

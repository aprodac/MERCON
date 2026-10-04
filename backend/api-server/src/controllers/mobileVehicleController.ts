import { Request, Response } from 'express';
import { findDriverVehicle } from '../services/driverVehicle';

/**
 * The driver's truck: the current trip's truck, else the truck the office
 * assigned to the driver (same rule as the Profile header). `trip_ref_id` is
 * set only when the truck comes from a trip. Includes active_maintenance so
 * the app can show maintenance windows. `data: null` only when neither exists.
 */
export const getAssignedVehicle = async (req: Request, res: Response) => {
  const driverId = (req as any).user?.driver_id;
  if (!driverId) return res.status(403).json({ success: false, error: { message: 'Driver not authenticated' } });

  try {
    res.json({ success: true, data: await findDriverVehicle(driverId) });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

import { Request, Response } from 'express';
import { prisma } from '../db';
import {
  getRecommendedDriversForVehicle,
  getRecommendedDriversForTrip,
  getRecommendedVehiclesForDriver,
} from '../services/fleetDispatchService';
import { AssignmentType } from '@prisma/client';

/**
 * Endpoint: GET /api/trips/recommendations/drivers
 * Query: vehicleId, vehicleClass, origin, destination, plannedStart
 * Returns ranked driver recommendations based on route experience, capacity match, and availability.
 */
export async function getDriverRecommendations(req: Request, res: Response) {
  try {
    const vehicleId = typeof req.query.vehicleId === 'string' ? req.query.vehicleId : undefined;
    const vehicleClass = typeof req.query.vehicleClass === 'string' ? req.query.vehicleClass : undefined;
    const origin = typeof req.query.origin === 'string' ? req.query.origin : undefined;
    const destination = typeof req.query.destination === 'string' ? req.query.destination : undefined;
    const plannedStart = typeof req.query.plannedStart === 'string' ? req.query.plannedStart : undefined;
    const q = (k: string) => (typeof req.query[k] === 'string' ? (req.query[k] as string) : undefined);

    if (origin || destination || vehicleClass) {
      const recommendations = await getRecommendedDriversForTrip({
        vehicleId,
        vehicleClass,
        origin,
        destination,
        plannedStart,
        plannedEnd: q('plannedEnd'),
        originLocationId: q('originLocationId'),
        destinationLocationId: q('destinationLocationId'),
        customerId: q('customerId'),
        excludeTripId: q('excludeTripId'),
      });

      return res.json({
        success: true,
        data: recommendations,
      });
    }

    if (!vehicleId) {
      const recommendations = await getRecommendedDriversForTrip({});
      return res.json({
        success: true,
        data: recommendations,
      });
    }

    const recommendations = await getRecommendedDriversForVehicle(vehicleId, plannedStart);

    return res.json({
      success: true,
      data: recommendations,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: err.message || 'Failed to fetch driver recommendations' },
    });
  }
}

/**
 * Endpoint: GET /api/trips/recommendations/vehicles?driverId=uuid
 * Returns ranked vehicle backup recommendations for a driver.
 */
export async function getVehicleRecommendations(req: Request, res: Response) {
  try {
    const driverId = typeof req.query.driverId === 'string' ? req.query.driverId : undefined;

    if (!driverId) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'driverId query parameter is required' },
      });
    }

    const recommendations = await getRecommendedVehiclesForDriver(driverId);

    return res.json({
      success: true,
      data: recommendations,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: err.message || 'Failed to fetch vehicle recommendations' },
    });
  }
}

/**
 * Endpoint: POST /api/drivers/:id/assignments
 * Upserts a driver's vehicle preference (Primary, Backup #1, Backup #2).
 */
export async function upsertDriverVehiclePreference(req: Request, res: Response) {
  try {
    const driverId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { vehicleId, assignmentType = 'PRIMARY', priority = 1, notes } = req.body;

    if (!vehicleId || typeof vehicleId !== 'string') {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'vehicleId is required' },
      });
    }

    const notesStr = typeof notes === 'string' ? notes : null;

    const preference = await prisma.driverVehicleAssignment.upsert({
      where: {
        driverId_vehicleId_assignmentType: {
          driverId,
          vehicleId,
          assignmentType: assignmentType as AssignmentType,
        },
      },
      update: {
        priority: Number(priority),
        isActive: true,
        notes: notesStr,
      },
      create: {
        driverId,
        vehicleId,
        assignmentType: assignmentType as AssignmentType,
        priority: Number(priority),
        notes: notesStr,
      },
    });

    return res.json({
      success: true,
      data: preference,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: err.message || 'Failed to update vehicle preference' },
    });
  }
}

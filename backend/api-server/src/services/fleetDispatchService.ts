import { prisma } from '../db';
import { AssignmentType, AssignmentEntityType } from '@prisma/client';

export interface DriverRecommendation {
  driverId: string;
  driverName: string;
  phone?: string | null;
  assignmentType: AssignmentType;
  priority: number;
  isAvailable: boolean;
  unavailabilityReason?: string;
}

export interface TripDriverRecommendationItem {
  driverId: string;
  driverName: string;
  phone?: string | null;
  status: string;
  isAvailable: boolean;
  unavailabilityReason?: string;
  routeTripCount: number;
  capacityMatch: boolean;
  score: number;
  badges: string[];
  vehiclePlate?: string | null;
  vehicleClass?: string | null;
  rest_hours?: number | null;
}

export interface VehicleRecommendation {
  vehicleId: string;
  plateNumber: string;
  assetType: string;
  capacityKg: number;
  assignmentType: AssignmentType;
  priority: number;
  isAvailable: boolean;
  unavailabilityReason?: string;
}

export function getMinCapacityKgForClass(classStr: string): number {
  if (!classStr) return 0;
  const s = String(classStr).toLowerCase();
  if (s.includes('40 feet') || s.includes('40ft')) return 20000;
  if (s.includes('20 ton')) return 18000;
  if (s.includes('10 ton')) return 9000;
  if (s.includes('8 ton')) return 7500;
  if (s.includes('5 ton')) return 4500;
  if (s.includes('3-4 ton') || s.includes('3 ton') || s.includes('4 ton')) return 3000;
  return 0;
}

/**
 * Returns ranked driver recommendations for a trip based on vehicle payload match,
 * route experience (past trip count on same lane), and availability.
 */
export async function getRecommendedDriversForTrip(params: {
  vehicleId?: string | null;
  vehicleClass?: string | null;
  origin?: string | null;
  destination?: string | null;
  plannedStart?: Date | string | null;
}): Promise<TripDriverRecommendationItem[]> {
  const { vehicleId, vehicleClass, origin, destination } = params;

  const origStr = origin ? String(origin).trim().toLowerCase() : '';
  const destStr = destination ? String(destination).trim().toLowerCase() : '';
  const reqClassStr = vehicleClass ? String(vehicleClass).trim().toLowerCase() : '';

  const drivers = await prisma.driver.findMany({
    where: { deletedAt: null, isActive: true },
    include: {
      assignedVehicle: true,
      vehicleAssignments: {
        where: { isActive: true },
        include: { vehicle: true },
      },
      trips: {
        where: { deletedAt: null },
        include: {
          stops: { where: { deletedAt: null }, include: { location: true }, orderBy: { stop_sequence: 'asc' } },
        },
      },
    },
  });

  const now = new Date();
  const recommendations: TripDriverRecommendationItem[] = [];

  for (const driver of drivers) {
    let isAvailable = true;
    let unavailabilityReason: string | undefined;

    if (driver.status === 'OffDuty' || driver.status === 'Inactive') {
      isAvailable = false;
      unavailabilityReason = `Status: ${driver.status}`;
    } else if (driver.license_expiry && new Date(driver.license_expiry) < now) {
      isAvailable = false;
      unavailabilityReason = 'License Expired';
    }

    const driverTrips: any[] = (driver as any).trips || [];

    let rest_hours: number | null = null;
    const completedTrips = driverTrips.filter((t: any) => t.status === 'Completed');
    if (completedTrips.length > 0) {
      completedTrips.sort((a: any, b: any) => {
        const timeA = new Date(a.actual_end || a.updatedAt).getTime();
        const timeB = new Date(b.actual_end || b.updatedAt).getTime();
        return timeB - timeA;
      });
      const lastTripTime = new Date(completedTrips[0].actual_end || completedTrips[0].updatedAt).getTime();
      rest_hours = Math.round((now.getTime() - lastTripTime) / (1000 * 60 * 60));
    }

    if (isAvailable) {
      const hasActiveConflict = driverTrips.some((t: any) => {
        const tStatus = t?.status;
        return tStatus && ['Scheduled', 'Loading', 'InTransit', 'Delayed'].includes(tStatus);
      });
      if (hasActiveConflict) {
        isAvailable = false;
        unavailabilityReason = 'Assigned to Active Trip';
      }
    }

    let routeTripCount = 0;
    if (origStr && destStr) {
      for (const t of driverTrips) {
        const stops = t?.stops || [];
        if (stops.length > 0) {
          const firstStop = stops[0];
          const lastStop = stops.length > 1 ? stops[stops.length - 1] : firstStop;

          const tOrig = (firstStop.source_label || firstStop.location?.name || '').toLowerCase();
          const tDest = (lastStop.source_label || lastStop.location?.name || '').toLowerCase();

          if (
            (tOrig.includes(origStr) || origStr.includes(tOrig)) &&
            (tDest.includes(destStr) || destStr.includes(tDest))
          ) {
            routeTripCount++;
          }
        }
      }
    }

    let capacityMatch = false;
    let assignedPlate: string | null = null;
    let assignedClass: string | null = null;
    let capacityMismatchReason: string | null = null;

    const assignedVeh = (driver as any).assignedVehicle || driver.vehicleAssignments[0]?.vehicle;
    if (assignedVeh) {
      assignedPlate = assignedVeh.plate_number;
      assignedClass = assignedVeh.asset_type;

      if (!reqClassStr) {
        capacityMatch = true;
      } else {
        const vAsset = (assignedVeh.asset_type || '').toLowerCase();
        const vCap = Number(assignedVeh.capacity_kg || 0);
        const reqMinCap = getMinCapacityKgForClass(reqClassStr);

        if (reqMinCap > 0) {
          if (vCap > 0) {
            capacityMatch = vCap >= reqMinCap;
            if (!capacityMatch) {
              const actualTons = vCap >= 1000 ? `${(vCap / 1000).toFixed(0)} TON` : `${vCap} kg`;
              capacityMismatchReason = `Under-Capacity (${actualTons} Truck)`;
            }
          } else {
            const assetCap = getMinCapacityKgForClass(vAsset);
            capacityMatch = assetCap >= reqMinCap || vAsset.includes(reqClassStr);
            if (!capacityMatch) {
              capacityMismatchReason = `Under-Capacity (${assignedVeh.asset_type})`;
            }
          }
        } else {
          capacityMatch = true;
        }
      }
    } else if (!reqClassStr) {
      capacityMatch = true;
    } else {
      capacityMismatchReason = 'No Assigned Vehicle';
    }

    let score = 0;
    
    if (isAvailable && capacityMatch) {
      score += 200; // Base score for available + capacity-matched drivers
      score += routeTripCount * 100;
      if (assignedVeh) {
        score += 50; // Bonus for having a pre-assigned matching vehicle
      }
      const totalCompletedTrips = driverTrips.filter((t: any) => t?.status === 'Completed').length;
      score += Math.min(totalCompletedTrips * 2, 30);

      // Deterministic tie-breaker per driver ID so identical scores rotate dynamically
      const idHash = driver.id.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0) % 20;
      score += idHash / 100;
    } else if (isAvailable && !capacityMatch) {
      score += 10;
    } else {
      score += 0;
    }

    const badges: string[] = [];
    if (!capacityMatch && capacityMismatchReason) {
      badges.push(`⚠️ ${capacityMismatchReason}`);
    }
    if (isAvailable) {
      badges.push(`🟢 Available`);
    } else if (unavailabilityReason) {
      badges.push(`🔴 ${unavailabilityReason}`);
    }
    if (rest_hours !== null) {
      badges.push(`🕒 Rest: ${rest_hours} hrs`);
    }

    recommendations.push({
      driverId: driver.id,
      driverName: `${driver.first_name} ${driver.last_name}`,
      phone: driver.phone_primary,
      status: driver.status,
      isAvailable,
      unavailabilityReason,
      routeTripCount,
      capacityMatch,
      score,
      badges,
      vehiclePlate: assignedPlate,
      vehicleClass: assignedClass,
      rest_hours,
    });
  }

  recommendations.sort((a, b) => b.score - a.score);
  return recommendations;
}

/**
 * Returns ranked driver recommendations for a given vehicle:
 * Checks DriverVehicleAssignment preferences, driver license expiry, and active trip schedules.
 */
export async function getRecommendedDriversForVehicle(
  vehicleId: string,
  plannedStart?: Date | string | null
): Promise<DriverRecommendation[]> {
  const assignments = await prisma.driverVehicleAssignment.findMany({
    where: {
      vehicleId,
      isActive: true,
      driver: { deletedAt: null, isActive: true },
    },
    include: {
      driver: true,
    },
    orderBy: [
      { assignmentType: 'asc' }, // PRIMARY before BACKUP
      { priority: 'asc' },
    ],
  });

  const recommendations: DriverRecommendation[] = [];
  const now = new Date();

  for (const assign of assignments) {
    const driver = assign.driver;
    let isAvailable = true;
    let unavailabilityReason: string | undefined;

    // Check status
    if (driver.status === 'OffDuty' || driver.status === 'Inactive') {
      isAvailable = false;
      unavailabilityReason = `Driver status is ${driver.status}`;
    } else if (driver.license_expiry && new Date(driver.license_expiry) < now) {
      isAvailable = false;
      unavailabilityReason = 'Driver license expired';
    } else {
      // Check if driver is currently on an active trip
      const activeTrip = await prisma.trip.findFirst({
        where: {
          driverId: driver.id,
          deletedAt: null,
          status: { in: ['Scheduled', 'Loading', 'InTransit', 'Delayed'] },
        },
      });

      if (activeTrip) {
        isAvailable = false;
        const ref = activeTrip.ref_id || activeTrip.id.substring(0, 8);
        unavailabilityReason = `Assigned to active Trip #${ref}`;
      }
    }

    recommendations.push({
      driverId: driver.id,
      driverName: `${driver.first_name} ${driver.last_name}`,
      phone: driver.phone_primary,
      assignmentType: assign.assignmentType,
      priority: assign.priority,
      isAvailable,
      unavailabilityReason,
    });
  }

  return recommendations;
}

/**
 * Returns ranked vehicle recommendations for a given driver:
 * Checks DriverVehicleAssignment preferences and active maintenance records.
 */
export async function getRecommendedVehiclesForDriver(
  driverId: string
): Promise<VehicleRecommendation[]> {
  const assignments = await prisma.driverVehicleAssignment.findMany({
    where: {
      driverId,
      isActive: true,
      vehicle: { deletedAt: null, isActive: true },
    },
    include: {
      vehicle: true,
    },
    orderBy: [
      { assignmentType: 'asc' },
      { priority: 'asc' },
    ],
  });

  const recommendations: VehicleRecommendation[] = [];

  for (const assign of assignments) {
    const vehicle = assign.vehicle;
    let isAvailable = true;
    let unavailabilityReason: string | undefined;

    if (vehicle.status === 'Maintenance') {
      isAvailable = false;
      unavailabilityReason = 'Vehicle currently under maintenance';
    } else if (vehicle.status === 'Inactive') {
      isAvailable = false;
      unavailabilityReason = 'Vehicle status is Inactive';
    } else {
      // Check active maintenance record
      const activeMaintenance = await prisma.maintenanceRecord.findFirst({
        where: {
          vehicleId: vehicle.id,
          status: { in: ['In Progress', 'Scheduled', 'Pending'] },
          deletedAt: null,
        },
      });

      if (activeMaintenance) {
        isAvailable = false;
        unavailabilityReason = `In Maintenance at ${activeMaintenance.workshop_name}`;
      }
    }

    recommendations.push({
      vehicleId: vehicle.id,
      plateNumber: vehicle.plate_number,
      assetType: vehicle.asset_type,
      capacityKg: vehicle.capacity_kg,
      assignmentType: assign.assignmentType,
      priority: assign.priority,
      isAvailable,
      unavailabilityReason,
    });
  }

  return recommendations;
}

/**
 * Logs an asset/driver replacement audit event in TripAssignmentEvent.
 */
export async function recordAssignmentEvent(
  tripId: string,
  entityType: AssignmentEntityType,
  fromId: string | null,
  toId: string | null,
  reason: string,
  changedBy?: string | null
) {
  return prisma.tripAssignmentEvent.create({
    data: {
      tripId,
      entityType,
      fromId,
      toId,
      reason,
      changedBy,
    },
  });
}

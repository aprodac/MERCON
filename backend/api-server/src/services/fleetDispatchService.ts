import { prisma } from '../db';
import { AssignmentType, AssignmentEntityType } from '@prisma/client';
import { DISPATCH_RULES, rankDrivers, type DriverFacts, type DriverGroup, type DriverReason } from '@mercon/shared-types';
import { isUuid } from '../utils/uuid';

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
  /** From rankDrivers: picker group, "why" chips, truck fit, clashing trip start. */
  group?: DriverGroup;
  reasons?: DriverReason[];
  truckFit?: 'exact' | 'bigger' | 'smaller' | 'none';
  clashStart?: string;
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
 * Ranked drivers for one trip. Gathers only the facts the shared ranking needs —
 * each driver's truck, bookings around this trip, previous trip, and 90-day
 * lane / customer / punctuality history — then ranks them with rankDrivers
 * (packages/shared-types), the same rules the apps show:
 * 6 h rest before pickup, 1 h gap between trips (DISPATCH_RULES).
 */
export async function getRecommendedDriversForTrip(params: {
  vehicleId?: string | null;
  vehicleClass?: string | null;
  origin?: string | null;
  destination?: string | null;
  originLocationId?: string | null;
  destinationLocationId?: string | null;
  customerId?: string | null;
  plannedStart?: Date | string | null;
  plannedEnd?: Date | string | null;
  excludeTripId?: string | null;
}): Promise<TripDriverRecommendationItem[]> {
  const HOUR = 3_600_000;
  const DAY = 24 * HOUR;
  const now = new Date();
  const parsedStart = params.plannedStart ? new Date(params.plannedStart) : null;
  const start = parsedStart && !isNaN(parsedStart.getTime()) ? parsedStart : now;
  const parsedEnd = params.plannedEnd ? new Date(params.plannedEnd) : null;
  const end = parsedEnd && !isNaN(parsedEnd.getTime()) && parsedEnd > start ? parsedEnd : new Date(start.getTime() + 4 * HOUR);
  const since = new Date(start.getTime() - DISPATCH_RULES.lookbackDays * DAY);
  const weekAgo = new Date(now.getTime() - 7 * DAY);
  const norm = (v?: string | null) => (v || '').trim().toLowerCase();
  const origName = norm(params.origin);
  const destName = norm(params.destination);
  const originLocId = isUuid(params.originLocationId) ? (params.originLocationId as string) : null;
  const destLocId = isUuid(params.destinationLocationId) ? (params.destinationLocationId as string) : null;
  const customerId = isUuid(params.customerId) ? (params.customerId as string) : null;
  const excludeTripId = isUuid(params.excludeTripId) ? (params.excludeTripId as string) : undefined;

  const truckSelect = { id: true, plate_number: true, capacity_kg: true, asset_type: true, status: true } as const;
  const drivers = await prisma.driver.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      first_name: true,
      last_name: true,
      phone_primary: true,
      status: true,
      isActive: true,
      license_expiry: true,
      assignedVehicle: { select: truckSelect },
      vehicleAssignments: { where: { isActive: true }, take: 1, select: { vehicle: { select: truckSelect } } },
    },
  });
  const driverIds = drivers.map((d) => d.id);
  if (driverIds.length === 0) return [];

  const truckOf = (d: (typeof drivers)[number]) => d.assignedVehicle || d.vehicleAssignments[0]?.vehicle || null;
  const truckIds = drivers.map(truckOf).filter((t): t is NonNullable<typeof t> => Boolean(t)).map((t) => t.id);

  const [nearTrips, previousTrips, history, maintenance] = await Promise.all([
    // Active trips around this one — for the clash check (driver or co-driver).
    prisma.trip.findMany({
      where: {
        deletedAt: null,
        ...(excludeTripId ? { id: { not: excludeTripId } } : {}),
        status: { in: ['Scheduled', 'Loading', 'InTransit', 'Delayed'] },
        AND: [
          { OR: [{ driverId: { in: driverIds } }, { co_driver_id: { in: driverIds } }] },
          { planned_start: { lte: new Date(end.getTime() + 2 * DAY) } },
          {
            OR: [
              { planned_end: { gte: new Date(start.getTime() - 2 * DAY) } },
              { planned_end: null, planned_start: { gte: new Date(start.getTime() - 2 * DAY) } },
            ],
          },
        ],
      },
      select: { id: true, driverId: true, co_driver_id: true, planned_start: true, planned_end: true },
    }),
    // Each driver's previous trip before this pickup: when and where it ends.
    prisma.trip.findMany({
      where: { deletedAt: null, driverId: { in: driverIds }, status: { notIn: ['Cancelled', 'Draft'] }, planned_start: { lt: start } },
      orderBy: { planned_start: 'desc' },
      distinct: ['driverId'],
      select: {
        driverId: true,
        planned_start: true,
        planned_end: true,
        actual_end: true,
        stops: {
          where: { deletedAt: null },
          orderBy: { stop_sequence: 'desc' },
          take: 1,
          select: { locationId: true, location_name: true, location: { select: { name: true } } },
        },
      },
    }),
    // 90-day history: lane, customer, punctuality, this week's load.
    prisma.trip.findMany({
      where: { deletedAt: null, driverId: { in: driverIds }, status: { notIn: ['Cancelled', 'Draft'] }, planned_start: { gte: since } },
      select: {
        driverId: true,
        customerId: true,
        planned_start: true,
        stops: {
          where: { deletedAt: null, leg_index: 0 },
          orderBy: { stop_sequence: 'asc' },
          select: { locationId: true, location_name: true, planned_arrival: true, actual_arrival: true, delay_reason: true },
        },
      },
    }),
    truckIds.length
      ? prisma.maintenanceRecord.findMany({
          where: {
            deletedAt: null,
            vehicleId: { in: truckIds },
            status: { in: ['Scheduled', 'In_Progress', 'In Progress'] },
            start_date: { lte: end },
            OR: [{ end_date: null }, { end_date: { gte: start } }],
          },
          select: { vehicleId: true },
        })
      : Promise.resolve([] as { vehicleId: string }[]),
  ]);

  const inMaintenance = new Set(maintenance.map((m) => m.vehicleId));
  const previousByDriver = new Map(previousTrips.map((t) => [t.driverId as string, t]));

  const facts: DriverFacts[] = drivers.map((d) => {
    const truck = truckOf(d);
    const bookings = nearTrips
      .filter((t) => (t.driverId === d.id || t.co_driver_id === d.id) && t.planned_start)
      .map((t) => ({ tripId: t.id, start: t.planned_start as Date, end: t.planned_end }));
    const prev = previousByDriver.get(d.id);
    const prevEnd = prev ? prev.actual_end || prev.planned_end || prev.planned_start : null;
    const prevStop = prev?.stops[0];

    let laneTrips = 0;
    let customerTrips = 0;
    let stopsTimed = 0;
    let stopsLate = 0;
    let tripsThisWeek = 0;
    for (const t of history) {
      if (t.driverId !== d.id) continue;
      if (customerId && t.customerId === customerId) customerTrips++;
      if (t.planned_start && t.planned_start >= weekAgo) tripsThisWeek++;
      const first = t.stops[0];
      const last = t.stops[t.stops.length - 1];
      if (first && last && t.stops.length > 1) {
        // Same lane by location, or by exact name when a location is missing — never by substring.
        const sameStart = originLocId && first.locationId ? first.locationId === originLocId : Boolean(origName) && norm(first.location_name) === origName;
        const sameEnd = destLocId && last.locationId ? last.locationId === destLocId : Boolean(destName) && norm(last.location_name) === destName;
        if (sameStart && sameEnd) laneTrips++;
      }
      for (const st of t.stops) {
        if (!st.actual_arrival || !st.planned_arrival) continue;
        stopsTimed++;
        if (st.delay_reason || st.actual_arrival.getTime() > st.planned_arrival.getTime() + 30 * 60_000) stopsLate++;
      }
    }

    return {
      driverId: d.id,
      status: d.status,
      isActive: d.isActive,
      licenseExpiry: d.license_expiry,
      truck: truck
        ? { id: truck.id, plate: truck.plate_number, capacityKg: truck.capacity_kg, assetType: truck.asset_type, inMaintenance: inMaintenance.has(truck.id) }
        : null,
      bookings,
      lastTrip: prevEnd
        ? { end: prevEnd, endPlace: prevStop?.location_name || prevStop?.location?.name || null, endLocationId: prevStop?.locationId || null }
        : null,
      laneTrips,
      customerTrips,
      tripsThisWeek,
      onTimeRate: stopsTimed >= 3 ? (stopsTimed - stopsLate) / stopsTimed : null,
    };
  });

  const activeFacts = facts.filter((f) => f.isActive !== false);
  const fleetAvgTripsThisWeek = activeFacts.length ? activeFacts.reduce((a, f) => a + f.tripsThisWeek, 0) / activeFacts.length : 0;
  const ranked = rankDrivers(
    facts,
    { start, end, vehicleClass: params.vehicleClass, pickupPlace: params.origin, pickupLocationId: originLocId },
    { now: now.getTime(), fleetAvgTripsThisWeek },
  );

  const byId = new Map(drivers.map((d) => [d.id, d]));
  const factsById = new Map(facts.map((f) => [f.driverId, f]));
  return ranked.map((r) => {
    const d = byId.get(r.driverId)!;
    const f = factsById.get(r.driverId)!;
    return {
      driverId: r.driverId,
      driverName: `${d.first_name} ${d.last_name}`,
      phone: d.phone_primary,
      status: d.status,
      isAvailable: r.group !== 'unavailable',
      unavailabilityReason: r.blockedReason,
      routeTripCount: f.laneTrips,
      capacityMatch: r.truckFit === 'exact',
      score: r.score,
      badges: r.reasons.map((x) => x.text),
      vehiclePlate: f.truck?.plate ?? null,
      vehicleClass: r.truckClass ?? null,
      rest_hours: r.restHours,
      group: r.group,
      reasons: r.reasons,
      truckFit: r.truckFit,
      clashStart: r.clashStart,
    };
  });
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

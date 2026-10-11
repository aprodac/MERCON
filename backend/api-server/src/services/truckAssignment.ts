/**
 * Which truck a driver drives (Driver.assignedVehicleId — one truck per driver,
 * one driver per truck), changed from either side with its knock-on effects
 * spelled out first:
 *
 *   Give USA-6010 to Abdullah:
 *     · Abdullah leaves KSA-6102  → KSA-6102 will have no driver
 *     · Imtiaz Ahmed leaves USA-6010 → Imtiaz Ahmed will have no truck
 *
 * `previewTruckAssignment` says what will happen; `applyTruckAssignment` does
 * it in one transaction (the old pairs are cleared first, so the unique index
 * never trips). Trips already booked keep the truck and driver they were given.
 *
 * Request: { driver_id, vehicle_id } — both set pairs them; vehicle_id null
 * takes the driver off their truck; driver_id null empties the truck.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../db';
import { RUNNING_TRIP_STATUSES } from './driverDuty';

type Db = PrismaClient | Prisma.TransactionClient;

export interface AssignmentRequest {
  driver_id: string | null;
  vehicle_id: string | null;
}

interface DriverRef { id: string; name: string; phone: string | null }
interface VehicleRef { id: string; plate: string }

export type AssignmentEffect =
  /** The new pair. */
  | { type: 'assign'; driver: DriverRef; vehicle: VehicleRef }
  /** The driver moves off the truck they had; that truck is left with no driver. */
  | { type: 'vehicle_emptied'; vehicle: VehicleRef; previous_driver: DriverRef }
  /** The truck's driver is replaced; they are left with no truck. */
  | { type: 'driver_freed'; driver: DriverRef; previous_vehicle: VehicleRef };

export interface AssignmentWarning {
  type: 'on_trip';
  driver: DriverRef;
  trip_ref: string | null;
  /** The truck that trip runs with — it keeps it. */
  plate: string | null;
}

export interface AssignmentPreview {
  no_change: boolean;
  /** The truck / driver as they are now (the side being edited). */
  vehicle: (VehicleRef & { current_driver: DriverRef | null }) | null;
  driver: (DriverRef & { current_vehicle: VehicleRef | null }) | null;
  effects: AssignmentEffect[];
  warnings: AssignmentWarning[];
}

export class AssignmentError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const driverRef = (d: { id: string; first_name: string; last_name: string | null; phone_primary: string | null }): DriverRef => ({
  id: d.id,
  name: `${d.first_name} ${d.last_name ?? ''}`.trim(),
  phone: d.phone_primary,
});
const vehicleRef = (v: { id: string; plate_number: string }): VehicleRef => ({ id: v.id, plate: v.plate_number });

const DRIVER_SELECT = {
  id: true,
  first_name: true,
  last_name: true,
  phone_primary: true,
  assignedVehicle: { select: { id: true, plate_number: true, deletedAt: true } },
} as const;

export async function previewTruckAssignment(req: AssignmentRequest, db: Db = prisma): Promise<AssignmentPreview> {
  if (!req.driver_id && !req.vehicle_id) {
    throw new AssignmentError(400, 'VALIDATION_ERROR', 'Choose a driver or a truck');
  }

  const [driver, vehicle] = await Promise.all([
    req.driver_id ? db.driver.findFirst({ where: { id: req.driver_id, deletedAt: null }, select: DRIVER_SELECT }) : null,
    req.vehicle_id
      ? db.vehicle.findFirst({
          where: { id: req.vehicle_id, deletedAt: null },
          select: { id: true, plate_number: true, assignedDriver: { select: { ...DRIVER_SELECT, deletedAt: true } } },
        })
      : null,
  ]);
  if (req.driver_id && !driver) throw new AssignmentError(404, 'NOT_FOUND', 'Driver not found');
  if (req.vehicle_id && !vehicle) throw new AssignmentError(404, 'NOT_FOUND', 'Truck not found');

  const driverTruck = driver?.assignedVehicle && !driver.assignedVehicle.deletedAt ? vehicleRef(driver.assignedVehicle) : null;
  const truckDriver = vehicle?.assignedDriver && !vehicle.assignedDriver.deletedAt ? driverRef(vehicle.assignedDriver) : null;

  const effects: AssignmentEffect[] = [];
  let noChange = false;

  if (driver && vehicle) {
    noChange = driverTruck?.id === vehicle.id;
    if (!noChange) {
      effects.push({ type: 'assign', driver: driverRef(driver), vehicle: vehicleRef(vehicle) });
      if (driverTruck) effects.push({ type: 'vehicle_emptied', vehicle: driverTruck, previous_driver: driverRef(driver) });
      if (truckDriver && truckDriver.id !== driver.id) effects.push({ type: 'driver_freed', driver: truckDriver, previous_vehicle: vehicleRef(vehicle) });
    }
  } else if (driver) {
    // Take the driver off their truck.
    noChange = !driverTruck;
    if (driverTruck) effects.push({ type: 'vehicle_emptied', vehicle: driverTruck, previous_driver: driverRef(driver) });
  } else if (vehicle) {
    // Empty the truck.
    noChange = !truckDriver;
    if (truckDriver) effects.push({ type: 'driver_freed', driver: truckDriver, previous_vehicle: vehicleRef(vehicle) });
  }

  // Anyone whose truck changes while they're out on a trip: that trip keeps its truck.
  const touched = new Map<string, DriverRef>();
  for (const e of effects) {
    if (e.type === 'assign') touched.set(e.driver.id, e.driver);
    if (e.type === 'vehicle_emptied') touched.set(e.previous_driver.id, e.previous_driver);
    if (e.type === 'driver_freed') touched.set(e.driver.id, e.driver);
  }
  const warnings: AssignmentWarning[] = [];
  if (touched.size > 0) {
    const running = await db.trip.findMany({
      where: {
        deletedAt: null,
        status: { in: RUNNING_TRIP_STATUSES },
        OR: [{ driverId: { in: [...touched.keys()] } }, { co_driver_id: { in: [...touched.keys()] } }],
      },
      select: { ref_id: true, driverId: true, co_driver_id: true, vehicle: { select: { plate_number: true } } },
    });
    for (const t of running) {
      const who = touched.get(t.driverId ?? '') ?? touched.get(t.co_driver_id ?? '');
      if (who && !warnings.some((w) => w.driver.id === who.id)) {
        warnings.push({ type: 'on_trip', driver: who, trip_ref: t.ref_id, plate: t.vehicle?.plate_number ?? null });
      }
    }
  }

  return {
    no_change: noChange,
    vehicle: vehicle ? { ...vehicleRef(vehicle), current_driver: truckDriver } : null,
    driver: driver ? { ...driverRef(driver), current_vehicle: driverTruck } : null,
    effects,
    warnings,
  };
}

export async function applyTruckAssignment(req: AssignmentRequest, userId: string | null): Promise<AssignmentPreview> {
  return prisma.$transaction(async (tx) => {
    const preview = await previewTruckAssignment(req, tx);
    if (preview.no_change) return preview;

    // Clear the old pairs first: assignedVehicleId is unique.
    if (req.vehicle_id) {
      await tx.driver.updateMany({
        where: { assignedVehicleId: req.vehicle_id, ...(req.driver_id ? { id: { not: req.driver_id } } : {}) },
        data: { assignedVehicleId: null, updated_by: userId },
      });
    }
    if (req.driver_id) {
      await tx.driver.update({
        where: { id: req.driver_id },
        data: { assignedVehicleId: req.vehicle_id, updated_by: userId },
      });
    }
    return preview;
  });
}

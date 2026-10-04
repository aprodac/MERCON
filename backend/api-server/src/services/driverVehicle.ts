import { Prisma, TripStatus } from '@prisma/client';
import { prisma } from '../db';

/**
 * Which truck the driver app shows: the current trip's truck, else the truck
 * the office assigned to the driver. One rule for the Profile header and the
 * Vehicle page — they used to disagree ("Vehicle: DRA-6487" on Profile,
 * "No vehicle assigned" on the Vehicle page) whenever there was no trip.
 */

/** Trips that are still the driver's current or next job. */
export const CURRENT_TRIP_STATUSES = [
  TripStatus.Draft,
  TripStatus.Scheduled,
  TripStatus.Loading,
  TripStatus.InTransit,
  TripStatus.Delayed,
];

const vehicleSelect = Prisma.validator<Prisma.VehicleSelect>()({
  id: true,
  ref_id: true,
  plate_number: true,
  asset_type: true,
  status: true,
  capacity_kg: true,
  current_odometer: true,
  trailer_number: true,
  trailer_type: true,
  deletedAt: true,
  maintenanceRecords: {
    where: {
      deletedAt: null,
      OR: [{ status: { in: ['In_Progress', 'In Progress'] } }, { status: 'Scheduled' }],
    },
    orderBy: { start_date: 'asc' },
    take: 3,
    select: { id: true, status: true, maintenance_type: true, workshop_name: true, start_date: true, end_date: true },
  },
});

export interface MaintenanceWindow {
  id: string;
  status: string;
  maintenance_type: string | null;
  workshop_name: string | null;
  start_date: Date | null;
  end_date: Date | null;
}

/** The maintenance to warn about: in progress, else scheduled covering now, else the next scheduled. */
export function pickActiveMaintenance(records: MaintenanceWindow[], now: Date = new Date()): MaintenanceWindow | null {
  return (
    records.find((r) => r.status === 'In_Progress' || r.status === 'In Progress') ??
    records.find((r) => r.status === 'Scheduled' && r.start_date && new Date(r.start_date) <= now && (!r.end_date || new Date(r.end_date) >= now)) ??
    records.find((r) => r.status === 'Scheduled') ??
    null
  );
}

export async function findDriverVehicle(driverId: string, now: Date = new Date()) {
  const [trip, driver] = await Promise.all([
    prisma.trip.findFirst({
      where: { driverId, deletedAt: null, status: { in: CURRENT_TRIP_STATUSES } },
      orderBy: { createdAt: 'desc' },
      select: { ref_id: true, vehicle: { select: vehicleSelect } },
    }),
    prisma.driver.findFirst({
      where: { id: driverId, deletedAt: null },
      select: { assignedVehicle: { select: vehicleSelect } },
    }),
  ]);

  const tripVehicle = trip?.vehicle && !trip.vehicle.deletedAt ? trip.vehicle : null;
  const assigned = driver?.assignedVehicle && !driver.assignedVehicle.deletedAt ? driver.assignedVehicle : null;
  const chosen = tripVehicle ?? assigned;
  if (!chosen) return null;

  const { maintenanceRecords, deletedAt: _deleted, ...vehicle } = chosen as any;
  return {
    ...vehicle,
    // Only when the truck comes from the trip; an assigned truck is not "on" a trip.
    trip_ref_id: tripVehicle ? trip!.ref_id : null,
    source: tripVehicle ? ('trip' as const) : ('assigned' as const),
    active_maintenance: pickActiveMaintenance((maintenanceRecords ?? []) as MaintenanceWindow[], now),
  };
}

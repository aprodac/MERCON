/**
 * Everything the trip details page's map needs, for a trip in any state.
 *
 *  - planned (Draft / Scheduled): the stops, where the assigned truck is right
 *    now, and pre-trip checks — driver and truck assigned, and documents that
 *    expire before the trip is due to start.
 *  - active (Loading / In transit / Delayed): the live unit (truck + driver
 *    feeds, same shape as the fleet map) and the path driven so far.
 *  - done (Completed / Invoiced): the path actually driven — from the driver
 *    app's GPS, the only source with history (the truck tracker keeps only its
 *    latest position).
 *  - cancelled: just the stops.
 */
import type { PrismaClient } from '@prisma/client';
import {
  DRIVER_SELECT, buildLiveUnits, haversineMeters, tripOut,
  type LiveStop, type LiveTripRow, type LiveUnit, type LiveVehicleRow,
} from './fleetLiveMap';
import { DOC_TYPE_LABEL, daysUntil, latestPerSlot, type ExpiryDocRow } from './operatorInbox';

export type TripPhase = 'planned' | 'active' | 'done' | 'cancelled';

export interface PreTripCheck {
  entity: 'Truck' | 'Driver';
  name: string;
  label: string;
  expiry_date: string;
  /** Already expired today (vs. only expiring before the trip starts). */
  expired: boolean;
}

export interface TripOverview {
  trip_id: string;
  status: string;
  phase: TripPhase;
  stops: LiveStop[];
  next_stop_index: number | null;
  /** Truck/driver with both GPS feeds — planned and active trips only. */
  unit: LiveUnit | null;
  /** [lng, lat] points driven, oldest first. Empty when the driver app sent none. */
  path: [number, number][];
  path_distance_m: number | null;
  checks: {
    driver_assigned: boolean;
    truck_assigned: boolean;
    third_party: boolean;
    expiring: PreTripCheck[];
  } | null;
}

/** More points than this are thinned — the line looks the same and the payload stays small. */
export const MAX_PATH_POINTS = 1500;

export function tripPhase(status: string): TripPhase {
  if (status === 'Draft' || status === 'Scheduled') return 'planned';
  if (status === 'Completed' || status === 'Invoiced') return 'done';
  if (status === 'Cancelled') return 'cancelled';
  return 'active';
}

/** Keeps the first and last point and every n-th in between. */
export function thinPath<T>(points: T[], max = MAX_PATH_POINTS): T[] {
  if (points.length <= max) return points;
  const step = Math.ceil(points.length / max);
  const out = points.filter((_, i) => i % step === 0);
  if (out[out.length - 1] !== points[points.length - 1]) out.push(points[points.length - 1]);
  return out;
}

export function pathDistanceMeters(points: Array<{ lat: number; lng: number }>): number {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += haversineMeters(points[i - 1], points[i]);
  return Math.round(d);
}

const VEHICLE_SELECT = {
  id: true, ref_id: true, plate_number: true, asset_type: true, status: true, image_url: true, icces_device_id: true,
  last_lat: true, last_lng: true, last_speed_kph: true, last_heading: true, last_seen_at: true,
  assignedDriver: { select: DRIVER_SELECT },
} as const;

export async function loadTripOverview(db: PrismaClient, tripId: string, now = new Date()): Promise<TripOverview | null> {
  const trip = await db.trip.findFirst({
    where: { id: tripId, deletedAt: null },
    select: {
      id: true, ref_id: true, status: true, vehicleId: true, driverId: true, is_third_party: true,
      planned_start: true, planned_end: true, updatedAt: true,
      customer: { select: { name: true } },
      driver: { select: { ...DRIVER_SELECT, license_expiry: true } },
      vehicle: { select: VEHICLE_SELECT },
      stops: {
        where: { deletedAt: null },
        select: {
          id: true, stop_sequence: true, stop_type: true, location_name: true, location_address: true,
          location_lat: true, location_lng: true, planned_arrival: true, actual_arrival: true, actual_departure: true,
        },
      },
    },
  });
  if (!trip) return null;
  const phase = tripPhase(trip.status);

  const locations = phase === 'active' || phase === 'done'
    ? await db.tripLocation.findMany({
        where: { tripId },
        orderBy: { recordedAt: 'asc' },
        select: { lat: true, lng: true, speed_kph: true, heading: true, accuracy_m: true, recordedAt: true },
      })
    : [];

  // Reuse the fleet map's builder so the unit, feeds and stop ordering match it exactly.
  const tripRow = { ...trip, driver: trip.driver } as unknown as LiveTripRow;
  const latest = locations.length ? { ...locations[locations.length - 1], tripId } : undefined;
  const built = buildLiveUnits(
    {
      vehicles: trip.vehicle ? [trip.vehicle as unknown as LiveVehicleRow] : [],
      trips: [tripRow],
      tripLocations: latest ? [latest] : [],
    },
    now.getTime(),
  );
  const unit = phase === 'planned' || phase === 'active' ? built[0] ?? null : null;
  const formatted = tripOut(tripRow);
  const stops = formatted?.stops ?? [];

  const valid = locations.filter((l) => Number.isFinite(l.lat) && Number.isFinite(l.lng) && !(l.lat === 0 && l.lng === 0));
  const path = thinPath(valid.map((l) => [l.lng, l.lat] as [number, number]));

  return {
    trip_id: trip.id,
    status: trip.status,
    phase,
    stops,
    next_stop_index: formatted?.next_stop_index ?? null,
    unit,
    path,
    path_distance_m: valid.length >= 2 ? pathDistanceMeters(valid) : null,
    checks: phase === 'planned' ? await preTripChecks(db, trip, now) : null,
  };
}

async function preTripChecks(
  db: PrismaClient,
  trip: {
    vehicleId: string | null; driverId: string | null; is_third_party: boolean; planned_start: Date | null;
    vehicle: { plate_number: string } | null;
    driver: { first_name: string; last_name: string; license_expiry: Date | null } | null;
  },
  now: Date,
): Promise<NonNullable<TripOverview['checks']>> {
  // A document must still be valid on the day the trip starts (or today, if it has no start time).
  const mustBeValidOn = trip.planned_start && trip.planned_start > now ? trip.planned_start : now;
  const owners = [
    trip.vehicleId ? { entity_type: 'Vehicle', entity_id: trip.vehicleId } : null,
    trip.driverId ? { entity_type: 'Driver', entity_id: trip.driverId } : null,
  ].filter(Boolean) as { entity_type: string; entity_id: string }[];

  const docs = owners.length
    ? await db.document.findMany({
        where: { deletedAt: null, expiry_date: { not: null }, OR: owners },
        select: {
          id: true, entity_type: true, entity_id: true, doc_type: true, documentTypeId: true,
          documentType: { select: { name: true } }, expiry_date: true, status: true,
        },
      })
    : [];

  const driverName = trip.driver ? `${trip.driver.first_name} ${trip.driver.last_name}`.trim() : '';
  const expiring: PreTripCheck[] = [];
  let licenceDocSeen = false;
  for (const d of latestPerSlot(docs as ExpiryDocRow[])) {
    const label = d.documentType?.name || (d.doc_type ? DOC_TYPE_LABEL[d.doc_type] ?? d.doc_type : 'Document');
    if (d.entity_type === 'Driver' && (d.doc_type === 'DriverLicense' || /licen[cs]e/i.test(label))) licenceDocSeen = true;
    if (new Date(d.expiry_date!) >= mustBeValidOn) continue;
    expiring.push({
      entity: d.entity_type === 'Vehicle' ? 'Truck' : 'Driver',
      name: d.entity_type === 'Vehicle' ? trip.vehicle?.plate_number ?? 'Truck' : driverName || 'Driver',
      label,
      expiry_date: new Date(d.expiry_date!).toISOString(),
      expired: daysUntil(new Date(d.expiry_date!), now) < 0,
    });
  }
  if (!licenceDocSeen && trip.driver?.license_expiry && trip.driver.license_expiry < mustBeValidOn) {
    expiring.push({
      entity: 'Driver',
      name: driverName || 'Driver',
      label: 'Driving licence',
      expiry_date: trip.driver.license_expiry.toISOString(),
      expired: daysUntil(trip.driver.license_expiry, now) < 0,
    });
  }

  return {
    driver_assigned: !!trip.driverId,
    truck_assigned: !!trip.vehicleId,
    third_party: trip.is_third_party,
    expiring,
  };
}

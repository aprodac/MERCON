import { CoordinatePrecision, Prisma, TripStatus } from '@prisma/client';
import { prisma } from '../db';

type Tx = Prisma.TransactionClient | typeof prisma;

/** Same normalisation as Location.slug (locationController.toSlug). */
const toSlug = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

export interface PinInput {
  lat: number;
  lng: number;
  /** Full address of the pinned place, when the pin came from a search or a pasted link. */
  address?: string | null;
}

/** A finished trip is a record of what happened — its stops are never re-pinned. */
const CLOSED: TripStatus[] = [TripStatus.Completed, TripStatus.Invoiced, TripStatus.Cancelled];

/**
 * Whether a stop is the customer location itself rather than a yard inside it.
 * A Location can be a lane endpoint ("Riyadh") with each trip's stop naming the
 * actual dock, so a pin only travels between the two when they are the same
 * place — otherwise pinning one Riyadh yard would move every Riyadh stop there.
 */
export function isSamePlace(stopName: string | null | undefined, locationName: string): boolean {
  const s = toSlug(stopName ?? '');
  return !s || s === toSlug(locationName);
}

/**
 * Pin a customer location exactly, and carry the pin to every open trip stop
 * that still uses the old guess (approximate / no pin, not yet arrived). This
 * is what makes "we got the real location later" a single action: ETA, driver
 * navigation and geofence arrival all read the stop's own coordinates.
 */
export async function pinLocation(tx: Tx, locationId: string, pin: PinInput, userId: string | null) {
  const address = pin.address?.trim() || null;
  const location = await tx.location.update({
    where: { id: locationId },
    data: {
      lat: pin.lat,
      lng: pin.lng,
      coordinate_precision: CoordinatePrecision.EXACT,
      ...(address ? { address } : {}),
      updated_by: userId,
    },
  });

  const candidates = await tx.tripStop.findMany({
    where: {
      locationId,
      deletedAt: null,
      actual_arrival: null,
      OR: [
        { location_coordinate_precision: null },
        { location_coordinate_precision: { in: [CoordinatePrecision.APPROXIMATE, CoordinatePrecision.UNKNOWN] } },
      ],
      trip: { deletedAt: null, status: { notIn: CLOSED } },
    },
    select: { id: true, tripId: true, location_name: true },
  });
  const stops = candidates.filter((s) => isSamePlace(s.location_name, location.name));

  if (stops.length > 0) {
    await tx.tripStop.updateMany({
      where: { id: { in: stops.map((s) => s.id) } },
      data: {
        location_lat: pin.lat,
        location_lng: pin.lng,
        location_coordinate_precision: CoordinatePrecision.EXACT,
        ...(address ? { location_address: address } : {}),
        updated_by: userId,
      },
    });
  }

  return { location, tripIds: [...new Set(stops.map((s) => s.tripId))] };
}

export class PinError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

/**
 * Pin one trip stop exactly. When the stop is its customer location and that
 * location isn't pinned yet (or still holds the very guess this stop was
 * copied from), the location is pinned too — so the next trip starts exact and
 * the other open trips going there are fixed in the same step.
 */
export async function pinTripStop(tx: Tx, tripId: string, stopId: string, pin: PinInput, userId: string | null) {
  const stop = await tx.tripStop.findFirst({
    where: { id: stopId, tripId, deletedAt: null },
    include: { trip: { select: { status: true, deletedAt: true } }, location: true },
  });
  if (!stop || stop.trip.deletedAt) throw new PinError(404, 'NOT_FOUND', 'Stop not found on this trip');
  if (CLOSED.includes(stop.trip.status)) {
    throw new PinError(409, 'TRIP_CLOSED', `This trip is ${stop.trip.status.toLowerCase()} — its stops can no longer be changed.`);
  }

  const address = pin.address?.trim() || null;
  const updated = await tx.tripStop.update({
    where: { id: stop.id },
    data: {
      location_lat: pin.lat,
      location_lng: pin.lng,
      location_coordinate_precision: CoordinatePrecision.EXACT,
      ...(address ? { location_address: address } : {}),
      updated_by: userId,
    },
  });

  const loc = stop.location;
  let locationPinned = false;
  let otherTripIds: string[] = [];
  if (loc && !loc.deletedAt && isSamePlace(stop.location_name, loc.name)) {
    const copiedFromLocation = loc.lat != null && loc.lat === stop.location_lat && loc.lng === stop.location_lng;
    if (loc.coordinate_precision !== CoordinatePrecision.EXACT || copiedFromLocation) {
      const r = await pinLocation(tx, loc.id, pin, userId);
      locationPinned = true;
      otherTripIds = r.tripIds.filter((id) => id !== tripId);
    }
  }

  return { stop: updated, locationPinned, otherTripIds };
}

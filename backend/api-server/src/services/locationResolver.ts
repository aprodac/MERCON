import { PrismaClient, TripStatus } from '@prisma/client';

export type LocationSource = 'DRIVER_GPS' | 'PHYSICAL_GPS' | 'NONE';
export type LocationDisplayState = 'CURRENT' | 'LAST_KNOWN' | 'UNAVAILABLE';

export interface ResolvedVehicleLocation {
  vehicle_id: string;
  ref_id: string | null;
  plate_number: string;
  latitude: number | null;
  longitude: number | null;
  speed_kph: number | null;
  heading_deg: number | null;
  accuracy_m: number | null;
  source: LocationSource;
  display_state: LocationDisplayState;
  timestamp: string | null;
  formatted_time_ago: string;
  active_trip_id: string | null;
  active_driver_id: string | null;
}

const DRIVER_GPS_FRESH_MS = 120_000;  // 2 minutes
const PHYSICAL_GPS_FRESH_MS = 180_000; // 3 minutes

/** Active trip statuses where driver GPS is permitted to represent the vehicle */
export const OPERATIONAL_TRIP_STATUSES: TripStatus[] = [
  TripStatus.Scheduled,
  TripStatus.Draft,
  TripStatus.Loading,
  TripStatus.InTransit,
  TripStatus.Delayed,
];

function safeToISOString(dateVal: any): string | null {
  if (!dateVal) return null;
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

function safeGetTime(dateVal: any): number {
  if (!dateVal) return 0;
  try {
    const d = new Date(dateVal);
    const t = d.getTime();
    return isNaN(t) ? 0 : t;
  } catch {
    return 0;
  }
}

function formatTimeAgo(dateVal: any): string {
  if (!dateVal) return 'Never';
  const t = safeGetTime(dateVal);
  if (t === 0) return 'Never';
  const secondsAgo = Math.floor((Date.now() - t) / 1000);
  if (secondsAgo < 60) return 'Just now';
  const minutesAgo = Math.floor(secondsAgo / 60);
  if (minutesAgo < 60) return `${minutesAgo}m ago`;
  const hoursAgo = Math.floor(minutesAgo / 60);
  if (hoursAgo < 24) return `${hoursAgo}h ago`;
  const daysAgo = Math.floor(hoursAgo / 24);
  return `${daysAgo}d ago`;
}

/**
 * Authoritative Backend Location Resolver.
 * Computes the best defensible vehicle location dynamically without mutating the database.
 */
export async function resolveVehicleLocation(
  vehicle: {
    id: string;
    ref_id?: string | null;
    plate_number: string;
    last_lat?: number | null;
    last_lng?: number | null;
    last_speed_kph?: number | null;
    last_heading?: number | null;
    last_status?: string | null;
    last_seen_at?: Date | null;
    icces_device_id?: string | null;
  },
  dbClient?: any,
): Promise<ResolvedVehicleLocation> {
  const db = dbClient || require('../index').prisma;
  const now = Date.now();

  const baseResult: ResolvedVehicleLocation = {
    vehicle_id: vehicle.id,
    ref_id: vehicle.ref_id ?? null,
    plate_number: vehicle.plate_number,
    latitude: null,
    longitude: null,
    speed_kph: null,
    heading_deg: null,
    accuracy_m: null,
    source: 'NONE',
    display_state: 'UNAVAILABLE',
    timestamp: null,
    formatted_time_ago: 'Never',
    active_trip_id: null,
    active_driver_id: null,
  };

  // 1. Check if vehicle currently has an operational active trip
  const activeTrip = await db.trip.findFirst({
    where: {
      vehicleId: vehicle.id,
      status: { in: OPERATIONAL_TRIP_STATUSES },
      deletedAt: null,
    },
    select: { id: true, driverId: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
  });

  const isPhysicalFresh =
    vehicle.last_seen_at != null &&
    vehicle.last_lat != null &&
    vehicle.last_lng != null &&
    now - safeGetTime(vehicle.last_seen_at) <= PHYSICAL_GPS_FRESH_MS;

  const hasPhysicalLocation =
    vehicle.last_seen_at != null &&
    vehicle.last_lat != null &&
    vehicle.last_lng != null;

  // RULE A & E: NO ACTIVE TRIP (or Trip Completed/Cancelled)
  // Driver GPS MUST NOT influence vehicle location outside an active trip.
  if (!activeTrip) {
    if (isPhysicalFresh) {
      return {
        ...baseResult,
        latitude: vehicle.last_lat!,
        longitude: vehicle.last_lng!,
        speed_kph: vehicle.last_speed_kph ?? null,
        heading_deg: vehicle.last_heading ?? null,
        source: 'PHYSICAL_GPS',
        display_state: 'CURRENT',
        timestamp: safeToISOString(vehicle.last_seen_at),
        formatted_time_ago: formatTimeAgo(vehicle.last_seen_at),
      };
    } else if (hasPhysicalLocation) {
      return {
        ...baseResult,
        latitude: vehicle.last_lat!,
        longitude: vehicle.last_lng!,
        speed_kph: vehicle.last_speed_kph ?? null,
        heading_deg: vehicle.last_heading ?? null,
        source: 'PHYSICAL_GPS',
        display_state: 'LAST_KNOWN',
        timestamp: safeToISOString(vehicle.last_seen_at),
        formatted_time_ago: formatTimeAgo(vehicle.last_seen_at),
      };
    } else {
      return baseResult;
    }
  }

  // RULE B, C, D: ACTIVE TRIP EXISTS (Trip.driverId + Trip.vehicleId defines pairing)
  baseResult.active_trip_id = activeTrip.id;
  baseResult.active_driver_id = activeTrip.driverId ?? null;

  // Query latest driver GPS location recorded for this active trip
  const latestDriverLoc = await db.tripLocation.findFirst({
    where: { tripId: activeTrip.id },
    orderBy: { recordedAt: 'desc' },
  });

  const isDriverFresh =
    latestDriverLoc != null &&
    now - safeGetTime(latestDriverLoc.recordedAt) <= DRIVER_GPS_FRESH_MS;

  // RULE B: Active Trip + Driver GPS is fresh
  if (isDriverFresh && latestDriverLoc) {
    return {
      ...baseResult,
      latitude: latestDriverLoc.lat,
      longitude: latestDriverLoc.lng,
      speed_kph: latestDriverLoc.speed_kph ?? null,
      heading_deg: latestDriverLoc.heading ?? null,
      accuracy_m: latestDriverLoc.accuracy_m ?? null,
      source: 'DRIVER_GPS',
      display_state: 'CURRENT',
      timestamp: safeToISOString(latestDriverLoc.recordedAt),
      formatted_time_ago: formatTimeAgo(latestDriverLoc.recordedAt),
    };
  }

  // RULE C: Active Trip + Driver GPS is stale/unavailable → Fallback to Physical ICCES GPS
  if (isPhysicalFresh) {
    return {
      ...baseResult,
      latitude: vehicle.last_lat!,
      longitude: vehicle.last_lng!,
      speed_kph: vehicle.last_speed_kph ?? null,
      heading_deg: vehicle.last_heading ?? null,
      source: 'PHYSICAL_GPS',
      display_state: 'CURRENT',
      timestamp: safeToISOString(vehicle.last_seen_at),
      formatted_time_ago: formatTimeAgo(vehicle.last_seen_at),
    };
  }

  // RULE D: Both sources are stale/unavailable → Return most recent legitimate location (LAST_KNOWN)
  const driverTime = latestDriverLoc ? safeGetTime(latestDriverLoc.recordedAt) : 0;
  const physicalTime = vehicle.last_seen_at ? safeGetTime(vehicle.last_seen_at) : 0;

  if (driverTime > 0 || physicalTime > 0) {
    if (driverTime >= physicalTime && latestDriverLoc) {
      return {
        ...baseResult,
        latitude: latestDriverLoc.lat,
        longitude: latestDriverLoc.lng,
        speed_kph: latestDriverLoc.speed_kph ?? null,
        heading_deg: latestDriverLoc.heading ?? null,
        accuracy_m: latestDriverLoc.accuracy_m ?? null,
        source: 'DRIVER_GPS',
        display_state: 'LAST_KNOWN',
        timestamp: safeToISOString(latestDriverLoc.recordedAt),
        formatted_time_ago: formatTimeAgo(latestDriverLoc.recordedAt),
      };
    } else if (hasPhysicalLocation) {
      return {
        ...baseResult,
        latitude: vehicle.last_lat!,
        longitude: vehicle.last_lng!,
        speed_kph: vehicle.last_speed_kph ?? null,
        heading_deg: vehicle.last_heading ?? null,
        source: 'PHYSICAL_GPS',
        display_state: 'LAST_KNOWN',
        timestamp: safeToISOString(vehicle.last_seen_at),
        formatted_time_ago: formatTimeAgo(vehicle.last_seen_at),
      };
    }
  }

  // Rule D Fallback: No location ever recorded
  return baseResult;
}

/**
 * Batch resolves vehicle locations for a list of trips to prevent N+1 database queries.
 * Performs 1 single DB query for driver GPS locations across all operational trips,
 * then resolves locations in-memory.
 */
export async function resolveVehicleLocationsForTrips(
  trips: any[],
  dbClient?: any,
): Promise<Map<string, ResolvedVehicleLocation>> {
  const db = dbClient || require('../index').prisma;
  const now = Date.now();

  const operationalTripIds = trips
    .filter(t => t.vehicle && OPERATIONAL_TRIP_STATUSES.includes(t.status))
    .map(t => t.id);

  let latestLocMap = new Map<string, any>();
  if (operationalTripIds.length > 0) {
    try {
      const locs = await db.tripLocation.findMany({
        where: { tripId: { in: operationalTripIds } },
        orderBy: [{ tripId: 'asc' }, { recordedAt: 'desc' }],
        distinct: ['tripId'],
      });
      for (const loc of locs) {
        latestLocMap.set(loc.tripId, loc);
      }
    } catch (err) {
      // Graceful fallback if tripLocation table is empty or query fails
    }
  }

  const resultMap = new Map<string, ResolvedVehicleLocation>();

  for (const t of trips) {
    if (!t.vehicle) continue;
    const vehicle = t.vehicle;
    const isOperational = OPERATIONAL_TRIP_STATUSES.includes(t.status);

    const baseResult: ResolvedVehicleLocation = {
      vehicle_id: vehicle.id,
      ref_id: vehicle.ref_id ?? null,
      plate_number: vehicle.plate_number,
      latitude: null,
      longitude: null,
      speed_kph: null,
      heading_deg: null,
      accuracy_m: null,
      source: 'NONE',
      display_state: 'UNAVAILABLE',
      timestamp: null,
      formatted_time_ago: 'Never',
      active_trip_id: isOperational ? t.id : null,
      active_driver_id: isOperational ? (t.driverId ?? null) : null,
    };

    const isPhysicalFresh =
      vehicle.last_seen_at != null &&
      vehicle.last_lat != null &&
      vehicle.last_lng != null &&
      now - safeGetTime(vehicle.last_seen_at) <= PHYSICAL_GPS_FRESH_MS;

    const hasPhysicalLocation =
      vehicle.last_seen_at != null &&
      vehicle.last_lat != null &&
      vehicle.last_lng != null;

    if (!isOperational) {
      if (isPhysicalFresh) {
        resultMap.set(t.id, {
          ...baseResult,
          latitude: vehicle.last_lat,
          longitude: vehicle.last_lng,
          speed_kph: vehicle.last_speed_kph ?? null,
          heading_deg: vehicle.last_heading ?? null,
          source: 'PHYSICAL_GPS',
          display_state: 'CURRENT',
          timestamp: safeToISOString(vehicle.last_seen_at),
          formatted_time_ago: formatTimeAgo(vehicle.last_seen_at),
        });
      } else if (hasPhysicalLocation) {
        resultMap.set(t.id, {
          ...baseResult,
          latitude: vehicle.last_lat,
          longitude: vehicle.last_lng,
          speed_kph: vehicle.last_speed_kph ?? null,
          heading_deg: vehicle.last_heading ?? null,
          source: 'PHYSICAL_GPS',
          display_state: 'LAST_KNOWN',
          timestamp: safeToISOString(vehicle.last_seen_at),
          formatted_time_ago: formatTimeAgo(vehicle.last_seen_at),
        });
      } else {
        resultMap.set(t.id, baseResult);
      }
      continue;
    }

    const latestDriverLoc = latestLocMap.get(t.id);
    const isDriverFresh =
      latestDriverLoc != null &&
      now - safeGetTime(latestDriverLoc.recordedAt) <= DRIVER_GPS_FRESH_MS;

    if (isDriverFresh && latestDriverLoc) {
      resultMap.set(t.id, {
        ...baseResult,
        latitude: latestDriverLoc.lat,
        longitude: latestDriverLoc.lng,
        speed_kph: latestDriverLoc.speed_kph ?? null,
        heading_deg: latestDriverLoc.heading ?? null,
        accuracy_m: latestDriverLoc.accuracy_m ?? null,
        source: 'DRIVER_GPS',
        display_state: 'CURRENT',
        timestamp: safeToISOString(latestDriverLoc.recordedAt),
        formatted_time_ago: formatTimeAgo(latestDriverLoc.recordedAt),
      });
    } else if (isPhysicalFresh) {
      resultMap.set(t.id, {
        ...baseResult,
        latitude: vehicle.last_lat,
        longitude: vehicle.last_lng,
        speed_kph: vehicle.last_speed_kph ?? null,
        heading_deg: vehicle.last_heading ?? null,
        source: 'PHYSICAL_GPS',
        display_state: 'CURRENT',
        timestamp: safeToISOString(vehicle.last_seen_at),
        formatted_time_ago: formatTimeAgo(vehicle.last_seen_at),
      });
    } else {
      const driverTime = latestDriverLoc ? safeGetTime(latestDriverLoc.recordedAt) : 0;
      const physicalTime = vehicle.last_seen_at ? safeGetTime(vehicle.last_seen_at) : 0;

      if (driverTime > 0 || physicalTime > 0) {
        if (driverTime >= physicalTime && latestDriverLoc) {
          resultMap.set(t.id, {
            ...baseResult,
            latitude: latestDriverLoc.lat,
            longitude: latestDriverLoc.lng,
            speed_kph: latestDriverLoc.speed_kph ?? null,
            heading_deg: latestDriverLoc.heading ?? null,
            accuracy_m: latestDriverLoc.accuracy_m ?? null,
            source: 'DRIVER_GPS',
            display_state: 'LAST_KNOWN',
            timestamp: safeToISOString(latestDriverLoc.recordedAt),
            formatted_time_ago: formatTimeAgo(latestDriverLoc.recordedAt),
          });
        } else if (hasPhysicalLocation) {
          resultMap.set(t.id, {
            ...baseResult,
            latitude: vehicle.last_lat,
            longitude: vehicle.last_lng,
            speed_kph: vehicle.last_speed_kph ?? null,
            heading_deg: vehicle.last_heading ?? null,
            source: 'PHYSICAL_GPS',
            display_state: 'LAST_KNOWN',
            timestamp: safeToISOString(vehicle.last_seen_at),
            formatted_time_ago: formatTimeAgo(vehicle.last_seen_at),
          });
        } else {
          resultMap.set(t.id, baseResult);
        }
      } else {
        resultMap.set(t.id, baseResult);
      }
    }
  }

  return resultMap;
}


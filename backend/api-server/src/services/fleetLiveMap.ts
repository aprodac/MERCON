/**
 * The dashboard's live fleet map, in one payload.
 *
 * The map shows "units": a truck together with whoever is driving it, or a
 * driver on their own when their trip has no MERCON truck on it. Each unit
 * carries both GPS feeds separately — the ICCES tracker on the truck and the
 * driver's phone — so the map can say which feeds are live instead of hiding
 * that behind one merged dot.
 *
 * Which feed positions the unit follows the rules in `locationResolver.ts`:
 * a fresh phone fix wins during a trip, then a fresh tracker fix, then
 * whichever stale fix is newest. Driver GPS never positions a truck outside a
 * trip — it is only recorded against trips in the first place.
 *
 * Nothing here invents a position. A unit with no fix at all is returned with
 * `position: null` so the map can list it as "no signal" rather than drop a
 * pin on a city centre.
 */
import type { PrismaClient } from '@prisma/client';

export const DRIVER_GPS_FRESH_MS = 120_000;
export const VEHICLE_GPS_FRESH_MS = 180_000;
/** Below this a fresh fix counts as standing still — GPS jitter reads 1–3 km/h. */
export const MOVING_MIN_KPH = 3;

/** Trips the map treats as belonging to a unit. Draft trips aren't planned yet. */
export const LIVE_MAP_TRIP_STATUSES = ['Scheduled', 'Loading', 'InTransit', 'Delayed'] as const;

export type LiveFeed = 'both' | 'vehicle' | 'driver' | 'none';
export type LiveMotion = 'moving' | 'idle' | 'stale' | 'no_signal';
export type LiveTripPhase = 'upcoming' | 'active' | 'delayed';

export interface LiveGpsFix {
  lat: number;
  lng: number;
  speed_kph: number | null;
  heading_deg: number | null;
  accuracy_m: number | null;
  recorded_at: string;
  fresh: boolean;
}

export interface LiveStop {
  sequence: number;
  type: string;
  name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  planned_arrival: string | null;
  actual_arrival: string | null;
  actual_departure: string | null;
}

export interface LiveUnit {
  /** Stable map key: `v:<vehicleId>` or `d:<driverId>`. */
  key: string;
  vehicle: {
    id: string;
    ref_id: string | null;
    plate_number: string;
    asset_type: string;
    status: string;
    image_url: string | null;
    has_tracker: boolean;
  } | null;
  driver: {
    id: string;
    ref_id: string | null;
    name: string;
    phone: string | null;
    avatar_url: string | null;
  } | null;
  trip: {
    id: string;
    ref_id: string | null;
    status: string;
    phase: LiveTripPhase;
    customer_name: string | null;
    planned_start: string | null;
    planned_end: string | null;
    stops: LiveStop[];
    /** Index into `stops` of the first stop not yet reached; null when all are. */
    next_stop_index: number | null;
  } | null;
  vehicle_gps: LiveGpsFix | null;
  driver_gps: LiveGpsFix | null;
  /** The fix the marker sits on, or null when the unit has never reported. */
  position: (LiveGpsFix & { source: 'vehicle' | 'driver' }) | null;
  /** Which feeds are live right now. */
  feed: LiveFeed;
  motion: LiveMotion;
  /** Metres between the two feeds when both are live — a large gap means they disagree. */
  feeds_gap_m: number | null;
}

// ── Inputs (the subset of Prisma rows the builder reads) ─────────────────────

export interface LiveVehicleRow {
  id: string;
  ref_id: string | null;
  plate_number: string;
  asset_type: string;
  status: string;
  image_url: string | null;
  icces_device_id: string | null;
  last_lat: number | null;
  last_lng: number | null;
  last_speed_kph: number | null;
  last_heading: number | null;
  last_seen_at: Date | null;
  assignedDriver: LiveDriverRow | null;
}

export interface LiveDriverRow {
  id: string;
  ref_id: string | null;
  first_name: string;
  last_name: string;
  phone_primary: string | null;
  avatar_url: string | null;
}

export interface LiveTripRow {
  id: string;
  ref_id: string | null;
  status: string;
  vehicleId: string | null;
  planned_start: Date | null;
  planned_end: Date | null;
  updatedAt: Date;
  customer: { name: string } | null;
  driver: LiveDriverRow | null;
  stops: Array<{
    stop_sequence: number;
    stop_type: string;
    location_name: string | null;
    location_address: string | null;
    location_lat: number | null;
    location_lng: number | null;
    planned_arrival: Date | null;
    actual_arrival: Date | null;
    actual_departure: Date | null;
  }>;
}

export interface LiveTripLocationRow {
  tripId: string;
  lat: number;
  lng: number;
  speed_kph: number | null;
  heading: number | null;
  accuracy_m: number | null;
  recordedAt: Date;
}

// ── Pure builder ────────────────────────────────────────────────────────────

const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);

function validCoord(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' && typeof lng === 'number' &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

/** Great-circle distance in metres. */
export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function vehicleFix(v: LiveVehicleRow, now: number): LiveGpsFix | null {
  if (!v.last_seen_at || !validCoord(v.last_lat, v.last_lng)) return null;
  return {
    lat: v.last_lat!,
    lng: v.last_lng!,
    speed_kph: v.last_speed_kph ?? null,
    heading_deg: v.last_heading ?? null,
    accuracy_m: null,
    recorded_at: iso(v.last_seen_at)!,
    fresh: now - new Date(v.last_seen_at).getTime() <= VEHICLE_GPS_FRESH_MS,
  };
}

function driverFix(loc: LiveTripLocationRow | undefined, now: number): LiveGpsFix | null {
  if (!loc || !validCoord(loc.lat, loc.lng)) return null;
  return {
    lat: loc.lat,
    lng: loc.lng,
    speed_kph: loc.speed_kph ?? null,
    heading_deg: loc.heading ?? null,
    accuracy_m: loc.accuracy_m ?? null,
    recorded_at: iso(loc.recordedAt)!,
    fresh: now - new Date(loc.recordedAt).getTime() <= DRIVER_GPS_FRESH_MS,
  };
}

function pickPosition(vehicle: LiveGpsFix | null, driver: LiveGpsFix | null): LiveUnit['position'] {
  if (driver?.fresh) return { ...driver, source: 'driver' };
  if (vehicle?.fresh) return { ...vehicle, source: 'vehicle' };
  if (driver && vehicle) {
    return new Date(driver.recorded_at) >= new Date(vehicle.recorded_at)
      ? { ...driver, source: 'driver' }
      : { ...vehicle, source: 'vehicle' };
  }
  if (driver) return { ...driver, source: 'driver' };
  if (vehicle) return { ...vehicle, source: 'vehicle' };
  return null;
}

function driverOut(d: LiveDriverRow | null): LiveUnit['driver'] {
  if (!d) return null;
  return {
    id: d.id,
    ref_id: d.ref_id,
    name: `${d.first_name ?? ''} ${d.last_name ?? ''}`.trim() || 'Driver',
    phone: d.phone_primary,
    avatar_url: d.avatar_url,
  };
}

function tripOut(t: LiveTripRow | undefined): LiveUnit['trip'] {
  if (!t) return null;
  const stops: LiveStop[] = [...t.stops]
    .sort((a, b) => a.stop_sequence - b.stop_sequence)
    .map((s) => ({
      sequence: s.stop_sequence,
      type: s.stop_type,
      name: s.location_name,
      address: s.location_address,
      lat: validCoord(s.location_lat, s.location_lng) ? s.location_lat : null,
      lng: validCoord(s.location_lat, s.location_lng) ? s.location_lng : null,
      planned_arrival: iso(s.planned_arrival),
      actual_arrival: iso(s.actual_arrival),
      actual_departure: iso(s.actual_departure),
    }));
  // Same rule the driver app routes by: the first stop not yet arrived at.
  const next = stops.findIndex((s) => s.actual_arrival === null);
  return {
    id: t.id,
    ref_id: t.ref_id,
    status: t.status,
    phase: t.status === 'Delayed' ? 'delayed' : t.status === 'Scheduled' ? 'upcoming' : 'active',
    customer_name: t.customer?.name ?? null,
    planned_start: iso(t.planned_start),
    planned_end: iso(t.planned_end),
    stops,
    next_stop_index: next === -1 ? null : next,
  };
}

/** Running trips outrank scheduled ones; ties go to the most recently touched. */
function tripRank(t: LiveTripRow): number {
  return t.status === 'Scheduled' ? 0 : 1;
}

function finishUnit(
  base: Pick<LiveUnit, 'key' | 'vehicle' | 'driver' | 'trip'>,
  vehicle_gps: LiveGpsFix | null,
  driver_gps: LiveGpsFix | null,
): LiveUnit {
  const position = pickPosition(vehicle_gps, driver_gps);
  const vLive = !!vehicle_gps?.fresh;
  const dLive = !!driver_gps?.fresh;
  const feed: LiveFeed = vLive && dLive ? 'both' : vLive ? 'vehicle' : dLive ? 'driver' : 'none';
  const motion: LiveMotion = !position
    ? 'no_signal'
    : !position.fresh
      ? 'stale'
      : (position.speed_kph ?? 0) > MOVING_MIN_KPH
        ? 'moving'
        : 'idle';
  const feeds_gap_m = vLive && dLive ? Math.round(haversineMeters(vehicle_gps!, driver_gps!)) : null;
  return { ...base, vehicle_gps, driver_gps, position, feed, motion, feeds_gap_m };
}

export function buildLiveUnits(
  input: { vehicles: LiveVehicleRow[]; trips: LiveTripRow[]; tripLocations: LiveTripLocationRow[] },
  now: number = Date.now(),
): LiveUnit[] {
  const locByTrip = new Map(input.tripLocations.map((l) => [l.tripId, l]));

  // One trip per truck: prefer a running trip over a scheduled one.
  const tripByVehicle = new Map<string, LiveTripRow>();
  for (const t of input.trips) {
    if (!t.vehicleId) continue;
    const cur = tripByVehicle.get(t.vehicleId);
    if (
      !cur ||
      tripRank(t) > tripRank(cur) ||
      (tripRank(t) === tripRank(cur) && new Date(t.updatedAt) > new Date(cur.updatedAt))
    ) {
      tripByVehicle.set(t.vehicleId, t);
    }
  }

  const units: LiveUnit[] = [];
  const driversOnTrucks = new Set<string>();

  for (const v of input.vehicles) {
    const trip = tripByVehicle.get(v.id);
    // The trip's driver is who is actually in the cab; the standing assignment is the fallback.
    const driver = trip?.driver ?? v.assignedDriver ?? null;
    if (driver) driversOnTrucks.add(driver.id);
    units.push(
      finishUnit(
        {
          key: `v:${v.id}`,
          vehicle: {
            id: v.id,
            ref_id: v.ref_id,
            plate_number: v.plate_number,
            asset_type: v.asset_type,
            status: v.status,
            image_url: v.image_url,
            has_tracker: !!v.icces_device_id,
          },
          driver: driverOut(driver),
          trip: tripOut(trip),
        },
        vehicleFix(v, now),
        trip ? driverFix(locByTrip.get(trip.id), now) : null,
      ),
    );
  }

  // Drivers on a trip with no MERCON truck (or one not in the list) — only
  // worth showing when their phone has reported a position.
  const knownVehicles = new Set(input.vehicles.map((v) => v.id));
  const seenDrivers = new Set<string>();
  for (const t of input.trips) {
    if (!t.driver || (t.vehicleId && knownVehicles.has(t.vehicleId))) continue;
    if (driversOnTrucks.has(t.driver.id) || seenDrivers.has(t.driver.id)) continue;
    const fix = driverFix(locByTrip.get(t.id), now);
    if (!fix) continue;
    seenDrivers.add(t.driver.id);
    units.push(finishUnit({ key: `d:${t.driver.id}`, vehicle: null, driver: driverOut(t.driver), trip: tripOut(t) }, null, fix));
  }

  return units;
}

// ── Loader ──────────────────────────────────────────────────────────────────

const DRIVER_SELECT = {
  id: true,
  ref_id: true,
  first_name: true,
  last_name: true,
  phone_primary: true,
  avatar_url: true,
} as const;

export async function loadLiveUnits(db: PrismaClient): Promise<LiveUnit[]> {
  const [vehicles, trips] = await Promise.all([
    db.vehicle.findMany({
      where: { deletedAt: null, isActive: true },
      select: {
        id: true,
        ref_id: true,
        plate_number: true,
        asset_type: true,
        status: true,
        image_url: true,
        icces_device_id: true,
        last_lat: true,
        last_lng: true,
        last_speed_kph: true,
        last_heading: true,
        last_seen_at: true,
        assignedDriver: { select: DRIVER_SELECT },
      },
      orderBy: { plate_number: 'asc' },
    }),
    db.trip.findMany({
      where: { deletedAt: null, status: { in: [...LIVE_MAP_TRIP_STATUSES] } },
      select: {
        id: true,
        ref_id: true,
        status: true,
        vehicleId: true,
        planned_start: true,
        planned_end: true,
        updatedAt: true,
        customer: { select: { name: true } },
        driver: { select: DRIVER_SELECT },
        stops: {
          where: { deletedAt: null },
          select: {
            stop_sequence: true,
            stop_type: true,
            location_name: true,
            location_address: true,
            location_lat: true,
            location_lng: true,
            planned_arrival: true,
            actual_arrival: true,
            actual_departure: true,
          },
        },
      },
    }),
  ]);

  const tripIds = trips.map((t) => t.id);
  const tripLocations = tripIds.length
    ? await db.tripLocation.findMany({
        where: { tripId: { in: tripIds } },
        orderBy: [{ tripId: 'asc' }, { recordedAt: 'desc' }],
        distinct: ['tripId'],
        select: { tripId: true, lat: true, lng: true, speed_kph: true, heading: true, accuracy_m: true, recordedAt: true },
      })
    : [];

  return buildLiveUnits({
    vehicles: vehicles as unknown as LiveVehicleRow[],
    trips: trips as unknown as LiveTripRow[],
    tripLocations,
  });
}

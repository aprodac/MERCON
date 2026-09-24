/**
 * Drivers business logic — pure transforms over API-layer data. Nothing
 * here talks to the network.
 */
import { daysUntil } from './driverDetailsService';
import type { DriverTripCount, RawDriver } from '../api/driversApi';
import type { DriverListItem, DriverSortOption, DriverStats } from '../types';

const ACTIVE_TRIP_STATUSES = ['Scheduled', 'Loading', 'InTransit', 'Delayed', 'Emergency'];

export interface DriverPerfData {
  totalTrips: number;
  monthlyPayout: number;
  nearestDocExpiry: string | null;
}

export function toDriverListItem(
  raw: RawDriver,
  tripCountById: Map<string, DriverPerfData | number>,
): DriverListItem {
  const activeTrip = raw.trips?.find((t) => ACTIVE_TRIP_STATUSES.includes(t.status));
  const rawPerf = tripCountById.get(raw.id);

  let totalTrips: number | null = null;
  let monthlyPayout: number | null = null;
  let nearestDocExpiry: string | null = null;

  if (typeof rawPerf === 'number') {
    totalTrips = rawPerf;
  } else if (rawPerf) {
    totalTrips = rawPerf.totalTrips;
    monthlyPayout = rawPerf.monthlyPayout;
    nearestDocExpiry = rawPerf.nearestDocExpiry;
  }

  const docDaysLeft = nearestDocExpiry ? daysUntil(nearestDocExpiry) : null;

  return {
    id: raw.id,
    ref_id: raw.ref_id,
    firstName: raw.first_name,
    lastName: raw.last_name,
    phone: raw.phone_primary,
    status: raw.status,
    licenseNumber: raw.license_number,
    licenseExpiry: raw.license_expiry,
    licenseDaysLeft: daysUntil(raw.license_expiry),
    avatarUrl: raw.avatar_url ?? null,
    createdAt: raw.createdAt,
    activeTrip: activeTrip
      ? { id: activeTrip.id, status: activeTrip.status, vehiclePlate: activeTrip.vehicle?.plate_number ?? null }
      : null,
    assignedVehicle: raw.assignedVehicle
      ? { plateNumber: raw.assignedVehicle.plate_number, assetType: raw.assignedVehicle.asset_type }
      : null,
    totalTrips,
    monthlyPayout,
    nearestDocExpiry,
    docDaysLeft,
    rating: null,
  };
}

export function driverFullName(driver: Pick<DriverListItem, 'firstName' | 'lastName'>): string {
  return `${driver.firstName} ${driver.lastName}`;
}

export function driverInitials(driver: Pick<DriverListItem, 'firstName' | 'lastName'>): string {
  return `${driver.firstName[0] ?? ''}${driver.lastName[0] ?? ''}`.toUpperCase();
}

/**
 * No real city-level GPS-to-address data exists for a driver — only a
 * lat/lng on their *vehicle*, and geocoding that would need an external
 * maps API this app doesn't have configured. So this is intentionally
 * coarse: "En Route" while on an active trip, "Unknown" otherwise — never a
 * fabricated city name.
 */
export function driverLocationLabel(driver: Pick<DriverListItem, 'activeTrip'>): string {
  return driver.activeTrip ? 'En Route' : 'Unknown';
}

export function computeDriverStats(drivers: Pick<DriverListItem, 'status'>[]): DriverStats {
  return drivers.reduce<DriverStats>(
    (acc, d) => {
      if (d.status === 'Available') acc.online += 1;
      else if (d.status === 'OnTrip') acc.onTrip += 1;
      else if (d.status === 'OffDuty') acc.offline += 1;
      else if (d.status === 'Inactive') acc.inactive += 1;
      acc.totalDrivers += 1;
      return acc;
    },
    { totalDrivers: 0, online: 0, onTrip: 0, offline: 0, onLeave: 0, inactive: 0 },
  );
}

export function tripCountMap(counts: DriverTripCount[]): Map<string, DriverPerfData> {
  return new Map(
    counts.map((c) => [
      c.id,
      {
        totalTrips: c.total_trips,
        monthlyPayout: c.monthly_payout ?? 0,
        nearestDocExpiry: c.nearest_doc_expiry ?? null,
      },
    ]),
  );
}

/**
 * Sorts client-side — GET /drivers only supports a fixed name order
 * server-side (no `sort_by` handling in the controller). "Highest Rating"
 * has no backing data yet (see DriverListItem.rating), so it's a stable
 * no-op today rather than a fabricated ordering.
 */
export function sortDrivers(drivers: DriverListItem[], sort: DriverSortOption): DriverListItem[] {
  const sorted = [...drivers];
  switch (sort) {
    case 'newest':
      return sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    case 'trips':
      return sorted.sort((a, b) => (b.totalTrips ?? 0) - (a.totalTrips ?? 0));
    case 'available':
      return sorted.sort((a, b) => Number(b.status === 'Available') - Number(a.status === 'Available'));
    case 'online':
      return sorted.sort((a, b) => Number(b.status !== 'OffDuty' && b.status !== 'Inactive') - Number(a.status !== 'OffDuty' && a.status !== 'Inactive'));
    case 'rating':
    case 'name':
    default:
      return sorted.sort((a, b) => driverFullName(a).localeCompare(driverFullName(b)));
  }
}

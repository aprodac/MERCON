/**
 * Vehicles business logic — pure transforms over API-layer data. Nothing
 * here talks to the network.
 */
import type { RawVehicle } from '../api/vehiclesApi';
import type { VehicleListItem, VehicleSortOption } from '../types';

const ACTIVE_TRIP_STATUSES = ['Scheduled', 'Loading', 'InTransit', 'Delayed'];

export function toVehicleListItem(raw: RawVehicle): VehicleListItem {
  const activeTripRaw = raw.trips?.find((t) => ACTIVE_TRIP_STATUSES.includes(t.status));
  
  let assignedDriver = raw.assignedDriver
    ? {
        id: raw.assignedDriver.id,
        name: `${raw.assignedDriver.first_name} ${raw.assignedDriver.last_name}`,
        phone: raw.assignedDriver.phone_primary,
        avatarUrl: raw.assignedDriver.avatar_url ?? null,
      }
    : null;

  let activeTrip = activeTripRaw
    ? {
        id: activeTripRaw.id,
        status: activeTripRaw.status,
        customerName: activeTripRaw.customer?.name ?? null,
        driverName: activeTripRaw.driver
          ? `${activeTripRaw.driver.first_name} ${activeTripRaw.driver.last_name}`
          : null,
        refId: activeTripRaw.ref_id ?? null,
        stops: [...(activeTripRaw.stops ?? [])]
          .sort((a, b) => a.stop_sequence - b.stop_sequence)
          .map((st) => ({ type: st.stop_type, name: st.location_name, actual_arrival: st.actual_arrival ?? null, actual_departure: st.actual_departure ?? null })),
      }
    : null;

  const last = raw.last_trip;
  const lastNames = (last?.stops ?? []).map((st) => (st.location_name ?? '').split(',')[0].trim()).filter(Boolean);
  const lastTrip = last
    ? {
        id: last.id,
        refId: last.ref_id,
        // When the truck got back: the trip's end, else its last stop reached.
        endedAt: last.actual_end ?? [...last.stops].reverse().find((st) => st.actual_arrival)?.actual_arrival ?? last.planned_start,
        route: lastNames.filter((n, i) => n !== lastNames[i - 1]).join(' › '),
      }
    : null;

  const loc = raw.resolved_location;
  const location = loc && Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude) && (loc.latitude || loc.longitude)
    ? { lat: loc.latitude as number, lng: loc.longitude as number, ago: loc.formatted_time_ago && loc.formatted_time_ago !== 'Never' ? String(loc.formatted_time_ago) : null }
    : null;

  let activeMaintenance = raw.active_maintenance
    ? {
        id: raw.active_maintenance.id,
        status: raw.active_maintenance.status,
        maintenanceType: raw.active_maintenance.maintenance_type,
        workshopName: raw.active_maintenance.workshop_name ?? null,
        startDate: raw.active_maintenance.start_date ?? null,
      }
    : null;

  return {
    id: raw.id,
    ref_id: raw.ref_id,
    plateNumber: raw.plate_number,
    assetType: raw.asset_type,
    status: raw.status,
    capacityKg: raw.capacity_kg ?? 0,
    currentOdometer: raw.current_odometer ?? 0,
    trailerNumber: raw.trailer_number ?? null,
    trailerType: raw.trailer_type ?? null,
    imageUrl: raw.image_url ?? null,
    createdAt: raw.createdAt,
    assignedDriver,
    activeTrip,
    activeMaintenance,
    lastTrip,
    location,
  };
}

export function formatOdometer(km: number | null | undefined): string {
  if (km === null || km === undefined || isNaN(km)) return '—';
  return `${km.toLocaleString('en-US')} km`;
}

export function formatCapacityKg(kg: number | null | undefined): string {
  if (kg === null || kg === undefined || isNaN(kg)) return '—';
  if (kg >= 1000) {
    const tons = kg / 1000;
    return `${tons % 1 === 0 ? tons.toFixed(0) : tons.toFixed(1)} TON`;
  }
  return `${kg.toLocaleString('en-US')} kg`;
}

export function sortVehicles(vehicles: VehicleListItem[], sort: VehicleSortOption): VehicleListItem[] {
  const sorted = [...vehicles];
  switch (sort) {
    case 'newest':
      return sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    case 'capacity':
      return sorted.sort((a, b) => (b.capacityKg ?? 0) - (a.capacityKg ?? 0));
    case 'odometer':
      return sorted.sort((a, b) => (b.currentOdometer ?? 0) - (a.currentOdometer ?? 0));
    case 'available':
      return sorted.sort((a, b) => Number(b.status === 'Available') - Number(a.status === 'Available'));
    case 'plate':
    default:
      return sorted.sort((a, b) => a.plateNumber.localeCompare(b.plateNumber));
  }
}

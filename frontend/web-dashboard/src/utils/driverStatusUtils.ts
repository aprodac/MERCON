export interface DriverLike {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  status?: string | null;
  phone_primary?: string | null;
  phone?: string | null;
  license_number?: string | null;
  assignedVehicleId?: string | null;
  assignedVehicle?: any;
  rest_hours?: number | null;
}

export interface DriverRecommendationLike {
  driverId: string;
  isAvailable: boolean;
  unavailabilityReason?: string;
  badges?: string[];
  rest_hours?: number | null;
  vehiclePlate?: string | null;
  vehicleClass?: string | null;
  capacityMatch?: boolean;
}

/**
 * Returns a standardized driver status badge string (e.g. "🟢 Available", "🔴 Assigned to Active Trip").
 * Reusable across all UI dropdowns, tables, and modals.
 */
export function getStandardDriverStatusBadge(
  status?: string | null,
  rec?: DriverRecommendationLike
): string {
  // If backend recommendation badges are present, use the primary status badge
  if (rec?.badges && rec.badges.length > 0) {
    const statusBadge = rec.badges.find(
      (b) =>
        b.includes('Available') ||
        b.includes('Assigned') ||
        b.includes('Off Duty') ||
        b.includes('Status') ||
        b.includes('Expired')
    );
    if (statusBadge) return statusBadge;
  }

  // Fallback status badge mapping
  const normalized = (status || 'Available').trim();
  switch (normalized) {
    case 'Available':
      return '🟢 Available';
    case 'OnTrip':
    case 'On Trip':
      return '🔴 Assigned to Active Trip';
    case 'OffDuty':
    case 'Off Duty':
      return '🟡 Off Duty';
    case 'Inactive':
      return '⚪ Inactive';
    default:
      return `⚪ ${normalized}`;
  }
}

/**
 * Formats full driver details string for dropdown labels.
 * Format: "Truck: [Plate/Class] • [Status Badge] • [Rest Info if present] • [Badges]"
 */
export function formatDriverDetails(
  driver: DriverLike,
  rec?: DriverRecommendationLike,
  matchedVehicle?: { plate_number?: string; capacity_kg?: number; asset_type?: string } | null
): string {
  // 1. Truck info
  const embeddedVeh =
    driver.assignedVehicle && typeof driver.assignedVehicle === 'object'
      ? driver.assignedVehicle
      : null;
  const plateNumber = rec?.vehiclePlate ?? embeddedVeh?.plate_number ?? matchedVehicle?.plate_number ?? null;
  const capacityLabel = rec?.vehicleClass || embeddedVeh?.asset_type || matchedVehicle?.asset_type || '';

  const truckInfo = plateNumber
    ? `Truck: ${plateNumber}${capacityLabel ? ` • ${capacityLabel}` : ''}`
    : 'Truck: Unassigned';

  // 2. Recommendation badges if available
  if (rec?.badges && rec.badges.length > 0) {
    return [truckInfo, ...rec.badges].join(' • ');
  }

  // 3. Fallback when recommendation object is absent
  const statusBadge = getStandardDriverStatusBadge(driver.status, rec);
  const restHours = rec?.rest_hours ?? driver.rest_hours ?? null;
  const restStr = restHours != null ? `🕒 Rest: ${restHours} hrs` : '';

  return [truckInfo, statusBadge, restStr].filter(Boolean).join(' • ');
}

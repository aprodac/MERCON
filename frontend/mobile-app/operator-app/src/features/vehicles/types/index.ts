/**
 * Domain types for the Vehicles feature.
 * Mirrors the backend's Vehicle Prisma model — see
 * backend/api-server/prisma/schema.prisma for the source of truth.
 */

export type AssetStatus = 'Available' | 'OnTrip' | 'Maintenance' | 'Inactive';
export type AssetType = 'Flatbed' | 'Reefer' | 'Box' | 'Tanker';

export interface VehicleAssignedDriver {
  id: string;
  name: string;
  phone: string | null;
  avatarUrl: string | null;
}

export interface VehicleTripStop {
  type: string | null;
  name: string | null;
  actual_arrival: string | null;
  actual_departure: string | null;
}

export interface VehicleActiveTrip {
  id: string;
  refId: string | null;
  status: string;
  customerName: string | null;
  driverName: string | null;
  stops: VehicleTripStop[];
}

/** A free truck's last finished trip. */
export interface VehicleLastTrip {
  id: string;
  refId: string | null;
  endedAt: string | null;
  route: string;
}

export interface VehicleLocation {
  lat: number;
  lng: number;
  /** "1h ago" */
  ago: string | null;
}

export interface VehicleActiveMaintenance {
  id: string;
  status: string;
  maintenanceType: string;
  workshopName: string | null;
  startDate: string | null;
}

export interface VehicleListItem {
  id: string;
  ref_id: string | null;
  plateNumber: string;
  assetType: AssetType;
  status: AssetStatus;
  capacityKg: number;
  currentOdometer: number;
  trailerNumber: string | null;
  trailerType: string | null;
  imageUrl: string | null;
  createdAt: string;
  assignedDriver: VehicleAssignedDriver | null;
  activeTrip: VehicleActiveTrip | null;
  activeMaintenance: VehicleActiveMaintenance | null;
  lastTrip: VehicleLastTrip | null;
  location: VehicleLocation | null;
}

export interface VehicleStats {
  totalVehicles: number;
  available: number;
  onTrip: number;
  maintenance: number;
  inactive: number;
}

export type VehicleSortOption = 'plate' | 'newest' | 'available' | 'capacity' | 'odometer';

export interface VehicleListParams {
  search?: string;
  status?: AssetStatus | null;
  page?: number;
  per_page?: number;
}

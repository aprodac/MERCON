import { api, ApiResponse } from '@/lib/api';
import type { ImportSummary } from '@/components/fleet/ExcelImportDialog';

export type AssetStatus = 'Available' | 'OnTrip' | 'Maintenance' | 'Inactive';
export type AssetType   = 'Flatbed' | 'Reefer' | 'Box' | 'Tanker';

export type LocationSource = 'DRIVER_GPS' | 'PHYSICAL_GPS' | 'NONE' | (string & {});
export type LocationDisplayState = 'CURRENT' | 'LAST_KNOWN' | 'UNAVAILABLE' | (string & {});

export interface ResolvedLocation {
  vehicle_id?: string | null;
  ref_id?: string | null;
  plate_number?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  lat?: number | null;
  lng?: number | null;
  speed_kph?: number | null;
  heading_deg?: number | null;
  accuracy_m?: number | null;
  source?: LocationSource | null;
  display_state?: LocationDisplayState | null;
  timestamp?: string | null;
  formatted_time_ago?: string | null;
  active_trip_id?: string | null;
  active_driver_id?: string | null;
  address?: string | null;
  formatted_address?: string | null;
  name?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
}

export interface VehicleUsage {
  activeTrips: number;
  totalTrips: number;
  maintenanceRecords: number;
  expenses: number;
}

export interface ActiveMaintenance {
  id: string;
  status: string;
  maintenance_type: string;
  workshop_name: string;
  start_date: string;
  end_date?: string | null;
}

export interface Vehicle {
  id: string;
  ref_id: string | null;
  plate_number: string;
  asset_type: AssetType;
  status: AssetStatus;
  capacity_kg: number;
  current_odometer: number;
  /** When current_odometer was last changed. Null means never recorded. */
  odometer_updated_at?: string | null;
  trailer_number: string | null;
  trailer_type: AssetType | null;
  trailer_capacity_kg: number | null;
  icces_device_id: string | null;
  last_lat?: number | null;
  last_lng?: number | null;
  last_speed_kph?: number | null;
  last_heading?: number | null;
  last_status?: string | null;
  last_seen_at?: string | null;
  resolved_location?: ResolvedLocation | null;
  isActive: boolean;
  deletedAt?: string | null;
  createdAt: string;
  documents?: import('./documentService').MerconDocument[];
  trips?: any[];
  assignedDriver?: any;
  active_maintenance?: ActiveMaintenance | null;
  image_url?: string | null;
}

export interface CreateVehiclePayload {
  plate_number: string;
  asset_type: AssetType;
  capacity_kg: number;
  trailer_number?: string;
  trailer_type?: AssetType;
  trailer_capacity_kg?: number;
  icces_device_id?: string;
  image_url?: string | null;
}

export interface VehicleFilters {
  status?: AssetStatus;
  search?: string;
  page?: number;
  per_page?: number;
  mode?: 'lookup' | 'kpi';
}

export interface VehicleFinancials {
  vehicle_id: string;
  plate_number: string;
  ref_id: string | null;
  asset_type: AssetType;
  summary: {
    total_income: number;
    total_expenses: number;
    driver_charges: number;
    fuel_expenses: number;
    maintenance_expenses: number;
    renewal_expenses: number;
    salary_expenses: number;
    other_expenses: number;
    net_profit: number;
    margin_percent: number;
    completed_trips_count: number;
    total_maintenance_count: number;
    total_distance_km: number;
  };
  monthly: MonthlyPoint[];
  income_sources: Array<{
    id: string;
    ref_id: string | null;
    status: string;
    customer_name: string;
    date: string;
    income: number;
    trip_charges: number;
  }>;
  expense_records: import('./maintenanceService').MaintenanceRecord[];
  operating_expenses: Array<{
    id: string;
    ref_id: string | null;
    category: string;
    amount: number;
    date: string;
    description: string | null;
  }>;
}

/** One `YYYY-MM` bucket of the income/expense trend series. */
export interface MonthlyPoint {
  month: string;
  income: number;
  expenses: number;
  profit: number;
}

/** A single vehicle's P&L row inside the fleet-wide report. */
export interface FleetVehicleFinancials {
  vehicle_id: string;
  plate_number: string;
  ref_id: string | null;
  asset_type: AssetType;
  status: AssetStatus;
  capacity_kg: number;
  total_income: number;
  total_expenses: number;
  maintenance_expenses: number;
  renewal_expenses: number;
  driver_charges: number;
  fuel_expenses: number;
  salary_expenses: number;
  other_expenses: number;
  net_profit: number;
  margin_percent: number;
  trips_count: number;
  maintenance_count: number;
  income_per_trip: number;
}

export interface FleetFinancials {
  range: { from: string | null; to: string | null };
  fleet_summary: {
    total_income: number;
    total_expenses: number;
    maintenance_expenses: number;
    renewal_expenses: number;
    net_profit: number;
    margin_percent: number;
    vehicles_count: number;
    profitable_count: number;
    loss_making_count: number;
    idle_count: number;
    total_trips: number;
    total_maintenance: number;
  };
  vehicles: FleetVehicleFinancials[];
  monthly: MonthlyPoint[];
}

/** Optional ISO date bounds shared by both financial reports. */
export interface FinancialsRange {
  from?: string;
  to?: string;
}

/** Fleet KPI counts, computed in the database — see `getVehicleStats`. */
export interface VehicleStats {
  total: number;
  by_status: Record<string, number>;
  available: number;
  on_trip: number;
  maintenance: number;
}

export interface PhysicalGpsStatusSummary {
  mercon_total: number;
  physical_gps_total: number;
  not_connected_total: number;
  reconciliation_valid: boolean;
  category_sum: number;
  status_counts: {
    MOVING: number;
    IDLE: number;
    STOPPED: number;
    COMMAND: number;
    ALERT: number;
    DEVICE_NO_SIGNAL: number;
    DEVICE_NOT_WORKING: number;
    ACCIDENT: number;
    TAMPER_WEIGHT: number;
    UNKNOWN: number;
  };
}

export const vehicleService = {
  async getStats(): Promise<VehicleStats> {
    const res = await api.get<ApiResponse<VehicleStats>>('/vehicles/stats');
    return res.data.data;
  },

  async getIccesSummary(): Promise<PhysicalGpsStatusSummary> {
    const res = await api.get<ApiResponse<PhysicalGpsStatusSummary>>('/vehicles/icces-summary');
    return res.data.data;
  },

  async getAll(filters: VehicleFilters = {}): Promise<ApiResponse<Vehicle[]>> {
    const res = await api.get<ApiResponse<Vehicle[]>>('/vehicles', { params: filters });
    return res.data;
  },

  /** `lookup: true` omits the vehicle's trip history — see the driver equivalent. */
  async getById(id: string, opts: { lookup?: boolean } = {}): Promise<Vehicle> {
    const res = await api.get<ApiResponse<Vehicle>>(`/vehicles/${id}`, {
      params: opts.lookup ? { mode: 'lookup' } : undefined,
    });
    return res.data.data;
  },

  async getFinancials(id: string, range: FinancialsRange = {}): Promise<VehicleFinancials> {
    const res = await api.get<ApiResponse<VehicleFinancials>>(`/vehicles/${id}/financials`, { params: range });
    return res.data.data;
  },

  /** Fleet-wide P&L — one row per vehicle, for ranking profit/loss across trucks. */
  async getFleetFinancials(range: FinancialsRange = {}): Promise<FleetFinancials> {
    const res = await api.get<ApiResponse<FleetFinancials>>('/vehicles/financials/fleet', { params: range });
    return res.data.data;
  },

  async create(payload: CreateVehiclePayload): Promise<Vehicle> {
    const res = await api.post<ApiResponse<Vehicle>>('/vehicles', payload);
    return res.data.data;
  },

  async update(id: string, payload: Partial<CreateVehiclePayload & { status: AssetStatus; current_odometer: number }>): Promise<Vehicle> {
    const res = await api.patch<ApiResponse<Vehicle>>(`/vehicles/${id}`, payload);
    return res.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/vehicles/${id}`);
  },

  async getUsage(id: string): Promise<VehicleUsage> {
    const res = await api.get<ApiResponse<VehicleUsage>>(`/vehicles/${id}/usage`);
    return res.data.data;
  },

  async bulkDelete(ids: string[]): Promise<{ message: string }> {
    const res = await api.post<ApiResponse<{ message: string }>>('/vehicles/bulk-delete', { ids });
    return res.data.data;
  },

  async bulkUpdateStatus(ids: string[], status: string): Promise<void> {
    await api.post('/vehicles/bulk-update-status', { ids, status });
  },

  /**
   * Import rows parsed from the fleet workbook in the browser. Matches existing
   * vehicles on plate number and updates them, so re-uploading a corrected file
   * fixes trucks instead of duplicating them.
   */
  async importRows(rows: Record<string, string | number>[]): Promise<ImportSummary> {
    const res = await api.post<ApiResponse<ImportSummary>>('/vehicles/import', { rows }, { timeout: 120_000 });
    return res.data.data;
  },
};

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

/* ── Vehicle P&L (backend: services/vehicleFinancials) ─────────────────── */

/** One truck's (or the fleet's) P&L for a period — see engine.ts for definitions. */
export interface PnlBreakdown {
  revenue: number;
  driver_pay: number;
  fuel: number;
  maintenance: number;
  tolls: number;
  other: number;
  direct_costs: number;
  contribution: number;
  salary: number;
  depreciation: number;
  fixed_costs: number;
  overhead: number;
  total_costs: number;
  net_profit: number;
  /** null when there is no revenue */
  margin_percent: number | null;
  contribution_percent: number | null;
}

export interface PnlMonth {
  month: string;
  revenue: number;
  direct_costs: number;
  overhead: number;
  net_profit: number;
}

export interface PnlRange {
  from: string;
  to: string;
  /** Salary, depreciation and fixed costs are counted up to this day (today at most). */
  accrued_to: string;
  timezone: string;
  open_start: boolean;
}

export interface PnlFlags {
  missing_billing: number;
  missing_driver_pay: number;
  no_fuel: boolean;
  no_cost_profile: boolean;
  drivers_without_salary: { id: string; name: string }[];
}

export interface FleetVehiclePnl extends PnlBreakdown {
  vehicle_id: string;
  plate_number: string;
  ref_id: string | null;
  asset_type: AssetType;
  status: AssetStatus;
  driver: { id: string; name: string } | null;
  trips_count: number;
  distance_km: number;
  revenue_per_trip: number | null;
  cost_per_km: number | null;
  /** Had trips or direct costs in the period. */
  active: boolean;
  /** Net profit per month of the range, oldest first. */
  monthly: number[];
  flags: PnlFlags;
}

export interface FleetPnl {
  range: PnlRange;
  summary: PnlBreakdown & {
    vehicles_count: number;
    active_count: number;
    profitable_count: number;
    loss_count: number;
    idle_count: number;
    trips_count: number;
    distance_km: number;
    unallocated_salary: number;
    flags: {
      missing_billing_trips: number;
      missing_driver_pay_trips: number;
      trucks_without_fuel: number;
      trucks_without_cost_profile: number;
      drivers_without_salary: number;
    };
  };
  vehicles: FleetVehiclePnl[];
  monthly: PnlMonth[];
  unallocated_salary: { driver_id: string; driver_name: string; month: string; amount: number }[];
}

export type CostFrequency = 'Monthly' | 'Yearly';

export interface VehicleFixedCost {
  id: string;
  category: string;
  label: string | null;
  amount: number;
  frequency: CostFrequency;
  start_date: string;
  end_date: string | null;
  notes: string | null;
}

export type PnlCostLine = 'fuel' | 'maintenance' | 'tolls' | 'other';

export interface VehiclePnl {
  range: PnlRange;
  vehicle: {
    id: string;
    plate_number: string;
    ref_id: string | null;
    asset_type: AssetType;
    status: AssetStatus;
    capacity_kg: number;
    driver: { id: string; name: string } | null;
    purchase_price: number | null;
    purchase_date: string | null;
    useful_life_years: number | null;
    residual_value: number | null;
    fixed_costs: VehicleFixedCost[];
  };
  totals: PnlBreakdown;
  trips_count: number;
  distance_km: number;
  revenue_per_trip: number | null;
  cost_per_km: number | null;
  flags: PnlFlags;
  monthly: PnlMonth[];
  ledger: {
    trips: { id: string; ref_id: string | null; day: string; customer: string; status: string; drivers: string[]; revenue: number; driver_pay: number; distance_km: number }[];
    costs: { id: string; ref_id: string | null; source: 'expense' | 'maintenance' | 'bill'; line: PnlCostLine; category: string; description: string | null; day: string; amount: number }[];
    salary: { driverId: string; driver_name: string; month: string; amount: number; basis: 'trips' | 'assigned'; vehicleTrips: number; driverTrips: number }[];
    fixed_costs: { id: string; category: string; label: string | null; monthly: number; amount: number }[];
    depreciation: { monthly: number; amount: number };
  };
}

/** Company-local dates ("YYYY-MM-DD"); both optional = all time. */
export interface FinancialsRange {
  from?: string;
  to?: string;
}

export interface DriverSalary {
  id: string;
  base_salary: number;
  allowances: number;
  employer_costs: number;
  monthly_total: number;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
}

export interface DriverSalaryPayload {
  base_salary: number;
  allowances?: number;
  employer_costs?: number;
  effective_from: string;
  effective_to?: string | null;
  notes?: string | null;
}

export interface CostSetupVehicle {
  id: string;
  plate_number: string;
  ref_id: string | null;
  asset_type: AssetType;
  status: AssetStatus;
  driver: { id: string; name: string } | null;
  purchase_price: number | null;
  purchase_date: string | null;
  useful_life_years: number | null;
  residual_value: number | null;
  fixed_costs: (VehicleFixedCost & { active: boolean })[];
  /** Recurring costs active today, per month. */
  fixed_monthly: number;
}

export interface CostSetupDriver {
  id: string;
  ref_id: string | null;
  name: string;
  status: string;
  vehicle: { id: string; plate_number: string } | null;
  current: DriverSalary | null;
  history: DriverSalary[];
}

export interface CostSetup {
  today: string;
  vehicles: CostSetupVehicle[];
  drivers: CostSetupDriver[];
}

export interface VehicleOwnershipPayload {
  purchase_price?: number | null;
  purchase_date?: string | null;
  useful_life_years?: number | null;
  residual_value?: number | null;
}

export interface VehicleFixedCostPayload {
  category: string;
  label?: string | null;
  amount: number;
  frequency: CostFrequency;
  start_date: string;
  end_date?: string | null;
  notes?: string | null;
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

  async getFinancials(id: string, range: FinancialsRange = {}): Promise<VehiclePnl> {
    const res = await api.get<ApiResponse<VehiclePnl>>(`/vehicles/${id}/financials`, { params: range });
    return res.data.data;
  },

  /** Fleet-wide P&L — one row per truck, for ranking profit and loss. */
  async getFleetFinancials(range: FinancialsRange = {}): Promise<FleetPnl> {
    const res = await api.get<ApiResponse<FleetPnl>>('/vehicles/financials/fleet', { params: range });
    return res.data.data;
  },

  /** Every truck's ownership costs and every driver's salary, for the Cost setup page. */
  async getCostSetup(): Promise<CostSetup> {
    const res = await api.get<ApiResponse<CostSetup>>('/vehicles/financials/cost-setup');
    return res.data.data;
  },

  async updateOwnership(id: string, payload: VehicleOwnershipPayload): Promise<void> {
    await api.patch(`/vehicles/${id}`, payload);
  },

  async addFixedCost(vehicleId: string, payload: VehicleFixedCostPayload): Promise<void> {
    await api.post(`/vehicles/${vehicleId}/fixed-costs`, payload);
  },

  async updateFixedCost(vehicleId: string, costId: string, payload: Partial<VehicleFixedCostPayload>): Promise<void> {
    await api.patch(`/vehicles/${vehicleId}/fixed-costs/${costId}`, payload);
  },

  async deleteFixedCost(vehicleId: string, costId: string): Promise<void> {
    await api.delete(`/vehicles/${vehicleId}/fixed-costs/${costId}`);
  },

  async addDriverSalary(driverId: string, payload: DriverSalaryPayload): Promise<void> {
    await api.post(`/drivers/${driverId}/salaries`, payload);
  },

  async updateDriverSalary(driverId: string, salaryId: string, payload: Partial<DriverSalaryPayload>): Promise<void> {
    await api.patch(`/drivers/${driverId}/salaries/${salaryId}`, payload);
  },

  async deleteDriverSalary(driverId: string, salaryId: string): Promise<void> {
    await api.delete(`/drivers/${driverId}/salaries/${salaryId}`);
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

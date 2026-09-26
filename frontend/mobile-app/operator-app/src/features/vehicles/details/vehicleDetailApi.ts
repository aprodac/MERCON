/**
 * Data for the vehicle details screen. `GET /vehicles/:id` already carries the
 * truck, its assigned driver, its last 100 trips, its documents, the current
 * maintenance job and its last known position; the rest are one call each.
 */
import { api } from '@mercon/mobile-shared/lib/api';
import { zonedWallTimeToUtcIso, dateInZone } from '@mercon/shared-types';

export interface VehicleTripStop {
  id: string;
  stop_type: string;
  leg_index?: number | null;
  stop_sequence?: number | null;
  location_name?: string | null;
  actual_arrival?: string | null;
}

export interface VehicleTrip {
  id: string;
  ref_id: string | null;
  status: string;
  planned_start: string | null;
  planned_end?: string | null;
  actual_start?: string | null;
  actual_end?: string | null;
  customer?: { id: string; name: string; logo_url?: string | null } | null;
  driver?: { id: string; first_name: string; last_name: string; phone_primary?: string | null } | null;
  stops?: VehicleTripStop[];
}

export interface VehicleDocument {
  id: string;
  doc_type: string | null;
  status?: string | null;
  issue_date?: string | null;
  expiry_date?: string | null;
  file_url?: string | null;
}

export interface VehicleLocation {
  latitude: number | null;
  longitude: number | null;
  speed_kph: number | null;
  source: 'PHYSICAL_GPS' | 'DRIVER_GPS' | 'NONE' | string;
  display_state: 'CURRENT' | 'LAST_KNOWN' | 'UNAVAILABLE' | string;
  timestamp: string | null;
  formatted_time_ago?: string | null;
}

export interface VehicleDetail {
  id: string;
  ref_id: string | null;
  plate_number: string;
  asset_type: string;
  status: 'Available' | 'OnTrip' | 'Maintenance' | 'Inactive' | string;
  capacity_kg: number;
  current_odometer: number;
  odometer_updated_at?: string | null;
  image_url?: string | null;
  trailer_number?: string | null;
  trailer_type?: string | null;
  trailer_capacity_kg?: number | null;
  icces_device_id?: string | null;
  isActive?: boolean;
  assignedDriver: { id: string; first_name: string; last_name: string; phone_primary: string | null } | null;
  trips: VehicleTrip[];
  documents: VehicleDocument[];
  active_maintenance: { id: string; status: string; maintenance_type: string; workshop_name: string; start_date: string; end_date: string | null } | null;
  resolved_location: VehicleLocation | null;
}

export interface VehicleMonth {
  total_income: number;
  total_expenses: number;
  net_profit: number;
  margin_percent: number;
  fuel_expenses: number;
  maintenance_expenses: number;
  driver_charges: number;
  completed_trips_count: number;
  total_distance_km: number;
}

export interface VehicleMaintenance {
  id: string;
  maintenance_type: string;
  system?: string | null;
  status: string;
  workshop_name: string;
  start_date: string;
  end_date?: string | null;
  service_date?: string | null;
  cost?: number | string | null;
  next_service_due?: string | null;
}

export const vehicleDetailApi = {
  async vehicle(id: string): Promise<VehicleDetail> {
    const { data } = await api.get(`/vehicles/${id}`);
    return data.data as VehicleDetail;
  },

  /** Income, costs and profit for the current calendar month in the company timezone. */
  async thisMonth(id: string, tz: string): Promise<VehicleMonth> {
    const today = dateInZone(Date.now(), tz);
    const from = zonedWallTimeToUtcIso(`${today.slice(0, 7)}-01`, '00:00', tz);
    const { data } = await api.get(`/vehicles/${id}/financials`, { params: { from, to: new Date().toISOString() } });
    return data.data.summary as VehicleMonth;
  },

  async maintenance(id: string): Promise<VehicleMaintenance[]> {
    const { data } = await api.get('/maintenance', { params: { vehicle_id: id, per_page: 50 } });
    return (data.data ?? []) as VehicleMaintenance[];
  },

  async timezone(): Promise<string> {
    try {
      const { data } = await api.get('/settings/public');
      return data?.data?.timezone || 'Asia/Riyadh';
    } catch {
      return 'Asia/Riyadh';
    }
  },

  /**
   * Give the truck to another driver (or nobody). A truck has at most one
   * driver, so the current driver is released first; if the new assignment
   * then fails, the old one is put back.
   */
  async reassignDriver(vehicleId: string, fromDriverId: string | null, toDriverId: string | null): Promise<void> {
    if (fromDriverId === toDriverId) return;
    if (fromDriverId) await api.patch(`/drivers/${fromDriverId}`, { assigned_vehicle_id: null });
    if (!toDriverId) return;
    try {
      await api.patch(`/drivers/${toDriverId}`, { assigned_vehicle_id: vehicleId });
    } catch (err) {
      if (fromDriverId) await api.patch(`/drivers/${fromDriverId}`, { assigned_vehicle_id: vehicleId }).catch(() => {});
      throw err;
    }
  },
};

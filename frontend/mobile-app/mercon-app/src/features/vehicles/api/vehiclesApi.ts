/**
 * Vehicles API layer — raw HTTP calls only, no business logic.
 *   GET /vehicles          → paginated vehicle list with assigned driver, active trip, and maintenance pre-joined
 *   GET /vehicles?mode=kpi → server-side aggregated KPI stats
 */
import { api } from '@/lib/api';
import type { AssetStatus, AssetType } from '../types';

export interface RawVehicleAssignedDriver {
  id: string;
  first_name: string;
  last_name: string;
  phone_primary: string | null;
  avatar_url: string | null;
}

export interface RawVehicleActiveTrip {
  id: string;
  status: string;
  customer?: { name: string } | null;
  driver?: { id: string; first_name: string; last_name: string; phone_primary: string | null; avatar_url: string | null } | null;
  stops?: Array<{ stop_type: string; location_name: string | null; location_address: string | null; stop_sequence: number }>;
}

export interface RawVehicleActiveMaintenance {
  id: string;
  status: string;
  maintenance_type: string;
  workshop_name: string | null;
  start_date: string | null;
  end_date: string | null;
}

export interface RawVehicle {
  id: string;
  ref_id: string | null;
  plate_number: string;
  asset_type: AssetType;
  status: AssetStatus;
  capacity_kg: number;
  current_odometer: number;
  trailer_number: string | null;
  trailer_type: string | null;
  image_url: string | null;
  icces_device_id: string | null;
  createdAt: string;
  assignedDriver: RawVehicleAssignedDriver | null;
  trips: RawVehicleActiveTrip[];
  active_maintenance: RawVehicleActiveMaintenance | null;
  resolved_location: any | null;
}

export interface RawVehicleListResponse {
  data: RawVehicle[];
  meta: { page: number; per_page: number; total: number; total_pages: number };
}

export interface VehicleKpiResponse {
  total: number;
  available: number;
  onTrip: number;
  maintenance: number;
}

export const vehiclesApi = {
  async getVehicles(params: {
    page?: number;
    per_page?: number;
    search?: string;
    status?: AssetStatus | null;
  }): Promise<RawVehicleListResponse> {
    const response = await api.get('/vehicles', {
      params: {
        page: params.page ?? 1,
        per_page: params.per_page ?? 10,
        search: params.search || undefined,
        status: params.status || undefined,
      },
    });
    return { data: response.data.data, meta: response.data.meta };
  },

  async getVehicleStats(): Promise<VehicleKpiResponse> {
    const { data } = await api.get('/vehicles', { params: { mode: 'kpi' } });
    const res = data.data ?? {};
    return {
      total: res.total ?? 0,
      available: res.available ?? 0,
      onTrip: res.onTrip ?? 0,
      maintenance: res.maintenance ?? 0,
    };
  },
};

/**
 * Drivers API layer — raw HTTP calls only, no business logic and no shape
 * transformation beyond unwrapping the `{ success, data, meta }` envelope.
 *   GET /drivers          → paginated driver list, each with its current
 *                            active trip + vehicle pre-joined by the backend
 *   GET /reports/drivers   → all-time total_trips per driver
 */
import { api } from '@/lib/api';
import type { DriverStatus } from '../types';

/** Raw shape of one row from GET /drivers — driverController includes each driver's one active trip (if any) with its vehicle. */
export interface RawDriver {
  id: string;
  ref_id: string | null;
  first_name: string;
  last_name: string;
  phone_primary: string | null;
  status: DriverStatus;
  license_number: string;
  license_expiry: string;
  avatar_url?: string | null;
  createdAt: string;
  trips: { id: string; status: string; vehicle: { plate_number: string } | null }[];
  assignedVehicle: { id: string; ref_id: string | null; plate_number: string; asset_type: string; capacity_kg: number } | null;
}

export interface RawDriverListResponse {
  data: RawDriver[];
  meta: { page: number; per_page: number; total: number; total_pages: number };
}

export interface DriverTripCount {
  id: string;
  total_trips: number;
  monthly_payout?: number;
  nearest_doc_expiry?: string | null;
}

export const driversApi = {
  async getDrivers(params: { page?: number; per_page?: number; search?: string; status?: DriverStatus | null }): Promise<RawDriverListResponse> {
    const response = await api.get('/drivers', {
      params: {
        page: params.page ?? 1,
        per_page: params.per_page ?? 20,
        search: params.search || undefined,
        status: params.status || undefined,
      },
    });
    return { data: response.data.data, meta: response.data.meta };
  },

  /** All-time trip counts per driver (no date range = getDriverPerformance's default, all-time). */
  async getDriverTripCounts(): Promise<DriverTripCount[]> {
    const { data } = await api.get('/reports/drivers', { params: { per_page: 200 } });
    return (data.data ?? []) as DriverTripCount[];
  },

  /** Database-aggregated driver counts across all fleet drivers. */
  async getDriverStats(): Promise<{
    totalDrivers: number;
    online: number;
    onTrip: number;
    offline: number;
    onLeave: number;
    inactive: number;
  }> {
    const { data } = await api.get('/drivers/stats');
    const res = data.data ?? {};
    return {
      totalDrivers: res.total ?? 0,
      online: res.available ?? 0,
      onTrip: res.on_trip ?? 0,
      offline: res.off_duty ?? 0,
      onLeave: 0,
      inactive: res.inactive ?? 0,
    };
  },
};

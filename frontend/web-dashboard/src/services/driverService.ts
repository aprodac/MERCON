import { api, ApiResponse } from '@/lib/api';
import { Vehicle } from './vehicleService';
import type { ImportSummary } from '@/components/fleet/ExcelImportDialog';

export type DriverStatus = 'Available' | 'OnTrip' | 'OffDuty' | 'Inactive';

export interface Driver {
  id: string;
  ref_id: string | null;
  first_name: string;
  last_name: string;
  phone_primary: string;
  status: DriverStatus;
  license_number: string;
  license_expiry: string;
  avatar_url?: string | null;
  isActive: boolean;
  hasAccountPassword?: boolean;
  createdAt: string;
  assignedVehicleId: string | null;
  assignedVehicle?: Vehicle | null;
  trips?: any[];
  documents?: Document[];
  /** Lifetime driver payout across every trip (not just the in-progress ones `trips` carries). */
  total_trip_charges?: number;
}

export interface CreateDriverPayload {
  first_name: string;
  last_name: string;
  phone_primary: string;
  license_number: string;
  license_expiry: string;
  assigned_vehicle_id?: string | null;
  avatar_url?: string | null;
}

export interface DriverUsage {
  activeTrips: number;
  totalTrips: number;
  expenses: number;
}

export interface DriverFilters {
  status?: DriverStatus;
  search?: string;
  page?: number;
  per_page?: number;
  mode?: 'lookup';
  licenseFilter?: 'All' | 'Valid' | 'Expired';
  license_status?: 'All' | 'Valid' | 'Expired';
  sortOrder?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

/** Roster KPI counts, computed in the database — see `getDriverStats`. */
export interface DriverStats {
  total: number;
  expired_licenses: number;
  by_status: Record<string, number>;
  available: number;
  on_trip: number;
  off_duty: number;
  inactive: number;
}

export const driverService = {
  async getPayouts(driverIds: string[]): Promise<Record<string, number>> {
    if (driverIds.length === 0) return {};
    const res = await api.get<ApiResponse<{ payouts: Record<string, number> }>>('/drivers/payouts', {
      params: { driverIds: driverIds.join(',') }
    });
    return res.data.data.payouts;
  },

  async getStats(): Promise<DriverStats> {
    const res = await api.get<ApiResponse<DriverStats>>('/drivers/stats');
    return res.data.data;
  },

  async getAll(filters: DriverFilters = {}): Promise<ApiResponse<Driver[]>> {
    const res = await api.get<ApiResponse<Driver[]>>('/drivers', { params: filters });
    return res.data;
  },

  /**
   * Scalable driver export fetcher: retrieves all matching records across all pages
   * from the backend using active filters and pagination metadata.
   */
  async getAllForExport(filters: Omit<DriverFilters, 'page' | 'per_page'> = {}): Promise<Driver[]> {
    const BATCH_SIZE = 1000;
    const firstPageRes = await this.getAll({
      ...filters,
      page: 1,
      per_page: BATCH_SIZE,
      mode: 'lookup',
    });

    const allData: Driver[] = [...(firstPageRes.data || [])];
    const totalPages = firstPageRes.meta?.total_pages || 1;
    const totalRecords = firstPageRes.meta?.total;

    if (totalPages <= 1) {
      return allData;
    }

    for (let p = 2; p <= totalPages; p++) {
      const pageRes = await this.getAll({
        ...filters,
        page: p,
        per_page: BATCH_SIZE,
        mode: 'lookup',
      });

      if (!pageRes.data || pageRes.data.length === 0) {
        throw new Error(`Export interrupted: page ${p} of ${totalPages} returned empty data`);
      }

      allData.push(...pageRes.data);
    }

    if (typeof totalRecords === 'number' && allData.length < totalRecords) {
      throw new Error(`Export incomplete: expected ${totalRecords} records, but retrieved ${allData.length}`);
    }

    return allData;
  },

  /**
   * `lookup: true` omits the driver's trip history — use it on screens that
   * only need the person (name, status, phone, assigned vehicle).
   */
  async getById(id: string, opts: { lookup?: boolean } = {}): Promise<Driver> {
    const res = await api.get<ApiResponse<Driver>>(`/drivers/${id}`, {
      params: opts.lookup ? { mode: 'lookup' } : undefined,
    });
    return res.data.data;
  },

  async create(payload: CreateDriverPayload): Promise<Driver> {
    const res = await api.post<ApiResponse<Driver>>('/drivers', payload);
    return res.data.data;
  },

  async update(id: string, payload: Partial<CreateDriverPayload & { status: DriverStatus }>): Promise<Driver> {
    const res = await api.patch<ApiResponse<Driver>>(`/drivers/${id}`, payload);
    return res.data.data;
  },

  async delete(id: string, password?: string): Promise<void> {
    await api.delete(`/drivers/${id}`, { data: { password } });
  },

  async getUsage(id: string): Promise<DriverUsage> {
    const res = await api.get<ApiResponse<DriverUsage>>(`/drivers/${id}/usage`);
    return res.data.data;
  },

  async bulkDelete(ids: string[]): Promise<{ message: string }> {
    const res = await api.post<ApiResponse<{ message: string }>>('/drivers/bulk-delete', { ids });
    return res.data.data;
  },

  async bulkUpdateStatus(ids: string[], status: string): Promise<void> {
    await api.post('/drivers/bulk-update-status', { ids, status });
  },

  /**
   * Import rows parsed from the fleet workbook in the browser. Matches existing
   * drivers on phone number and updates them, so re-uploading a corrected file
   * fixes people instead of duplicating them.
   */
  async importRows(rows: Record<string, string | number>[]): Promise<ImportSummary> {
    const res = await api.post<ApiResponse<ImportSummary>>('/drivers/import', { rows }, { timeout: 120_000 });
    return res.data.data;
  },

  async setDriverPassword(id: string, password: string): Promise<{ message: string }> {
    const res = await api.post<ApiResponse<{ message: string }>>(`/drivers/${id}/set-password`, { password });
    return res.data.data;
  },
};

import { api, ApiResponse } from '@/lib/api';
import type { MerconDocument } from '@/services/documentService';

/** entity_type used when attaching workshop invoices to a service order. */
export const MAINTENANCE_ENTITY_TYPE = 'MaintenanceRecord';

export type MaintenanceType = 'Routine' | 'Repair' | 'Inspection' | 'Renewal' | 'Emergency';
export type MaintenanceStatus = 'Scheduled' | 'In_Progress' | 'Completed' | 'Cancelled';
export type VehicleSystemCategory = 'engine' | 'axles' | 'air_system' | 'brakes' | 'tires' | 'electrical' | 'others';

export interface MaintenanceRecord {
  id: string;
  /** Sequential service-order number, e.g. "MNT-001". Null only for un-backfilled rows. */
  ref_id?: string | null;
  vehicleId: string;
  workshop_name: string;
  workshop_contact?: string | null;
  maintenance_type: MaintenanceType;
  system?: VehicleSystemCategory | string | null;
  status: MaintenanceStatus;
  start_date: string;
  end_date?: string | null;
  service_date: string;
  work_done?: string | null;
  odometer_reading: number;
  /** Total paid, VAT included. */
  cost: number;
  /** Reclaimable VAT inside `cost`. */
  vat_amount?: number | string;
  payment_status?: 'Paid' | 'Pending';
  paymentAccountId?: string | null;
  /** When the truck should be back on the road. */
  expected_end_date?: string | null;
  items?: MaintenanceItem[];
  invoice_number?: string | null;
  invoice_url?: string | null;
  next_service_due?: string | null;
  remarks?: string | null;
  createdAt: string;
  updatedAt: string;
  vehicle?: {
    id: string;
    plate_number: string;
    ref_id: string | null;
    asset_type: string;
    status: string;
    current_odometer: number;
    capacity_kg?: number;
    deletedAt?: string | null;
  };
  /** Only returned by the detail endpoint. */
  documents?: MerconDocument[];
}

export type MaintenanceItemKind = 'part' | 'labour' | 'other';

/** One cost line of a service order, before VAT. */
export interface MaintenanceItem {
  id?: string;
  kind: MaintenanceItemKind;
  description: string;
  quantity: number | string;
  unit_price: number | string;
  amount?: number | string;
  servicePlanId?: string | null;
  servicePlan?: { id: string; task: string } | null;
}

export interface CreateMaintenancePayload {
  vehicle_id: string;
  workshop_name: string;
  workshop_contact?: string;
  maintenance_type: MaintenanceType;
  system?: VehicleSystemCategory | string;
  status?: MaintenanceStatus;
  start_date?: string;
  end_date?: string;
  service_date?: string;
  work_done?: string;
  odometer_reading: number;
  /** Older single-cost entry; the lines (`items`) replace it. */
  cost?: number;
  items?: { kind: MaintenanceItemKind; description: string; quantity: number; unit_price: number; service_plan_id?: string | null }[];
  vat_amount?: number;
  payment_status?: 'Paid' | 'Pending';
  payment_account_id?: string | null;
  expected_end_date?: string | null;
  invoice_number?: string;
  invoice_url?: string;
  next_service_due?: string;
  remarks?: string;
}

export interface UpdateMaintenancePayload extends Partial<CreateMaintenancePayload> {}

export interface MaintenanceFilters {
  vehicle_id?: string;
  status?: string;
  maintenance_type?: string;
  search?: string;
  page?: number;
  per_page?: number;
}

export interface MaintenanceKpis {
  total_cost: number;
  active_count: number;
  scheduled_count: number;
  completed_count: number;
  renewal_cost: number;
}

export interface MaintenanceListResponse {
  success: boolean;
  data: MaintenanceRecord[];
  kpis?: MaintenanceKpis;
  meta: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

/** A workshop available in the system (saved or derived from service orders). */
export interface Workshop {
  id?: string;
  name: string;
  contact: string | null;
  address?: string | null;
  notes?: string | null;
  is_saved?: boolean;
  order_count: number;
  last_used?: string;
}

export type DueStatus = 'overdue' | 'due_soon' | 'ok' | 'never' | 'booked';

export interface DueService {
  vehicleId: string;
  plate: string;
  asset_type: string;
  odometer: number;
  odometer_updated_at: string | null;
  planId: string;
  task: string;
  interval_km: number | null;
  interval_days: number | null;
  scope: 'truck' | 'type' | 'all';
  last: { date: string; km: number; recordId: string; ref: string | null } | null;
  status: DueStatus;
  dueKm: number | null;
  dueDate: string | null;
  remainingKm: number | null;
  remainingDays: number | null;
}

export interface MaintenanceOverview {
  in_workshop: { count: number; long: number; longest: { plate: string; days: number } | null; overdue_return: number };
  due: { overdue: number; due_soon: number; never: number; plans: number };
  scheduled: { count: number; week: number[]; next: { plate: string; date: string; ref: string | null } | null };
  cost: { month: string; this_month: number; last_month: number; trend: { month: string; amount: number }[]; downtime_days: number };
}

export interface ServicePlan {
  id: string;
  task: string;
  asset_type: 'Flatbed' | 'Reefer' | 'Box' | 'Tanker' | null;
  vehicle_id: string | null;
  vehicle_plate: string | null;
  interval_km: number | null;
  interval_days: number | null;
  warn_km: number;
  warn_days: number;
  notes: string | null;
  is_active: boolean;
  scope: 'truck' | 'type' | 'all';
}

export type ServicePlanInput = Omit<ServicePlan, 'id' | 'vehicle_plate' | 'scope'>;

export interface SavedWorkItem {
  id: string;
  title: string;
  category?: string | null;
  createdAt?: string;
}

export const maintenanceService = {
  async getAll(filters: MaintenanceFilters = {}): Promise<MaintenanceListResponse> {
    const res = await api.get<MaintenanceListResponse>('/maintenance', { params: filters });
    return res.data;
  },

  /** Workshops (both explicitly saved and derived from service orders). */
  async getWorkshops(): Promise<Workshop[]> {
    const res = await api.get<ApiResponse<Workshop[]>>('/maintenance/workshops');
    return res.data.data;
  },

  async createWorkshop(payload: { name: string; contact_phone?: string; address?: string; notes?: string }): Promise<Workshop> {
    const res = await api.post<ApiResponse<Workshop>>('/maintenance/workshops', payload);
    return res.data.data;
  },

  async deleteWorkshop(id: string): Promise<void> {
    await api.delete(`/maintenance/workshops/${id}`);
  },

  /** For a name that was only ever typed into a record, never saved — clears it off every record that used it. */
  async clearWorkshopName(name: string): Promise<void> {
    await api.delete('/maintenance/workshops/by-name', { params: { name } });
  },

  /** Saved work items / service details presets. */
  async getWorkItems(): Promise<SavedWorkItem[]> {
    const res = await api.get<ApiResponse<SavedWorkItem[]>>('/maintenance/work-items');
    return res.data.data;
  },

  async createWorkItem(payload: { title: string; category?: string }): Promise<SavedWorkItem> {
    const res = await api.post<ApiResponse<SavedWorkItem>>('/maintenance/work-items', payload);
    return res.data.data;
  },

  async deleteWorkItem(id: string): Promise<void> {
    await api.delete(`/maintenance/work-items/${id}`);
  },

  /** The hub's four figures. */
  async getOverview(): Promise<MaintenanceOverview> {
    return (await api.get<ApiResponse<MaintenanceOverview>>('/maintenance/overview')).data.data;
  },

  /** Planned services per truck, most urgent first. */
  async getDue(vehicleId?: string): Promise<DueService[]> {
    return (await api.get<ApiResponse<DueService[]>>('/maintenance/due', { params: vehicleId ? { vehicle_id: vehicleId } : {} })).data.data;
  },

  async getPlans(): Promise<ServicePlan[]> {
    return (await api.get<ApiResponse<ServicePlan[]>>('/maintenance/plans')).data.data;
  },
  async createPlan(body: ServicePlanInput): Promise<ServicePlan> {
    return (await api.post<ApiResponse<ServicePlan>>('/maintenance/plans', body)).data.data;
  },
  async updatePlan(id: string, body: ServicePlanInput): Promise<ServicePlan> {
    return (await api.put<ApiResponse<ServicePlan>>(`/maintenance/plans/${id}`, body)).data.data;
  },
  async deletePlan(id: string): Promise<void> {
    await api.delete(`/maintenance/plans/${id}`);
  },

  async getById(id: string): Promise<MaintenanceRecord> {
    const res = await api.get<ApiResponse<MaintenanceRecord>>(`/maintenance/${id}`);
    return res.data.data;
  },

  async create(payload: CreateMaintenancePayload): Promise<MaintenanceRecord> {
    const res = await api.post<ApiResponse<MaintenanceRecord>>('/maintenance', payload);
    return res.data.data;
  },

  async update(id: string, payload: UpdateMaintenancePayload): Promise<MaintenanceRecord> {
    const res = await api.patch<ApiResponse<MaintenanceRecord>>(`/maintenance/${id}`, payload);
    return res.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/maintenance/${id}`);
  },

  /**
   * Closes every open service order on a vehicle and puts it back to Available.
   */
  async returnVehicleToService(vehicleId: string): Promise<{ closed_orders: number }> {
    const res = await api.post<ApiResponse<{ closed_orders: number }>>(
      `/maintenance/vehicles/${vehicleId}/return-to-service`,
    );
    return res.data.data;
  },
};

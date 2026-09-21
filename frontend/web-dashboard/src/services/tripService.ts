import { api, ApiResponse } from '@/lib/api';
import type { ResolvedLocation } from './vehicleService';

export type TripStatus = 'Draft' | 'Scheduled' | 'Loading' | 'Dispatched' | 'AtPickup' | 'InTransit' | 'AtDelivery' | 'Completed' | 'Invoiced' | 'Cancelled' | 'Delayed' | 'Emergency' | (string & {});

/** One itemised customer-billable extra actually charged on a trip. */
export interface TripCharge {
  id: string;
  tripId: string;
  surchargeRuleId: string | null;
  charge_type: string;
  unit: string | null;
  rate: number;
  quantity: number;
  amount: number;
  createdAt: string;
}

/** A charge line as submitted to settlement — server fills in id/tripId/createdAt. */
export interface TripChargeInput {
  surchargeRuleId?: string | null;
  charge_type: string;
  unit?: string | null;
  rate: number;
  quantity: number;
  amount: number;
  save_as_rule?: boolean;
}

export type DriverTripRole = 'PRIMARY' | 'CO_DRIVER' | 'RELIEVER';
export type AssignmentEntityType = 'DRIVER' | 'VEHICLE';

export interface TripDriver {
  id: string;
  tripId: string;
  driverId: string;
  role: DriverTripRole;
  driver_charge?: number | null;
  extra_driver_payment?: number | null;
  payment_reason?: string | null;
  payment_status?: string | null;
  assignedAt: string;
  removedAt?: string | null;
  driver?: {
    id: string;
    ref_id?: string | null;
    first_name: string;
    last_name: string;
    phone_primary?: string | null;
    avatar_url?: string | null;
  };
}

export interface TripAssignmentEvent {
  id: string;
  tripId: string;
  entityType: AssignmentEntityType;
  fromId?: string | null;
  toId?: string | null;
  reason: string;
  changedBy?: string | null;
  changedAt: string;
}

export interface DriverRecommendation {
  driverId: string;
  driverName: string;
  phone?: string | null;
  assignmentType: 'PRIMARY' | 'BACKUP' | 'TEMPORARY';
  priority: number;
  isAvailable: boolean;
  unavailabilityReason?: string;
}

export interface VehicleRecommendation {
  vehicleId: string;
  plateNumber: string;
  assetType: string;
  capacityKg: number;
  assignmentType: 'PRIMARY' | 'BACKUP' | 'TEMPORARY';
  priority: number;
  isAvailable: boolean;
  unavailabilityReason?: string;
}

export interface Trip {
  id: string;
  ref_id: string;
  status: TripStatus;
  driver_workflow_state?: string | null;
  planned_start: string | null;
  actual_start: string | null;
  planned_end: string | null;
  actual_end: string | null;
  planned_distance: number | null;
  /** Itemised customer-billable extras — waiting/labor, additional stops, etc. */
  charges?: TripCharge[];
  driver_payout?: number;
  driver_charge?: number;
  trip_charges?: number;
  billing_amount?: number;
  financials?: {
    id?: string;
    tripId?: string;
    quotationId?: string | null;
    applied_rate?: number | null;
    quotation_line_type?: string | null;
    quotation_billing_type?: string | null;
    quotation_pricing_basis?: string | null;
    quotation_vehicle_class?: string | null;
    quotation_source_vehicle_label?: string | null;
    createdAt?: string;
    updatedAt?: string;
  } | null;
  quotationId?: string | null;
  quotation_id?: string | null;
  quotation_line_type?: string | null;
  quotation_billing_type?: string | null;
  quotation_pricing_basis?: string | null;
  applied_rate?: number | null;
  line_type_id?: string | null;
  line_type?: { id?: string; name?: string } | null;
  quotation_vehicle_class?: string | null;
  quotation_source_vehicle_label?: string | null;
  carrier_name?: string;
  is_post_trip_settled?: boolean;
  is_third_party?: boolean;
  subcontract?: {
    id?: string;
    tripId?: string;
    providerId?: string | null;
    provider?: { id: string; name: string; contact_person?: string | null; phone?: string | null } | null;
    driverName?: string | null;
    driverPhone?: string | null;
    vehiclePlate?: string | null;
    vehicleType?: string | null;
    cost?: number | null;
  } | null;
  thirdPartyProviderId?: string | null;
  third_party_driver_name?: string | null;
  third_party_driver_phone?: string | null;
  third_party_vehicle_plate?: string | null;
  third_party_vehicle_type?: string | null;
  third_party_cost?: number | null;
  thirdPartyProvider?: {
    id: string;
    name: string;
    contact_person?: string | null;
    phone?: string | null;
  } | null;
  created_by?: string | null;
  updated_by?: string | null;
  deleted_by?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  notes?: string | null;
  customer_id?: string;
  customer?: { id: string; name: string; logo_url?: string | null; primary_contact_person?: string | null; contact_phone: string; whatsapp_number?: string; whatsapp_group_link?: string; whatsapp_group_name?: string };
  driver?: { id: string; ref_id: string; first_name: string; last_name: string; phone_primary: string; avatar_url?: string | null; deletedAt?: string | null } | null;
  co_driver_id?: string | null;
  coDriver?: { id: string; ref_id: string; first_name: string; last_name: string; phone_primary: string; avatar_url?: string | null; deletedAt?: string | null } | null;
  vehicle?: { id: string; ref_id: string; plate_number: string; asset_type: string; capacity_kg: number; icces_device_id: string | null; deletedAt?: string | null; resolved_location?: ResolvedLocation } | null;
  tripDrivers?: TripDriver[];
  is_contingency_dispatch?: boolean;
  original_vehicle_id?: string | null;
  original_driver_id?: string | null;
  contingency_reason?: string | null;
  assignmentEvents?: TripAssignmentEvent[];
  stops?: TripStop[];
  invoices?: { id: string; ref_id: string; total_amount: number; status: string }[];
  vehicle_type?: string | null;
  rate_category?: string | null;
  billing_type?: string | null;
  rateCardId?: string | null;
  rateCard?: {
    id: string;
    name: string;
    route_origin: string;
    route_destination: string;
    base_price: number;
    currency: string;
    vehicle_type?: string | null;
    rate_category?: string | null;
    billing_type?: string | null;
    driver_payout?: number | null;
  } | null;
}

export function getTripPayloadCapacity(trip: Partial<Trip>): string {
  if (trip.vehicle_type) return trip.vehicle_type;
  if (trip.rateCard?.vehicle_type) return trip.rateCard.vehicle_type;
  if (trip.third_party_vehicle_type) return trip.third_party_vehicle_type;
  if (trip.vehicle?.capacity_kg) {
    const tons = trip.vehicle.capacity_kg / 1000;
    return `${tons % 1 === 0 ? tons.toFixed(0) : tons.toFixed(1)} Tons`;
  }
  return '—';
}

export function getTripRateCategory(trip: Partial<Trip>): string {
  return (
    trip.rate_category ||
    trip.quotation_line_type ||
    trip.financials?.quotation_line_type ||
    trip.rateCard?.rate_category ||
    trip.line_type?.name ||
    '—'
  );
}

export function getTripBillingType(trip: Partial<Trip>): string {
  return trip.billing_type || trip.rateCard?.billing_type || '—';
}

export interface TripStop {
  id: string;
  stop_sequence: number;
  leg_index?: number;
  stop_type: 'Pickup' | 'Dropoff' | 'Rest' | 'Refuel';
  location_lat: number;
  location_lng: number;
  /** Short label for the exact yard — "Khamis Sorting Center". */
  location_name: string | null;
  /** Its full postal address. This is what the driver's app shows. */
  location_address: string | null;
  /** The lane endpoint this stop sits in — what the rate card is priced against. */
  locationId: string | null;
  location?: { id: string; name: string; address: string | null; city?: string | null; state?: string | null; codes?: string[] } | null;
  planned_arrival: string | null;
  actual_arrival: string | null;
  actual_departure: string | null;
  delay_reason: DelayReason | null;
  delay_note: string | null;
  delay_logged_by: string | null;
  delay_logged_at: string | null;
}

export interface CreateTripPayload {
  customer_id: string;
  driver_id?: string;
  vehicle_id?: string;
  planned_start?: string;
  planned_end?: string;
  billing_amount?: number;
  trip_charges?: number;
  driver_payout?: number;
  driver_charge?: number;
  update_quotation_driver_payout?: boolean;
  status?: TripStatus;
  dispatch_now?: boolean;
  /** Quotation reference */
  quotation_id?: string;
  quotationId?: string;
  /** The rate card the price came from, recorded so invoicing bills what was quoted. */
  rate_card_id?: string;
  /** Tonnage tier / booking type — copied onto the trip so it survives the
   *  rate card being edited later. Omit to inherit whatever rate_card_id carries. */
  vehicle_type?: string | null;
  rate_category?: string | null;
  /** How this is billed, independent of rate_category — e.g. "Monthly", "Extra". */
  billing_type?: string | null;
  /** Third-Party Logistics fields */
  is_third_party?: boolean;
  third_party_provider_id?: string;
  third_party_driver_name?: string;
  third_party_driver_phone?: string;
  third_party_vehicle_plate?: string;
  third_party_vehicle_type?: string;
  third_party_cost?: number;
  stops: {
    stop_type: string;
    lat?: number | null;
    lng?: number | null;
    planned_arrival?: string;
    /** The exact yard/dock — what the driver navigates to. */
    location_name?: string;
    /** Its full postal address, shown to the driver in the mobile app. */
    location_address?: string;
    /** The lane endpoint this stop sits in ("Riyadh") — what the rate is priced against. */
    location_id?: string;
    coordinate_precision?: 'EXACT' | 'APPROXIMATE' | 'UNKNOWN';
    update_canonical_location?: boolean;
  }[];
}

export const DELAY_REASONS = [
  'Traffic',
  'VehicleBreakdown',
  'CustomerNotReady',
  'SlowLoadingUnloading',
  'Weather',
  'Documentation',
  'RouteBlocked',
  'Other',
] as const;

export type DelayReason = (typeof DELAY_REASONS)[number];

/** Enum values are stored compactly; these are what an operator reads. */
export const DELAY_REASON_LABELS: Record<DelayReason, string> = {
  Traffic: 'Traffic',
  VehicleBreakdown: 'Vehicle breakdown',
  CustomerNotReady: 'Customer not ready',
  SlowLoadingUnloading: 'Slow loading / unloading',
  Weather: 'Weather',
  Documentation: 'Documentation',
  RouteBlocked: 'Route blocked',
  Other: 'Other',
};

export interface LogStopDelayPayload {
  delay_reason: DelayReason;
  delay_note?: string;
}

export interface TripFilters {
  status?: TripStatus | string;
  driver_id?: string;
  vehicle_id?: string;
  customer_id?: string;
  quotation_id?: string;
  quotationId?: string;
  rate_card_id?: string;
  search?: string;
  date_filter?: string;
  start_date?: string;
  end_date?: string;
  page?: number;
  per_page?: number;
}

/* ─── Monthly board ─────────────────────────────────────────────────────── */

/** One trip as it appears on the monthly board — a day, a driver, a truck. */
export interface MonthlyBoardTrip {
  id: string;
  ref_id: string | null;
  status: TripStatus;
  /** Local YYYY-MM-DD the trip sits on. */
  date: string;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  /** The day came from createdAt because the trip was never scheduled. */
  date_is_inferred: boolean;
  driver: { id: string; ref_id: string | null; name: string; phone_primary: string | null; avatar_url?: string | null } | null;
  vehicle: { id: string; ref_id: string | null; plate_number: string; asset_type: string } | null;
  /** Tonnage tier — the trip's own, else the rate card it was booked from. */
  vehicle_type: string | null;
  /** Trip shape, e.g. "Round Trip". Same fallback as vehicle_type. */
  rate_category: string | null;
  /** How this is billed, e.g. "Monthly", "Extra". Same fallback as vehicle_type. */
  billing_type: string | null;
  billing_amount: number | null;
  currency: string;
  rate_card: { id: string; name: string; base_price: number } | null;
  origin: string | null;
  destination: string | null;
}

export interface MonthlyBoardCompany {
  customer: { id: string; name: string; contact_phone: string; avatar_url?: string | null; logo_url?: string | null };
  total_trips: number;
  total_billed: number;
  /** Trips still missing a driver or a truck — the gaps to fill. */
  unassigned_trips: number;
  drivers: { id: string; name: string; ref_id: string | null; trips: number }[];
  vehicles: { id: string; plate_number: string; trips: number }[];
  categories: { name: string; trips: number }[];
  days: { date: string; trips: MonthlyBoardTrip[] }[];
}

export interface MonthlyBoard {
  /** YYYY-MM the board is showing. */
  month: string;
  start: string;
  end: string;
  summary: {
    total_trips: number;
    companies: number;
    drivers_used: number;
    vehicles_used: number;
    total_billed: number;
    unassigned_trips: number;
    by_status: Record<string, number>;
    truncated: boolean;
  };
  companies: MonthlyBoardCompany[];
}

export interface MonthlyBoardFilters {
  /** YYYY-MM. Omitted means the current month. */
  month?: string;
  customer_id?: string;
  driver_id?: string;
  vehicle_id?: string;
  status?: string;
  rate_category?: string;
  vehicle_type?: string;
  billing_type?: string;
  search?: string;
}

export interface UpdateTripFinancialsPayload {
  /** Replaces the trip's entire itemised charge list when sent. */
  charges?: TripChargeInput[];
  trip_charges?: number;
  driver_payout?: number;
  driver_charge?: number;
  billing_amount?: number;
  carrier_name?: string;
  is_post_trip_settled?: boolean;
  update_quotation_driver_payout?: boolean;
  update_quotation_payout?: boolean;
}

export const tripService = {
  async getAll(filters: TripFilters = {}): Promise<ApiResponse<Trip[]>> {
    const res = await api.get<ApiResponse<Trip[]>>('/trips', { params: filters });
    return res.data;
  },

  /**
   * A whole month grouped company → day. Not paginated: the board's whole
   * point is seeing the month at once, and the server caps the query.
   */
  async getMonthlyBoard(filters: MonthlyBoardFilters = {}): Promise<MonthlyBoard> {
    const res = await api.get<ApiResponse<MonthlyBoard>>('/trips/monthly', {
      params: Object.fromEntries(
        Object.entries(filters).filter(([, value]) => value !== undefined && value !== ''),
      ),
    });
    return res.data.data;
  },

  async getById(id: string): Promise<Trip> {
    const res = await api.get<ApiResponse<Trip>>(`/trips/${id}`);
    return res.data.data;
  },

  async getUnsettled(): Promise<Trip[]> {
    const res = await api.get<ApiResponse<Trip[]>>('/trips/unsettled');
    return res.data.data;
  },

  async create(payload: CreateTripPayload): Promise<Trip> {
    const res = await api.post<ApiResponse<Trip>>('/trips', payload);
    return res.data.data;
  },

  async getRecommendedDrivers(params?: {
    vehicleId?: string;
    vehicleClass?: string;
    origin?: string;
    destination?: string;
  }): Promise<Array<{
    driverId: string;
    driverName: string;
    phone?: string | null;
    status: string;
    isAvailable: boolean;
    unavailabilityReason?: string;
    routeTripCount: number;
    capacityMatch: boolean;
    score: number;
    badges: string[];
    vehiclePlate?: string | null;
    vehicleClass?: string | null;
    rest_hours?: number | null;
  }>> {
    try {
      const res = await api.get<ApiResponse<any[]>>('/trips/recommendations/drivers', { params });
      return res.data.data || [];
    } catch {
      return [];
    }
  },

  async updateStatus(id: string, status: TripStatus): Promise<Trip> {
    const res = await api.patch<ApiResponse<Trip>>(`/trips/${id}/status`, { status });
    return res.data.data;
  },

  async updateFinancials(id: string, payload: UpdateTripFinancialsPayload): Promise<Trip> {
    const res = await api.patch<ApiResponse<Trip>>(`/trips/${id}/financials`, payload);
    return res.data.data;
  },

  /** Record why a stop was reached late. Re-callable — a first guess often
   *  turns out to be something else once the driver is actually reached. */
  /**
   * Correct where a stop is. Refused (409) once the trip is completed,
   * invoiced or cancelled — a finished trip is a record of what happened.
   */
  async updateStop(
    tripId: string,
    stopId: string,
    payload: {
      location_name?: string;
      location_address?: string;
      location_id?: string | null;
      lat?: number;
      lng?: number;
    }
  ): Promise<TripStop> {
    const res = await api.patch<ApiResponse<TripStop>>(`/trips/${tripId}/stops/${stopId}`, payload);
    return res.data.data;
  },

  async logStopDelay(tripId: string, stopId: string, payload: LogStopDelayPayload): Promise<TripStop> {
    const res = await api.patch<ApiResponse<TripStop>>(`/trips/${tripId}/stops/${stopId}/delay`, payload);
    return res.data.data;
  },

  /**
   * Confirm or correct the real time an EXTERNAL_APP evidence screenshot
   * happened at. Omit whichever of actual_arrival/actual_departure the
   * operator didn't change — submitting with both omitted is a pure
   * confirmation that the recorded time is already correct.
   */
  async confirmEvidenceTime(
    tripId: string,
    stopId: string,
    payload: { document_id: string; actual_arrival?: string; actual_departure?: string }
  ): Promise<TripStop> {
    const res = await api.patch<ApiResponse<TripStop>>(`/trips/${tripId}/stops/${stopId}/confirm-time`, payload);
    return res.data.data;
  },

  /** Assign a driver and/or vehicle to a trip that was created with "assign later". */
  async dispatch(id: string, payload: { driver_id?: string; vehicle_id?: string }): Promise<Trip> {
    const res = await api.post<ApiResponse<Trip>>(`/trips/${id}/dispatch`, payload);
    return res.data.data;
  },

  /** Bulk assign driver, vehicle, category, and/or status to multiple trips in a single transaction. */
  async bulkAssign(payload: { trip_ids: string[]; driver_id?: string; vehicle_id?: string; status?: string; rate_category?: string }): Promise<{ count: number; message: string }> {
    const res = await api.post<ApiResponse<{ count: number; message: string }>>('/trips/bulk-assign', payload);
    return res.data.data;
  },

  /** Reassign driver and/or vehicle on a trip. */
  async reassign(id: string, payload: { driver_id?: string; vehicle_id?: string }): Promise<Trip> {
    const res = await api.post<ApiResponse<Trip>>(`/trips/${id}/reassign`, payload);
    return res.data.data;
  },

  async approvePayment(id: string, amount: number, reason: string): Promise<Trip> {
    const res = await api.post<ApiResponse<Trip>>(`/trips/${id}/payment/approve`, { amount, reason });
    return res.data.data;
  },

  /** Swap the assigned driver mid-trip. */
  async replaceDriver(id: string, driverId: string, reason?: string): Promise<Trip> {
    const res = await api.post<ApiResponse<Trip>>(`/trips/${id}/replace-driver`, { new_driver_id: driverId, reason });
    return res.data.data;
  },

  async bulkDelete(ids: string[]): Promise<{ deletedCount: number; skippedCount: number; skippedTrips?: any[]; message?: string }> {
    const res = await api.post<ApiResponse<{ deletedCount: number; skippedCount: number; skippedTrips?: any[]; message?: string }>>('/trips/bulk-delete', { ids });
    return res.data.data;
  },

  async bulkUpdateStatus(ids: string[], status: string): Promise<void> {
    await api.post('/trips/bulk-update-status', { ids, status });
  },

  async bulkImport(rows: BulkImportTripRow[]): Promise<BulkImportResult> {
    const res = await api.post<ApiResponse<BulkImportResult>>('/trips/bulk-import', { rows });
    return res.data.data;
  },

  /** Mark a completed trip as invoiced. Creates the Invoice tracking record. */
  async markInvoiced(tripId: string, payload: { zatca_ref?: string; invoicing_note?: string }): Promise<{ trip: Trip; invoice: any }> {
    const res = await api.post<ApiResponse<{ trip: Trip; invoice: any }>>(`/trips/${tripId}/mark-invoiced`, payload);
    return res.data.data;
  },

  /** Reverse a mark-invoiced action. Admin-only correction. */
  async unmarkInvoiced(tripId: string): Promise<Trip> {
    const res = await api.post<ApiResponse<Trip>>(`/trips/${tripId}/unmark-invoiced`, {});
    return res.data.data;
  },

  /** Fetch the billing ledger — completed + invoiced trips with filtering. */
  async getBillingLedger(filters: BillingLedgerFilters = {}): Promise<ApiResponse<BillingLedgerTrip[]>> {
    const res = await api.get<ApiResponse<BillingLedgerTrip[]>>('/invoices/billing-ledger', { params: filters });
    return res.data;
  },

  /** Fetch the customer (company) billing ledger — one row per company with aggregated trip stats. */
  async getCustomerBillingLedger(filters: CustomerBillingFilters = {}): Promise<ApiResponse<CustomerBillingRow[]>> {
    const res = await api.get<ApiResponse<CustomerBillingRow[]>>('/invoices/billing-ledger/by-customer', { params: filters });
    return res.data;
  },

  /** Dispatch delay video or POD photo natively via WhatsApp Cloud API. */
  async shareMediaWhatsApp(tripId: string, params?: ShareMediaWhatsAppParams): Promise<ApiResponse<ShareMediaWhatsAppResponse>> {
    const res = await api.post<ApiResponse<ShareMediaWhatsAppResponse>>(`/trips/${tripId}/share-whatsapp`, params || {});
    return res.data;
  },
};

export interface BulkImportTripRow {
  customer_id?: string;
  customer_name?: string;
  driver_id?: string;
  driver_name?: string;
  co_driver_id?: string;
  vehicle_id?: string;
  vehicle_plate?: string;
  date?: string;
  planned_start?: string;
  planned_end?: string;
  rate_card_id?: string;
  rate_category?: string;
  vehicle_type?: string;
  billing_type?: string;
  billing_amount?: number;
  /** What MERCON paid its own driver for this specific trip. */
  trip_charges?: number;
  driver_charge?: number;
  driver_payout?: number;
  co_driver_payout?: number;
  additional_charge?: number;
  update_quotation_driver_payout?: boolean;
  origin?: string;
  destination?: string;
  status?: TripStatus;
  is_third_party?: boolean;
  third_party_provider_id?: string;
  third_party_provider_name?: string;
  third_party_driver_name?: string;
  third_party_driver_phone?: string;
  third_party_vehicle_plate?: string;
  third_party_vehicle_type?: string;
  third_party_cost?: number;
  pickup_time?: string;
  pickupTime?: string;
  time?: string;
  stops?: Array<{
    stop_sequence?: number;
    leg_index?: number;
    stop_type?: string;
    location_name?: string;
    location_address?: string | null;
    location_id?: string | null;
    lat?: number | null;
    lng?: number | null;
  }>;
}

export interface BulkImportResult {
  imported: number;
  failed: number;
  results: Array<{ row: number; success: boolean; ref_id?: string; error?: string }>;
  imported_count?: number;
  created_count?: number;
  errors?: any[];
}

export interface BillingLedgerFilters {
  customer_id?: string;
  date_from?: string;
  date_to?: string;
  invoice_status?: 'NotInvoiced' | 'Invoiced';
  search?: string;
  page?: number;
  per_page?: number;
}

export interface BillingLedgerTrip extends Omit<Trip, 'invoices'> {
  invoices: Array<{
    id: string;
    ref_id: string | null;
    status: string;
    total_amount: number;
    zatca_ref: string | null;
    invoicing_note: string | null;
    createdAt: string;
  }>;
}

export interface CustomerBillingFilters {
  date_from?: string;
  date_to?: string;
  invoice_status?: 'NotInvoiced' | 'Invoiced';
  search?: string;
}

export interface CustomerBillingRow {
  customer: {
    id: string;
    name: string;
    contact_phone?: string | null;
    contact_email?: string | null;
  };
  total_trips: number;
  completed: number;
  invoiced: number;
  coverage_pct: number;
  total_billing: number;
  invoiced_amount: number;
  pending_amount: number;
  trips: BillingLedgerTrip[];
}

// ─── Backend streaming export ─────────────────────────────────────────────────

export type ExportFormat = 'xlsx' | 'csv';

export interface TripExportParams {
  type: string;          // all | 3pl | completed | loading | in-transit | delayed | date-range
  format: ExportFormat;
  search?: string;
  start_date?: string;   // YYYY-MM-DD, timezone applied server-side
  end_date?: string;     // YYYY-MM-DD, timezone applied server-side
  driver_id?: string;
  vehicle_id?: string;
  customer_id?: string;
}

/**
 * Triggers a streaming export from the dedicated backend endpoint.
 *
 * Uses the shared `api` axios instance (which attaches the JWT automatically)
 * with responseType: 'blob'.  Returns a {blob, filename} pair — callers are
 * responsible for creating and revoking the object URL.
 *
 * This replaces the old frontend-side `runExport()` that fetched up to 2,000
 * rows as JSON and generated the file in the browser.  The new endpoint has
 * no row limit and applies all filters at the database level.
 */
export async function downloadTripExport(params: TripExportParams): Promise<{ blob: Blob; filename: string }> {
  const response = await api.get('/trips/export', {
    params: Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== ''),
    ),
    responseType: 'blob',
    timeout: 180_000, // 3 min — large exports can take time
  });

  // Try to extract the filename from Content-Disposition header
  const contentDisp: string = response.headers['content-disposition'] ?? '';
  const match = contentDisp.match(/filename="([^"]+)"/);
  const filename = match ? match[1] : `MERCON_trips_${params.type}_export.${params.format}`;

  return { blob: response.data as Blob, filename };
}

export async function getDriverRecommendations(vehicleId: string, plannedStart?: string): Promise<ApiResponse<DriverRecommendation[]>> {
  const res = await api.get<ApiResponse<DriverRecommendation[]>>('/trips/recommendations/drivers', { params: { vehicleId, plannedStart } });
  return res.data;
}

export async function getVehicleRecommendations(driverId: string): Promise<ApiResponse<VehicleRecommendation[]>> {
  const res = await api.get<ApiResponse<VehicleRecommendation[]>>('/trips/recommendations/vehicles', { params: { driverId } });
  return res.data;
}

export interface ShareMediaWhatsAppParams {
  category?: 'delay' | 'pod';
  recipientPhone?: string;
}

export interface ShareMediaWhatsAppResponse {
  isCloudApi?: boolean;
  messageId?: string;
  mediaId?: string;
  recipient?: string;
  publicMediaUrl?: string;
  shareText?: string;
  whatsappWebUrl?: string;
}

export async function shareMediaWhatsApp(
  tripId: string,
  params?: ShareMediaWhatsAppParams
): Promise<ApiResponse<ShareMediaWhatsAppResponse>> {
  const res = await api.post<ApiResponse<ShareMediaWhatsAppResponse>>(
    `/trips/${tripId}/share-whatsapp`,
    params || {}
  );
  return res.data;
}


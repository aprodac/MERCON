/**
 * Operator data — reuses the same backend endpoints the web dashboard uses
 * (operators authenticate with role Operator, which those routes allow).
 *   GET /reports/summary  → dashboard KPIs
 *   GET /trips            → trips (filtered here to active ones)
 */
import { useCallback, useEffect, useState } from 'react';
import { api, getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import type { TripStatus } from '@mercon/mobile-shared/lib/trips';

export interface Kpi { value: number; delta: number | null }

export interface DashboardSummary {
  kpis: {
    total_trips: Kpi;
    active_drivers: Kpi;
    fleet_available: Kpi;
    fleet_on_trip: Kpi;
    revenue_this_month: Kpi;
    docs_expiring_soon: Kpi;
  };
  trip_status_distribution: Record<string, number>;
  monthly_revenue_chart: { month: string; revenue: number }[];
}

export interface OperatorTrip {
  id: string;
  ref_id: string | null;
  status: string;
  planned_start?: string | null;
  createdAt?: string;
  customer?: { id?: string; name: string; logo_url?: string | null } | null;
  driver?: { first_name: string; last_name: string; avatar_url?: string | null } | null;
  vehicle?: { plate_number: string; ref_id?: string | null; asset_type?: string } | null;
  stops?: any[];
}

export interface OperatorTripStop {
  id: string;
  stop_sequence: number;
  leg_index?: number;
  stop_type: string;
  location_lat: number;
  location_lng: number;
  location_name: string | null;
  planned_arrival: string | null;
  actual_arrival: string | null;
  actual_departure: string | null;
  delay_reason?: string | null;
  delay_note?: string | null;
  delay_logged_at?: string | null;
}

export interface OperatorTripDocument {
  id: string;
  doc_type: string | null;
  file_url: string;
  mime_type?: string | null;
  ocr_raw_text?: string | null;
  ai_extracted_json?: any;
  status?: string;
  createdAt: string;
}

export interface OperatorTripDetail {
  id: string;
  ref_id: string | null;
  status: TripStatus;
  driver_workflow?: 'NATIVE' | 'EXTERNAL_APP';
  planned_distance: number | null;
  planned_start: string | null;
  actual_start: string | null;
  planned_end: string | null;
  actual_end: string | null;
  createdAt: string;
  customer: { id: string; name: string; contact_phone?: string | null; logo_url?: string | null } | null;
  driver: { id: string; first_name: string; last_name: string; phone_primary: string | null; ref_id: string | null } | null;
  vehicle: { id: string; plate_number: string; asset_type: string; ref_id: string | null; capacity_kg?: number | null } | null;
  stops: OperatorTripStop[];
  documents?: OperatorTripDocument[];

  // Co-driver — same DB columns/relation as the web dashboard's Trip type.
  co_driver_id?: string | null;
  coDriver?: { id: string; first_name: string; last_name: string; phone_primary?: string | null; ref_id?: string | null } | null;
  co_driver_payout?: number;

  // Financials — persisted Trip columns (backend/api-server/prisma/schema.prisma),
  // not re-derived here, so this can never disagree with the web dashboard.
  billing_amount?: number | null;
  applied_rate?: number | null;
  driver_payout?: number;
  driver_charge?: number;
  trip_charges?: number;
  paid_amount?: number;
  balance_due?: number | null;
  charges?: { id: string; charge_type: string; unit: string | null; rate: number; quantity: number; amount: number }[];

  // Line type / quotation — drives the Round Trip vs Single Trip label.
  quotation_line_type?: string | null;
  quotationId?: string | null;
  quotation?: { id?: string; name?: string | null; rate?: number | null; driver_payout?: number | null; pricing_basis?: string | null } | null;
  rateCard?: { name?: string | null; rate_category?: string | null; vehicle_type?: string | null } | null;

  // Third-party / subcontracted trips.
  is_third_party?: boolean;
  third_party_driver_name?: string | null;
  third_party_driver_phone?: string | null;
  third_party_vehicle_plate?: string | null;
  third_party_vehicle_type?: string | null;
  third_party_cost?: number | null;
}

export interface CreateTripStopInput {
  stop_type: 'Pickup' | 'Dropoff' | 'Stop' | 'Rest' | 'Refuel';
  stop_sequence?: number;
  leg_index?: number;
  lat?: number | null;
  lng?: number | null;
  planned_arrival?: string;
  location_name?: string;
  /** Set when the operator picked a saved Location via search, instead of typing raw coordinates. */
  location_id?: string;
}

export interface CreateTripInput {
  customer_id: string;
  // Optional — the backend supports "assign later" (tripController.ts
  // createTrip): a trip can be created with no driver/vehicle and dispatched
  // afterward, same as the web dashboard's "Assign Later" option.
  driver_id?: string;
  vehicle_id?: string;
  co_driver_id?: string;
  co_driver_payout?: number;
  planned_start?: string;

  /** What every delay/lateness figure is measured against — must be sent, not just stamped on the dropoff stop. */
  planned_end?: string;
  // Financials — same fields the web dashboard's create-trip wizard sends,
  // resolved from a matched quotation or entered manually when none matches.
  billing_amount?: number;
  trip_charges?: number;
  rate_card_id?: string;
  vehicle_type?: string;
  rate_category?: string;
  billing_type?: string;
  // Subcontractor / 3PL fields
  is_third_party?: boolean;
  third_party_provider_id?: string;
  third_party_driver_name?: string;
  third_party_driver_phone?: string;
  third_party_vehicle_plate?: string;
  third_party_cost?: number;
  charges?: { charge_type: string; rate: number; quantity: number; amount: number }[];
  stops: CreateTripStopInput[];
}

export interface OperatorThirdPartyProvider {
  id: string;
  name: string;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  isActive?: boolean;
  _count?: { subcontracts?: number };
}

/** A driver as the create-trip form needs them: status and assigned truck. */
export interface OperatorDriverOption extends OperatorDriver {
  assignedVehicleId?: string | null;
  assigned_vehicle_id?: string | null;
  assignedVehicle?: { id?: string; plate_number?: string | null; capacity_kg?: number | null; asset_type?: string | null } | null;
}

export interface OperatorVehicleOption extends OperatorVehicle {
  isActive?: boolean;
  assignedDriverId?: string | null;
  assigned_driver_id?: string | null;
}

export interface QuotationChange {
  id: string;
  old_rate?: number | string | null;
  new_rate?: number | string | null;
  old_driver_payout?: number | string | null;
  new_driver_payout?: number | string | null;
  changed_by_name?: string | null;
  changed_by?: string | null;
  reason?: string | null;
  source?: string | null;
  createdAt: string;
}

export interface LaneQuotation {
  id: string;
  quotation_number: string;
  customer_name: string;
  vehicle_class: string;
  line_type?: string | null;
  billing_type?: string | null;
  rate: number;
  driver_payout: number | null;
  updatedAt: string;
}

export interface RecommendedDriver {
  driverId: string;
  driverName: string;
  status: string;
  isAvailable: boolean;
  unavailabilityReason?: string;
  routeTripCount: number;
  capacityMatch: boolean;
  score: number;
  badges: string[];
  vehiclePlate?: string | null;
  vehicleClass?: string | null;
}

export interface OperatorLocation {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface QuotationLookupMatch {
  quotationId: string;
  rate: number;
  driverPayout: number;
}

/** A customer's quotation, as picked from a list — same fields the web
 * dashboard's quotation cards use to auto-fill a trip's route + rate. */
export interface OperatorQuotation {
  id: string;
  name: string;
  rate: number;
  driver_payout?: number | null;
  is_active?: boolean;
  vehicle_type?: string | null;
  vehicle_class?: string | null;
  line_type?: string | null;
  rate_category?: string | null;
  billing_type?: string | null;
  pricing_basis?: string | null;
  origin_name?: string | null;
  destination_name?: string | null;
  originLocationId?: string | null;
  destinationLocationId?: string | null;
  originLocation?: { id: string; name: string; lat?: number | null; lng?: number | null } | null;
  destinationLocation?: { id: string; name: string; lat?: number | null; lng?: number | null } | null;
  stops?: any[];
}

/** Helper to extract origin and destination location labels from a quotation object. */
export function getQuotationRoute(q: Partial<OperatorQuotation> & { stops?: any[] }): { origin: string; dest: string } {
  if (!q) return { origin: 'Origin', dest: 'Destination' };

  const isValid = (s: string | null | undefined): s is string => {
    if (!s || typeof s !== 'string') return false;
    const trimmed = s.trim();
    return trimmed.length > 0 && trimmed !== '—' && trimmed !== '--' && trimmed !== '---' && trimmed !== 'null';
  };

  let origin = isValid(q.originLocation?.name) ? q.originLocation!.name : isValid(q.origin_name) ? q.origin_name! : '';
  let dest = isValid(q.destinationLocation?.name) ? q.destinationLocation!.name : isValid(q.destination_name) ? q.destination_name! : '';

  if (isValid(origin) && isValid(dest)) {
    return { origin: origin.trim(), dest: dest.trim() };
  }

  // Check stops if present
  if (Array.isArray(q.stops) && q.stops.length > 0) {
    const firstStop = q.stops[0];
    const lastStop = q.stops[q.stops.length - 1];
    const firstLoc = firstStop?.location?.name || firstStop?.source_label || firstStop?.location_name || firstStop?.name || firstStop?.label;
    const lastLoc = lastStop?.location?.name || lastStop?.source_label || lastStop?.location_name || lastStop?.name || lastStop?.label;

    if (!isValid(origin) && isValid(firstLoc)) origin = firstLoc;
    if (!isValid(dest) && isValid(lastLoc)) dest = lastLoc;

    if (isValid(origin) && isValid(dest)) {
      return { origin: origin.trim(), dest: dest.trim() };
    }
  }

  // Parse from quotation title `q.name` (e.g. "Riyadh Dry Port → Dammam Port", "Jeddah -> Dammam")
  if (q.name && typeof q.name === 'string') {
    const cleanName = q.name.replace(/\s*\[.*?\]/g, '').trim();
    const parts = cleanName
      .split(/\s*(?:→|->|-->|–|-)\s*/)
      .map((s) => s.trim())
      .filter(isValid);

    if (parts.length >= 2) {
      if (!isValid(origin)) origin = parts[0];
      if (!isValid(dest)) dest = parts[parts.length - 1];
    } else if (parts.length === 1 && isValid(parts[0])) {
      if (!isValid(origin)) origin = parts[0];
      if (!isValid(dest)) dest = parts[0];
    }
  }

  return {
    origin: isValid(origin) ? origin.trim() : 'Origin',
    dest: isValid(dest) ? dest.trim() : 'Destination',
  };
}

export interface OperatorCustomer {
  id: string;
  name: string;
  contact_phone?: string;
  primary_contact_person?: string | null;
  primary_contact_phone?: string | null;
  logo_url?: string | null;
  avatar_url?: string | null;
  isActive?: boolean;
  createdAt?: string;
}

export interface CreateCustomerInput {
  name: string;
  contact_phone: string;
}

export interface UpdateCustomerInput {
  name?: string;
  contact_phone?: string;
  isActive?: boolean;
}

export interface OperatorDocument {
  id: string;
  entity_type: string;
  entity_id: string;
  doc_type: string;
  status: string;
  expiry_date: string | null;
}

export const ACTIVE_TRIP_STATUSES = ['Scheduled', 'Loading', 'InTransit', 'Delayed', 'Emergency'];

export const operatorService = {
  async summary(): Promise<DashboardSummary> {
    const { data } = await api.get('/reports/summary');
    return data.data as DashboardSummary;
  },

  async activeTrips(): Promise<OperatorTrip[]> {
    const { data } = await api.get('/trips', { params: { per_page: 50 } });
    const trips = (data.data ?? []) as OperatorTrip[];
    return trips.filter((t) => ACTIVE_TRIP_STATUSES.includes(t.status));
  },

  async trips(): Promise<OperatorTrip[]> {
    const { data } = await api.get('/trips', { params: { per_page: 100 } });
    return (data.data ?? []) as OperatorTrip[];
  },

  async drivers(): Promise<OperatorDriver[]> {
    const { data } = await api.get('/drivers', { params: { per_page: 100 } });
    return (data.data ?? []) as OperatorDriver[];
  },

  async vehicles(): Promise<OperatorVehicle[]> {
    const { data } = await api.get('/vehicles', { params: { per_page: 100 } });
    return (data.data ?? []) as OperatorVehicle[];
  },

  async invoices(): Promise<OperatorInvoice[]> {
    const { data } = await api.get('/invoices', { params: { per_page: 100 } });
    return (data.data ?? []) as OperatorInvoice[];
  },

  async tripById(id: string): Promise<OperatorTripDetail> {
    const { data } = await api.get(`/trips/${id}`);
    const tripDetail = data.data as OperatorTripDetail;

    if (!tripDetail.documents || tripDetail.documents.length === 0) {
      try {
        const docRes = await api.get('/documents', {
          params: { entity_type: 'Trip', entity_id: tripDetail.id || id, per_page: 50 },
        });
        const docs = docRes.data?.data || [];
        if (docs.length > 0) {
          tripDetail.documents = docs;
        }
      } catch {
        // silent fallback
      }
    }

    return tripDetail;
  },

  async uploadTripPhoto(tripId: string, uri: string, kind: 'pod' | 'cargo' | 'delay' = 'pod'): Promise<any> {
    const formData = new FormData();
    const filename = uri.split('/').pop() || 'media.jpg';
    const match = /\.(\w+)$/.exec(filename);
    const isVideo = /\.(mp4|mov|webm|avi|mkv|3gp)$/i.test(filename);
    const type = isVideo ? 'video/mp4' : (match ? `image/${match[1]}` : 'image/jpeg');

    formData.append('file', {
      uri,
      name: filename,
      type,
    } as any);
    formData.append('kind', kind);

    const { data } = await api.post(`/trips/${tripId}/photo`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },

  async customers(): Promise<OperatorCustomer[]> {
    const { data } = await api.get('/customers', { params: { per_page: 100 } });
    return (data.data ?? []) as OperatorCustomer[];
  },

  async customerById(id: string): Promise<OperatorCustomer> {
    const { data } = await api.get(`/customers/${id}`);
    return data.data as OperatorCustomer;
  },

  async createCustomer(payload: CreateCustomerInput): Promise<OperatorCustomer> {
    const { data } = await api.post('/customers', payload);
    return data.data as OperatorCustomer;
  },

  async updateCustomer(id: string, payload: UpdateCustomerInput): Promise<OperatorCustomer> {
    const { data } = await api.patch(`/customers/${id}`, payload);
    return data.data as OperatorCustomer;
  },

  async availableDrivers(): Promise<OperatorDriver[]> {
    const { data } = await api.get('/drivers', { params: { per_page: 100, status: 'Available' } });
    return (data.data ?? []) as OperatorDriver[];
  },

  async availableVehicles(): Promise<OperatorVehicle[]> {
    const { data } = await api.get('/vehicles', { params: { per_page: 100, status: 'Available' } });
    return (data.data ?? []) as OperatorVehicle[];
  },

  async createTrip(payload: CreateTripInput): Promise<OperatorTripDetail> {
    const { data } = await api.post('/trips', payload);
    return data.data as OperatorTripDetail;
  },

  async bulkCreateTrips(rows: CreateTripInput[]): Promise<{ imported: number; failed: number; results?: any[] }> {
    const { data } = await api.post('/trips/bulk-import', { rows });
    return data;
  },

  /** Same `/locations` endpoint the web dashboard's location combobox uses — Locations are customer-scoped. */
  async locations(customerId?: string): Promise<OperatorLocation[]> {
    const { data } = await api.get('/locations', {
      params: { per_page: 250, active_only: 'true', ...(customerId ? { customerId } : {}) },
    });
    return (data.data ?? []) as OperatorLocation[];
  },

  async searchLocations(customerId: string, query: string): Promise<OperatorLocation[]> {
    if (!customerId || !query.trim()) return [];
    const { data } = await api.get('/locations', { params: { customerId, search: query.trim(), active_only: true } });
    return (data.data ?? []) as OperatorLocation[];
  },

  async createLocation(payload: {
    name: string;
    city?: string;
    address?: string;
    customer_id?: string;
    lat?: number;
    lng?: number;
  }): Promise<OperatorLocation> {
    const { data } = await api.post('/locations', payload);
    return data.data as OperatorLocation;
  },

  async thirdPartyProviders(): Promise<OperatorThirdPartyProvider[]> {
    const { data } = await api.get('/third-party-providers', { params: { per_page: 100 } });
    return (data.data ?? []) as OperatorThirdPartyProvider[];
  },

  /** Same `/quotations` list endpoint the web dashboard's create-trip wizard
   * uses to show a customer's quotations as pickable cards — selecting one
   * fills the whole route + rate in one action, same as the web flow's
   * `onApplyRateCard`. */
  async getQuotationsForCustomer(customerId: string): Promise<OperatorQuotation[]> {
    if (!customerId) return [];
    const { data } = await api.get('/quotations', { params: { customerId, active_only: 'true', per_page: 50 } });
    return (data.data ?? []) as OperatorQuotation[];
  },

  async createQuotation(payload: {
    customer_id: string;
    name?: string;
    origin_name?: string;
    origin_location_id?: string;
    destination_name?: string;
    destination_location_id?: string;
    rate: number;
    driver_payout?: number;
    vehicle_type?: string;
    rate_category?: string;
    billing_type?: string;
    pricing_basis?: string;
  }): Promise<OperatorQuotation> {
    const { data } = await api.post('/quotations', payload);
    return data.data as OperatorQuotation;
  },

  /* ─── Create trip (same endpoints and parameters as the web wizard) ─── */

  /** Every driver with their assigned truck — the web wizard's `mode: 'lookup'` list. */
  async driversLookup(): Promise<OperatorDriverOption[]> {
    const { data } = await api.get('/drivers', { params: { per_page: 1000, mode: 'lookup' } });
    const list = Array.isArray(data?.data) ? data.data : Array.isArray(data?.data?.data) ? data.data.data : [];
    return list as OperatorDriverOption[];
  },

  async vehiclesLookup(): Promise<OperatorVehicleOption[]> {
    const { data } = await api.get('/vehicles', { params: { per_page: 1000, mode: 'lookup' } });
    return (data.data ?? []) as OperatorVehicleOption[];
  },

  /** All active quotations of one customer (the cards on step 1). */
  async customerQuotations(customerId: string): Promise<OperatorQuotation[]> {
    if (!customerId) return [];
    const { data } = await api.get('/quotations', { params: { customerId, customer_id: customerId, active_only: 'true', per_page: 'all' } });
    const list = (data.data ?? []) as OperatorQuotation[];
    return list.filter((q: any) => (q.customerId ?? q.customer_id ?? q.customer?.id ?? customerId) === customerId && q.is_active !== false);
  },

  /** Server-side quotation match for the exact route (every stop). Null when nothing matches or on error. */
  async lookupRouteQuotation(params: {
    customer_id: string;
    origin_location_id: string;
    destination_location_id: string;
    vehicle_type?: string;
    line_type?: string;
    billing_type?: string;
    planned_start?: string;
    stops: any[];
  }): Promise<OperatorQuotation | null> {
    try {
      const { data } = await api.get('/quotations/lookup', {
        params: { ...params, stops: JSON.stringify(params.stops) },
      });
      return (data?.data?.quotation || data?.data?.rate_card || null) as OperatorQuotation | null;
    } catch {
      return null;
    }
  },

  /** Drivers ranked for this route and truck class by the server (same as the web). */
  async recommendedDrivers(params: { origin?: string; destination?: string; vehicleClass?: string; vehicleId?: string }): Promise<RecommendedDriver[]> {
    try {
      const { data } = await api.get('/trips/recommendations/drivers', { params });
      return (data?.data ?? []) as RecommendedDriver[];
    } catch {
      return [];
    }
  },

  /** The deployment timezone trip times are entered in (Settings.timezone). */
  async deploymentTimezone(): Promise<string> {
    try {
      const { data } = await api.get('/settings/public');
      return data?.data?.timezone || 'Asia/Riyadh';
    } catch {
      return 'Asia/Riyadh';
    }
  },

  /**
   * Road route through points in order (MERCON's routing service, OSRM behind it),
   * with the drive time of each leg. Null when routing is unavailable.
   */
  async roadRoute(points: { lat: number; lng: number }[]): Promise<{ legs: { durationSeconds: number; distanceMeters: number }[]; durationSeconds: number; distanceMeters: number } | null> {
    try {
      const { data } = await api.get('/vehicles/live-map/route', {
        params: { points: points.map((p) => `${p.lat},${p.lng}`).join(';') },
        timeout: 10_000,
      });
      const r = data?.data;
      return r && Array.isArray(r.legs) ? r : null;
    } catch {
      return null;
    }
  },

  /** Rate / driver-payout changes made to one quotation, newest first. */
  async quotationHistory(id: string): Promise<QuotationChange[]> {
    const { data } = await api.get(`/quotations/${id}/history`);
    return (data?.data ?? []) as QuotationChange[];
  },

  /** Every quotation priced on the same origin → destination (same as the web's "Rate history"). */
  async laneQuotations(params: { origin: string; destination: string; vehicleClass?: string; customerId?: string }): Promise<LaneQuotation[]> {
    const { data } = await api.get('/quotations/lane-history', { params });
    return (data?.data ?? []) as LaneQuotation[];
  },

  async createQuotationRaw(payload: Record<string, unknown>): Promise<OperatorQuotation> {
    const { data } = await api.post('/quotations', payload);
    return data.data as OperatorQuotation;
  },

  async bulkImportTrips(rows: unknown[]): Promise<{ imported: number; failed: number; results: Array<{ row: number; success: boolean; error?: string; created_id?: string }> }> {
    const { data } = await api.post('/trips/bulk-import', { rows });
    return data.data;
  },

  /** Same `/quotations/lookup` endpoint the web dashboard's create-trip
   * wizard uses to auto-fill a rate. Swallows errors/no-match and returns
   * null so the screen can fall back to manual entry rather than block. */
  async lookupQuotation(params: {
    customer_id?: string;
    origin_location_id?: string;
    destination_location_id?: string;
    vehicle_type?: string;
    rate_category?: string;
    billing_type?: string;
  }): Promise<QuotationLookupMatch | null> {
    try {
      const { data } = await api.get('/quotations/lookup', {
        params: {
          ...(params.customer_id ? { customer_id: params.customer_id } : {}),
          ...(params.origin_location_id ? { origin_location_id: params.origin_location_id } : {}),
          ...(params.destination_location_id ? { destination_location_id: params.destination_location_id } : {}),
          ...(params.vehicle_type ? { vehicle_type: params.vehicle_type } : {}),
          ...(params.rate_category ? { rate_category: params.rate_category } : {}),
          ...(params.billing_type ? { billing_type: params.billing_type } : {}),
        },
      });
      const quotation = data?.data?.quotation;
      if (!quotation?.id) return null;
      return {
        quotationId: quotation.id,
        rate: Number(quotation.rate ?? 0),
        driverPayout: Number(quotation.driver_payout ?? 0),
      };
    } catch {
      return null;
    }
  },

  async vehicleDocuments(): Promise<OperatorDocument[]> {
    const { data } = await api.get('/documents', { params: { entity_type: 'Vehicle', per_page: 100 } });
    return (data.data ?? []) as OperatorDocument[];
  },

  async driverById(id: string): Promise<OperatorDriver> {
    const { data } = await api.get(`/drivers/${id}`);
    return data.data as OperatorDriver;
  },

  async vehicleById(id: string): Promise<OperatorVehicle> {
    const { data } = await api.get(`/vehicles/${id}`);
    return data.data as OperatorVehicle;
  },

  async updateDriver(id: string, payload: UpdateDriverInput): Promise<OperatorDriver> {
    const { data } = await api.patch(`/drivers/${id}`, payload);
    return data.data as OperatorDriver;
  },

  async updateVehicle(id: string, payload: UpdateVehicleInput): Promise<OperatorVehicle> {
    const { data } = await api.patch(`/vehicles/${id}`, payload);
    return data.data as OperatorVehicle;
  },

  async updateInvoiceStatus(id: string, status: string): Promise<OperatorInvoice> {
    const { data } = await api.patch(`/invoices/${id}/status`, { status });
    return data.data as OperatorInvoice;
  },

  /** Generic trip status transition — drives most of the trip lifecycle. */
  async updateTripStatus(id: string, status: string): Promise<OperatorTripDetail> {
    const { data } = await api.patch(`/trips/${id}/status`, { status });
    return data.data as OperatorTripDetail;
  },

  /** Stamps the pickup stop's actual arrival time in addition to the status change. */
  async pickupArrive(id: string): Promise<OperatorTripDetail> {
    const { data } = await api.post(`/trips/${id}/pickup/arrive`);
    return data.data as OperatorTripDetail;
  },

  async replaceDriver(id: string, newDriverId: string): Promise<OperatorTripDetail> {
    const { data } = await api.post(`/trips/${id}/replace-driver`, { new_driver_id: newDriverId });
    return data.data as OperatorTripDetail;
  },

  /** Reassign only the vehicle — same `/dispatch` endpoint the web dashboard's
   * ReassignTripModal calls for a vehicle-only reassignment. */
  async replaceVehicle(id: string, newVehicleId: string): Promise<OperatorTripDetail> {
    const { data } = await api.post(`/trips/${id}/dispatch`, { vehicle_id: newVehicleId });
    return data.data as OperatorTripDetail;
  },

  /** Confirm or correct the real time an EXTERNAL_APP evidence screenshot
   * happened at — same endpoint/columns the web dashboard's time-confirmation
   * panel uses. Omit a field to leave that timestamp as recorded. */
  async confirmEvidenceTime(
    tripId: string,
    stopId: string,
    payload: { document_id: string; actual_arrival?: string; actual_departure?: string }
  ): Promise<OperatorTripStop> {
    const { data } = await api.patch(`/trips/${tripId}/stops/${stopId}/confirm-time`, payload);
    return data.data as OperatorTripStop;
  },

  async quotations(): Promise<OperatorQuotation[]> {
    const { data } = await api.get('/quotations', { params: { per_page: 50 } });
    return (data.data ?? []) as OperatorQuotation[];
  },

  async maintenanceRecords(): Promise<OperatorMaintenanceRecord[]> {
    const { data } = await api.get('/maintenance', { params: { per_page: 50 } });
    return (data.data ?? []) as OperatorMaintenanceRecord[];
  },

  async expenses(): Promise<OperatorExpense[]> {
    const { data } = await api.get('/expenses', { params: { per_page: 50 } });
    return (data.data ?? []) as OperatorExpense[];
  },

  async documents(): Promise<OperatorDocument[]> {
    const { data } = await api.get('/documents', { params: { per_page: 50 } });
    return (data.data ?? []) as OperatorDocument[];
  },
};

export interface OperatorInvoice {
  id: string;
  ref_id: string | null;
  status: string;
  currency: string;
  total_amount: number;
  due_date: string;
  createdAt: string;
  customer?: { name: string } | null;
  trip?: { ref_id: string | null } | null;
}

export interface OperatorVehicle {
  id: string;
  ref_id: string | null;
  plate_number: string;
  asset_type: string;
  status: string;
  capacity_kg: number;
  current_odometer: number;
}

export interface OperatorDriver {
  id: string;
  ref_id: string | null;
  first_name: string;
  last_name: string;
  phone_primary: string | null;
  status: string;
  license_number: string;
  license_expiry: string;
  avatar_url?: string | null;
  photo_url?: string | null;
  assigned_vehicle?: { plate_number?: string | null } | null;
  current_vehicle?: { plate_number?: string | null } | null;
}


export interface UpdateDriverInput {
  first_name?: string;
  last_name?: string;
  phone_primary?: string;
  license_number?: string;
  license_expiry?: string;
  status?: 'Available' | 'OnTrip' | 'OffDuty' | 'Inactive';
}

export interface UpdateVehicleInput {
  plate_number?: string;
  asset_type?: 'Flatbed' | 'Reefer' | 'Box' | 'Tanker';
  capacity_kg?: number;
  status?: 'Available' | 'OnTrip' | 'Maintenance' | 'Inactive';
}

let cacheOperatorTrips: OperatorTrip[] = [];
let isOpTripsFetched = false;

/** Forces the next `useOperatorTrips` mount/refetch to hit the API again. */
export function invalidateOperatorTrips() {
  isOpTripsFetched = false;
}

/** Loads all recent trips for the operator trip list. */
export function useOperatorTrips() {
  const [trips, setTrips] = useState<OperatorTrip[]>(cacheOperatorTrips);
  const [loading, setLoading] = useState(!isOpTripsFetched);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async (opts?: { showLoading?: boolean } | any) => {
    const showLoading = typeof opts === 'boolean' ? opts : typeof opts?.showLoading === 'boolean' ? opts.showLoading : !isOpTripsFetched;
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const data = await operatorService.trips();
      cacheOperatorTrips = data;
      isOpTripsFetched = true;
      setTrips(data);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  return { trips, loading, error, refetch };
}

let cacheOperatorDrivers: OperatorDriver[] = [];
let isOpDriversFetched = false;

/** Forces the next `useOperatorDrivers` mount/refetch to hit the API again. */
export function invalidateOperatorDrivers() {
  isOpDriversFetched = false;
}

/** Loads all drivers for the operator driver list. */
export function useOperatorDrivers() {
  const [drivers, setDrivers] = useState<OperatorDriver[]>(cacheOperatorDrivers);
  const [loading, setLoading] = useState(!isOpDriversFetched);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async (opts?: { showLoading?: boolean } | any) => {
    const showLoading = typeof opts === 'boolean' ? opts : typeof opts?.showLoading === 'boolean' ? opts.showLoading : !isOpDriversFetched;
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const data = await operatorService.drivers();
      cacheOperatorDrivers = data;
      isOpDriversFetched = true;
      setDrivers(data);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  return { drivers, loading, error, refetch };
}

let cacheOperatorVehicles: OperatorVehicle[] = [];
let isOpVehiclesFetched = false;

/** Forces the next `useOperatorVehicles` mount/refetch to hit the API again. */
export function invalidateOperatorVehicles() {
  isOpVehiclesFetched = false;
}

/** Loads all vehicles for the operator vehicle list. */
export function useOperatorVehicles() {
  const [vehicles, setVehicles] = useState<OperatorVehicle[]>(cacheOperatorVehicles);
  const [loading, setLoading] = useState(!isOpVehiclesFetched);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async (opts?: { showLoading?: boolean } | any) => {
    const showLoading = typeof opts === 'boolean' ? opts : typeof opts?.showLoading === 'boolean' ? opts.showLoading : !isOpVehiclesFetched;
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const data = await operatorService.vehicles();
      cacheOperatorVehicles = data;
      isOpVehiclesFetched = true;
      setVehicles(data);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  return { vehicles, loading, error, refetch };
}

export interface VehicleRenewal {
  documentId: string;
  vehiclePlate: string;
  docType: string;
  status: string;
  expiryDate: string | null;
  daysLeft: number | null;
}

/** Joins vehicle documents with their vehicle's plate number for the renewals screen. */
export function useOperatorVehicleRenewals() {
  const [renewals, setRenewals] = useState<VehicleRenewal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [documents, vehicles] = await Promise.all([
        operatorService.vehicleDocuments(),
        operatorService.vehicles(),
      ]);
      const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
      const now = Date.now();
      // Documents whose vehicle no longer exists (e.g. deleted from the fleet)
      // are dropped — there's nothing to renew for a vehicle that's gone.
      const joined = documents
        .filter((doc) => vehicleById.has(doc.entity_id))
        .map((doc): VehicleRenewal => {
          const vehicle = vehicleById.get(doc.entity_id)!;
          const daysLeft = doc.expiry_date
            ? Math.ceil((new Date(doc.expiry_date).getTime() - now) / (1000 * 60 * 60 * 24))
            : null;
          return {
            documentId: doc.id,
            vehiclePlate: vehicle.plate_number,
            docType: doc.doc_type,
            status: doc.status,
            expiryDate: doc.expiry_date,
            daysLeft,
          };
        });
      setRenewals(joined);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  return { renewals, loading, error, refetch };
}

let cacheOperatorInvoices: OperatorInvoice[] = [];
let isOpInvoicesFetched = false;

/** Forces the next `useOperatorInvoices` mount/refetch to hit the API again. */
export function invalidateOperatorInvoices() {
  isOpInvoicesFetched = false;
}

/** Loads all invoices for the operator invoice list. */
export function useOperatorInvoices() {
  const [invoices, setInvoices] = useState<OperatorInvoice[]>(cacheOperatorInvoices);
  const [loading, setLoading] = useState(!isOpInvoicesFetched);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async (opts?: { showLoading?: boolean } | any) => {
    const showLoading = typeof opts === 'boolean' ? opts : typeof opts?.showLoading === 'boolean' ? opts.showLoading : !isOpInvoicesFetched;
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const data = await operatorService.invoices();
      cacheOperatorInvoices = data;
      isOpInvoicesFetched = true;
      setInvoices(data);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  return { invoices, loading, error, refetch };
}

let cacheOperatorCustomers: OperatorCustomer[] = [];
let isOpCustomersFetched = false;

/** Forces the next `useOperatorCustomers` mount/refetch to hit the API again. */
export function invalidateOperatorCustomers() {
  isOpCustomersFetched = false;
}

/** Loads all customers for the operator customer list. */
export function useOperatorCustomers() {
  const [customers, setCustomers] = useState<OperatorCustomer[]>(cacheOperatorCustomers);
  const [loading, setLoading] = useState(!isOpCustomersFetched);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async (opts?: { showLoading?: boolean } | any) => {
    const showLoading = typeof opts === 'boolean' ? opts : typeof opts?.showLoading === 'boolean' ? opts.showLoading : !isOpCustomersFetched;
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const data = await operatorService.customers();
      cacheOperatorCustomers = data;
      isOpCustomersFetched = true;
      setCustomers(data);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  return { customers, loading, error, refetch };
}

/** Loads a single customer's detail for the operator customer edit screen. */
export function useOperatorCustomerById(id: string | undefined) {
  const [customer, setCustomer] = useState<OperatorCustomer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await operatorService.customerById(id);
      setCustomer(data);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { refetch(); }, [refetch]);

  return { customer, loading, error, refetch };
}

/** Loads a single trip's full detail for the operator trip details screen. */
export function useOperatorTripById(id: string | undefined) {
  const [trip, setTrip] = useState<OperatorTripDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await operatorService.tripById(id);
      setTrip(data);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { refetch(); }, [refetch]);

  return { trip, loading, error, refetch };
}

/** Loads a single driver's detail for the operator driver edit screen. */
export function useOperatorDriverById(id: string | undefined) {
  const [driver, setDriver] = useState<OperatorDriver | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await operatorService.driverById(id);
      setDriver(data);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { refetch(); }, [refetch]);

  return { driver, loading, error, refetch };
}

/** Loads a single vehicle's detail for the operator vehicle edit screen. */
export function useOperatorVehicleById(id: string | undefined) {
  const [vehicle, setVehicle] = useState<OperatorVehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await operatorService.vehicleById(id);
      setVehicle(data);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { refetch(); }, [refetch]);

  return { vehicle, loading, error, refetch };
}

export interface OperatorMaintenanceRecord {
  id: string;
  ref_id?: string | null;
  maintenance_type?: string | null;
  status: string;
  cost?: number | null;
  scheduled_date?: string | null;
  completed_date?: string | null;
  description?: string | null;
  vehicle_plate?: string | null;
  vehicle?: { id: string; plate_number: string } | null;
  createdAt?: string;
}

export interface OperatorExpense {
  id: string;
  ref_id?: string | null;
  category: string;
  amount: number;
  status: string;
  expense_date?: string | null;
  description?: string | null;
  createdAt?: string;
}

let cacheOperatorSummary: DashboardSummary | null = null;
let cacheOperatorActiveTrips: OperatorTrip[] = [];
let isOpDashboardFetched = false;

/** Loads the operator dashboard (KPIs + active trips) with a manual refetch. */
export function useOperatorDashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(cacheOperatorSummary);
  const [activeTrips, setActiveTrips] = useState<OperatorTrip[]>(cacheOperatorActiveTrips);
  const [loading, setLoading] = useState(!isOpDashboardFetched);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async (opts?: { showLoading?: boolean } | any) => {
    const showLoading = typeof opts === 'boolean' ? opts : typeof opts?.showLoading === 'boolean' ? opts.showLoading : !isOpDashboardFetched;
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const [s, t] = await Promise.all([operatorService.summary(), operatorService.activeTrips()]);
      cacheOperatorSummary = s;
      cacheOperatorActiveTrips = t;
      isOpDashboardFetched = true;
      setSummary(s);
      setActiveTrips(t);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  return { summary, activeTrips, loading, error, refetch };
}

export function useOperatorQuotations() {
  const [quotations, setQuotations] = useState<OperatorQuotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await operatorService.quotations();
      setQuotations(data);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  return { quotations, loading, error, refetch };
}

export function useOperatorThirdPartyProviders() {
  const [providers, setProviders] = useState<OperatorThirdPartyProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await operatorService.thirdPartyProviders();
      setProviders(data);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  return { providers, loading, error, refetch };
}

export function useOperatorMaintenanceRecords() {
  const [records, setRecords] = useState<OperatorMaintenanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await operatorService.maintenanceRecords();
      setRecords(data);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  return { records, loading, error, refetch };
}

export function useOperatorExpenses() {
  const [expenses, setExpenses] = useState<OperatorExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await operatorService.expenses();
      setExpenses(data);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  return { expenses, loading, error, refetch };
}

export function useOperatorDocuments() {
  const [documents, setDocuments] = useState<OperatorDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await operatorService.documents();
      setDocuments(data);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  return { documents, loading, error, refetch };
}

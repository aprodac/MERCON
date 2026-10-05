/**
 * Operator data — reuses the same backend endpoints the web dashboard uses
 * (operators authenticate with role Operator, which those routes allow).
 *   GET /reports/summary  → dashboard KPIs
 *   GET /trips            → trips (filtered here to active ones)
 */
import { useCallback, useEffect, useState } from 'react';
import { api, getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import type { TripStatus } from '@mercon/mobile-shared/lib/trips';
import type { DriverGroup, DriverReason } from '@mercon/shared-types';

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
  planned_end?: string | null;
  actual_start?: string | null;
  actual_end?: string | null;
  createdAt?: string;
  updatedAt?: string;
  is_third_party?: boolean;
  driver_workflow?: string | null;
  customer?: { id?: string; name: string; logo_url?: string | null } | null;
  driver?: { id?: string; first_name: string; last_name: string; avatar_url?: string | null; phone_primary?: string | null } | null;
  vehicle?: { id?: string; plate_number: string; ref_id?: string | null; asset_type?: string } | null;
  subcontract?: { driverName?: string | null; driverPhone?: string | null; vehiclePlate?: string | null; provider?: { name?: string | null } | null } | null;
  stops?: any[];
}

export interface OperatorTripStop {
  id: string;
  stop_sequence: number;
  leg_index?: number;
  stop_type: string;
  location_lat: number;
  location_lng: number;
  /** EXACT, or a guess (APPROXIMATE / UNKNOWN / null) that still needs a pin. */
  location_coordinate_precision?: 'EXACT' | 'APPROXIMATE' | 'UNKNOWN' | null;
  location_name: string | null;
  /** The saved place, when the stop was picked from Locations. */
  location?: { id?: string; name?: string | null; code?: string | null; city?: string | null } | null;
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
  title?: string | null;
  documentType?: { name?: string | null } | null;
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
  updatedAt?: string;
  awb_number?: string | null;
  customer: {
    id: string;
    name: string;
    contact_phone?: string | null;
    contact_person?: string | null;
    whatsapp_number?: string | null;
    whatsapp_group_name?: string | null;
    logo_url?: string | null;
    /** The people who usually ask for trucks — offered as the @tag in the assignment message. */
    primary_contact_person?: string | null;
    primary_contact_phone?: string | null;
    secondary_contact_person?: string | null;
    secondary_contact_phone?: string | null;
  } | null;
  driver: {
    id: string;
    first_name: string;
    last_name: string;
    phone_primary: string | null;
    ref_id: string | null;
    avatar_url?: string | null;
    status?: string | null;
  } | null;
  vehicle: {
    id: string;
    plate_number: string;
    asset_type: string;
    ref_id: string | null;
    capacity_kg?: number | null;
    image_url?: string | null;
    trailer_number?: string | null;
    icces_device_id?: string | null;
    has_tailgate?: boolean;
  } | null;
  stops: OperatorTripStop[];
  documents?: OperatorTripDocument[];
  /** Photos/videos removed by the 60-day retention job (null when none). */
  media_purged?: { count: number; purged_at: string; retention_days: number } | null;

  // Co-driver — same DB columns/relation as the web dashboard's Trip type.
  co_driver_id?: string | null;
  coDriver?: { id: string; first_name: string; last_name: string; phone_primary?: string | null; ref_id?: string | null; avatar_url?: string | null } | null;
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
  charges?: OperatorTripCharge[];
  extra_driver_payment?: number | null;
  pricing_basis?: string | null;

  // Line type / quotation — drives the Round Trip vs Single Trip label.
  quotation_line_type?: string | null;
  quotationId?: string | null;
  quotation?: { id?: string; name?: string | null; rate?: number | null; driver_payout?: number | null; pricing_basis?: string | null } | null;
  rateCard?: { name?: string | null; rate_category?: string | null; vehicle_type?: string | null } | null;
  /** Truck class and trip type as booked ("5 TON", "SINGLE_TRIP"). */
  vehicle_type?: string | null;
  rate_category?: string | null;

  // Third-party / subcontracted trips.
  is_third_party?: boolean;
  third_party_driver_name?: string | null;
  third_party_driver_phone?: string | null;
  third_party_vehicle_plate?: string | null;
  third_party_vehicle_type?: string | null;
  third_party_cost?: number | null;
}

export interface OperatorTripCharge {
  id?: string;
  surchargeRuleId?: string | null;
  charge_type: string;
  unit: string | null;
  rate: number;
  quantity: number;
  amount: number;
}

/** Same shape as the web's `fleetLiveService` types (backend services/fleetLiveMap.ts). */
export type TripPhase = 'planned' | 'active' | 'done' | 'cancelled';
export type LiveMediaStage = 'loaded' | 'arrived' | 'stop' | 'delivered' | 'delay' | 'other';

/** Mirrors `LiveGpsFix` in backend services/fleetLiveMap.ts (field names as the API sends them). */
export interface LiveGpsFix {
  lat: number;
  lng: number;
  heading_deg?: number | null;
  speed_kph?: number | null;
  accuracy_m?: number | null;
  recorded_at: string;
  fresh: boolean;
}

export interface TripOverview {
  trip_id: string;
  status: string;
  phase: TripPhase;
  next_stop_index: number | null;
  unit: {
    vehicle?: { has_tracker?: boolean } | null;
    vehicle_gps: LiveGpsFix | null;
    driver_gps: LiveGpsFix | null;
    position: (LiveGpsFix & { source: 'vehicle' | 'driver' }) | null;
  } | null;
  /** [lng, lat] points driven, oldest first. */
  path: [number, number][];
  path_distance_m: number | null;
  checks: {
    driver_assigned: boolean;
    truck_assigned: boolean;
    third_party: boolean;
    expiring: { entity: 'Truck' | 'Driver'; name: string; label: string; expiry_date: string; expired: boolean }[];
  } | null;
}

export interface LiveMediaItem {
  id: string;
  kind: 'photo' | 'video';
  stage: LiveMediaStage;
  url: string;
  mime: string | null;
  captured_at: string;
}

export type ShareRecipient = 'customer_contact' | 'customer_group' | 'internal' | 'other';

/** One step's photos from the driver (backend services/operatorInbox.ts). */
export interface DriverUpdate {
  key: string;
  trip: { id: string; ref_id: string | null; status: string; route: string };
  customer: {
    name: string;
    whatsapp_number: string | null;
    contact_person: string | null;
    contact_phone: string | null;
    group_name: string | null;
    group_link: string | null;
  } | null;
  vehicle_plate: string | null;
  driver: { name: string; phone: string | null } | null;
  stop: { id: string; name: string; type: string; sequence: number } | null;
  stage: LiveMediaStage;
  items: LiveMediaItem[];
  delay_note: string | null;
  latest_at: string;
  shares: { id: string; recipient: ShareRecipient; channel: 'link' | 'whatsapp_api'; shared_by: string | null; shared_at: string; count: number }[];
  sent_ids: string[];
  unsent_count: number;
}

export interface ShareResult {
  share_url: string;
  text: string;
  whatsapp_url: string;
  sent_via_api: boolean;
  headline: string;
}

/** A truck / driver on the live map with its running trip (backend services/fleetLiveMap.ts). */
export interface LiveUnit {
  key: string;
  vehicle: { id: string; ref_id: string | null; plate_number: string; asset_type: string; status: string; image_url: string | null; has_tracker: boolean } | null;
  /** `status` is the driver's own (Available / OnTrip / …) — used to rank trucks for a trip. */
  driver: { id: string; ref_id: string | null; name: string; phone: string | null; avatar_url: string | null; status?: string | null } | null;
  trip: {
    id: string;
    ref_id: string | null;
    status: string;
    phase: 'upcoming' | 'active' | 'delayed';
    customer_name: string | null;
    planned_start: string | null;
    planned_end: string | null;
    stops: { id: string; sequence: number; type: string; name: string | null; address: string | null; lat: number | null; lng: number | null; planned_arrival: string | null; actual_arrival: string | null; actual_departure: string | null }[];
    next_stop_index: number | null;
  } | null;
  vehicle_gps: LiveGpsFix | null;
  driver_gps: LiveGpsFix | null;
  position: (LiveGpsFix & { source: 'vehicle' | 'driver' }) | null;
  feeds_gap_m?: number | null;
  /** Which GPS feeds are live, and whether the truck is moving (same as the web live map). */
  feed?: 'both' | 'vehicle' | 'driver' | 'none';
  motion?: 'moving' | 'idle' | 'stale' | 'no_signal';
}

/** What a driver sent from a trip's stops (backend services/fleetLiveMap.ts `LiveTripMedia`). */
export interface TripMediaItem {
  id: string;
  /** A delivery note (POD) as well as photos and videos. */
  kind: 'pod' | 'photo' | 'video';
  stage: LiveMediaStage;
  url: string;
  mime: string | null;
  captured_at: string;
}
export interface LiveTripMedia {
  stops: { stop_id: string; sequence: number; delay: { reason: string | null; note: string | null; logged_at: string | null } | null; media: TripMediaItem[] }[];
  /** Uploads that can't be tied to a stop (older driver-app builds). */
  unplaced: TripMediaItem[];
}

/** A document or licence that has expired or expires soon (backend services/operatorInbox.ts). */
export interface ExpiryItem {
  key: string;
  entity_type: 'Vehicle' | 'Driver' | 'Customer' | 'Company' | 'Other';
  entity_id: string;
  entity_name: string;
  label: string;
  expiry_date: string;
  /** Whole days until expiry; negative once expired. */
  days: number;
  document_id: string | null;
  document_type_id: string | null;
  doc_type: string | null;
  contact: { name: string; phone: string } | null;
  on_trip_ref: string | null;
}


export type TripDocKind = 'POD' | 'Waybill' | 'Emergency' | 'CustomsClearance' | 'Invoice' | 'Contract';

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
  address?: string | null;
  tax_id?: string | null;
  notes?: string | null;
  rating?: number | null;
  isActive?: boolean;
  _count?: { subcontracts?: number };
  // Computed by the API (thirdPartyController), not stored columns.
  total_trips?: number;
  active_trips?: number;
  total_cost?: number | string;
  createdAt?: string;
  /** Only on GET /third-party-providers/:id — the provider's 20 most recent trips, each with what the carrier is paid for it. */
  trips?: (OperatorTrip & { third_party_cost?: number | string | null })[];
}

/** One negotiated price with a carrier (GET /third-party-providers/:id/rates). */
export interface OperatorProviderRate {
  id: string;
  origin_city: string;
  destination_city: string;
  originLocation?: { id: string; name: string; city?: string | null } | null;
  destinationLocation?: { id: string; name: string; city?: string | null } | null;
  vehicle_class: string;
  line_type: string;
  operation_type?: string | null;
  pricing_basis: string;
  cost: number | string;
  valid_from?: string | null;
  valid_to?: string | null;
  /** "active", "expired" or "archived". */
  status: string;
}

export interface ThirdPartyProviderInput {
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  tax_id?: string;
  notes?: string;
  isActive?: boolean;
}

export interface ThirdPartyStats {
  total: number;
  active: number;
  inactive: number;
  total_trips: number;
  total_cost: number;
}

/** PUT /trips/:id/stops — the whole route is replaced, so every stop is sent. */
export interface UpdateTripRouteInput {
  stops: {
    stop_type: string;
    leg_index: number;
    location_id?: string | null;
    location_name: string;
    lat?: number | null;
    lng?: number | null;
    planned_arrival?: string | null;
  }[];
  planned_start?: string;
  planned_end?: string;
  isRound?: boolean;
}

/** A quotation as GET /quotations/:id returns it (the edit form's starting values). */
export interface OperatorQuotationDetail {
  id: string;
  name?: string | null;
  customerId: string;
  customer?: { id: string; name: string } | null;
  rate: number | string;
  driver_payout?: number | string | null;
  currency?: string | null;
  vehicle_class?: string | null;
  source_vehicle_label?: string | null;
  line_type?: string | null;
  operation_type?: string | null;
  pricing_basis?: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
  is_active: boolean;
  stops?: {
    id: string;
    sequence: number;
    leg_index?: number | null;
    stop_type: string;
    source_label?: string | null;
    locationId?: string | null;
    location?: { id: string; name: string } | null;
  }[];
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
  /** From the shared ranking (rankDrivers): picker group, "why" chips, truck fit, clashing trip start. */
  group?: DriverGroup;
  reasons?: DriverReason[];
  truckFit?: 'exact' | 'bigger' | 'smaller' | 'none';
  clashStart?: string;
  /** Other trips this driver is still running (any date) — warn, don't block. */
  openTrips?: Array<{ ref: string | null; status: string }>;
}

/** A 3PL partner's agreed cost for a lane (POST /third-party-providers/rates/match). */
export interface ProviderRateMatch {
  id: string;
  cost: number | string;
  vehicle_class?: string | null;
  line_type?: string | null;
  pricing_basis?: string | null;
}

/** A driver/truck a 3PL partner sent on an earlier trip. */
export interface Previous3PLDriver {
  driverName: string | null;
  driverPhone: string | null;
  vehiclePlate: string | null;
  vehicleType: string | null;
}

/** A customer's standing surcharge (waiting, toll…) with its agreed rate. */
export interface OperatorSurchargeRule {
  id: string;
  charge_type: string;
  rate: number;
  unit?: string | null;
  quotationId?: string | null;
}

/** Which truck classes may run a trip priced for a class (Settings → vehicle compatibility). */
export interface VehicleCompatibilityRule {
  serviceVehicleClassCode: string;
  preferredVehicleClassCodes: string[];
  allowedVehicleClassCodes: string[];
  isActive: boolean;
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
  secondary_contact_person?: string | null;
  secondary_contact_phone?: string | null;
  payment_terms?: string | null;
  whatsapp_number?: string | null;
  whatsapp_group_name?: string | null;
  whatsapp_group_link?: string | null;
  driver_workflow?: 'NATIVE' | 'EXTERNAL_APP' | null;
}

/** Same fields as the web's Add / Edit Customer pages (backend createCustomerBody). */
export interface CreateCustomerInput {
  name: string;
  contact_phone: string;
  primary_contact_person?: string;
  primary_contact_phone?: string;
  secondary_contact_person?: string;
  secondary_contact_phone?: string;
  payment_terms?: string;
  whatsapp_number?: string;
  whatsapp_group_name?: string;
  whatsapp_group_link?: string;
  driver_workflow?: 'NATIVE' | 'EXTERNAL_APP';
}

export interface UpdateCustomerInput extends Partial<CreateCustomerInput> {
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

let timezoneRequest: Promise<string> | null = null;

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
    const { data } = await api.get('/drivers', { params: { mode: 'lookup', per_page: 100 } });
    return (data.data ?? []) as OperatorDriver[];
  },

  async vehicles(): Promise<OperatorVehicle[]> {
    const { data } = await api.get('/vehicles', { params: { mode: 'lookup', per_page: 100 } });
    return (data.data ?? []) as OperatorVehicle[];
  },

  async invoices(): Promise<OperatorInvoice[]> {
    const { data } = await api.get('/invoices', { params: { per_page: 100 } });
    return (data.data ?? []) as OperatorInvoice[];
  },

  /** GET /trips/:id already carries every document on the trip and its stops. */
  async tripById(id: string): Promise<OperatorTripDetail> {
    const { data } = await api.get(`/trips/${id}`);
    return data.data as OperatorTripDetail;
  },


  async customers(): Promise<OperatorCustomer[]> {
    const { data } = await api.get('/customers', { params: { per_page: 100 } });
    return (data.data ?? []) as OperatorCustomer[];
  },

  /** Picker shape (`mode=lookup`): no per-customer trip and invoice stats. */
  async customersLookup(): Promise<OperatorCustomer[]> {
    const { data } = await api.get('/customers', { params: { per_page: 100, mode: 'lookup' } });
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
    const { data } = await api.get('/drivers', { params: { mode: 'lookup', per_page: 100, status: 'Available' } });
    return (data.data ?? []) as OperatorDriver[];
  },

  async availableVehicles(): Promise<OperatorVehicle[]> {
    const { data } = await api.get('/vehicles', { params: { mode: 'lookup', per_page: 100, status: 'Available' } });
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
    coordinate_precision?: 'EXACT' | 'APPROXIMATE';
  }): Promise<OperatorLocation> {
    const { data } = await api.post('/locations', payload);
    return data.data as OperatorLocation;
  },

  async thirdPartyProviders(): Promise<OperatorThirdPartyProvider[]> {
    const { data } = await api.get('/third-party-providers', { params: { per_page: 100 } });
    return (data.data ?? []) as OperatorThirdPartyProvider[];
  },

  async thirdPartyProviderById(id: string): Promise<OperatorThirdPartyProvider> {
    const { data } = await api.get(`/third-party-providers/${id}`);
    return data.data as OperatorThirdPartyProvider;
  },

  async thirdPartyProviderRates(id: string): Promise<OperatorProviderRate[]> {
    const { data } = await api.get(`/third-party-providers/${id}/rates`);
    return (data.data ?? []) as OperatorProviderRate[];
  },

  async thirdPartyStats(): Promise<ThirdPartyStats> {
    const { data } = await api.get('/third-party-providers/stats');
    return data.data as ThirdPartyStats;
  },

  async createThirdPartyProvider(payload: ThirdPartyProviderInput): Promise<OperatorThirdPartyProvider> {
    const { data } = await api.post('/third-party-providers', payload);
    return data.data as OperatorThirdPartyProvider;
  },

  async updateThirdPartyProvider(id: string, payload: Partial<ThirdPartyProviderInput>): Promise<OperatorThirdPartyProvider> {
    const { data } = await api.put(`/third-party-providers/${id}`, payload);
    return data.data as OperatorThirdPartyProvider;
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

  /** Every driver with their assigned truck — the web wizard's `mode: 'lookup'` list, without live GPS (pickers don't show it). */
  async driversLookup(): Promise<OperatorDriverOption[]> {
    const { data } = await api.get('/drivers', { params: { per_page: 1000, mode: 'lookup', gps: 'false' } });
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
  async recommendedDrivers(params: {
    origin?: string;
    destination?: string;
    vehicleClass?: string;
    vehicleId?: string;
    originLocationId?: string;
    destinationLocationId?: string;
    customerId?: string;
    /** The trip's window (UTC ISO) — the ranking checks clashes, the 1 h gap and the 6 h rest against it. */
    plannedStart?: string;
    plannedEnd?: string;
  }): Promise<RecommendedDriver[]> {
    try {
      const { data } = await api.get('/trips/recommendations/drivers', { params });
      return (data?.data ?? []) as RecommendedDriver[];
    } catch {
      return [];
    }
  },

  /** The partner's agreed cost for this lane and class, or null. */
  async thirdPartyMatchRate(payload: {
    providerId: string;
    origin: string;
    destination: string;
    vehicle_class: string;
    line_type: string;
    operation_type: string;
    pricing_basis: string;
    originLocationId?: string;
    destinationLocationId?: string;
    target_date?: string;
  }): Promise<ProviderRateMatch | null> {
    try {
      const { data } = await api.post('/third-party-providers/rates/match', payload);
      return (data?.data ?? null) as ProviderRateMatch | null;
    } catch {
      return null;
    }
  },

  /** Drivers and trucks this partner sent before — tap one to fill the form. */
  async thirdPartyPreviousDrivers(providerId: string): Promise<Previous3PLDriver[]> {
    try {
      const { data } = await api.get(`/third-party-providers/${providerId}/previous-drivers`);
      return (data?.data ?? []) as Previous3PLDriver[];
    } catch {
      return [];
    }
  },

  /** The customer's active standing surcharges (and the quotation's, when one is applied). */
  async surchargeRules(params: { customerId: string; quotationId?: string }): Promise<OperatorSurchargeRule[]> {
    try {
      const { data } = await api.get('/surcharge-rules', {
        params: {
          customerId: params.customerId,
          ...(params.quotationId ? { quotationId: params.quotationId, rateCardId: params.quotationId } : {}),
          active_only: 'true',
        },
      });
      return ((data?.data ?? []) as OperatorSurchargeRule[]).map((r) => ({ ...r, rate: Number(r.rate) || 0 }));
    } catch {
      return [];
    }
  },

  async vehicleCompatibilityRules(): Promise<VehicleCompatibilityRule[]> {
    try {
      const { data } = await api.get('/vehicle-compatibility');
      return (data?.data ?? []) as VehicleCompatibilityRule[];
    } catch {
      return [];
    }
  },

  /** A customer's latest trips (light rows) — for recently used routes and quotations. */
  async customerRecentTrips(customerId: string): Promise<OperatorTrip[]> {
    try {
      const { data } = await api.get('/trips', { params: { customer_id: customerId, per_page: 50, lite: true } });
      return (data?.data ?? []) as OperatorTrip[];
    } catch {
      return [];
    }
  },

  /**
   * Saves the map pin on a saved place. An exact pin (pasted link / map moved by
   * hand) goes through /pin, which also fixes the place's open trips; a search
   * pick is only approximate and is stored as that.
   */
  async pinLocation(id: string, pin: { lat: number; lng: number; address?: string | null; exact: boolean }): Promise<void> {
    if (pin.exact) {
      await api.post(`/locations/${id}/pin`, { lat: pin.lat, lng: pin.lng, address: pin.address ?? null });
    } else {
      await api.patch(`/locations/${id}`, { lat: pin.lat, lng: pin.lng, coordinate_precision: 'APPROXIMATE' });
    }
  },

  /**
   * The deployment timezone trip times are entered in (Settings.timezone).
   * Asked once per app run: Home, Trips, Trip details and Create Trip all need it.
   */
  deploymentTimezone(): Promise<string> {
    if (!timezoneRequest) {
      timezoneRequest = api.get('/settings/public')
        .then(({ data }) => (data?.data?.timezone as string | undefined) || 'Asia/Riyadh')
        .catch(() => {
          timezoneRequest = null; // try again next time
          return 'Asia/Riyadh';
        });
    }
    return timezoneRequest;
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

  async quotationById(id: string): Promise<OperatorQuotationDetail> {
    const { data } = await api.get(`/quotations/${id}`);
    return data.data as OperatorQuotationDetail;
  },

  /** PUT /quotations/:id — same payload shape as create (the web's Edit Quotation page). */
  async updateQuotation(id: string, payload: Record<string, unknown>): Promise<OperatorQuotationDetail> {
    const { data } = await api.put(`/quotations/${id}`, payload);
    return data.data as OperatorQuotationDetail;
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

  /** Every driver with its login account, for User management. */
  async driverAccounts(): Promise<OperatorDriver[]> {
    const { data } = await api.get('/drivers', { params: { per_page: 1000, sortOrder: 'name_asc' } });
    return (data.data ?? []) as OperatorDriver[];
  },

  /** Sets (or resets) a driver's app login password; creates the linked login account if missing. */
  async setDriverPassword(id: string, password: string): Promise<void> {
    await api.post(`/drivers/${id}/set-password`, { password });
  },

  /** Web/operator app accounts (Admin + Operator) — drivers are managed via /drivers. */
  async platformUsers(): Promise<PlatformUser[]> {
    const { data } = await api.get('/users');
    return (data.data ?? []) as PlatformUser[];
  },

  async createPlatformUser(payload: PlatformUserInput & { password: string }): Promise<PlatformUser> {
    const { data } = await api.post('/users', payload);
    return data.data as PlatformUser;
  },

  async updatePlatformUser(id: string, payload: PlatformUserInput): Promise<PlatformUser> {
    const { data } = await api.put(`/users/${id}`, payload);
    return data.data as PlatformUser;
  },

  async deletePlatformUser(id: string): Promise<void> {
    await api.delete(`/users/${id}`);
  },

  async createDriver(payload: CreateDriverInput): Promise<OperatorDriver> {
    const { data } = await api.post('/drivers', payload);
    return data.data as OperatorDriver;
  },

  async createVehicle(payload: CreateVehicleInput): Promise<OperatorVehicle> {
    const { data } = await api.post('/vehicles', payload);
    return data.data as OperatorVehicle;
  },

  async updateVehicle(id: string, payload: UpdateVehicleInput): Promise<OperatorVehicle> {
    const { data } = await api.patch(`/vehicles/${id}`, payload);
    return data.data as OperatorVehicle;
  },

  /**
   * Records money received against an invoice (POST /invoices/:id/payments, as
   * the web's Record Payment). An invoice has no "status" to set by hand: it
   * becomes Paid when payments cover it, and each payment posts to the ledger.
   */
  async recordInvoicePayment(id: string, payload: { amount: number; accountId: string; payment_date: string }): Promise<void> {
    await api.post(`/invoices/${id}/payments`, payload);
  },

  /** Cash and bank accounts a payment can be received into (GET /bank-accounts). */
  async paymentAccounts(): Promise<OperatorPaymentAccount[]> {
    const { data } = await api.get('/bank-accounts');
    return ((data.data ?? []) as any[])
      .filter((a) => a.isActive !== false && a.accountId)
      .map((a) => ({ accountId: a.accountId, name: a.account?.name || a.bank_name || (a.is_cash ? 'Cash' : 'Bank account'), is_cash: Boolean(a.is_cash) }));
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
  /** Send a truck — and, when the trip has none, the truck's driver — on a trip (POST /trips/:id/dispatch). */
  async dispatchTrip(id: string, body: { vehicle_id: string; driver_id?: string }): Promise<OperatorTripDetail> {
    const { data } = await api.post(`/trips/${id}/dispatch`, body);
    return data.data as OperatorTripDetail;
  },
  async replaceVehicle(id: string, newVehicleId: string): Promise<OperatorTripDetail> {
    const { data } = await api.post(`/trips/${id}/dispatch`, { vehicle_id: newVehicleId });
    return data.data as OperatorTripDetail;
  },

  /** Save a customer-app trip's real stop times, copied off the driver's
   * screenshots, all stops at once — same endpoint as the web's "Check times".
   * Only changed times are sent; an empty list confirms the tapped times. */
  async confirmTripTimes(
    tripId: string,
    stops: { stop_id: string; actual_arrival?: string; actual_departure?: string }[]
  ): Promise<{ stops_updated: number; screenshots_verified: number }> {
    const { data } = await api.patch(`/trips/${tripId}/confirm-times`, { stops });
    return data.data;
  },

  /**
   * Pin a stop exactly — same endpoint as the web's "Set pin" box. When the
   * stop is its customer location (not pinned yet), that location and its
   * other open trips are pinned too.
   */
  async pinStop(
    tripId: string,
    stopId: string,
    pin: { lat: number; lng: number; address?: string | null }
  ): Promise<{ location_pinned: boolean; other_trip_count: number }> {
    const { data } = await api.post(`/trips/${tripId}/stops/${stopId}/pin`, pin);
    return data.data;
  },

  /** A pasted Google Maps / WhatsApp link or "lat, lng" → a pin (resolved by the API). */
  async resolveLocationText(text: string): Promise<{ lat: number; lng: number; address?: string }> {
    const { data } = await api.get('/geocoding/resolve-location', { params: { text } });
    return data;
  },

  /** Place search (Saudi Arabia). */
  async searchPlaces(q: string): Promise<{ id: string; label: string; lat: number; lng: number }[]> {
    const { data } = await api.get('/geocoding/search', { params: { q } });
    return ((data?.suggestions ?? []) as { id: string; display_name: string; lat: number; lon: number }[])
      .map((r) => ({ id: r.id, label: r.display_name, lat: r.lat, lng: r.lon }));
  },

  /** Every truck/driver with a running or scheduled trip and its GPS — the web's live map. */
  async liveMap(): Promise<LiveUnit[]> {
    const { data } = await api.get('/vehicles/live-map');
    return (data.data?.units ?? []) as LiveUnit[];
  },

  /** Recent driver photo updates across all trips, with who already forwarded them. */
  async driverUpdates(): Promise<{ updates: DriverUpdate[]; whatsapp_api_available: boolean }> {
    const { data } = await api.get('/operator-inbox/driver-updates');
    return data.data as { updates: DriverUpdate[]; whatsapp_api_available: boolean };
  },

  /** Documents and licences expired or expiring soon. */
  async documentExpiries(): Promise<ExpiryItem[]> {
    const { data } = await api.get('/operator-inbox/document-expiries');
    return (data.data?.items ?? data.data ?? []) as ExpiryItem[];
  },

  /** Trip documents waiting for review (external-app screenshots whose time must be confirmed). */
  async tripDocumentsToReview(): Promise<(OperatorTripDocument & { entity_id?: string })[]> {
    const { data } = await api.get('/documents', { params: { entity_type: 'Trip', status: 'PendingReview', per_page: 100 } });
    return (data.data ?? []) as (OperatorTripDocument & { entity_id?: string })[];
  },

  /** Phase, pre-trip checks, live GPS and the path driven — the web map's data. */
  /** The trip's customer tracking link (created on first ask); `renew` replaces it and the old one stops working. */
  async trackingLink(id: string, renew = false): Promise<TrackingLinkInfo> {
    const { data } = await api.post(`/trips/${id}/tracking-link`, { renew });
    return data.data as TrackingLinkInfo;
  },

  /** Tracking links for several trips at once, keyed by trip id (bulk status share). */
  async trackingLinks(ids: string[]): Promise<Record<string, TrackingLinkInfo>> {
    if (ids.length === 0) return {};
    const { data } = await api.post('/trips/tracking-links', { trip_ids: ids.slice(0, 100) });
    return data.data as Record<string, TrackingLinkInfo>;
  },

  async tripOverview(id: string): Promise<TripOverview> {
    const { data } = await api.get(`/vehicles/live-map/trips/${id}/overview`);
    return data.data as TripOverview;
  },

  /** Road route between two points or through several, with its [lng, lat] geometry (null when routing is down). */
  async liveRoute(points: { lat: number; lng: number }[]): Promise<{ geometry: [number, number][]; distanceMeters: number; durationSeconds: number } | null> {
    if (points.length < 2) return null;
    try {
      const params = points.length === 2
        ? { from: `${points[0].lat},${points[0].lng}`, to: `${points[1].lat},${points[1].lng}` }
        : { points: points.map((p) => `${p.lat},${p.lng}`).join(';') };
      const { data } = await api.get('/vehicles/live-map/route', { params, timeout: 10_000 });
      const r = data?.data;
      return r && Array.isArray(r.geometry) && Number.isFinite(r.distanceMeters) ? r : null;
    } catch {
      return null;
    }
  },

  /** Road distance and drive time between two points (null when routing is down) — the web map's route call. */
  /** Photos, POD and delay videos per stop of a trip (same as the web live map's details panel). */
  async tripMedia(tripId: string): Promise<LiveTripMedia> {
    const { data } = await api.get(`/vehicles/live-map/trips/${tripId}/media`);
    return (data?.data ?? { stops: [], unplaced: [] }) as LiveTripMedia;
  },

  async routeEstimate(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<{ distanceMeters: number; durationSeconds: number } | null> {
    try {
      const { data } = await api.get('/vehicles/live-map/route', { params: { from: `${from.lat},${from.lng}`, to: `${to.lat},${to.lng}` } });
      const r = data?.data;
      return r && Number.isFinite(r.distanceMeters) ? { distanceMeters: r.distanceMeters, durationSeconds: r.durationSeconds } : null;
    } catch {
      return null;
    }
  },

  /** The driver's photos for this trip, one entry per stop and step, with who already forwarded them. */
  async tripDriverUpdates(id: string): Promise<{ updates: DriverUpdate[]; whatsapp_api_available: boolean }> {
    const { data } = await api.get(`/operator-inbox/trips/${id}/driver-updates`);
    return data.data as { updates: DriverUpdate[]; whatsapp_api_available: boolean };
  },

  /** Records a forward and returns the message, a photo-page link and a wa.me link — same call as the web. */
  async shareDriverUpdate(body: {
    trip_id: string;
    update_key: string;
    media_ids: string[];
    recipient: ShareRecipient;
    recipient_phone?: string | null;
    channel: 'link' | 'whatsapp_api';
  }): Promise<ShareResult> {
    const { data } = await api.post('/operator-inbox/driver-updates/share', body);
    return data.data as ShareResult;
  },

  /** Replaces the trip's route and planned times (PUT /trips/:id/stops, as the web's Edit Trip). Draft / Scheduled trips only. */
  async updateTripRoute(id: string, payload: UpdateTripRouteInput): Promise<OperatorTripDetail> {
    const { data } = await api.put(`/trips/${id}/stops`, payload);
    return data.data as OperatorTripDetail;
  },

  /** Billing amount and driver payout (PATCH /trips/:id/financials, as the web's Edit Trip). */
  async updateTripPrice(id: string, payload: { billing_amount?: number; driver_payout?: number }): Promise<OperatorTripDetail> {
    const { data } = await api.patch(`/trips/${id}/financials`, {
      ...payload,
      ...(payload.driver_payout !== undefined ? { trip_charges: payload.driver_payout } : {}),
    });
    return data.data as OperatorTripDetail;
  },

  /** Replaces the trip's additional charges (PATCH /trips/:id/financials, as the web's charges editor). */
  async updateTripCharges(id: string, charges: OperatorTripCharge[]): Promise<OperatorTripDetail> {
    const { data } = await api.patch(`/trips/${id}/financials`, {
      charges: charges.map((c) => ({
        surchargeRuleId: c.surchargeRuleId ?? undefined,
        charge_type: c.charge_type,
        unit: c.unit,
        rate: c.rate,
        quantity: c.quantity,
        amount: c.amount,
      })),
    });
    return data.data as OperatorTripDetail;
  },

  /** Attaches a photo, video or file to the trip as a Document (POST /documents, as the web's upload). */
  async uploadTripDocument(tripId: string, file: { uri: string; name?: string; mimeType?: string | null }, docType: TripDocKind): Promise<OperatorTripDocument> {
    const name = file.name || file.uri.split('/').pop() || 'upload.jpg';
    const ext = (/\.(\w+)$/.exec(name)?.[1] || 'jpg').toLowerCase();
    const type = file.mimeType
      || (/^(mp4|mov|webm|3gp)$/.test(ext) ? `video/${ext === 'mov' ? 'quicktime' : ext}` : ext === 'pdf' ? 'application/pdf' : `image/${ext === 'jpg' ? 'jpeg' : ext}`);
    const form = new FormData();
    form.append('file', { uri: file.uri, name, type } as any);
    form.append('entity_type', 'Trip');
    form.append('entity_id', tripId);
    form.append('doc_type', docType);
    const { data } = await api.post('/documents', form, { headers: { 'Content-Type': 'multipart/form-data' } });
    return data.data as OperatorTripDocument;
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

export interface OperatorPaymentAccount {
  accountId: string;
  name: string;
  is_cash: boolean;
}

export interface OperatorInvoice {
  id: string;
  ref_id: string | null;
  /** Draft | Issued | PartiallyPaid | Paid | Void (backend enum InvoiceStatus). */
  status: string;
  currency: string;
  total_amount: number;
  /** What is still owed after payments and credit notes. */
  balance_due?: number;
  due_date: string;
  createdAt: string;
  customerId?: string | null;
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
  trailer_number?: string | null;
  trailer_type?: string | null;
  trailer_capacity_kg?: number | null;
  icces_device_id?: string | null;
  has_tailgate?: boolean;
  assignedDriver?: { id: string; first_name: string; last_name: string; phone_primary?: string | null } | null;
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
  /** Linked login account — present once a password has been set. */
  user?: { id: string; username: string | null; phone: string | null } | null;
}

export interface PlatformUser {
  id: string;
  name: string;
  username: string | null;
  phone: string | null;
  email: string | null;
  role: 'Admin' | 'Operator';
  status: 'Active' | 'Inactive';
  createdAt: string;
}

export interface PlatformUserInput {
  name?: string;
  username?: string;
  phone?: string;
  email?: string | null;
  role?: 'Admin' | 'Operator';
  status?: 'Active' | 'Inactive';
  password?: string;
}


export interface UpdateDriverInput {
  first_name?: string;
  last_name?: string;
  phone_primary?: string;
  license_number?: string;
  license_expiry?: string;
  status?: 'Available' | 'OnTrip' | 'OffDuty' | 'Inactive';
  /** The truck this driver normally drives; null unassigns. */
  assigned_vehicle_id?: string | null;
}

export interface CreateDriverInput {
  first_name: string;
  last_name: string;
  phone_primary: string;
  license_number: string;
  license_expiry: string;
}

/** Body of POST /vehicles — the fields the backend's createVehicleBody requires. */
export interface CreateVehicleInput {
  plate_number: string;
  asset_type: 'Flatbed' | 'Reefer' | 'Box' | 'Tanker';
  capacity_kg: number;
  icces_device_id?: string | null;
  trailer_number?: string | null;
  trailer_type?: 'Flatbed' | 'Reefer' | 'Box' | 'Tanker' | null;
  trailer_capacity_kg?: number | null;
  /** Tailgate lift — the trip assignment message says "WITH TAILGATE". */
  has_tailgate?: boolean;
}

export interface UpdateVehicleInput extends Partial<CreateVehicleInput> {
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

/** Mirrors the API's trip tracking link (backend services/tracking/customerTracking.ts). */
export interface TrackingLinkInfo {
  /** False when the customer has tracking switched off — then url is null. */
  enabled: boolean;
  /** Whether status messages should end with the link (customer setting). */
  auto_link: boolean;
  url: string | null;
  open_count: number;
  last_opened_at: string | null;
}

/** The link a status message should end with — only for customers who want it added. */
export function autoTrackingUrl(link: TrackingLinkInfo | null | undefined): string | null {
  return link?.enabled && link.auto_link ? link.url : null;
}

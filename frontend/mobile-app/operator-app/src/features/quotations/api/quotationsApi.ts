/**
 * Quotations API layer — raw HTTP calls for commercial rate cards & lanes.
 * GET /quotations → paginated quotation list with joined customer and stops.
 */
import { api } from '@mercon/mobile-shared/lib/api';

export interface RawQuotationStopLocation {
  id: string;
  name: string;
  lat?: number | null;
  lng?: number | null;
}

export interface RawQuotationStop {
  id: string;
  sequence: number;
  leg_index?: number | null;
  stop_type: string;
  source_label?: string | null;
  location?: RawQuotationStopLocation | null;
}

export interface RawQuotationCustomer {
  id: string;
  name: string;
  logo_url?: string | null;
}

export interface RawQuotation {
  id: string;
  quotation_number?: number | null;
  name?: string | null;
  line_type?: string | null;
  operation_type?: string | null;
  pricing_basis?: string | null;
  rate: number | string;
  driver_payout?: number | string | null;
  currency?: string | null;
  vehicle_class?: string | null;
  source_vehicle_label?: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
  source_type?: string | null;
  source_reference?: string | null;
  customerId: string;
  is_active: boolean;
  createdAt: string;
  updatedAt: string;
  customer?: RawQuotationCustomer | null;
  stops?: RawQuotationStop[];
  /** Name of the user who added it (list endpoint only). */
  created_by_name?: string | null;
  /** Trips booked on this rate (list endpoint only). */
  trip_count?: number;
  /** Date of the latest trip on this rate (list endpoint only). */
  last_trip_at?: string | null;
}

export interface RawQuotationListResponse {
  data: RawQuotation[];
  meta: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

/** An extra fee the customer has agreed (per stop, per hour…). quotationId null = applies to every lane of the customer. */
export interface RawSurchargeRule {
  id: string;
  quotationId: string | null;
  charge_type: string;
  unit?: string | null;
  vehicle_type?: string | null;
  rate: number | string;
  currency?: string | null;
  is_active: boolean;
}

export interface RawQuotationTrip {
  id: string;
  ref_id: string | null;
  status: string;
  planned_start: string | null;
  createdAt: string;
  billing_amount?: number | string | null;
  driver?: { first_name?: string; last_name?: string } | null;
  vehicle?: { plate_number?: string } | null;
}

export const quotationsApi = {
  /** GET /surcharge-rules — this lane's extra charges plus the customer-wide ones (same as the web drawer). */
  async getSurchargeRules(quotationId: string, customerId: string): Promise<RawSurchargeRule[]> {
    const { data } = await api.get('/surcharge-rules', { params: { quotationId, customerId, active_only: 'true' } });
    return data?.data ?? [];
  },

  /** GET /trips?quotation_id= — trips billed on this rate, newest first. */
  async getTripsUsingRate(quotationId: string): Promise<{ trips: RawQuotationTrip[]; total: number }> {
    const { data } = await api.get('/trips', { params: { quotation_id: quotationId, per_page: 50 } });
    return { trips: data?.data ?? [], total: data?.meta?.total ?? (data?.data ?? []).length };
  },

  async getQuotations(params: {
    page?: number;
    per_page?: number | 'all';
    search?: string;
    customerId?: string;
    status?: 'active' | 'inactive' | null;
  }): Promise<RawQuotationListResponse> {
    const response = await api.get('/quotations', {
      params: {
        page: params.page ?? 1,
        per_page: params.per_page ?? 10,
        search: params.search || undefined,
        customerId: params.customerId || undefined,
        status: params.status || undefined,
      },
    });
    return {
      data: response.data.data ?? [],
      meta: response.data.meta ?? { page: 1, per_page: 10, total: 0, total_pages: 1 },
    };
  },
};

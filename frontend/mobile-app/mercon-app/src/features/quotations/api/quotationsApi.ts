/**
 * Quotations API layer — raw HTTP calls for commercial rate cards & lanes.
 * GET /quotations → paginated quotation list with joined customer and stops.
 */
import { api } from '@/lib/api';

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

export const quotationsApi = {
  async getQuotations(params: {
    page?: number;
    per_page?: number;
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

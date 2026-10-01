import { api, ApiResponse } from '@/lib/api';
import { Location } from '@/services/locationService';
import type { ImportSummary } from '@/components/fleet/ExcelImportDialog';
import type { Quotation, QuotationStop, QuotationHistory } from '@mercon/shared-types';

export { Quotation, QuotationStop, QuotationHistory };
export { VEHICLE_TYPES, RATE_CATEGORIES, BILLING_TYPES } from '@mercon/shared-types';

/**
 * Backward compatibility interface for RateCard
 */
export type RateCard = Quotation;
export type RateCardPriceHistory = QuotationHistory;

export interface CreateQuotationPayload {
  name?: string;
  rate?: number;
  base_price?: number;
  driver_payout?: number | null;
  driver_charge?: number | null;
  currency?: string;
  customerId: string;
  is_active?: boolean;
  vehicle_class?: string | null;
  source_vehicle_label?: string | null;
  vehicle_type?: string | null;
  line_type?: string | null;
  rate_category?: string | null;
  operation_type?: string | null;
  billing_type?: string | null;
  pricing_basis?: string | null;
  agreement_ref?: string | null;
  documentId?: string | null;
  via_location?: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
  source_type?: string | null;
  source_reference?: string | null;
  reason?: string;
  change_reason?: string;
  source?: string;
  trip_id?: string;
  stops?: Array<{
    sequence?: number;
    locationId?: string | null;
    location_id?: string | null;
    stop_type?: string;
    source_label?: string | null;
    location_name?: string | null;
  }>;
  origin_location_id?: string | null;
  destination_location_id?: string | null;
  origin_name?: string | null;
  destination_name?: string | null;
  origin_lat?: number | null;
  origin_lng?: number | null;
  destination_lat?: number | null;
  destination_lng?: number | null;
}

export type CreateRateCardPayload = CreateQuotationPayload;

export interface QuotationListParams {
  customerId?: string;
  active_only?: boolean;
  agreement_ref?: string;
  origin_location_id?: string;
  destination_location_id?: string;
  vehicle_class?: string;
  vehicle_type?: string;
  line_type?: string;
  rate_category?: string;
  billing_type?: string;
  pricing_basis?: string;
  page?: number;
  per_page?: number | 'all';
  search?: string;
  status?: string;
}

export type RateCardListParams = QuotationListParams;

export interface SurchargeRule {
  id: string;
  customerId: string;
  quotationId: string | null;
  rateCardId?: string | null;
  charge_type: string;
  unit: string | null;
  vehicle_type: string | null;
  rate: number;
  currency: string;
  is_active: boolean;
  createdAt: string;
  updatedAt: string;
  customer?: { id: string; name: string } | null;
  quotation?: { id: string; name: string } | null;
  rateCard?: { id: string; name: string; route_origin?: string; route_destination?: string } | null;
}

export interface CreateSurchargeRulePayload {
  customerId: string;
  quotationId?: string | null;
  rateCardId?: string | null;
  charge_type: string;
  unit?: string | null;
  vehicle_type?: string | null;
  rate: number;
  currency?: string;
  is_active?: boolean;
}

export type RateSource = 'customer' | null;

export interface QuotationLookupResult {
  quotation: Quotation | null;
  rate_card?: Quotation | null;
  source: RateSource;
  matchStatus?: 'EXACT_MATCH' | 'ROUTE_STRUCTURE_DIFFERENT' | 'NO_QUOTATION_FOUND';
  match_status?: 'EXACT_MATCH' | 'ROUTE_STRUCTURE_DIFFERENT' | 'NO_QUOTATION_FOUND';
  candidateQuotation?: Quotation | null;
  candidate_quotation?: Quotation | null;
}

export type RateLookupResult = QuotationLookupResult;

/** Recent quotation lookups, shared by identical requests (see `lookup`). */
const LOOKUP_REUSE_MS = 5000;
const lookupCache = new Map<string, { at: number; promise: Promise<QuotationLookupResult> }>();
/** A quotation changed — the next lookup must ask the server again. */
export const clearQuotationLookupCache = () => lookupCache.clear();

export const quotationService = {
  async getAll(params?: QuotationListParams): Promise<ApiResponse<Quotation[]>> {
    const res = await api.get<ApiResponse<Quotation[]>>('/quotations', {
      params: {
        ...(params?.customerId ? { customerId: params.customerId } : {}),
        ...(params?.active_only ? { active_only: 'true' } : {}),
        ...(params?.agreement_ref ? { agreement_ref: params.agreement_ref } : {}),
        ...(params?.origin_location_id ? { origin_location_id: params.origin_location_id } : {}),
        ...(params?.destination_location_id ? { destination_location_id: params.destination_location_id } : {}),
        ...(params?.vehicle_class || params?.vehicle_type ? { vehicle_type: params?.vehicle_class || params?.vehicle_type } : {}),
        ...(params?.line_type || params?.rate_category ? { line_type: params?.line_type || params?.rate_category } : {}),
        ...(params?.billing_type ? { billing_type: params.billing_type } : {}),
        ...(params?.pricing_basis ? { pricing_basis: params.pricing_basis } : {}),
        ...(params?.page ? { page: params.page } : {}),
        ...(params?.per_page ? { per_page: params.per_page } : {}),
        ...(params?.search ? { search: params.search } : {}),
        ...(params?.status ? { status: params.status } : {}),
      },
    });
    return res.data;
  },

  async getById(id: string): Promise<Quotation> {
    const res = await api.get<ApiResponse<Quotation>>(`/quotations/${id}`);
    return res.data.data;
  },

  async lookup(params: {
    customer_id?: string | null;
    origin_location_id?: string | null;
    destination_location_id?: string | null;
    vehicle_type?: string | null;
    line_type?: string | null;
    billing_type?: string | null;
    planned_start?: string | null;
    trip_date?: string | null;
    stops?: any[] | null;
  }): Promise<QuotationLookupResult> {
    // Create Trip fires the same lookup several times per route change (one per
    // re-render path). Identical requests within a few seconds share one call.
    const key = JSON.stringify(params);
    const cached = lookupCache.get(key);
    if (cached && Date.now() - cached.at < LOOKUP_REUSE_MS) return cached.promise;
    const promise = this.fetchLookup(params);
    lookupCache.set(key, { at: Date.now(), promise });
    if (lookupCache.size > 50) lookupCache.delete(lookupCache.keys().next().value as string);
    return promise;
  },

  async fetchLookup(params: Record<string, any>): Promise<QuotationLookupResult> {
    try {
      const res = await api.get<ApiResponse<QuotationLookupResult>>('/quotations/lookup', {
        params: {
          ...(params.customer_id ? { customer_id: params.customer_id } : {}),
          ...(params.origin_location_id ? { origin_location_id: params.origin_location_id } : {}),
          ...(params.destination_location_id ? { destination_location_id: params.destination_location_id } : {}),
          ...(params.vehicle_type !== undefined ? { vehicle_type: params.vehicle_type ?? '' } : {}),
          ...(params.line_type !== undefined ? { line_type: params.line_type ?? '' } : {}),
          ...(params.billing_type !== undefined ? { billing_type: params.billing_type ?? '' } : {}),
          ...(params.planned_start ? { planned_start: params.planned_start } : {}),
          ...(params.trip_date ? { trip_date: params.trip_date } : {}),
          ...(params.stops ? { stops: JSON.stringify(params.stops) } : {}),
        },
      });
      return res?.data?.data;
    } catch {
      return null as any;
    }
  },

  async analyzeDocumentAi(fileOrDocId: File | string, customerId?: string): Promise<{
    customer_name: string | null;
    agreement_ref: string | null;
    valid_from: string | null;
    valid_to: string | null;
    payment_terms: string | null;
    notes: string | null;
    confidence: number;
    confidence_breakdown?: { customer: number; locations: number; rates: number; vehicle: number };
    location_resolutions?: Record<string, any>;
    routes: Array<{
      origin_name: string;
      waypoints?: string[];
      destination_name: string;
      vehicle_class: string;
      source_vehicle_label?: string | null;
      line_type: string;
      billing_type: string | null;
      pricing_basis?: string | null;
      rate: number;
      driver_payout?: number | null;
    }>;
    surcharge_rules?: Array<{
      charge_type: string;
      unit?: string | null;
      vehicle_type?: string | null;
      rate: number;
      currency?: string;
    }>;
  }> {
    if (typeof fileOrDocId === 'string') {
      const res = await api.post<ApiResponse<any>>('/quotations/ai-analyze', { document_id: fileOrDocId, customerId }, { timeout: 120_000 });
      return res.data.data;
    }
    const formData = new FormData();
    formData.append('file', fileOrDocId);
    if (customerId) formData.append('customerId', customerId);
    const res = await api.post<ApiResponse<any>>('/quotations/ai-analyze', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120_000,
    });
    return res.data.data;
  },

  async atomicImport(payload: {
    customerId: string;
    agreement_ref?: string;
    valid_from?: string;
    valid_to?: string;
    document_id?: string;
    new_locations?: Array<{ raw_text: string; name?: string; city?: string; existing_id?: string }>;
    routes: Array<{
      origin_name: string;
      waypoints?: string[];
      destination_name: string;
      origin_location_id?: string;
      destination_location_id?: string;
      vehicle_class?: string;
      source_vehicle_label?: string;
      line_type?: string;
      billing_type?: string | null;
      pricing_basis?: string;
      rate: number;
      driver_payout?: number | null;
      currency?: string;
    }>;
    surcharge_rules?: Array<{
      charge_type: string;
      unit?: string | null;
      vehicle_type?: string | null;
      rate: number;
      currency?: string;
    }>;
  }): Promise<{ quotations_created: number; surcharges_created: number }> {
    const res = await api.post<ApiResponse<any>>('/quotations/atomic-import', payload, { timeout: 120_000 });
    return res.data.data;
  },

  async create(payload: CreateQuotationPayload): Promise<Quotation> {
    console.log('🚀 [quotationService.create] Sending payload:', payload);
    try {
      const res = await api.post<ApiResponse<Quotation>>('/quotations', payload);
    clearQuotationLookupCache();
      console.log('✅ [quotationService.create] Success response:', res.data);
      return res.data.data;
    } catch (err: any) {
      console.error('❌ [quotationService.create] Request failed:', {
        status: err.response?.status,
        statusText: err.response?.statusText,
        errorData: err.response?.data,
        message: err.message,
        payloadSent: payload,
      });
      throw err;
    }
  },

  async update(id: string, payload: Partial<CreateQuotationPayload>): Promise<Quotation> {
    console.log(`🚀 [quotationService.update] Updating quotation ID ${id}:`, payload);
    try {
      const res = await api.put<ApiResponse<Quotation>>(`/quotations/${id}`, payload);
    clearQuotationLookupCache();
      console.log('✅ [quotationService.update] Success response:', res.data);
      return res.data.data;
    } catch (err: any) {
      console.error('❌ [quotationService.update] Request failed:', {
        status: err.response?.status,
        statusText: err.response?.statusText,
        errorData: err.response?.data,
        message: err.message,
        payloadSent: payload,
      });
      throw err;
    }
  },

  async getHistory(id: string): Promise<QuotationHistory[]> {
    const res = await api.get<ApiResponse<QuotationHistory[]>>(`/quotations/${id}/history`);
    return res.data.data;
  },

  async delete(id: string, force?: boolean): Promise<void> {
    await api.delete(`/quotations/${id}${force ? '?force=true' : ''}`);
    clearQuotationLookupCache();
  },

  async bulkDelete(ids: string[]): Promise<void> {
    await api.post('/quotations/bulk-delete', { ids });
    clearQuotationLookupCache();
  },

  async importRows(rows: Record<string, string | number>[]): Promise<ImportSummary> {
    const res = await api.post<ApiResponse<ImportSummary>>('/quotations/import', { rows }, { timeout: 120_000 });
    return res.data.data;
  },

  async getLanePriceHistory(params: {
    origin: string;
    destination: string;
    vehicleClass?: string;
    customerId?: string;
  }): Promise<Array<{
    id: string;
    quotation_number: string;
    customer_name: string;
    origin: string;
    destination: string;
    vehicle_class: string;
    line_type: string;
    billing_type: string;
    rate: number;
    driver_payout: number | null;
    updatedAt: string;
  }>> {
    try {
      const res = await api.get<ApiResponse<any[]>>('/quotations/lane-history', {
        params: {
          origin: params.origin,
          destination: params.destination,
          ...(params.vehicleClass ? { vehicleClass: params.vehicleClass } : {}),
          ...(params.customerId ? { customerId: params.customerId } : {}),
        },
      });
      return res.data.data || [];
    } catch {
      return [];
    }
  },
};

/** Alias for rateCardService */
export const rateCardService = quotationService;

export const surchargeRuleService = {
  async list(params?: { customerId?: string; quotationId?: string; rateCardId?: string; active_only?: boolean }): Promise<SurchargeRule[]> {
    const targetQuotationId = params?.quotationId || params?.rateCardId;
    const res = await api.get<ApiResponse<SurchargeRule[]>>('/surcharge-rules', {
      params: {
        ...(params?.customerId ? { customerId: params.customerId } : {}),
        ...(targetQuotationId ? { quotationId: targetQuotationId, rateCardId: targetQuotationId } : {}),
        ...(params?.active_only ? { active_only: 'true' } : {}),
      },
    });
    return res.data.data;
  },

  async getById(id: string): Promise<SurchargeRule> {
    const res = await api.get<ApiResponse<SurchargeRule>>(`/surcharge-rules/${id}`);
    return res.data.data;
  },

  async create(payload: CreateSurchargeRulePayload): Promise<SurchargeRule> {
    const res = await api.post<ApiResponse<SurchargeRule>>('/surcharge-rules', payload);
    return res.data.data;
  },

  async update(id: string, payload: Partial<CreateSurchargeRulePayload>): Promise<SurchargeRule> {
    const res = await api.put<ApiResponse<SurchargeRule>>(`/surcharge-rules/${id}`, payload);
    return res.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/surcharge-rules/${id}`);
  },

  async getDistinctChargeTypes(customerId?: string): Promise<string[]> {
    const res = await api.get<ApiResponse<string[]>>('/surcharge-rules/charge-types', {
      params: customerId ? { customerId } : {},
    });
    return res.data.data;
  },

  async importRows(rows: Record<string, string | number>[]): Promise<ImportSummary> {
    const res = await api.post<ApiResponse<ImportSummary>>('/surcharge-rules/import', { rows }, { timeout: 120_000 });
    return res.data.data;
  },
};

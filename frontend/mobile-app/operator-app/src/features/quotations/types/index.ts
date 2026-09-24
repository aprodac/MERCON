/**
 * Domain types for the Commercial Quotations feature.
 * Source of truth: backend/api-server/prisma/schema.prisma model Quotation
 */

export type QuotationValidityStatus = 'Active' | 'Inactive' | 'Expired' | 'Future';

export interface QuotationStopItem {
  id: string;
  sequence: number;
  stopType: string;
  shortName: string;
  canonicalName: string | null;
}

export interface QuotationListItem {
  id: string;
  quotationNumber: number | null;
  name: string;
  customerName: string;
  customerId: string;
  vehicleClass: string;
  lineType: string;
  operationType: string;
  pricingBasis: string;
  rate: number;
  driverPayout: number | null;
  currency: string;
  validFrom: string | null;
  validTo: string | null;
  isActive: boolean;
  validityStatus: QuotationValidityStatus;
  firstStop: string;
  lastStop: string;
  stopsCount: number;
  intermediateStopsText: string | null;
  isMonthly: boolean;
  dailyEquivalent: number | null;
  stops: QuotationStopItem[];
  createdAt: string;
}

export type QuotationFilterStatus = 'all' | 'Active' | 'Inactive' | 'Expired';

export type QuotationSortOption = 'route' | 'customer' | 'rate' | 'newest';

export interface QuotationListParams {
  search?: string;
  status?: QuotationFilterStatus;
  page?: number;
  per_page?: number;
}

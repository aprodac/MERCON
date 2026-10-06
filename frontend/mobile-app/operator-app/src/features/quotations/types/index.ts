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
  /** 0 = outbound, 1 = the return leg of a round trip. */
  legIndex: number;
  lat: number | null;
  lng: number | null;
}

export interface QuotationListItem {
  id: string;
  quotationNumber: number | null;
  name: string;
  customerName: string;
  customerId: string;
  /** The company's logo (absolute URL), or null for initials. */
  customerLogo: string | null;
  vehicleClass: string;
  lineType: string;
  /** lineType as a code: SINGLE_TRIP, ROUND_TRIP, 10_HRS, 12_HRS (or the cleaned free text). */
  lineTypeKey: string;
  operationType: string;
  /** operationType as one of the two billing types. */
  operationKey: 'Monthly' | 'Extra';
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
  /** Pickup and drop-off are the same place (a local / duty job). */
  isLocal: boolean;
  /** Whole days until valid_to (negative once passed); null = no end date. */
  daysLeft: number | null;
  /** Active, but ends within EXPIRING_SOON_DAYS. */
  expiringSoon: boolean;
  /** Trips booked on this rate, and the date of the latest one. */
  tripCount: number;
  lastTripAt: string | null;
  /** Active, but no trip on it for UNUSED_DAYS (or never, and older than that). */
  unused: boolean;
  /** Who added it; null for imported / older rows. */
  createdByName: string | null;
  createdAt: string;
}

/** Problems worth fixing, offered as one-tap filters. */
export type QuotationAttention = 'expiring' | 'nopay' | 'unused';

/** The status pills above the list. */
export type QuotationStatusFilter = 'all' | 'active' | 'expiring' | 'inactive';

/** The Filters sheet: every set empty = no filter on that field. */
export interface QuotationFilters {
  operation: string[];
  lineType: string[];
  truck: string[];
  basis: string[];
  /** User names; '' = not recorded. */
  creator: string[];
  /** QuotationAttention values. */
  attention: string[];
}

export const EMPTY_QUOTATION_FILTERS: QuotationFilters = { operation: [], lineType: [], truck: [], basis: [], creator: [], attention: [] };

export type QuotationFilterStatus = 'all' | 'Active' | 'Inactive' | 'Expired';

export type QuotationSortOption = 'route' | 'customer' | 'rate' | 'rate_low' | 'newest' | 'used';

export interface QuotationListParams {
  search?: string;
  status?: QuotationFilterStatus;
  page?: number;
  per_page?: number;
}

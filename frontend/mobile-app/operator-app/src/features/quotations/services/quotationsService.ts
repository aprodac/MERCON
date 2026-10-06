/**
 * Commercial Quotations business logic — pure transforms over API data.
 */
import { lineTypeLabel, normalizeBillingTypeToken, normalizeLineTypeToken } from '@mercon/shared-types';
import { resolveMediaUrl } from '@mercon/mobile-shared/lib/media';
import type { RawQuotation } from '../api/quotationsApi';
import type { QuotationFilters, QuotationListItem, QuotationSortOption, QuotationStatusFilter, QuotationStopItem, QuotationValidityStatus } from '../types';

/** An active quotation ending within this many days is flagged "Expires in N days". */
export const EXPIRING_SOON_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export function toQuotationListItem(raw: RawQuotation): QuotationListItem {
  const now = new Date();
  const validFrom = raw.valid_from ? new Date(raw.valid_from) : null;
  const validTo = raw.valid_to ? new Date(raw.valid_to) : null;

  const isExpired = validTo ? validTo < now : false;
  const isFuture = validFrom ? validFrom > now : false;

  let validityStatus: QuotationValidityStatus = 'Active';
  if (!raw.is_active) {
    validityStatus = 'Inactive';
  } else if (isExpired) {
    validityStatus = 'Expired';
  } else if (isFuture) {
    validityStatus = 'Future';
  }

  const rawStops = raw.stops ?? [];
  const stops: QuotationStopItem[] = rawStops.map((s) => {
    const shortName = s.source_label || s.location?.name || 'Location';
    const canonicalName =
      s.location?.name && s.location.name.trim().toLowerCase() !== shortName.trim().toLowerCase()
        ? s.location.name
        : null;
    return {
      id: s.id,
      sequence: s.sequence,
      stopType: s.stop_type,
      shortName,
      canonicalName,
      legIndex: s.leg_index ?? 0,
      lat: s.location?.lat ?? null,
      lng: s.location?.lng ?? null,
    };
  });

  let firstStop = 'Origin';
  let lastStop = 'Destination';

  if (stops.length > 0) {
    firstStop = stops[0].shortName;
    lastStop = stops[stops.length - 1].shortName;
  } else if (raw.name) {
    const parts = raw.name.split('->').map((p) => p.trim());
    if (parts.length >= 2) {
      firstStop = parts[0];
      lastStop = parts[parts.length - 1];
    } else {
      firstStop = raw.name;
    }
  }

  const stopsCount = Math.max(stops.length, 2);
  const intermediateStops = stops.slice(1, -1).map((s) => s.shortName);
  let intermediateStopsText: string | null = null;
  if (intermediateStops.length > 0) {
    if (intermediateStops.length <= 2) {
      intermediateStopsText = `via ${intermediateStops.join(', ')}`;
    } else {
      intermediateStopsText = `via ${intermediateStops[0]}, ${intermediateStops[1]}...`;
    }
  }

  const rawRate = Number(raw.rate ?? 0);
  const isMonthly = raw.pricing_basis === 'PER_TRIP'
    ? false
    : raw.pricing_basis === 'PER_MONTH'
    ? true
    : (raw.operation_type || '').toLowerCase().includes('monthly');

  const dailyEquivalent = isMonthly && rawRate > 0 ? rawRate / 30 : null;
  const daysLeft = validTo ? Math.ceil((validTo.getTime() - now.getTime()) / DAY_MS) : null;
  const lineTypeKey = normalizeLineTypeToken(raw.line_type) || 'SINGLE_TRIP';

  return {
    id: raw.id,
    quotationNumber: raw.quotation_number ?? null,
    name: raw.name || `${firstStop} → ${lastStop}`,
    customerName: raw.customer?.name ?? 'Customer',
    customerId: raw.customerId,
    customerLogo: resolveMediaUrl(raw.customer?.logo_url),
    vehicleClass: raw.vehicle_class || raw.source_vehicle_label || 'Standard',
    // Older quotations store words ("Single Trip"), newer ones the code ("SINGLE_TRIP").
    lineType: raw.line_type && /^[A-Z0-9_]+$/.test(raw.line_type) ? lineTypeLabel(lineTypeKey) : raw.line_type || 'Single Trip',
    lineTypeKey,
    operationType: raw.operation_type || 'Extra',
    operationKey: raw.operation_type ? normalizeBillingTypeToken(raw.operation_type) : 'Extra',
    pricingBasis: raw.pricing_basis || (isMonthly ? 'PER_MONTH' : 'PER_TRIP'),
    rate: rawRate,
    driverPayout: raw.driver_payout != null ? Number(raw.driver_payout) : null,
    currency: raw.currency || 'SAR',
    validFrom: raw.valid_from ?? null,
    validTo: raw.valid_to ?? null,
    isActive: raw.is_active,
    validityStatus,
    firstStop,
    lastStop,
    stopsCount,
    intermediateStopsText,
    isMonthly,
    dailyEquivalent,
    stops,
    isLocal: firstStop.trim().toLowerCase() === lastStop.trim().toLowerCase(),
    daysLeft,
    expiringSoon: validityStatus === 'Active' && daysLeft !== null && daysLeft <= EXPIRING_SOON_DAYS,
    tripCount: raw.trip_count ?? 0,
    lastTripAt: raw.last_trip_at ?? null,
    createdAt: raw.createdAt,
  };
}

/** A per-trip rate's margin over the driver's pay; null when it can't be worked out (monthly, no pay). */
export function marginOf(q: QuotationListItem): number | null {
  return !q.isMonthly && q.driverPayout !== null ? q.rate - q.driverPayout : null;
}

/** Status pills: does the quotation belong to this pill? */
export function matchesStatus(q: QuotationListItem, status: QuotationStatusFilter): boolean {
  switch (status) {
    case 'active': return q.validityStatus === 'Active';
    case 'expiring': return q.expiringSoon;
    case 'inactive': return q.validityStatus !== 'Active';
    default: return true;
  }
}

/** The Filters sheet: every chosen field must match one of its picked values. */
export function matchesFilters(q: QuotationListItem, f: QuotationFilters): boolean {
  if (f.operation.length && !f.operation.includes(q.operationKey)) return false;
  if (f.lineType.length && !f.lineType.includes(q.lineTypeKey)) return false;
  if (f.truck.length && !f.truck.includes(q.vehicleClass)) return false;
  if (f.basis.length && !f.basis.includes(q.isMonthly ? 'PER_MONTH' : 'PER_TRIP')) return false;
  return true;
}

export const filterCount = (f: QuotationFilters) => f.operation.length + f.lineType.length + f.truck.length + f.basis.length;

/** Text a route search matches: every stop, the truck and trip type, the reference. */
export function routeText(q: QuotationListItem): string {
  return [...q.stops.map((s) => `${s.shortName} ${s.canonicalName ?? ''}`), q.firstStop, q.lastStop, q.name, q.vehicleClass, q.lineType, q.operationKey, q.quotationNumber ?? '']
    .join(' ')
    .toLowerCase();
}

/** Stops of the outbound leg (a round trip's return leg repeats them backwards). */
export function outboundStops(q: QuotationListItem): QuotationStopItem[] {
  const out = q.stops.filter((s) => s.legIndex === 0);
  return out.length >= 2 ? out : q.stops;
}

/** "3 days ago", "2 months ago" — for "last used". */
export function agoText(iso: string | null): string {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
  if (days < 0) return 'upcoming';
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} ${months === 1 ? 'month' : 'months'} ago`;
  const years = Math.floor(days / 365);
  return `${years} ${years === 1 ? 'year' : 'years'} ago`;
}

export function formatCurrency(amount: number | null | undefined, currency = 'SAR'): string {
  if (amount === null || amount === undefined || isNaN(amount)) return '—';
  return `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function formatValidityRange(validFrom: string | null, validTo: string | null): string {
  const fromStr = validFrom ? new Date(validFrom).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : null;
  const toStr = validTo ? new Date(validTo).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Ongoing';
  if (fromStr) return `${fromStr} → ${toStr}`;
  return 'Ongoing';
}

export function sortQuotations(quotations: QuotationListItem[], sort: QuotationSortOption): QuotationListItem[] {
  const sorted = [...quotations];
  switch (sort) {
    case 'newest':
      return sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    case 'rate':
      return sorted.sort((a, b) => b.rate - a.rate);
    case 'rate_low':
      return sorted.sort((a, b) => a.rate - b.rate);
    case 'used':
      return sorted.sort((a, b) => b.tripCount - a.tripCount || (b.lastTripAt ?? '').localeCompare(a.lastTripAt ?? ''));
    case 'customer':
      return sorted.sort((a, b) => a.customerName.localeCompare(b.customerName));
    case 'route':
    default:
      return sorted.sort((a, b) => a.firstStop.localeCompare(b.firstStop) || a.lastStop.localeCompare(b.lastStop) || a.rate - b.rate);
  }
}

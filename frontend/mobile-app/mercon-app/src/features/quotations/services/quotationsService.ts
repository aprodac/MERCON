/**
 * Commercial Quotations business logic — pure transforms over API data.
 */
import type { RawQuotation } from '../api/quotationsApi';
import type { QuotationListItem, QuotationSortOption, QuotationStopItem, QuotationValidityStatus } from '../types';

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

  return {
    id: raw.id,
    quotationNumber: raw.quotation_number ?? null,
    name: raw.name || `${firstStop} → ${lastStop}`,
    customerName: raw.customer?.name ?? 'Customer',
    customerId: raw.customerId,
    vehicleClass: raw.vehicle_class || raw.source_vehicle_label || 'Standard',
    lineType: raw.line_type || 'Single Trip',
    operationType: raw.operation_type || 'Extra',
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
    createdAt: raw.createdAt,
  };
}

export function formatCurrency(amount: number | null | undefined, currency = 'SAR'): string {
  if (amount === null || amount === undefined || isNaN(amount)) return '—';
  return `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
    case 'customer':
      return sorted.sort((a, b) => a.customerName.localeCompare(b.customerName));
    case 'route':
    default:
      return sorted.sort((a, b) => a.firstStop.localeCompare(b.firstStop));
  }
}

import type { TripReportFieldKey } from '@mercon/shared-types';

/**
 * Header spellings a customer's own template is likely to use for each
 * TRIP_REPORT_FIELDS key, used only to produce a first-draft mapping
 * suggestion in `inspectTemplate`. The saved layout a human confirms in the
 * mapping editor is what generation actually reads — this table never runs
 * again after that point.
 *
 * Matched by whole-word token overlap (see `suggestField` below), not raw
 * substring — a header/alias only match if they share whole words, which is
 * what stops a short alias like "to" from matching inside an unrelated word
 * like "ton".
 *
 * Normalisation matches importUtils.ts's `normalise()` on the frontend:
 * lowercase, strip `*`, strip parenthesised unit hints, collapse punctuation
 * to spaces.
 */
export const TRIP_FIELD_ALIASES: Record<TripReportFieldKey, string[]> = {
  serial: ['s l', 'sl', 'sl no', 'serial', 'sr no', 'no', 'row'],
  ref_id: ['job', 'job no', 'ref', 'ref id', 'trip no', 'reference', 'reference no', 'uuid', 'uuid number', 'departure id', 'uuid departure id'],
  awb_number: ['awb', 'awb no', 'awb number', 'shipment', 'shipment no', 'shipment number', 'waybill', 'waybill no', 'waybill number', 'tracking no', 'tracking number', 'consignment no'],
  date: ['date', 'trip date', 'planned start', 'planned date', 'start date', 'scheduled date'],
  driver_name: ['driver', 'driver name', 'assigned driver', 'driver full name'],
  driver_phone: ['mobile', 'mobile number', 'driver phone', 'contact number', 'phone'],
  vehicle_plate: ['vehicle no', 'vehicle plate', 'vehicle', 'plate', 'truck plate', 'plate number', 'vehicle number', 'vehcile number', 'vehcile no', 'vehcile plate', 'vehcile'],
  vehicle_type: ['vehicle type', 'truck type', 'body type', 'asset type', 'vehcile type', 'vechicle type', 'vehical type'],
  carrier_name: ['carrier', 'carrier 3rd party', 'carrier name', '3rd party', 'provider', 'vendor name', 'vendor'],
  customer_name: ['sender', 'sender customer', 'customer', 'customer name', 'company', 'company name', 'client'],
  receiver: ['receiver', 'consignee', 'destination party'],
  // iMile sheets head these "出发地 start" / "目的地 destination"; the Chinese is stripped by normaliseHeader.
  origin: ['origin', 'from', 'pickup', 'pickup city', 'starting point', 'start', 'start point', 'loading point'],
  destination: ['destination', 'to', 'dropoff', 'drop off', 'delivery city', 'end', 'end point', 'unloading point'],
  total_charges: ['total charges', 'extra charges', 'surcharges', 'additional charges', 'waiting labor charges', 'additional stops', 'vat', 'tax'],
  billing_amount: ['billing amount', 'amount', 'price', 'rate', 'charges', 'charge', 'rental charges'],
  total_amount: ['total amount', 'total', 'inc vat', 'total inc vat', 'inc tax', 'total inc tax'],
  driver_payout: ['trip charges', 'trip charge', 'driver payout', 'driver charges'],
  balance_amount: ['balance amount', 'balance', 'net'],
  status: ['status', 'trip status'],
  rate_category: ['rate category', 'category', 'rate type', 'trip type', 'trip category', 'rental method', 'rental', 'method'],
};

export const normaliseHeader = (header: string): string =>
  String(header ?? '')
    .toLowerCase()
    .replace(/\*/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Below this token-overlap ratio, a partial alias match is rejected rather
 * than guessed at — e.g. alias "no" against header "no of vehicles" only
 * overlaps 1 of 3 header words (ratio ≈0.33), too weak to trust.
 */
const MIN_OVERLAP_RATIO = 0.5;

/**
 * Connector words that show up as one half of a two-word alias across
 * MULTIPLE different fields (driver_name/carrier_name/customer_name all
 * have a "___ name" alias; driver_phone/vehicle_plate both have a
 * "___ number" alias; etc). A header that shares only one of these words
 * with an alias — e.g. "Vendor Name" vs "Driver Name", overlapping only on
 * "name" — isn't actually describing that field; the header's real,
 * distinguishing word ("vendor") just isn't in any alias list. Requiring at
 * least one non-generic overlapping word is what stops that from resolving
 * to whichever field happens to be declared first.
 */
const GENERIC_TOKENS = new Set(['name', 'number', 'type', 'amount', 'charges']);

/** Best-guess field for a template header, or null if nothing matches well enough. */
export function suggestField(header: string): TripReportFieldKey | null {
  const norm = normaliseHeader(header);
  if (!norm) return null;

  // Exact match (the whole header equals a whole alias) always wins outright.
  for (const [field, aliases] of Object.entries(TRIP_FIELD_ALIASES) as [TripReportFieldKey, string[]][]) {
    if (aliases.includes(norm)) return field;
  }

  // Partial match by whole-word token overlap, scored by the overlap ratio
  // relative to the larger of the header's/alias's word count — the highest-
  // scoring alias across ALL fields wins, not the first field whose alias
  // happens to appear (so, e.g., "type of vehicle" correctly resolves to
  // vehicle_type via its 2-of-3-word match on alias "vehicle type", beating
  // vehicle_plate's 1-of-3-word match on the bare alias "vehicle").
  const headerTokens = new Set(norm.split(/\s+/).filter(Boolean));
  let best: { field: TripReportFieldKey; ratio: number; aliasTokenCount: number } | null = null;

  for (const [field, aliases] of Object.entries(TRIP_FIELD_ALIASES) as [TripReportFieldKey, string[]][]) {
    for (const alias of aliases) {
      const aliasTokens = alias.split(/\s+/).filter(Boolean);
      if (aliasTokens.length === 0) continue;
      const overlapTokens = aliasTokens.filter((t) => headerTokens.has(t));
      if (overlapTokens.length === 0) continue;
      // All shared words are generic connectors ("name", "number", ...) —
      // not a real match, just two headers that both happen to end in the
      // same structural word. Reject outright rather than guess.
      if (!overlapTokens.some((t) => !GENERIC_TOKENS.has(t))) continue;
      const ratio = overlapTokens.length / Math.max(headerTokens.size, aliasTokens.length);
      if (ratio < MIN_OVERLAP_RATIO) continue;
      const better = !best || ratio > best.ratio || (ratio === best.ratio && aliasTokens.length > best.aliasTokenCount);
      if (better) best = { field, ratio, aliasTokenCount: aliasTokens.length };
    }
  }
  return best?.field ?? null;
}

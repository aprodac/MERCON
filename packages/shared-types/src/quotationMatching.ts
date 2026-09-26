/**
 * Pure quotation matching & normalization helpers shared across web and mobile.
 */

export interface QuotationMatchLocation {
  id?: string | null;
  name?: string | null;
  address?: string | null;
}

export interface QuotationMatchStop {
  locationId?: string | null;
  location_name?: string | null;
  source_label?: string | null;
  location?: QuotationMatchLocation | null;
}

export interface QuotationMatchTarget {
  id: string;
  origin_name?: string | null;
  destination_name?: string | null;
  originLocationId?: string | null;
  destinationLocationId?: string | null;
  origin_location_id?: string | null;
  destination_location_id?: string | null;
  originLocation?: QuotationMatchLocation | null;
  destinationLocation?: QuotationMatchLocation | null;
  stops?: QuotationMatchStop[] | null;
  vehicle_class?: string | null;
  vehicle_type?: string | null;
  source_vehicle_label?: string | null;
  line_type?: string | null;
  rate_category?: string | null;
  operation_type?: string | null;
  billing_type?: string | null;
  rate?: number | null;
  driver_payout?: number | null;
  valid_from?: string | Date | null;
  valid_to?: string | Date | null;
  is_active?: boolean | null;
}

export function normalizeLocationNameToken(s?: string | null): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[\s,_()[\]\/{}\-.]/g, '');
}

export function normalizeLineTypeToken(s?: string | null): string {
  if (!s) return '';
  const str = String(s).toUpperCase().replace(/_/g, ' ');
  if (str.includes('10')) return '10_HRS';
  if (str.includes('12')) return '12_HRS';
  if (str.includes('ROUND')) return 'ROUND_TRIP';
  if (str.includes('SINGLE')) return 'SINGLE_TRIP';
  return str.replace(/[\s,_()[\]\/{}\-.]/g, '');
}

export function normalizeBillingTypeToken(val?: string | null): 'Monthly' | 'Extra' {
  if (!val) return 'Monthly';
  const s = String(val).toUpperCase().trim();
  if (/\b(EXTRA|SPOT|ADHOC)\b/i.test(s)) return 'Extra';
  return 'Monthly';
}

export function matchLocationToken(cardLocRaw?: string | null, targetLocRaw?: string | null): boolean {
  if (!cardLocRaw || !targetLocRaw) return false;
  const cleanCard = normalizeLocationNameToken(cardLocRaw);
  const cleanTarget = normalizeLocationNameToken(targetLocRaw);
  if (!cleanCard || !cleanTarget) return false;
  if (cleanCard === cleanTarget) return true;
  if (cleanCard.includes(cleanTarget) || cleanTarget.includes(cleanCard)) return true;

  const getTokens = (s: string) =>
    s
      .toLowerCase()
      .split(/[\s,_()[\]\/{}\-.]+/)
      .filter((t) => t.length > 2 && !['al', 'el', 'the', 'station', 'centre', 'center', 'hub'].includes(t));

  const cardTokens = getTokens(cardLocRaw);
  const targetTokens = getTokens(targetLocRaw);
  if (cardTokens.length === 0 || targetTokens.length === 0) return false;

  return cardTokens.some((ct) => targetTokens.some((tt) => ct === tt || ct.includes(tt) || tt.includes(ct)));
}

export function findMatchingQuotation<T extends QuotationMatchTarget>(
  quotations: T[],
  params: {
    originLocationId?: string | null;
    destinationLocationId?: string | null;
    originName?: string | null;
    destinationName?: string | null;
    vehicleType?: string | null;
    rateCategory?: string | null;
    billingType?: string | null;
    targetDate?: string | Date | null;
  }
): T | null {
  const { originLocationId, destinationLocationId, originName, destinationName, vehicleType, rateCategory, billingType, targetDate } = params;

  if ((!originName && !originLocationId) || (!destinationName && !destinationLocationId) || quotations.length === 0) {
    return null;
  }

  const vNorm = normalizeLocationNameToken(vehicleType);
  const targetC = normalizeLineTypeToken(rateCategory);
  const targetB = normalizeBillingTypeToken(billingType);

  const checkValidity = (q: T) => {
    if (!targetDate) return true;
    const t = new Date(targetDate).getTime();
    if (isNaN(t)) return true;
    if (q.valid_from && new Date(q.valid_from).getTime() > t) return false;
    if (q.valid_to && new Date(q.valid_to).getTime() < t) return false;
    return true;
  };

  const matchLane = (q: T) => {
    const firstStop = q.stops && q.stops.length > 0 ? q.stops[0] : null;
    const lastStop = q.stops && q.stops.length > 1 ? q.stops[q.stops.length - 1] : firstStop;

    const qO = String(
      firstStop?.source_label ||
      firstStop?.location_name ||
      firstStop?.location?.name ||
      q.origin_name ||
      q.originLocation?.name ||
      q.originLocationId ||
      q.origin_location_id ||
      ''
    );
    const qD = String(
      lastStop?.source_label ||
      lastStop?.location_name ||
      lastStop?.location?.name ||
      q.destination_name ||
      q.destinationLocation?.name ||
      q.destinationLocationId ||
      q.destination_location_id ||
      ''
    );

    const qOriginLocId = firstStop?.locationId || firstStop?.location?.id || q.originLocationId || q.origin_location_id;
    const qDestLocId = lastStop?.locationId || lastStop?.location?.id || q.destinationLocationId || q.destination_location_id;

    if (originLocationId && destinationLocationId && qOriginLocId && qDestLocId) {
      if (qOriginLocId === originLocationId && qDestLocId === destinationLocationId) {
        return true;
      }
    }

    return matchLocationToken(qO, originName || '') && matchLocationToken(qD, destinationName || '');
  };

  const matched = quotations.find((q) => {
    if (q.is_active === false) return false;
    if (!checkValidity(q)) return false;
    if (!matchLane(q)) return false;

    const qV = normalizeLocationNameToken(q.vehicle_class || q.vehicle_type || q.source_vehicle_label);
    const qC = normalizeLineTypeToken(q.rate_category || q.line_type);
    const qB = normalizeBillingTypeToken(q.operation_type || q.billing_type);

    const vMatch = !vNorm || !qV || qV === vNorm;
    const cMatch = !targetC || !qC || qC === targetC;
    const bMatch = !targetB || !qB || qB === targetB;

    return vMatch && cMatch && bMatch;
  });

  return matched || null;
}

// ─── Full-route matching (every stop, every leg) ─────────────────────────────

/** One stop of a route: a Location id and/or a display name. */
export interface RouteStopRef {
  id?: string | null;
  name?: string | null;
}

/** A trip route split into legs: [outbound] or [outbound, return], each in stop order. */
export type RouteLegs = RouteStopRef[][];

interface QuotationStopLike {
  locationId?: string | null;
  location_id?: string | null;
  location_name?: string | null;
  source_label?: string | null;
  sequence?: number | null;
  stop_sequence?: number | null;
  leg_index?: number | null;
  location?: QuotationMatchLocation | null;
}

const refOfQuotationStop = (s: QuotationStopLike): RouteStopRef => ({
  id: s.locationId || s.location_id || s.location?.id || null,
  name: s.source_label || s.location_name || s.location?.name || null,
});

/** Two stops are the same place: by Location id when both have one, otherwise by name. */
export function sameRouteStop(a: RouteStopRef, b: RouteStopRef): boolean {
  if (a.id && b.id) return a.id === b.id;
  return matchLocationToken(a.name, b.name);
}

/** A quotation's stops as legs, in order. Quotations without leg_index are treated as one outbound leg. */
export function quotationRouteLegs(q: { stops?: QuotationStopLike[] | null }): RouteLegs {
  const stops = [...(q.stops ?? [])].sort(
    (a, b) => (a.leg_index ?? 0) - (b.leg_index ?? 0) || (a.sequence ?? a.stop_sequence ?? 0) - (b.sequence ?? b.stop_sequence ?? 0),
  );
  const out: RouteStopRef[] = [];
  const ret: RouteStopRef[] = [];
  for (const s of stops) ((s.leg_index ?? 0) === 1 ? ret : out).push(refOfQuotationStop(s));
  return ret.length > 0 ? [out, ret] : [out];
}

/** Trip stops (DB rows or request payload) as legs, in order. */
export function tripRouteLegs(stops: QuotationStopLike[] | null | undefined): RouteLegs {
  return quotationRouteLegs({ stops: stops ?? [] });
}

const legsEqual = (a: RouteStopRef[], b: RouteStopRef[]) =>
  a.length === b.length && a.every((s, i) => sameRouteStop(s, b[i]));

/**
 * A quotation matches a trip only if EVERY stop matches, per leg and in order:
 * the outbound leg (origin → stops → delivery) and, for a round trip, the
 * return leg too (return loading → stops → final drop). Adding, removing or
 * reordering any stop — including a return-leg stop — makes it a different
 * route that needs its own quotation.
 *
 * A round-trip quotation that stores only its outbound leg (older quotations)
 * implies the plain return B → A.
 */
export function quotationMatchesRoute(
  q: { stops?: QuotationStopLike[] | null },
  trip: RouteLegs,
  isRoundTrip: boolean,
): boolean {
  const [qOut, qRetStored] = quotationRouteLegs(q);
  const [tOut, tRet] = trip;
  if (!qOut || qOut.length < 2 || !tOut || tOut.length < 2) return false;
  if (!legsEqual(qOut, tOut)) return false;
  if (!isRoundTrip) return true;
  const qRet = qRetStored ?? [qOut[qOut.length - 1], qOut[0]];
  const tripRet = tRet && tRet.length >= 2 ? tRet : [tOut[tOut.length - 1], tOut[0]];
  return legsEqual(qRet, tripRet);
}

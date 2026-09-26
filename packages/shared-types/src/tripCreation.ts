/**
 * Create-trip logic shared by the web dashboard wizard and the operator app,
 * so both build the same rows, save the same quotations and apply the same
 * checks. Pure TypeScript — no React, no date library: the caller passes in
 * how to turn a local date + time into UTC (the web uses date-fns-tz, the
 * operator app uses `zonedWallTimeToUtcIso` below).
 */
import { buildTripStops, isRoundTripCategory, type BuiltTripStop } from './tripRoute';
import { quotationMatchesRoute, type RouteLegs, type RouteStopRef } from './quotationMatching';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(str?: string | null): boolean {
  if (!str) return false;
  return UUID_RE.test(str.trim());
}

const safeUuid = (id?: string | null): string | null => (id && isUuid(id) ? id : null);

/* ─── Taxonomy labels ───────────────────────────────────────────────────── */

/** Display names for LINE_TYPES. A new trip type is added here and in LINE_TYPES — both apps pick it up. */
export const LINE_TYPE_LABELS: Record<string, string> = {
  SINGLE_TRIP: 'Single trip',
  ROUND_TRIP: 'Round trip',
  '10_HRS': '10 hours duty',
  '12_HRS': '12 hours duty',
};

export function lineTypeLabel(value?: string | null): string {
  if (!value) return '';
  return LINE_TYPE_LABELS[value] ?? value;
}

/** Truck classes a trip / quotation is priced for (same defaults as the web taxonomy). */
export const TRUCK_CLASSES = ['3-4 TON', '5 TON', '8 TON', '10 TON', '20 TON', '40 FEET'] as const;

/** A free-text class ("6.5M-10TON", "10 ton") as one of TRUCK_CLASSES; unknown → '10 TON'. */
export function normalizeTruckClass(val?: string | null): string {
  if (!val) return '10 TON';
  const s = String(val).toUpperCase().replace(/_/g, ' ').trim();
  if (/\b(40\s*FEET|40\s*FT|CONTAINER)\b/i.test(s)) return '40 FEET';
  if (/\b(20\s*TON|24\s*TON|13\.5M[-_]20TON)\b/i.test(s)) return '20 TON';
  if (/\b(10\s*TON|6\.5M[-_]10TON)\b/i.test(s)) return '10 TON';
  if (/\b(8\s*TON)\b/i.test(s)) return '8 TON';
  if (/\b(5\s*TON|5M[-_]5TON)\b/i.test(s)) return '5 TON';
  if (/\b(3[-–]?4\s*TON|3TON\/4TON|3\s*TON|4\s*TON)\b/i.test(s)) return '3-4 TON';
  return '10 TON';
}

/** A vehicle's class from its capacity, falling back to its asset type text. */
export function truckClassOfVehicle(v: { capacity_kg?: number | null; asset_type?: string | null }): string {
  const kg = v.capacity_kg;
  if (kg != null && kg > 0) {
    const tons = kg / 1000;
    if (tons <= 4) return '3-4 TON';
    if (tons <= 5) return '5 TON';
    if (tons <= 10) return '10 TON';
    if (tons <= 20) return '20 TON';
    return '40 FEET';
  }
  return normalizeTruckClass(v.asset_type);
}

/* ─── Route ─────────────────────────────────────────────────────────────── */

export interface TripSlotRoute {
  origin?: string;
  originName?: string;
  originAddress?: string;
  originLocationId?: string | null;
  originLat?: number | null;
  originLng?: number | null;
  originPrecision?: string;
  updateCanonicalOrigin?: boolean;

  destination?: string;
  destinationName?: string;
  destinationAddress?: string;
  destinationLocationId?: string | null;
  destinationLat?: number | null;
  destinationLng?: number | null;
  destinationPrecision?: string;
  updateCanonicalDestination?: boolean;

  intermediateLocations?: string[];
  intermediateLocationIds?: (string | null)[];

  returnOrigin?: string;
  returnOriginLocationId?: string | null;
  returnOriginLat?: number | null;
  returnOriginLng?: number | null;

  returnDestination?: string;
  returnDestinationLocationId?: string | null;
  returnDestinationLat?: number | null;
  returnDestinationLng?: number | null;

  returnIntermediateLocations?: string[];
  returnIntermediateLocationIds?: (string | null)[];
}

/** The slot's route as trip stops (outbound, plus the return leg for a round trip). */
export function buildStopsFromSlot(slot: TripSlotRoute, isRound: boolean): BuiltTripStop[] {
  const originStr = (slot.origin || '').trim();
  const destStr = (slot.destination || '').trim();

  const outboundStops = (slot.intermediateLocations || []).map((s) => (s || '').trim()).filter(Boolean);
  const returnStops = (slot.returnIntermediateLocations || []).map((s) => (s || '').trim()).filter(Boolean);

  const returnStart = (slot.returnOrigin || '').trim() || destStr;
  const returnEnd = (slot.returnDestination || '').trim() || originStr;

  return buildTripStops({
    origin: {
      name: slot.originName || originStr,
      address: slot.originAddress || null,
      location_id: safeUuid(slot.originLocationId),
      lat: slot.originLat ?? null,
      lng: slot.originLng ?? null,
      coordinate_precision: slot.originPrecision || (slot.originLat != null ? 'APPROXIMATE' : 'UNKNOWN'),
      update_canonical_location: slot.updateCanonicalOrigin === true,
    },
    intermediates: outboundStops.map((stopName: string, idx: number) => ({
      name: stopName,
      location_id: safeUuid(slot.intermediateLocationIds?.[idx]),
    })),
    destination: {
      name: slot.destinationName || destStr,
      address: slot.destinationAddress || null,
      location_id: safeUuid(slot.destinationLocationId),
      lat: slot.destinationLat ?? null,
      lng: slot.destinationLng ?? null,
      coordinate_precision: slot.destinationPrecision || (slot.destinationLat != null ? 'APPROXIMATE' : 'UNKNOWN'),
      update_canonical_location: slot.updateCanonicalDestination === true,
    },
    isRound,
    returnOrigin: isRound
      ? {
          name: returnStart,
          location_id: safeUuid(slot.returnOriginLocationId || (returnStart === destStr ? slot.destinationLocationId : null)),
          lat: slot.returnOriginLat ?? null,
          lng: slot.returnOriginLng ?? null,
        }
      : undefined,
    returnIntermediates: isRound
      ? returnStops.map((stopName: string, idx: number) => ({
          name: stopName,
          location_id: safeUuid(slot.returnIntermediateLocationIds?.[idx]),
        }))
      : undefined,
    returnDestination: isRound
      ? {
          name: returnEnd,
          location_id: safeUuid(slot.returnDestinationLocationId || (returnEnd === originStr ? slot.originLocationId : null)),
          lat: slot.returnDestinationLat ?? null,
          lng: slot.returnDestinationLng ?? null,
        }
      : undefined,
  });
}

/**
 * The route as legs for quotation matching: every stop, in order —
 * outbound [origin, …stops, destination] and, for a round trip, return
 * [return loading (default: destination), …return stops, final drop (default: origin)].
 */
export function routeLegsFromSlot(slot: TripSlotRoute, isRound: boolean): RouteLegs {
  // Some fields hold a Location id in the name slot — treat it as the id.
  const ref = (name?: string | null, id?: string | null): RouteStopRef => {
    const n = (name || '').trim();
    const resolvedId = safeUuid(id ?? null) ?? safeUuid(n);
    return { id: resolvedId, name: resolvedId && isUuid(n) ? null : n || null };
  };
  const origin = ref(slot.originName || slot.origin, slot.originLocationId);
  const destination = ref(slot.destinationName || slot.destination, slot.destinationLocationId);
  const mids = (names?: string[], ids?: (string | null)[]) =>
    (names || [])
      .map((n, i) => ({ n: (n || '').trim(), id: ids?.[i] ?? null }))
      .filter((x) => x.n || x.id)
      .map((x) => ref(x.n, x.id));
  const outbound = [origin, ...mids(slot.intermediateLocations, slot.intermediateLocationIds), destination];
  if (!isRound) return [outbound];
  const retStart = (slot.returnOrigin || '').trim() ? ref(slot.returnOrigin, slot.returnOriginLocationId) : destination;
  const retEnd = (slot.returnDestination || '').trim() ? ref(slot.returnDestination, slot.returnDestinationLocationId) : origin;
  return [outbound, [retStart, ...mids(slot.returnIntermediateLocations, slot.returnIntermediateLocationIds), retEnd]];
}

/* ─── Quotations ────────────────────────────────────────────────────────── */

export interface QuotationLike {
  id?: string;
  name?: string | null;
  rate?: number | string | null;
  base_price?: number | string | null;
  driver_payout?: number | string | null;
  driver_charge?: number | string | null;
  default_trip_charge?: number | string | null;
  line_type?: string | null;
  rate_category?: string | null;
  billing_type?: string | null;
  pricing_basis?: string | null;
  vehicle_type?: string | null;
  vehicle_class?: string | null;
  source_vehicle_label?: string | null;
  customer_id?: string | null;
  customerId?: string | null;
  stops?: any[] | null;
}

/**
 * The customer's quotations that cover exactly this route — every stop,
 * outbound and return, in order — and the same trip shape (round or not).
 * Adding a stop therefore leaves no match, which is what opens "Define quotation".
 */
export function quotationsForRoute<T extends QuotationLike>(quotations: T[], slot: TripSlotRoute, rateCategory: string): T[] {
  const isRound = isRoundTripCategory(rateCategory || '');
  const legs = routeLegsFromSlot(slot, isRound);
  return quotations.filter((q) => {
    if (isRound !== isRoundTripCategory(String(q.line_type || q.rate_category || ''))) return false;
    return quotationMatchesRoute(q as any, legs, isRound);
  });
}

/**
 * What a quotation puts into the form when it's applied: the customer rate
 * (the quotation's own rate — a monthly rate is divided per trip at submit),
 * the driver payout, and the truck class it was priced for.
 */
export function pricingFromQuotation(q: QuotationLike): {
  billingAmount: string;
  driverPayout: string;
  vehicleClass: string | null;
} | null {
  const rate = Number(q.rate ?? q.base_price ?? 0);
  if (!(rate > 0)) return null;
  const payout = q.driver_payout ?? q.driver_charge;
  return {
    billingAmount: String(rate),
    driverPayout: payout != null && payout !== '' ? String(payout) : '',
    vehicleClass: q.vehicle_type || q.vehicle_class || q.source_vehicle_label || null,
  };
}

export interface InlineQuotationContext {
  customerId: string;
  vehicleType: string;
  rateCategory: string;
  billingType: string;
  isThirdParty: boolean;
  /** Location ids resolved (or created) for origin / destination before saving. */
  originLocationId?: string | null;
  destinationLocationId?: string | null;
}

/** Fields of a trip slot that define a new quotation saved at submit. */
export interface QuotationSlotInput extends TripSlotRoute {
  origin: string;
  destination: string;
  billingAmount: string;
  tripCharges?: string;
  driverPayout?: string;
  pricingBasis?: string;
  rateReason?: string;
}

/**
 * The POST /quotations body for a price defined while creating a trip. It
 * stores every stop (and the return leg of a round trip) so it only ever
 * matches this exact route again.
 */
export function buildQuotationFromSlot(slot: QuotationSlotInput, ctx: InlineQuotationContext): Record<string, unknown> {
  const origin = (slot.origin || '').trim();
  const destination = (slot.destination || '').trim();
  const origId = ctx.originLocationId ?? slot.originLocationId ?? null;
  const destId = ctx.destinationLocationId ?? slot.destinationLocationId ?? null;

  const intermediateStops = (slot.intermediateLocations || []).map((locVal: string, idx: number) => {
    const locId = slot.intermediateLocationIds?.[idx] || (isUuid(locVal) ? locVal : null);
    return {
      sequence: idx + 2,
      location_id: locId || null,
      source_label: locVal || null,
      stop_type: 'Dropoff',
    };
  });

  const quotationStops: Array<Record<string, unknown>> = [
    { sequence: 1, leg_index: 0, location_id: origId || null, source_label: origin || null, stop_type: 'Pickup' },
    ...intermediateStops.map((st) => ({ ...st, leg_index: 0 })),
    { sequence: intermediateStops.length + 2, leg_index: 0, location_id: destId || null, source_label: destination || null, stop_type: 'Dropoff' },
  ];

  if (isRoundTripCategory(ctx.rateCategory)) {
    const retStartName = (slot.returnOrigin || '').trim() || destination;
    const retStartId = safeUuid(slot.returnOriginLocationId) || (retStartName === destination ? destId || null : null);
    const retEndName = (slot.returnDestination || '').trim() || origin;
    const retEndId = safeUuid(slot.returnDestinationLocationId) || (retEndName === origin ? origId || null : null);
    const retMids = (slot.returnIntermediateLocations || [])
      .map((locVal: string, idx: number) => ({
        locVal: (locVal || '').trim(),
        locId: slot.returnIntermediateLocationIds?.[idx] || (isUuid(locVal) ? locVal : null),
      }))
      .filter((x) => x.locVal || x.locId);
    let seq = quotationStops.length + 1;
    quotationStops.push({ sequence: seq++, leg_index: 1, location_id: retStartId, source_label: retStartName || null, stop_type: 'Pickup' });
    retMids.forEach((m) =>
      quotationStops.push({ sequence: seq++, leg_index: 1, location_id: m.locId || null, source_label: m.locVal || null, stop_type: 'Dropoff' }),
    );
    quotationStops.push({ sequence: seq++, leg_index: 1, location_id: retEndId, source_label: retEndName || null, stop_type: 'Dropoff' });
  }

  const driverPayout = ctx.isThirdParty
    ? null
    : slot.driverPayout !== undefined
    ? Number(slot.driverPayout)
    : Number(slot.tripCharges) || null;

  return {
    name: `${origin || 'Origin'} → ${destination || 'Destination'}`,
    rate: Number(slot.billingAmount),
    base_price: Number(slot.billingAmount),
    driver_payout: driverPayout,
    customerId: ctx.customerId,
    origin_location_id: origId || null,
    destination_location_id: destId || null,
    origin_name: origId ? null : origin || null,
    destination_name: destId ? null : destination || null,
    origin_lat: slot.originLat ?? null,
    origin_lng: slot.originLng ?? null,
    destination_lat: slot.destinationLat ?? null,
    destination_lng: slot.destinationLng ?? null,
    vehicle_class: ctx.vehicleType || null,
    source_vehicle_label: ctx.vehicleType || null,
    vehicle_type: ctx.vehicleType || null,
    line_type: ctx.rateCategory || null,
    billing_type: ctx.billingType || null,
    pricing_basis: slot.pricingBasis || 'Per Trip',
    stops: quotationStops,
    reason:
      slot.rateReason?.trim() ||
      `Created inline during trip dispatch for ${origin || 'origin'} → ${destination || 'destination'} (${ctx.vehicleType || 'Standard'})`,
    source: 'TRIP_CREATION',
  };
}

/* ─── Dates ─────────────────────────────────────────────────────────────── */

/** YYYY-MM-DD plus `days`, calendar arithmetic only (no timezone involved). */
export function addDaysToDateStr(dateStr: string, days: number): string {
  if (!dateStr) return dateStr;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Fixed offsets used when the runtime has no timezone database. */
const FALLBACK_TZ_OFFSET_MIN: Record<string, number> = {
  'Asia/Riyadh': 180,
  'Asia/Dubai': 240,
  'Asia/Kolkata': 330,
  UTC: 0,
};

function tzOffsetMs(utcMs: number, tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(new Date(utcMs));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
    if (Number.isNaN(asUtc)) throw new Error('bad parts');
    return asUtc - Math.floor(utcMs / 1000) * 1000;
  } catch {
    return (FALLBACK_TZ_OFFSET_MIN[tz] ?? 180) * 60000;
  }
}

/**
 * A wall-clock date (YYYY-MM-DD) + time (HH:mm) in `tz` as a UTC ISO string —
 * the same result as date-fns-tz `fromZonedTime`, without the dependency.
 * Without a time, the date is returned unchanged.
 */
export function zonedWallTimeToUtcIso(date: string, time: string | undefined, tz: string): string {
  if (!date || !time) return date;
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  // Take the offset that round-trips; in a DST gap neither does, so keep the first guess.
  // (In the repeated hour when clocks go back this picks the earlier instant — no DST in the Gulf.)
  const first = tzOffsetMs(wall, tz);
  const utc1 = wall - first;
  const second = tzOffsetMs(utc1, tz);
  if (second === first) return new Date(utc1).toISOString();
  const utc2 = wall - second;
  return new Date(tzOffsetMs(utc2, tz) === second ? utc2 : utc1).toISOString();
}

/* ─── Trip rows ─────────────────────────────────────────────────────────── */

export interface TripChargeInput {
  charge_type: string;
  amount: number;
}

/** A trip slot as both apps hold it in the create-trip form. */
export interface TripSlotDraft extends QuotationSlotInput {
  id: string;
  date: string;
  pickupTime: string;
  dropoffDate?: string;
  dropoffTime: string;
  isOvernight?: boolean;
  tripCharges: string;
  driverPayoutModified?: boolean;
  updateQuotationPayout?: boolean;
  saveAsQuotation?: boolean;
  saveAsRateCard?: boolean;
  rateMatched?: boolean;
  rateCardId?: string;
  matchedRateCard?: any;
  intermediateLocations: string[];
  intermediateStopFees?: string[];
  returnIntermediateStopFees?: string[];
}

export interface DayAssignmentInput {
  driverId?: string;
  vehicleId?: string;
  coDriverId?: string;
  driverPayoutOverride?: number;
  coDriverPayoutOverride?: number;
}

export interface TripRowsInput {
  customerId: string;
  slots: TripSlotDraft[];
  vehicleType: string;
  rateCategory: string;
  billingType: string;
  assignmentType: string;
  masterDriver: string;
  masterCoDriver: string;
  masterVehicle: string;
  thirdPartyProviderId: string;
  thirdPartyDriverName: string;
  thirdPartyDriverPhone: string;
  thirdPartyVehiclePlate: string;
  thirdPartyCost: string;
  awbNumber: string;
  /** Keyed by date, by `${date}::${slotId}` (several slots), or by slot id. */
  dayAssignments: Record<string, DayAssignmentInput>;
  /** Monthly operating dates (YYYY-MM-DD). */
  selectedDates: string[];
  /** Extra charges added to every trip created (kept apart from billing_amount). */
  charges?: TripChargeInput[];
  /** Local date + time → UTC ISO string in the deployment timezone. */
  toUtcIso: (date: string, time: string) => string;
  /** Used when a slot has no date. Defaults to today's UTC date. */
  todayStr?: string;
}

/** One row of POST /trips/bulk-import. */
export interface TripImportRow {
  customer_id: string;
  planned_start: string;
  planned_end?: string;
  driver_id?: string;
  co_driver_id?: string;
  vehicle_id?: string;
  is_third_party?: boolean;
  third_party_provider_id?: string;
  third_party_driver_name?: string;
  third_party_driver_phone?: string;
  third_party_vehicle_plate?: string;
  third_party_vehicle_type?: string;
  third_party_cost?: number;
  rate_category?: string;
  billing_type?: string;
  vehicle_type?: string;
  origin?: string;
  destination?: string;
  stops: BuiltTripStop[];
  billing_amount?: number;
  trip_charges?: number;
  driver_charge?: number;
  driver_payout?: number;
  co_driver_payout?: number;
  update_quotation_driver_payout?: boolean;
  rate_card_id?: string;
  awb_number?: string;
  status: 'Scheduled' | 'Completed' | 'InTransit' | 'Draft';
  charges?: Array<{ charge_type: string; rate: number; quantity: number; amount: number }>;
}

const isMonthlyBilling = (slot: TripSlotDraft, billingType: string) =>
  slot.pricingBasis === 'Per Month' || slot.pricingBasis === 'PER_MONTH' || (billingType || '').toLowerCase().includes('monthly');

/** The customer rate billed on one trip: a monthly rate is spread over 30 days. */
export function perTripBilling(slot: Pick<TripSlotDraft, 'billingAmount' | 'pricingBasis'>, billingType: string): number {
  const base = Number(slot.billingAmount) || 0;
  return isMonthlyBilling(slot as TripSlotDraft, billingType) && base > 0 ? base / 30 : base;
}

/**
 * The bulk-import rows for the form: one per slot, or one per slot per
 * operating date for a monthly contract.
 */
export function buildTripRows(input: TripRowsInput): TripImportRow[] {
  const {
    customerId, slots, vehicleType, rateCategory, billingType, assignmentType,
    masterDriver, masterCoDriver, masterVehicle, thirdPartyProviderId, thirdPartyDriverName,
    thirdPartyDriverPhone, thirdPartyVehiclePlate, thirdPartyCost, awbNumber, dayAssignments,
    selectedDates, toUtcIso,
  } = input;
  const todayStr = input.todayStr || new Date().toISOString().slice(0, 10);
  const charges = (input.charges || [])
    .filter((c) => c.charge_type?.trim() && Number(c.amount) > 0)
    .map((c) => ({ charge_type: c.charge_type.trim(), rate: Number(c.amount), quantity: 1, amount: Number(c.amount) }));

  const rows: TripImportRow[] = [];
  const isMonthlyMode = billingType === 'Monthly' && selectedDates.length > 0;
  const datesToSchedule: Array<string | null> = isMonthlyMode ? selectedDates : [null];
  const isRound = isRoundTripCategory(rateCategory);

  datesToSchedule.forEach((currentDateStr) => {
    slots.forEach((slot) => {
      const date = currentDateStr || slot.date || todayStr;
      const dateKey = slots.length > 1 ? `${date}::${slot.id}` : date;
      const assignment: DayAssignmentInput =
        dayAssignments[dateKey] || dayAssignments[date] || dayAssignments[slot.id] || { driverId: '', vehicleId: '' };

      const outboundFeesSum = (slot.intermediateStopFees || []).reduce((sum, f) => sum + (Number(f) || 0), 0);
      const returnFeesSum = (slot.returnIntermediateStopFees || []).reduce((sum, f) => sum + (Number(f) || 0), 0);
      const totalAmount = perTripBilling(slot, billingType) + outboundFeesSum + returnFeesSum;

      const origin = (slot.origin || '').trim();
      const destination = (slot.destination || '').trim();
      const structuredStops = buildStopsFromSlot(slot, isRound);

      let plannedEnd: string | undefined;
      if (slot.dropoffTime) {
        const isOvernightOrEarlier = slot.isOvernight || (slot.pickupTime && slot.dropoffTime <= slot.pickupTime);
        const targetDropoffDate = isOvernightOrEarlier
          ? addDaysToDateStr(date, 1)
          : slot.dropoffDate && slot.dropoffDate >= date
          ? slot.dropoffDate
          : date;
        plannedEnd = toUtcIso(targetDropoffDate, slot.dropoffTime);
      }

      const common = {
        customer_id: customerId,
        planned_start: toUtcIso(date, slot.pickupTime),
        planned_end: plannedEnd,
        rate_category: rateCategory || undefined,
        billing_type: billingType || undefined,
        vehicle_type: vehicleType || undefined,
        origin: origin || undefined,
        destination: destination || undefined,
        stops: structuredStops,
        billing_amount: totalAmount > 0 ? totalAmount : undefined,
        awb_number: awbNumber?.trim() || undefined,
        status: 'Scheduled' as const,
        ...(charges.length > 0 ? { charges } : {}),
      };

      if (assignmentType === 'third_party') {
        const costVal = thirdPartyCost ? Number(thirdPartyCost) : Number(slot.tripCharges) || 0;
        rows.push({
          ...common,
          is_third_party: true,
          third_party_provider_id: safeUuid(thirdPartyProviderId) || undefined,
          third_party_driver_name: thirdPartyDriverName.trim() || undefined,
          third_party_driver_phone: thirdPartyDriverPhone.trim() || undefined,
          third_party_vehicle_plate: thirdPartyVehiclePlate.trim() || undefined,
          third_party_vehicle_type: vehicleType || undefined,
          third_party_cost: costVal,
          trip_charges: costVal,
          rate_card_id: safeUuid(slot.rateCardId) || undefined,
        });
        return;
      }

      const pick = (dayValue?: string, master?: string) =>
        dayValue && dayValue !== 'unassigned'
          ? dayValue
          : master && master !== 'unassigned'
          ? master
          : undefined;
      const driverId = pick(assignment.driverId, masterDriver);
      const vehicleId = pick(assignment.vehicleId, masterVehicle);
      const coDriverId = pick(assignment.coDriverId, masterCoDriver);

      const baseRateCardPayout = Number(
        slot.driverPayout ?? slot.tripCharges ?? slot.matchedRateCard?.driver_payout ?? (slot as any).quotation?.driver_payout ?? 0,
      );
      const shouldUpdateQuotation = Boolean(slot.updateQuotationPayout || slot.driverPayoutModified);

      let finalDriverPayout = baseRateCardPayout;
      let finalCoDriverPayout = 0;
      if (coDriverId) {
        // Equal 50/50 split of the payout unless the day says otherwise.
        finalDriverPayout =
          assignment.driverPayoutOverride !== undefined
            ? Number(assignment.driverPayoutOverride)
            : Math.round((baseRateCardPayout / 2) * 100) / 100;
        finalCoDriverPayout =
          assignment.coDriverPayoutOverride !== undefined
            ? Number(assignment.coDriverPayoutOverride)
            : Math.round((baseRateCardPayout / 2) * 100) / 100;
      } else if (assignment.driverPayoutOverride !== undefined) {
        finalDriverPayout = Number(assignment.driverPayoutOverride);
      }

      rows.push({
        ...common,
        driver_id: safeUuid(driverId) || undefined,
        co_driver_id: safeUuid(coDriverId) || undefined,
        vehicle_id: safeUuid(vehicleId) || undefined,
        trip_charges: baseRateCardPayout,
        driver_charge: finalDriverPayout,
        driver_payout: finalDriverPayout,
        co_driver_payout: finalCoDriverPayout,
        update_quotation_driver_payout: shouldUpdateQuotation,
        rate_card_id: safeUuid(slot.rateCardId || slot.matchedRateCard?.id) || undefined,
      });
    });
  });

  return rows;
}

/* ─── Validation ────────────────────────────────────────────────────────── */

export interface TripValidationInput {
  customerId: string;
  slots: TripSlotDraft[];
  billingType: string;
  assignmentType: string;
  masterDriver: string;
  masterVehicle: string;
  thirdPartyProviderId: string;
  thirdPartyDriverName: string;
  thirdPartyCost: string;
  selectedDates: string[];
  toUtcIso: (date: string, time: string) => string;
}

export type TripValidationSection = 'customer' | 'route' | 'price' | 'schedule' | 'assignment';

export interface TripValidationIssue {
  section: TripValidationSection;
  /** Field key, suffixed with `-${slotId}` for per-slot fields. */
  field: string;
  message: string;
}

const hasValue = (v: unknown) => v !== undefined && v !== null && v !== '';

/**
 * Everything that must be right before a trip can be created. Sections let
 * each screen show only its own issues (e.g. the route step checks 'customer',
 * 'route' and 'price').
 */
export function validateTripDraft(input: TripValidationInput): TripValidationIssue[] {
  const issues: TripValidationIssue[] = [];
  const isMonthly = (input.billingType || '').toLowerCase() === 'monthly';
  const is3PL = input.assignmentType === 'third_party' || input.assignmentType === '3pl';

  if (!input.customerId) issues.push({ section: 'customer', field: 'customer', message: 'Customer is required' });

  if (!input.slots || input.slots.length === 0) {
    issues.push({ section: 'route', field: 'route', message: 'At least 1 route slot is required' });
  }

  (input.slots || []).forEach((slot, idx) => {
    const label = slot.origin && slot.destination ? `${slot.origin} → ${slot.destination}` : `Slot #${idx + 1}`;
    const key = (f: string) => `${f}-${slot.id}`;

    if (!slot.origin?.trim()) issues.push({ section: 'route', field: key('origin'), message: `${label}: Select an origin location` });
    if (!slot.destination?.trim()) issues.push({ section: 'route', field: key('destination'), message: `${label}: Select a destination location` });

    const hasRateMatched = Boolean(slot.matchedRateCard || slot.rateMatched);
    const hasBilling = hasValue(slot.billingAmount) && Number(slot.billingAmount) > 0;
    if (!hasRateMatched && !hasBilling) {
      issues.push({ section: 'price', field: key('billingAmount'), message: `${label}: Select a Commercial Quotation card or enter Customer Billing Rate` });
    }
    if (!is3PL) {
      const hasPayout =
        hasValue(slot.tripCharges) ||
        hasValue(slot.driverPayout) ||
        slot.matchedRateCard?.driver_payout != null ||
        slot.matchedRateCard?.default_trip_charge != null;
      if (!hasPayout) issues.push({ section: 'price', field: key('driverPayout'), message: `${label}: Enter Driver Payout / Charge` });
    }

    if (!isMonthly && !slot.date) issues.push({ section: 'schedule', field: key('date'), message: `${label}: Select a trip date` });
    if (!slot.pickupTime) issues.push({ section: 'schedule', field: key('pickup'), message: `${label}: Select pickup time` });
    if (!slot.dropoffTime) issues.push({ section: 'schedule', field: key('dropoff'), message: `${label}: Select drop-off time` });

    if (!isMonthly && slot.date && slot.pickupTime && slot.dropoffTime) {
      const dropoffDate = slot.dropoffDate || slot.date;
      if (dropoffDate < slot.date) {
        issues.push({ section: 'schedule', field: key('dropoff'), message: `${label}: Drop-off date cannot be before trip date` });
      } else {
        try {
          const start = new Date(input.toUtcIso(slot.date, slot.pickupTime)).getTime();
          const end = new Date(input.toUtcIso(dropoffDate, slot.dropoffTime)).getTime();
          if (isNaN(start) || isNaN(end) || end <= start) {
            issues.push({ section: 'schedule', field: key('dropoff'), message: `${label}: Drop-off time must be strictly after pickup time` });
          }
        } catch {
          issues.push({ section: 'schedule', field: key('dropoff'), message: `${label}: Invalid pickup or drop-off time format` });
        }
      }
    }
  });

  if (is3PL && (!input.thirdPartyCost || Number(input.thirdPartyCost) <= 0)) {
    issues.push({ section: 'assignment', field: 'thirdPartyCost', message: '3PL Cost (SAR) is required' });
  }

  if (isMonthly && input.selectedDates.length === 0) {
    issues.push({ section: 'schedule', field: 'selectedDates', message: 'Select at least 1 operating date on the calendar' });
  }

  if (is3PL) {
    if (!input.thirdPartyProviderId && !input.thirdPartyDriverName) {
      issues.push({ section: 'assignment', field: 'thirdPartyProvider', message: '3PL Logistics Partner selection is required' });
    }
  } else if (!input.masterDriver && !input.masterVehicle) {
    issues.push({ section: 'assignment', field: 'assignment', message: 'Select an assignment choice: Driver & Vehicle or Assign Later' });
  }

  return issues;
}

/* ─── Past-dated trips ──────────────────────────────────────────────────── */

/** The calendar date (YYYY-MM-DD) of an instant in `tz`. */
export function dateInZone(ms: number, tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms));
    const get = (t: string) => parts.find((p) => p.type === t)?.value;
    const y = get('year'), m = get('month'), d = get('day');
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    /* fall through */
  }
  return new Date(ms + (FALLBACK_TZ_OFFSET_MIN[tz] ?? 180) * 60000).toISOString().slice(0, 10);
}

/** How many rows start before `now`. */
export function countPastTrips(rows: Pick<TripImportRow, 'planned_start'>[], now: number = Date.now()): number {
  return rows.filter((r) => {
    const t = new Date(r.planned_start).getTime();
    return !isNaN(t) && t < now;
  }).length;
}

/**
 * Status for trips entered after the fact. Only rows that start before now
 * change: 'Completed' marks them done; 'Incomplete' keeps them live
 * (In Transit if they started today or yesterday, Draft if older).
 * Future rows always stay Scheduled.
 */
export function applyPastTripStatus<T extends Pick<TripImportRow, 'planned_start' | 'status'>>(
  rows: T[],
  choice: 'Completed' | 'Incomplete',
  tz: string,
  now: number = Date.now(),
): T[] {
  const yesterday = addDaysToDateStr(dateInZone(now, tz), -1);
  return rows.map((row) => {
    const t = new Date(row.planned_start).getTime();
    if (isNaN(t) || t >= now) return { ...row, status: 'Scheduled' };
    if (choice === 'Completed') return { ...row, status: 'Completed' };
    return { ...row, status: dateInZone(t, tz) < yesterday ? 'Draft' : 'InTransit' };
  });
}

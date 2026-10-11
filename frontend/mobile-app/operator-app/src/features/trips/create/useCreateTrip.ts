/**
 * Create-trip form state for the operator app. The rules — which quotation
 * fits a route, what gets checked, what the API receives — come from
 * @mercon/shared-types, the same code the web dashboard wizard runs.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LINE_TYPE_LABELS,
  addDaysToDateStr,
  applyMonthlyAssignmentStrategy,
  applyPastTripStatus,
  buildQuotationFromSlot,
  buildStopsFromSlot,
  buildTripRows,
  countPastTrips,
  dateInZone,
  isRoundTripCategory,
  normalizeBillingTypeToken,
  normalizeLineTypeToken,
  normalizeTruckClass,
  perTripBilling,
  pricingFromQuotation,
  quotationMatchesRoute,
  quotationsForRoute,
  returnLegDayOffsets,
  rosterClashes,
  routeLegsFromSlot,
  slotScheduleFor,
  truckClassOfVehicle,
  validateTripDraft,
  zonedWallTimeToUtcIso,
  type DayAssignmentInput,
  type TripChargeInput,
  type SlotStopPin,
  type TripSlotDraft,
  type TripValidationIssue,
} from '@mercon/shared-types';
import {
  operatorService,
  invalidateOperatorTrips,
  type OperatorCustomer,
  type OperatorDriverOption,
  type OperatorLocation,
  type OperatorQuotation,
  type OperatorSurchargeRule,
  type OperatorThirdPartyProvider,
  type OperatorTrip,
  type OperatorVehicleOption,
  type Previous3PLDriver,
  type ProviderRateMatch,
  type RecommendedDriver,
  type VehicleCompatibilityRule,
} from '../../../lib/operator';
import { estimateRoute, routeKeyOf, routePoints, type RouteEstimate } from './routeEstimate';

export type CreateTripStep = 1 | 2 | 3;
export type AssignmentType = 'own' | 'third_party';
export type MonthlyMode = 'single' | 'rotation' | 'per_day';
export type PriceState = 'no_route' | 'matched' | 'define';

export const UNASSIGNED = 'unassigned';

/** Which step owns each kind of problem. Driver payout is checked at the end — it isn't needed for 3PL. */
const STEP_OF: Record<TripValidationIssue['section'], CreateTripStep> = {
  customer: 1,
  route: 1,
  price: 1,
  schedule: 2,
  assignment: 3,
};

export interface LocationPick {
  name: string;
  locationId?: string | null;
  lat?: number | null;
  lng?: number | null;
}

/** A route this customer ran lately, offered as a one-tap start. */
export interface RecentRoute {
  key: string;
  origin: LocationPick;
  destination: LocationPick;
  stops: LocationPick[];
  count: number;
  lastUsed: number;
}

/** How a single trip's payout is shared with the co-driver; empty = 50/50. */
export interface CoDriverSplit {
  driverPayoutOverride?: number;
  coDriverPayoutOverride?: number;
}

/** A blank trip: no date or time is chosen for the operator. */
function emptySlot(): TripSlotDraft {
  return {
    id: 'slot-1',
    origin: '',
    destination: '',
    originLocationId: null,
    destinationLocationId: null,
    intermediateLocations: [],
    intermediateLocationIds: [],
    returnIntermediateLocations: [],
    returnIntermediateLocationIds: [],
    date: '',
    pickupTime: '',
    dropoffDate: '',
    dropoffTime: '',
    billingAmount: '',
    tripCharges: '',
    driverPayout: '',
    rateMatched: false,
    matchedRateCard: null,
    saveAsQuotation: false,
  };
}

/** A stop-fee list as long as its stops (older slots may hold fewer fees). */
const padFees = (fees: string[] | undefined, n: number) => Array.from({ length: n }, (_, i) => fees?.[i] ?? '');
/** A pin as the pin sheet hands it over. */
type PickedStopPin = { lat: number; lng: number; address: string | null; exact: boolean };

/** A search pick is approximate; a pasted link or a hand-placed pin is exact (owner rule 2026-10-03). */
const stopPinOf = (pin: PickedStopPin): SlotStopPin => ({
  lat: pin.lat,
  lng: pin.lng,
  address: pin.address,
  precision: pin.exact ? 'EXACT' : 'APPROXIMATE',
});

/** A stop-pin list as long as its stops; null = the stop uses its saved place's pin. */
const padPins = (pins: (SlotStopPin | null)[] | undefined, n: number) => Array.from({ length: n }, (_, i) => pins?.[i] ?? null);

const num = (v?: string | number | null) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Clears a pickup / drop-off's own pin (address + precision), for when the place itself changes. */
const NO_TRIP_PIN = {
  origin: { originAddress: undefined, originPrecision: undefined },
  destination: { destinationAddress: undefined, destinationPrecision: undefined },
} as const;

/** The route stored on a quotation, as slot fields. */
function routeFromQuotation(q: OperatorQuotation): Partial<TripSlotDraft> {
  const stops = [...(q.stops || [])].sort((a: any, b: any) => (a.sequence ?? a.stop_sequence ?? 0) - (b.sequence ?? b.stop_sequence ?? 0));
  const pick = (s: any): LocationPick => ({
    name: s?.source_label || s?.location_name || s?.location?.name || '',
    locationId: s?.location_id || s?.locationId || s?.location?.id || null,
    lat: s?.location?.lat ?? s?.lat ?? null,
    lng: s?.location?.lng ?? s?.lng ?? null,
  });
  const out = stops.filter((s: any) => (s.leg_index ?? 0) === 0).map(pick);
  const ret = stops.filter((s: any) => (s.leg_index ?? 0) === 1).map(pick);

  const origin = out[0] || { name: q.origin_name || q.originLocation?.name || '', locationId: q.originLocationId || q.originLocation?.id || null, lat: q.originLocation?.lat ?? null, lng: q.originLocation?.lng ?? null };
  const dest = out.length > 1 ? out[out.length - 1] : { name: q.destination_name || q.destinationLocation?.name || '', locationId: q.destinationLocationId || q.destinationLocation?.id || null, lat: q.destinationLocation?.lat ?? null, lng: q.destinationLocation?.lng ?? null };
  const mids = out.slice(1, -1);
  const retMids = ret.slice(1, -1);

  return {
    origin: origin.name,
    originName: origin.name,
    originLocationId: origin.locationId ?? null,
    originLat: origin.lat ?? null,
    originLng: origin.lng ?? null,
    ...NO_TRIP_PIN.origin,
    destination: dest.name,
    destinationName: dest.name,
    destinationLocationId: dest.locationId ?? null,
    destinationLat: dest.lat ?? null,
    destinationLng: dest.lng ?? null,
    ...NO_TRIP_PIN.destination,
    intermediateLocations: mids.map((m) => m.name),
    intermediateLocationIds: mids.map((m) => m.locationId ?? null),
    intermediateStopFees: mids.map(() => ''),
    intermediateStopPins: mids.map(() => null),
    returnIntermediateStopFees: retMids.map(() => ''),
    returnIntermediateStopPins: retMids.map(() => null),
    returnOrigin: ret.length ? ret[0].name : '',
    returnOriginLocationId: ret.length ? ret[0].locationId ?? null : null,
    returnDestination: ret.length > 1 ? ret[ret.length - 1].name : '',
    returnDestinationLocationId: ret.length > 1 ? ret[ret.length - 1].locationId ?? null : null,
    returnIntermediateLocations: retMids.map((m) => m.name),
    returnIntermediateLocationIds: retMids.map((m) => m.locationId ?? null),
  };
}

/** Older quotations stored only origin/destination fields — give them those as stops so route matching works. */
function withLaneStops(q: OperatorQuotation): OperatorQuotation {
  if (Array.isArray(q.stops) && q.stops.length >= 2) return q;
  const o = { id: q.originLocationId || q.originLocation?.id || null, name: q.origin_name || q.originLocation?.name || null };
  const d = { id: q.destinationLocationId || q.destinationLocation?.id || null, name: q.destination_name || q.destinationLocation?.name || null };
  if (!(o.id || o.name) || !(d.id || d.name)) return q;
  return {
    ...q,
    stops: [
      { sequence: 1, leg_index: 0, location_id: o.id, source_label: o.name, location: q.originLocation ?? null },
      { sequence: 2, leg_index: 0, location_id: d.id, source_label: d.name, location: q.destinationLocation ?? null },
    ],
  };
}

const billingOf = (q: OperatorQuotation) => normalizeBillingTypeToken((q as any).operation_type || q.billing_type);
const lineTypeOf = (q: OperatorQuotation) => normalizeLineTypeToken(q.line_type || q.rate_category) || 'SINGLE_TRIP';
const classOf = (q: OperatorQuotation) => {
  const raw = q.vehicle_type || q.vehicle_class || (q as any).source_vehicle_label;
  return raw ? normalizeTruckClass(raw) : null;
};

/** Pick lists kept between visits to the form, so it opens without waiting on the network. */
const listCache: {
  customers?: OperatorCustomer[];
  fleet?: { drivers: OperatorDriverOption[]; vehicles: OperatorVehicleOption[]; providers: OperatorThirdPartyProvider[] };
  compatRules?: VehicleCompatibilityRule[];
} = {};

/** First stop → last stop of each recent one-way trip, with the stops in between; most used first. */
function recentRoutesFrom(trips: OperatorTrip[]): RecentRoute[] {
  const map = new Map<string, RecentRoute>();
  const pick = (st: any): LocationPick => ({
    name: st?.location?.name || st?.location_name || '',
    locationId: st?.locationId || st?.location?.id || null,
    lat: st?.location?.lat ?? st?.location_lat ?? null,
    lng: st?.location?.lng ?? st?.location_lng ?? null,
  });
  trips.forEach((t: any) => {
    // A round trip's last stop is back home — its route isn't origin → last stop.
    if (isRoundTripCategory(t.rate_category || '')) return;
    const stops = [...(t.stops || [])].sort((a: any, b: any) => (a.stop_sequence ?? 0) - (b.stop_sequence ?? 0));
    if (stops.length < 2) return;
    const origin = pick(stops[0]);
    const destination = pick(stops[stops.length - 1]);
    if (!origin.name || !destination.name) return;
    const mids = stops.slice(1, -1).map(pick).filter((m) => m.name);
    const key = [origin, ...mids, destination].map((p) => p.locationId || p.name.trim().toLowerCase()).join('>');
    const when = t.createdAt ? new Date(t.createdAt).getTime() : 0;
    const prev = map.get(key);
    if (prev) {
      prev.count += 1;
      prev.lastUsed = Math.max(prev.lastUsed, when);
    } else {
      map.set(key, { key, origin, destination, stops: mids, count: 1, lastUsed: when });
    }
  });
  return [...map.values()].sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed).slice(0, 4);
}

/** Opened from a lane search (Fleet map): its two ends, by name and city-centre coordinates. */
export interface RoutePreset {
  from?: string; fromLat?: string; fromLng?: string;
  to?: string; toLat?: string; toLng?: string;
}

/** A blank trip, or one starting on a preset lane. A city centre is only approximate — the operator can pick the real site. */
function initialSlot(p: RoutePreset): TripSlotDraft {
  const slot = emptySlot();
  const coord = (v?: string) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
  if (!p.from?.trim() || !p.to?.trim()) return slot;
  return {
    ...slot,
    origin: p.from.trim(),
    originName: p.from.trim(),
    originLat: coord(p.fromLat),
    originLng: coord(p.fromLng),
    destination: p.to.trim(),
    destinationName: p.to.trim(),
    destinationLat: coord(p.toLat),
    destinationLng: coord(p.toLng),
  };
}

export function useCreateTrip(params: { customerId?: string; billingType?: string; assignment?: string; vehicleId?: string; quotationId?: string } & RoutePreset) {
  const [tz, setTz] = useState('Asia/Riyadh');
  const [today, setToday] = useState(() => dateInZone(Date.now(), 'Asia/Riyadh'));

  /* ── Data ── */
  const [customers, setCustomers] = useState<OperatorCustomer[]>(() => listCache.customers ?? []);
  const [drivers, setDrivers] = useState<OperatorDriverOption[]>(() => listCache.fleet?.drivers ?? []);
  const [vehicles, setVehicles] = useState<OperatorVehicleOption[]>(() => listCache.fleet?.vehicles ?? []);
  const [providers, setProviders] = useState<OperatorThirdPartyProvider[]>(() => listCache.fleet?.providers ?? []);
  const [locations, setLocations] = useState<OperatorLocation[]>([]);
  const [quotations, setQuotations] = useState<OperatorQuotation[]>([]);
  const [quotationsLoading, setQuotationsLoading] = useState(Boolean(params.customerId));
  const [loading, setLoading] = useState(() => !listCache.customers);
  const [fleetLoading, setFleetLoading] = useState(() => !listCache.fleet);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [recommended, setRecommended] = useState<RecommendedDriver[]>([]);
  // Answers are kept with the request they belong to; a stale one is ignored instead of cleared.
  const [recommendedFor, setRecommendedFor] = useState('');
  const [compatRules, setCompatRules] = useState<VehicleCompatibilityRule[]>(() => listCache.compatRules ?? []);
  const [recentTrips, setRecentTrips] = useState<OperatorTrip[]>([]);
  const [surchargeRules, setSurchargeRules] = useState<OperatorSurchargeRule[]>([]);
  const [partnerRateFor, setPartnerRateFor] = useState<{ key: string; rate: ProviderRateMatch | null }>({ key: '', rate: null });
  const [partnerDriversFor, setPartnerDriversFor] = useState<{ providerId: string; list: Previous3PLDriver[] }>({ providerId: '', list: [] });

  /* ── Form ── */
  const [step, setStep] = useState<CreateTripStep>(1);
  const [customerId, setCustomerIdRaw] = useState(params.customerId ?? '');
  const [rateCategory, setRateCategory] = useState<string>('SINGLE_TRIP');
  const [billingType, setBillingType] = useState<'Extra' | 'Monthly'>(params.billingType === 'Monthly' ? 'Monthly' : 'Extra');
  const [vehicleType, setVehicleType] = useState<string>('10 TON');
  // The slot as entered; `slot` below adds the suggested drop-off until the user sets one.
  const [rawSlot, setSlot] = useState<TripSlotDraft>(() => initialSlot(params));
  const [charges, setCharges] = useState<TripChargeInput[]>([]);
  const [dropoffTouched, setDropoffTouched] = useState(false);
  const [returnDropoffTouched, setReturnDropoffTouched] = useState(false);
  const [routeEstimate, setRouteEstimate] = useState<RouteEstimate | null>(null);

  const [assignmentType, setAssignmentType] = useState<AssignmentType>(params.assignment === 'third_party' ? 'third_party' : 'own');
  const [driverId, setDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [coDriverId, setCoDriverIdRaw] = useState('');
  const [coDriverSplit, setCoDriverSplit] = useState<CoDriverSplit>({});
  // A new (or no) co-driver starts from the 50/50 split again.
  const setCoDriverId = useCallback((id: string) => {
    setCoDriverIdRaw(id);
    setCoDriverSplit({});
  }, []);
  const [awbNumber, setAwbNumber] = useState('');
  const [thirdPartyProviderId, setThirdPartyProviderId] = useState('');
  const [thirdPartyDriverName, setThirdPartyDriverName] = useState('');
  const [thirdPartyDriverPhone, setThirdPartyDriverPhone] = useState('');
  const [thirdPartyVehiclePlate, setThirdPartyVehiclePlate] = useState('');
  const [thirdPartyCost, setThirdPartyCost] = useState('');

  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [monthlyMode, setMonthlyMode] = useState<MonthlyMode>('single');
  const [rotationDrivers, setRotationDrivers] = useState<string[]>(['', '']);
  const [dayOverrides, setDayOverrides] = useState<Record<string, DayAssignmentInput>>({});

  const [submitting, setSubmitting] = useState(false);

  const isMonthly = billingType === 'Monthly';

  const isRoundTrip = isRoundTripCategory(rateCategory);
  const routeReady = Boolean(rawSlot.origin.trim() && rawSlot.destination.trim());
  const etaPoints = useMemo(() => (routeReady ? routePoints(rawSlot, isRoundTrip, locations) : []), [rawSlot, isRoundTrip, locations, routeReady]);
  const etaKey = useMemo(() => routeKeyOf(etaPoints), [etaPoints]);
  /** The estimate for the route as it is now (a stale one from before an edit doesn't count). */
  const eta = routeEstimate && routeEstimate.key === etaKey && routeReady ? routeEstimate : null;
  const travelMinutes = eta ? eta.totalMinutes : null;

  /** Minutes from leaving pickup to reaching the drop-off — not the whole round trip. */
  const outboundMinutes = useMemo(() => {
    if (!eta) return null;
    const end = eta.points.findIndex((p) => p.kind === 'dropoff');
    if (end < 0) return eta.totalMinutes;
    let t = 0;
    for (let i = 0; i < end; i++) t += eta.dwell[i] + eta.legs[i].minutes;
    return t;
  }, [eta]);

  /** Round trip: minutes from loading for the way back to arriving home. */
  const returnMinutes = useMemo(() => {
    if (!eta || !isRoundTrip) return null;
    const start = eta.points.findIndex((p) => p.kind === 'returnPickup' || p.alsoReturnPickup);
    if (start < 0) return null;
    let t = 0;
    for (let i = start; i < eta.legs.length; i++) t += (i === start ? 0 : eta.dwell[i]) + eta.legs[i].minutes;
    return t;
  }, [eta, isRoundTrip]);

  /** A duty trip's length (10 / 12 hours), or null for a trip that runs as long as the drive. */
  const dutyMinutes = useMemo(() => {
    const t = normalizeLineTypeToken(rateCategory);
    return t === '10_HRS' ? 600 : t === '12_HRS' ? 720 : null;
  }, [rateCategory]);

  /**
   * Drop-off follows pickup + duty length or drive time (rounded up to 15 min)
   * until the user sets it; a round trip's arrival home follows the return
   * loading + the drive back the same way. A monthly contract keeps days
   * ("Day 2"), a single trip keeps dates.
   */
  const slot = useMemo<TripSlotDraft>(() => {
    const base: TripSlotDraft = slotScheduleFor(
      { ...rawSlot, saveAsQuotation: false, ...(isMonthly ? { dropoffDate: '' } : {}) },
      isMonthly,
      isRoundTrip,
    );
    const toMin = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };
    const hhmm = (total: number) => `${String(Math.floor((total % 1440) / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;

    let out = base;
    if (!dropoffTouched && rawSlot.pickupTime && (isMonthly || rawSlot.date)) {
      const total = toMin(rawSlot.pickupTime) + Math.ceil((dutyMinutes ?? outboundMinutes ?? 240) / 15) * 15;
      out = {
        ...out,
        dropoffTime: hhmm(total),
        ...(isMonthly
          ? { dropoffDay: isRoundTrip ? Math.floor(total / 1440) : undefined }
          : { dropoffDate: rawSlot.date ? addDaysToDateStr(rawSlot.date, Math.floor(total / 1440)) : rawSlot.date }),
      };
    }

    if (isRoundTrip && !returnDropoffTouched && out.returnPickupTime && returnMinutes != null) {
      const total = toMin(out.returnPickupTime) + Math.ceil(returnMinutes / 15) * 15;
      const loadDay = returnLegDayOffsets(out).pickup ?? 0;
      out = {
        ...out,
        returnDropoffTime: hhmm(total),
        ...(isMonthly
          ? { returnDropoffDay: loadDay + Math.floor(total / 1440) }
          : { returnDropoffDate: out.returnPickupDate ? addDaysToDateStr(out.returnPickupDate, Math.floor(total / 1440)) : '' }),
      };
    }
    return out;
  }, [rawSlot, dropoffTouched, returnDropoffTouched, outboundMinutes, returnMinutes, isMonthly, isRoundTrip, dutyMinutes]);
  const isRound = isRoundTripCategory(rateCategory);
  const toUtcIso = useCallback((date: string, time: string) => zonedWallTimeToUtcIso(date, time, tz), [tz]);

  /* ── Load ── */
  /** Drivers, trucks and partners — loaded again after one is added from inside the form. */
  const loadFleet = useCallback(
    () =>
      Promise.all([operatorService.driversLookup(), operatorService.vehiclesLookup(), operatorService.thirdPartyProviders()]).then(([d, v, p]) => {
        listCache.fleet = { drivers: d || [], vehicles: (v || []).filter((x) => x.isActive !== false), providers: p || [] };
        setDrivers(listCache.fleet.drivers);
        setVehicles(listCache.fleet.vehicles);
        setProviders(listCache.fleet.providers);
      }),
    [],
  );
  const refreshFleet = useCallback(() => {
    loadFleet().catch(() => {});
  }, [loadFleet]);

  // Step 1 needs only customers and the timezone; the fleet (drivers, trucks,
  // partners) is for step 3 and loads behind it. Lists from the last visit show
  // at once and are refreshed in the background.
  useEffect(() => {
    let alive = true;
    const fail = (e: any) => alive && setLoadError(e?.message || 'Could not load customers and fleet');
    Promise.all([operatorService.customersLookup(), operatorService.deploymentTimezone()])
      .then(([c, zone]) => {
        if (!alive) return;
        listCache.customers = c || [];
        setCustomers(listCache.customers);
        setTz(zone);
        setToday(dateInZone(Date.now(), zone));
      })
      .catch(fail)
      .finally(() => alive && setLoading(false));
    loadFleet()
      .catch(fail)
      .finally(() => alive && setFleetLoading(false));
    operatorService.vehicleCompatibilityRules().then((r) => {
      if (!alive || r.length === 0) return;
      listCache.compatRules = r;
      setCompatRules(r);
    });
    return () => {
      alive = false;
    };
  }, [loadFleet]);

  // A customer's quotations and saved places.
  useEffect(() => {
    let alive = true;
    if (!customerId) return;
    operatorService
      .customerQuotations(customerId)
      .then((q) => alive && setQuotations(q.map(withLaneStops)))
      .catch(() => alive && setQuotations([]))
      .finally(() => alive && setQuotationsLoading(false));
    operatorService
      .locations(customerId)
      .then((l) => alive && setLocations(l || []))
      .catch(() => {});
    operatorService.customerRecentTrips(customerId).then((t) => alive && setRecentTrips(t));
    return () => {
      alive = false;
    };
  }, [customerId]);

  /** This customer's latest routes, most used first. */
  const recentRoutes = useMemo(() => recentRoutesFrom(recentTrips), [recentTrips]);
  /** How often each quotation was used on this customer's latest trips. */
  const quotationUse = useMemo(() => {
    const m = new Map<string, number>();
    recentTrips.forEach((t: any) => {
      const id = t.quotationId || t.quotation?.id || t.rate_card_id;
      if (id) m.set(id, (m.get(id) || 0) + 1);
    });
    return m;
  }, [recentTrips]);

  /* ── Quotation matching ── */
  const clearPrice = (s: TripSlotDraft, keepTyped: boolean): TripSlotDraft => ({
    ...s,
    rateMatched: false,
    matchedRateCard: null,
    rateCardId: undefined,
    driverPayoutModified: false,
    updateQuotationPayout: undefined,
    // A price copied from a quotation belongs to that quotation's route — drop it.
    ...(keepTyped ? {} : { billingAmount: '', driverPayout: '', tripCharges: '' }),
  });

  const applyQuotation = useCallback((q: OperatorQuotation, opts: { fillRoute: boolean }) => {
    const pricing = pricingFromQuotation(q as any);
    const cls = classOf(q);
    setRateCategory(lineTypeOf(q));
    setBillingType(billingOf(q));
    if (cls) setVehicleType(cls);
    setSlot((s) => ({
      ...s,
      ...(opts.fillRoute ? routeFromQuotation(q) : {}),
      matchedRateCard: q,
      rateMatched: true,
      rateCardId: q.id,
      billingAmount: pricing?.billingAmount ?? '',
      driverPayout: pricing?.driverPayout ?? '',
      driverPayoutModified: false,
      updateQuotationPayout: undefined,
      tripCharges: '',
      pricingBasis: undefined,
      saveAsQuotation: false,
    }));
  }, []);

  const clearQuotation = useCallback(() => setSlot((s) => clearPrice(s, false)), []);

  // Opened from a quotation (Quotations → Create trip): its route, trip type,
  // billing, truck class and price, once the customer's quotations are here.
  // Everything stays editable; it's only the starting point.
  const [quotationPresetDone, setQuotationPresetDone] = useState(false);
  if (!quotationPresetDone && params.quotationId && quotations.length > 0) {
    setQuotationPresetDone(true);
    const q = quotations.find((x) => x.id === params.quotationId);
    if (q) applyQuotation(q, { fillRoute: true });
  }

  const routeComplete = Boolean(slot.origin.trim() && slot.destination.trim());

  /** Quotations that cover exactly this route with this trip type, billing and truck class. */
  const routeMatches = useMemo(() => {
    if (!routeComplete) return [];
    const wantType = normalizeLineTypeToken(rateCategory);
    return quotationsForRoute(quotations, slot, rateCategory).filter((q) => {
      if (lineTypeOf(q) !== wantType) return false;
      if (billingOf(q) !== billingType) return false;
      const cls = classOf(q);
      return !cls || cls === vehicleType;
    });
  }, [quotations, slot, rateCategory, billingType, vehicleType, routeComplete]);

  // Any change to the route, trip type, billing or class re-checks the applied quotation.
  const routeKey = useMemo(
    () => JSON.stringify([customerId, rateCategory, billingType, vehicleType, routeLegsFromSlot(slot, isRound)]),
    [customerId, rateCategory, billingType, vehicleType, slot, isRound],
  );
  const lookupSeq = useRef(0);
  useEffect(() => {
    const seq = ++lookupSeq.current;
    const current = slot;
    const card = current.matchedRateCard as OperatorQuotation | null;
    const stillFits =
      card &&
      current.rateMatched &&
      quotationMatchesRoute(card as any, routeLegsFromSlot(current, isRound), isRound) &&
      isRoundTripCategory(lineTypeOf(card)) === isRound &&
      billingOf(card) === billingType;
    if (stillFits) return;

    // Keeping the applied quotation in step with the route is this effect's job, so it sets state on purpose.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (card) setSlot((s) => clearPrice(s, false));
    if (!customerId || !routeComplete) return;

    const local = routeMatches[0];
    if (local) {
      applyQuotation(local, { fillRoute: false });
      return;
    }
    // Not in the list we hold — ask the server, same as the web (every stop must match).
    if (current.originLocationId && current.destinationLocationId) {
      operatorService
        .lookupRouteQuotation({
          customer_id: customerId,
          origin_location_id: current.originLocationId,
          destination_location_id: current.destinationLocationId,
          vehicle_type: vehicleType,
          line_type: rateCategory,
          billing_type: billingType,
          planned_start: current.date || undefined,
          stops: buildStopsFromSlot(current, isRound),
        })
        .then((q) => {
          if (seq !== lookupSeq.current || !q) return;
          const card = withLaneStops(q);
          if (!quotationMatchesRoute(card as any, routeLegsFromSlot(current, isRound), isRound)) return;
          applyQuotation(card, { fillRoute: false });
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey, quotations]);

  // The customer's standing surcharges (and the applied quotation's) — offered when adding a charge.
  const appliedQuotationId = slot.rateMatched ? (slot.matchedRateCard as OperatorQuotation | null)?.id : undefined;
  useEffect(() => {
    if (!customerId) return;
    let alive = true;
    operatorService.surchargeRules({ customerId, quotationId: appliedQuotationId }).then((r) => alive && setSurchargeRules(r));
    return () => {
      alive = false;
    };
  }, [customerId, appliedQuotationId]);

  const priceState: PriceState =!routeComplete ? 'no_route' : slot.rateMatched && slot.matchedRateCard ? 'matched' : 'define';

  /** Own-fleet trips need a driver payout; a quotation saved without one leaves it empty. */
  const payoutMissing = assignmentType === 'own' && priceState !== 'no_route' && !(num(slot.driverPayout) > 0);

  /** A price typed for an unquoted route is saved as a new quotation when the trip is created. */
  const savesNewQuotation = priceState === 'define' && num(slot.billingAmount) > 0;

  const setCustomerId = useCallback((id: string) => {
    setCustomerIdRaw(id);
    setQuotations([]);
    setLocations([]);
    setRecentTrips([]);
    setSurchargeRules([]);
    setQuotationsLoading(Boolean(id));
    setSlot((s) => clearPrice(s, false));
  }, []);

  /* ── Route editing ── */
  const setEndpoint = useCallback((which: 'origin' | 'destination', loc: LocationPick) => {
    setSlot((s) => ({
      ...s,
      [which]: loc.name,
      [`${which}Name`]: loc.name,
      [`${which}LocationId`]: loc.locationId ?? null,
      [`${which}Lat`]: loc.lat ?? null,
      [`${which}Lng`]: loc.lng ?? null,
      ...NO_TRIP_PIN[which],
    }));
  }, []);

  // Each stop can carry a fee billed on top of the rate (the arrays the web fills), kept in step with the stops.
  const addStop = useCallback((leg: 0 | 1, loc: LocationPick) => {
    setSlot((s) =>
      leg === 0
        ? {
            ...s,
            intermediateLocations: [...s.intermediateLocations, loc.name],
            intermediateLocationIds: [...(s.intermediateLocationIds || []), loc.locationId ?? null],
            intermediateStopFees: [...padFees(s.intermediateStopFees, s.intermediateLocations.length), ''],
            intermediateStopPins: [...padPins(s.intermediateStopPins, s.intermediateLocations.length), null],
          }
        : {
            ...s,
            returnIntermediateLocations: [...(s.returnIntermediateLocations || []), loc.name],
            returnIntermediateLocationIds: [...(s.returnIntermediateLocationIds || []), loc.locationId ?? null],
            returnIntermediateStopFees: [...padFees(s.returnIntermediateStopFees, (s.returnIntermediateLocations || []).length), ''],
            returnIntermediateStopPins: [...padPins(s.returnIntermediateStopPins, (s.returnIntermediateLocations || []).length), null],
          },
    );
  }, []);

  const removeStop = useCallback((leg: 0 | 1, index: number) => {
    setSlot((s) =>
      leg === 0
        ? {
            ...s,
            intermediateLocations: s.intermediateLocations.filter((_, i) => i !== index),
            intermediateLocationIds: (s.intermediateLocationIds || []).filter((_, i) => i !== index),
            intermediateStopFees: padFees(s.intermediateStopFees, s.intermediateLocations.length).filter((_, i) => i !== index),
            intermediateStopPins: padPins(s.intermediateStopPins, s.intermediateLocations.length).filter((_, i) => i !== index),
          }
        : {
            ...s,
            returnIntermediateLocations: (s.returnIntermediateLocations || []).filter((_, i) => i !== index),
            returnIntermediateLocationIds: (s.returnIntermediateLocationIds || []).filter((_, i) => i !== index),
            returnIntermediateStopFees: padFees(s.returnIntermediateStopFees, (s.returnIntermediateLocations || []).length).filter((_, i) => i !== index),
            returnIntermediateStopPins: padPins(s.returnIntermediateStopPins, (s.returnIntermediateLocations || []).length).filter((_, i) => i !== index),
          },
    );
  }, []);

  const setStopFee = useCallback((leg: 0 | 1, index: number, fee: string) => {
    setSlot((s) => {
      if (leg === 0) {
        const fees = padFees(s.intermediateStopFees, s.intermediateLocations.length);
        fees[index] = fee;
        return { ...s, intermediateStopFees: fees };
      }
      const fees = padFees(s.returnIntermediateStopFees, (s.returnIntermediateLocations || []).length);
      fees[index] = fee;
      return { ...s, returnIntermediateStopFees: fees };
    });
  }, []);

  /** Fills the route from a recent trip; the quotation check then runs as for a typed route. */
  const applyRecentRoute = useCallback((r: RecentRoute) => {
    setSlot((s) => ({
      ...s,
      origin: r.origin.name,
      originName: r.origin.name,
      originLocationId: r.origin.locationId ?? null,
      originLat: r.origin.lat ?? null,
      originLng: r.origin.lng ?? null,
      ...NO_TRIP_PIN.origin,
      destination: r.destination.name,
      destinationName: r.destination.name,
      destinationLocationId: r.destination.locationId ?? null,
      destinationLat: r.destination.lat ?? null,
      destinationLng: r.destination.lng ?? null,
      ...NO_TRIP_PIN.destination,
      intermediateLocations: r.stops.map((m) => m.name),
      intermediateLocationIds: r.stops.map((m) => m.locationId ?? null),
      intermediateStopFees: r.stops.map(() => ''),
      intermediateStopPins: r.stops.map(() => null),
    }));
  }, []);

  const setReturnEndpoint = useCallback((which: 'returnOrigin' | 'returnDestination', loc: LocationPick | null) => {
    setSlot((s) => ({ ...s, [which]: loc?.name ?? '', [`${which}LocationId`]: loc?.locationId ?? null }));
  }, []);

  const createLocation = useCallback(
    async (name: string): Promise<LocationPick> => {
      const created = await operatorService.createLocation({ name: name.trim(), customer_id: customerId || undefined });
      setLocations((prev) => [created, ...prev]);
      return { name: created.name, locationId: created.id, lat: created.lat ?? null, lng: created.lng ?? null };
    },
    [customerId],
  );

  /** A new place saved for this customer with its map pin. */
  const createPinnedLocation = useCallback(
    async (name: string, pin: { lat: number; lng: number; address: string | null; exact: boolean }): Promise<LocationPick> => {
      const created = await operatorService.createLocation({
        name: name.trim(),
        customer_id: customerId || undefined,
        lat: pin.lat,
        lng: pin.lng,
        ...(pin.address ? { address: pin.address } : {}),
        // A search pick is approximate; a pasted link or a hand-placed pin is exact (owner rule 2026-10-03).
        coordinate_precision: pin.exact ? 'EXACT' : 'APPROXIMATE',
      });
      const loc = { ...created, lat: created.lat ?? pin.lat, lng: created.lng ?? pin.lng };
      setLocations((prev) => [loc, ...prev]);
      return { name: loc.name, locationId: loc.id, lat: loc.lat, lng: loc.lng };
    },
    [customerId],
  );

  /** A saved place with no pin at all gets the one just set for this trip. */
  const pinPlaceIfUnpinned = useCallback(
    async (locationId: string | null | undefined, pin: PickedStopPin) => {
      const place = locationId ? locations.find((l) => l.id === locationId) : undefined;
      if (!place || (place.lat != null && place.lng != null)) return;
      await operatorService.pinLocation(place.id, pin);
      setLocations((prev) =>
        prev.map((l) => (l.id === place.id ? { ...l, lat: pin.lat, lng: pin.lng, coordinate_precision: pin.exact ? 'EXACT' : 'APPROXIMATE' } : l)),
      );
    },
    [locations],
  );

  /**
   * The exact spot of this trip's pickup / drop-off — e.g. the customer's warehouse
   * in Riyadh while the quotation only says "Riyadh". The place stays the same
   * (so the quotation still fits); the stop gets the pin. A place with no pin at
   * all gets this one too. An exact pin also becomes the customer place's pin
   * when the trip is created, unless that place is already pinned exactly.
   */
  const setEndpointPin = useCallback(
    async (which: 'origin' | 'destination', pin: PickedStopPin) => {
      await pinPlaceIfUnpinned(which === 'origin' ? slot.originLocationId : slot.destinationLocationId, pin);
      const own = stopPinOf(pin);
      setSlot((s) => ({
        ...s,
        [`${which}Lat`]: own.lat,
        [`${which}Lng`]: own.lng,
        [`${which}Address`]: own.address || undefined,
        [`${which}Precision`]: own.precision,
      }));
    },
    [pinPlaceIfUnpinned, slot.originLocationId, slot.destinationLocationId],
  );

  /** The same for a stop in between (leg 0 = outbound, 1 = return), by its index. */
  const setStopPin = useCallback(
    async (leg: 0 | 1, index: number, pin: PickedStopPin) => {
      const ids = leg === 0 ? slot.intermediateLocationIds : slot.returnIntermediateLocationIds;
      await pinPlaceIfUnpinned(ids?.[index], pin);
      setSlot((s) => {
        if (leg === 0) {
          const pins = padPins(s.intermediateStopPins, s.intermediateLocations.length);
          pins[index] = stopPinOf(pin);
          return { ...s, intermediateStopPins: pins };
        }
        const pins = padPins(s.returnIntermediateStopPins, (s.returnIntermediateLocations || []).length);
        pins[index] = stopPinOf(pin);
        return { ...s, returnIntermediateStopPins: pins };
      });
    },
    [pinPlaceIfUnpinned, slot.intermediateLocationIds, slot.returnIntermediateLocationIds],
  );

  const updateSlot = useCallback((patch: Partial<TripSlotDraft>) => setSlot((s) => ({ ...s, ...patch })), []);

  /* ── Schedule: time the whole route, stop by stop ── */
  useEffect(() => {
    let alive = true;
    if (etaPoints.length < 2) return;
    // Wait for the user to stop editing before asking the routing service.
    const t = setTimeout(() => {
      estimateRoute(etaPoints, (pts) => operatorService.roadRoute(pts)).then((est) => alive && setRouteEstimate(est));
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [etaKey, etaPoints]);

  const setDropoff = useCallback(
    (patch: { dropoffDate?: string; dropoffTime?: string; dropoffDay?: number }) => {
      // Start from what's on screen (the suggestion) so changing only the time keeps the date.
      setSlot((s) => ({ ...s, dropoffDate: slot.dropoffDate, dropoffTime: slot.dropoffTime, dropoffDay: slot.dropoffDay, ...patch }));
      setDropoffTouched(true);
    },
    [slot.dropoffDate, slot.dropoffTime, slot.dropoffDay],
  );

  /** Round trip: when the truck loads for the way back. Empty clears the whole return leg's times. */
  const setReturnPickup = useCallback((patch: { returnPickupDate?: string; returnPickupTime: string; returnPickupDay?: number }) => {
    if (!patch.returnPickupTime) {
      setSlot((s) => ({ ...s, returnPickupDate: '', returnPickupTime: '', returnPickupDay: undefined, returnDropoffDate: '', returnDropoffTime: '', returnDropoffDay: undefined }));
      setReturnDropoffTouched(false);
      return;
    }
    setSlot((s) => ({ ...s, ...patch }));
  }, []);

  /** Round trip: when the truck is back home — set by hand, so the drive estimate stops moving it. */
  const setReturnDropoff = useCallback(
    (patch: { returnDropoffDate?: string; returnDropoffTime: string; returnDropoffDay?: number }) => {
      setSlot((s) => ({ ...s, returnDropoffDate: slot.returnDropoffDate, returnDropoffDay: slot.returnDropoffDay, ...patch }));
      setReturnDropoffTouched(true);
    },
    [slot.returnDropoffDate, slot.returnDropoffDay],
  );

  /* ── Fleet ── */
  const driverTruckId = useCallback(
    (id: string): string | null => {
      const d = drivers.find((x) => x.id === id);
      if (!d) return null;
      const direct = d.assignedVehicleId || d.assigned_vehicle_id || d.assignedVehicle?.id;
      if (direct && vehicles.some((v) => v.id === direct)) return direct;
      const byDriver = vehicles.find((v) => v.assignedDriverId === id || v.assigned_driver_id === id);
      if (byDriver) return byDriver.id;
      const plate = d.assignedVehicle?.plate_number || d.assigned_vehicle?.plate_number || d.current_vehicle?.plate_number;
      const byPlate = plate ? vehicles.find((v) => v.plate_number?.toLowerCase() === plate.toLowerCase()) : null;
      return byPlate?.id ?? null;
    },
    [drivers, vehicles],
  );

  const selectDriver = useCallback(
    (id: string) => {
      setDriverId(id);
      if (!id || id === UNASSIGNED) {
        setVehicleId(UNASSIGNED);
        return;
      }
      const truck = driverTruckId(id);
      if (truck) setVehicleId(truck);
      if (coDriverId === id) setCoDriverId('');
    },
    [driverTruckId, coDriverId, setCoDriverId],
  );

  const assignLater = useCallback(() => {
    setDriverId(UNASSIGNED);
    setVehicleId(UNASSIGNED);
    setCoDriverId('');
  }, [setCoDriverId]);

  // Opened with a truck (Home → Free trucks → Book trip): choose it, its class
  // (so step 1's quotations match it) and its driver, once the fleet is here.
  // Everything stays editable; it's only the starting point.
  const [presetDone, setPresetDone] = useState(false);
  if (!presetDone && params.vehicleId && vehicles.length > 0) {
    setPresetDone(true);
    const v = vehicles.find((x) => x.id === params.vehicleId);
    if (v) {
      setAssignmentType('own');
      setVehicleId(v.id);
      const cls = truckClassOfVehicle(v);
      if (cls) setVehicleType(cls);
      const driver = v.assignedDriver?.id || v.assignedDriverId || v.assigned_driver_id
        || drivers.find((d) => driverTruckId(d.id) === v.id)?.id;
      if (driver && drivers.some((d) => d.id === driver)) setDriverId(driver);
    }
  }

  /**
   * The trip's window for the ranking, as on the web: the day (a monthly
   * contract's first operating day) at pickup, to the final drop-off.
   */
  const recWindow = useMemo(() => {
    const day = (isMonthly ? [...selectedDates].sort()[0] : slot.date) || today;
    if (!slot.pickupTime) return { start: undefined as string | undefined, end: undefined as string | undefined };
    try {
      const start = toUtcIso(day, slot.pickupTime);
      const endTime = slot.returnDropoffTime || slot.dropoffTime;
      const endDay = isMonthly
        ? addDaysToDateStr(day, endTime && endTime < slot.pickupTime ? 1 : 0)
        : slot.returnDropoffTime
        ? slot.returnDropoffDate || slot.dropoffDate || day
        : slot.dropoffDate || day;
      const end = endTime ? toUtcIso(endDay, endTime) : undefined;
      return { start, end };
    } catch {
      return { start: undefined, end: undefined };
    }
  }, [isMonthly, selectedDates, slot.date, slot.pickupTime, slot.dropoffDate, slot.dropoffTime, slot.returnDropoffDate, slot.returnDropoffTime, today, toUtcIso]);

  // Ranked on the server with the whole trip — route, saved places, customer and window — the web's request.
  const recRequest = useMemo(
    () => ({
      origin: slot.origin || undefined,
      destination: slot.destination || undefined,
      vehicleClass: vehicleType || undefined,
      originLocationId: slot.originLocationId || undefined,
      destinationLocationId: slot.destinationLocationId || undefined,
      customerId: customerId || undefined,
      plannedStart: recWindow.start,
      plannedEnd: recWindow.end,
    }),
    [slot.origin, slot.destination, vehicleType, slot.originLocationId, slot.destinationLocationId, customerId, recWindow.start, recWindow.end],
  );
  const recKey = JSON.stringify(recRequest);
  useEffect(() => {
    if (step !== 3 || assignmentType !== 'own') return;
    let alive = true;
    operatorService.recommendedDrivers(recRequest).then((r) => {
      if (!alive) return;
      setRecommended(r);
      setRecommendedFor(recKey);
    });
    return () => {
      alive = false;
    };
  }, [step, assignmentType, recRequest, recKey]);
  const recommendedLoading = step === 3 && assignmentType === 'own' && recommendedFor !== recKey;

  /* ── 3PL: the partner's agreed lane cost, and the drivers they sent before ── */
  useEffect(() => {
    if (assignmentType !== 'third_party' || !thirdPartyProviderId) return;
    let alive = true;
    operatorService.thirdPartyPreviousDrivers(thirdPartyProviderId).then((list) => alive && setPartnerDriversFor({ providerId: thirdPartyProviderId, list }));
    return () => {
      alive = false;
    };
  }, [assignmentType, thirdPartyProviderId]);

  const partnerKey =
    assignmentType === 'third_party' && thirdPartyProviderId && slot.origin.trim() && slot.destination.trim()
      ? JSON.stringify([thirdPartyProviderId, slot.origin, slot.destination, slot.originLocationId, slot.destinationLocationId, slot.date, vehicleType, rateCategory, billingType])
      : '';
  useEffect(() => {
    if (!partnerKey) return;
    let alive = true;
    operatorService
      .thirdPartyMatchRate({
        providerId: thirdPartyProviderId,
        origin: slot.origin,
        destination: slot.destination,
        vehicle_class: vehicleType,
        line_type: LINE_TYPE_LABELS[normalizeLineTypeToken(rateCategory)] || rateCategory,
        operation_type: billingType,
        // 3PL cost is per trip, monthly contract or not (owner decision 2026-09-28).
        pricing_basis: 'Per Trip',
        originLocationId: slot.originLocationId || undefined,
        destinationLocationId: slot.destinationLocationId || undefined,
        target_date: slot.date || undefined,
      })
      .then((m) => {
        if (!alive) return;
        setPartnerRateFor({ key: partnerKey, rate: m });
        // Fill the cost only while nobody has typed one.
        if (m && m.cost != null && Number(m.cost) > 0) setThirdPartyCost((c) => (c && c !== '0' ? c : String(Number(m.cost))));
      });
    return () => {
      alive = false;
    };
    // partnerKey covers every input below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerKey]);
  const partnerRate = partnerKey && partnerRateFor.key === partnerKey ? partnerRateFor.rate : null;
  const partnerDrivers = assignmentType === 'third_party' && partnerDriversFor.providerId === thirdPartyProviderId ? partnerDriversFor.list : [];

  const usePartnerDriver = useCallback((d: Previous3PLDriver) => {
    setThirdPartyDriverName(d.driverName || '');
    setThirdPartyDriverPhone(d.driverPhone || '');
    setThirdPartyVehiclePlate(d.vehiclePlate || '');
  }, []);

  /** Monthly: who drives which day. Single mode needs none — every day uses the chosen driver. */
  const splitSet = Boolean(coDriverId && (coDriverSplit.driverPayoutOverride !== undefined || coDriverSplit.coDriverPayoutOverride !== undefined));
  const dayAssignments = useMemo<Record<string, DayAssignmentInput>>(() => {
    // An edited co-driver split reaches the saved rows through the slot's assignment (and each changed day), as on the web.
    const split: Record<string, DayAssignmentInput> = splitSet && assignmentType === 'own' ? { [rawSlot.id]: { driverId: '', vehicleId: '', ...coDriverSplit } } : {};
    if (!isMonthly || assignmentType !== 'own' || monthlyMode === 'single') return split;
    if (monthlyMode === 'per_day') {
      if (!splitSet) return dayOverrides;
      return { ...split, ...Object.fromEntries(Object.entries(dayOverrides).map(([d, a]) => [d, { ...coDriverSplit, ...a }])) };
    }
    const active = rotationDrivers.filter(Boolean);
    if (active.length === 0) return {};
    if (active.length === 1) {
      const only = { driverId: active[0], vehicleId: driverTruckId(active[0]) || '' };
      return Object.fromEntries(selectedDates.map((d) => [d, only]));
    }
    const computed = applyMonthlyAssignmentStrategy({
      mode: 'rotation',
      rotationCount: Math.min(4, active.length) as 2 | 3 | 4,
      selectedDates,
      rotationDrivers: active,
      rotationVehicles: active.map((d) => driverTruckId(d) || ''),
    });
    return Object.fromEntries(Object.entries(computed).map(([date, a]) => [date, { driverId: a.driverId, vehicleId: a.vehicleId }]));
  }, [isMonthly, assignmentType, monthlyMode, dayOverrides, rotationDrivers, selectedDates, driverTruckId, splitSet, coDriverSplit, rawSlot.id]);

  const setDayOverride = useCallback(
    (date: string, id: string | null) => {
      setDayOverrides((prev) => {
        const next = { ...prev };
        if (!id) delete next[date];
        else next[date] = { driverId: id, vehicleId: id === UNASSIGNED ? UNASSIGNED : driverTruckId(id) || '' };
        return next;
      });
    },
    [driverTruckId],
  );

  /* ── Money ── */
  const money = useMemo(() => {
    const perTrip = perTripBilling(slot, billingType);
    const fees = [...(slot.intermediateStopFees || []), ...(slot.returnIntermediateStopFees || [])].reduce((a, f) => a + num(f), 0);
    const chargesTotal = charges.reduce((a, c) => a + num(c.amount), 0);
    const billing = perTrip + fees + chargesTotal;
    const cost = assignmentType === 'third_party' ? num(thirdPartyCost) : num(slot.driverPayout ?? slot.tripCharges);
    // Until a payout / partner cost is entered the margin isn't known — don't show 100%.
    const costKnown = cost > 0;
    const margin = billing - cost;
    const trips = isMonthly ? Math.max(selectedDates.length, 0) : 1;
    return {
      rate: num(slot.billingAmount),
      perTrip,
      chargesTotal,
      billing,
      cost,
      margin,
      costKnown,
      marginPct: billing > 0 ? (margin / billing) * 100 : 0,
      trips,
    };
  }, [slot, billingType, charges, assignmentType, thirdPartyCost, isMonthly, selectedDates.length]);

  /* ── Checks ── */
  const rotationActive = isMonthly && assignmentType === 'own' && monthlyMode === 'rotation';

  const allIssues = useMemo(
    () =>
      validateTripDraft({
        rateCategory: rateCategory,
        customerId,
        slots: [slot],
        billingType,
        assignmentType,
        // Rotation has no single main driver — the rotation's drivers are the assignment.
        masterDriver: rotationActive ? rotationDrivers.find(Boolean) || '' : driverId,
        masterVehicle: rotationActive ? '' : vehicleId,
        thirdPartyProviderId,
        thirdPartyDriverName,
        thirdPartyCost,
        thirdPartyVehiclePlate,
        selectedDates,
        toUtcIso,
      }),
    [customerId, slot, billingType, rateCategory, assignmentType, driverId, vehicleId, thirdPartyProviderId, thirdPartyDriverName, thirdPartyCost, thirdPartyVehiclePlate, selectedDates, toUtcIso, rotationActive, rotationDrivers],
  );

  const stepIssues = useCallback(
    (s: CreateTripStep) =>
      allIssues.filter((i) => STEP_OF[i.section] === s && !(s === 1 && i.field.startsWith('driverPayout'))),
    [allIssues],
  );

  /* ── Submit ── */
  const buildRows = useCallback(
    (rateCardId?: string) =>
      buildTripRows({
        customerId,
        slots: [{ ...slot, ...(isMonthly ? { dropoffDate: '' } : {}), ...(rateCardId ? { rateCardId } : {}) }],
        vehicleType,
        rateCategory,
        billingType,
        assignmentType,
        masterDriver: driverId,
        masterCoDriver: coDriverId,
        masterVehicle: vehicleId,
        thirdPartyProviderId,
        thirdPartyDriverName,
        thirdPartyDriverPhone,
        thirdPartyVehiclePlate,
        thirdPartyCost,
        awbNumber,
        dayAssignments,
        selectedDates: isMonthly ? [...selectedDates].sort() : [],
        charges,
        toUtcIso,
        todayStr: today,
      }),
    [customerId, slot, vehicleType, rateCategory, billingType, assignmentType, driverId, coDriverId, vehicleId, thirdPartyProviderId, thirdPartyDriverName, thirdPartyDriverPhone, thirdPartyVehiclePlate, thirdPartyCost, awbNumber, dayAssignments, isMonthly, selectedDates, charges, toUtcIso, today],
  );

  /**
   * A monthly contract's runs: how long one run takes, and the operating days
   * whose run starts while the same driver or truck is still on an earlier one
   * (a 32-hour round trip booked every day with one crew).
   */
  const runCheck = useMemo(() => {
    if (!isMonthly || selectedDates.length === 0 || !slot.pickupTime) return { minutes: null as number | null, clashDates: [] as string[] };
    try {
      const rows = buildRows();
      const first = rows[0];
      const minutes = first?.planned_end ? Math.round((Date.parse(first.planned_end) - Date.parse(first.planned_start)) / 60000) : null;
      const clashDates = assignmentType === 'third_party'
        ? []
        : [...new Set(rosterClashes(rows).map((c) => dateInZone(Date.parse(rows[c.second].planned_start), tz)))].sort();
      return { minutes, clashDates };
    } catch {
      return { minutes: null, clashDates: [] };
    }
  }, [isMonthly, selectedDates.length, slot.pickupTime, buildRows, assignmentType, tz]);

  const pastTripCount = useMemo(() => {
    if (allIssues.length > 0) return 0;
    try {
      return countPastTrips(buildRows());
    } catch {
      return 0;
    }
  }, [allIssues.length, buildRows]);

  /** Saves a newly defined quotation (if any), then creates the trip(s). Returns an error message or null. */
  const submit = useCallback(
    async (pastChoice: 'Completed' | 'Incomplete' = 'Incomplete'): Promise<{ ok: boolean; partial?: boolean; message: string; step?: CreateTripStep; tripIds?: string[] }> => {
      if (allIssues.length > 0) {
        const first = allIssues[0];
        return { ok: false, message: first.message, step: STEP_OF[first.section] };
      }
      setSubmitting(true);
      try {
        let newQuotationId: string | undefined;
        let quotationNote = '';
        if (savesNewQuotation) {
          try {
            const ensure = async (name: string, id?: string | null) => {
              if (id || !name.trim()) return id ?? null;
              const created = await operatorService.createLocation({ name: name.trim(), customer_id: customerId });
              return created.id;
            };
            const originLocationId = await ensure(slot.origin, slot.originLocationId);
            const destinationLocationId = await ensure(slot.destination, slot.destinationLocationId);
            const created = await operatorService.createQuotationRaw(
              // A monthly contract's rate is per month (billed ÷ 30 per trip); an extra trip's is per trip.
              buildQuotationFromSlot({ ...slot, pricingBasis: isMonthly ? 'Per Month' : 'Per Trip' }, {
                customerId,
                vehicleType,
                rateCategory,
                billingType,
                isThirdParty: assignmentType === 'third_party',
                originLocationId,
                destinationLocationId,
              }),
            );
            newQuotationId = created?.id;
          } catch (e: any) {
            // Same as the web: the trip still goes ahead at the typed price.
            quotationNote = ` The quotation couldn't be saved (${e?.message || 'error'}).`;
          }
        }

        let rows = buildRows(newQuotationId);
        if (countPastTrips(rows) > 0) rows = applyPastTripStatus(rows, pastChoice, tz);

        const res = await operatorService.bulkImportTrips(rows);
        if (!res || !res.imported) {
          const firstError = res?.results?.find((r) => !r.success)?.error;
          return { ok: false, message: `Trip not created: ${firstError || 'unknown error'}` };
        }
        if (res.failed > 0) {
          // Some trips exist now — leave the form so submitting again can't create them twice.
          const firstError = res.results?.find((r) => !r.success)?.error;
          invalidateOperatorTrips();
          return {
            ok: true,
            partial: true,
            message: `${res.imported} created, ${res.failed} failed: ${firstError || 'unknown error'}. Create the failed ones again.`,
          };
        }
        invalidateOperatorTrips();
        return {
          ok: true,
          message: (res.imported === 1 ? 'Trip created.' : `${res.imported} trips created.`) + quotationNote,
          // Every trip made — the assignment message covers them all.
          tripIds: (res.results ?? []).filter((r) => r.success && r.created_id).map((r) => r.created_id as string),
        };
      } catch (e: any) {
        return { ok: false, message: e?.response?.data?.error?.message || e?.message || 'Trip not created' };
      } finally {
        setSubmitting(false);
      }
    },
    [allIssues, slot, savesNewQuotation, isMonthly, customerId, vehicleType, rateCategory, billingType, assignmentType, buildRows, tz],
  );

  /* ── Derived lookups ── */
  const selectedCustomer = customers.find((c) => c.id === customerId) || null;
  const selectedDriver = drivers.find((d) => d.id === driverId) || null;
  const selectedVehicle = vehicles.find((v) => v.id === vehicleId) || null;
  const selectedCoDriver = drivers.find((d) => d.id === coDriverId) || null;
  const selectedProvider = providers.find((p) => p.id === thirdPartyProviderId) || null;

  const lineTypeOptions = useMemo(() => {
    const known = Object.keys(LINE_TYPE_LABELS);
    const fromQuotations = quotations.map(lineTypeOf).filter((t) => !known.includes(t));
    return [...known, ...Array.from(new Set(fromQuotations))];
  }, [quotations]);

  return {
    tz,
    today,
    loading,
    fleetLoading,
    loadError,
    step,
    setStep,
    // data
    customers,
    drivers,
    vehicles,
    providers,
    locations,
    quotations,
    quotationsLoading,
    recommended,
    recommendedLoading,
    compatRules,
    lineTypeOptions,
    refreshFleet,
    recentRoutes,
    applyRecentRoute,
    quotationUse,
    surchargeRules,
    // customer + price
    customerId,
    setCustomerId,
    selectedCustomer,
    rateCategory,
    setRateCategory,
    billingType,
    setBillingType,
    vehicleType,
    setVehicleType,
    isMonthly,
    isRound,
    applyQuotation,
    clearQuotation,
    routeMatches,
    priceState,
    savesNewQuotation,
    payoutMissing,
    dutyMinutes,
    // route
    slot,
    updateSlot,
    setEndpoint,
    addStop,
    removeStop,
    setReturnEndpoint,
    createLocation,
    createPinnedLocation,
    setEndpointPin,
    setStopPin,
    setStopFee,
    routeComplete,
    charges,
    setCharges,
    // schedule
    setDropoff,
    dropoffTouched,
    setReturnPickup,
    setReturnDropoff,
    returnDropoffTouched,
    isRoundTrip,
    runCheck,
    travelMinutes,
    eta,
    etaPending: routeReady && !eta,
    selectedDates,
    setSelectedDates,
    // fleet
    assignmentType,
    setAssignmentType,
    driverId,
    selectDriver,
    vehicleId,
    setVehicleId,
    coDriverId,
    setCoDriverId,
    coDriverSplit,
    setCoDriverSplit,
    assignLater,
    awbNumber,
    setAwbNumber,
    thirdPartyProviderId,
    setThirdPartyProviderId,
    thirdPartyDriverName,
    setThirdPartyDriverName,
    thirdPartyDriverPhone,
    setThirdPartyDriverPhone,
    thirdPartyVehiclePlate,
    setThirdPartyVehiclePlate,
    thirdPartyCost,
    setThirdPartyCost,
    partnerRate,
    partnerDrivers,
    usePartnerDriver,
    monthlyMode,
    setMonthlyMode,
    rotationDrivers,
    setRotationDrivers,
    dayOverrides,
    setDayOverride,
    dayAssignments,
    driverTruckId,
    selectedDriver,
    selectedVehicle,
    selectedCoDriver,
    selectedProvider,
    // money + checks + submit
    money,
    allIssues,
    stepIssues,
    pastTripCount,
    submitting,
    submit,
  };
}

export type CreateTripForm = ReturnType<typeof useCreateTrip>;

/** Shared with the quotation cards so a card shows the billing and type the matching uses. */
export { truckClassOfVehicle, billingOf as quotationBilling, lineTypeOf as quotationLineType, classOf as quotationClass };

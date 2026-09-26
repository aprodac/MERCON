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
  routeLegsFromSlot,
  truckClassOfVehicle,
  validateTripDraft,
  zonedWallTimeToUtcIso,
  type DayAssignmentInput,
  type TripChargeInput,
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
  type OperatorThirdPartyProvider,
  type OperatorVehicleOption,
  type RecommendedDriver,
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

const num = (v?: string | number | null) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

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
    destination: dest.name,
    destinationName: dest.name,
    destinationLocationId: dest.locationId ?? null,
    destinationLat: dest.lat ?? null,
    destinationLng: dest.lng ?? null,
    intermediateLocations: mids.map((m) => m.name),
    intermediateLocationIds: mids.map((m) => m.locationId ?? null),
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

export function useCreateTrip(params: { customerId?: string; billingType?: string; assignment?: string }) {
  const [tz, setTz] = useState('Asia/Riyadh');
  const [today, setToday] = useState(() => dateInZone(Date.now(), 'Asia/Riyadh'));

  /* ── Data ── */
  const [customers, setCustomers] = useState<OperatorCustomer[]>([]);
  const [drivers, setDrivers] = useState<OperatorDriverOption[]>([]);
  const [vehicles, setVehicles] = useState<OperatorVehicleOption[]>([]);
  const [providers, setProviders] = useState<OperatorThirdPartyProvider[]>([]);
  const [locations, setLocations] = useState<OperatorLocation[]>([]);
  const [quotations, setQuotations] = useState<OperatorQuotation[]>([]);
  const [quotationsLoading, setQuotationsLoading] = useState(Boolean(params.customerId));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [recommended, setRecommended] = useState<RecommendedDriver[]>([]);

  /* ── Form ── */
  const [step, setStep] = useState<CreateTripStep>(1);
  const [customerId, setCustomerIdRaw] = useState(params.customerId ?? '');
  const [rateCategory, setRateCategory] = useState<string>('SINGLE_TRIP');
  const [billingType, setBillingType] = useState<'Extra' | 'Monthly'>(params.billingType === 'Monthly' ? 'Monthly' : 'Extra');
  const [vehicleType, setVehicleType] = useState<string>('10 TON');
  // The slot as entered; `slot` below adds the suggested drop-off until the user sets one.
  const [rawSlot, setSlot] = useState<TripSlotDraft>(() => emptySlot());
  const [charges, setCharges] = useState<TripChargeInput[]>([]);
  const [dropoffTouched, setDropoffTouched] = useState(false);
  const [routeEstimate, setRouteEstimate] = useState<RouteEstimate | null>(null);

  const [assignmentType, setAssignmentType] = useState<AssignmentType>(params.assignment === 'third_party' ? 'third_party' : 'own');
  const [driverId, setDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [coDriverId, setCoDriverId] = useState('');
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

  /** A duty trip's length (10 / 12 hours), or null for a trip that runs as long as the drive. */
  const dutyMinutes = useMemo(() => {
    const t = normalizeLineTypeToken(rateCategory);
    return t === '10_HRS' ? 600 : t === '12_HRS' ? 720 : null;
  }, [rateCategory]);

  /** Drop-off follows pickup + duty length or drive time (rounded up to 15 min) until the user sets it. */
  const slot = useMemo<TripSlotDraft>(() => {
    const base = { ...rawSlot, saveAsQuotation: false };
    if (dropoffTouched || !rawSlot.pickupTime || (!isMonthly && !rawSlot.date)) return isMonthly ? { ...base, dropoffDate: '' } : base;
    const [h, m] = rawSlot.pickupTime.split(':').map(Number);
    const total = h * 60 + m + Math.ceil((dutyMinutes ?? travelMinutes ?? 240) / 15) * 15;
    const hh = String(Math.floor((total % 1440) / 60)).padStart(2, '0');
    const mm = String(total % 60).padStart(2, '0');
    return {
      ...base,
      dropoffTime: `${hh}:${mm}`,
      // Monthly: each day's drop-off is that day (or the next morning when earlier than pickup).
      dropoffDate: isMonthly ? '' : rawSlot.date ? addDaysToDateStr(rawSlot.date, Math.floor(total / 1440)) : rawSlot.date,
    };
  }, [rawSlot, dropoffTouched, travelMinutes, isMonthly, dutyMinutes]);
  const isRound = isRoundTripCategory(rateCategory);
  const toUtcIso = useCallback((date: string, time: string) => zonedWallTimeToUtcIso(date, time, tz), [tz]);

  /* ── Load ── */
  useEffect(() => {
    let alive = true;
    Promise.all([
      operatorService.customers(),
      operatorService.driversLookup(),
      operatorService.vehiclesLookup(),
      operatorService.thirdPartyProviders(),
      operatorService.deploymentTimezone(),
    ])
      .then(([c, d, v, p, zone]) => {
        if (!alive) return;
        setCustomers(c || []);
        setDrivers(d || []);
        setVehicles((v || []).filter((x) => x.isActive !== false));
        setProviders(p || []);
        setTz(zone);
        const zoneToday = dateInZone(Date.now(), zone);
        setToday(zoneToday);
      })
      .catch((e) => alive && setLoadError(e?.message || 'Could not load customers and fleet'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

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
    return () => {
      alive = false;
    };
  }, [customerId]);

  /* ── Quotation matching ── */
  const clearPrice = (s: TripSlotDraft, keepTyped: boolean): TripSlotDraft => ({
    ...s,
    rateMatched: false,
    matchedRateCard: null,
    rateCardId: undefined,
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
      tripCharges: '',
      pricingBasis: undefined,
      saveAsQuotation: false,
    }));
  }, []);

  const clearQuotation = useCallback(() => setSlot((s) => clearPrice(s, false)), []);

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

  const priceState: PriceState = !routeComplete ? 'no_route' : slot.rateMatched && slot.matchedRateCard ? 'matched' : 'define';

  /** Own-fleet trips need a driver payout; a quotation saved without one leaves it empty. */
  const payoutMissing = assignmentType === 'own' && priceState !== 'no_route' && !(num(slot.driverPayout) > 0);

  /** A price typed for an unquoted route is saved as a new quotation when the trip is created. */
  const savesNewQuotation = priceState === 'define' && num(slot.billingAmount) > 0;

  const setCustomerId = useCallback((id: string) => {
    setCustomerIdRaw(id);
    setQuotations([]);
    setLocations([]);
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
    }));
  }, []);

  const addStop = useCallback((leg: 0 | 1, loc: LocationPick) => {
    setSlot((s) =>
      leg === 0
        ? { ...s, intermediateLocations: [...s.intermediateLocations, loc.name], intermediateLocationIds: [...(s.intermediateLocationIds || []), loc.locationId ?? null] }
        : { ...s, returnIntermediateLocations: [...(s.returnIntermediateLocations || []), loc.name], returnIntermediateLocationIds: [...(s.returnIntermediateLocationIds || []), loc.locationId ?? null] },
    );
  }, []);

  const removeStop = useCallback((leg: 0 | 1, index: number) => {
    setSlot((s) =>
      leg === 0
        ? { ...s, intermediateLocations: s.intermediateLocations.filter((_, i) => i !== index), intermediateLocationIds: (s.intermediateLocationIds || []).filter((_, i) => i !== index) }
        : { ...s, returnIntermediateLocations: (s.returnIntermediateLocations || []).filter((_, i) => i !== index), returnIntermediateLocationIds: (s.returnIntermediateLocationIds || []).filter((_, i) => i !== index) },
    );
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
    (patch: { dropoffDate?: string; dropoffTime?: string }) => {
      // Start from what's on screen (the suggestion) so changing only the time keeps the date.
      setSlot((s) => ({ ...s, dropoffDate: slot.dropoffDate, dropoffTime: slot.dropoffTime, ...patch }));
      setDropoffTouched(true);
    },
    [slot.dropoffDate, slot.dropoffTime],
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
    [driverTruckId, coDriverId],
  );

  const assignLater = useCallback(() => {
    setDriverId(UNASSIGNED);
    setVehicleId(UNASSIGNED);
    setCoDriverId('');
  }, []);

  useEffect(() => {
    if (step !== 3 || assignmentType !== 'own') return;
    let alive = true;
    operatorService
      .recommendedDrivers({
        origin: slot.origin || undefined,
        destination: slot.destination || undefined,
        vehicleClass: vehicleType || undefined,
        vehicleId: vehicleId && vehicleId !== UNASSIGNED ? vehicleId : undefined,
      })
      .then((r) => alive && setRecommended(r));
    return () => {
      alive = false;
    };
    // vehicleId left out on purpose: picking a driver sets it, which shouldn't reshuffle the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, assignmentType, slot.origin, slot.destination, vehicleType]);

  /** Monthly: who drives which day. Single mode needs none — every day uses the chosen driver. */
  const dayAssignments = useMemo<Record<string, DayAssignmentInput>>(() => {
    if (!isMonthly || assignmentType !== 'own' || monthlyMode === 'single') return {};
    if (monthlyMode === 'per_day') return dayOverrides;
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
  }, [isMonthly, assignmentType, monthlyMode, dayOverrides, rotationDrivers, selectedDates, driverTruckId]);

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
        selectedDates,
        toUtcIso,
      }),
    [customerId, slot, billingType, assignmentType, driverId, vehicleId, thirdPartyProviderId, thirdPartyDriverName, thirdPartyCost, selectedDates, toUtcIso, rotationActive, rotationDrivers],
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
    async (pastChoice: 'Completed' | 'Incomplete' = 'Incomplete'): Promise<{ ok: boolean; message: string; step?: CreateTripStep }> => {
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
        if (!res || res.failed > 0) {
          const firstError = res?.results?.find((r) => !r.success)?.error;
          return {
            ok: false,
            message: res?.imported
              ? `${res.imported} created, ${res.failed} failed: ${firstError || 'unknown error'}`
              : `Trip not created: ${firstError || 'unknown error'}`,
          };
        }
        invalidateOperatorTrips();
        return {
          ok: true,
          message: (res.imported === 1 ? 'Trip created.' : `${res.imported} trips created.`) + quotationNote,
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
    lineTypeOptions,
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
    routeComplete,
    charges,
    setCharges,
    // schedule
    setDropoff,
    dropoffTouched,
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

import { useState, useEffect, useMemo, useCallback } from 'react';
import { safeSecureStore } from '@mercon/mobile-shared/lib/secure-store';
import {
  operatorService,
  type OperatorCustomer,
  type OperatorDriver,
  type OperatorVehicle,
  type OperatorLocation,
  type OperatorQuotation,
  type OperatorThirdPartyProvider,
  getQuotationRoute,
} from '../../../lib/operator';
import {
  estimateTravelTimeByName,
  calculateArrivalDropoffDateAndTime,
} from '../../../lib/travelTimeService';
import { type DayAssignmentOverride } from '../../../components';
import { findMatchingQuotation } from '../../../lib/quotationMatching';
import {
  applyMonthlyAssignmentStrategy,
  type MonthlyStrategyMode,
} from '../../../lib/monthlyRotation';

const DRAFT_STORAGE_KEY = 'MERCON_OPERATOR_TRIP_DRAFT_V3';
const RECENT_ROUTES_STORAGE_KEY = 'MERCON_RECENT_ROUTES_V1';
const ASSIGN_LATER = 'assign_later';

export interface RecentRouteItem {
  id: string;
  originName: string;
  originLat?: string;
  originLng?: string;
  originLocationId?: string;
  destName: string;
  destLat?: string;
  destLng?: string;
  destLocationId?: string;
}

export interface IntermediateStop {
  id: string;
  name: string;
  lat: string;
  lng: string;
  locationId?: string;
  results?: OperatorLocation[];
  showResults?: boolean;
}

export interface AdditionalChargeItem {
  id: string;
  charge_type: string;
  amount: number;
}

export type RateCategoryType = 'SINGLE_TRIP' | 'ROUND_TRIP' | '10_HRS' | '12_HRS';

function formatDateDDMMYYYY(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function normalizeBillingType(val?: string | null): 'Monthly' | 'Extra' {
  if (!val) return 'Monthly';
  const s = String(val).toUpperCase().trim();
  if (/\b(EXTRA|SPOT|ADHOC)\b/i.test(s)) return 'Extra';
  return 'Monthly';
}

export function useCreateTripForm(presetCustomerId?: string, initialBillingType?: string, initialAssignment?: string) {
  // Navigation & Page State
  const [page, setPage] = useState<1 | 2>(1);

  // Master Data Lists
  const [customers, setCustomers] = useState<OperatorCustomer[]>([]);
  const [drivers, setDrivers] = useState<OperatorDriver[]>([]);
  const [vehicles, setVehicles] = useState<OperatorVehicle[]>([]);
  const [locations, setLocations] = useState<OperatorLocation[]>([]);
  const [quotations, setQuotations] = useState<OperatorQuotation[]>([]);
  const [thirdPartyProviders, setThirdPartyProviders] = useState<OperatorThirdPartyProvider[]>([]);
  const [savedRecentRoutes, setSavedRecentRoutes] = useState<RecentRouteItem[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  // Draft banner state
  const [hasSavedDraft, setHasSavedDraft] = useState(false);

  // Customer Selection & Filters
  const [customerId, setCustomerId] = useState(presetCustomerId ?? '');
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [selectedQuotationId, setSelectedQuotationId] = useState<string>('');
  const [matchedRateCard, setMatchedRateCard] = useState<OperatorQuotation | null>(null);
  const [lineTypeFilter, setLineTypeFilter] = useState<'ALL' | RateCategoryType>('ALL');

  const isQuotationApplied = useMemo(() => Boolean(selectedQuotationId && matchedRateCard), [selectedQuotationId, matchedRateCard]);

  // Inline Quotation Creator Form State
  const [showDefineQuotationForm, setShowDefineQuotationForm] = useState(false);
  const [defineRateCategory, setDefineRateCategory] = useState<RateCategoryType>('SINGLE_TRIP');
  const [defineLineRateInput, setDefineLineRateInput] = useState('');
  const [defineDriverFeeInput, setDefineDriverFeeInput] = useState('');
  const [defineBillingType, setDefineBillingType] = useState<'Monthly' | 'Extra'>('Extra');
  const [definingQuotation, setDefiningQuotation] = useState(false);

  // Commercial Route & Stops
  const [rateCategory, setRateCategory] = useState<RateCategoryType>('SINGLE_TRIP');
  const [billingType, setBillingType] = useState<'Monthly' | 'Extra'>('Extra');
  const [pickupName, setPickupName] = useState('');
  const [pickupLat, setPickupLat] = useState('');
  const [pickupLng, setPickupLng] = useState('');
  const [pickupLocationId, setPickupLocationId] = useState<string | undefined>(undefined);

  const [dropoffName, setDropoffName] = useState('');
  const [dropoffLat, setDropoffLat] = useState('');
  const [dropoffLng, setDropoffLng] = useState('');
  const [dropoffLocationId, setDropoffLocationId] = useState<string | undefined>(undefined);

  const [outboundStops, setOutboundStops] = useState<IntermediateStop[]>([]);
  const [pickupResults, setPickupResults] = useState<OperatorLocation[]>([]);
  const [showPickupResults, setShowPickupResults] = useState(false);
  const [dropoffResults, setDropoffResults] = useState<OperatorLocation[]>([]);
  const [showDropoffResults, setShowDropoffResults] = useState(false);

  // Additional Charges
  const [additionalCharges, setAdditionalCharges] = useState<AdditionalChargeItem[]>([]);
  const [customChargeType, setCustomChargeType] = useState('');
  const [customChargeAmount, setCustomChargeAmount] = useState('');

  // Round-trip Return Leg Override & Endpoints
  const [enableReturnLeg, setEnableReturnLeg] = useState(false);
  const [returnLegDriverFeeInput, setReturnLegDriverFeeInput] = useState('');
  const [returnLegRateInput, setReturnLegRateInput] = useState('');
  const [returnPickupName, setReturnPickupName] = useState('');
  const [returnPickupLat, setReturnPickupLat] = useState('');
  const [returnPickupLng, setReturnPickupLng] = useState('');
  const [returnPickupLocationId, setReturnPickupLocationId] = useState<string | undefined>(undefined);
  const [returnDropoffName, setReturnDropoffName] = useState('');
  const [returnDropoffLat, setReturnDropoffLat] = useState('');
  const [returnDropoffLng, setReturnDropoffLng] = useState('');
  const [returnDropoffLocationId, setReturnDropoffLocationId] = useState<string | undefined>(undefined);
  const [returnStops, setReturnStops] = useState<IntermediateStop[]>([]);

  // Schedule & Time State
  const [date, setDate] = useState(formatDateDDMMYYYY(new Date()));
  const [time, setTime] = useState('08:00');
  const [estimatedHours, setEstimatedHours] = useState('4.0');
  const [isEstTravelCalculated, setIsEstTravelCalculated] = useState(false);

  // Auto-calculated Arrival State
  const [autoEtaDropoffDate, setAutoEtaDropoffDate] = useState<string | null>(null);
  const [autoEtaDropoffTime, setAutoEtaDropoffTime] = useState<string | null>(null);

  // Monthly Duty Schedule State
  const [selectedMonthlyDates, setSelectedMonthlyDates] = useState<string[]>([]);
  const [monthlyCurrentMonth, setMonthlyCurrentMonth] = useState(new Date());
  const [monthlyAssignmentMode, setMonthlyAssignmentMode] = useState<'MASTER' | 'PER_DAY' | 'ROTATION'>('MASTER');
  const [rotationCount, setRotationCount] = useState<2 | 3 | 4>(2);
  const [rotationDrivers, setRotationDrivers] = useState<string[]>([ASSIGN_LATER, ASSIGN_LATER, ASSIGN_LATER, ASSIGN_LATER]);
  const [rotationVehicles, setRotationVehicles] = useState<string[]>([ASSIGN_LATER, ASSIGN_LATER, ASSIGN_LATER, ASSIGN_LATER]);
  const [dayAssignments, setDayAssignments] = useState<Record<string, DayAssignmentOverride>>({});

  // Fleet & Execution Assignment State
  const [fleetType, setFleetType] = useState<'OWN' | 'THIRD_PARTY'>(initialAssignment === 'third_party' ? 'THIRD_PARTY' : 'OWN');
  const [driverId, setDriverId] = useState<string>(ASSIGN_LATER);
  const [vehicleId, setVehicleId] = useState<string>(ASSIGN_LATER);
  const [driverSearchQuery, setDriverSearchQuery] = useState('');
  const [vehicleSearchQuery, setVehicleSearchQuery] = useState('');

  // Recommended Drivers toggle & list
  const [showRecommendedDrivers, setShowRecommendedDrivers] = useState(true);

  // Co-Driver State
  const [showCoDriver, setShowCoDriver] = useState(false);
  const [coDriverId, setCoDriverId] = useState<string>('');
  const [coDriverPayoutInput, setCoDriverPayoutInput] = useState('');
  const [coDriverSearchQuery, setCoDriverSearchQuery] = useState('');

  // 3PL State
  const [thirdPartyProviderId, setThirdPartyProviderId] = useState('');
  const [thirdPartyCostInput, setThirdPartyCostInput] = useState('');
  const [thirdPartyDriverName, setThirdPartyDriverName] = useState('');
  const [thirdPartyDriverPhone, setThirdPartyDriverPhone] = useState('');
  const [thirdPartyVehiclePlate, setThirdPartyVehiclePlate] = useState('');

  // Financial Rates State
  const [rateInput, setRateInput] = useState('');
  const [costInput, setCostInput] = useState('');

  // Submission / Modals
  const [submitting, setSubmitting] = useState(false);
  const [showPastDateModal, setShowPastDateModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);

  // Toast
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'info' | 'error'>('success');

  const showToast = useCallback((msg: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToastMessage(msg);
    setToastType(type);
    setToastVisible(true);
  }, []);

  // Auto Select Vehicle when Driver is selected
  const handleSelectDriver = useCallback((dId: string) => {
    setDriverId(dId);
    setHasSavedDraft(false); // Dismiss draft banner when active selection happens

    if (dId && dId !== ASSIGN_LATER) {
      const drv = drivers.find((d) => d.id === dId);
      if (drv) {
        const assignedPlate = drv.assigned_vehicle?.plate_number || drv.current_vehicle?.plate_number;
        if (assignedPlate) {
          const matchVeh = vehicles.find((v) => v.plate_number.toLowerCase() === assignedPlate.toLowerCase());
          if (matchVeh) {
            setVehicleId(matchVeh.id);
          }
        }
      }
    }
  }, [drivers, vehicles]);

  // Select Customer & dismiss draft banner
  const handleSelectCustomer = useCallback((id: string) => {
    setCustomerId(id);
    setSelectedQuotationId('');
    setMatchedRateCard(null);
    setHasSavedDraft(false);
  }, []);

  // Select Quotation & dismiss draft banner
  const handleSelectQuotation = useCallback((qId: string) => {
    setSelectedQuotationId(qId);
    const qObj = quotations.find((q) => q.id === qId) || null;
    setMatchedRateCard(qObj);
    if (qObj) {
      if (qObj.rate != null) setRateInput(String(qObj.rate));
      if (qObj.driver_payout != null) setCostInput(String(qObj.driver_payout));
    }
    setHasSavedDraft(false);
  }, [quotations]);

  // Check saved draft on mount
  useEffect(() => {
    safeSecureStore.getItemAsync(DRAFT_STORAGE_KEY).then((draftStr) => {
      if (draftStr) {
        setHasSavedDraft(true);
      }
    });

    safeSecureStore.getItemAsync(RECENT_ROUTES_STORAGE_KEY).then((routesStr) => {
      if (routesStr) {
        try {
          const parsed = JSON.parse(routesStr);
          if (Array.isArray(parsed)) setSavedRecentRoutes(parsed.slice(0, 5));
        } catch (_) {}
      }
    });
  }, []);

  // Fetch options
  useEffect(() => {
    let unmounted = false;
    setLoadingOptions(true);
    setOptionsError(null);
    Promise.all([
      operatorService.customers(),
      operatorService.drivers(),
      operatorService.vehicles(),
      operatorService.locations(),
      operatorService.quotations(),
      operatorService.thirdPartyProviders(),
    ])
      .then(([custData, drivData, vehData, locData, quotData, tpData]) => {
        if (unmounted) return;
        setCustomers(custData || []);
        setDrivers(drivData || []);
        setVehicles(vehData || []);
        setLocations(locData || []);
        setQuotations(quotData || []);
        setThirdPartyProviders(tpData || []);
      })
      .catch((err) => {
        if (!unmounted) setOptionsError(err?.message || 'Failed to load options');
      })
      .finally(() => {
        if (!unmounted) setLoadingOptions(false);
      });
    return () => {
      unmounted = true;
    };
  }, []);

  // Handle Preset Customer
  useEffect(() => {
    if (presetCustomerId) {
      setCustomerId(presetCustomerId);
    }
  }, [presetCustomerId]);

  // Handle initial billing type param
  useEffect(() => {
    if (initialBillingType === 'Monthly' || initialBillingType === 'Extra') {
      setBillingType(initialBillingType);
    }
  }, [initialBillingType]);

  // Derived Objects
  const selectedCustomerObj = useMemo(
    () => customers.find((c) => c.id === customerId) || null,
    [customers, customerId]
  );

  const selectedDriverObj = useMemo(
    () => drivers.find((d) => d.id === driverId) || null,
    [drivers, driverId]
  );

  const selectedCoDriverObj = useMemo(
    () => drivers.find((d) => d.id === coDriverId) || null,
    [drivers, coDriverId]
  );

  const selectedVehicleObj = useMemo(
    () => vehicles.find((v) => v.id === vehicleId) || null,
    [vehicles, vehicleId]
  );

  const selected3PLProviderObj = useMemo(
    () => thirdPartyProviders.find((p) => p.id === thirdPartyProviderId) || null,
    [thirdPartyProviders, thirdPartyProviderId]
  );

  // Fetch quotations & locations specifically for the selected customer whenever customerId changes
  useEffect(() => {
    let unmounted = false;
    operatorService
      .locations(customerId || undefined)
      .then((custLocs) => {
        if (!unmounted && custLocs) setLocations(custLocs);
      })
      .catch(() => {});

    if (customerId) {
      operatorService
        .getQuotationsForCustomer(customerId)
        .then((custQuots) => {
          if (unmounted || !custQuots || custQuots.length === 0) return;
          setQuotations((prev) => {
            const existingIds = new Set(prev.map((q) => q.id));
            const newItems = custQuots.filter((q) => !existingIds.has(q.id));
            if (newItems.length === 0) return prev;
            return [...newItems, ...prev];
          });
        })
        .catch(() => {});
    }
    return () => {
      unmounted = true;
    };
  }, [customerId]);

  const handleCreateLocation = useCallback(async (payload: { name: string; city?: string; address?: string }): Promise<OperatorLocation> => {
    const created = await operatorService.createLocation({
      ...payload,
      customer_id: customerId || undefined,
    });
    setLocations((prev) => [created, ...prev]);
    return created;
  }, [customerId]);

  // Active customer quotations
  const activeCustomerQuotations = useMemo(() => {
    if (!customerId) return [];
    return quotations.filter((q) => {
      const qCustId = (q as any).customer_id || (q as any).customerId || (q as any).customer?.id;
      const isActive = q.is_active !== false;
      return qCustId === customerId && isActive;
    });
  }, [quotations, customerId]);

  // Active quotation rates
  const activeQuotationRates = useMemo(() => {
    const list: Array<{ quotation: OperatorQuotation; route: any }> = [];
    activeCustomerQuotations.forEach((q) => {
      const qRoutes = getQuotationRoute(q);
      const routesList = Array.isArray(qRoutes) ? qRoutes : qRoutes ? [qRoutes] : [];
      if (routesList.length > 0) {
        routesList.forEach((r) => {
          list.push({ quotation: q, route: r });
        });
      } else {
        list.push({
          quotation: q,
          route: {
            origin_name: q.origin_name || 'Origin',
            destination_name: q.destination_name || 'Destination',
            rate: q.rate,
            driver_fee: q.driver_payout,
          },
        });
      }
    });
    return list;
  }, [activeCustomerQuotations]);

  // Selected Quotation Object & Route
  const selectedQuotationObj = useMemo(
    () => quotations.find((q) => q.id === selectedQuotationId) || null,
    [quotations, selectedQuotationId]
  );

  const selectedQuotationRouteObj = useMemo(() => {
    if (!selectedQuotationObj) return null;
    const qRoutes = getQuotationRoute(selectedQuotationObj);
    const routesList = Array.isArray(qRoutes) ? qRoutes : qRoutes ? [qRoutes] : [];
    return routesList[0] || null;
  }, [selectedQuotationObj]);

  // Calculate Auto-ETA
  const calculateAutoEta = useCallback((dStr: string, tStr: string, hrsStr: string = estimatedHours) => {
    if (!dStr || !tStr) return;
    const hrs = parseFloat(hrsStr) || 4.0;
    const res = calculateArrivalDropoffDateAndTime(dStr, tStr, hrs);
    if (res) {
      setAutoEtaDropoffDate(res.dropoffDate);
      setAutoEtaDropoffTime(res.dropoffTime);
    }
  }, [estimatedHours]);

  // Auto-fill when quotation is selected
  useEffect(() => {
    if (!selectedQuotationObj || !selectedQuotationRouteObj) return;
    const route = selectedQuotationRouteObj as any;

    if (route.origin_name || route.origin) setPickupName(route.origin_name || route.origin);
    if (route.origin_lat) setPickupLat(String(route.origin_lat));
    if (route.origin_lng) setPickupLng(String(route.origin_lng));
    if (route.origin_location_id) setPickupLocationId(route.origin_location_id);

    if (route.destination_name || route.dest) setDropoffName(route.destination_name || route.dest);
    if (route.destination_lat) setDropoffLat(String(route.destination_lat));
    if (route.destination_lng) setDropoffLng(String(route.destination_lng));
    if (route.destination_location_id) setDropoffLocationId(route.destination_location_id);

    const normCat = (route.rate_category || selectedQuotationObj.rate_category || selectedQuotationObj.line_type || 'SINGLE_TRIP').toUpperCase() as RateCategoryType;
    if (['SINGLE_TRIP', 'ROUND_TRIP', '10_HRS', '12_HRS'].includes(normCat)) {
      setRateCategory(normCat);
    }
    const normB = normalizeBillingType(route.billing_type || selectedQuotationObj.billing_type);
    setBillingType(normB);

    if (selectedQuotationObj.rate != null) setRateInput(String(selectedQuotationObj.rate));
    if (selectedQuotationObj.driver_payout != null) setCostInput(String(selectedQuotationObj.driver_payout));

    const oName = route.origin_name || route.origin;
    const dName = route.destination_name || route.dest;
    if (oName && dName) {
      estimateTravelTimeByName(oName, dName).then((est) => {
        if (est) {
          const hrsStr = (est.durationMinutes / 60).toFixed(1);
          setEstimatedHours(hrsStr);
          setIsEstTravelCalculated(true);
          calculateAutoEta(date, time, hrsStr);
        }
      });
    }
  }, [selectedQuotationObj, selectedQuotationRouteObj, calculateAutoEta, date, time]);

  // Auto rematch or invalidate applied quotation when route/line-type/billing-type changes
  const invalidateOrRematchQuotation = useCallback((
    oName?: string,
    dName?: string,
    oLocId?: string,
    dLocId?: string,
    rCat?: RateCategoryType,
    bType?: 'Monthly' | 'Extra'
  ) => {
    const nextO = oName !== undefined ? oName : pickupName;
    const nextD = dName !== undefined ? dName : dropoffName;
    const nextOLocId = oLocId !== undefined ? oLocId : pickupLocationId;
    const nextDLocId = dLocId !== undefined ? dLocId : dropoffLocationId;
    const nextCat = rCat !== undefined ? rCat : rateCategory;
    const nextB = bType !== undefined ? bType : billingType;

    if (!customerId || activeCustomerQuotations.length === 0) {
      setSelectedQuotationId('');
      setMatchedRateCard(null);
      return;
    }

    const matched = findMatchingQuotation(activeCustomerQuotations, {
      originLocationId: nextOLocId,
      destinationLocationId: nextDLocId,
      originName: nextO,
      destinationName: nextD,
      rateCategory: nextCat,
      billingType: nextB,
    });

    if (matched) {
      setSelectedQuotationId(matched.id);
      setMatchedRateCard(matched);
      if (matched.rate != null) setRateInput(String(matched.rate));
      if (matched.driver_payout != null) setCostInput(String(matched.driver_payout));
    } else {
      setSelectedQuotationId('');
      setMatchedRateCard(null);
    }
  }, [customerId, activeCustomerQuotations, pickupName, dropoffName, pickupLocationId, dropoffLocationId, rateCategory, billingType]);

  // Location setters that auto-trigger quotation rematching & travel time estimate
  const handleSetPickupLocation = useCallback((name: string, loc?: OperatorLocation) => {
    setPickupName(name);
    const locId = loc?.id;
    setPickupLocationId(locId);
    if (loc?.lat != null) setPickupLat(String(loc.lat));
    if (loc?.lng != null) setPickupLng(String(loc.lng));

    if (name && dropoffName) {
      estimateTravelTimeByName(name, dropoffName).then((est) => {
        if (est) {
          const hrsStr = (est.durationMinutes / 60).toFixed(1);
          setEstimatedHours(hrsStr);
          setIsEstTravelCalculated(true);
          calculateAutoEta(date, time, hrsStr);
        }
      });
    }

    invalidateOrRematchQuotation(name, dropoffName, locId, dropoffLocationId, rateCategory, billingType);
  }, [dropoffName, dropoffLocationId, rateCategory, billingType, date, time, calculateAutoEta, invalidateOrRematchQuotation]);

  const handleSetDropoffLocation = useCallback((name: string, loc?: OperatorLocation) => {
    setDropoffName(name);
    const locId = loc?.id;
    setDropoffLocationId(locId);
    if (loc?.lat != null) setDropoffLat(String(loc.lat));
    if (loc?.lng != null) setDropoffLng(String(loc.lng));

    if (pickupName && name) {
      estimateTravelTimeByName(pickupName, name).then((est) => {
        if (est) {
          const hrsStr = (est.durationMinutes / 60).toFixed(1);
          setEstimatedHours(hrsStr);
          setIsEstTravelCalculated(true);
          calculateAutoEta(date, time, hrsStr);
        }
      });
    }

    invalidateOrRematchQuotation(pickupName, name, pickupLocationId, locId, rateCategory, billingType);
  }, [pickupName, pickupLocationId, rateCategory, billingType, date, time, calculateAutoEta, invalidateOrRematchQuotation]);

  const handleSelectRecentRoute = useCallback((r: RecentRouteItem) => {
    setPickupName(r.originName);
    setPickupLocationId(r.originLocationId);
    if (r.originLat) setPickupLat(r.originLat);
    if (r.originLng) setPickupLng(r.originLng);

    setDropoffName(r.destName);
    setDropoffLocationId(r.destLocationId);
    if (r.destLat) setDropoffLat(r.destLat);
    if (r.destLng) setDropoffLng(r.destLng);

    estimateTravelTimeByName(r.originName, r.destName).then((est) => {
      if (est) {
        const hrsStr = (est.durationMinutes / 60).toFixed(1);
        setEstimatedHours(hrsStr);
        setIsEstTravelCalculated(true);
        calculateAutoEta(date, time, hrsStr);
      }
    });

    invalidateOrRematchQuotation(r.originName, r.destName, r.originLocationId, r.destLocationId, rateCategory, billingType);
  }, [rateCategory, billingType, date, time, calculateAutoEta, invalidateOrRematchQuotation]);

  const handleSetRateCategory = useCallback((cat: RateCategoryType) => {
    setRateCategory(cat);
    invalidateOrRematchQuotation(undefined, undefined, undefined, undefined, cat);
  }, [invalidateOrRematchQuotation]);

  const handleSetBillingType = useCallback((bType: 'Monthly' | 'Extra') => {
    setBillingType(bType);
    invalidateOrRematchQuotation(undefined, undefined, undefined, undefined, undefined, bType);
  }, [invalidateOrRematchQuotation]);

  // Sync master driver / vehicle to rotation slot 0 when master values change
  useEffect(() => {
    if (driverId && rotationDrivers[0] !== driverId) {
      setRotationDrivers((prev) => [driverId, prev[1], prev[2], prev[3]]);
    }
  }, [driverId]);

  useEffect(() => {
    if (vehicleId && rotationVehicles[0] !== vehicleId) {
      setRotationVehicles((prev) => [vehicleId, prev[1], prev[2], prev[3]]);
    }
  }, [vehicleId]);

  // Apply monthly assignment strategy (round-robin or single/master)
  const applyRotationStrategy = useCallback((
    mode: 'MASTER' | 'PER_DAY' | 'ROTATION' = monthlyAssignmentMode,
    count: 2 | 3 | 4 = rotationCount,
    rDrivers: string[] = rotationDrivers,
    rVehicles: string[] = rotationVehicles,
    dates: string[] = selectedMonthlyDates
  ) => {
    if (dates.length === 0) return;

    const stratMode: MonthlyStrategyMode = mode === 'ROTATION' ? 'rotation' : mode === 'PER_DAY' ? 'per_day' : 'single';
    const computed = applyMonthlyAssignmentStrategy({
      mode: stratMode,
      rotationCount: count,
      selectedDates: dates,
      rotationDrivers: rDrivers,
      rotationVehicles: rVehicles,
      masterDriver: driverId,
      masterVehicle: vehicleId,
      existingDayAssignments: dayAssignments as any,
    });

    const formatted: Record<string, DayAssignmentOverride> = {};
    Object.entries(computed).forEach(([dateStr, item]) => {
      formatted[dateStr] = {
        driver_id: item.driverId,
        vehicle_id: item.vehicleId,
        co_driver_id: item.coDriverId,
        co_driver_payout: item.coDriverPayout,
        isCustom: item.isCustom,
      };
    });

    setDayAssignments(formatted);
  }, [monthlyAssignmentMode, rotationCount, rotationDrivers, rotationVehicles, selectedMonthlyDates, driverId, vehicleId, dayAssignments]);

  const handleStrategyChange = useCallback((mode: 'MASTER' | 'PER_DAY' | 'ROTATION', count?: 2 | 3 | 4) => {
    setMonthlyAssignmentMode(mode);
    const nextCount = count || rotationCount;
    if (count) setRotationCount(count);
    applyRotationStrategy(mode, nextCount, rotationDrivers, rotationVehicles, selectedMonthlyDates);
  }, [rotationCount, rotationDrivers, rotationVehicles, selectedMonthlyDates, applyRotationStrategy]);

  const handleUpdateRotationDriver = useCallback((slotIdx: number, dId: string) => {
    setRotationDrivers((prev) => {
      const next = [...prev];
      next[slotIdx] = dId;
      applyRotationStrategy(monthlyAssignmentMode, rotationCount, next, rotationVehicles, selectedMonthlyDates);
      return next;
    });

    if (dId && dId !== ASSIGN_LATER) {
      const drv = drivers.find((d) => d.id === dId);
      if (drv) {
        const assignedPlate = drv.assigned_vehicle?.plate_number || drv.current_vehicle?.plate_number;
        if (assignedPlate) {
          const matchVeh = vehicles.find((v) => v.plate_number.toLowerCase() === assignedPlate.toLowerCase());
          if (matchVeh) {
            setRotationVehicles((prev) => {
              const nextV = [...prev];
              nextV[slotIdx] = matchVeh.id;
              applyRotationStrategy(monthlyAssignmentMode, rotationCount, rotationDrivers, nextV, selectedMonthlyDates);
              return nextV;
            });
          }
        }
      }
    }
  }, [monthlyAssignmentMode, rotationCount, rotationVehicles, selectedMonthlyDates, applyRotationStrategy, drivers, vehicles, rotationDrivers]);

  const handleUpdateRotationVehicle = useCallback((slotIdx: number, vId: string) => {
    setRotationVehicles((prev) => {
      const next = [...prev];
      next[slotIdx] = vId;
      applyRotationStrategy(monthlyAssignmentMode, rotationCount, rotationDrivers, next, selectedMonthlyDates);
      return next;
    });
  }, [monthlyAssignmentMode, rotationCount, rotationDrivers, selectedMonthlyDates, applyRotationStrategy]);

  const handleDuplicateFirstDayToAll = useCallback(() => {
    if (selectedMonthlyDates.length === 0) return;
    const sorted = [...selectedMonthlyDates].sort();
    const firstDate = sorted[0];
    const firstObj = dayAssignments[firstDate];

    const dVal = firstObj?.driver_id || driverId;
    const vVal = firstObj?.vehicle_id || vehicleId;

    const updated: Record<string, DayAssignmentOverride> = {};
    selectedMonthlyDates.forEach((dStr) => {
      updated[dStr] = {
        driver_id: dVal,
        vehicle_id: vVal,
        isCustom: true,
      };
    });

    setDayAssignments(updated);
    showToast('First day assignment duplicated to all dates', 'success');
  }, [selectedMonthlyDates, dayAssignments, driverId, vehicleId, showToast]);

  // Recalculate travel time when origin/destination change
  const handleRecalculateTravelTime = useCallback(async (oName: string, dName: string) => {
    if (oName && dName) {
      const est = await estimateTravelTimeByName(oName, dName);
      if (est) {
        const hrsStr = (est.durationMinutes / 60).toFixed(1);
        setEstimatedHours(hrsStr);
        setIsEstTravelCalculated(true);
        calculateAutoEta(date, time, hrsStr);
      }
    }
  }, [calculateAutoEta, date, time]);

  // Handlers for Additional Charges
  const handleAddPresetCharge = useCallback((preset: { type: string; amount: number }) => {
    setAdditionalCharges((prev) => [
      ...prev,
      { id: String(Date.now() + Math.random()), charge_type: preset.type, amount: preset.amount },
    ]);
  }, []);

  const handleAddCustomCharge = useCallback(() => {
    if (!customChargeType.trim() || !customChargeAmount.trim()) return;
    const amt = parseFloat(customChargeAmount);
    if (isNaN(amt) || amt <= 0) return;
    setAdditionalCharges((prev) => [
      ...prev,
      { id: String(Date.now() + Math.random()), charge_type: customChargeType.trim(), amount: amt },
    ]);
    setCustomChargeType('');
    setCustomChargeAmount('');
  }, [customChargeType, customChargeAmount]);

  const handleRemoveCharge = useCallback((id: string) => {
    setAdditionalCharges((prev) => prev.filter((c) => c.id !== id));
  }, []);

  // Handlers for Intermediate Stops
  const handleAddStop = useCallback(() => {
    setOutboundStops((prev) => [
      ...prev,
      { id: String(Date.now()), name: '', lat: '', lng: '', results: [], showResults: false },
    ]);
  }, []);

  const handleRemoveStop = useCallback((id: string) => {
    setOutboundStops((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const handleUpdateStop = useCallback((id: string, name: string) => {
    setOutboundStops((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const matches = locations.filter((l) => l.name.toLowerCase().includes(name.toLowerCase())).slice(0, 5);
        return { ...s, name, results: matches, showResults: matches.length > 0 };
      })
    );
  }, [locations]);

  const handleSelectStopLocation = useCallback((stopId: string, loc: OperatorLocation) => {
    setOutboundStops((prev) =>
      prev.map((s) => {
        if (s.id !== stopId) return s;
        return {
          ...s,
          name: loc.name,
          lat: String(loc.lat ?? 0),
          lng: String(loc.lng ?? 0),
          locationId: loc.id,
          showResults: false,
        };
      })
    );
  }, []);

  // Handlers for Return Leg Intermediate Stops
  const handleAddReturnStop = useCallback(() => {
    setReturnStops((prev) => [
      ...prev,
      { id: String(Date.now()), name: '', lat: '', lng: '', results: [], showResults: false },
    ]);
  }, []);

  const handleRemoveReturnStop = useCallback((id: string) => {
    setReturnStops((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const handleUpdateReturnStop = useCallback((id: string, name: string) => {
    setReturnStops((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const matches = locations.filter((l) => l.name.toLowerCase().includes(name.toLowerCase())).slice(0, 5);
        return { ...s, name, results: matches, showResults: matches.length > 0 };
      })
    );
  }, [locations]);

  const handleSelectReturnStopLocation = useCallback((stopId: string, loc: OperatorLocation) => {
    setReturnStops((prev) =>
      prev.map((s) => {
        if (s.id !== stopId) return s;
        return {
          ...s,
          name: loc.name,
          lat: String(loc.lat ?? 0),
          lng: String(loc.lng ?? 0),
          locationId: loc.id,
          showResults: false,
        };
      })
    );
  }, []);

  // Draft Save/Restore/Discard
  const saveDraft = useCallback(async () => {
    const draftData = {
      customerId,
      selectedQuotationId,
      rateCategory,
      billingType,
      pickupName,
      pickupLat,
      pickupLng,
      pickupLocationId,
      dropoffName,
      dropoffLat,
      dropoffLng,
      dropoffLocationId,
      outboundStops,
      additionalCharges,
      enableReturnLeg,
      returnLegDriverFeeInput,
      returnLegRateInput,
      date,
      time,
      estimatedHours,
      fleetType,
      driverId,
      vehicleId,
      showCoDriver,
      coDriverId,
      coDriverPayoutInput,
      thirdPartyProviderId,
      thirdPartyCostInput,
      thirdPartyDriverName,
      thirdPartyDriverPhone,
      thirdPartyVehiclePlate,
      rateInput,
      costInput,
      updatedAt: new Date().toISOString(),
    };
    await safeSecureStore.setItemAsync(DRAFT_STORAGE_KEY, JSON.stringify(draftData));
    showToast('Trip draft saved successfully', 'info');
  }, [
    customerId, selectedQuotationId, rateCategory, billingType, pickupName, pickupLat, pickupLng, pickupLocationId,
    dropoffName, dropoffLat, dropoffLng, dropoffLocationId, outboundStops, additionalCharges, enableReturnLeg,
    returnLegDriverFeeInput, returnLegRateInput, date, time, estimatedHours, fleetType, driverId, vehicleId,
    showCoDriver, coDriverId, coDriverPayoutInput, thirdPartyProviderId, thirdPartyCostInput, thirdPartyDriverName,
    thirdPartyDriverPhone, thirdPartyVehiclePlate, rateInput, costInput, showToast,
  ]);

  const restoreDraft = useCallback(async () => {
    const draftStr = await safeSecureStore.getItemAsync(DRAFT_STORAGE_KEY);
    if (!draftStr) return;
    try {
      const data = JSON.parse(draftStr);
      if (data.customerId) setCustomerId(data.customerId);
      if (data.selectedQuotationId) setSelectedQuotationId(data.selectedQuotationId);
      if (data.rateCategory) setRateCategory(data.rateCategory);
      if (data.billingType) setBillingType(data.billingType);
      if (data.pickupName) setPickupName(data.pickupName);
      if (data.pickupLat) setPickupLat(data.pickupLat);
      if (data.pickupLng) setPickupLng(data.pickupLng);
      if (data.pickupLocationId) setPickupLocationId(data.pickupLocationId);
      if (data.dropoffName) setDropoffName(data.dropoffName);
      if (data.dropoffLat) setDropoffLat(data.dropoffLat);
      if (data.dropoffLng) setDropoffLng(data.dropoffLng);
      if (data.dropoffLocationId) setDropoffLocationId(data.dropoffLocationId);
      if (Array.isArray(data.outboundStops)) setOutboundStops(data.outboundStops);
      if (Array.isArray(data.additionalCharges)) setAdditionalCharges(data.additionalCharges);
      if (data.enableReturnLeg !== undefined) setEnableReturnLeg(data.enableReturnLeg);
      if (data.returnLegDriverFeeInput) setReturnLegDriverFeeInput(data.returnLegDriverFeeInput);
      if (data.returnLegRateInput) setReturnLegRateInput(data.returnLegRateInput);
      if (data.date) setDate(data.date);
      if (data.time) setTime(data.time);
      if (data.estimatedHours) setEstimatedHours(data.estimatedHours);
      if (data.fleetType) setFleetType(data.fleetType);
      if (data.driverId) setDriverId(data.driverId);
      if (data.vehicleId) setVehicleId(data.vehicleId);
      if (data.showCoDriver !== undefined) setShowCoDriver(data.showCoDriver);
      if (data.coDriverId) setCoDriverId(data.coDriverId);
      if (data.coDriverPayoutInput) setCoDriverPayoutInput(data.coDriverPayoutInput);
      if (data.thirdPartyProviderId) setThirdPartyProviderId(data.thirdPartyProviderId);
      if (data.thirdPartyCostInput) setThirdPartyCostInput(data.thirdPartyCostInput);
      if (data.thirdPartyDriverName) setThirdPartyDriverName(data.thirdPartyDriverName);
      if (data.thirdPartyDriverPhone) setThirdPartyDriverPhone(data.thirdPartyDriverPhone);
      if (data.thirdPartyVehiclePlate) setThirdPartyVehiclePlate(data.thirdPartyVehiclePlate);
      if (data.rateInput) setRateInput(data.rateInput);
      if (data.costInput) setCostInput(data.costInput);

      setHasSavedDraft(false);
      showToast('Draft restored cleanly', 'success');
    } catch (_) {
      showToast('Failed to parse saved draft', 'error');
    }
  }, [showToast]);

  const discardDraft = useCallback(async () => {
    await safeSecureStore.deleteItemAsync(DRAFT_STORAGE_KEY);
    setHasSavedDraft(false);
    showToast('Saved draft discarded', 'info');
  }, [showToast]);

  // Save selected route to recent routes
  const saveToRecentRoutes = useCallback(async (oName: string, dName: string) => {
    if (!oName || !dName) return;
    const newItem: RecentRouteItem = {
      id: `${oName}-${dName}`,
      originName: oName,
      originLat: pickupLat,
      originLng: pickupLng,
      originLocationId: pickupLocationId,
      destName: dName,
      destLat: dropoffLat,
      destLng: dropoffLng,
      destLocationId: dropoffLocationId,
    };
    const updated = [newItem, ...savedRecentRoutes.filter((r) => r.id !== newItem.id)].slice(0, 5);
    setSavedRecentRoutes(updated);
    await safeSecureStore.setItemAsync(RECENT_ROUTES_STORAGE_KEY, JSON.stringify(updated));
  }, [pickupLat, pickupLng, pickupLocationId, dropoffLat, dropoffLng, dropoffLocationId, savedRecentRoutes]);

  // Validation
  const validatePage1Fields = useCallback(() => {
    if (!customerId) {
      showToast('Please select a customer account', 'error');
      return false;
    }
    if (!pickupName.trim() || !dropoffName.trim()) {
      showToast('Please specify pickup and dropoff locations', 'error');
      return false;
    }
    return true;
  }, [customerId, pickupName, dropoffName, showToast]);

  const validatePage2Fields = useCallback(() => {
    if (billingType === 'Monthly' && selectedMonthlyDates.length === 0) {
      showToast('Please select at least 1 duty day in the monthly calendar', 'error');
      return false;
    }
    if (fleetType === 'THIRD_PARTY' && !thirdPartyProviderId) {
      showToast('Please select a 3PL Provider', 'error');
      return false;
    }
    return true;
  }, [billingType, selectedMonthlyDates, fleetType, thirdPartyProviderId, showToast]);

  // Financial calculations
  const baseBillingRate = parseFloat(rateInput) || 0;
  const totalAdditionalCharges = additionalCharges.reduce((acc, c) => acc + (c.amount || 0), 0);
  const effectiveBillingAmount = baseBillingRate + totalAdditionalCharges;
  const financialCost = fleetType === 'THIRD_PARTY' ? (parseFloat(thirdPartyCostInput) || 0) : (parseFloat(costInput) || 0);
  const netMargin = effectiveBillingAmount - financialCost;
  const marginPercent = effectiveBillingAmount > 0 ? (netMargin / effectiveBillingAmount) * 100 : 0;

  return {
    page, setPage,
    customers, setCustomers,
    drivers, setDrivers,
    vehicles, setVehicles,
    locations, setLocations,
    quotations, setQuotations,
    thirdPartyProviders, setThirdPartyProviders,
    savedRecentRoutes, setSavedRecentRoutes,
    loadingOptions, optionsError,
    hasSavedDraft, setHasSavedDraft,
    customerId, setCustomerId: handleSelectCustomer,
    customerSearchQuery, setCustomerSearchQuery,
    selectedQuotationId, setSelectedQuotationId: handleSelectQuotation,
    lineTypeFilter, setLineTypeFilter,
    showDefineQuotationForm, setShowDefineQuotationForm,
    defineRateCategory, setDefineRateCategory,
    defineLineRateInput, setDefineLineRateInput,
    defineDriverFeeInput, setDefineDriverFeeInput,
    defineBillingType, setDefineBillingType,
    definingQuotation, setDefiningQuotation,
    rateCategory, setRateCategory: handleSetRateCategory,
    billingType, setBillingType: handleSetBillingType,
    pickupName, setPickupName,
    handleSetPickupLocation,
    handleSetDropoffLocation,
    handleSelectRecentRoute,
    handleCreateLocation,
    pickupLat, setPickupLat,
    pickupLng, setPickupLng,
    pickupLocationId, setPickupLocationId,
    dropoffName, setDropoffName,
    dropoffLat, setDropoffLat,
    dropoffLng, setDropoffLng,
    dropoffLocationId, setDropoffLocationId,
    outboundStops, setOutboundStops,
    pickupResults, setPickupResults,
    showPickupResults, setShowPickupResults,
    dropoffResults, setDropoffResults,
    showDropoffResults, setShowDropoffResults,
    additionalCharges, setAdditionalCharges,
    customChargeType, setCustomChargeType,
    customChargeAmount, setCustomChargeAmount,
    enableReturnLeg, setEnableReturnLeg,
    returnLegDriverFeeInput, setReturnLegDriverFeeInput,
    returnLegRateInput, setReturnLegRateInput,
    returnPickupName, setReturnPickupName,
    returnPickupLat, setReturnPickupLat,
    returnPickupLng, setReturnPickupLng,
    returnPickupLocationId, setReturnPickupLocationId,
    returnDropoffName, setReturnDropoffName,
    returnDropoffLat, setReturnDropoffLat,
    returnDropoffLng, setReturnDropoffLng,
    returnDropoffLocationId, setReturnDropoffLocationId,
    returnStops, setReturnStops,
    handleAddReturnStop,
    handleRemoveReturnStop,
    handleUpdateReturnStop,
    handleSelectReturnStopLocation,
    date, setDate,
    time, setTime,
    estimatedHours, setEstimatedHours,
    isEstTravelCalculated, setIsEstTravelCalculated,
    autoEtaDropoffDate, setAutoEtaDropoffDate,
    autoEtaDropoffTime, setAutoEtaDropoffTime,
    selectedMonthlyDates, setSelectedMonthlyDates,
    monthlyCurrentMonth, setMonthlyCurrentMonth,
    matchedRateCard, setMatchedRateCard,
    isQuotationApplied,
    invalidateOrRematchQuotation,
    rotationCount, setRotationCount,
    rotationDrivers, setRotationDrivers,
    rotationVehicles, setRotationVehicles,
    handleStrategyChange,
    handleUpdateRotationDriver,
    handleUpdateRotationVehicle,
    handleDuplicateFirstDayToAll,
    monthlyAssignmentMode, setMonthlyAssignmentMode,
    dayAssignments, setDayAssignments,
    fleetType, setFleetType,
    driverId, setDriverId: handleSelectDriver,
    vehicleId, setVehicleId,
    driverSearchQuery, setDriverSearchQuery,
    vehicleSearchQuery, setVehicleSearchQuery,
    showRecommendedDrivers, setShowRecommendedDrivers,
    showCoDriver, setShowCoDriver,
    coDriverId, setCoDriverId,
    coDriverPayoutInput, setCoDriverPayoutInput,
    coDriverSearchQuery, setCoDriverSearchQuery,
    thirdPartyProviderId, setThirdPartyProviderId,
    thirdPartyCostInput, setThirdPartyCostInput,
    thirdPartyDriverName, setThirdPartyDriverName,
    thirdPartyDriverPhone, setThirdPartyDriverPhone,
    thirdPartyVehiclePlate, setThirdPartyVehiclePlate,
    rateInput, setRateInput,
    costInput, setCostInput,
    submitting, setSubmitting,
    showPastDateModal, setShowPastDateModal,
    showReviewModal, setShowReviewModal,
    toastVisible, setToastVisible,
    toastMessage, setToastMessage,
    toastType, setToastType,
    showToast,
    selectedCustomerObj,
    selectedDriverObj,
    selectedCoDriverObj,
    selectedVehicleObj,
    selected3PLProviderObj,
    activeCustomerQuotations,
    activeQuotationRates,
    selectedQuotationObj,
    selectedQuotationRouteObj,
    calculateAutoEta,
    handleRecalculateTravelTime,
    handleAddPresetCharge,
    handleAddCustomCharge,
    handleRemoveCharge,
    handleAddStop,
    handleRemoveStop,
    handleUpdateStop,
    handleSelectStopLocation,
    saveDraft,
    restoreDraft,
    discardDraft,
    saveToRecentRoutes,
    validatePage1Fields,
    validatePage2Fields,
    baseBillingRate,
    totalAdditionalCharges,
    effectiveBillingAmount,
    financialCost,
    netMargin,
    marginPercent,
  };
}

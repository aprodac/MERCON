import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, StatusBar, ActivityIndicator, Alert, Modal, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft, Check, Truck, Clock, MapPin, FileText,
  Plus, Trash2, AlertTriangle, RotateCcw, Building2, Zap, Edit3, ChevronRight,
} from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography } from '../../theme/tokens';
import { Button, Card, Input, StatusBadge } from '../../components';
import { getApiErrorMessage } from '../../lib/api';
import { safeSecureStore } from '../../lib/secure-store';
import {
  operatorService, invalidateOperatorTrips,
  type OperatorCustomer, type OperatorDriver, type OperatorVehicle,
  type OperatorLocation, type QuotationLookupMatch, type OperatorQuotation,
  type OperatorThirdPartyProvider, type CreateTripStopInput,
} from '../../lib/operator';

const ASSIGN_LATER = 'assign_later';
const DRAFT_STORAGE_KEY = 'MERCON_OPERATOR_TRIP_DRAFT_V3';

interface IntermediateStop {
  id: string;
  name: string;
  lat: string;
  lng: string;
  locationId?: string;
  results?: OperatorLocation[];
  showResults?: boolean;
}

interface AdditionalChargeItem {
  id: string;
  charge_type: string;
  amount: number;
}

const CHARGE_PRESETS = [
  { type: 'Labor / Offloading', amount: 200 },
  { type: 'Overtime / Detention', amount: 150 },
  { type: 'Same-Day Rush', amount: 100 },
  { type: 'Fuel Surcharge', amount: 250 },
];

function formatDateDDMMYYYY(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

const CreateTripScreen = () => {
  const router = useRouter();
  const { customerId: presetCustomerId } = useLocalSearchParams<{ customerId?: string }>();
  const scrollViewRef = useRef<ScrollView>(null);

  // Page pacing state: Page 1 ("Trip & Rate") vs Page 2 ("Schedule & Assignment")
  const [page, setPage] = useState<1 | 2>(1);

  // Master Data state
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<OperatorCustomer[]>([]);
  const [drivers, setDrivers] = useState<OperatorDriver[]>([]);
  const [vehicles, setVehicles] = useState<OperatorVehicle[]>([]);
  const [thirdPartyProviders, setThirdPartyProviders] = useState<OperatorThirdPartyProvider[]>([]);

  // Draft persistence state
  const [hasSavedDraft, setHasSavedDraft] = useState(false);
  const [savedDraftData, setSavedDraftData] = useState<any>(null);

  // Progressive Collapse state: collapses Route and Rate sections when quotation/lane is applied
  const [isRouteCollapsed, setIsRouteCollapsed] = useState(false);

  // Field-level error validation state
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Workflow state: Single Trip vs Round Trip
  const [rateCategory, setRateCategory] = useState<'SINGLE_TRIP' | 'ROUND_TRIP'>('SINGLE_TRIP');

  // Customer & Quotation state
  const [customerId, setCustomerId] = useState(presetCustomerId ?? '');
  const [quotations, setQuotations] = useState<OperatorQuotation[]>([]);
  const [loadingQuotations, setLoadingQuotations] = useState(false);
  const [selectedQuotation, setSelectedQuotation] = useState<OperatorQuotation | null>(null);

  // Pickup & Dropoff location state
  const [pickupName, setPickupName] = useState('');
  const [pickupLat, setPickupLat] = useState('');
  const [pickupLng, setPickupLng] = useState('');
  const [pickupLocationId, setPickupLocationId] = useState<string | undefined>(undefined);
  const [pickupResults, setPickupResults] = useState<OperatorLocation[]>([]);
  const [showPickupResults, setShowPickupResults] = useState(false);

  const [dropoffName, setDropoffName] = useState('');
  const [dropoffLat, setDropoffLat] = useState('');
  const [dropoffLng, setDropoffLng] = useState('');
  const [dropoffLocationId, setDropoffLocationId] = useState<string | undefined>(undefined);
  const [dropoffResults, setDropoffResults] = useState<OperatorLocation[]>([]);
  const [showDropoffResults, setShowDropoffResults] = useState(false);

  // Multi-stop state
  const [outboundStops, setOutboundStops] = useState<IntermediateStop[]>([]);

  // Departure & Delivery Due dates
  const [date, setDate] = useState(formatDateDDMMYYYY(new Date()));
  const [time, setTime] = useState('08:00');
  const [etaDate, setEtaDate] = useState(formatDateDDMMYYYY(new Date()));
  const [etaTime, setEtaTime] = useState('12:00');
  const [isAutoEta, setIsAutoEta] = useState(true);

  // Fleet Assignment state: Own Fleet vs 3PL Subcontractor
  const [fleetType, setFleetType] = useState<'OWN_FLEET' | 'THIRD_PARTY'>('OWN_FLEET');
  const [selectedDriver, setSelectedDriver] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState('');

  // 3PL Subcontractor state
  const [selected3PLProvider, setSelected3PLProvider] = useState('');
  const [thirdPartyDriverName, setThirdPartyDriverName] = useState('');
  const [thirdPartyDriverPhone, setThirdPartyDriverPhone] = useState('');
  const [thirdPartyVehiclePlate, setThirdPartyVehiclePlate] = useState('');
  const [thirdPartyCostInput, setThirdPartyCostInput] = useState('');

  // Rate & Financials state
  const [quotationMatch, setQuotationMatch] = useState<QuotationLookupMatch | null>(null);
  const [lookingUpRate, setLookingUpRate] = useState(false);
  const [manualRateOverride, setManualRateOverride] = useState(false);
  const [billingAmountInput, setBillingAmountInput] = useState('');
  const [driverPayoutInput, setDriverPayoutInput] = useState('');
  const [saveAsPersistentQuotation, setSaveAsPersistentQuotation] = useState(false);

  // Itemized Additional Charges state
  const [additionalCharges, setAdditionalCharges] = useState<AdditionalChargeItem[]>([]);
  const [customChargeType, setCustomChargeType] = useState('');
  const [customChargeAmount, setCustomChargeAmount] = useState('');

  // Submission & Modals state
  const [submitting, setSubmitting] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showPastDateModal, setShowPastDateModal] = useState(false);

  // Auto-ETA Dropoff Calculation: Departure + 4 hours
  const calculateAutoEta = (depDateStr: string, depTimeStr: string) => {
    const match = depDateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return;
    const [, dd, mm, yyyy] = match;
    const timeMatch = depTimeStr.match(/^(\d{1,2}):(\d{2})$/) ?? ['', '8', '0'];
    const [, hh, min] = timeMatch;

    const dep = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min));
    if (Number.isNaN(dep.getTime())) return;

    const eta = new Date(dep.getTime() + 4 * 60 * 60 * 1000);
    setEtaDate(formatDateDDMMYYYY(eta));
    const etaHh = String(eta.getHours()).padStart(2, '0');
    const etaMin = String(eta.getMinutes()).padStart(2, '0');
    setEtaTime(`${etaHh}:${etaMin}`);
    setIsAutoEta(true);
  };

  // Fetch Master Data
  useEffect(() => {
    (async () => {
      setLoadingOptions(true);
      setOptionsError(null);
      try {
        const [c, d, v, tp] = await Promise.all([
          operatorService.customers(),
          operatorService.availableDrivers(),
          operatorService.availableVehicles(),
          operatorService.thirdPartyProviders().catch(() => []),
        ]);
        setCustomers(c);
        setDrivers(d);
        setVehicles(v);
        setThirdPartyProviders(tp);
      } catch (e) {
        setOptionsError(getApiErrorMessage(e));
      } finally {
        setLoadingOptions(false);
      }
    })();
  }, []);

  // Check for saved draft on mount
  useEffect(() => {
    (async () => {
      try {
        const draft = await safeSecureStore.getItemAsync(DRAFT_STORAGE_KEY);
        if (draft) {
          const parsed = JSON.parse(draft);
          setSavedDraftData(parsed);
          setHasSavedDraft(true);
        }
      } catch {
        // silent
      }
    })();
  }, []);

  // Debounced draft autosave
  useEffect(() => {
    if (loadingOptions) return;
    const timer = setTimeout(async () => {
      const draftState = {
        customerId,
        rateCategory,
        pickupName, pickupLat, pickupLng, pickupLocationId,
        dropoffName, dropoffLat, dropoffLng, dropoffLocationId,
        outboundStops,
        date, time, etaDate, etaTime,
        fleetType, selectedDriver, selectedVehicle,
        selected3PLProvider, thirdPartyDriverName, thirdPartyDriverPhone,
        thirdPartyVehiclePlate, thirdPartyCostInput,
        billingAmountInput, driverPayoutInput, manualRateOverride,
        additionalCharges, saveAsPersistentQuotation, isRouteCollapsed,
      };
      try {
        await safeSecureStore.setItemAsync(DRAFT_STORAGE_KEY, JSON.stringify(draftState));
      } catch {
        // silent
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [
    customerId, rateCategory, pickupName, pickupLat, pickupLng, pickupLocationId,
    dropoffName, dropoffLat, dropoffLng, dropoffLocationId, outboundStops,
    date, time, etaDate, etaTime, fleetType, selectedDriver, selectedVehicle,
    selected3PLProvider, thirdPartyDriverName, thirdPartyDriverPhone,
    thirdPartyVehiclePlate, thirdPartyCostInput, billingAmountInput, driverPayoutInput,
    manualRateOverride, additionalCharges, saveAsPersistentQuotation, isRouteCollapsed, loadingOptions,
  ]);

  const restoreDraft = () => {
    if (!savedDraftData) return;
    const d = savedDraftData;
    if (d.customerId) setCustomerId(d.customerId);
    if (d.rateCategory) setRateCategory(d.rateCategory);
    if (d.pickupName) setPickupName(d.pickupName);
    if (d.pickupLat) setPickupLat(d.pickupLat);
    if (d.pickupLng) setPickupLng(d.pickupLng);
    if (d.pickupLocationId) setPickupLocationId(d.pickupLocationId);
    if (d.dropoffName) setDropoffName(d.dropoffName);
    if (d.dropoffLat) setDropoffLat(d.dropoffLat);
    if (d.dropoffLng) setDropoffLng(d.dropoffLng);
    if (d.dropoffLocationId) setDropoffLocationId(d.dropoffLocationId);
    if (Array.isArray(d.outboundStops)) setOutboundStops(d.outboundStops);
    if (d.date) setDate(d.date);
    if (d.time) setTime(d.time);
    if (d.etaDate) setEtaDate(d.etaDate);
    if (d.etaTime) setEtaTime(d.etaTime);
    if (d.fleetType) setFleetType(d.fleetType);
    if (d.selectedDriver) setSelectedDriver(d.selectedDriver);
    if (d.selectedVehicle) setSelectedVehicle(d.selectedVehicle);
    if (d.selected3PLProvider) setSelected3PLProvider(d.selected3PLProvider);
    if (d.thirdPartyDriverName) setThirdPartyDriverName(d.thirdPartyDriverName);
    if (d.thirdPartyDriverPhone) setThirdPartyDriverPhone(d.thirdPartyDriverPhone);
    if (d.thirdPartyVehiclePlate) setThirdPartyVehiclePlate(d.thirdPartyVehiclePlate);
    if (d.thirdPartyCostInput) setThirdPartyCostInput(d.thirdPartyCostInput);
    if (d.billingAmountInput) setBillingAmountInput(d.billingAmountInput);
    if (d.driverPayoutInput) setDriverPayoutInput(d.driverPayoutInput);
    if (typeof d.manualRateOverride === 'boolean') setManualRateOverride(d.manualRateOverride);
    if (Array.isArray(d.additionalCharges)) setAdditionalCharges(d.additionalCharges);
    if (typeof d.saveAsPersistentQuotation === 'boolean') setSaveAsPersistentQuotation(d.saveAsPersistentQuotation);
    if (typeof d.isRouteCollapsed === 'boolean') setIsRouteCollapsed(d.isRouteCollapsed);
    setPage(1);
    setHasSavedDraft(false);
  };

  const discardDraft = async () => {
    try {
      await safeSecureStore.deleteItemAsync(DRAFT_STORAGE_KEY);
    } catch {
      // silent
    }
    setHasSavedDraft(false);
    setSavedDraftData(null);
  };

  // Saved location search for Pickup
  useEffect(() => {
    if (!customerId || !pickupName.trim() || pickupLocationId) {
      setPickupResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const results = await operatorService.searchLocations(customerId, pickupName);
        setPickupResults(results);
        setShowPickupResults(true);
      } catch {
        setPickupResults([]);
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [customerId, pickupName, pickupLocationId]);

  // Saved location search for Dropoff
  useEffect(() => {
    if (!customerId || !dropoffName.trim() || dropoffLocationId) {
      setDropoffResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const results = await operatorService.searchLocations(customerId, dropoffName);
        setDropoffResults(results);
        setShowDropoffResults(true);
      } catch {
        setDropoffResults([]);
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [customerId, dropoffName, dropoffLocationId]);

  // Load customer's quotations
  useEffect(() => {
    if (!customerId) {
      setQuotations([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingQuotations(true);
      try {
        const results = await operatorService.getQuotationsForCustomer(customerId);
        if (!cancelled) setQuotations(results);
      } catch {
        if (!cancelled) setQuotations([]);
      } finally {
        if (!cancelled) setLoadingQuotations(false);
      }
    })();
    return () => { cancelled = true; };
  }, [customerId]);

  const handleSelectCustomer = (id: string) => {
    if (id === customerId) return;
    setCustomerId(id);
    setSelectedQuotation(null);
    setQuotationMatch(null);
    setManualRateOverride(false);
    setIsRouteCollapsed(false);
    setPickupName(''); setPickupLat(''); setPickupLng(''); setPickupLocationId(undefined);
    setDropoffName(''); setDropoffLat(''); setDropoffLng(''); setDropoffLocationId(undefined);
    setFieldErrors({});
  };

  // Tapping a Quotation Card automatically fills route+rate AND progressively collapses route section!
  const handleSelectQuotation = (q: OperatorQuotation) => {
    if (selectedQuotation?.id === q.id) {
      setSelectedQuotation(null);
      setQuotationMatch(null);
      setIsRouteCollapsed(false);
      return;
    }
    setSelectedQuotation(q);
    setManualRateOverride(false);
    if ((q.line_type ?? q.rate_category) === 'ROUND_TRIP') {
      setRateCategory('ROUND_TRIP');
    }
    setQuotationMatch({
      quotationId: q.id,
      rate: Number(q.rate ?? 0),
      driverPayout: Number(q.driver_payout ?? 0),
    });
    const originName = q.originLocation?.name ?? q.origin_name ?? '';
    const destName = q.destinationLocation?.name ?? q.destination_name ?? '';
    if (originName) setPickupName(originName);
    setPickupLocationId(q.originLocationId ?? undefined);
    if (q.originLocation?.lat != null) setPickupLat(String(q.originLocation.lat));
    if (q.originLocation?.lng != null) setPickupLng(String(q.originLocation.lng));
    if (destName) setDropoffName(destName);
    setDropoffLocationId(q.destinationLocationId ?? undefined);
    if (q.destinationLocation?.lat != null) setDropoffLat(String(q.destinationLocation.lat));
    if (q.destinationLocation?.lng != null) setDropoffLng(String(q.destinationLocation.lng));

    setIsRouteCollapsed(true);
    setFieldErrors({});
  };

  // Recent Routes Accelerator Chips
  const recentRoutes = useMemo(() => {
    const routeMap = new Map<string, { origin: string; dest: string; quotation: OperatorQuotation }>();
    quotations.forEach((q) => {
      const origin = q.originLocation?.name ?? q.origin_name;
      const dest = q.destinationLocation?.name ?? q.destination_name;
      if (origin && dest) {
        const key = `${origin} -> ${dest}`;
        if (!routeMap.has(key)) {
          routeMap.set(key, { origin, dest, quotation: q });
        }
      }
    });
    return Array.from(routeMap.values()).slice(0, 4);
  }, [quotations]);

  const selectedVehicleObj = vehicles.find((v) => v.id === selectedVehicle);

  // Auto rate lookup
  useEffect(() => {
    if (!customerId || manualRateOverride || selectedQuotation) return;
    let cancelled = false;
    (async () => {
      setLookingUpRate(true);
      const match = await operatorService.lookupQuotation({
        customer_id: customerId,
        origin_location_id: pickupLocationId,
        destination_location_id: dropoffLocationId,
        vehicle_type: selectedVehicleObj?.asset_type,
        rate_category: rateCategory,
        billing_type: 'EXTRA',
      });
      if (!cancelled) {
        setQuotationMatch(match);
        setLookingUpRate(false);
      }
    })();
    return () => { cancelled = true; };
  }, [customerId, pickupLocationId, dropoffLocationId, selectedVehicleObj?.asset_type, rateCategory, manualRateOverride, selectedQuotation]);

  // Financial calculations
  const totalAdditionalCharges = additionalCharges.reduce((acc, c) => acc + c.amount, 0);

  const baseBillingRate = quotationMatch && !manualRateOverride
    ? quotationMatch.rate
    : (parseFloat(billingAmountInput) || 0);

  const effectiveBillingAmount = baseBillingRate + totalAdditionalCharges;

  const effectiveDriverPayout = quotationMatch && !manualRateOverride
    ? quotationMatch.driverPayout
    : (parseFloat(driverPayoutInput) || 0);

  const effective3PLCost = parseFloat(thirdPartyCostInput) || 0;
  const financialCost = fleetType === 'THIRD_PARTY' ? effective3PLCost : effectiveDriverPayout;
  const netMargin = effectiveBillingAmount - financialCost;
  const marginPercent = effectiveBillingAmount > 0 ? (netMargin / effectiveBillingAmount) * 100 : 0;

  // Intermediate Stop Handlers
  const addOutboundStop = () => {
    setOutboundStops((prev) => [
      ...prev,
      { id: Date.now().toString(), name: '', lat: '', lng: '' },
    ]);
  };

  const removeOutboundStop = (id: string) => {
    setOutboundStops((prev) => prev.filter((s) => s.id !== id));
  };

  const updateOutboundStop = (id: string, field: keyof IntermediateStop, val: any) => {
    setOutboundStops((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: val } : s))
    );
  };

  // Additional Charges Handlers
  const addPresetCharge = (preset: { type: string; amount: number }) => {
    setAdditionalCharges((prev) => [
      ...prev,
      { id: Date.now().toString(), charge_type: preset.type, amount: preset.amount },
    ]);
  };

  const addCustomCharge = () => {
    const amt = parseFloat(customChargeAmount);
    if (!customChargeType.trim() || Number.isNaN(amt) || amt <= 0) {
      Alert.alert('Invalid Charge', 'Please enter a valid charge description and positive SAR amount.');
      return;
    }
    setAdditionalCharges((prev) => [
      ...prev,
      { id: Date.now().toString(), charge_type: customChargeType.trim(), amount: amt },
    ]);
    setCustomChargeType('');
    setCustomChargeAmount('');
  };

  const removeCharge = (id: string) => {
    setAdditionalCharges((prev) => prev.filter((c) => c.id !== id));
  };

  function parseDateTime(dateStr: string, timeStr: string): string | undefined {
    const dateMatch = dateStr.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!dateMatch) return undefined;
    const [, dd, mm, yyyy] = dateMatch;
    const timeMatch = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/) ?? ['', '0', '0'];
    const [, hh, min] = timeMatch;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min));
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }

  // Page 1 Validation: Customer, Route, Rate
  const validatePage1Fields = (): boolean => {
    const errors: Record<string, string> = { ...fieldErrors };
    let isValid = true;

    if (!customerId) { errors.customerId = 'Please select a customer'; isValid = false; } else { delete errors.customerId; }
    if (!pickupName.trim()) { errors.pickupName = 'Pickup location name is required'; isValid = false; } else { delete errors.pickupName; }
    if (Number.isNaN(parseFloat(pickupLat)) || Number.isNaN(parseFloat(pickupLng))) {
      errors.pickupCoords = 'Valid pickup coordinates (lat, lng) are required'; isValid = false;
    } else { delete errors.pickupCoords; }

    if (!dropoffName.trim()) { errors.dropoffName = 'Dropoff location name is required'; isValid = false; } else { delete errors.dropoffName; }
    if (Number.isNaN(parseFloat(dropoffLat)) || Number.isNaN(parseFloat(dropoffLng))) {
      errors.dropoffCoords = 'Valid dropoff coordinates (lat, lng) are required'; isValid = false;
    } else { delete errors.dropoffCoords; }

    if (effectiveBillingAmount <= 0) {
      errors.billingAmount = 'Enter a customer billing rate greater than 0'; isValid = false;
    } else { delete errors.billingAmount; }

    setFieldErrors(errors);
    return isValid;
  };

  // Page 2 Validation: Schedule, Fleet 3PL cost / Driver Payout
  const validatePage2Fields = (): boolean => {
    const errors: Record<string, string> = { ...fieldErrors };
    let isValid = true;

    if (fleetType === 'THIRD_PARTY') {
      if (Number.isNaN(effective3PLCost) || effective3PLCost < 0) {
        errors.thirdPartyCost = 'Agreed subcontractor cost is required'; isValid = false;
      } else { delete errors.thirdPartyCost; }
    } else {
      if (manualRateOverride && (Number.isNaN(effectiveDriverPayout) || effectiveDriverPayout < 0)) {
        errors.driverPayout = 'Driver payout is required'; isValid = false;
      } else { delete errors.driverPayout; }
    }

    const plannedPickup = parseDateTime(date, time);
    const plannedDropoff = parseDateTime(etaDate, etaTime);
    if (plannedPickup && plannedDropoff && plannedDropoff <= plannedPickup) {
      errors.deliveryDue = 'Delivery due date & time must be after the departure time'; isValid = false;
    } else { delete errors.deliveryDue; }

    setFieldErrors(errors);
    return isValid;
  };

  // Submit flow entry point from Page 2
  const handleInitiateSubmit = () => {
    const p1Valid = validatePage1Fields();
    const p2Valid = validatePage2Fields();
    if (!p1Valid) {
      setPage(1);
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    if (!p2Valid || submitting) return;

    const plannedPickup = parseDateTime(date, time);

    // Past date check
    if (plannedPickup && new Date(plannedPickup).getTime() < Date.now() - 5 * 60 * 1000) {
      setShowPastDateModal(true);
      return;
    }

    setShowReviewModal(true);
  };

  // Final Execution Submission
  const executeSubmit = async (isCompletedPastDate = false) => {
    setSubmitting(true);
    setShowReviewModal(false);
    setShowPastDateModal(false);

    try {
      if (manualRateOverride && saveAsPersistentQuotation && customerId) {
        try {
          await operatorService.createQuotation({
            customer_id: customerId,
            origin_name: pickupName,
            origin_location_id: pickupLocationId,
            destination_name: dropoffName,
            destination_location_id: dropoffLocationId,
            rate: baseBillingRate,
            driver_payout: effectiveDriverPayout,
            vehicle_type: selectedVehicleObj?.asset_type ?? 'Flatbed',
            rate_category: rateCategory,
            billing_type: 'EXTRA',
          });
        } catch {
          // non-blocking fallback
        }
      }

      const plannedPickup = parseDateTime(date, time);
      const plannedDropoff = parseDateTime(etaDate, etaTime);

      const pickupLatNum = parseFloat(pickupLat);
      const pickupLngNum = parseFloat(pickupLng);
      const dropoffLatNum = parseFloat(dropoffLat);
      const dropoffLngNum = parseFloat(dropoffLng);

      const stopsPayload: CreateTripStopInput[] = [
        {
          stop_type: 'Pickup',
          lat: pickupLatNum,
          lng: pickupLngNum,
          planned_arrival: plannedPickup,
          location_name: pickupName.trim() || undefined,
          location_id: pickupLocationId,
        },
      ];

      outboundStops.forEach((s) => {
        const lat = parseFloat(s.lat);
        const lng = parseFloat(s.lng);
        if (s.name.trim() && !Number.isNaN(lat) && !Number.isNaN(lng)) {
          stopsPayload.push({
            stop_type: 'Stop',
            lat, lng,
            location_name: s.name.trim(),
            location_id: s.locationId,
          });
        }
      });

      stopsPayload.push({
        stop_type: 'Dropoff',
        lat: dropoffLatNum,
        lng: dropoffLngNum,
        planned_arrival: plannedDropoff,
        location_name: dropoffName.trim() || undefined,
        location_id: dropoffLocationId,
      });

      if (rateCategory === 'ROUND_TRIP') {
        stopsPayload.push({
          stop_type: 'Dropoff',
          lat: pickupLatNum,
          lng: pickupLngNum,
          planned_arrival: plannedDropoff,
          location_name: `${pickupName.trim()} (Return Leg)`,
          location_id: pickupLocationId,
        });
      }

      const formattedCharges = additionalCharges.map((c) => ({
        charge_type: c.charge_type,
        rate: c.amount,
        quantity: 1,
        amount: c.amount,
      }));

      const created = await operatorService.createTrip({
        customer_id: customerId,
        driver_id: fleetType === 'OWN_FLEET' && selectedDriver && selectedDriver !== ASSIGN_LATER ? selectedDriver : undefined,
        vehicle_id: fleetType === 'OWN_FLEET' && selectedVehicle && selectedVehicle !== ASSIGN_LATER ? selectedVehicle : undefined,
        planned_start: plannedPickup,
        planned_end: plannedDropoff,
        billing_amount: effectiveBillingAmount,
        trip_charges: fleetType === 'OWN_FLEET' ? effectiveDriverPayout : undefined,
        rate_card_id: quotationMatch && !manualRateOverride ? quotationMatch.quotationId : undefined,
        vehicle_type: selectedVehicleObj?.asset_type ?? selectedQuotation?.vehicle_type ?? selectedQuotation?.vehicle_class ?? undefined,
        rate_category: rateCategory,
        billing_type: selectedQuotation?.billing_type ?? 'EXTRA',

        is_third_party: fleetType === 'THIRD_PARTY',
        third_party_provider_id: fleetType === 'THIRD_PARTY' && selected3PLProvider ? selected3PLProvider : undefined,
        third_party_driver_name: fleetType === 'THIRD_PARTY' ? thirdPartyDriverName : undefined,
        third_party_driver_phone: fleetType === 'THIRD_PARTY' ? thirdPartyDriverPhone : undefined,
        third_party_vehicle_plate: fleetType === 'THIRD_PARTY' ? thirdPartyVehiclePlate : undefined,
        third_party_cost: fleetType === 'THIRD_PARTY' ? effective3PLCost : undefined,
        charges: formattedCharges,
        stops: stopsPayload,
      });

      if (isCompletedPastDate && created?.id) {
        try {
          await operatorService.updateTripStatus(created.id, 'Completed');
        } catch {
          // silent fallback
        }
      }

      await discardDraft();
      invalidateOperatorTrips();
      router.back();
    } catch (e) {
      Alert.alert('Could not create trip', getApiErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCustomerObj = customers.find((c) => c.id === customerId);
  const selectedDriverObj = drivers.find((d) => d.id === selectedDriver);
  const selected3PLProviderObj = thirdPartyProviders.find((p) => p.id === selected3PLProvider);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.gray100 }}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} activeOpacity={0.8} onPress={() => router.back()}>
          <ArrowLeft size={22} color={Colors.gray900} strokeWidth={2.2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create New Trip</Text>
        <View style={styles.placeholder} />
      </View>

      {/* 2-Page Stepper Indicator Bar */}
      <View style={styles.stepperContainer}>
        <TouchableOpacity
          style={[styles.stepperTab, page === 1 && styles.stepperTabActive]}
          activeOpacity={0.8}
          onPress={() => setPage(1)}
        >
          <View style={[styles.stepperDot, page === 1 && styles.stepperDotActive]}>
            <Text style={[styles.stepperDotText, page === 1 && styles.stepperDotTextActive]}>1</Text>
          </View>
          <Text style={[styles.stepperTabText, page === 1 && styles.stepperTabTextActive]}>Trip & Rate</Text>
        </TouchableOpacity>

        <View style={styles.stepperLine} />

        <TouchableOpacity
          style={[styles.stepperTab, page === 2 && styles.stepperTabActive]}
          activeOpacity={0.8}
          onPress={() => {
            if (validatePage1Fields()) {
              setPage(2);
              scrollViewRef.current?.scrollTo({ y: 0, animated: true });
            }
          }}
        >
          <View style={[styles.stepperDot, page === 2 && styles.stepperDotActive]}>
            <Text style={[styles.stepperDotText, page === 2 && styles.stepperDotTextActive]}>2</Text>
          </View>
          <Text style={[styles.stepperTabText, page === 2 && styles.stepperTabTextActive]}>Schedule & Fleet</Text>
        </TouchableOpacity>
      </View>

      {/* Restore Draft Banner */}
      {hasSavedDraft && (
        <View style={styles.draftBanner}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <RotateCcw size={16} color={Colors.primary} />
            <Text style={styles.draftBannerText}>Unsaved draft found from earlier session.</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={styles.draftRestoreBtn} onPress={restoreDraft}>
              <Text style={styles.draftRestoreText}>Restore</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.draftDiscardBtn} onPress={discardDraft}>
              <Text style={styles.draftDiscardText}>Discard</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {loadingOptions ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: Spacing['3xl'] }} />
      ) : (
        <ScrollView ref={scrollViewRef} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {optionsError ? <Text style={styles.errorText}>{optionsError}</Text> : null}

          {/* PAGE 1: Trip Scope, Quotation, Route & Rate Financials */}
          {page === 1 && (
            <>
              {/* Section 1: Customer Selection */}
              <Text style={styles.sectionTitle}>1. Customer</Text>
              <Card style={styles.pickerCard}>
                {customers.length === 0 ? (
                  <Text style={styles.emptyHint}>No customers found</Text>
                ) : (
                  customers.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.pickerItem, customerId === c.id ? styles.pickerItemActive : null]}
                      activeOpacity={0.8}
                      onPress={() => handleSelectCustomer(c.id)}
                    >
                      <Text style={[styles.pickerItemText, customerId === c.id ? styles.pickerItemTextActive : null]}>
                        {c.name}
                      </Text>
                      {customerId === c.id && <Check size={18} color={Colors.primary} strokeWidth={3} />}
                    </TouchableOpacity>
                  ))
                )}
              </Card>
              {fieldErrors.customerId && <Text style={styles.fieldErrorBadge}>{fieldErrors.customerId}</Text>}

              {/* Recent Routes Accelerator Chips */}
              {customerId && recentRoutes.length > 0 && (
                <View style={{ marginTop: Spacing.xs }}>
                  <Text style={styles.acceleratorTitle}>Recent Lanes for {selectedCustomerObj?.name}:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                    {recentRoutes.map((r, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={styles.acceleratorChip}
                        activeOpacity={0.8}
                        onPress={() => handleSelectQuotation(r.quotation)}
                      >
                        <Zap size={12} color={Colors.primary} />
                        <Text style={styles.acceleratorChipText}>{r.origin} → {r.dest}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Section 2: Quotation Picker */}
              {customerId ? (
                <>
                  <Text style={styles.sectionTitle}>2. Active Quotations</Text>
                  <Card style={styles.pickerCard}>
                    {loadingQuotations ? (
                      <ActivityIndicator color={Colors.primary} style={{ padding: Spacing.lg }} />
                    ) : quotations.length === 0 ? (
                      <Text style={styles.emptyHint}>No quotations on file for this customer — enter the route and rate manually below.</Text>
                    ) : (
                      quotations.map((q) => {
                        const isSelected = selectedQuotation?.id === q.id;
                        const origin = q.originLocation?.name ?? q.origin_name ?? '—';
                        const dest = q.destinationLocation?.name ?? q.destination_name ?? '—';
                        return (
                          <TouchableOpacity
                            key={q.id}
                            style={[styles.quotationItem, isSelected ? styles.pickerItemActive : null]}
                            activeOpacity={0.8}
                            onPress={() => handleSelectQuotation(q)}
                          >
                            <View style={[styles.driverAvatar, styles.vehicleAvatarBg]}>
                              <FileText size={18} color={Colors.gray600} strokeWidth={2} />
                            </View>
                            <View style={styles.driverInfo}>
                              <Text style={[styles.pickerItemText, isSelected ? styles.pickerItemTextActive : null]} numberOfLines={1}>
                                {origin} → {dest}
                              </Text>
                              <Text style={styles.driverId}>
                                {(q.vehicle_type ?? q.vehicle_class ?? 'Any vehicle')} · SAR {Number(q.rate ?? 0).toLocaleString()}
                              </Text>
                            </View>
                            {isSelected && <Check size={18} color={Colors.primary} strokeWidth={3} />}
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </Card>
                </>
              ) : null}

              {/* Progressive Form Collapse Summary Pill */}
              {isRouteCollapsed && pickupName && dropoffName ? (
                <Card style={styles.appliedSummaryCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.appliedSummaryLane}>{pickupName} → {dropoffName}</Text>
                    <Text style={styles.appliedSummaryDetails}>
                      {rateCategory === 'ROUND_TRIP' ? 'Round Trip' : 'Single Trip'} · Total Billing: SAR {effectiveBillingAmount.toLocaleString()}
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.editRouteBtn} onPress={() => setIsRouteCollapsed(false)}>
                    <Edit3 size={14} color={Colors.primary} />
                    <Text style={styles.editRouteBtnText}>Edit</Text>
                  </TouchableOpacity>
                </Card>
              ) : (
                <>
                  {/* Section 3: Route & Multi-Stop Configuration */}
                  <Text style={styles.sectionTitle}>3. Route & Multi-Stop Configuration</Text>
                  <Card style={styles.formCard}>
                    <View style={styles.segmentedContainer}>
                      <TouchableOpacity
                        style={[styles.segmentedBtn, rateCategory === 'SINGLE_TRIP' && styles.segmentedBtnActive]}
                        onPress={() => setRateCategory('SINGLE_TRIP')}
                      >
                        <Text style={[styles.segmentedText, rateCategory === 'SINGLE_TRIP' && styles.segmentedTextActive]}>Single Trip</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.segmentedBtn, rateCategory === 'ROUND_TRIP' && styles.segmentedBtnActive]}
                        onPress={() => setRateCategory('ROUND_TRIP')}
                      >
                        <Text style={[styles.segmentedText, rateCategory === 'ROUND_TRIP' && styles.segmentedTextActive]}>Round Trip</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.formGroup}>
                      <Input
                        label="Pickup Location name *"
                        value={pickupName}
                        state={fieldErrors.pickupName ? 'error' : 'default'}
                        errorText={fieldErrors.pickupName}
                        onChangeText={(t) => {
                          setPickupName(t); setPickupLocationId(undefined); setShowPickupResults(true);
                          if (selectedQuotation) { setSelectedQuotation(null); setQuotationMatch(null); }
                        }}
                        placeholder="Search a saved location, or type a name"
                        maxLength={120}
                      />
                      {pickupLocationId ? (
                        <View style={styles.savedLocationChip}>
                          <MapPin size={11} color={Colors.primary} strokeWidth={2.4} />
                          <Text style={styles.savedLocationChipText}>Saved location — coordinates auto-filled</Text>
                        </View>
                      ) : (
                        showPickupResults && pickupResults.length > 0 && (
                          <View style={styles.searchResults}>
                            {pickupResults.map((loc) => (
                              <TouchableOpacity
                                key={loc.id}
                                style={styles.searchResultRow}
                                activeOpacity={0.8}
                                onPress={() => {
                                  setPickupLocationId(loc.id); setPickupName(loc.name);
                                  if (loc.lat != null) setPickupLat(String(loc.lat));
                                  if (loc.lng != null) setPickupLng(String(loc.lng));
                                  setShowPickupResults(false);
                                }}
                              >
                                <MapPin size={13} color={Colors.gray500} strokeWidth={2} />
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.searchResultName}>{loc.name}</Text>
                                  {loc.address ? <Text style={styles.searchResultAddress} numberOfLines={1}>{loc.address}</Text> : null}
                                </View>
                              </TouchableOpacity>
                            ))}
                          </View>
                        )
                      )}
                      <Text style={styles.label}>Pickup Coordinates (lat, lng)</Text>
                      <View style={styles.rowFields}>
                        <Input style={{ flex: 1 }} value={pickupLat} onChangeText={setPickupLat} placeholder="Latitude" keyboardType="numeric" state={pickupLocationId ? 'disabled' : fieldErrors.pickupCoords ? 'error' : 'default'} />
                        <Input style={{ flex: 1 }} value={pickupLng} onChangeText={setPickupLng} placeholder="Longitude" keyboardType="numeric" state={pickupLocationId ? 'disabled' : fieldErrors.pickupCoords ? 'error' : 'default'} />
                      </View>
                      {fieldErrors.pickupCoords && <Text style={styles.fieldErrorBadge}>{fieldErrors.pickupCoords}</Text>}
                    </View>

                    {outboundStops.map((stop, idx) => (
                      <View key={stop.id} style={[styles.formGroup, styles.intermediateStopCard]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={styles.stopLabel}>Intermediate Stop #{idx + 1}</Text>
                          <TouchableOpacity onPress={() => removeOutboundStop(stop.id)}>
                            <Trash2 size={16} color={Colors.error} />
                          </TouchableOpacity>
                        </View>
                        <Input
                          label="Stop Location Name"
                          value={stop.name}
                          onChangeText={(t) => updateOutboundStop(stop.id, 'name', t)}
                          placeholder="Location name (e.g. Al Hasa Yard)"
                        />
                        <View style={styles.rowFields}>
                          <Input style={{ flex: 1 }} value={stop.lat} onChangeText={(t) => updateOutboundStop(stop.id, 'lat', t)} placeholder="Latitude" keyboardType="numeric" />
                          <Input style={{ flex: 1 }} value={stop.lng} onChangeText={(t) => updateOutboundStop(stop.id, 'lng', t)} placeholder="Longitude" keyboardType="numeric" />
                        </View>
                      </View>
                    ))}

                    <TouchableOpacity style={styles.addStopBtn} onPress={addOutboundStop}>
                      <Plus size={16} color={Colors.primary} />
                      <Text style={styles.addStopBtnText}>Add Intermediate Stop</Text>
                    </TouchableOpacity>

                    <View style={styles.formDivider} />

                    <View style={styles.formGroup}>
                      <Input
                        label="Dropoff Location name *"
                        value={dropoffName}
                        state={fieldErrors.dropoffName ? 'error' : 'default'}
                        errorText={fieldErrors.dropoffName}
                        onChangeText={(t) => {
                          setDropoffName(t); setDropoffLocationId(undefined); setShowDropoffResults(true);
                          if (selectedQuotation) { setSelectedQuotation(null); setQuotationMatch(null); }
                        }}
                        placeholder="Search a saved location, or type a name"
                        maxLength={120}
                      />
                      {dropoffLocationId ? (
                        <View style={styles.savedLocationChip}>
                          <MapPin size={11} color={Colors.primary} strokeWidth={2.4} />
                          <Text style={styles.savedLocationChipText}>Saved location — coordinates auto-filled</Text>
                        </View>
                      ) : (
                        showDropoffResults && dropoffResults.length > 0 && (
                          <View style={styles.searchResults}>
                            {dropoffResults.map((loc) => (
                              <TouchableOpacity
                                key={loc.id}
                                style={styles.searchResultRow}
                                activeOpacity={0.8}
                                onPress={() => {
                                  setDropoffLocationId(loc.id); setDropoffName(loc.name);
                                  if (loc.lat != null) setDropoffLat(String(loc.lat));
                                  if (loc.lng != null) setDropoffLng(String(loc.lng));
                                  setShowDropoffResults(false);
                                }}
                              >
                                <MapPin size={13} color={Colors.gray500} strokeWidth={2} />
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.searchResultName}>{loc.name}</Text>
                                  {loc.address ? <Text style={styles.searchResultAddress} numberOfLines={1}>{loc.address}</Text> : null}
                                </View>
                              </TouchableOpacity>
                            ))}
                          </View>
                        )
                      )}
                      <Text style={styles.label}>Dropoff Coordinates (lat, lng)</Text>
                      <View style={styles.rowFields}>
                        <Input style={{ flex: 1 }} value={dropoffLat} onChangeText={setDropoffLat} placeholder="Latitude" keyboardType="numeric" state={dropoffLocationId ? 'disabled' : fieldErrors.dropoffCoords ? 'error' : 'default'} />
                        <Input style={{ flex: 1 }} value={dropoffLng} onChangeText={setDropoffLng} placeholder="Longitude" keyboardType="numeric" state={dropoffLocationId ? 'disabled' : fieldErrors.dropoffCoords ? 'error' : 'default'} />
                      </View>
                      {fieldErrors.dropoffCoords && <Text style={styles.fieldErrorBadge}>{fieldErrors.dropoffCoords}</Text>}
                    </View>
                  </Card>

                  {/* Section 4: Rate & Financials */}
                  <Text style={styles.sectionTitle}>4. Rate & Financials</Text>
                  <Card style={styles.formCard}>
                    {lookingUpRate ? (
                      <ActivityIndicator color={Colors.primary} />
                    ) : quotationMatch && !manualRateOverride ? (
                      <View>
                        <View style={styles.rateMatchedRow}>
                          <Text style={styles.label}>Customer Billing Rate</Text>
                          <Text style={styles.rateValue}>SAR {quotationMatch.rate.toLocaleString()}</Text>
                        </View>
                        <View style={styles.rateMatchedRow}>
                          <Text style={styles.label}>Driver Payout</Text>
                          <Text style={styles.rateValue}>SAR {quotationMatch.driverPayout.toLocaleString()}</Text>
                        </View>
                        <Text style={styles.rateSourceHint}>
                          {selectedQuotation ? 'From the selected quotation.' : 'Matched an existing quotation for this customer & route.'}
                        </Text>
                        <TouchableOpacity onPress={() => setManualRateOverride(true)}>
                          <Text style={styles.rateOverrideLink}>Use custom rate entry</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View>
                        {quotationMatch === null && !lookingUpRate && customerId ? (
                          <Text style={styles.rateSourceHint}>No matching quotation found — enter rates manually below.</Text>
                        ) : null}
                        <Input
                          label="Customer Base Billing Rate (SAR) *"
                          value={billingAmountInput}
                          state={fieldErrors.billingAmount ? 'error' : 'default'}
                          errorText={fieldErrors.billingAmount}
                          onChangeText={setBillingAmountInput}
                          placeholder="0.00"
                          keyboardType="numeric"
                        />
                        {fleetType === 'OWN_FLEET' && (
                          <Input
                            label="Driver Payout (SAR) *"
                            value={driverPayoutInput}
                            state={fieldErrors.driverPayout ? 'error' : 'default'}
                            errorText={fieldErrors.driverPayout}
                            onChangeText={setDriverPayoutInput}
                            placeholder="0.00"
                            keyboardType="numeric"
                          />
                        )}
                        {quotationMatch && (
                          <TouchableOpacity onPress={() => setManualRateOverride(false)}>
                            <Text style={styles.rateOverrideLink}>Use matched quotation rate instead</Text>
                          </TouchableOpacity>
                        )}

                        <View style={styles.toggleRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.toggleLabel}>Save as Reusable Quotation</Text>
                            <Text style={styles.toggleSublabel}>Store rate for future trips on this customer & lane</Text>
                          </View>
                          <Switch
                            value={saveAsPersistentQuotation}
                            onValueChange={setSaveAsPersistentQuotation}
                            trackColor={{ false: Colors.gray200, true: Colors.primary }}
                          />
                        </View>
                      </View>
                    )}

                    <View style={styles.formDivider} />
                    <Text style={styles.label}>Itemized Additional Charges (Surcharges)</Text>

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 6 }}>
                      {CHARGE_PRESETS.map((preset, idx) => (
                        <TouchableOpacity
                          key={idx}
                          style={styles.presetChip}
                          onPress={() => addPresetCharge(preset)}
                        >
                          <Plus size={11} color={Colors.gray700} />
                          <Text style={styles.presetChipText}>{preset.type} (+{preset.amount})</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {additionalCharges.map((c) => (
                      <View key={c.id} style={styles.chargeRow}>
                        <Text style={styles.chargeType}>{c.charge_type}</Text>
                        <Text style={styles.chargeAmount}>+SAR {c.amount.toLocaleString()}</Text>
                        <TouchableOpacity onPress={() => removeCharge(c.id)}>
                          <Trash2 size={14} color={Colors.error} />
                        </TouchableOpacity>
                      </View>
                    ))}

                    <View style={[styles.rowFields, { marginTop: 6 }]}>
                      <Input style={{ flex: 2 }} placeholder="Custom charge name" value={customChargeType} onChangeText={setCustomChargeType} />
                      <Input style={{ flex: 1 }} placeholder="SAR" value={customChargeAmount} onChangeText={setCustomChargeAmount} keyboardType="numeric" />
                      <TouchableOpacity style={styles.addChargeBtn} onPress={addCustomCharge}>
                        <Plus size={18} color={Colors.white} />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.financialSummaryCard}>
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Base Billing Rate:</Text>
                        <Text style={styles.summaryValue}>SAR {baseBillingRate.toLocaleString()}</Text>
                      </View>
                      {totalAdditionalCharges > 0 && (
                        <View style={styles.summaryRow}>
                          <Text style={styles.summaryLabel}>Additional Surcharges:</Text>
                          <Text style={styles.summaryValue}>+SAR {totalAdditionalCharges.toLocaleString()}</Text>
                        </View>
                      )}
                      <View style={[styles.summaryRow, { borderTopWidth: 1, borderTopColor: Colors.gray200, paddingTop: 6 }]}>
                        <Text style={styles.totalSummaryLabel}>Total Customer Billing:</Text>
                        <Text style={styles.totalSummaryValue}>SAR {effectiveBillingAmount.toLocaleString()}</Text>
                      </View>
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>{fleetType === 'THIRD_PARTY' ? 'Subcontractor Cost:' : 'Driver Payout:'}</Text>
                        <Text style={styles.summaryValue}>SAR {financialCost.toLocaleString()}</Text>
                      </View>
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Expected Gross Margin:</Text>
                        <Text style={[styles.summaryValue, { color: netMargin >= 0 ? Colors.success : Colors.error }]}>
                          SAR {netMargin.toLocaleString()} ({marginPercent.toFixed(1)}%)
                        </Text>
                      </View>
                    </View>
                  </Card>
                </>
              )}

              {/* Page 1 Bottom Action Button */}
              <View style={{ marginTop: Spacing.md }}>
                <Button
                  title="Continue to Schedule & Fleet →"
                  onPress={() => {
                    if (validatePage1Fields()) {
                      setPage(2);
                      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
                    }
                  }}
                />
              </View>
            </>
          )}

          {/* PAGE 2: Schedule & Fleet Execution Assignment */}
          {page === 2 && (
            <>
              {/* Section 5: Schedule (Touch Date/Time Presets & Auto-ETA) */}
              <Text style={styles.sectionTitle}>5. Departure & Auto-ETA Schedule</Text>
              <Card style={styles.formCard}>
                <Text style={styles.label}>Departure Schedule</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginVertical: 4 }}>
                  <TouchableOpacity
                    style={styles.touchPresetChip}
                    onPress={() => {
                      const todayStr = formatDateDDMMYYYY(new Date());
                      setDate(todayStr);
                      calculateAutoEta(todayStr, time);
                    }}
                  >
                    <Text style={styles.touchPresetText}>Today</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.touchPresetChip}
                    onPress={() => {
                      const tom = new Date(Date.now() + 24 * 60 * 60 * 1000);
                      const tomStr = formatDateDDMMYYYY(tom);
                      setDate(tomStr);
                      calculateAutoEta(tomStr, time);
                    }}
                  >
                    <Text style={styles.touchPresetText}>Tomorrow</Text>
                  </TouchableOpacity>
                </View>

                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                  {['08:00', '12:00', '16:00', '20:00'].map((tVal) => (
                    <TouchableOpacity
                      key={tVal}
                      style={[styles.touchPresetChip, time === tVal && styles.touchPresetChipActive]}
                      onPress={() => {
                        setTime(tVal);
                        calculateAutoEta(date, tVal);
                      }}
                    >
                      <Text style={[styles.touchPresetText, time === tVal && styles.touchPresetTextActive]}>{tVal}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.rowFields}>
                  <Input style={{ flex: 1 }} label="Date" value={date} onChangeText={(t) => { setDate(t); calculateAutoEta(t, time); }} placeholder="DD/MM/YYYY" keyboardType="numeric" />
                  <Input style={{ flex: 1 }} label="Time" value={time} onChangeText={(t) => { setTime(t); calculateAutoEta(date, t); }} placeholder="HH:MM" keyboardType="numeric" />
                </View>

                <View style={styles.formDivider} />

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={styles.label}>Delivery Due Date & Time</Text>
                  {isAutoEta && (
                    <View style={styles.autoEtaChip}>
                      <Zap size={10} color={Colors.primary} />
                      <Text style={styles.autoEtaChipText}>Auto-computed ETA (+4 hrs)</Text>
                    </View>
                  )}
                </View>
                <View style={styles.rowFields}>
                  <Input style={{ flex: 1 }} value={etaDate} onChangeText={(t) => { setEtaDate(t); setIsAutoEta(false); }} placeholder="DD/MM/YYYY" keyboardType="numeric" />
                  <Input style={{ flex: 1 }} value={etaTime} onChangeText={(t) => { setEtaTime(t); setIsAutoEta(false); }} placeholder="HH:MM" keyboardType="numeric" />
                </View>
                {fieldErrors.deliveryDue && <Text style={styles.fieldErrorBadge}>{fieldErrors.deliveryDue}</Text>}
              </Card>

              {/* Section 6: Fleet Assignment (Own Fleet vs 3PL) */}
              <Text style={styles.sectionTitle}>6. Fleet & Execution Assignment</Text>
              <Card style={styles.formCard}>
                <View style={styles.segmentedContainer}>
                  <TouchableOpacity
                    style={[styles.segmentedBtn, fleetType === 'OWN_FLEET' && styles.segmentedBtnActive]}
                    onPress={() => setFleetType('OWN_FLEET')}
                  >
                    <Text style={[styles.segmentedText, fleetType === 'OWN_FLEET' && styles.segmentedTextActive]}>Own Fleet</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.segmentedBtn, fleetType === 'THIRD_PARTY' && styles.segmentedBtnActive]}
                    onPress={() => setFleetType('THIRD_PARTY')}
                  >
                    <Text style={[styles.segmentedText, fleetType === 'THIRD_PARTY' && styles.segmentedTextActive]}>3PL Subcontractor</Text>
                  </TouchableOpacity>
                </View>

                {fleetType === 'OWN_FLEET' ? (
                  <>
                    <Text style={styles.label}>Driver Assignment</Text>
                    <Card style={styles.pickerCard}>
                      <TouchableOpacity
                        style={[styles.driverItem, selectedDriver === ASSIGN_LATER ? styles.driverItemActive : null]}
                        onPress={() => setSelectedDriver(ASSIGN_LATER)}
                      >
                        <View style={[styles.driverAvatar, styles.vehicleAvatarBg]}>
                          <Clock size={20} color={Colors.gray600} strokeWidth={2} />
                        </View>
                        <View style={styles.driverInfo}>
                          <Text style={styles.driverName}>Assign Later</Text>
                          <Text style={styles.driverId}>Dispatch driver later</Text>
                        </View>
                        {selectedDriver === ASSIGN_LATER && <Check size={18} color={Colors.primary} strokeWidth={3} />}
                      </TouchableOpacity>
                      {drivers.map((driver) => (
                        <TouchableOpacity
                          key={driver.id}
                          style={[styles.driverItem, selectedDriver === driver.id ? styles.driverItemActive : null]}
                          onPress={() => setSelectedDriver(driver.id)}
                        >
                          <View style={styles.driverAvatar}>
                            <Text style={styles.driverAvatarText}>{driver.first_name[0]}{driver.last_name[0]}</Text>
                          </View>
                          <View style={styles.driverInfo}>
                            <Text style={styles.driverName}>{driver.first_name} {driver.last_name}</Text>
                            <Text style={styles.driverId}>{driver.ref_id ?? driver.license_number}</Text>
                          </View>
                          <StatusBadge status="Available" />
                        </TouchableOpacity>
                      ))}
                    </Card>

                    <Text style={styles.label}>Vehicle Assignment</Text>
                    <Card style={styles.pickerCard}>
                      <TouchableOpacity
                        style={[styles.driverItem, selectedVehicle === ASSIGN_LATER ? styles.driverItemActive : null]}
                        onPress={() => setSelectedVehicle(ASSIGN_LATER)}
                      >
                        <View style={[styles.driverAvatar, styles.vehicleAvatarBg]}>
                          <Clock size={20} color={Colors.gray600} strokeWidth={2} />
                        </View>
                        <View style={styles.driverInfo}>
                          <Text style={styles.driverName}>Assign Later</Text>
                          <Text style={styles.driverId}>Assign vehicle later</Text>
                        </View>
                        {selectedVehicle === ASSIGN_LATER && <Check size={18} color={Colors.primary} strokeWidth={3} />}
                      </TouchableOpacity>
                      {vehicles.map((v) => (
                        <TouchableOpacity
                          key={v.id}
                          style={[styles.driverItem, selectedVehicle === v.id ? styles.driverItemActive : null]}
                          onPress={() => setSelectedVehicle(v.id)}
                        >
                          <View style={[styles.driverAvatar, styles.vehicleAvatarBg]}>
                            <Truck size={22} color={Colors.primary} strokeWidth={2} />
                          </View>
                          <View style={styles.driverInfo}>
                            <Text style={styles.driverName}>{v.plate_number}</Text>
                            <Text style={styles.driverId}>{v.asset_type}</Text>
                          </View>
                          <StatusBadge status="Available" />
                        </TouchableOpacity>
                      ))}
                    </Card>
                  </>
                ) : (
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>3PL Provider Selection</Text>
                    <Card style={styles.pickerCard}>
                      {thirdPartyProviders.map((p) => (
                        <TouchableOpacity
                          key={p.id}
                          style={[styles.pickerItem, selected3PLProvider === p.id && styles.pickerItemActive]}
                          onPress={() => setSelected3PLProvider(p.id)}
                        >
                          <Building2 size={18} color={Colors.gray600} />
                          <Text style={styles.pickerItemText}>{p.name}</Text>
                          {selected3PLProvider === p.id && <Check size={18} color={Colors.primary} strokeWidth={3} />}
                        </TouchableOpacity>
                      ))}
                    </Card>
                    <Input label="Subcontractor Driver Name" value={thirdPartyDriverName} onChangeText={setThirdPartyDriverName} placeholder="Driver full name" />
                    <Input label="Subcontractor Driver Phone" value={thirdPartyDriverPhone} onChangeText={setThirdPartyDriverPhone} placeholder="+966 5X XXX XXXX" keyboardType="phone-pad" />
                    <Input label="Subcontractor Truck Plate" value={thirdPartyVehiclePlate} onChangeText={setThirdPartyVehiclePlate} placeholder="Plate (e.g. 1234 ABC)" />
                    <Input
                      label="Subcontractor Agreed Cost (SAR) *"
                      value={thirdPartyCostInput}
                      state={fieldErrors.thirdPartyCost ? 'error' : 'default'}
                      errorText={fieldErrors.thirdPartyCost}
                      onChangeText={setThirdPartyCostInput}
                      placeholder="0.00"
                      keyboardType="numeric"
                    />
                  </View>
                )}
              </Card>

              {/* Page 2 Bottom Action Bar: Back & Review/Submit */}
              <View style={styles.page2NavRow}>
                <TouchableOpacity
                  style={styles.backStepBtn}
                  onPress={() => {
                    setPage(1);
                    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
                  }}
                >
                  <Text style={styles.backStepBtnText}>← Back</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Button
                    title={submitting ? 'Creating…' : 'Review & Create Trip'}
                    onPress={handleInitiateSubmit}
                    disabled={submitting}
                    loading={submitting}
                  />
                </View>
              </View>
            </>
          )}
        </ScrollView>
      )}

      {/* Modal 1: Past Date Warning Interception */}
      <Modal visible={showPastDateModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Card style={styles.modalContent}>
            <AlertTriangle size={32} color={Colors.warning} style={{ alignSelf: 'center', marginBottom: 8 }} />
            <Text style={styles.modalTitle}>Past Departure Date Detected</Text>
            <Text style={styles.modalBody}>
              The departure date for this trip is in the past. Would you like to record this as a Completed historical trip or keep it as Scheduled?
            </Text>
            <View style={{ gap: 8, marginTop: 16 }}>
              <Button title="Create as Completed (Historical)" onPress={() => executeSubmit(true)} />
              <Button title="Create as Scheduled" variant="outline" onPress={() => executeSubmit(false)} />
              <Button title="Cancel & Edit Date" variant="ghost" onPress={() => setShowPastDateModal(false)} />
            </View>
          </Card>
        </View>
      </Modal>

      {/* Modal 2: Review & Confirm Summary */}
      <Modal visible={showReviewModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <Card style={{ ...styles.modalContent, maxHeight: '85%' }}>
            <Text style={styles.modalTitle}>Review Trip Summary</Text>
            <ScrollView style={{ marginVertical: 12 }}>
              <View style={styles.reviewSection}>
                <Text style={styles.reviewHeading}>Customer & Scope</Text>
                <Text style={styles.reviewText}>{selectedCustomerObj?.name ?? '—'}</Text>
                <Text style={styles.reviewSubtext}>Rate Category: {rateCategory === 'ROUND_TRIP' ? 'Round Trip (Return Leg)' : 'Single Trip'}</Text>
              </View>

              <View style={styles.reviewSection}>
                <Text style={styles.reviewHeading}>Route Breakdown</Text>
                <Text style={styles.reviewText}>Pickup: {pickupName}</Text>
                {outboundStops.map((s, idx) => (
                  <Text key={s.id} style={styles.reviewSubtext}>Stop #{idx + 1}: {s.name}</Text>
                ))}
                <Text style={styles.reviewText}>Dropoff: {dropoffName}</Text>
              </View>

              <View style={styles.reviewSection}>
                <Text style={styles.reviewHeading}>Execution & Fleet</Text>
                {fleetType === 'THIRD_PARTY' ? (
                  <>
                    <Text style={styles.reviewText}>3PL Provider: {selected3PLProviderObj?.name ?? 'Third-Party'}</Text>
                    <Text style={styles.reviewSubtext}>Driver: {thirdPartyDriverName || 'Unassigned'} ({thirdPartyDriverPhone || 'No phone'})</Text>
                    <Text style={styles.reviewSubtext}>Plate: {thirdPartyVehiclePlate || 'Unassigned'}</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.reviewText}>Driver: {selectedDriverObj ? `${selectedDriverObj.first_name} ${selectedDriverObj.last_name}` : 'Assign Later'}</Text>
                    <Text style={styles.reviewSubtext}>Truck: {selectedVehicleObj?.plate_number ?? 'Assign Later'}</Text>
                  </>
                )}
              </View>

              <View style={styles.reviewSection}>
                <Text style={styles.reviewHeading}>Financial Breakdown</Text>
                <Text style={styles.reviewSubtext}>Base Rate: SAR {baseBillingRate.toLocaleString()}</Text>
                <Text style={styles.reviewSubtext}>Surcharges: SAR {totalAdditionalCharges.toLocaleString()}</Text>
                <Text style={styles.reviewText}>Total Billing: SAR {effectiveBillingAmount.toLocaleString()}</Text>
                <Text style={styles.reviewSubtext}>{fleetType === 'THIRD_PARTY' ? '3PL Cost:' : 'Driver Payout:'} SAR {financialCost.toLocaleString()}</Text>
                <Text style={[styles.reviewText, { color: netMargin >= 0 ? Colors.success : Colors.error }]}>
                  Margin: SAR {netMargin.toLocaleString()} ({marginPercent.toFixed(1)}%)
                </Text>
              </View>
            </ScrollView>

            <View style={{ gap: 8 }}>
              <Button title="Confirm & Dispatch Trip" onPress={() => executeSubmit(false)} loading={submitting} />
              <Button title="Back to Edit" variant="outline" onPress={() => setShowReviewModal(false)} />
            </View>
          </Card>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  header: {
    backgroundColor: Colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: Radius.full,
    backgroundColor: Colors.gray100, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: Typography.lg, fontWeight: '700', color: Colors.gray900 },
  placeholder: { width: 40 },

  stepperContainer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.white, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.gray200,
  },
  stepperTab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  stepperTabActive: {},
  stepperDot: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.gray200,
    alignItems: 'center', justifyContent: 'center',
  },
  stepperDotActive: { backgroundColor: Colors.primary },
  stepperDotText: { fontSize: 11, fontWeight: '700', color: Colors.gray600 },
  stepperDotTextActive: { color: Colors.white },
  stepperTabText: { fontSize: Typography.xs, fontWeight: '600', color: Colors.gray500 },
  stepperTabTextActive: { fontWeight: '700', color: Colors.gray900 },
  stepperLine: { flex: 1, height: 1, backgroundColor: Colors.gray200, marginHorizontal: Spacing.md },

  scroll: { padding: Spacing.lg, paddingBottom: Spacing['3xl'], gap: Spacing.sm },
  errorText: { fontSize: Typography.sm, color: Colors.error, marginBottom: Spacing.sm },
  fieldErrorBadge: { fontSize: 11, color: Colors.error, fontWeight: '600', marginTop: 2, marginLeft: 2 },
  sectionTitle: {
    fontSize: Typography.sm, fontWeight: '700', color: Colors.gray500,
    textTransform: 'uppercase', letterSpacing: 1, marginTop: Spacing.md, marginBottom: Spacing.xs,
  },
  pickerCard: { borderRadius: Radius.xl },
  emptyHint: { padding: Spacing.lg, fontSize: Typography.sm, color: Colors.gray500 },
  pickerItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.gray100,
  },
  pickerItemActive: { backgroundColor: Colors.primaryLight },
  pickerItemText: { fontSize: Typography.sm, color: Colors.gray700, fontWeight: '500' },
  pickerItemTextActive: { color: Colors.primary, fontWeight: '700' },
  formCard: { borderRadius: Radius.xl, padding: Spacing.lg, gap: 8 },
  formGroup: { gap: Spacing.xs },
  label: { fontSize: Typography.xs, color: Colors.gray500, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  formDivider: { height: 1, backgroundColor: Colors.gray200, marginVertical: Spacing.xs },
  rowFields: { flexDirection: 'row', gap: Spacing.md },
  driverItem: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md, gap: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.gray100,
  },
  driverItemActive: { backgroundColor: Colors.primaryLight },
  quotationItem: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md, gap: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.gray100,
  },
  driverAvatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  driverAvatarText: { fontSize: Typography.sm, fontWeight: '700', color: Colors.white },
  vehicleAvatarBg: { backgroundColor: Colors.gray200 },
  driverInfo: { flex: 1 },
  driverName: { fontSize: Typography.sm, fontWeight: '700', color: Colors.gray900 },
  driverId: { fontSize: Typography.xs, color: Colors.gray500 },
  savedLocationChip: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  savedLocationChipText: { fontSize: 11, fontWeight: '700', color: Colors.primary },
  searchResults: { borderWidth: 1, borderColor: Colors.gray200, borderRadius: Radius.md, marginTop: 4, overflow: 'hidden' },
  searchResultRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.gray100, backgroundColor: Colors.white,
  },
  searchResultName: { fontSize: Typography.sm, fontWeight: '600', color: Colors.gray900 },
  searchResultAddress: { fontSize: 11, color: Colors.gray500 },
  rateMatchedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2 },
  rateValue: { fontSize: Typography.sm, fontWeight: '800', color: Colors.gray900 },
  rateSourceHint: { fontSize: 11, color: Colors.gray500, marginTop: 2 },
  rateOverrideLink: { fontSize: 12, fontWeight: '700', color: Colors.primary, marginTop: Spacing.xs },
  draftBanner: {
    backgroundColor: Colors.primaryLight, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: Colors.primary,
  },
  draftBannerText: { fontSize: Typography.xs, color: Colors.primary, fontWeight: '600', flex: 1 },
  draftRestoreBtn: { backgroundColor: Colors.primary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.md },
  draftRestoreText: { color: Colors.white, fontSize: 11, fontWeight: '700' },
  draftDiscardBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  draftDiscardText: { color: Colors.gray600, fontSize: 11 },
  segmentedContainer: { flexDirection: 'row', backgroundColor: Colors.gray100, borderRadius: Radius.md, padding: 2, marginBottom: 8 },
  segmentedBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: Radius.md },
  segmentedBtnActive: { backgroundColor: Colors.white, elevation: 1 },
  segmentedText: { fontSize: Typography.xs, color: Colors.gray600, fontWeight: '600' },
  segmentedTextActive: { color: Colors.primary, fontWeight: '700' },
  intermediateStopCard: { backgroundColor: Colors.gray50, padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.gray200 },
  stopLabel: { fontSize: Typography.xs, fontWeight: '700', color: Colors.gray700 },
  addStopBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  addStopBtnText: { fontSize: Typography.xs, color: Colors.primary, fontWeight: '700' },
  acceleratorTitle: { fontSize: 11, color: Colors.gray500, fontWeight: '600', marginBottom: 4 },
  acceleratorChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray200, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 5 },
  acceleratorChipText: { fontSize: 11, color: Colors.gray800, fontWeight: '600' },
  presetChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.gray100, borderRadius: Radius.md, paddingHorizontal: 8, paddingVertical: 4 },
  presetChipText: { fontSize: 11, color: Colors.gray700, fontWeight: '600' },
  chargeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  chargeType: { fontSize: Typography.xs, color: Colors.gray800, flex: 1 },
  chargeAmount: { fontSize: Typography.xs, fontWeight: '700', color: Colors.gray900, marginRight: 8 },
  addChargeBtn: { backgroundColor: Colors.primary, width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  financialSummaryCard: { backgroundColor: Colors.gray50, borderRadius: Radius.md, padding: Spacing.md, marginTop: 8, gap: 4, borderWidth: 1, borderColor: Colors.gray200 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: Typography.xs, color: Colors.gray600 },
  summaryValue: { fontSize: Typography.xs, fontWeight: '700', color: Colors.gray900 },
  totalSummaryLabel: { fontSize: Typography.sm, fontWeight: '700', color: Colors.gray900 },
  totalSummaryValue: { fontSize: Typography.sm, fontWeight: '800', color: Colors.primary },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  toggleLabel: { fontSize: Typography.xs, fontWeight: '700', color: Colors.gray800 },
  toggleSublabel: { fontSize: 10, color: Colors.gray500 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: Spacing.lg },
  modalContent: { backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing.xl },
  modalTitle: { fontSize: Typography.md, fontWeight: '700', color: Colors.gray900, textAlign: 'center' },
  modalBody: { fontSize: Typography.sm, color: Colors.gray600, textAlign: 'center', marginTop: 8 },
  reviewSection: { marginBottom: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  reviewHeading: { fontSize: Typography.xs, fontWeight: '700', color: Colors.primary, textTransform: 'uppercase', marginBottom: 2 },
  reviewText: { fontSize: Typography.sm, fontWeight: '700', color: Colors.gray900 },
  reviewSubtext: { fontSize: Typography.xs, color: Colors.gray600 },
  appliedSummaryCard: {
    backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing.lg,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: `${Colors.primary}40`, marginTop: Spacing.sm,
  },
  appliedSummaryLane: { fontSize: Typography.sm, fontWeight: '700', color: Colors.gray900 },
  appliedSummaryDetails: { fontSize: Typography.xs, color: Colors.gray600, marginTop: 2 },
  editRouteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.md, backgroundColor: Colors.primaryLight },
  editRouteBtnText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  touchPresetChip: { backgroundColor: Colors.gray100, paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.md },
  touchPresetChipActive: { backgroundColor: Colors.primaryLight, borderWidth: 1, borderColor: Colors.primary },
  touchPresetText: { fontSize: 11, fontWeight: '600', color: Colors.gray700 },
  touchPresetTextActive: { color: Colors.primary, fontWeight: '700' },
  autoEtaChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.sm },
  autoEtaChipText: { fontSize: 10, fontWeight: '700', color: Colors.primary },
  page2NavRow: { flexDirection: 'row', gap: Spacing.md, alignItems: 'center', marginTop: Spacing.md },
  backStepBtn: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.gray300 },
  backStepBtnText: { fontSize: Typography.sm, fontWeight: '700', color: Colors.gray700 },
});

export default CreateTripScreen;

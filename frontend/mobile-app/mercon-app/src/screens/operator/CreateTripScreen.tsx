import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, StatusBar, ActivityIndicator, Alert, Modal, Switch, TextInput, Linking, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft, Check, Truck, Clock, MapPin, FileText,
  Plus, Trash2, AlertTriangle, RotateCcw, Building2, Zap, Edit3, ChevronRight, Search, X, MessageCircle, Sparkles, Pencil, Layers,
} from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography } from '../../theme/tokens';
import { Button, Card, Input, StatusBadge } from '../../components';
import { getApiErrorMessage, API_URL } from '../../lib/api';
import { safeSecureStore } from '../../lib/secure-store';
import {
  operatorService, invalidateOperatorTrips,
  type OperatorCustomer, type OperatorDriver, type OperatorVehicle,
  type OperatorLocation, type QuotationLookupMatch, type OperatorQuotation,
  type OperatorThirdPartyProvider, type CreateTripStopInput,
  getQuotationRoute,
} from '../../lib/operator';

function resolveMediaUrl(url?: string | null): string | null {
  if (!url || typeof url !== 'string' || !url.trim()) return null;
  const trimmed = url.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
    return trimmed;
  }
  const baseUrl = API_URL ? API_URL.replace(/\/api\/?$/, '') : 'https://dev.mercon.tech';
  return `${baseUrl}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}

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
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [quotationSearchQuery, setQuotationSearchQuery] = useState('');
  const [quotations, setQuotations] = useState<OperatorQuotation[]>([]);
  const [loadingQuotations, setLoadingQuotations] = useState(false);
  const [selectedQuotation, setSelectedQuotation] = useState<OperatorQuotation | null>(null);

  const filteredCustomers = useMemo(() => {
    if (!customerSearchQuery.trim()) return customers;
    const q = customerSearchQuery.toLowerCase().trim();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.contact_phone && c.contact_phone.includes(q))
    );
  }, [customers, customerSearchQuery]);

  const filteredQuotations = useMemo(() => {
    if (!quotationSearchQuery.trim()) return quotations;
    const q = quotationSearchQuery.toLowerCase().trim();
    return quotations.filter((item) => {
      const { origin, dest } = getQuotationRoute(item);
      const orig = origin.toLowerCase();
      const dst = dest.toLowerCase();
      const name = (item.name || '').toLowerCase();
      const veh = (item.vehicle_type ?? item.vehicle_class ?? '').toLowerCase();
      const line = (item.line_type ?? item.rate_category ?? '').toLowerCase();
      const rateStr = String(item.rate ?? '');
      return orig.includes(q) || dst.includes(q) || name.includes(q) || veh.includes(q) || line.includes(q) || rateStr.includes(q);
    });
  }, [quotations, quotationSearchQuery]);

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
  const [saveAsPersistentQuotation, setSaveAsPersistentQuotation] = useState(true);
  const [billingType, setBillingType] = useState<'Monthly' | 'Extra'>('Extra');
  const [pricingBasis, setPricingBasis] = useState<'Per Trip' | 'Per Month'>('Per Trip');
  const [isInlineQuotationForm, setIsInlineQuotationForm] = useState(false);

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
      setIsInlineQuotationForm(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingQuotations(true);
      try {
        const results = await operatorService.getQuotationsForCustomer(customerId);
        if (!cancelled) {
          setQuotations(results);
          if (results.length === 0) {
            setIsInlineQuotationForm(true);
          }
        }
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
      setBillingAmountInput('');
      setDriverPayoutInput('');
      setManualRateOverride(false);
      return;
    }
    setSelectedQuotation(q);
    setManualRateOverride(false);

    const bRate = Number(q.rate ?? 0);
    const dPayout = Number(q.driver_payout ?? 0);

    setBillingAmountInput(bRate > 0 ? String(bRate) : '');
    setDriverPayoutInput(dPayout > 0 ? String(dPayout) : '');

    if (q.billing_type === 'Monthly' || q.billing_type === 'Extra') {
      setBillingType(q.billing_type);
    }
    if (q.pricing_basis === 'PER_MONTH' || q.pricing_basis === 'Per Month') {
      setPricingBasis('Per Month');
    } else {
      setPricingBasis('Per Trip');
    }

    const normCategory = (q.line_type ?? q.rate_category ?? '').toUpperCase();
    if (normCategory.includes('ROUND') || normCategory === 'ROUND_TRIP') {
      setRateCategory('ROUND_TRIP');
    } else {
      setRateCategory('SINGLE_TRIP');
    }

    setQuotationMatch({
      quotationId: q.id,
      rate: bRate,
      driverPayout: dPayout,
    });

    const { origin, dest } = getQuotationRoute(q);
    const originName = q.originLocation?.name ?? q.origin_name ?? (origin !== 'Origin' ? origin : '');
    const destName = q.destinationLocation?.name ?? q.destination_name ?? (dest !== 'Destination' ? dest : '');

    const resolvedPickup = originName || origin || 'Origin';
    const resolvedDropoff = destName || dest || 'Destination';

    setPickupName(resolvedPickup);
    setPickupLocationId(q.originLocationId ?? undefined);
    if (q.originLocation?.lat != null) setPickupLat(String(q.originLocation.lat));
    else setPickupLat('24.7136');

    if (q.originLocation?.lng != null) setPickupLng(String(q.originLocation.lng));
    else setPickupLng('46.6753');

    setDropoffName(resolvedDropoff);
    setDropoffLocationId(q.destinationLocationId ?? undefined);
    if (q.destinationLocation?.lat != null) setDropoffLat(String(q.destinationLocation.lat));
    else setDropoffLat('26.4207');

    if (q.destinationLocation?.lng != null) setDropoffLng(String(q.destinationLocation.lng));
    else setDropoffLng('50.0888');

    setIsRouteCollapsed(true);
    setFieldErrors({});
  };

  const handleToggleInlineForm = () => {
    if (!isInlineQuotationForm) {
      if (selectedQuotation) {
        const bRate = Number(selectedQuotation.rate ?? 0);
        const dPayout = Number(selectedQuotation.driver_payout ?? 0);
        if (bRate > 0) setBillingAmountInput(String(bRate));
        if (dPayout > 0) setDriverPayoutInput(String(dPayout));
        if (selectedQuotation.billing_type === 'Monthly' || selectedQuotation.billing_type === 'Extra') {
          setBillingType(selectedQuotation.billing_type);
        }
        if (selectedQuotation.pricing_basis === 'PER_MONTH' || selectedQuotation.pricing_basis === 'Per Month') {
          setPricingBasis('Per Month');
        } else {
          setPricingBasis('Per Trip');
        }
        const normCategory = (selectedQuotation.line_type ?? selectedQuotation.rate_category ?? '').toUpperCase();
        if (normCategory.includes('ROUND') || normCategory === 'ROUND_TRIP') {
          setRateCategory('ROUND_TRIP');
        } else {
          setRateCategory('SINGLE_TRIP');
        }
      }
      setIsInlineQuotationForm(true);
    } else {
      setIsInlineQuotationForm(false);
    }
  };

  // Recent Routes Accelerator Chips
  const recentRoutes = useMemo(() => {
    const routeMap = new Map<string, { origin: string; dest: string; quotation: OperatorQuotation }>();
    quotations.forEach((q) => {
      const { origin, dest } = getQuotationRoute(q);
      if (origin && dest && origin !== 'Origin' && dest !== 'Destination') {
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

  const updateOutboundStop = (id: string, field: keyof IntermediateStop, val: string) => {
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

  const addAdditionalCharge = () => {
    const amt = parseFloat(customChargeAmount);
    if (!customChargeType.trim() || Number.isNaN(amt) || amt <= 0) return;
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
    const errors: Record<string, string> = {};
    let isValid = true;

    if (!customerId) {
      errors.customerId = 'Please select a customer company';
      isValid = false;
    }
    if (!pickupName.trim()) {
      errors.pickupName = 'Pickup location name is required';
      isValid = false;
    }
    if (!dropoffName.trim()) {
      errors.dropoffName = 'Dropoff location name is required';
      isValid = false;
    }
    if (effectiveBillingAmount <= 0) {
      errors.billingAmount = 'Customer billing rate must be greater than 0';
      isValid = false;
    }

    setFieldErrors(errors);

    if (!isValid) {
      const firstError = Object.values(errors)[0];
      if (firstError) {
        Alert.alert('Incomplete Trip Information', firstError);
      }
    }

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
          leg_index: 0,
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
            leg_index: 0,
            lat, lng,
            location_name: s.name.trim(),
            location_id: s.locationId,
          });
        }
      });

      stopsPayload.push({
        stop_type: 'Dropoff',
        leg_index: 0,
        lat: dropoffLatNum,
        lng: dropoffLngNum,
        planned_arrival: plannedDropoff,
        location_name: dropoffName.trim() || undefined,
        location_id: dropoffLocationId,
      });

      if (rateCategory === 'ROUND_TRIP') {
        stopsPayload.push({
          stop_type: 'Dropoff',
          leg_index: 1,
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

      let resolvedRateCardId = quotationMatch && !manualRateOverride ? quotationMatch.quotationId : undefined;

      if (!resolvedRateCardId && saveAsPersistentQuotation && effectiveBillingAmount > 0 && customerId) {
        try {
          const newQuo = await operatorService.createQuotation({
            customer_id: customerId,
            name: `${pickupName.trim() || 'Origin'} → ${dropoffName.trim() || 'Destination'}`,
            rate: effectiveBillingAmount,
            driver_payout: fleetType === 'OWN_FLEET' ? effectiveDriverPayout : undefined,
            origin_location_id: pickupLocationId,
            origin_name: pickupLocationId ? undefined : pickupName.trim(),
            destination_location_id: dropoffLocationId,
            destination_name: dropoffLocationId ? undefined : dropoffName.trim(),
            vehicle_type: selectedVehicleObj?.asset_type ?? selectedQuotation?.vehicle_type ?? selectedQuotation?.vehicle_class ?? undefined,
            rate_category: rateCategory === 'ROUND_TRIP' ? 'Round Trip' : 'Single Trip',
            billing_type: billingType,
            pricing_basis: pricingBasis === 'Per Month' ? 'PER_MONTH' : 'PER_TRIP',
          });
          if (newQuo?.id) {
            resolvedRateCardId = newQuo.id;
          }
        } catch (quoErr) {
          console.log('[CreateTrip] Could not save quotation rate card inline:', quoErr);
        }
      }

      const created = await operatorService.createTrip({
        customer_id: customerId,
        driver_id: fleetType === 'OWN_FLEET' && selectedDriver && selectedDriver !== ASSIGN_LATER ? selectedDriver : undefined,
        vehicle_id: fleetType === 'OWN_FLEET' && selectedVehicle && selectedVehicle !== ASSIGN_LATER ? selectedVehicle : undefined,
        planned_start: plannedPickup,
        planned_end: plannedDropoff,
        billing_amount: effectiveBillingAmount,
        trip_charges: fleetType === 'OWN_FLEET' ? effectiveDriverPayout : undefined,
        rate_card_id: resolvedRateCardId,
        vehicle_type: selectedVehicleObj?.asset_type ?? selectedQuotation?.vehicle_type ?? selectedQuotation?.vehicle_class ?? undefined,
        rate_category: rateCategory,
        billing_type: selectedQuotation?.billing_type ?? billingType,

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

      {/* 3-Tab Stepper Indicator Bar */}
      <View style={styles.stepperContainer}>
        <TouchableOpacity
          style={[styles.stepperTab, page === 1 && styles.stepperTabActive]}
          activeOpacity={0.8}
          onPress={() => setPage(1)}
        >
          <View style={[styles.stepperDot, page === 1 && styles.stepperDotActive]}>
            <Text style={[styles.stepperDotText, page === 1 && styles.stepperDotTextActive]}>1</Text>
          </View>
          <Text style={[styles.stepperTabText, page === 1 && styles.stepperTabTextActive]}>Customer & Route</Text>
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

        <View style={styles.stepperLine} />

        <TouchableOpacity
          style={[styles.stepperTab, page === 3 && styles.stepperTabActive]}
          activeOpacity={0.8}
          onPress={() => {
            if (validatePage1Fields() && validatePage2Fields()) {
              setPage(3);
              scrollViewRef.current?.scrollTo({ y: 0, animated: true });
            }
          }}
        >
          <View style={[styles.stepperDot, page === 3 && styles.stepperDotActive]}>
            <Text style={[styles.stepperDotText, page === 3 && styles.stepperDotTextActive]}>3</Text>
          </View>
          <Text style={[styles.stepperTabText, page === 3 && styles.stepperTabTextActive]}>Financials & Review</Text>
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

          {/* TAB 1: Customer Account, Quotation & Route Configuration */}
          {page === 1 && (
            <>
              {/* Section 1: Customer Account & Commercial Quotation Cards */}
              <Text style={styles.sectionTitle}>1. Customer & Active Commercial Rates</Text>

              {!customerId ? (
                /* State A: No Customer Selected — Search Bar + Horizontal Customer Cards */
                <View style={{ gap: 8 }}>
                  <View style={styles.searchBarContainer}>
                    <Search size={16} color={Colors.gray500} />
                    <TextInput
                      style={styles.searchBarInput}
                      value={customerSearchQuery}
                      onChangeText={setCustomerSearchQuery}
                      placeholder="Search customer company name..."
                      placeholderTextColor={Colors.gray400}
                    />
                    {customerSearchQuery ? (
                      <TouchableOpacity onPress={() => setCustomerSearchQuery('')} style={{ padding: 2 }}>
                        <X size={16} color={Colors.gray500} />
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  {filteredCustomers.length === 0 ? (
                    <Card style={styles.pickerCard}>
                      <Text style={styles.emptyHint}>No customer accounts matching "{customerSearchQuery}"</Text>
                    </Card>
                  ) : (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: 10, paddingVertical: 4 }}
                    >
                      {filteredCustomers.map((c) => {
                        const initials = c.name.substring(0, 2).toUpperCase();
                        const logoUri = resolveMediaUrl(c.logo_url || c.avatar_url);
                        return (
                          <TouchableOpacity
                            key={c.id}
                            style={styles.customerCard}
                            activeOpacity={0.8}
                            onPress={() => handleSelectCustomer(c.id)}
                          >
                            <View style={styles.customerCardHeader}>
                              {logoUri ? (
                                <Image
                                  source={{ uri: logoUri }}
                                  style={styles.customerAvatarImage}
                                  resizeMode="cover"
                                />
                              ) : (
                                <View style={styles.customerAvatar}>
                                  <Text style={styles.customerAvatarText}>{initials}</Text>
                                </View>
                              )}
                              <Building2 size={16} color={Colors.gray400} />
                            </View>

                            <View style={{ flex: 1, justifyContent: 'center', marginVertical: 4 }}>
                              <Text style={styles.customerCardTitle} numberOfLines={2}>
                                {c.name}
                              </Text>
                              {c.contact_phone ? (
                                <Text style={styles.customerCardPhone} numberOfLines={1}>
                                  {c.contact_phone}
                                </Text>
                              ) : null}
                            </View>

                            <View style={styles.customerCardFooter}>
                              <Text style={styles.customerSelectAction}>Select Company →</Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  )}
                </View>
              ) : (
                /* State B: Customer Selected — Selected Customer Badge + Quotation Search & Cards */
                <View style={{ gap: 10 }}>
                  {/* Selected Customer Header Profile Card */}
                  {(() => {
                    const logoUri = resolveMediaUrl(selectedCustomerObj?.logo_url || selectedCustomerObj?.avatar_url);
                    const initials = selectedCustomerObj?.name ? selectedCustomerObj.name.substring(0, 2).toUpperCase() : 'CO';
                    const phone = selectedCustomerObj?.contact_phone || selectedCustomerObj?.primary_contact_phone;
                    const contactPerson = selectedCustomerObj?.primary_contact_person;

                    return (
                      <Card style={styles.selectedCustomerBar}>
                        {logoUri ? (
                          <Image
                            source={{ uri: logoUri }}
                            style={styles.customerAvatarImageSmall}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={styles.customerAvatarSmall}>
                            <Text style={styles.customerAvatarTextSmall}>{initials}</Text>
                          </View>
                        )}

                        <View style={{ flex: 1 }}>
                          <Text style={styles.selectedCustomerName} numberOfLines={1}>
                            {selectedCustomerObj?.name ?? 'Selected Customer'}
                          </Text>
                          <Text style={styles.selectedCustomerSubtext} numberOfLines={1}>
                            {contactPerson ? `${contactPerson} ${phone ? `· ${phone}` : ''}` : phone ? `Phone: ${phone}` : 'Active Commercial Account'}
                          </Text>
                        </View>

                        <TouchableOpacity
                          style={styles.changeCustomerBtn}
                          onPress={() => {
                            setCustomerId('');
                            setSelectedQuotation(null);
                            setQuotationMatch(null);
                            setManualRateOverride(false);
                            setQuotationSearchQuery('');
                          }}
                        >
                          <RotateCcw size={12} color={Colors.primary} />
                          <Text style={styles.changeCustomerText}>Change</Text>
                        </TouchableOpacity>
                      </Card>
                    );
                  })()}

                  {/* Commercial Quotation Header Toolbar */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, marginBottom: 2 }}>
                    <Text style={styles.subSectionTitle}>
                      {isInlineQuotationForm
                        ? selectedQuotation
                          ? 'Edit Selected Quotation'
                          : 'Define Commercial Quotation'
                        : 'Active Commercial Rate Cards'}
                    </Text>

                    <TouchableOpacity
                      style={styles.quotationToggleBtn}
                      activeOpacity={0.8}
                      onPress={handleToggleInlineForm}
                    >
                      {isInlineQuotationForm ? (
                        <>
                          <Layers size={13} color={Colors.primary} />
                          <Text style={styles.quotationToggleBtnText}>
                            {quotations.length > 0 ? `Saved Cards (${quotations.length})` : 'View Saved Cards'}
                          </Text>
                        </>
                      ) : selectedQuotation ? (
                        <>
                          <Pencil size={13} color={Colors.primary} />
                          <Text style={styles.quotationToggleBtnText}>Edit Quotation</Text>
                        </>
                      ) : (
                        <>
                          <Plus size={13} color={Colors.primary} />
                          <Text style={styles.quotationToggleBtnText}>Define Quotation</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>

                  {isInlineQuotationForm ? (
                    /* Inline Quotation Form Mode (Define or Edit) */
                    <View style={styles.defineQuotationBanner}>
                      <View style={styles.defineQuotationHeader}>
                        <View style={styles.defineQuotationTag}>
                          <Sparkles size={12} color="#FA634E" />
                          <Text style={styles.defineQuotationTagText}>
                            {selectedQuotation ? '✏️ Edit Selected Quotation' : '✨ Define Quotation'}
                          </Text>
                        </View>
                        <Text style={styles.defineQuotationLaneText} numberOfLines={1}>
                          {pickupName.trim() || 'Origin'} → {dropoffName.trim() || 'Destination'}
                        </Text>
                      </View>

                      {/* Specification Pickers: Billing Type & Rate Basis */}
                      <View style={{ flexDirection: 'row', gap: 8, marginVertical: 4 }}>
                        {/* Billing Type Selector */}
                        <View style={{ flex: 1 }}>
                          <Text style={styles.miniPickerLabel}>Billing Type</Text>
                          <View style={styles.segmentedContainer}>
                            <TouchableOpacity
                              style={[styles.segmentedBtn, billingType === 'Monthly' && styles.segmentedBtnActive]}
                              onPress={() => setBillingType('Monthly')}
                            >
                              <Text style={[styles.segmentedBtnText, billingType === 'Monthly' && styles.segmentedBtnTextActive]}>
                                Monthly
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.segmentedBtn, billingType === 'Extra' && styles.segmentedBtnActive]}
                              onPress={() => setBillingType('Extra')}
                            >
                              <Text style={[styles.segmentedBtnText, billingType === 'Extra' && styles.segmentedBtnTextActive]}>
                                Extra / Spot
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>

                        {/* Rate Basis Selector */}
                        <View style={{ flex: 1 }}>
                          <Text style={styles.miniPickerLabel}>Rate Basis</Text>
                          <View style={styles.segmentedContainer}>
                            <TouchableOpacity
                              style={[styles.segmentedBtn, pricingBasis === 'Per Trip' && styles.segmentedBtnActive]}
                              onPress={() => setPricingBasis('Per Trip')}
                            >
                              <Text style={[styles.segmentedBtnText, pricingBasis === 'Per Trip' && styles.segmentedBtnTextActive]}>
                                Per Trip
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.segmentedBtn, pricingBasis === 'Per Month' && styles.segmentedBtnActive]}
                              onPress={() => setPricingBasis('Per Month')}
                            >
                              <Text style={[styles.segmentedBtnText, pricingBasis === 'Per Month' && styles.segmentedBtnTextActive]}>
                                Per Month
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>

                      {/* Customer Billing Rate Input */}
                      <Input
                        label="Customer Billing Rate (SAR) *"
                        value={billingAmountInput}
                        state={fieldErrors.billingAmount ? 'error' : 'default'}
                        errorText={fieldErrors.billingAmount}
                        onChangeText={(t) => {
                          setBillingAmountInput(t);
                          setManualRateOverride(true);
                        }}
                        placeholder="e.g. 1500"
                        keyboardType="numeric"
                      />

                      {/* Per Month Breakdown Helper Pill */}
                      {pricingBasis === 'Per Month' && Number(billingAmountInput) > 0 ? (
                        <View style={styles.monthlyBreakdownPill}>
                          <Zap size={12} color="#7C3AED" />
                          <Text style={styles.monthlyBreakdownText}>
                            Per-Trip Breakdown: <Text style={{ fontWeight: '800' }}>SAR {(Math.round((Number(billingAmountInput) / 30) * 100) / 100).toLocaleString()} / trip</Text> (30-day duty)
                          </Text>
                        </View>
                      ) : null}

                      {/* Driver Payout Input (Own Fleet Only) */}
                      {fleetType === 'OWN_FLEET' && (
                        <Input
                          label="Driver Payout (SAR) *"
                          value={driverPayoutInput}
                          state={fieldErrors.driverPayout ? 'error' : 'default'}
                          errorText={fieldErrors.driverPayout}
                          onChangeText={(t) => {
                            setDriverPayoutInput(t);
                            setManualRateOverride(true);
                          }}
                          placeholder="e.g. 400"
                          keyboardType="numeric"
                        />
                      )}

                      {/* Save to Quotation Ledger Toggle */}
                      <View style={styles.toggleRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.toggleLabel}>Save to Customer Quotations Ledger</Text>
                          <Text style={styles.toggleSublabel}>Store rate card so future trips for this customer & route match automatically</Text>
                        </View>
                        <Switch
                          value={saveAsPersistentQuotation}
                          onValueChange={setSaveAsPersistentQuotation}
                          trackColor={{ false: Colors.gray200, true: Colors.primary }}
                        />
                      </View>
                    </View>
                  ) : (
                    /* Saved Quotation Cards Mode */
                    <>
                      {/* Quotation Search Bar */}
                      <View style={styles.searchBarContainer}>
                        <Search size={16} color={Colors.gray500} />
                        <TextInput
                          style={styles.searchBarInput}
                          value={quotationSearchQuery}
                          onChangeText={setQuotationSearchQuery}
                          placeholder="Filter active rates (e.g. Riyadh, 10 TON)..."
                          placeholderTextColor={Colors.gray400}
                        />
                        {quotationSearchQuery ? (
                          <TouchableOpacity onPress={() => setQuotationSearchQuery('')} style={{ padding: 2 }}>
                            <X size={16} color={Colors.gray500} />
                          </TouchableOpacity>
                        ) : null}
                      </View>

                      {/* Quotation Cards Carousel */}
                      {loadingQuotations ? (
                        <Card style={styles.pickerCard}>
                          <ActivityIndicator color={Colors.primary} style={{ padding: Spacing.lg }} />
                        </Card>
                      ) : filteredQuotations.length === 0 ? (
                        <Card style={styles.pickerCard}>
                          <Text style={styles.emptyHint}>
                            {quotations.length === 0
                              ? 'No active quotation rate cards on file for this customer.'
                              : `No rate cards matching "${quotationSearchQuery}"`}
                          </Text>
                          <TouchableOpacity
                            style={{ marginHorizontal: Spacing.md, marginBottom: Spacing.md, alignSelf: 'flex-start' }}
                            onPress={() => setIsInlineQuotationForm(true)}
                          >
                            <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.primary }}>
                              + Define Quotation for this Lane →
                            </Text>
                          </TouchableOpacity>
                        </Card>
                      ) : (
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={{ gap: 10, paddingVertical: 4 }}
                        >
                          {filteredQuotations.map((q) => {
                            const isSelected = selectedQuotation?.id === q.id;
                            const { origin, dest } = getQuotationRoute(q);
                            const vehClass = q.vehicle_type ?? q.vehicle_class ?? 'Any Vehicle';
                            const lineType = q.line_type ?? q.rate_category ?? 'Single Trip';
                            const rateVal = Number(q.rate ?? 0);

                            return (
                              <TouchableOpacity
                                key={q.id}
                                style={[
                                  styles.quotationCard,
                                  isSelected && styles.quotationCardActive,
                                ]}
                                activeOpacity={0.8}
                                onPress={() => handleSelectQuotation(q)}
                              >
                                <View style={styles.quotationCardHeader}>
                                  <View style={{ flex: 1 }}>
                                    <Text style={styles.quotationCardLane} numberOfLines={1}>
                                      {origin} → {dest}
                                    </Text>
                                    <Text style={styles.quotationCardMeta} numberOfLines={1}>
                                      {vehClass} · {lineType}
                                    </Text>
                                  </View>
                                  {isSelected ? (
                                    <View style={styles.selectedCheckBadge}>
                                      <Check size={12} color={Colors.white} strokeWidth={3} />
                                    </View>
                                  ) : null}
                                </View>

                                <View style={styles.quotationCardFooter}>
                                  <Text style={[styles.quotationCardRate, isSelected && styles.quotationCardRateActive]}>
                                    SAR {rateVal.toLocaleString()}
                                  </Text>
                                  <Text style={[styles.quotationCardAction, isSelected && styles.quotationCardActionActive]}>
                                    {isSelected ? 'Applied' : 'Apply Card →'}
                                  </Text>
                                </View>
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      )}
                    </>
                  )}
                </View>
              )}

              {/* Section 2: Route & Multi-Stop Configuration (ALWAYS VISIBLE on Tab 1!) */}
              <Text style={styles.sectionTitle}>2. Route & Multi-Stop Configuration</Text>
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

              {/* Tab 1 Bottom Action Button */}
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

  searchBarContainer: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray200,
    borderRadius: Radius.lg, paddingHorizontal: Spacing.md, height: 44,
  },
  searchBarInput: {
    flex: 1, fontSize: Typography.sm, color: Colors.gray900, height: '100%',
  },
  customerCard: {
    width: 170, height: 116, backgroundColor: Colors.white,
    borderWidth: 1, borderColor: Colors.gray200, borderRadius: Radius.xl,
    padding: Spacing.md, justifyContent: 'space-between',
  },
  customerCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  customerAvatar: {
    width: 32, height: 32, borderRadius: Radius.lg, backgroundColor: Colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  customerAvatarImage: {
    width: 32, height: 32, borderRadius: Radius.lg, backgroundColor: Colors.gray100,
    borderWidth: 1, borderColor: Colors.gray200,
  },
  customerAvatarText: { fontSize: 12, fontWeight: '800', color: Colors.primary },
  customerCardTitle: { fontSize: 13, fontWeight: '700', color: Colors.gray900 },
  customerCardPhone: { fontSize: 10, color: Colors.gray500, marginTop: 2 },
  customerCardFooter: { borderTopWidth: 1, borderTopColor: Colors.gray100, paddingTop: 6 },
  customerSelectAction: { fontSize: 11, fontWeight: '700', color: Colors.primary },

  selectedCustomerBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.white, padding: Spacing.md, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.gray300,
  },
  customerAvatarSmall: {
    width: 38, height: 38, borderRadius: 10, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  customerAvatarImageSmall: {
    width: 38, height: 38, borderRadius: 10, backgroundColor: Colors.gray100,
    borderWidth: 1, borderColor: Colors.gray200,
  },
  customerAvatarTextSmall: { fontSize: 13, fontWeight: '800', color: Colors.white },
  selectedCustomerLabel: { fontSize: 10, fontWeight: '700', color: Colors.gray500, textTransform: 'uppercase' },
  selectedCustomerName: { fontSize: Typography.sm, fontWeight: '800', color: Colors.gray900 },
  selectedCustomerSubtext: { fontSize: 11, fontWeight: '600', color: Colors.gray500, marginTop: 1 },
  verifiedBadge: {
    width: 14, height: 14, borderRadius: 7, backgroundColor: '#10B981',
    alignItems: 'center', justifyContent: 'center',
  },
  customerWhatsappBtn: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: '#25D366',
    alignItems: 'center', justifyContent: 'center',
  },
  changeCustomerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.primaryLight, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.md,
  },
  changeCustomerText: { fontSize: 11, fontWeight: '700', color: Colors.primary },

  subSectionTitle: { fontSize: Typography.xs, fontWeight: '700', color: Colors.gray600, textTransform: 'uppercase', letterSpacing: 0.5 },
  quotationToggleBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.primaryLight, paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: Radius.md, borderWidth: 1, borderColor: '#FED7AA',
  },
  quotationToggleBtnText: { fontSize: 11, fontWeight: '700', color: Colors.primary },

  quotationCard: {
    width: 230, height: 116, backgroundColor: Colors.white,
    borderWidth: 1, borderColor: Colors.gray200, borderRadius: Radius.xl,
    padding: Spacing.md, justifyContent: 'space-between',
  },
  quotationCardActive: {
    borderColor: Colors.primary, backgroundColor: Colors.primaryLight, borderWidth: 2,
  },
  quotationCardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  quotationCardLane: { fontSize: 13, fontWeight: '800', color: Colors.gray900 },
  quotationCardMeta: { fontSize: 11, fontWeight: '600', color: Colors.gray500, marginTop: 2 },
  selectedCheckBadge: {
    width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  quotationCardFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: Colors.gray100, paddingTop: 6,
  },
  quotationCardRate: { fontSize: 14, fontWeight: '800', color: Colors.gray900 },
  quotationCardRateActive: { color: Colors.primary },
  quotationCardAction: { fontSize: 11, fontWeight: '700', color: Colors.gray500 },
  quotationCardActionActive: { color: Colors.primary },
  pickerItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.gray100,
  },
  pickerItemActive: { backgroundColor: Colors.primaryLight },
  pickerItemText: { fontSize: Typography.sm, color: Colors.gray700, fontWeight: '500' },
  pickerItemTextActive: { color: Colors.primary, fontWeight: '700' },
  formCard: { borderRadius: Radius.xl, padding: Spacing.lg, gap: 8 },
  defineQuotationBanner: {
    padding: 12, borderRadius: Radius.xl, backgroundColor: '#FFF7ED',
    borderWidth: 1, borderColor: '#FFEDD5', gap: 8,
  },
  defineQuotationHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#FED7AA',
  },
  defineQuotationTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FFEDD5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full,
  },
  defineQuotationTagText: { fontSize: 11, fontWeight: '800', color: Colors.primary },
  defineQuotationLaneText: { fontSize: 11, fontWeight: '800', color: Colors.gray800, flex: 1, textAlign: 'right' },
  miniPickerLabel: { fontSize: 10, fontWeight: '700', color: Colors.gray600, textTransform: 'uppercase', marginBottom: 4 },
  segmentedContainer: {
    flexDirection: 'row', backgroundColor: Colors.white, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.gray200, padding: 2,
  },
  segmentedBtn: { flex: 1, paddingVertical: 6, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
  segmentedBtnActive: { backgroundColor: Colors.primary },
  segmentedBtnText: { fontSize: 11, fontWeight: '700', color: Colors.gray700 },
  segmentedBtnTextActive: { color: Colors.white },
  monthlyBreakdownPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F3E8FF', paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: Radius.md, borderWidth: 1, borderColor: '#E9D5FF',
  },
  monthlyBreakdownText: { fontSize: 11, color: '#6B21A8' },
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

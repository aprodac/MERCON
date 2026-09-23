import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, StatusBar, ActivityIndicator, Alert, Modal, Switch, TextInput, Linking, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft, Check, Truck, Clock, MapPin, FileText,
  Plus, Trash2, AlertTriangle, RotateCcw, Building2, Zap, Edit3, ChevronRight, Search, X, MessageCircle, Sparkles, Pencil, Layers, User, UserPlus,
} from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography } from '../../theme/tokens';
import { Button, Card, Input, StatusBadge, Toast, MonthlyCalendarSelector, type DayAssignmentOverride } from '../../components';
import { DriverAvatar } from '../../features/drivers/components/DriverAvatar';
import { getApiErrorMessage, API_URL } from '../../lib/api';
import { safeSecureStore } from '../../lib/secure-store';
import {
  operatorService, invalidateOperatorTrips,
  type OperatorCustomer, type OperatorDriver, type OperatorVehicle,
  type OperatorLocation, type QuotationLookupMatch, type OperatorQuotation,
  type OperatorThirdPartyProvider, type CreateTripStopInput,
  getQuotationRoute,
} from '../../lib/operator';
import {
  estimateTravelTimeByName,
  calculateArrivalDropoffDateAndTime,
  type TravelTimeEstimate,
} from '../../lib/travelTimeService';



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
const RECENT_ROUTES_STORAGE_KEY = 'MERCON_RECENT_ROUTES_V1';

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

export type RateCategoryType = 'SINGLE_TRIP' | 'ROUND_TRIP' | '10_HRS' | '12_HRS';

function normalizeBillingType(val?: string | null): 'Monthly' | 'Extra' {
  if (!val) return 'Monthly';
  const s = String(val).toUpperCase().trim();
  if (/\b(EXTRA|SPOT|ADHOC)\b/i.test(s)) return 'Extra';
  return 'Monthly';
}

const CreateTripScreen = () => {
  const router = useRouter();
  const {
    customerId: presetCustomerId,
    billingType: presetBillingType,
    assignment: presetAssignment,
    assignmentType: presetAssignmentType,
  } = useLocalSearchParams<{
    customerId?: string;
    billingType?: string;
    assignment?: string;
    assignmentType?: string;
  }>();
  const scrollViewRef = useRef<ScrollView>(null);

  // Page pacing state: Page 1 ("Customer & Route") vs Page 2 ("Schedule & Fleet") vs Page 3 ("Financials & Review")
  const [page, setPage] = useState<1 | 2 | 3>(1);

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

  // Toast notification state
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'info' | 'error'>('success');

  // Progressive Collapse state: collapses Route and Rate sections when quotation/lane is applied
  const [isRouteCollapsed, setIsRouteCollapsed] = useState(false);

  // Field-level error validation state
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Workflow state: 4 Line Types (Single Trip, Round Trip, 10 Hours Duty, 12 Hours Duty)
  const [rateCategory, setRateCategory] = useState<RateCategoryType>('SINGLE_TRIP');

  // Customer & Quotation state
  const [customerId, setCustomerId] = useState(presetCustomerId ?? '');
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [quotationSearchQuery, setQuotationSearchQuery] = useState('');
  const [quotationBillingFilter, setQuotationBillingFilter] = useState<'ALL' | 'Monthly' | 'Extra'>(
    presetBillingType === 'Monthly' ? 'Monthly' : presetBillingType === 'Extra' ? 'Extra' : 'ALL'
  );
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
    let result = quotations;

    if (quotationBillingFilter !== 'ALL') {
      result = result.filter((item) => {
        const itemBType = normalizeBillingType(item.billing_type);
        return itemBType === quotationBillingFilter;
      });
    }

    if (quotationSearchQuery.trim()) {
      const q = quotationSearchQuery.toLowerCase().trim();
      result = result.filter((item) => {
        const { origin, dest } = getQuotationRoute(item);
        const orig = origin.toLowerCase();
        const dst = dest.toLowerCase();
        const name = (item.name || '').toLowerCase();
        const veh = (item.vehicle_type ?? item.vehicle_class ?? '').toLowerCase();
        const line = (item.line_type ?? item.rate_category ?? '').toLowerCase();
        const rateStr = String(item.rate ?? '');
        const bType = (item.billing_type || '').toLowerCase();
        return (
          orig.includes(q) ||
          dst.includes(q) ||
          name.includes(q) ||
          veh.includes(q) ||
          line.includes(q) ||
          rateStr.includes(q) ||
          bType.includes(q)
        );
      });
    }

    return result;
  }, [quotations, quotationBillingFilter, quotationSearchQuery]);

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

  // Explicit Return Leg fields for Round Trip
  const [returnOriginName, setReturnOriginName] = useState('');
  const [returnOriginLat, setReturnOriginLat] = useState('');
  const [returnOriginLng, setReturnOriginLng] = useState('');
  const [returnOriginLocationId, setReturnOriginLocationId] = useState<string | undefined>(undefined);

  const [returnDestinationName, setReturnDestinationName] = useState('');
  const [returnDestinationLat, setReturnDestinationLat] = useState('');
  const [returnDestinationLng, setReturnDestinationLng] = useState('');
  const [returnDestinationLocationId, setReturnDestinationLocationId] = useState<string | undefined>(undefined);

  // Departure & Delivery Due dates
  const [date, setDate] = useState(formatDateDDMMYYYY(new Date()));
  const [time, setTime] = useState('08:00');
  const [etaDate, setEtaDate] = useState(formatDateDDMMYYYY(new Date()));
  const [etaTime, setEtaTime] = useState('12:00');
  const [isAutoEta, setIsAutoEta] = useState(true);

  // Monthly Duty Trip Calendar & Override state
  const [selectedMonthlyDates, setSelectedMonthlyDates] = useState<string[]>([]);
  const [monthlyCurrentMonth, setMonthlyCurrentMonth] = useState<Date>(new Date());
  const [monthlyAssignmentMode, setMonthlyAssignmentMode] = useState<'MASTER' | 'PER_DAY'>('MASTER');
  const [dayAssignments, setDayAssignments] = useState<Record<string, DayAssignmentOverride>>({});

  const handleToggleMonthlyDate = (dateStr: string) => {
    setSelectedMonthlyDates((prev) =>
      prev.includes(dateStr) ? prev.filter((d) => d !== dateStr) : [...prev, dateStr].sort()
    );
  };

  const handleSelectAllWeekdays = () => {
    const yr = monthlyCurrentMonth.getFullYear();
    const mo = monthlyCurrentMonth.getMonth();
    const totalDays = new Date(yr, mo + 1, 0).getDate();
    const weekdays: string[] = [];

    for (let d = 1; d <= totalDays; d++) {
      const dayOfWeek = new Date(yr, mo, d).getDay();
      // Sun(0), Mon(1), Tue(2), Wed(3), Thu(4) are Saudi weekdays
      if (dayOfWeek >= 0 && dayOfWeek <= 4) {
        const mm = String(mo + 1).padStart(2, '0');
        const dd = String(d).padStart(2, '0');
        weekdays.push(`${yr}-${mm}-${dd}`);
      }
    }
    setSelectedMonthlyDates(weekdays);
  };

  const handleSelectAllDays = () => {
    const yr = monthlyCurrentMonth.getFullYear();
    const mo = monthlyCurrentMonth.getMonth();
    const totalDays = new Date(yr, mo + 1, 0).getDate();
    const allDays: string[] = [];

    for (let d = 1; d <= totalDays; d++) {
      const mm = String(mo + 1).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      allDays.push(`${yr}-${mm}-${dd}`);
    }
    setSelectedMonthlyDates(allDays);
  };

  const handleClearMonthlyDates = () => {
    setSelectedMonthlyDates([]);
  };

  const handleSaveDayOverride = (dateStr: string, override: DayAssignmentOverride | null) => {
    setDayAssignments((prev) => {
      const next = { ...prev };
      if (!override || (!override.driver_id && !override.vehicle_id && !override.co_driver_id)) {
        delete next[dateStr];
      } else {
        next[dateStr] = override;
      }
      return next;
    });
  };

  // Travel time & transit calculation state
  const [travelEstimate, setTravelEstimate] = useState<TravelTimeEstimate | null>(null);
  const [estimatingTime, setEstimatingTime] = useState(false);

  // Fleet Assignment state: Own Fleet vs 3PL Subcontractor (Preset support)
  const [fleetType, setFleetType] = useState<'OWN_FLEET' | 'THIRD_PARTY'>(
    presetAssignment === 'third_party' || presetAssignmentType === 'third_party' ? 'THIRD_PARTY' : 'OWN_FLEET'
  );
  const [selectedDriver, setSelectedDriver] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState('');

  // Search & Co-Driver state
  const [driverSearchQuery, setDriverSearchQuery] = useState('');
  const [vehicleSearchQuery, setVehicleSearchQuery] = useState('');
  const [coDriverSearchQuery, setCoDriverSearchQuery] = useState('');
  const [selectedCoDriver, setSelectedCoDriver] = useState('');
  const [coDriverPayoutInput, setCoDriverPayoutInput] = useState('');
  const [showCoDriver, setShowCoDriver] = useState(false);

  const filteredDrivers = useMemo(() => {
    if (!driverSearchQuery.trim()) return drivers;
    const q = driverSearchQuery.toLowerCase().trim();
    return drivers.filter((d) => {
      const name = `${d.first_name} ${d.last_name}`.toLowerCase();
      const phone = (d.phone_primary || '').toLowerCase();
      const refId = (d.ref_id || d.license_number || '').toLowerCase();
      return name.includes(q) || phone.includes(q) || refId.includes(q);
    });
  }, [drivers, driverSearchQuery]);

  const filteredCoDrivers = useMemo(() => {
    const available = drivers.filter((d) => d.id !== selectedDriver);
    if (!coDriverSearchQuery.trim()) return available;
    const q = coDriverSearchQuery.toLowerCase().trim();
    return available.filter((d) => {
      const name = `${d.first_name} ${d.last_name}`.toLowerCase();
      const phone = (d.phone_primary || '').toLowerCase();
      const refId = (d.ref_id || d.license_number || '').toLowerCase();
      return name.includes(q) || phone.includes(q) || refId.includes(q);
    });
  }, [drivers, selectedDriver, coDriverSearchQuery]);

  const filteredVehicles = useMemo(() => {
    if (!vehicleSearchQuery.trim()) return vehicles;
    const q = vehicleSearchQuery.toLowerCase().trim();
    return vehicles.filter((v) => {
      const plate = (v.plate_number || '').toLowerCase();
      const type = (v.asset_type || '').toLowerCase();
      const refId = (v.ref_id || '').toLowerCase();
      return plate.includes(q) || type.includes(q) || refId.includes(q);
    });
  }, [vehicles, vehicleSearchQuery]);

  const recommendedDrivers = useMemo(() => {
    return drivers.slice(0, 2);
  }, [drivers]);


  // 3PL Subcontractor state
  const [selected3PLProvider, setSelected3PLProvider] = useState('');
  const [thirdPartyDriverName, setThirdPartyDriverName] = useState('');
  const [thirdPartyDriverPhone, setThirdPartyDriverPhone] = useState('');
  const [thirdPartyVehiclePlate, setThirdPartyVehiclePlate] = useState('');
  const [thirdPartyCostInput, setThirdPartyCostInput] = useState('');

  // Rate & Financials state (Preset support for Monthly vs Extra)
  const [quotationMatch, setQuotationMatch] = useState<QuotationLookupMatch | null>(null);
  const [lookingUpRate, setLookingUpRate] = useState(false);
  const [manualRateOverride, setManualRateOverride] = useState(false);
  const [billingAmountInput, setBillingAmountInput] = useState('');
  const [driverPayoutInput, setDriverPayoutInput] = useState('');
  const [saveAsPersistentQuotation, setSaveAsPersistentQuotation] = useState(true);
  const [billingType, setBillingType] = useState<'Monthly' | 'Extra'>(
    presetBillingType === 'Monthly' ? 'Monthly' : 'Extra'
  );
  const [pricingBasis, setPricingBasis] = useState<'Per Trip' | 'Per Month'>(
    presetBillingType === 'Monthly' ? 'Per Month' : 'Per Trip'
  );
  const [isInlineQuotationForm, setIsInlineQuotationForm] = useState(false);

  // Itemized Additional Charges state
  const [additionalCharges, setAdditionalCharges] = useState<AdditionalChargeItem[]>([]);
  const [customChargeType, setCustomChargeType] = useState('');
  const [customChargeAmount, setCustomChargeAmount] = useState('');

  // Submission & Modals state
  const [submitting, setSubmitting] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showPastDateModal, setShowPastDateModal] = useState(false);

  // Travel time calculation effect
  useEffect(() => {
    if (!pickupName.trim() || !dropoffName.trim()) {
      setTravelEstimate(null);
      return;
    }
    let cancelled = false;
    setEstimatingTime(true);
    estimateTravelTimeByName(
      pickupName,
      dropoffName,
      parseFloat(pickupLat) || null,
      parseFloat(pickupLng) || null,
      parseFloat(dropoffLat) || null,
      parseFloat(dropoffLng) || null
    ).then((est) => {
      if (!cancelled) {
        setTravelEstimate(est);
        setEstimatingTime(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setTravelEstimate(null);
        setEstimatingTime(false);
      }
    });
    return () => { cancelled = true; };
  }, [pickupName, dropoffName, pickupLat, pickupLng, dropoffLat, dropoffLng]);

  // Dynamic Auto-ETA Dropoff Calculation based on real travelEstimate duration
  useEffect(() => {
    if (isAutoEta && travelEstimate && date && time) {
      const calc = calculateArrivalDropoffDateAndTime(date, time, travelEstimate.durationMinutes);
      if (calc.dropoffDate && calc.dropoffTime) {
        setEtaDate(calc.dropoffDate);
        setEtaTime(calc.dropoffTime);
      }
    } else if (isAutoEta && date && time) {
      calculateAutoEta(date, time);
    }
  }, [travelEstimate, date, time, isAutoEta]);

  // Fallback Auto-ETA: Departure + 4 hours
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

  // Recent Routes Accelerator state
  const [savedRecentRoutes, setSavedRecentRoutes] = useState<RecentRouteItem[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const stored = await safeSecureStore.getItemAsync(RECENT_ROUTES_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) setSavedRecentRoutes(parsed);
        }
      } catch {
        // silent
      }
    })();
  }, []);

  const saveRecentRoute = async (route: Omit<RecentRouteItem, 'id'>) => {
    if (!route.originName.trim() || !route.destName.trim()) return;
    try {
      const stored = await safeSecureStore.getItemAsync(RECENT_ROUTES_STORAGE_KEY);
      let list: RecentRouteItem[] = stored ? JSON.parse(stored) : [];
      const key = `${route.originName.trim().toLowerCase()}->${route.destName.trim().toLowerCase()}`;
      list = list.filter((item) => `${item.originName.trim().toLowerCase()}->${item.destName.trim().toLowerCase()}` !== key);
      list.unshift({ id: `${Date.now()}`, ...route });
      list = list.slice(0, 5);
      setSavedRecentRoutes(list);
      await safeSecureStore.setItemAsync(RECENT_ROUTES_STORAGE_KEY, JSON.stringify(list));
    } catch {
      // silent
    }
  };

  const handleSelectRecentRoute = (item: RecentRouteItem) => {
    setPickupName(item.originName);
    if (item.originLat) setPickupLat(item.originLat);
    if (item.originLng) setPickupLng(item.originLng);
    if (item.originLocationId) setPickupLocationId(item.originLocationId);

    setDropoffName(item.destName);
    if (item.destLat) setDropoffLat(item.destLat);
    if (item.destLng) setDropoffLng(item.destLng);
    if (item.destLocationId) setDropoffLocationId(item.destLocationId);
  };

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

  // Debounced draft autosave (BUG FIX: Do NOT overwrite DRAFT_STORAGE_KEY while hasSavedDraft is true and user hasn't restored/discarded!)
  useEffect(() => {
    if (loadingOptions) return;
    if (hasSavedDraft) return;

    const timer = setTimeout(async () => {
      const hasContent = customerId || pickupName.trim() || dropoffName.trim();
      if (!hasContent) return;

      const draftState = {
        customerId,
        rateCategory,
        pickupName, pickupLat, pickupLng, pickupLocationId,
        dropoffName, dropoffLat, dropoffLng, dropoffLocationId,
        outboundStops,
        returnOriginName, returnOriginLat, returnOriginLng, returnOriginLocationId,
        returnDestinationName, returnDestinationLat, returnDestinationLng, returnDestinationLocationId,
        date, time, etaDate, etaTime,
        fleetType, selectedDriver, selectedVehicle,
        selectedCoDriver, coDriverPayoutInput, showCoDriver,
        selected3PLProvider, thirdPartyDriverName, thirdPartyDriverPhone,
        thirdPartyVehiclePlate, thirdPartyCostInput,
        billingAmountInput, driverPayoutInput, manualRateOverride,
        additionalCharges, saveAsPersistentQuotation, isRouteCollapsed,
        selectedMonthlyDates, monthlyAssignmentMode, dayAssignments,
      };
      try {
        await safeSecureStore.setItemAsync(DRAFT_STORAGE_KEY, JSON.stringify(draftState));
      } catch {
        // silent
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [
    hasSavedDraft, customerId, rateCategory, pickupName, pickupLat, pickupLng, pickupLocationId,
    dropoffName, dropoffLat, dropoffLng, dropoffLocationId, outboundStops,
    returnOriginName, returnOriginLat, returnOriginLng, returnOriginLocationId,
    returnDestinationName, returnDestinationLat, returnDestinationLng, returnDestinationLocationId,
    date, time, etaDate, etaTime, fleetType, selectedDriver, selectedVehicle,
    selectedCoDriver, coDriverPayoutInput, showCoDriver,
    selected3PLProvider, thirdPartyDriverName, thirdPartyDriverPhone,
    thirdPartyVehiclePlate, thirdPartyCostInput, billingAmountInput, driverPayoutInput,
    manualRateOverride, additionalCharges, saveAsPersistentQuotation, isRouteCollapsed, loadingOptions,
    selectedMonthlyDates, monthlyAssignmentMode, dayAssignments,
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
    if (d.returnOriginName) setReturnOriginName(d.returnOriginName);
    if (d.returnOriginLat) setReturnOriginLat(d.returnOriginLat);
    if (d.returnOriginLng) setReturnOriginLng(d.returnOriginLng);
    if (d.returnOriginLocationId) setReturnOriginLocationId(d.returnOriginLocationId);
    if (d.returnDestinationName) setReturnDestinationName(d.returnDestinationName);
    if (d.returnDestinationLat) setReturnDestinationLat(d.returnDestinationLat);
    if (d.returnDestinationLng) setReturnDestinationLng(d.returnDestinationLng);
    if (d.returnDestinationLocationId) setReturnDestinationLocationId(d.returnDestinationLocationId);
    if (d.date) setDate(d.date);
    if (d.time) setTime(d.time);
    if (d.etaDate) setEtaDate(d.etaDate);
    if (d.etaTime) setEtaTime(d.etaTime);
    if (d.fleetType) setFleetType(d.fleetType);
    if (d.selectedDriver) setSelectedDriver(d.selectedDriver);
    if (d.selectedVehicle) setSelectedVehicle(d.selectedVehicle);
    if (d.selectedCoDriver) setSelectedCoDriver(d.selectedCoDriver);
    if (d.coDriverPayoutInput) setCoDriverPayoutInput(d.coDriverPayoutInput);
    if (typeof d.showCoDriver === 'boolean') setShowCoDriver(d.showCoDriver);
    if (d.selected3PLProvider) setSelected3PLProvider(d.selected3PLProvider);
    if (d.thirdPartyDriverName) setThirdPartyDriverName(d.thirdPartyDriverName);
    if (d.thirdPartyDriverPhone) setThirdPartyDriverPhone(d.thirdPartyDriverPhone);
    if (d.thirdPartyVehiclePlate) setThirdPartyVehiclePlate(d.thirdPartyVehiclePlate);
    if (d.thirdPartyCostInput) setThirdPartyCostInput(d.thirdPartyCostInput);
    if (d.billingAmountInput) setBillingAmountInput(d.billingAmountInput);
    if (d.driverPayoutInput) setDriverPayoutInput(d.driverPayoutInput);
    if (typeof d.manualRateOverride === 'boolean') setManualRateOverride(d.manualRateOverride);
    if (Array.isArray(d.selectedMonthlyDates)) setSelectedMonthlyDates(d.selectedMonthlyDates);
    if (d.monthlyAssignmentMode) setMonthlyAssignmentMode(d.monthlyAssignmentMode);
    if (d.dayAssignments && typeof d.dayAssignments === 'object') setDayAssignments(d.dayAssignments);
    if (Array.isArray(d.additionalCharges)) setAdditionalCharges(d.additionalCharges);
    if (typeof d.saveAsPersistentQuotation === 'boolean') setSaveAsPersistentQuotation(d.saveAsPersistentQuotation);
    if (typeof d.isRouteCollapsed === 'boolean') setIsRouteCollapsed(d.isRouteCollapsed);
    setPage(1);
    setHasSavedDraft(false);
    setToastMessage('Unsaved trip draft restored successfully.');

    setToastType('success');
    setToastVisible(true);
  };

  const discardDraft = async () => {
    try {
      await safeSecureStore.deleteItemAsync(DRAFT_STORAGE_KEY);
    } catch {
      // silent
    }
    setHasSavedDraft(false);
    setSavedDraftData(null);
    setToastMessage('Draft discarded.');
    setToastType('info');
    setToastVisible(true);
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

    const normBType = normalizeBillingType(q.billing_type);
    setBillingType(normBType);
    if (q.pricing_basis === 'PER_MONTH' || q.pricing_basis === 'Per Month') {
      setPricingBasis('Per Month');
    } else {
      setPricingBasis('Per Trip');
    }

    const normCategory = (q.line_type ?? q.rate_category ?? '').toUpperCase();
    if (normCategory.includes('ROUND') || normCategory === 'ROUND_TRIP') {
      setRateCategory('ROUND_TRIP');
    } else if (normCategory.includes('10_HRS') || normCategory.includes('10 HRS') || normCategory.includes('10 HOURS')) {
      setRateCategory('10_HRS');
    } else if (normCategory.includes('12_HRS') || normCategory.includes('12 HRS') || normCategory.includes('12 HOURS')) {
      setRateCategory('12_HRS');
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
        } else if (normCategory.includes('10_HRS') || normCategory.includes('10 HRS') || normCategory.includes('10 HOURS')) {
          setRateCategory('10_HRS');
        } else if (normCategory.includes('12_HRS') || normCategory.includes('12 HRS') || normCategory.includes('12 HOURS')) {
          setRateCategory('12_HRS');
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
    if (rateCategory === 'ROUND_TRIP') {
      if (!returnOriginName.trim() && !dropoffName.trim()) {
        errors.returnOriginName = 'Return origin location is required for round trips';
        isValid = false;
      }
      if (!returnDestinationName.trim() && !pickupName.trim()) {
        errors.returnDestinationName = 'Return destination location is required for round trips';
        isValid = false;
      }
    }
    if (billingType === 'Monthly' && selectedMonthlyDates.length === 0) {
      errors.monthlyDates = 'Please select at least one calendar day for this monthly trip schedule';
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
      if (Number.isNaN(effective3PLCost) || effective3PLCost <= 0) {
        errors.thirdPartyCost = 'Agreed subcontractor cost is required and must be greater than 0';
        isValid = false;
      } else { delete errors.thirdPartyCost; }
    } else {
      if (manualRateOverride && (Number.isNaN(effectiveDriverPayout) || effectiveDriverPayout < 0)) {
        errors.driverPayout = 'Driver payout is required';
        isValid = false;
      } else { delete errors.driverPayout; }
    }

    const plannedPickup = parseDateTime(date, time);
    const plannedDropoff = parseDateTime(etaDate, etaTime);
    if (plannedPickup && plannedDropoff && plannedDropoff <= plannedPickup) {
      errors.deliveryDue = 'Delivery due date & time must be after the departure time';
      isValid = false;
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

    // Past date check (Single trips & Monthly schedule dates)
    let isPastDate = false;
    if (billingType === 'Monthly') {
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      isPastDate = selectedMonthlyDates.some((dStr) => {
        const dTs = new Date(`${dStr}T00:00:00`).getTime();
        return !Number.isNaN(dTs) && dTs < cutoff;
      });
    } else {
      const plannedPickup = parseDateTime(date, time);
      if (plannedPickup && new Date(plannedPickup).getTime() < Date.now() - 5 * 60 * 1000) {
        isPastDate = true;
      }
    }

    if (isPastDate) {
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
        const retOrigName = returnOriginName.trim() || dropoffName.trim() || 'Return Origin';
        const retDestName = returnDestinationName.trim() || pickupName.trim() || 'Return Destination';
        const retOrigLat = parseFloat(returnOriginLat) || dropoffLatNum || 0;
        const retOrigLng = parseFloat(returnOriginLng) || dropoffLngNum || 0;
        const retDestLat = parseFloat(returnDestinationLat) || pickupLatNum || 0;
        const retDestLng = parseFloat(returnDestinationLng) || pickupLngNum || 0;

        // Return Leg Pickup (Leg #1)
        stopsPayload.push({
          stop_type: 'Pickup',
          leg_index: 1,
          lat: retOrigLat,
          lng: retOrigLng,
          planned_arrival: plannedDropoff,
          location_name: retOrigName,
          location_id: returnOriginLocationId || dropoffLocationId,
        });

        // Return Leg Dropoff (Leg #1)
        stopsPayload.push({
          stop_type: 'Dropoff',
          leg_index: 1,
          lat: retDestLat,
          lng: retDestLng,
          planned_arrival: plannedDropoff
            ? new Date(new Date(plannedDropoff).getTime() + (travelEstimate?.durationMinutes || 240) * 60000).toISOString()
            : undefined,
          location_name: retDestName,
          location_id: returnDestinationLocationId || pickupLocationId,
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

      if (billingType === 'Monthly') {
        if (selectedMonthlyDates.length === 0) {
          Alert.alert('Monthly Schedule Required', 'Please select at least one calendar day for this monthly trip schedule.');
          setSubmitting(false);
          return;
        }

        const masterDriverId = fleetType === 'OWN_FLEET' && selectedDriver && selectedDriver !== ASSIGN_LATER ? selectedDriver : undefined;
        const masterVehicleId = fleetType === 'OWN_FLEET' && selectedVehicle && selectedVehicle !== ASSIGN_LATER ? selectedVehicle : undefined;
        const masterCoDriverId = fleetType === 'OWN_FLEET' && showCoDriver && selectedCoDriver && selectedCoDriver !== ASSIGN_LATER ? selectedCoDriver : undefined;
        const masterCoDriverPayout = fleetType === 'OWN_FLEET' && showCoDriver && coDriverPayoutInput ? (parseFloat(coDriverPayoutInput) || undefined) : undefined;

        const durationMs = (travelEstimate?.durationMinutes || 240) * 60000;

        const bulkRows: any[] = selectedMonthlyDates.map((dateStr) => {
          const override = dayAssignments[dateStr];

          const dDriver = override?.driver_id !== undefined ? (override.driver_id || undefined) : masterDriverId;
          const dVehicle = override?.vehicle_id !== undefined ? (override.vehicle_id || undefined) : masterVehicleId;
          const dCoDriver = override?.co_driver_id !== undefined ? (override.co_driver_id || undefined) : masterCoDriverId;
          const dCoDriverPayout = override?.co_driver_payout !== undefined ? override.co_driver_payout : masterCoDriverPayout;

          const dayStartIso = new Date(`${dateStr}T${time || '08:00'}:00`).toISOString();
          const dayEndIso = new Date(new Date(dayStartIso).getTime() + durationMs).toISOString();

          const dayStops = stopsPayload.map((s) => ({
            ...s,
            planned_arrival: s.stop_type === 'Pickup' ? dayStartIso : s.stop_type === 'Dropoff' ? dayEndIso : s.planned_arrival,
          }));

          return {
            customer_id: customerId,
            driver_id: dDriver,
            vehicle_id: dVehicle,
            co_driver_id: dCoDriver,
            co_driver_payout: dCoDriverPayout,
            planned_start: dayStartIso,
            planned_end: dayEndIso,
            billing_amount: effectiveBillingAmount,
            trip_charges: fleetType === 'OWN_FLEET' ? effectiveDriverPayout : undefined,
            rate_card_id: resolvedRateCardId,
            vehicle_type: selectedVehicleObj?.asset_type ?? selectedQuotation?.vehicle_type ?? selectedQuotation?.vehicle_class ?? undefined,
            rate_category: rateCategory,
            billing_type: 'Monthly',
            status: isCompletedPastDate ? 'Completed' : 'Scheduled',
            is_third_party: fleetType === 'THIRD_PARTY',
            third_party_provider_id: fleetType === 'THIRD_PARTY' && selected3PLProvider ? selected3PLProvider : undefined,
            third_party_driver_name: fleetType === 'THIRD_PARTY' ? thirdPartyDriverName : undefined,
            third_party_driver_phone: fleetType === 'THIRD_PARTY' ? thirdPartyDriverPhone : undefined,
            third_party_vehicle_plate: fleetType === 'THIRD_PARTY' ? thirdPartyVehiclePlate : undefined,
            third_party_cost: fleetType === 'THIRD_PARTY' ? effective3PLCost : undefined,
            charges: formattedCharges,
            stops: dayStops,
          };
        });

        const bulkRes = await operatorService.bulkCreateTrips(bulkRows);
        await saveRecentRoute({
          originName: pickupName.trim(),
          originLat: pickupLat,
          originLng: pickupLng,
          originLocationId: pickupLocationId,
          destName: dropoffName.trim(),
          destLat: dropoffLat,
          destLng: dropoffLng,
          destLocationId: dropoffLocationId,
        });
        setToastMessage(`${bulkRes.imported ?? bulkRows.length} Monthly Duty trips created successfully!`);
        setToastType('success');
        setToastVisible(true);
        await discardDraft();
        invalidateOperatorTrips();
        router.back();
        return;
      }

      const created = await operatorService.createTrip({
        customer_id: customerId,
        driver_id: fleetType === 'OWN_FLEET' && selectedDriver && selectedDriver !== ASSIGN_LATER ? selectedDriver : undefined,
        vehicle_id: fleetType === 'OWN_FLEET' && selectedVehicle && selectedVehicle !== ASSIGN_LATER ? selectedVehicle : undefined,
        co_driver_id: fleetType === 'OWN_FLEET' && showCoDriver && selectedCoDriver && selectedCoDriver !== ASSIGN_LATER ? selectedCoDriver : undefined,
        co_driver_payout: fleetType === 'OWN_FLEET' && showCoDriver && coDriverPayoutInput ? (parseFloat(coDriverPayoutInput) || undefined) : undefined,
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

      await saveRecentRoute({
        originName: pickupName.trim(),
        originLat: pickupLat,
        originLng: pickupLng,
        originLocationId: pickupLocationId,
        destName: dropoffName.trim(),
        destLat: dropoffLat,
        destLng: dropoffLng,
        destLocationId: dropoffLocationId,
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
  const selectedCoDriverObj = drivers.find((d) => d.id === selectedCoDriver);
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
                      {/* Quotation Billing Type Filter */}
                      <View style={{ marginBottom: Spacing.xs }}>
                        <Text style={styles.miniPickerLabel}>Quotation Billing Type</Text>
                        <View style={styles.segmentedContainer}>
                          {(['ALL', 'Monthly', 'Extra'] as const).map((filterOpt) => {
                            const isActive = quotationBillingFilter === filterOpt;
                            return (
                              <TouchableOpacity
                                key={filterOpt}
                                style={[styles.segmentedBtn, isActive && styles.segmentedBtnActive]}
                                onPress={() => {
                                  setQuotationBillingFilter(filterOpt);
                                  if (filterOpt === 'Monthly') {
                                    setBillingType('Monthly');
                                  } else if (filterOpt === 'Extra') {
                                    setBillingType('Extra');
                                  }
                                }}
                              >
                                <Text style={[styles.segmentedBtnText, isActive && styles.segmentedBtnTextActive]}>
                                  {filterOpt === 'ALL' ? 'All Rates' : filterOpt === 'Monthly' ? 'Monthly Duty' : 'Spot / Extra'}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>

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
                              : `No rate cards matching ${
                                  quotationBillingFilter !== 'ALL' ? `${quotationBillingFilter} filter` : 'search'
                                }${quotationSearchQuery ? ` "${quotationSearchQuery}"` : ''}`}
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

              {/* Monthly Duty Schedule Calendar Selector */}
              {billingType === 'Monthly' && (
                <>
                  <Text style={styles.sectionTitle}>Monthly Duty Calendar Schedule</Text>
                  <MonthlyCalendarSelector
                    selectedDates={selectedMonthlyDates}
                    onToggleDate={handleToggleMonthlyDate}
                    onSelectAllWeekdays={handleSelectAllWeekdays}
                    onSelectAllDays={handleSelectAllDays}
                    onClearAll={handleClearMonthlyDates}
                    currentMonth={monthlyCurrentMonth}
                    onMonthChange={setMonthlyCurrentMonth}
                    assignmentMode={monthlyAssignmentMode}
                    onToggleAssignmentMode={setMonthlyAssignmentMode}
                    dayAssignments={dayAssignments}
                    onSaveDayOverride={handleSaveDayOverride}
                    drivers={drivers}
                    vehicles={vehicles}
                    masterDriverId={selectedDriver}
                    masterVehicleId={selectedVehicle}
                    masterCoDriverId={selectedCoDriver}
                  />
                </>
              )}

              {/* Section 2: Route & Multi-Stop Configuration */}
              <Text style={styles.sectionTitle}>2. Route & Multi-Stop Configuration</Text>
              <Card style={styles.formCard}>
                {/* Recent Routes Accelerator Chips */}
                {savedRecentRoutes.length > 0 && (
                  <View style={{ marginBottom: Spacing.sm }}>
                    <Text style={styles.acceleratorTitle}>Recent Routes</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                      {savedRecentRoutes.map((rr) => (
                        <TouchableOpacity
                          key={rr.id}
                          style={styles.acceleratorChip}
                          onPress={() => handleSelectRecentRoute(rr)}
                        >
                          <Clock size={12} color={Colors.primary} />
                          <Text style={styles.acceleratorChipText}>
                            {rr.originName} → {rr.destName}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {/* 4 Line Types Selector Grid */}
                <View style={styles.lineTypeGrid}>
                  {([
                    { id: 'SINGLE_TRIP', label: 'Single Trip' },
                    { id: 'ROUND_TRIP', label: 'Round Trip' },
                    { id: '10_HRS', label: '10 Hours Duty' },
                    { id: '12_HRS', label: '12 Hours Duty' },
                  ] as const).map((opt) => (
                    <TouchableOpacity
                      key={opt.id}
                      style={[styles.lineTypeBtn, rateCategory === opt.id && styles.lineTypeBtnActive]}
                      onPress={() => setRateCategory(opt.id as RateCategoryType)}
                    >
                      <Text style={[styles.lineTypeText, rateCategory === opt.id && styles.lineTypeTextActive]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Inline Transit Time Badge */}
                {pickupName.trim() && dropoffName.trim() ? (
                  <View style={styles.transitBadgeContainer}>
                    {estimatingTime ? (
                      <View style={styles.transitBadgePill}>
                        <ActivityIndicator size="small" color={Colors.primary} />
                        <Text style={styles.transitBadgeText}>Calculating transit...</Text>
                      </View>
                    ) : travelEstimate ? (
                      <View style={styles.transitBadgePill}>
                        <Clock size={14} color={Colors.primary} strokeWidth={2.5} />
                        <Text style={styles.transitBadgeText}>
                          Transit: <Text style={{ fontWeight: '800' }}>{travelEstimate.durationText}</Text>
                        </Text>
                        <Text style={styles.transitDistanceText}>({travelEstimate.distanceKm} km)</Text>
                      </View>
                    ) : (
                      <View style={styles.transitBadgeFallback}>
                        <Clock size={14} color={Colors.gray500} strokeWidth={2} />
                        <Text style={styles.transitBadgeFallbackText}>Est. 4h 00m (Fallback Estimate)</Text>
                      </View>
                    )}
                  </View>
                ) : null}

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

                {/* Explicit Return Leg Configuration Card (When ROUND_TRIP is selected) */}
                {rateCategory === 'ROUND_TRIP' && (
                  <View style={styles.returnLegContainer}>
                    <View style={styles.returnLegHeader}>
                      <RotateCcw size={15} color="#4F46E5" strokeWidth={2.4} />
                      <Text style={styles.returnLegTitle}>Return Leg (Leg #2)</Text>
                    </View>

                    <View style={styles.formGroup}>
                      <Input
                        label="Return Origin Location Name"
                        value={returnOriginName || dropoffName}
                        onChangeText={setReturnOriginName}
                        placeholder="Defaults to outbound dropoff location"
                      />
                      <View style={styles.rowFields}>
                        <Input
                          style={{ flex: 1 }}
                          value={returnOriginLat || dropoffLat}
                          onChangeText={setReturnOriginLat}
                          placeholder="Return Origin Lat"
                          keyboardType="numeric"
                        />
                        <Input
                          style={{ flex: 1 }}
                          value={returnOriginLng || dropoffLng}
                          onChangeText={setReturnOriginLng}
                          placeholder="Return Origin Lng"
                          keyboardType="numeric"
                        />
                      </View>
                    </View>

                    <View style={styles.formGroup}>
                      <Input
                        label="Return Destination Location Name"
                        value={returnDestinationName || pickupName}
                        onChangeText={setReturnDestinationName}
                        placeholder="Defaults to outbound pickup location"
                      />
                      <View style={styles.rowFields}>
                        <Input
                          style={{ flex: 1 }}
                          value={returnDestinationLat || pickupLat}
                          onChangeText={setReturnDestinationLat}
                          placeholder="Return Dest Lat"
                          keyboardType="numeric"
                        />
                        <Input
                          style={{ flex: 1 }}
                          value={returnDestinationLng || pickupLng}
                          onChangeText={setReturnDestinationLng}
                          placeholder="Return Dest Lng"
                          keyboardType="numeric"
                        />
                      </View>
                    </View>
                  </View>
                )}
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

              {/* Section 6: Fleet & Execution Assignment (Own Fleet vs 3PL) */}
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
                    {/* PRIMARY DRIVER HEADER & RECOMMENDED vs ASSIGNED CARD */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                      <Text style={styles.label}>
                        {selectedDriver && selectedDriver !== ASSIGN_LATER ? 'ASSIGNED PRIMARY DRIVER' : 'RECOMMENDED DRIVERS'}
                      </Text>
                      {selectedDriver ? (
                        <TouchableOpacity
                          onPress={() => {
                            setSelectedDriver('');
                            setDriverSearchQuery('');
                          }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.primary }}>Change Driver</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>

                    {/* ASSIGNED DRIVER PROFILE CARD */}
                    {selectedDriver && selectedDriver !== ASSIGN_LATER && selectedDriverObj ? (
                      <View style={styles.assignedDriverCard}>
                        <DriverAvatar
                          initials={`${selectedDriverObj.first_name[0]}${selectedDriverObj.last_name[0]}`}
                          avatarUrl={selectedDriverObj.avatar_url || selectedDriverObj.photo_url}
                          size={46}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.assignedDriverName}>{selectedDriverObj.first_name} {selectedDriverObj.last_name}</Text>
                          <Text style={styles.assignedDriverSubtext}>
                            {selectedDriverObj.assigned_vehicle?.plate_number
                              ? `Truck: ${selectedDriverObj.assigned_vehicle.plate_number}`
                              : selectedDriverObj.phone_primary ?? selectedDriverObj.license_number}
                          </Text>
                        </View>
                        <StatusBadge status="Available" />
                      </View>
                    ) : selectedDriver === ASSIGN_LATER ? (
                      <View style={styles.assignedDriverCard}>
                        <View style={[styles.driverAvatar, styles.vehicleAvatarBg]}>
                          <Clock size={20} color={Colors.gray600} strokeWidth={2} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.assignedDriverName}>Assign Later</Text>
                          <Text style={styles.assignedDriverSubtext}>Dispatch driver later after booking</Text>
                        </View>
                      </View>
                    ) : (
                      /* UNSELECTED STATE: RECOMMENDED DRIVER CARDS */
                      <View style={styles.recommendedCardsRow}>
                        {recommendedDrivers.length === 0 ? (
                          <Text style={{ fontSize: 12, color: Colors.gray500 }}>No drivers available</Text>
                        ) : (
                          recommendedDrivers.map((rd) => (
                            <TouchableOpacity
                              key={rd.id}
                              style={styles.recommendedDriverCard}
                              activeOpacity={0.8}
                              onPress={() => setSelectedDriver(rd.id)}
                            >
                              <DriverAvatar
                                initials={`${rd.first_name[0]}${rd.last_name[0]}`}
                                avatarUrl={rd.avatar_url || rd.photo_url}
                                size={40}
                              />
                              <Text style={styles.recommendedDriverName} numberOfLines={1}>
                                {rd.first_name} {rd.last_name}
                              </Text>
                              <Text style={styles.recommendedDriverSubtext} numberOfLines={1}>
                                {rd.assigned_vehicle?.plate_number
                                  ? `Truck: ${rd.assigned_vehicle.plate_number}`
                                  : rd.phone_primary ?? 'Available'}
                              </Text>
                            </TouchableOpacity>
                          ))
                        )}
                      </View>
                    )}

                    {/* SEARCHABLE PRIMARY DRIVER PICKER */}
                    <Text style={styles.label}>Select Primary Driver</Text>
                    <View style={styles.searchBarContainer}>
                      <Search size={16} color={Colors.gray500} />
                      <TextInput
                        style={styles.searchBarInput}
                        value={driverSearchQuery}
                        onChangeText={setDriverSearchQuery}
                        placeholder="Search driver name, phone, license..."
                        placeholderTextColor={Colors.gray400}
                      />
                      {driverSearchQuery ? (
                        <TouchableOpacity onPress={() => setDriverSearchQuery('')}>
                          <X size={16} color={Colors.gray500} />
                        </TouchableOpacity>
                      ) : null}
                    </View>

                    <Card style={{ ...styles.pickerCard, maxHeight: 180 }}>
                      <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                        <TouchableOpacity
                          style={[styles.driverItem, selectedDriver === ASSIGN_LATER ? styles.driverItemActive : null]}
                          onPress={() => setSelectedDriver(ASSIGN_LATER)}
                        >
                          <View style={[styles.driverAvatar, styles.vehicleAvatarBg]}>
                            <Clock size={18} color={Colors.gray600} strokeWidth={2} />
                          </View>
                          <View style={styles.driverInfo}>
                            <Text style={styles.driverName}>Assign Later</Text>
                            <Text style={styles.driverId}>Dispatch driver later</Text>
                          </View>
                          {selectedDriver === ASSIGN_LATER && <Check size={18} color={Colors.primary} strokeWidth={3} />}
                        </TouchableOpacity>

                        {filteredDrivers.map((driver) => (
                          <TouchableOpacity
                            key={driver.id}
                            style={[styles.driverItem, selectedDriver === driver.id ? styles.driverItemActive : null]}
                            onPress={() => setSelectedDriver(driver.id)}
                          >
                            <DriverAvatar
                              initials={`${driver.first_name[0]}${driver.last_name[0]}`}
                              avatarUrl={driver.avatar_url || driver.photo_url}
                              size={34}
                            />
                            <View style={styles.driverInfo}>
                              <Text style={styles.driverName}>{driver.first_name} {driver.last_name}</Text>
                              <Text style={styles.driverId}>{driver.phone_primary ?? driver.ref_id ?? driver.license_number}</Text>
                            </View>
                            <StatusBadge status="Available" />
                            {selectedDriver === driver.id && <Check size={18} color={Colors.primary} strokeWidth={3} style={{ marginLeft: 6 }} />}
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </Card>

                    {/* CO-DRIVER / RELIEVER AFFORDANCE */}
                    {showCoDriver ? (
                      <View style={styles.coDriverContainer}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={styles.coDriverTitle}>CO-DRIVER / RELIEVER</Text>
                          <TouchableOpacity
                            onPress={() => {
                              setSelectedCoDriver('');
                              setCoDriverPayoutInput('');
                              setShowCoDriver(false);
                            }}
                          >
                            <Trash2 size={16} color={Colors.error} />
                          </TouchableOpacity>
                        </View>

                        <View style={styles.searchBarContainer}>
                          <Search size={16} color={Colors.gray500} />
                          <TextInput
                            style={styles.searchBarInput}
                            value={coDriverSearchQuery}
                            onChangeText={setCoDriverSearchQuery}
                            placeholder="Search co-driver name, phone..."
                            placeholderTextColor={Colors.gray400}
                          />
                          {coDriverSearchQuery ? (
                            <TouchableOpacity onPress={() => setCoDriverSearchQuery('')}>
                              <X size={16} color={Colors.gray500} />
                            </TouchableOpacity>
                          ) : null}
                        </View>

                        <Card style={{ ...styles.pickerCard, maxHeight: 150 }}>
                          <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                            {filteredCoDrivers.length === 0 ? (
                              <Text style={{ padding: Spacing.md, fontSize: 12, color: Colors.gray500 }}>No available co-drivers</Text>
                            ) : (
                              filteredCoDrivers.map((cd) => (
                                <TouchableOpacity
                                  key={cd.id}
                                  style={[styles.driverItem, selectedCoDriver === cd.id ? styles.driverItemActive : null]}
                                  onPress={() => setSelectedCoDriver(cd.id)}
                                >
                                  <DriverAvatar
                                    initials={`${cd.first_name[0]}${cd.last_name[0]}`}
                                    avatarUrl={cd.avatar_url || cd.photo_url}
                                    size={32}
                                  />
                                  <View style={styles.driverInfo}>
                                    <Text style={styles.driverName}>{cd.first_name} {cd.last_name}</Text>
                                    <Text style={styles.driverId}>{cd.phone_primary ?? cd.license_number}</Text>
                                  </View>
                                  {selectedCoDriver === cd.id && <Check size={18} color={Colors.primary} strokeWidth={3} />}
                                </TouchableOpacity>
                              ))
                            )}
                          </ScrollView>
                        </Card>

                        <Input
                          label="Co-Driver Payout Override (SAR)"
                          value={coDriverPayoutInput}
                          onChangeText={setCoDriverPayoutInput}
                          placeholder="Optional (Default: 50/50 split)"
                          keyboardType="numeric"
                        />
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.addCoDriverBtn}
                        onPress={() => setShowCoDriver(true)}
                      >
                        <UserPlus size={15} color="#10B981" strokeWidth={2.4} />
                        <Text style={styles.addCoDriverBtnText}>Add Co-Driver / Reliever</Text>
                      </TouchableOpacity>
                    )}

                    {/* SEARCHABLE PRIMARY VEHICLE PICKER */}
                    <Text style={styles.label}>Vehicle Assignment</Text>
                    <View style={styles.searchBarContainer}>
                      <Search size={16} color={Colors.gray500} />
                      <TextInput
                        style={styles.searchBarInput}
                        value={vehicleSearchQuery}
                        onChangeText={setVehicleSearchQuery}
                        placeholder="Search plate, asset code..."
                        placeholderTextColor={Colors.gray400}
                      />
                      {vehicleSearchQuery ? (
                        <TouchableOpacity onPress={() => setVehicleSearchQuery('')}>
                          <X size={16} color={Colors.gray500} />
                        </TouchableOpacity>
                      ) : null}
                    </View>

                    <Card style={{ ...styles.pickerCard, maxHeight: 180 }}>
                      <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                        <TouchableOpacity
                          style={[styles.driverItem, selectedVehicle === ASSIGN_LATER ? styles.driverItemActive : null]}
                          onPress={() => setSelectedVehicle(ASSIGN_LATER)}
                        >
                          <View style={[styles.driverAvatar, styles.vehicleAvatarBg]}>
                            <Clock size={18} color={Colors.gray600} strokeWidth={2} />
                          </View>
                          <View style={styles.driverInfo}>
                            <Text style={styles.driverName}>Assign Later</Text>
                            <Text style={styles.driverId}>Assign vehicle later</Text>
                          </View>
                          {selectedVehicle === ASSIGN_LATER && <Check size={18} color={Colors.primary} strokeWidth={3} />}
                        </TouchableOpacity>

                        {filteredVehicles.map((v) => (
                          <TouchableOpacity
                            key={v.id}
                            style={[styles.driverItem, selectedVehicle === v.id ? styles.driverItemActive : null]}
                            onPress={() => setSelectedVehicle(v.id)}
                          >
                            <View style={[styles.driverAvatar, styles.vehicleAvatarBg]}>
                              <Truck size={20} color={Colors.primary} strokeWidth={2} />
                            </View>
                            <View style={styles.driverInfo}>
                              <Text style={styles.driverName}>{v.plate_number}</Text>
                              <Text style={styles.driverId}>{v.asset_type}</Text>
                            </View>
                            <StatusBadge status="Available" />
                            {selectedVehicle === v.id && <Check size={18} color={Colors.primary} strokeWidth={3} style={{ marginLeft: 6 }} />}
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
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
                <Text style={styles.reviewSubtext}>Billing Type: {billingType === 'Monthly' ? 'Monthly Duty Schedule' : 'Spot / Extra'}</Text>
              </View>

              {billingType === 'Monthly' && (
                <View style={styles.reviewSection}>
                  <Text style={styles.reviewHeading}>Monthly Duty Schedule Summary</Text>
                  <Text style={styles.reviewText}>
                    {selectedMonthlyDates.length} Trips across {monthlyCurrentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </Text>
                  <Text style={styles.reviewSubtext}>
                    Assignment Mode: {monthlyAssignmentMode === 'PER_DAY' ? 'Per-Day Overrides' : 'Master Assignment'}
                  </Text>
                  {Object.keys(dayAssignments).length > 0 && (
                    <Text style={[styles.reviewSubtext, { color: Colors.primary, fontWeight: '700', marginTop: 2 }]}>
                      {Object.keys(dayAssignments).length} date(s) with custom driver/truck overrides
                    </Text>
                  )}
                </View>
              )}

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
                    {showCoDriver && selectedCoDriverObj && (
                      <Text style={styles.reviewSubtext}>
                        Co-Driver: {selectedCoDriverObj.first_name} {selectedCoDriverObj.last_name} ({coDriverPayoutInput ? `SAR ${coDriverPayoutInput}` : '50/50 Split'})
                      </Text>
                    )}
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

      <Toast
        visible={toastVisible}
        message={toastMessage}
        type={toastType}
        onDismiss={() => setToastVisible(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  lineTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  lineTypeBtn: {
    flex: 1,
    minWidth: '45%',
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.lg,
    backgroundColor: Colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  lineTypeBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  lineTypeText: {
    fontSize: Typography.xs,
    fontWeight: '700',
    color: Colors.gray700,
  },
  lineTypeTextActive: {
    color: Colors.white,
    fontWeight: '800',
  },
  transitBadgeContainer: {
    marginBottom: Spacing.md,
  },
  transitBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(250, 99, 78, 0.08)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(250, 99, 78, 0.25)',
    alignSelf: 'flex-start',
  },
  transitBadgeText: {
    fontSize: Typography.xs,
    fontWeight: '600',
    color: Colors.primary,
  },
  transitDistanceText: {
    fontSize: Typography.xs,
    fontWeight: '800',
    color: Colors.primary,
  },
  transitBadgeFallback: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.gray100,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
  },
  transitBadgeFallbackText: {
    fontSize: Typography.xs,
    fontWeight: '600',
    color: Colors.gray600,
  },
  returnLegContainer: {
    backgroundColor: 'rgba(79, 70, 229, 0.04)',
    padding: Spacing.md,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(79, 70, 229, 0.2)',
    marginTop: Spacing.md,
    gap: Spacing.md,
  },
  returnLegHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  returnLegTitle: {
    fontSize: Typography.xs,
    fontWeight: '800',
    color: '#4F46E5',
    textTransform: 'uppercase',
  },

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

  assignedDriverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.gray300,
    marginBottom: Spacing.sm,
  },
  assignedDriverName: {
    fontSize: Typography.sm,
    fontWeight: '800',
    color: Colors.gray900,
  },
  assignedDriverSubtext: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.gray500,
    marginTop: 1,
  },
  recommendedCardsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  recommendedDriverCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  recommendedDriverName: {
    fontSize: Typography.xs,
    fontWeight: '700',
    color: Colors.gray900,
    textAlign: 'center',
  },
  recommendedDriverSubtext: {
    fontSize: 10,
    color: Colors.gray500,
    textAlign: 'center',
  },
  coDriverContainer: {
    backgroundColor: 'rgba(16, 185, 129, 0.04)',
    padding: Spacing.md,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    marginVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  coDriverTitle: {
    fontSize: Typography.xs,
    fontWeight: '800',
    color: '#059669',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addCoDriverBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    alignSelf: 'flex-start',
    marginVertical: Spacing.xs,
  },
  addCoDriverBtnText: {
    fontSize: Typography.xs,
    fontWeight: '700',
    color: '#059669',
  },
});

export default CreateTripScreen;

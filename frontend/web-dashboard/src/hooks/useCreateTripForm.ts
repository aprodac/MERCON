import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { cn, isUuid } from '@/lib/utils';
import { customerService } from '@/services/customerService';
import { driverService, Driver } from '@/services/driverService';
import { vehicleService, Vehicle } from '@/services/vehicleService';
import { thirdPartyService, ThirdPartyProvider } from '@/services/thirdPartyService';
import { tripService, BulkImportTripRow, BulkImportResult, TripStatus, Trip } from '@/services/tripService';
import { quotationService, RateCard } from '@/services/quotationService';
import { estimateTravelTimeByName, calculateArrivalDropoffTime } from '@/services/travelTimeService';
import { useDeploymentTimezone, localDateTimeToUtcIso } from '@/lib/datetime';
import { VEHICLE_TYPES, RATE_CATEGORIES, isRoundTripCategory } from '@mercon/shared-types';
import { parseSheet, TRIP_COLUMNS } from '@/utils/importUtils';
import { analyzePastDateRows, applyPastStatusToRows, PastDateAnalysis } from '@/utils/pastDateTripUtils';
import { getCompatibilityRuleForClass } from '@/utils/vehicleCompatibilityRegistry';
import { useFormKeyboardShortcuts } from '@/hooks/useFormKeyboardShortcuts';
import { ComboboxOption } from '@/components/ui/combobox';
import { useTripBatchGridState } from '@/hooks/useTripBatchGridState';
import { useTripFileImportState } from '@/hooks/useTripFileImportState';
import { useTripRateLookup } from '@/hooks/useTripRateLookup';
import { useTripSlotsState } from '@/hooks/useTripSlotsState';
import { useTripDraftStorage } from '@/hooks/useTripDraftStorage';
import { useTripSubmission } from '@/hooks/useTripSubmission';
import { useTripAccelerators } from '@/hooks/useTripAccelerators';
import { formatDriverDetails } from '@/utils/driverStatusUtils';

export const addDays = (dateStr: string, days: number): string => {
  if (!dateStr) return dateStr;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

export const LOCAL_TRIP_CHARGE_PRESETS = [
  { label: 'Local 10 Hrs', amount: 60 },
  { label: 'Local Single Trip', amount: 35 },
  { label: 'Local Airport', amount: 45 },
];

const REMOVED_MODAL_CATEGORIES = ['10 Hrs Duty', '12 Hrs Duty'];
export const MODAL_RATE_CATEGORIES = RATE_CATEGORIES.filter(
  (cat) => !REMOVED_MODAL_CATEGORIES.includes(cat as any)
).map((cat) => ((cat as any) === 'Trip/Round Trip' ? 'Round Trip' : cat));

export { isRoundTripCategory };

export const getVehicleTypeFromCapacity = (capacityKg?: number | null): string => {
  if (capacityKg == null || capacityKg <= 0) return '40 FEET';
  const tons = capacityKg / 1000;
  if (tons <= 4) return '3-4 TON';
  if (tons <= 5) return '5 TON';
  if (tons <= 10) return '10 TON';
  if (tons <= 20) return '20 TON';
  return '40 FEET';
};

import {
  normalizeBillingType,
  normalizeRateCategory,
  normalizeVehicleClass,
} from '@/utils/taxonomyRegistry';

export {
  normalizeBillingType,
  normalizeRateCategory,
  normalizeVehicleClass,
};

export const getActualCapacityLabel = (capacityKg?: number | null): string => {
  if (capacityKg == null || capacityKg <= 0) return '';
  const tons = capacityKg / 1000;
  return Number.isInteger(tons) ? `${tons} TON` : `${tons.toFixed(1)} TON`;
};

export type TabMode = 'contract' | 'grid' | 'file';

export interface GridTripRow {
  id: string;
  customerId: string;
  date: string;
  driverId: string;
  vehicleId: string;
  rateCategory: string;
  vehicleType: string;
  origin: string;
  destination: string;
  amount: string;
}

export function useCreateTripForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tz = useDeploymentTimezone();

  const [activeTab, setActiveTab] = useState<TabMode>('contract');
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);

  // Master Data Queries
  const { data: customersRes } = useQuery({
    queryKey: ['customers-select'],
    queryFn: () => customerService.getAll({ per_page: 150 }),
    refetchOnMount: 'always',
  });

  const { data: driversRes } = useQuery({
    queryKey: ['drivers-select'],
    queryFn: () => driverService.getAll({ per_page: 1000, mode: 'lookup' }),
    refetchOnMount: 'always',
  });

  const { data: vehiclesRes } = useQuery({
    queryKey: ['vehicles-select'],
    queryFn: () => vehicleService.getAll({ per_page: 1000, mode: 'lookup' }),
    refetchOnMount: 'always',
  });

  const { data: thirdPartyRes } = useQuery({
    queryKey: ['third-party-providers-select'],
    queryFn: () => thirdPartyService.getAll({ per_page: 1000 }),
    refetchOnMount: 'always',
  });

  const customers = Array.isArray(customersRes?.data)
    ? customersRes.data
    : Array.isArray(customersRes)
    ? (customersRes as any)
    : [];

  const rawDriversData = (driversRes as any)?.data;
  const drivers: Driver[] = Array.isArray(rawDriversData)
    ? rawDriversData
    : Array.isArray(rawDriversData?.data)
    ? rawDriversData.data
    : Array.isArray(driversRes)
    ? (driversRes as any)
    : [];

  const vehicles: Vehicle[] = Array.isArray(vehiclesRes?.data)
    ? vehiclesRes.data
    : Array.isArray(vehiclesRes)
    ? (vehiclesRes as any)
    : [];

  const thirdPartyProviders: ThirdPartyProvider[] = Array.isArray(thirdPartyRes?.data?.data)
    ? thirdPartyRes.data.data
    : Array.isArray(thirdPartyRes?.data)
    ? (thirdPartyRes.data as any)
    : Array.isArray(thirdPartyRes)
    ? (thirdPartyRes as any)
    : [];

  const customerOptions = useMemo<ComboboxOption[]>(() => {
    return customers.map((c: any) => ({
      value: c.id,
      label: c.name,
      keywords: `${c.name} ${c.phone || ''} ${c.payment_terms || ''}`,
    }));
  }, [customers]);

  const [searchParams] = useSearchParams();
  const urlAssignmentInit = searchParams.get('assignment');
  const initialAssignment = (urlAssignmentInit?.toLowerCase() === 'third_party' || urlAssignmentInit?.toLowerCase() === '3pl') ? 'third_party' : 'own';
  const [assignmentType, setAssignmentType] = useState<'own' | 'third_party'>(initialAssignment);
  const [masterDriver, setMasterDriver] = useState('');
  const [masterCoDriver, setMasterCoDriver] = useState('');
  const [masterVehicle, setMasterVehicle] = useState('');
  const [isVehicleTypeEditable, setIsVehicleTypeEditable] = useState(false);
  const [isCustomThirdPartyVehicleType, setIsCustomThirdPartyVehicleType] = useState(false);
  const [isManualRateOverride, setIsManualRateOverride] = useState(false);

  const [thirdPartyProviderId, setThirdPartyProviderId] = useState('');
  const [thirdPartyDriverName, setThirdPartyDriverName] = useState('');
  const [thirdPartyDriverPhone, setThirdPartyDriverPhone] = useState('');
  const [thirdPartyVehiclePlate, setThirdPartyVehiclePlate] = useState('');
  const [thirdPartyCost, setThirdPartyCost] = useState('');
  const [awbNumber, setAwbNumber] = useState('');
  const [isCreateProviderOpen, setIsCreateProviderOpen] = useState(false);

  const vehiclesRef = useRef(vehicles);
  vehiclesRef.current = vehicles;

  const {
    contractSlots,
    setContractSlots,
    handleAddTripSlot,
    handleRemoveTripSlot,
    handleUpdateTripSlot,
    handleAddSlotIntermediate,
    handleRemoveSlotIntermediate,
    handleUpdateSlotIntermediate,
    handleUpdateSlotIntermediateFee,
    handleAddSlotReturnIntermediate,
    handleRemoveSlotReturnIntermediate,
    handleUpdateSlotReturnIntermediate,
    handleUpdateSlotReturnIntermediateFee,
  } = useTripSlotsState();

  const [contractVehicleType, setContractVehicleType] = useState<string>(VEHICLE_TYPES[0] || 'Flatbed');

  const primarySlot = contractSlots[0] || {};
  const originName = primarySlot.origin || '';
  const destinationName = primarySlot.destination || '';

  const { data: recommendedDriversRes } = useQuery({
    queryKey: ['recommendedDrivers', originName, destinationName, contractVehicleType, masterVehicle],
    queryFn: () =>
      tripService.getRecommendedDrivers({
        origin: originName,
        destination: destinationName,
        vehicleClass: contractVehicleType,
        vehicleId: masterVehicle,
      }),
    enabled: Boolean(originName || destinationName || contractVehicleType || masterVehicle),
  });

  const driverOptions = useMemo<ComboboxOption[]>(() => {
    const recMap = new Map((recommendedDriversRes || []).map((r) => [r.driverId, r]));

    const mapped = drivers
      .filter((d) => {
        if (!d || !d.id) return false;
        const fn = (d.first_name || '').toLowerCase();
        const ln = (d.last_name || '').toLowerCase();
        if (fn.includes('audit') || ln.includes('audit')) return false;
        return true;
      })
      .map((d) => {
        const rec = recMap.get(d.id);
        const embeddedVeh =
          d.assignedVehicle && typeof d.assignedVehicle === 'object'
            ? (d.assignedVehicle as any)
            : null;

        const vehicleId = embeddedVeh?.id ?? d.assignedVehicleId ?? (d as any).assigned_vehicle_id;
        const matchedVeh = vehicleId ? vehiclesRef.current.find((v) => v.id === vehicleId) : null;

        const plateNumber = rec?.vehiclePlate ?? embeddedVeh?.plate_number ?? matchedVeh?.plate_number ?? null;
        const capacityKg =
          embeddedVeh?.capacity_kg ??
          (embeddedVeh as any)?.capacityKg ??
          matchedVeh?.capacity_kg ??
          (matchedVeh as any)?.capacityKg;

        const capacityLabel = capacityKg != null ? getActualCapacityLabel(capacityKg) : (rec?.vehicleClass || '');
        const truckInfo = plateNumber
          ? `Truck: ${plateNumber}${capacityLabel ? ` • ${capacityLabel}` : ''}`
          : rec?.capacityMatch
          ? `Truck: Fleet Available${capacityLabel ? ` • ${capacityLabel}` : ''}`
          : 'Truck: Unassigned';

        const isNotAvailable = Boolean(d.status && d.status !== 'Available' && d.status.toLowerCase() !== 'available' && d.id !== masterDriver);
        const detailsStr = formatDriverDetails(d, rec, matchedVeh);
        const fullName = `${d.first_name || ''} ${d.last_name || ''}`.trim() || `Driver #${d.id.slice(0, 5)}`;

        const label = React.createElement(
          'div',
          { className: 'flex flex-col text-left leading-tight py-0.5 min-w-0 truncate' },
          React.createElement(
            'span',
            { className: 'font-bold text-slate-900 dark:text-slate-100 text-xs truncate' },
            fullName
          ),
          detailsStr
            ? React.createElement(
                'span',
                { className: 'text-[10px] font-medium text-slate-500 dark:text-slate-400 leading-tight pt-0.5 max-w-full whitespace-normal' },
                detailsStr
              )
            : null
        );

        return {
          value: d.id,
          label,
          selectedLabel: fullName,
          disabled: isNotAvailable,
          keywords: `${fullName} ${detailsStr} ${d.phone_primary || ''} ${d.license_number || ''} ${capacityLabel} ${d.status || ''}`,
          avatar_url: d.avatar_url,
          avatarUrl: d.avatar_url,
          first_name: d.first_name,
          last_name: d.last_name,
          detailsStr,
          vehiclePlate: plateNumber,
          raw: d,
          score: rec?.score ?? 0,
          routeTripCount: rec?.routeTripCount ?? 0,
          capacityMatch: rec?.capacityMatch ?? false,
        } as ComboboxOption & Record<string, any>;
      });

    mapped.sort((a, b) => {
      const capA = a.capacityMatch ? 1 : 0;
      const capB = b.capacityMatch ? 1 : 0;
      if (capB !== capA) return capB - capA;
      return (b.score || 0) - (a.score || 0);
    });

    const assignLaterDriverOption: ComboboxOption & Record<string, any> = {
      value: 'unassigned',
      label: React.createElement(
        'div',
        { className: 'flex flex-col text-left leading-tight py-0.5' },
        React.createElement('span', { className: 'font-bold text-amber-700 dark:text-amber-300 text-xs' }, '⏳ Assign Later'),
        React.createElement('span', { className: 'text-[10px] text-amber-600 dark:text-amber-400' }, 'Pending fleet assignment')
      ),
      selectedLabel: 'Assign Later',
      first_name: 'Assign',
      last_name: 'Later',
      detailsStr: 'Truck: Unassigned',
      keywords: 'unassigned assign later pending null none',
    };

    return [assignLaterDriverOption, ...mapped];
  }, [drivers, vehicles, recommendedDriversRes]);

  const urlStepParam = searchParams.get('step');
  const initialStep = (urlStepParam && [1, 2, 3].includes(Number(urlStepParam))) ? (Number(urlStepParam) as 1 | 2 | 3) : 1;

  const urlMode = searchParams.get('mode');
  const urlBillingType = searchParams.get('billingType');
  const urlMonth = searchParams.get('month');
  const urlAssignment = searchParams.get('assignment');
  const isMonthlyUrl = urlMode?.toLowerCase() === 'monthly' || urlBillingType?.toLowerCase() === 'monthly' || !!urlMonth;
  const is3PLUrl = urlAssignment?.toLowerCase() === 'third_party' || urlAssignment?.toLowerCase() === '3pl';

  const [contractStep, setContractStep] = useState<1 | 2 | 3>(initialStep);
  const [contractCustomer, setContractCustomerRaw] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [contractRateCategory, setContractRateCategory] = useState<string>('Single Trip');
  const [contractBillingType, setContractBillingType] = useState<string>(isMonthlyUrl ? 'Monthly' : 'Extra');

  useEffect(() => {
    if (urlBillingType || urlMode || urlMonth) {
      const isMonthly = urlMode?.toLowerCase() === 'monthly' || urlBillingType?.toLowerCase() === 'monthly' || !!urlMonth;
      setContractBillingType(isMonthly ? 'Monthly' : 'Extra');
    }
    if (urlAssignment) {
      const is3PL = urlAssignment.toLowerCase() === 'third_party' || urlAssignment.toLowerCase() === '3pl';
      setAssignmentType(is3PL ? 'third_party' : 'own');
    }
  }, [urlBillingType, urlMode, urlMonth, urlAssignment]);

  const explicitBillingType = urlBillingType || (isMonthlyUrl ? 'Monthly' : null);

  const {
    customerRateCards,
    handleOpenCreateQuotation,
    getMatchingRateCard,
    getAvailableRateCardsForLane,
  } = useTripRateLookup(
    contractCustomer,
    contractVehicleType,
    contractRateCategory,
    contractBillingType,
    contractStep,
    explicitBillingType
  );

  const contractSlotsRef = useRef(contractSlots);
  useEffect(() => {
    contractSlotsRef.current = contractSlots;
  }, [contractSlots]);

  const triggerRateLookupForSlots = useCallback(
    (overrideVehicleType?: string, overrideRateCategory?: string, overrideCustomer?: string, overrideBillingType?: string, forceRelookup = false) => {
      const custId = overrideCustomer !== undefined ? overrideCustomer : contractCustomer;
      const vType = overrideVehicleType !== undefined ? overrideVehicleType : contractVehicleType;
      const rCat = overrideRateCategory !== undefined ? overrideRateCategory : contractRateCategory;
      const bType = overrideBillingType !== undefined ? overrideBillingType : contractBillingType;

      if (!custId) return;

      const currentSlots = contractSlotsRef.current;

      import('@/services/quotationService')
        .then(async ({ quotationService }) => {
          const updatedSlots = await Promise.all(
            currentSlots.map(async (slot) => {
              // Only preserve matchedRateCard if NOT forceRelookup
              if (!forceRelookup && slot.matchedRateCard && slot.rateMatched) {
                return slot;
              }

              if ((!slot.origin && !slot.originLocationId) || (!slot.destination && !slot.destinationLocationId)) return slot;

              const intermediateStops = (slot.intermediateLocations || []).map((locVal, idx) => {
                const locId = slot.intermediateLocationIds?.[idx] || (isUuid(locVal) ? locVal : null);
                return {
                  location_id: locId || null,
                  location_name: locVal,
                  stop_type: 'Dropoff',
                  sequence: idx + 2,
                };
              });

              const slotStops = [
                { location_id: slot.originLocationId, stop_type: 'Pickup', sequence: 1 },
                ...intermediateStops,
                { location_id: slot.destinationLocationId, stop_type: 'Dropoff', sequence: intermediateStops.length + 2 },
              ];

              try {
                let card: RateCard | null = null;
                if (slot.originLocationId && slot.destinationLocationId) {
                  const exactRes = await quotationService.lookup({
                    customer_id: custId,
                    origin_location_id: slot.originLocationId,
                    destination_location_id: slot.destinationLocationId,
                    vehicle_type: vType || undefined,
                    line_type: rCat || undefined,
                    billing_type: bType || undefined,
                    planned_start: slot.date || undefined,
                    stops: slotStops,
                  });
                  card = exactRes?.quotation || exactRes?.candidate_quotation || exactRes?.candidateQuotation || exactRes?.rate_card || null;
                }

                if (!card) {
                  card = getMatchingRateCard(
                    slot.origin,
                    slot.destination,
                    vType,
                    rCat,
                    bType,
                    slot.date,
                    slot.originLocationId,
                    slot.destinationLocationId
                  );
                }

                if (card) {
                  const cardRate = Number(card.rate ?? card.base_price ?? 0);
                  const driverPayout = card.driver_payout ?? (card as any).driver_charge;
                  if (cardRate > 0) {
                    const cardClass = card.vehicle_type || card.vehicle_class || (card as any).vehicleClass || (card as any).source_vehicle_label;
                    if (cardClass) {
                      const normClass = normalizeVehicleClass(cardClass);
                      if (normClass) {
                        setContractVehicleType(normClass);
                      }
                    }

                    const isMonthlyRate = card.pricing_basis === 'PER_TRIP'
                      ? false
                      : card.pricing_basis === 'PER_MONTH'
                      ? true
                      : (card.line_type || card.rate_category || '').toLowerCase().includes('single') || (card.line_type || card.rate_category || '').toLowerCase().includes('extra')
                      ? false
                      : (card.billing_type || '').toLowerCase().includes('monthly');

                    const perTripAmount = isMonthlyRate ? Math.round((cardRate / 30) * 100) / 100 : cardRate;
                    return {
                      ...slot,
                      matchedRateCard: card,
                      billingAmount: String(cardRate),
                      tripCharges: driverPayout != null ? String(driverPayout) : '',
                      rateMatched: true,
                      rateCardId: card.id,
                      rateCardName: card.name,
                      rateCardBasePrice: cardRate,
                      rateCardDefaultTripCharge: driverPayout != null ? Number(driverPayout) : null,
                      saveAsQuotation: false,
                      saveAsRateCard: false,
                    };
                  }
                }
              } catch (err) {
                console.error('Quotation rate lookup error:', err);
              }

              // No matching rate card found: preserve manually entered pricing if user typed billing or payout
              const isUserDefined = !slot.rateMatched || slot.saveAsQuotation || slot.saveAsRateCard || slot.driverPayoutModified;
              const keepBilling = isUserDefined && slot.billingAmount ? slot.billingAmount : '';
              const keepTripCharges = isUserDefined && slot.tripCharges ? slot.tripCharges : '';
              const keepDriverPayout = isUserDefined && slot.driverPayout !== undefined ? slot.driverPayout : undefined;

              return {
                ...slot,
                billingAmount: keepBilling,
                tripCharges: keepTripCharges,
                ...(keepDriverPayout !== undefined ? { driverPayout: keepDriverPayout } : {}),
                rateMatched: false,
                rateCardId: undefined,
                rateCardName: undefined,
                rateCardBasePrice: undefined,
                rateCardDefaultTripCharge: undefined,
                saveAsQuotation: true,
                saveAsRateCard: true,
              };
            })
          );

          if (JSON.stringify(updatedSlots) !== JSON.stringify(contractSlotsRef.current)) {
            setContractSlots(updatedSlots);
          }
        })
        .catch((err) => console.error('Quotation service import error:', err));
    },
    [contractCustomer, contractVehicleType, contractRateCategory, contractBillingType, getMatchingRateCard, setContractSlots]
  );

  const setContractCustomer = useCallback(
    (newCustId: string) => {
      setContractCustomerRaw(newCustId);

      setContractSlots((prev) =>
        prev.map((s) => ({
          ...s,
          matchedRateCard: null,
          rateCardId: undefined,
          rateMatched: false,
          billingAmount: '',
          driverPayout: '',
          saveAsQuotation: false,
          saveAsRateCard: false,
        }))
      );

      setTimeout(() => {
        triggerRateLookupForSlots(undefined, undefined, newCustId, undefined, true);
      }, 100);
    },
    [setContractSlots, triggerRateLookupForSlots]
  );

  const vehicleOptions = useMemo<ComboboxOption[]>(() => {
    const rule = getCompatibilityRuleForClass(contractVehicleType);
    const isRuleConfigured = Boolean(rule && rule.isActive !== false && rule.allowedVehicleClassCodes.length > 0);

    const preferredCodes = isRuleConfigured && rule ? rule.preferredVehicleClassCodes.map((c) => c.toLowerCase()) : [];
    const allowedCodes = isRuleConfigured && rule ? rule.allowedVehicleClassCodes.map((c) => c.toLowerCase()) : [];

    const selDriver = drivers.find((d) => d.id === masterDriver);
    const driverVehId = selDriver ? (selDriver.assignedVehicleId || (selDriver.assignedVehicle as any)?.id) : null;

    const getVehicleClass = (v: any): string => {
      if (v.capacity_kg && v.capacity_kg > 0) {
        return getVehicleTypeFromCapacity(v.capacity_kg);
      }
      return normalizeVehicleClass(v.asset_type);
    };

    let filtered = vehicles.filter((v) => {
      if (v.isActive === false) return false;
      if (v.id === masterVehicle) return true; // Keep currently selected vehicle visible

      if (!isRuleConfigured) return true; // If rule not configured, keep all vehicles available

      const vClass = getVehicleClass(v);
      const isAllowed = allowedCodes.some((c) => c === vClass.toLowerCase());
      return isAllowed;
    });

    let isFallback = false;
    if (filtered.length === 0) {
      filtered = vehicles.filter((v) => v.isActive !== false);
      isFallback = true;
    }

    const mapped = filtered.map((v) => {
      const vClass = getVehicleClass(v);
      const actualCapLabel = getActualCapacityLabel(v.capacity_kg ?? 0);
      const typeLabel = v.asset_type && actualCapLabel ? `${v.asset_type} • ${actualCapLabel}` : (v.asset_type || actualCapLabel || vClass);

      const isDriverUsual = Boolean(driverVehId && driverVehId === v.id);
      const isPreferred = !isRuleConfigured || preferredCodes.some((c) => c === vClass.toLowerCase());
      const isAllowed = !isRuleConfigured || allowedCodes.some((c) => c === vClass.toLowerCase());

      let group = 'Compatible';
      let hint = '';

      if (isFallback) {
        group = 'Available Vehicles';
        hint = `Class: ${vClass}`;
      } else if (isDriverUsual && isAllowed) {
        group = 'Recommended';
        hint = `Usual vehicle for ${selDriver?.first_name || 'driver'}`;
      } else if (isPreferred) {
        group = 'Compatible';
        hint = 'Preferred class';
      } else if (isAllowed) {
        group = 'Allowed Alternatives';
        hint = 'Allowed alternative';
      }

      const isVehNotAvailable = Boolean(v.status && v.status !== 'Available' && v.status.toLowerCase() !== 'available' && v.id !== masterVehicle);
      const statusClean = v.status && v.status !== 'Available' && v.status.toLowerCase() !== 'available' ? v.status : '';
      const vehDetailsStr = [typeLabel, statusClean, hint].filter(Boolean).join(' • ');

      const label = React.createElement(
        'div',
        { className: 'flex flex-col text-left leading-tight py-0.5 min-w-0 truncate' },
        React.createElement(
          'span',
          { className: 'font-bold text-slate-900 dark:text-slate-100 text-xs truncate' },
          v.plate_number
        ),
        vehDetailsStr
          ? React.createElement(
              'span',
              { className: 'text-[10px] font-medium text-slate-500 dark:text-slate-400 truncate pt-0.5' },
              vehDetailsStr
            )
          : null
      );

      return {
        value: v.id,
        group,
        label,
        selectedLabel: v.plate_number || typeLabel,
        disabled: isVehNotAvailable,
        keywords: `${v.plate_number || ''} ${v.asset_type || ''} ${v.ref_id || ''} ${vClass} ${actualCapLabel} ${group} ${hint}`,
      };
    });

    const groupPriority: Record<string, number> = {
      'Recommended': 0,
      'Compatible': 1,
      'Allowed Alternatives': 2,
      'Available Vehicles': 3,
    };

    const sorted = mapped.sort((a, b) => {
      const pA = groupPriority[a.group] ?? 99;
      const pB = groupPriority[b.group] ?? 99;
      return pA - pB;
    });

    const assignLaterVehicleOption: ComboboxOption = {
      value: 'unassigned',
      group: 'Assign Later',
      label: React.createElement(
        'div',
        { className: 'flex flex-col text-left leading-tight py-0.5' },
        React.createElement('span', { className: 'font-bold text-amber-700 dark:text-amber-300 text-xs' }, '⏳ Assign Later'),
        React.createElement('span', { className: 'text-[10px] text-amber-600 dark:text-amber-400' }, 'Pending truck assignment')
      ),
      selectedLabel: 'Assign Later',
      keywords: 'unassigned assign later pending null none',
    };

    return [assignLaterVehicleOption, ...sorted];
  }, [vehicles, masterVehicle, contractVehicleType, masterDriver, drivers]);

  useEffect(() => {
    if (urlStepParam) {
      const parsed = Number(urlStepParam);
      if ([1, 2].includes(parsed)) {
        setContractStep(parsed as 1 | 2);
      }
    }
  }, [urlStepParam]);

  const handleSlotLocationChange = (
    slotId: string,
    field: 'origin' | 'destination',
    locIdOrName: string,
    locObj: any
  ) => {
    const locationId = locObj?.id ?? (isUuid(locIdOrName) ? locIdOrName : null);
    const displayName = locObj?.name || locObj?.address || (isUuid(locIdOrName) ? '' : locIdOrName);
    const isOrigin = field === 'origin';
    const locPrecision = locObj?.coordinate_precision || (locObj?.lat != null ? 'APPROXIMATE' : 'UNKNOWN');

    setContractSlots((prev) =>
      prev.map((s) => {
        if (s.id !== slotId) return s;
        const isUserTypedRate = Boolean(s.saveAsQuotation || s.saveAsRateCard || s.driverPayoutModified);
        return {
          ...s,
          [field]: displayName,
          [isOrigin ? 'originLocationId' : 'destinationLocationId']: locationId,
          [isOrigin ? 'originLat' : 'destinationLat']: locObj?.lat ?? null,
          [isOrigin ? 'originLng' : 'destinationLng']: locObj?.lng ?? null,
          [isOrigin ? 'originName' : 'destinationName']: displayName,
          [isOrigin ? 'originAddress' : 'destinationAddress']: locObj?.address || displayName,
          [isOrigin ? 'originPrecision' : 'destinationPrecision']: locPrecision,
          [isOrigin ? 'updateCanonicalOrigin' : 'updateCanonicalDestination']: false,
          rateMatched: false,
          matchedRateCard: null,
          rateCardId: undefined,
          billingAmount: isUserTypedRate ? s.billingAmount : '',
          driverPayout: isUserTypedRate ? s.driverPayout : '',
        };
      })
    );

    setTimeout(() => {
      triggerRateLookupForSlots(undefined, undefined, undefined, undefined, true);
    }, 100);
  };

  const handleDriverChange = (driverId: string): string | null => {
    setMasterDriver(driverId);
    if (!driverId || driverId === 'unassigned') {
      setMasterVehicle('unassigned');
      return 'unassigned';
    }

    const selectedDriver = drivers.find((d) => d.id === driverId);
    if (!selectedDriver) return null;

    const embeddedVehicle = selectedDriver.assignedVehicle && typeof selectedDriver.assignedVehicle === 'object'
      ? selectedDriver.assignedVehicle as any
      : null;

    let vehicleId =
      selectedDriver.assignedVehicleId ||
      embeddedVehicle?.id ||
      (selectedDriver as any).assigned_vehicle_id;

    // Fallback 1: Search vehicles list for one assigned to this driver
    if (!vehicleId) {
      const vAssigned = vehicles.find((v: any) =>
        v.assignedDriverId === driverId ||
        v.assigned_driver_id === driverId ||
        (v.assignedDriver && v.assignedDriver.id === driverId)
      );
      if (vAssigned) vehicleId = vAssigned.id;
    }

    // Fallback 2: Check driverOptions for vehiclePlate or raw assignedVehicleId
    if (!vehicleId) {
      const opt = driverOptions.find((o) => o.value === driverId) as (ComboboxOption & Record<string, any>) | undefined;
      if (opt?.raw?.assignedVehicleId) {
        vehicleId = opt.raw.assignedVehicleId;
      } else if (opt?.vehiclePlate) {
        const vByPlate = vehicles.find((v) => v.plate_number === opt.vehiclePlate);
        if (vByPlate) vehicleId = vByPlate.id;
      }
    }

    if (!vehicleId) return null;

    const matchedVehicle = vehicles.find((v) => v.id === vehicleId) || embeddedVehicle;
    if (!matchedVehicle) return null;

    const vClass = (matchedVehicle.capacity_kg && matchedVehicle.capacity_kg > 0)
      ? getVehicleTypeFromCapacity(matchedVehicle.capacity_kg)
      : normalizeVehicleClass(matchedVehicle.asset_type);

    setMasterVehicle(matchedVehicle.id);
    toast.success(`Auto-selected driver's truck: ${matchedVehicle.plate_number || 'Vehicle'} (${vClass})`);
    return matchedVehicle.id;
  };

  const {
    recentTrips,
    recentRoutesList,
    handleApplyRecentRoute,
    recentDriversList,
    handleApplyRecentDriver,
  } = useTripAccelerators(
    contractCustomer,
    customerRateCards,
    contractSlots,
    drivers,
    vehicles,
    contractVehicleType,
    handleSlotLocationChange,
    handleDriverChange,
    masterVehicle,
    setMasterVehicle
  );

  useEffect(() => {
    if (contractCustomer) {
      triggerRateLookupForSlots();
    }
  }, [contractCustomer, contractVehicleType, contractRateCategory, contractBillingType]);

  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [dayAssignments, setDayAssignments] = useState<Record<string, { driverId: string; vehicleId: string; coDriverId?: string; driverPayoutOverride?: number; coDriverPayoutOverride?: number }>>({});

  const [isCreateDriverOpen, setIsCreateDriverOpen] = useState(false);
  const [isCreateVehicleOpen, setIsCreateVehicleOpen] = useState(false);
  const [isCreateCustomerOpen, setIsCreateCustomerOpen] = useState(false);

  const [previewVehicle, setPreviewVehicle] = useState<any | null>(null);
  const [previewCustomer, setPreviewCustomer] = useState<any | null>(null);
  const [previewThirdParty, setPreviewThirdParty] = useState<any | null>(null);
  const [previewDriver, setPreviewDriver] = useState<any | null>(null);

  const [editVehicle, setEditVehicle] = useState<any | null>(null);
  const [editCustomer, setEditCustomer] = useState<any | null>(null);
  const [editThirdParty, setEditThirdParty] = useState<any | null>(null);
  const [editDriver, setEditDriver] = useState<any | null>(null);

  const getStepValidationErrors = (step: number): string[] => {
    const errors: string[] = [];
    const isMonthly = contractBillingType?.toLowerCase() === 'monthly';

    if (step === 1) {
      if (!contractCustomer) {
        errors.push('Customer is required');
      }
      if (!contractSlots || contractSlots.length === 0) {
        errors.push('At least 1 route slot is required');
      } else {
        contractSlots.forEach((slot, idx) => {
          const laneLabel =
            slot.origin && slot.destination ? `${slot.origin} → ${slot.destination}` : `Slot #${idx + 1}`;
          if (!slot.origin?.trim()) {
            errors.push(`${laneLabel}: Select an origin location`);
          }
          if (!slot.destination?.trim()) {
            errors.push(`${laneLabel}: Select a destination location`);
          }
          if (!isMonthly && !slot.date) {
            errors.push(`${laneLabel}: Select a trip date`);
          }
          if (!slot.pickupTime) {
            errors.push(`${laneLabel}: Select pickup time`);
          }
          if (!slot.dropoffTime) {
            errors.push(`${laneLabel}: Select drop-off time`);
          }

          if (!isMonthly && slot.date && slot.pickupTime && slot.dropoffTime) {
            const dropoffDate = slot.dropoffDate || slot.date;
            if (dropoffDate < slot.date) {
              errors.push(`${laneLabel}: Drop-off date cannot be before trip date`);
            } else {
              try {
                const pStartIso = localDateTimeToUtcIso(slot.date, slot.pickupTime, tz);
                const pEndIso = localDateTimeToUtcIso(dropoffDate, slot.dropoffTime, tz);
                const pStartMs = new Date(pStartIso).getTime();
                const pEndMs = new Date(pEndIso).getTime();
                if (isNaN(pStartMs) || isNaN(pEndMs) || pEndMs <= pStartMs) {
                  errors.push(`${laneLabel}: Drop-off time must be strictly after pickup time`);
                }
              } catch {
                errors.push(`${laneLabel}: Invalid pickup or drop-off time format`);
              }
            }
          }

          // Commercial Pricing & Rate Validation
          const hasRateMatched = Boolean(slot.matchedRateCard || slot.rateMatched);
          const hasBillingInput = slot.billingAmount !== undefined && slot.billingAmount !== null && slot.billingAmount !== '' && Number(slot.billingAmount) > 0;

          if (!hasRateMatched && !hasBillingInput) {
            errors.push(`${laneLabel}: Select a Commercial Quotation card or enter Customer Billing Rate`);
          }

          const is3PL = assignmentType === 'third_party' || (assignmentType as string) === '3pl';
          if (!is3PL) {
            const hasTripChargeInput = slot.tripCharges !== undefined && slot.tripCharges !== null && slot.tripCharges !== '';
            const hasDriverPayoutProp = slot.driverPayout !== undefined && slot.driverPayout !== null && slot.driverPayout !== '';
            const hasMatchedPayout = slot.matchedRateCard?.driver_payout != null || slot.matchedRateCard?.default_trip_charge != null;

            if (!hasTripChargeInput && !hasDriverPayoutProp && !hasMatchedPayout) {
              errors.push(`${laneLabel}: Enter Driver Payout / Charge`);
            }
          } else {
            if (!thirdPartyCost || Number(thirdPartyCost) <= 0) {
              errors.push('3PL Cost (SAR) is required');
            }
          }
        });
      }

      // Mandatory Fleet & Driver Assignment Validation for Daily/Spot (Monthly handles assignment on Page 2)
      if (contractBillingType !== 'Monthly') {
        if (assignmentType === 'third_party') {
          if (!thirdPartyProviderId && !thirdPartyDriverName) {
            errors.push('3PL Logistics Partner selection is required');
          }
        } else {
          const hasDriverSelection = Boolean(masterDriver);
          const hasVehicleSelection = Boolean(masterVehicle);
          if (!hasDriverSelection && !hasVehicleSelection) {
            errors.push('Select an assignment choice: Driver & Vehicle or Assign Later');
          }
        }
      }
    } else if (step === 2) {
      if (contractBillingType === 'Monthly') {
        if (selectedDates.length === 0) {
          errors.push('Select at least 1 operating date on the calendar');
        }
        if (assignmentType === 'third_party') {
          if (!thirdPartyProviderId && !thirdPartyDriverName) {
            errors.push('3PL Logistics Partner selection is required');
          }
        } else {
          const hasDriverSelection = Boolean(masterDriver);
          const hasVehicleSelection = Boolean(masterVehicle);
          if (!hasDriverSelection && !hasVehicleSelection) {
            errors.push('Select an assignment choice: Driver & Vehicle or Assign Later');
          }
        }
      }
    }

    return errors;
  };

  const isStepValid = (step: number): boolean => {
    return getStepValidationErrors(step).length === 0;
  };

  const canNavigateToStep = (targetStep: number): boolean => {
    const maxSteps = contractBillingType === 'Monthly' ? 3 : 2;
    if (targetStep > maxSteps) return false;
    if (targetStep <= contractStep) return true;
    for (let s = 1; s < targetStep; s++) {
      if (!isStepValid(s)) return false;
    }
    return true;
  };

  const handleVehicleChange = (vehicleId: string) => {
    setMasterVehicle(vehicleId);
  };

  const batchTripRows = useMemo(() => {
    const list: Array<{
      key: string;
      dateStr: string;
      formattedDate: string;
      slotLabel: string;
      pickupTime: string;
      isOvernight?: boolean;
    }> = [];

    contractSlots.forEach((slot, slotIdx) => {
      const dateStr = slot.date || new Date().toISOString().slice(0, 10);
      const [y, m, d] = dateStr.split('-').map(Number);
      const dateObj = new Date(y, m - 1, d);
      const formattedDate = dateObj.toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });

      const key = slot.id;
      const slotLabel = `Slot #${slotIdx + 1}`;
      list.push({
        key,
        dateStr,
        formattedDate,
        slotLabel,
        pickupTime: slot.pickupTime,
        isOvernight: slot.isOvernight,
      });
    });

    return list;
  }, [contractSlots]);

  const {
    gridRows,
    setGridRows,
    generateEmptyRow,
    updateGridRow,
    deleteGridRow,
    duplicateGridRow,
  } = useTripBatchGridState(customers[0]?.id);

  const {
    fileInputRef,
    importedFile,
    setImportedFile,
    parsedRows,
    setParsedRows,
    parseError,
    setParseError,
    handleFileUpload,
    downloadSampleCsv,
  } = useTripFileImportState();

  const {
    submissionResult,
    pastDateModalOpen,
    setPastDateModalOpen,
    pastDateAnalysis,
    handlePastDateConfirm,
    bulkMutation,
    handleContractSubmit,
    fieldErrors,
    setFieldErrors,
    validateAndFocusErrors,
    handleGridSubmit: handleGridSubmitBase,
    handleFileSubmit: handleFileSubmitBase,
    resetAll,
    handleDialogClose,
  } = useTripSubmission(
    contractCustomer,
    contractSlots,
    contractVehicleType,
    contractRateCategory,
    contractBillingType,
    assignmentType,
    masterDriver,
    masterCoDriver,
    masterVehicle,
    thirdPartyProviderId,
    thirdPartyDriverName,
    thirdPartyDriverPhone,
    thirdPartyVehiclePlate,
    thirdPartyCost,
    awbNumber,
    dayAssignments,
    selectedDates,
    setContractStep,
    setSelectedDates,
    setDayAssignments,
    setParsedRows,
    setImportedFile,
    setParseError
  );

  const handleGridSubmit = () => handleGridSubmitBase(gridRows);
  const handleFileSubmit = () => handleFileSubmitBase(parsedRows);

  const handleDriverCreated = (newDriver: Driver) => {
    queryClient.invalidateQueries({ queryKey: ['drivers'] });
    queryClient.invalidateQueries({ queryKey: ['drivers-select'] });
    setMasterDriver(newDriver.id);
    toast.success(`Driver ${newDriver.first_name} ${newDriver.last_name} created successfully.`);
  };

  const { hasSavedDraft, restoreDraft, discardDraft } = useTripDraftStorage(
    contractCustomer,
    contractRateCategory,
    contractBillingType,
    contractVehicleType,
    contractSlots,
    masterDriver,
    masterVehicle,
    assignmentType,
    thirdPartyProviderId,
    thirdPartyDriverName,
    thirdPartyDriverPhone,
    thirdPartyVehiclePlate,
    thirdPartyCost,
    setContractCustomer,
    setContractRateCategory,
    setContractBillingType,
    setContractVehicleType,
    setContractSlots,
    setMasterDriver,
    setMasterVehicle,
    setAssignmentType,
    setThirdPartyProviderId,
    setThirdPartyDriverName,
    setThirdPartyDriverPhone,
    setThirdPartyVehiclePlate,
    setThirdPartyCost
  );

  useEffect(() => {
    if (contractStep !== 1 || activeTab !== 'contract') return;

    const handleStep1Hotkeys = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const isTypingInInput =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if (!isTypingInInput && ['1', '2', '3', '4'].includes(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        if (customers[idx]) {
          e.preventDefault();
          setContractCustomer(customers[idx].id);
          toast.success(`Selected shipper #${e.key}: ${customers[idx].name}`);
        }
      }
    };

    window.addEventListener('keydown', handleStep1Hotkeys);
    return () => window.removeEventListener('keydown', handleStep1Hotkeys);
  }, [contractStep, activeTab, customers]);

  const marginMetrics = useMemo(() => {
    const totalBilling = contractSlots.reduce(
      (acc, s) => acc + (parseFloat(s.billingAmount) || 0),
      0
    );
    const driverPayout = contractSlots.reduce(
      (acc, s) => acc + (parseFloat(s.tripCharges) || 0),
      0
    );
    const carrierCost = assignmentType === 'third_party' ? parseFloat(thirdPartyCost) || 0 : 0;
    const totalCost = driverPayout + carrierCost;
    const profit = totalBilling - totalCost;
    const marginPct = totalBilling > 0 ? (profit / totalBilling) * 100 : 0;

    return {
      totalBilling,
      totalCost,
      profit,
      marginPct,
      isHigh: marginPct >= 20,
      isMedium: marginPct >= 5 && marginPct < 20,
      isLow: marginPct < 5,
    };
  }, [contractSlots, assignmentType, thirdPartyCost]);

  useFormKeyboardShortcuts({
    onSave: () => {
      if (contractStep < 4) {
        if (isStepValid(contractStep)) {
          setContractStep((prev) => (prev + 1) as any);
        }
      } else {
        if (batchTripRows.length > 0 && isStepValid(3) && !bulkMutation.isPending) {
          handleContractSubmit();
        }
      }
    },
    onCancel: () => {
      if (contractStep > 1) {
        setContractStep((prev) => (prev - 1) as any);
      } else {
        handleDialogClose();
      }
    },
    isSubmitting: bulkMutation.isPending,
  });

  const handleRepeatTrip = useCallback(
    (historicalTrip: Trip) => {
      if (!historicalTrip) return;

      const custId = historicalTrip.customer_id || historicalTrip.customer?.id;
      if (custId) {
        setContractCustomer(custId);
      }

      const stops = historicalTrip.stops || [];
      const pickupStop = stops.find((s: any) => s.stop_type === 'Pickup' || s.sequence === 1) || stops[0];
      const dropoffStops = stops.filter((s: any) => s.stop_type === 'Dropoff');
      const dropoffStop =
        dropoffStops.length > 0
          ? dropoffStops[dropoffStops.length - 1]
          : stops.length > 1
          ? stops[stops.length - 1]
          : null;

      const origName =
        (pickupStop as any)?.source_label ||
        pickupStop?.location?.name ||
        historicalTrip.rateCard?.route_origin ||
        '';
      const destName =
        (dropoffStop as any)?.source_label ||
        dropoffStop?.location?.name ||
        historicalTrip.rateCard?.route_destination ||
        '';

      const origLocId = pickupStop?.locationId || pickupStop?.location?.id || null;
      const destLocId = dropoffStop?.locationId || dropoffStop?.location?.id || null;

      const intermediateStops = stops.filter(
        (s: any) => s.stop_type === 'Intermediate' || (s.sequence > 1 && s !== dropoffStop)
      );
      const intermediateNames = intermediateStops.map((s: any) => s.source_label || s.location?.name || '');
      const intermediateIds = intermediateStops.map((s: any) => s.locationId || s.location?.id || null);

      const billingType =
        historicalTrip.quotation_billing_type || (historicalTrip as any).billing_type || 'Extra';
      const lineType =
        historicalTrip.quotation_line_type ||
        (historicalTrip as any).line_type ||
        (historicalTrip.rateCard as any)?.line_type ||
        'Single Trip';
      const vehicleClass =
        historicalTrip.quotation_vehicle_class ||
        (historicalTrip as any).vehicle_class ||
        (historicalTrip.vehicle ? getVehicleTypeFromCapacity(historicalTrip.vehicle.capacity_kg) : '10 TON');

      setContractBillingType(normalizeBillingType(billingType));
      setContractRateCategory(normalizeRateCategory(lineType));
      setContractVehicleType(normalizeVehicleClass(vehicleClass));

      const todayStr = new Date().toISOString().slice(0, 10);
      setContractSlots([
        {
          id: `slot-${Date.now()}`,
          origin: origName,
          destination: destName,
          originLocationId: origLocId,
          destinationLocationId: destLocId,
          pickupTime: '',
          dropoffTime: '',
          date: todayStr,
          dropoffDate: '',
          billingAmount: '',
          tripCharges: '',
          isOvernight: false,
          intermediateLocations: intermediateNames,
          intermediateLocationIds: intermediateIds,
          intermediateStopFees: intermediateNames.map(() => ''),
          originLat: (pickupStop?.location as any)?.lat ?? null,
          originLng: (pickupStop?.location as any)?.lng ?? null,
          destinationLat: (dropoffStop?.location as any)?.lat ?? null,
          destinationLng: (dropoffStop?.location as any)?.lng ?? null,
        },
      ]);

      const histDriver = historicalTrip.driver;
      const histVehicle = historicalTrip.vehicle;

      if (histDriver && histDriver.id) {
        setMasterDriver(histDriver.id);
      }
      if (histVehicle && histVehicle.id) {
        setMasterVehicle(histVehicle.id);
      }

      setContractStep(2);

      const formattedDate = historicalTrip.createdAt
        ? new Date(historicalTrip.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : 'recent';
      toast.success(
        `Trip configuration copied from ${formattedDate} trip (${origName || 'Origin'} → ${destName || 'Destination'})`
      );
    },
    [
      setContractCustomer,
      setContractBillingType,
      setContractRateCategory,
      setContractVehicleType,
      setContractSlots,
      setMasterDriver,
      setMasterVehicle,
      setContractStep,
    ]
  );

  return {
    navigate,
    queryClient,
    activeTab,
    setActiveTab,
    contractStep,
    setContractStep,
    contractCustomer,
    setContractCustomer,
    contractRateCategory,
    setContractRateCategory,
    contractBillingType,
    setContractBillingType,
    contractVehicleType,
    setContractVehicleType,
    contractSlots,
    setContractSlots,
    customers,
    drivers,
    vehicles,
    thirdPartyProviders,
    driverOptions,
    vehicleOptions,
    assignmentType,
    setAssignmentType,
    masterDriver,
    setMasterDriver,
    masterCoDriver,
    setMasterCoDriver,
    masterVehicle,
    setMasterVehicle,
    isVehicleTypeEditable,
    setIsVehicleTypeEditable,
    isManualRateOverride,
    setIsManualRateOverride,
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
    isCreateProviderOpen,
    setIsCreateProviderOpen,
    isCreateDriverOpen,
    setIsCreateDriverOpen,
    isCreateVehicleOpen,
    setIsCreateVehicleOpen,
    isCreateCustomerOpen,
    setIsCreateCustomerOpen,
    previewVehicle,
    setPreviewVehicle,
    previewCustomer,
    setPreviewCustomer,
    previewThirdParty,
    setPreviewThirdParty,
    previewDriver,
    setPreviewDriver,
    editVehicle,
    setEditVehicle,
    editCustomer,
    setEditCustomer,
    editThirdParty,
    setEditThirdParty,
    editDriver,
    setEditDriver,
    handleRepeatTrip,
    recentRoutesList,
    recentDriversList,
    handleApplyRecentRoute,
    handleApplyRecentDriver,
    triggerRateLookupForSlots,
    handleSlotLocationChange,
    handleAddTripSlot,
    handleRemoveTripSlot,
    handleUpdateTripSlot,
    handleAddSlotIntermediate,
    handleRemoveSlotIntermediate,
    handleUpdateSlotIntermediate,
    handleUpdateSlotIntermediateFee,
    handleAddSlotReturnIntermediate,
    handleRemoveSlotReturnIntermediate,
    handleUpdateSlotReturnIntermediate,
    handleUpdateSlotReturnIntermediateFee,
    isStepValid,
    getStepValidationErrors,
    canNavigateToStep,
    handleDriverChange,
    handleVehicleChange,
    batchTripRows,
    gridRows,
    setGridRows,
    generateEmptyRow,
    updateGridRow,
    deleteGridRow,
    duplicateGridRow,
    fileInputRef,
    importedFile,
    setImportedFile,
    parsedRows,
    setParsedRows,
    parseError,
    handleFileUpload,
    downloadSampleCsv,
    submissionResult,
    pastDateModalOpen,
    setPastDateModalOpen,
    pastDateAnalysis,
    handlePastDateConfirm,
    bulkMutation,
    handleContractSubmit,
    fieldErrors,
    setFieldErrors,
    validateAndFocusErrors,
    handleGridSubmit,
    handleFileSubmit,
    resetAll,
    handleDialogClose,
    handleDriverCreated,
    hasSavedDraft,
    restoreDraft,
    discardDraft,
    marginMetrics,
    customerRateCards,
    selectedMonth,
    setSelectedMonth,
    selectedDates,
    setSelectedDates,
    dayAssignments,
    setDayAssignments,
    getAvailableRateCardsForLane,
    handleOpenCreateQuotation,
    getCompatibilityRuleForClass,
    awbNumber,
    setAwbNumber,
  };
}

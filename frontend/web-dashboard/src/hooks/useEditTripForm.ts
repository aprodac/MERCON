import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { cn, isUuid } from '@/lib/utils';
import { customerService } from '@/services/customerService';
import { driverService, Driver } from '@/services/driverService';
import { vehicleService, Vehicle } from '@/services/vehicleService';
import { thirdPartyService, ThirdPartyProvider } from '@/services/thirdPartyService';
import { tripService, TripStatus, Trip, TripStop } from '@/services/tripService';
import { quotationService, RateCard } from '@/services/quotationService';
import { useTripSlotsState, TripSlot } from '@/hooks/useTripSlotsState';
import { useTripRateLookup } from '@/hooks/useTripRateLookup';
import { useFormKeyboardShortcuts } from '@/hooks/useFormKeyboardShortcuts';
import { ComboboxOption } from '@/components/ui/combobox';
import {
  normalizeBillingType,
  normalizeRateCategory,
  normalizeVehicleClass,
} from '@/utils/taxonomyRegistry';
import { formatDriverDetails } from '@/utils/driverStatusUtils';
import { isRoundTripCategory, getLegEndpoints, isRouteLocked as isSharedRouteLocked, STOPS_FROZEN_IN } from '@mercon/shared-types';
import { formatInDeploymentTz, localDateTimeToUtcIso, useDeploymentTimezone } from '@/lib/datetime';
import { buildStopsFromSlot } from '@/utils/tripStopsHelper';

export {
  normalizeBillingType,
  normalizeRateCategory,
  normalizeVehicleClass,
  isRoundTripCategory,
  STOPS_FROZEN_IN,
};


export const getVehicleTypeFromCapacity = (capacityKg?: number | null): string => {
  if (capacityKg == null || capacityKg <= 0) return '40 FEET';
  const tons = capacityKg / 1000;
  if (tons <= 4) return '3-4 TON';
  if (tons <= 5) return '5 TON';
  if (tons <= 10) return '10 TON';
  if (tons <= 20) return '20 TON';
  return '40 FEET';
};

export const getActualCapacityLabel = (capacityKg?: number | null): string => {
  if (capacityKg == null || capacityKg <= 0) return '';
  const tons = capacityKg / 1000;
  return Number.isInteger(tons) ? `${tons} TON` : `${tons.toFixed(1)} TON`;
};

export function useEditTripForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tz = useDeploymentTimezone();

  const [status, setStatus] = useState<TripStatus>('Draft');
  const [contractCustomer, setContractCustomerRaw] = useState('');
  const [contractRateCategory, setContractRateCategory] = useState<string>('Single Trip');
  const [contractBillingType, setContractBillingType] = useState<string>('Extra');
  const [contractVehicleType, setContractVehicleType] = useState<string>('Flatbed');
  const [contractStep, setContractStep] = useState<1 | 2 | 3>(1);

  const [assignmentType, setAssignmentType] = useState<'own' | 'third_party'>('own');
  const [masterDriver, setMasterDriver] = useState('');
  const [masterVehicle, setMasterVehicle] = useState('');
  const [isManualRateOverride, setIsManualRateOverride] = useState(false);

  const [thirdPartyProviderId, setThirdPartyProviderId] = useState('');
  const [thirdPartyDriverName, setThirdPartyDriverName] = useState('');
  const [thirdPartyVehiclePlate, setThirdPartyVehiclePlate] = useState('');
  const [thirdPartyCost, setThirdPartyCost] = useState('');

  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [dayAssignments, setDayAssignments] = useState<Record<string, { driverId: string; vehicleId: string }>>({});

  // Modals & Previews
  const [isCreateDriverOpen, setIsCreateDriverOpen] = useState(false);
  const [isCreateVehicleOpen, setIsCreateVehicleOpen] = useState(false);
  const [isCreateCustomerOpen, setIsCreateCustomerOpen] = useState(false);
  const [isCreateProviderOpen, setIsCreateProviderOpen] = useState(false);

  const [previewDriver, setPreviewDriver] = useState<Driver | null>(null);
  const [previewVehicle, setPreviewVehicle] = useState<Vehicle | null>(null);
  const [previewCustomer, setPreviewCustomer] = useState<any | null>(null);
  const [previewThirdParty, setPreviewThirdParty] = useState<ThirdPartyProvider | null>(null);

  const [editCustomer, setEditCustomer] = useState<any | null>(null);
  const [editThirdParty, setEditThirdParty] = useState<ThirdPartyProvider | null>(null);
  const [editDriver, setEditDriver] = useState<Driver | null>(null);
  const [editVehicle, setEditVehicle] = useState<Vehicle | null>(null);

  const {
    contractSlots,
    setContractSlots,
    handleAddTripSlot,
    handleRemoveTripSlot,
    handleUpdateTripSlot,
    handleAddSlotIntermediate,
    handleRemoveSlotIntermediate,
    handleUpdateSlotIntermediate,
    handleAddSlotReturnIntermediate,
    handleRemoveSlotReturnIntermediate,
    handleUpdateSlotReturnIntermediate,
  } = useTripSlotsState();

  // Fetch target trip
  const { data: trip, isLoading: isTripLoading, refetch } = useQuery({
    queryKey: ['trip', id],
    queryFn: () => tripService.getById(id!),
    enabled: !!id,
  });

  // Master Data Queries
  const { data: customersRes } = useQuery({
    queryKey: ['customers-select'],
    queryFn: () => customerService.getAll({ per_page: 150 }),
  });

  const { data: driversRes } = useQuery({
    queryKey: ['drivers-select'],
    queryFn: () => driverService.getAll({ per_page: 1000, mode: 'lookup' }),
  });

  const { data: vehiclesRes } = useQuery({
    queryKey: ['vehicles-select'],
    queryFn: () => vehicleService.getAll({ per_page: 1000, mode: 'lookup' }),
  });

  const { data: thirdPartyRes } = useQuery({
    queryKey: ['third-party-providers-select'],
    queryFn: () => thirdPartyService.getAll({ per_page: 1000 }),
  });

  const customers = Array.isArray(customersRes?.data) ? customersRes.data : Array.isArray(customersRes) ? (customersRes as any) : [];
  const rawDriversData = (driversRes as any)?.data;
  const drivers: Driver[] = Array.isArray(rawDriversData) ? rawDriversData : Array.isArray(rawDriversData?.data) ? rawDriversData.data : Array.isArray(driversRes) ? (driversRes as any) : [];
  const vehicles: Vehicle[] = Array.isArray(vehiclesRes?.data) ? vehiclesRes.data : Array.isArray(vehiclesRes) ? (vehiclesRes as any) : [];
  const thirdPartyProviders: ThirdPartyProvider[] = Array.isArray(thirdPartyRes?.data?.data) ? thirdPartyRes.data.data : Array.isArray(thirdPartyRes?.data) ? (thirdPartyRes.data as any) : Array.isArray(thirdPartyRes) ? (thirdPartyRes as any) : [];

  const customerOptions = useMemo<ComboboxOption[]>(() => {
    return customers.map((c: any) => ({
      value: c.id,
      label: c.name,
      keywords: `${c.name} ${c.phone || ''} ${c.payment_terms || ''}`,
    }));
  }, [customers]);

  const driverOptions = useMemo<ComboboxOption[]>(() => {
    return drivers.map((d) => {
      const fullName = `${d.first_name || ''} ${d.last_name || ''}`.trim() || `Driver #${d.id.slice(0, 5)}`;
      const detailsStr = formatDriverDetails(d);
      const isNotAvailable = Boolean(d.status && d.status !== 'Available' && d.status.toLowerCase() !== 'available');
      return {
        value: d.id,
        label: `${fullName} (${detailsStr})`,
        selectedLabel: fullName,
        disabled: isNotAvailable,
        keywords: `${fullName} ${detailsStr} ${d.phone_primary || ''} ${d.license_number || ''}`,
        raw: d,
      } as ComboboxOption;
    });
  }, [drivers]);

  const vehicleOptions = useMemo<ComboboxOption[]>(() => {
    return vehicles.map((v) => {
      const className = v.asset_type || (v as any).class_name || (v as any).className || 'Truck';
      const make = (v as any).make || '';
      const model = (v as any).model || '';
      return {
        value: v.id,
        label: `Plate: ${v.plate_number} (${className})`,
        selectedLabel: v.plate_number,
        keywords: `${v.plate_number} ${className} ${make} ${model}`,
        raw: v,
      };
    });
  }, [vehicles]);

  // Rate Lookup Context
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
    1
  );

  // Populate state when trip data arrives
  const populateFormWithTrip = useCallback((tripData: Trip) => {
    setStatus(tripData.status);
    
    // Set customer ID (UUID) for Combobox selection
    const targetCustId = tripData.customer?.id || (tripData as any).customer_id || (tripData.customer ? customers.find((c: any) => c.name === tripData.customer?.name)?.id : '');
    setContractCustomerRaw(targetCustId || '');

    setContractBillingType(normalizeBillingType(tripData.billing_type || 'Extra'));
    setContractRateCategory(normalizeRateCategory(tripData.rate_category || 'Single Trip'));
    setContractVehicleType(normalizeVehicleClass(tripData.vehicle?.asset_type || (tripData as any).vehicle_class || getVehicleTypeFromCapacity(tripData.vehicle?.capacity_kg)));

    const thirdPartyId = (tripData as any).third_party_provider_id || (tripData as any).thirdPartyProviderId || (tripData as any).third_party_provider?.id;
    if (thirdPartyId) {
      setAssignmentType('third_party');
      setThirdPartyProviderId(thirdPartyId);
      setThirdPartyDriverName((tripData as any).third_party_driver_name || '');
      setThirdPartyVehiclePlate((tripData as any).third_party_vehicle_plate || '');
      setThirdPartyCost((tripData as any).third_party_cost != null ? String((tripData as any).third_party_cost) : '');
    } else {
      setAssignmentType('own');
      setMasterDriver(tripData.driver?.id || '');
      setMasterVehicle(tripData.vehicle?.id || '');
    }

    const outboundEndpoints = getLegEndpoints(tripData, 0);
    const returnEndpoints = getLegEndpoints(tripData, 1);

    const pickupStop = outboundEndpoints.loading;
    const dropoffStop = outboundEndpoints.delivery;
    const intermediates = outboundEndpoints.intermediates;

    const returnPickupStop = returnEndpoints.loading;
    const returnDropoffStop = returnEndpoints.delivery;
    const returnIntermediates = returnEndpoints.intermediates;

    const rawDate = (tripData as any).pickup_date || (tripData as any).scheduled_date || (tripData as any).date;
    const fallbackDateStr = rawDate ? String(rawDate).slice(0, 10) : new Date().toISOString().slice(0, 10);

    const startDateStr = tripData.planned_start
      ? formatInDeploymentTz(tripData.planned_start, tz, 'yyyy-MM-dd')
      : fallbackDateStr;
    const pickupTimeStr = tripData.planned_start
      ? formatInDeploymentTz(tripData.planned_start, tz, 'HH:mm')
      : '08:00';

    const endDateStr = tripData.planned_end
      ? formatInDeploymentTz(tripData.planned_end, tz, 'yyyy-MM-dd')
      : startDateStr;
    const dropoffTimeStr = tripData.planned_end
      ? formatInDeploymentTz(tripData.planned_end, tz, 'HH:mm')
      : '18:00';

    const driverPayoutVal =
      (tripData as any).driver_payout != null
        ? String((tripData as any).driver_payout)
        : tripData.trip_charges != null
        ? String(tripData.trip_charges)
        : '';

    const slotObj: TripSlot = {
      id: 'slot-1',
      origin: pickupStop?.location_name || pickupStop?.location_address || '',
      originLocationId: (pickupStop as any)?.location_id || (pickupStop as any)?.locationId || null,
      // Carry the saved address/coordinates through, so a route save that
      // rebuilds the stops doesn't wipe them (navigation + geofence need them).
      originAddress: pickupStop?.location_address || undefined,
      originLat: pickupStop?.location_lat ?? null,
      originLng: pickupStop?.location_lng ?? null,
      originPrecision: (pickupStop as any)?.location_coordinate_precision || undefined,
      destination: dropoffStop?.location_name || dropoffStop?.location_address || '',
      destinationLocationId: (dropoffStop as any)?.location_id || (dropoffStop as any)?.locationId || null,
      destinationAddress: dropoffStop?.location_address || undefined,
      destinationLat: dropoffStop?.location_lat ?? null,
      destinationLng: dropoffStop?.location_lng ?? null,
      destinationPrecision: (dropoffStop as any)?.location_coordinate_precision || undefined,
      returnOriginLat: returnPickupStop?.location_lat ?? null,
      returnOriginLng: returnPickupStop?.location_lng ?? null,
      returnDestinationLat: returnDropoffStop?.location_lat ?? null,
      returnDestinationLng: returnDropoffStop?.location_lng ?? null,
      intermediateLocations: intermediates.map((s) => s.location_name || s.location_address || ''),
      intermediateLocationIds: intermediates.map((s) => (s as any)?.location_id || (s as any)?.locationId || null),
      returnOrigin: returnPickupStop?.location_name || returnPickupStop?.location_address || '',
      returnOriginLocationId: (returnPickupStop as any)?.location_id || (returnPickupStop as any)?.locationId || null,
      returnDestination: returnDropoffStop?.location_name || returnDropoffStop?.location_address || '',
      returnDestinationLocationId: (returnDropoffStop as any)?.location_id || (returnDropoffStop as any)?.locationId || null,
      returnIntermediateLocations: returnIntermediates.map((s) => s.location_name || s.location_address || ''),
      returnIntermediateLocationIds: returnIntermediates.map((s) => (s as any)?.location_id || (s as any)?.locationId || null),
      billingAmount: tripData.billing_amount !== undefined && tripData.billing_amount !== null ? String(tripData.billing_amount) : '',
      tripCharges: driverPayoutVal,
      driverPayout: driverPayoutVal,
      date: startDateStr,
      dropoffDate: endDateStr,
      pickupTime: pickupTimeStr,
      dropoffTime: dropoffTimeStr,
    };

    setContractSlots([slotObj]);
  }, [customers, setContractSlots, tz]);

  useEffect(() => {
    if (trip) {
      populateFormWithTrip(trip);
    }
  }, [trip, customers, populateFormWithTrip]);

  // Edit Rules based on Trip Status
  const isRouteLocked = isSharedRouteLocked(status);
  const isScheduleLocked = STOPS_FROZEN_IN.includes(status);
  const isAssignmentLocked = STOPS_FROZEN_IN.includes(status);
  const isBaseBillingLocked = ['InTransit', 'Completed', 'Invoiced', 'Cancelled'].includes(status);
  const isFinancialsLocked = ['Invoiced', 'Cancelled'].includes(status);
  const isStopsFrozen = STOPS_FROZEN_IN.includes(status);

  // Mutations
  const updateStatusMutation = useMutation({
    mutationFn: (newStatus: TripStatus) => tripService.updateStatus(id!, newStatus),
  });

  const dispatchMutation = useMutation({
    mutationFn: (payload: { driver_id?: string; vehicle_id?: string }) => tripService.dispatch(id!, payload),
  });

  const updateFinancialsMutation = useMutation({
    mutationFn: (payload: { billing_amount?: number; trip_charges?: number; driver_payout?: number; update_quotation_driver_payout?: boolean }) => tripService.updateFinancials(id!, payload),
  });

  const updateStopsMutation = useMutation({
    mutationFn: (payload: any) => tripService.updateStops(id!, payload),
  });

  const isSubmitting = updateStatusMutation.isPending || dispatchMutation.isPending || updateFinancialsMutation.isPending || updateStopsMutation.isPending;

  const handleReset = () => {
    if (trip) {
      populateFormWithTrip(trip);
      toast.info('Form reset to original trip state');
    }
  };

  const handleSave = async () => {
    if (!trip || !id) return;

    try {
      // 1. Route & Schedule Update (if trip.status is editable)
      const isCurrentRouteLocked = isSharedRouteLocked(trip.status);
      if (!isCurrentRouteLocked) {
        const primarySlot = contractSlots[0] || {};
        const isRound = isRoundTripCategory(contractRateCategory);
        const proposedStops = buildStopsFromSlot(primarySlot, isRound);

        let proposedStartIso: string | null = null;
        if (primarySlot.date && primarySlot.pickupTime) {
          proposedStartIso = localDateTimeToUtcIso(primarySlot.date, primarySlot.pickupTime, tz);
        }

        let proposedEndIso: string | null = null;
        if ((primarySlot.dropoffDate || primarySlot.date) && primarySlot.dropoffTime) {
          proposedEndIso = localDateTimeToUtcIso(primarySlot.dropoffDate || primarySlot.date, primarySlot.dropoffTime, tz);
        }

        const dbStops = (trip.stops || []).filter((s) => !(s as any).deletedAt);
        let routeOrScheduleChanged = false;

        if (proposedStartIso) {
          const currentStartIso = trip.planned_start ? new Date(trip.planned_start).toISOString() : null;
          if (!currentStartIso || new Date(currentStartIso).getTime() !== new Date(proposedStartIso).getTime()) {
            routeOrScheduleChanged = true;
          }
        }

        if (proposedEndIso) {
          const currentEndIso = trip.planned_end ? new Date(trip.planned_end).toISOString() : null;
          if (!currentEndIso || new Date(currentEndIso).getTime() !== new Date(proposedEndIso).getTime()) {
            routeOrScheduleChanged = true;
          }
        }

        if (!routeOrScheduleChanged) {
          if (dbStops.length !== proposedStops.length) {
            routeOrScheduleChanged = true;
          } else {
            for (let i = 0; i < dbStops.length; i++) {
              const dbS = dbStops[i];
              const propS = proposedStops[i];
              const dbLocId = (dbS as any).location_id || (dbS as any).locationId || null;
              const propLocId = propS.location_id || null;
              const dbName = (dbS.location_name || dbS.location?.name || '').trim().toLowerCase();
              const propName = (propS.location_name || '').trim().toLowerCase();

              // No stop_type comparison: roles are positional, and older trips
              // store intermediate stops as 'Rest' where the builder emits
              // 'Dropoff' — comparing it would rewrite them on every save.
              if (
                (dbS.leg_index ?? 0) !== propS.leg_index ||
                dbLocId !== propLocId ||
                dbName !== propName
              ) {
                routeOrScheduleChanged = true;
                break;
              }
            }
          }
        }

        if (routeOrScheduleChanged) {
          const routePayload = {
            stops: proposedStops,
            planned_start: proposedStartIso || undefined,
            planned_end: proposedEndIso || undefined,
            isRound,
          };
          await updateStopsMutation.mutateAsync(routePayload);
        }
      }

      // 2. Dispatch / Assignment Update (if not locked)
      if (!isAssignmentLocked) {
        const driverChanged = trip?.driver?.id !== masterDriver;
        const vehicleChanged = trip?.vehicle?.id !== masterVehicle;
        if (assignmentType === 'own' && (driverChanged || vehicleChanged)) {
          await dispatchMutation.mutateAsync({
            driver_id: masterDriver || undefined,
            vehicle_id: masterVehicle || undefined,
          });
        }
      }

      // 3. Status Update
      if (status !== trip.status) {
        await updateStatusMutation.mutateAsync(status);
      }

      // 4. Financials Update (if not locked)
      if (!isFinancialsLocked) {
        const currentSlot = contractSlots[0] || {};
        const parsedBilling = parseFloat(currentSlot.billingAmount || '0');
        const rawPayout = currentSlot.driverPayout !== undefined && currentSlot.driverPayout !== '' ? currentSlot.driverPayout : currentSlot.tripCharges;
        const parsedCharges = parseFloat(rawPayout || '0');
        const newBilling = isNaN(parsedBilling) ? undefined : parsedBilling;
        const newCharges = isNaN(parsedCharges) ? undefined : parsedCharges;

        const currentDbPayout = (trip as any).driver_payout != null ? Number((trip as any).driver_payout) : (trip.trip_charges != null ? Number(trip.trip_charges) : undefined);
        const currentDbBilling = trip.billing_amount != null ? Number(trip.billing_amount) : undefined;

        if (
          (newBilling !== undefined && newBilling !== currentDbBilling) ||
          (newCharges !== undefined && newCharges !== currentDbPayout) ||
          currentSlot.driverPayoutModified
        ) {
          await updateFinancialsMutation.mutateAsync({
            billing_amount: newBilling,
            driver_payout: newCharges,
            trip_charges: newCharges,
            update_quotation_driver_payout: Boolean(currentSlot.driverPayoutModified || currentSlot.updateQuotationPayout),
          });
        }
      }

      queryClient.invalidateQueries({ queryKey: ['trip', id] });
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      toast.success('Trip updated successfully');
      navigate(`/trips/${id}`);
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || err.message || 'Failed to update trip';
      toast.error(msg);
    }
  };

  useFormKeyboardShortcuts({
    onSave: () => {
      if (!isSubmitting) handleSave();
    },
    onCancel: () => navigate(`/trips/${id}`),
    isSubmitting,
  });

  const setContractCustomer = (cId: string) => {
    setContractCustomerRaw(cId);
  };

  const handleDriverChange = (val: string) => {
    if (isAssignmentLocked) return;
    setMasterDriver(val);
  };

  const handleVehicleChange = (val: string) => {
    if (isAssignmentLocked) return;
    setMasterVehicle(val);
  };

  const handleSlotLocationChange = (slotId: string, field: 'origin' | 'destination', locName: string, locObj: any) => {
    if (isRouteLocked) {
      toast.warning(`Route is locked for trips in ${status} status`);
      return;
    }
    handleUpdateTripSlot(slotId, {
      [field]: locName,
      [`${field}LocationId`]: locObj?.id || null,
    });
  };

  const handleApplyRecentRoute = (route: any) => {
    if (isRouteLocked) return;
    if (route && contractSlots.length > 0) {
      handleUpdateTripSlot(contractSlots[0].id, {
        origin: route.origin,
        destination: route.destination,
      });
    }
  };

  const marginMetrics = useMemo(() => {
    const primarySlot = contractSlots[0] || {};
    const rev = parseFloat(primarySlot.billingAmount || '0') || 0;
    const cost = assignmentType === 'third_party' ? parseFloat(thirdPartyCost || '0') || 0 : parseFloat(primarySlot.tripCharges || '0') || 0;
    const margin = rev - cost;
    const marginPct = rev > 0 ? (margin / rev) * 100 : 0;
    return { rev, cost, margin, marginPct };
  }, [contractSlots, assignmentType, thirdPartyCost]);

  return {
    id,
    trip,
    isTripLoading,
    status,
    setStatus,
    contractCustomer,
    setContractCustomer,
    customers,
    customerOptions,
    customerRateCards,
    contractSlots,
    contractRateCategory,
    setContractRateCategory,
    contractBillingType,
    setContractBillingType,
    contractVehicleType,
    setContractVehicleType,
    contractStep,
    setContractStep,
    selectedMonth,
    setSelectedMonth,
    selectedDates,
    setSelectedDates,
    dayAssignments,
    setDayAssignments,
    assignmentType,
    setAssignmentType,
    masterDriver,
    setMasterDriver,
    masterVehicle,
    setMasterVehicle,
    handleDriverChange,
    handleVehicleChange,
    vehicleOptions,
    driverOptions,
    thirdPartyProviderId,
    setThirdPartyProviderId,
    thirdPartyProviders,
    thirdPartyVehiclePlate,
    setThirdPartyVehiclePlate,
    thirdPartyDriverName,
    setThirdPartyDriverName,
    thirdPartyCost,
    setThirdPartyCost,
    marginMetrics,
    drivers,
    vehicles,
    isSubmitting,
    isStopsFrozen,
    isRouteLocked,
    isScheduleLocked,
    isAssignmentLocked,
    isBaseBillingLocked,
    isFinancialsLocked,
    handleReset,
    handleSave,
    handleAddSlotIntermediate,
    handleRemoveTripSlot,
    handleSlotLocationChange,
    handleUpdateTripSlot,
    handleRemoveSlotIntermediate,
    handleUpdateSlotIntermediate,
    handleAddSlotReturnIntermediate,
    handleRemoveSlotReturnIntermediate,
    handleUpdateSlotReturnIntermediate,
    recentRoutesList: [],
    handleApplyRecentRoute,
    isRoundTripCategory,
    normalizeRateCategory,
    getAvailableRateCardsForLane,
    handleOpenCreateQuotation,
    setIsManualRateOverride,
    isCreateDriverOpen,
    setIsCreateDriverOpen,
    isCreateVehicleOpen,
    setIsCreateVehicleOpen,
    isCreateCustomerOpen,
    setIsCreateCustomerOpen,
    isCreateProviderOpen,
    setIsCreateProviderOpen,
    previewDriver,
    setPreviewDriver,
    previewVehicle,
    setPreviewVehicle,
    previewCustomer,
    setPreviewCustomer,
    previewThirdParty,
    setPreviewThirdParty,
    editCustomer,
    setEditCustomer,
    editThirdParty,
    setEditThirdParty,
    editDriver,
    setEditDriver,
    editVehicle,
    setEditVehicle,
    handleDriverCreated: (d: any) => {
      setMasterDriver(d.id);
      queryClient.invalidateQueries({ queryKey: ['drivers-select'] });
    },
  };
}

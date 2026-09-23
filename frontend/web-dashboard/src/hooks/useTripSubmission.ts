import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { tripService, BulkImportTripRow, BulkImportResult, TripStatus } from '@/services/tripService';
import { analyzePastDateRows, applyPastStatusToRows, PastDateAnalysis } from '@/utils/pastDateTripUtils';
import { isUuid } from '@/lib/utils';
import { localDateTimeToUtcIso, useDeploymentTimezone } from '@/lib/datetime';
import { isRoundTripCategory, addDays } from './useCreateTripForm';

export function useTripSubmission(
  contractCustomer: string,
  contractSlots: any[],
  contractVehicleType: string,
  contractRateCategory: string,
  contractBillingType: string,
  assignmentType: string,
  masterDriver: string,
  masterCoDriver: string,
  masterVehicle: string,
  thirdPartyProviderId: string,
  thirdPartyDriverName: string,
  thirdPartyDriverPhone: string,
  thirdPartyVehiclePlate: string,
  thirdPartyCost: string,
  awbNumber: string,
  dayAssignments: Record<string, any>,
  selectedDates: string[],
  setContractStep: React.Dispatch<React.SetStateAction<1 | 2 | 3>>,
  setSelectedDates: (dates: string[]) => void,
  setDayAssignments: (assignments: any) => void,
  setParsedRows: (rows: any[]) => void,
  setImportedFile: (file: File | null) => void,
  setParseError: (err: string | null) => void
) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tz = useDeploymentTimezone();

  const [submissionResult, setSubmissionResult] = useState<BulkImportResult | null>(null);
  const [pastDateModalOpen, setPastDateModalOpen] = useState(false);
  const [pendingRows, setPendingRows] = useState<BulkImportTripRow[] | null>(null);
  const [pastDateAnalysis, setPastDateAnalysis] = useState<PastDateAnalysis | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});

  const bulkMutation = useMutation({
    mutationFn: (rows: BulkImportTripRow[]) => tripService.bulkImport(rows),
    onSuccess: (data) => {
      setSubmissionResult(data);
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      queryClient.invalidateQueries({ queryKey: ['trips-kpi-summary'] });
      queryClient.invalidateQueries({ queryKey: ['trips-kpi-period'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-trips'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['rate-cards'] });
      queryClient.invalidateQueries({ queryKey: ['rate-cards-summary'] });
      queryClient.invalidateQueries({ queryKey: ['rate-cards-customer-lookup'] });

      if (data.imported >= 1 && (data.failed === 0 || !data.failed)) {
        toast.success(data.imported === 1 ? 'Trip created successfully' : `${data.imported} Trips created successfully`);
        navigate('/trips');
      } else {
        const failedRows = (data?.results || []).filter((r: any) => !r.success);
        const errDetails = failedRows.map((r: any) => `Row #${r.row}: ${r.error || 'Failed'}`).join(' • ');
        toast.error(
          data.imported > 0
            ? `${data.imported} succeeded, ${data.failed} failed`
            : `Trip creation failed (${data.failed || 1} rows)`,
          {
            description: errDetails || 'Check inputs and try again.',
            duration: 10000,
          }
        );
      }
    },
    onError: (err: any) => {
      const errRes = err?.response?.data?.error;
      const details = errRes?.details;

      if (Array.isArray(details) && details.length > 0) {
        const detailMsgs = details.map((d: any) => `${d.path ? `[${d.path}]: ` : ''}${d.message}`).join(' • ');
        toast.error(`Validation Failed (${errRes?.code || '400'})`, {
          description: detailMsgs,
          duration: 10000,
        });
      } else {
        const mainMsg = errRes?.message || err?.message || 'Server returned HTTP 400 Bad Request';
        toast.error(`Trip Creation Failed`, {
          description: mainMsg,
          duration: 10000,
        });
      }
    },
  });

  const executeBulkSubmit = (rows: BulkImportTripRow[]) => {
    const analysis = analyzePastDateRows(rows);
    setPendingRows(rows);
    setPastDateAnalysis(analysis);
    setPastDateModalOpen(true);
  };

  const handlePastDateConfirm = (selectedStatus: TripStatus | 'Incompleted') => {
    if (!pendingRows) return;
    const finalRows = applyPastStatusToRows(pendingRows, selectedStatus as any);
    setPastDateModalOpen(false);
    setPendingRows(null);
    bulkMutation.mutate(finalRows);
  };

  const validateAndFocusErrors = (): boolean => {
    const errors: Record<string, boolean> = {};
    let firstErrId: string | null = null;
    let firstErrMsg: string | null = null;

    if (!contractCustomer) {
      errors['customer'] = true;
      firstErrId = 'field-customer';
      firstErrMsg = 'Please select a customer account.';
    }

    if (!contractSlots || contractSlots.length === 0) {
      toast.error('Please configure at least one route slot.');
      setContractStep(1);
      return false;
    }

    for (let i = 0; i < contractSlots.length; i++) {
      const slot = contractSlots[i];

      if (!slot.origin || !slot.origin.trim()) {
        errors[`origin-${slot.id}`] = true;
        errors['origin'] = true;
        if (!firstErrId) {
          firstErrId = `field-origin-${slot.id}`;
          firstErrMsg = `Slot #${i + 1}: Origin location is required.`;
        }
      }

      if (!slot.destination || !slot.destination.trim()) {
        errors[`destination-${slot.id}`] = true;
        errors['destination'] = true;
        if (!firstErrId) {
          firstErrId = `field-destination-${slot.id}`;
          firstErrMsg = `Slot #${i + 1}: Destination location is required.`;
        }
      }

      if (!slot.billingAmount || Number(slot.billingAmount) <= 0) {
        errors[`billingAmount-${slot.id}`] = true;
        errors['billingAmount'] = true;
        if (!firstErrId) {
          firstErrId = `field-billing-amount-${slot.id}`;
          firstErrMsg = `Slot #${i + 1}: Customer Billing Rate is required.`;
        }
      }

      const is3PLAssignment = assignmentType === 'third_party' || assignmentType === '3pl';

      if (is3PLAssignment) {
        if (!thirdPartyCost || Number(thirdPartyCost) <= 0) {
          errors['thirdPartyCost'] = true;
          if (!firstErrId) {
            firstErrId = 'field-3pl-cost';
            firstErrMsg = '3PL Cost (SAR) is required.';
          }
        }
      } else {
        if (slot.driverPayout === undefined || slot.driverPayout === null || slot.driverPayout === '' || Number(slot.driverPayout) <= 0) {
          errors[`driverPayout-${slot.id}`] = true;
          errors['driverPayout'] = true;
          if (!firstErrId) {
            firstErrId = `field-driver-payout-${slot.id}`;
            firstErrMsg = `Slot #${i + 1}: Driver Payout Rate is required.`;
          }
        }
      }

      const isMissingPickup = !slot.date || !slot.pickupTime;
      const isMissingDropoff = !slot.dropoffDate || !slot.dropoffTime;

      if (isMissingPickup || isMissingDropoff) {
        errors[`schedule-${slot.id}`] = true;
        errors['schedule'] = true;

        if (isMissingPickup) {
          errors[`pickup-${slot.id}`] = true;
          errors['pickup'] = true;
          if (!firstErrId) {
            firstErrId = `field-pickup-${slot.id}`;
            firstErrMsg = `Slot #${i + 1}: Pickup schedule date & time are required.`;
          }
        }

        if (isMissingDropoff) {
          errors[`dropoff-${slot.id}`] = true;
          errors['dropoff'] = true;
          if (!firstErrId) {
            firstErrId = `field-dropoff-${slot.id}`;
            firstErrMsg = `Slot #${i + 1}: Drop-off time must be after the start time.`;
          }
        }
      } else {
        try {
          const dropoffDateVal = slot.dropoffDate || slot.date;
          const plannedStart = localDateTimeToUtcIso(slot.date, slot.pickupTime, tz);
          const plannedEnd = localDateTimeToUtcIso(dropoffDateVal, slot.dropoffTime, tz);
          const startMs = new Date(plannedStart).getTime();
          const endMs = new Date(plannedEnd).getTime();
          if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) {
            errors[`schedule-${slot.id}`] = true;
            errors['schedule'] = true;
            errors[`dropoff-${slot.id}`] = true;
            errors['dropoff'] = true;
            if (!firstErrId) {
              firstErrId = `field-dropoff-${slot.id}`;
              firstErrMsg = `Slot #${i + 1}: Drop-off time must be after the start time.`;
            }
          }
        } catch (err) {
          errors[`schedule-${slot.id}`] = true;
          errors['schedule'] = true;
          errors[`dropoff-${slot.id}`] = true;
          errors['dropoff'] = true;
          if (!firstErrId) {
            firstErrId = `field-dropoff-${slot.id}`;
            firstErrMsg = `Slot #${i + 1}: Invalid schedule format.`;
          }
        }
      }
    }

    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      setContractStep(1);
      if (firstErrMsg) toast.error(firstErrMsg);

      setTimeout(() => {
        if (firstErrId) {
          const el = document.getElementById(firstErrId);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const input = el.querySelector('input, select, button') as HTMLElement;
            input?.focus();
          }
        }
      }, 100);

      return false;
    }

    return true;
  };

  const handleContractSubmit = async () => {
    if (!validateAndFocusErrors()) return;

    const slotsToSaveAsQuotation = contractSlots.filter(
      (slot) => (slot.saveAsQuotation || slot.saveAsRateCard) && Number(slot.billingAmount) > 0
    );
    if (slotsToSaveAsQuotation.length > 0) {
      const { quotationService } = await import('@/services/quotationService');
      const { locationService } = await import('@/services/locationService');

      await Promise.all(
        slotsToSaveAsQuotation.map(async (slot) => {
          let origId = slot.originLocationId;
          let destId = slot.destinationLocationId;

          if (!origId && slot.origin.trim()) {
            try {
              const createdOrig = await locationService.create({
                customerId: contractCustomer || 'default-customer-id',
                name: slot.origin.trim(),
                lat: slot.originLat ?? null,
                lng: slot.originLng ?? null,
              });
              origId = createdOrig.id;
            } catch (err) {
              console.error(`Failed to ensure origin location '${slot.origin}':`, err);
            }
          }

          if (!destId && slot.destination.trim()) {
            try {
              const createdDest = await locationService.create({
                customerId: contractCustomer || 'default-customer-id',
                name: slot.destination.trim(),
                lat: slot.destinationLat ?? null,
                lng: slot.destinationLng ?? null,
              });
              destId = createdDest.id;
            } catch (err) {
              console.error(`Failed to ensure destination location '${slot.destination}':`, err);
            }
          }

          const intermediateStops = (slot.intermediateLocations || []).map((locVal: string, idx: number) => {
            const locId = slot.intermediateLocationIds?.[idx] || (isUuid(locVal) ? locVal : null);
            return {
              sequence: idx + 2,
              location_id: locId || null,
              source_label: locVal || null,
              stop_type: 'Dropoff',
            };
          });

          const quotationStops = [
            { sequence: 1, location_id: origId || null, source_label: slot.origin.trim() || null, stop_type: 'Pickup' },
            ...intermediateStops,
            { sequence: intermediateStops.length + 2, location_id: destId || null, source_label: slot.destination.trim() || null, stop_type: 'Dropoff' },
          ];

          const is3PLAssignment = assignmentType === 'third_party' || assignmentType === '3pl';
          const slotDriverPayout = !is3PLAssignment && slot.driverPayout !== undefined ? Number(slot.driverPayout) : (!is3PLAssignment ? (Number(slot.tripCharges) || null) : null);
          return quotationService
            .create({
              name: `${slot.origin.trim() || 'Origin'} → ${slot.destination.trim() || 'Destination'}`,
              rate: Number(slot.billingAmount),
              base_price: Number(slot.billingAmount),
              driver_payout: slotDriverPayout,
              customerId: contractCustomer,
              origin_location_id: origId || null,
              destination_location_id: destId || null,
              origin_name: origId ? null : slot.origin.trim() || null,
              destination_name: destId ? null : slot.destination.trim() || null,
              origin_lat: slot.originLat ?? null,
              origin_lng: slot.originLng ?? null,
              destination_lat: slot.destinationLat ?? null,
              destination_lng: slot.destinationLng ?? null,
              vehicle_class: contractVehicleType || null,
              source_vehicle_label: contractVehicleType || null,
              vehicle_type: contractVehicleType || null,
              line_type: contractRateCategory || null,
              billing_type: contractBillingType || null,
              pricing_basis: slot.pricingBasis || 'Per Trip',
              stops: quotationStops,
              reason: slot.rateReason?.trim() || `Created inline during trip dispatch for ${slot.origin || 'origin'} → ${slot.destination || 'destination'} (${contractVehicleType || 'Standard'})`,
              source: 'TRIP_CREATION',
            })
            .then((res: any) => {
              const createdQuo = res?.data || res;
              const quoId = createdQuo?.id;
              if (quoId) {
                slot.rateCardId = quoId;
                slot.matchedRateCard = createdQuo;
              }
              toast.success(`Quotation '${createdQuo?.name || slot.origin + ' → ' + slot.destination}' saved to Quotations ledger!`);
              return createdQuo;
            })
            .catch((err: any) => {
              const errMsg = err.response?.data?.error?.message || err.message || 'Unknown error';
              console.error(`Failed to save quotation for slot ${slot.id}:`, err);
              toast.error(`Couldn't save quotation for ${slot.origin} → ${slot.destination}: ${errMsg}`);
            });
        })
      );

      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      queryClient.invalidateQueries({ queryKey: ['quotations-select'] });
      queryClient.invalidateQueries({ queryKey: ['quotations-select-all'] });
      queryClient.invalidateQueries({ queryKey: ['quotations-all'] });
      queryClient.invalidateQueries({ queryKey: ['quotations', 'select-all'] });
      queryClient.invalidateQueries({ queryKey: ['rate-cards'] });
      queryClient.invalidateQueries({ queryKey: ['rate-card-lookup'] });
      queryClient.invalidateQueries({ queryKey: ['locations-list'] });
    }

    const rows: BulkImportTripRow[] = [];
    const isMonthlyMode = contractBillingType === 'Monthly' && selectedDates.length > 0;
    const datesToSchedule: Array<string | null> = isMonthlyMode ? selectedDates : [null];

    datesToSchedule.forEach((currentDateStr) => {
      contractSlots.forEach((slot) => {
        const date = currentDateStr || slot.date || new Date().toISOString().slice(0, 10);
        const dateKey = contractSlots.length > 1 ? `${date}::${slot.id}` : date;
        const assignment = dayAssignments[dateKey] || dayAssignments[date] || dayAssignments[slot.id] || { driverId: '', vehicleId: '' };

        const outboundStops = slot.intermediateLocations.map((s: string) => s.trim()).filter(Boolean);
        const returnStops = (slot.returnIntermediateLocations || []).map((s: string) => s.trim()).filter(Boolean);

        const outboundFeesSum = (slot.intermediateStopFees || []).reduce((sum: number, f: string) => sum + (Number(f) || 0), 0);
        const returnFeesSum = (slot.returnIntermediateStopFees || []).reduce((sum: number, f: string) => sum + (Number(f) || 0), 0);
        const baseAmount = Number(slot.billingAmount) || 0;
        const isMonthlySlot = (slot.pricingBasis === 'Per Month' || slot.pricingBasis === 'PER_MONTH' || (contractBillingType || '').toLowerCase().includes('monthly'));
        const resolvedTripBilling = isMonthlySlot && baseAmount > 0 ? (baseAmount / 30) : baseAmount;
        const totalAmount = resolvedTripBilling + outboundFeesSum + returnFeesSum;

        const isRound = isRoundTripCategory(contractRateCategory);
        let destString = slot.destination.trim();

        const returnStart = slot.returnOrigin?.trim() || slot.destination.trim();
        const returnEnd = slot.returnDestination?.trim() || slot.origin.trim();

        if (isRound) {
          const outboundChain = outboundStops.length > 0 ? `${outboundStops.join(' → ')} → ` : '';
          const returnChain = returnStops.length > 0 ? `${returnStops.join(' → ')} → ` : '';

          destString = `${outboundChain}${slot.destination.trim()} [RETURN: ${returnStart} → ${returnChain}${returnEnd}]`;
        } else if (outboundStops.length > 0) {
          destString = `${outboundStops.join(' → ')} → ${slot.destination.trim()}`;
        }

        // Build structured multi-leg stops with explicit leg_index
        const structuredStops: Array<{
          stop_sequence: number;
          leg_index: number;
          stop_type: string;
          location_name: string;
          location_address?: string | null;
          location_id?: string | null;
          lat?: number | null;
          lng?: number | null;
          coordinate_precision?: string | null;
          update_canonical_location?: boolean;
        }> = [];
        let seq = 1;

        const safeUuid = (id?: string | null) => (id && isUuid(id) ? id : null);

        // 1. Outbound Origin (leg 0)
        structuredStops.push({
          stop_sequence: seq++,
          leg_index: 0,
          stop_type: 'Pickup',
          location_name: slot.originName || slot.origin.trim(),
          location_address: slot.originAddress || null,
          location_id: safeUuid(slot.originLocationId),
          lat: slot.originLat ?? null,
          lng: slot.originLng ?? null,
          coordinate_precision: slot.originPrecision || (slot.originLat != null ? 'APPROXIMATE' : 'UNKNOWN'),
          update_canonical_location: slot.updateCanonicalOrigin === true,
        });

        // 2. Outbound Intermediate Stops (leg 0)
        outboundStops.forEach((stopName: string, idx: number) => {
          structuredStops.push({
            stop_sequence: seq++,
            leg_index: 0,
            stop_type: 'Dropoff',
            location_name: stopName,
            location_id: safeUuid(slot.intermediateLocationIds?.[idx]),
          });
        });

        // 3. Outbound Delivery (leg 0)
        structuredStops.push({
          stop_sequence: seq++,
          leg_index: 0,
          stop_type: 'Dropoff',
          location_name: slot.destinationName || slot.destination.trim(),
          location_address: slot.destinationAddress || null,
          location_id: safeUuid(slot.destinationLocationId),
          lat: slot.destinationLat ?? null,
          lng: slot.destinationLng ?? null,
          coordinate_precision: slot.destinationPrecision || (slot.destinationLat != null ? 'APPROXIMATE' : 'UNKNOWN'),
          update_canonical_location: slot.updateCanonicalDestination === true,
        });

        // 4. Return Leg (leg 1) if round trip
        if (isRound) {
          // Return Loading (leg 1)
          structuredStops.push({
            stop_sequence: seq++,
            leg_index: 1,
            stop_type: 'Pickup',
            location_name: returnStart,
            location_id: safeUuid(slot.returnOriginLocationId || (returnStart === slot.destination.trim() ? slot.destinationLocationId : null)),
          });

          // Return Intermediate Stops (leg 1)
          returnStops.forEach((stopName: string, idx: number) => {
            structuredStops.push({
              stop_sequence: seq++,
              leg_index: 1,
              stop_type: 'Dropoff',
              location_name: stopName,
              location_id: safeUuid(slot.returnIntermediateLocationIds?.[idx]),
            });
          });

          // Return Final Delivery (leg 1)
          structuredStops.push({
            stop_sequence: seq++,
            leg_index: 1,
            stop_type: 'Dropoff',
            location_name: returnEnd,
            location_id: safeUuid(slot.returnDestinationLocationId || (returnEnd === slot.origin.trim() ? slot.originLocationId : null)),
          });
        }

        let planned_end_val: string | undefined = undefined;
        if (slot.dropoffTime) {
          const isOvernightOrEarlier = slot.isOvernight || (slot.pickupTime && slot.dropoffTime <= slot.pickupTime);
          const targetDropoffDate = isOvernightOrEarlier ? addDays(date, 1) : (slot.dropoffDate && slot.dropoffDate >= date ? slot.dropoffDate : date);
          planned_end_val = localDateTimeToUtcIso(targetDropoffDate, slot.dropoffTime, tz);
        }

        if (assignmentType === 'third_party') {
          const costVal = thirdPartyCost ? Number(thirdPartyCost) : (Number(slot.tripCharges) || 0);
          rows.push({
            customer_id: contractCustomer,
            planned_start: localDateTimeToUtcIso(date, slot.pickupTime, tz),
            planned_end: planned_end_val,
            is_third_party: true,
            third_party_provider_id: safeUuid(thirdPartyProviderId) || undefined,
            third_party_driver_name: thirdPartyDriverName.trim() || undefined,
            third_party_driver_phone: thirdPartyDriverPhone.trim() || undefined,
            third_party_vehicle_plate: thirdPartyVehiclePlate.trim() || undefined,
            third_party_vehicle_type: contractVehicleType || undefined,
            third_party_cost: costVal,
            trip_charges: costVal,
            rate_category: contractRateCategory || undefined,
            billing_type: contractBillingType || undefined,
            vehicle_type: contractVehicleType || undefined,
            origin: slot.origin.trim() || undefined,
            destination: destString || undefined,
            stops: structuredStops,
            billing_amount: totalAmount > 0 ? totalAmount : undefined,
            rate_card_id: safeUuid(slot.rateCardId) || undefined,
            awb_number: awbNumber?.trim() || undefined,
            status: 'Scheduled',
          });
        } else {
          const driverId = (assignment.driverId && assignment.driverId !== 'unassigned')
            ? assignment.driverId
            : (masterDriver && masterDriver !== 'unassigned' ? masterDriver : undefined);

          const vehicleId = (assignment.vehicleId && assignment.vehicleId !== 'unassigned')
            ? assignment.vehicleId
            : (masterVehicle && masterVehicle !== 'unassigned' ? masterVehicle : undefined);

          const coDriverId = (assignment.coDriverId && assignment.coDriverId !== 'unassigned')
            ? assignment.coDriverId
            : (masterCoDriver && masterCoDriver !== 'unassigned' ? masterCoDriver : undefined);

          const baseRateCardPayout = Number(
            slot.driverPayout ??
            slot.tripCharges ??
            slot.matchedRateCard?.driver_payout ??
            (slot as any).quotation?.driver_payout ??
            0
          );
          const shouldUpdateQuotation = Boolean(slot.updateQuotationPayout || slot.driverPayoutModified);

          let finalDriverPayout = baseRateCardPayout;
          let finalCoDriverPayout = 0;

          if (coDriverId) {
            // Default equal 50/50 split of the saved rate card payout if co-driver is present
            finalDriverPayout = assignment.driverPayoutOverride !== undefined
              ? Number(assignment.driverPayoutOverride)
              : Math.round((baseRateCardPayout / 2) * 100) / 100;

            finalCoDriverPayout = assignment.coDriverPayoutOverride !== undefined
              ? Number(assignment.coDriverPayoutOverride)
              : Math.round((baseRateCardPayout / 2) * 100) / 100;
          } else {
            if (assignment.driverPayoutOverride !== undefined) {
              finalDriverPayout = Number(assignment.driverPayoutOverride);
            }
          }

          rows.push({
            customer_id: contractCustomer,
            planned_start: localDateTimeToUtcIso(date, slot.pickupTime, tz),
            planned_end: planned_end_val,
            driver_id: safeUuid(driverId) || undefined,
            co_driver_id: safeUuid(coDriverId) || undefined,
            vehicle_id: safeUuid(vehicleId) || undefined,
            rate_category: contractRateCategory || undefined,
            billing_type: contractBillingType || undefined,
            vehicle_type: contractVehicleType || undefined,
            origin: slot.origin.trim() || undefined,
            destination: destString || undefined,
            stops: structuredStops,
            billing_amount: totalAmount > 0 ? totalAmount : undefined,
            trip_charges: baseRateCardPayout, // total combined charges
            driver_charge: finalDriverPayout, // alias for legacy
            driver_payout: finalDriverPayout,
            co_driver_payout: finalCoDriverPayout,
            update_quotation_driver_payout: shouldUpdateQuotation,
            rate_card_id: safeUuid(slot.rateCardId || slot.matchedRateCard?.id) || undefined,
            awb_number: awbNumber?.trim() || undefined,
            status: 'Scheduled',
          });
        }
      });
    });

    executeBulkSubmit(rows);
  };

  const handleGridSubmit = (gridRows: any[]) => {
    const validRows = gridRows.filter((r) => r.customerId && r.date);
    if (validRows.length === 0) return;

    const rows: BulkImportTripRow[] = validRows.map((r) => ({
      customer_id: r.customerId,
      planned_start: r.date,
      driver_id: r.driverId || undefined,
      vehicle_id: r.vehicleId || undefined,
      rate_category: r.rateCategory || undefined,
      vehicle_type: r.vehicleType || undefined,
      origin: r.origin.trim() || undefined,
      destination: r.destination.trim() || undefined,
      billing_amount: r.amount ? Number(r.amount) : undefined,
      status: 'Scheduled',
    }));

    executeBulkSubmit(rows);
  };

  const handleFileSubmit = (parsedRows: any[]) => {
    if (parsedRows.length === 0) return;
    executeBulkSubmit(parsedRows);
  };

  const resetAll = () => {
    setContractStep(1);
    setSelectedDates([]);
    setDayAssignments({});
    setSubmissionResult(null);
    setParsedRows([]);
    setImportedFile(null);
    setParseError(null);
    bulkMutation.reset();
  };

  const handleDialogClose = () => {
    resetAll();
    navigate('/trips');
  };

  return {
    submissionResult,
    pastDateModalOpen,
    setPastDateModalOpen,
    pastDateAnalysis,
    handlePastDateConfirm,
    bulkMutation,
    handleContractSubmit,
    handleGridSubmit,
    handleFileSubmit,
    resetAll,
    handleDialogClose,
    fieldErrors,
    setFieldErrors,
    validateAndFocusErrors,
  };
}

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { tripService, BulkImportTripRow, BulkImportResult, TripStatus } from '@/services/tripService';
import { analyzePastDateRows, applyPastStatusToRows, PastDateAnalysis } from '@/utils/pastDateTripUtils';
import { localDateTimeToUtcIso, useDeploymentTimezone } from '@/lib/datetime';
import { buildQuotationFromSlot, buildTripRows } from '@mercon/shared-types';

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

          const is3PLAssignment = assignmentType === 'third_party' || assignmentType === '3pl';
          return quotationService
            .create(
              buildQuotationFromSlot(slot, {
                customerId: contractCustomer,
                vehicleType: contractVehicleType,
                rateCategory: contractRateCategory,
                billingType: contractBillingType,
                isThirdParty: is3PLAssignment,
                originLocationId: origId,
                destinationLocationId: destId,
              }) as any,
            )
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

    const rows = buildTripRows({
      customerId: contractCustomer,
      slots: contractSlots,
      vehicleType: contractVehicleType,
      rateCategory: contractRateCategory,
      billingType: contractBillingType,
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
      toUtcIso: (date, time) => localDateTimeToUtcIso(date, time, tz),
    }) as BulkImportTripRow[];

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

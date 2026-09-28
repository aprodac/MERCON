import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { tripService, BulkImportTripRow, BulkImportResult, TripStatus } from '@/services/tripService';
import { analyzePastDateRows, applyPastStatusToRows, PastDateAnalysis } from '@/utils/pastDateTripUtils';
import { localDateTimeToUtcIso, useDeploymentTimezone } from '@/lib/datetime';
import { clearSavedTripDraft } from '@/hooks/useTripDraftStorage';
import {
  applyPastTripStatus,
  buildQuotationFromSlot,
  buildTripRows,
  countPastTrips,
  resolveSlotDriverPayout,
  type TripImportRow,
  validateTripDraft,
} from '@mercon/shared-types';

type PastChoice = 'Completed' | 'Incomplete';

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
  // What the past-date modal confirms: the wizard's own trips, or rows from the grid / file import.
  const [pendingSubmit, setPendingSubmit] = useState<{ kind: 'contract' } | { kind: 'rows'; rows: BulkImportTripRow[] } | null>(null);
  const [pastDateAnalysis, setPastDateAnalysis] = useState<PastDateAnalysis | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});
  // True from the moment the user confirms until the server answers — covers the
  // quotation / location saves that run before the trips are sent.
  const [isPreparing, setIsPreparing] = useState(false);
  const busyRef = useRef(false);

  const toUtcIso = (date: string, time: string) => localDateTimeToUtcIso(date, time, tz);
  const is3PLAssignment = assignmentType === 'third_party' || assignmentType === '3pl';

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
      queryClient.invalidateQueries({ queryKey: ['quotations'] });

      const failedRows = (data?.results || []).filter((r: any) => !r.success);
      const errDetails = failedRows.map((r: any) => `Row #${r.row}: ${r.error || 'Failed'}`).join(' • ');

      if (data.imported >= 1) {
        // Some trips exist now — leave the form so submitting again can't create them twice.
        clearSavedTripDraft();
        if (!data.failed) {
          toast.success(data.imported === 1 ? 'Trip created successfully' : `${data.imported} Trips created successfully`);
        } else {
          toast.error(`${data.imported} created, ${data.failed} failed`, {
            description: `${errDetails} — create the failed ones again from New Trip.`,
            duration: 15000,
          });
        }
        navigate('/trips');
      } else {
        toast.error(`Trip creation failed (${data.failed || 1} rows)`, {
          description: errDetails || 'Check inputs and try again.',
          duration: 10000,
        });
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

  /** The rows the wizard will send — also what the review screen totals. */
  const buildContractRows = (quotationIds: Record<string, string> = {}): TripImportRow[] =>
    buildTripRows({
      customerId: contractCustomer,
      slots: contractSlots.map((s) => (quotationIds[s.id] ? { ...s, rateCardId: quotationIds[s.id] } : s)),
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
      // Extra charges are entered once (price panel) and added to every trip.
      charges: contractSlots[0]?.chargeLines || [],
      toUtcIso,
    });

  const validateAndFocusErrors = (): boolean => {
    const errors: Record<string, boolean> = {};
    let firstErrId: string | null = null;
    let firstErrMsg: string | null = null;
    const isMonthly = contractBillingType?.toLowerCase() === 'monthly';

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

      if (is3PLAssignment) {
        if (!thirdPartyCost || Number(thirdPartyCost) <= 0) {
          errors['thirdPartyCost'] = true;
          if (!firstErrId) {
            firstErrId = 'field-3pl-cost';
            firstErrMsg = '3PL Cost (SAR) is required.';
          }
        }
      } else if (!(resolveSlotDriverPayout(slot) > 0)) {
        // Same rule the trip rows use: an edited payout, else the quotation's.
        errors[`driverPayout-${slot.id}`] = true;
        errors['driverPayout'] = true;
        if (!firstErrId) {
          firstErrId = `field-driver-payout-${slot.id}`;
          firstErrMsg = `Slot #${i + 1}: Driver Payout Rate is required.`;
        }
      }

      // A monthly contract only has times — the dates come from the operating days.
      const isMissingPickup = !slot.pickupTime || (!isMonthly && !slot.date);
      const isMissingDropoff = !slot.dropoffTime;

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
            firstErrMsg = `Slot #${i + 1}: Drop-off time is required.`;
          }
        }
      } else if (!isMonthly) {
        try {
          const dropoffDateVal = slot.dropoffDate || slot.date;
          const startMs = new Date(toUtcIso(slot.date, slot.pickupTime)).getTime();
          const endMs = new Date(toUtcIso(dropoffDateVal, slot.dropoffTime)).getTime();
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

    // Everything else (operating days, assignment, 3PL partner) — the same checks the
    // operator app runs, so a monthly trip can't be sent without its days.
    const issues = validateTripDraft({
      customerId: contractCustomer,
      slots: contractSlots,
      billingType: contractBillingType,
      assignmentType,
      masterDriver,
      masterVehicle,
      thirdPartyProviderId,
      thirdPartyDriverName,
      thirdPartyCost,
      selectedDates,
      toUtcIso,
    });
    if (issues.length > 0) {
      const first = issues[0];
      const onStep2 = isMonthly && (first.field === 'selectedDates' || (first.section === 'assignment' && first.field !== 'thirdPartyCost'));
      setContractStep(onStep2 ? 2 : 1);
      toast.error(first.message);
      return false;
    }

    return true;
  };

  /** Saves quotations defined inline; returns slot id → new quotation id. */
  const saveInlineQuotations = async (): Promise<Record<string, string>> => {
    const ids: Record<string, string> = {};
    const slotsToSave = contractSlots.filter(
      (slot) => (slot.saveAsQuotation || slot.saveAsRateCard) && Number(slot.billingAmount) > 0
    );
    if (slotsToSave.length === 0) return ids;

    const { quotationService } = await import('@/services/quotationService');
    const { locationService } = await import('@/services/locationService');

    await Promise.all(
      slotsToSave.map(async (slot) => {
        const ensureLocation = async (name: string, id: string | null | undefined, lat: any, lng: any) => {
          if (id || !name?.trim()) return id ?? null;
          try {
            const created = await locationService.create({ customerId: contractCustomer, name: name.trim(), lat: lat ?? null, lng: lng ?? null });
            return created.id;
          } catch (err) {
            console.error(`Failed to ensure location '${name}':`, err);
            return null;
          }
        };
        const origId = await ensureLocation(slot.origin, slot.originLocationId, slot.originLat, slot.originLng);
        const destId = await ensureLocation(slot.destination, slot.destinationLocationId, slot.destinationLat, slot.destinationLng);

        try {
          const res: any = await quotationService.create(
            buildQuotationFromSlot(slot, {
              customerId: contractCustomer,
              vehicleType: contractVehicleType,
              rateCategory: contractRateCategory,
              billingType: contractBillingType,
              isThirdParty: is3PLAssignment,
              originLocationId: origId,
              destinationLocationId: destId,
            }) as any,
          );
          const createdQuo = res?.data || res;
          if (createdQuo?.id) ids[slot.id] = createdQuo.id;
          toast.success(`Quotation '${createdQuo?.name || slot.origin + ' → ' + slot.destination}' saved to Quotations ledger!`);
        } catch (err: any) {
          // The trip still goes ahead at the typed price.
          const errMsg = err.response?.data?.error?.message || err.message || 'Unknown error';
          console.error(`Failed to save quotation for slot ${slot.id}:`, err);
          toast.error(`Couldn't save quotation for ${slot.origin} → ${slot.destination}: ${errMsg}`);
        }
      })
    );

    queryClient.invalidateQueries({ queryKey: ['quotations'] });
    queryClient.invalidateQueries({ queryKey: ['quotations-select'] });
    queryClient.invalidateQueries({ queryKey: ['quotations-select-all'] });
    queryClient.invalidateQueries({ queryKey: ['quotations-all'] });
    queryClient.invalidateQueries({ queryKey: ['rate-cards'] });
    queryClient.invalidateQueries({ queryKey: ['rate-card-lookup'] });
    queryClient.invalidateQueries({ queryKey: ['locations-list'] });
    return ids;
  };

  /** Runs once the user has confirmed: quotations first, then the trips. */
  const runContractSubmit = async (pastChoice: PastChoice) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setIsPreparing(true);
    try {
      const quotationIds = await saveInlineQuotations();
      let rows = buildContractRows(quotationIds);
      if (countPastTrips(rows) > 0) rows = applyPastTripStatus(rows, pastChoice, tz);
      await bulkMutation.mutateAsync(rows as BulkImportTripRow[]).catch(() => undefined); // errors are toasted in onError
    } finally {
      busyRef.current = false;
      setIsPreparing(false);
    }
  };

  const openPastDateModal = (rows: BulkImportTripRow[], pastCount: number, pending: NonNullable<typeof pendingSubmit>) => {
    setPastDateAnalysis({ ...analyzePastDateRows(rows), hasPastTrips: true, pastTripsCount: pastCount });
    setPendingSubmit(pending);
    setPastDateModalOpen(true);
  };

  const handleContractSubmit = () => {
    if (busyRef.current || bulkMutation.isPending) return;
    if (!validateAndFocusErrors()) return;

    const preview = buildContractRows();
    const pastCount = countPastTrips(preview);
    if (pastCount > 0) {
      openPastDateModal(preview as BulkImportTripRow[], pastCount, { kind: 'contract' });
      return;
    }
    void runContractSubmit('Incomplete');
  };

  const executeBulkSubmit = (rows: BulkImportTripRow[]) => {
    if (busyRef.current || bulkMutation.isPending) return;
    const analysis = analyzePastDateRows(rows);
    if (analysis.hasPastTrips) {
      openPastDateModal(rows, analysis.pastTripsCount, { kind: 'rows', rows });
      return;
    }
    bulkMutation.mutate(rows);
  };

  const handlePastDateConfirm = (selectedStatus: TripStatus | 'Incompleted') => {
    const pending = pendingSubmit;
    if (!pending) return;
    setPastDateModalOpen(false);
    setPendingSubmit(null);
    const choice: PastChoice = selectedStatus === 'Completed' ? 'Completed' : 'Incomplete';
    if (pending.kind === 'contract') {
      void runContractSubmit(choice);
    } else {
      bulkMutation.mutate(applyPastStatusToRows(pending.rows, selectedStatus as any));
    }
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
      origin: (r.origin || '').trim() || undefined,
      destination: (r.destination || '').trim() || undefined,
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
    isSubmitting: isPreparing || bulkMutation.isPending,
    buildContractRows,
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

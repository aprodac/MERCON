import React from 'react';
import { CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useLayoutMeta } from '@/context/LayoutContext';
import CreateDriverModal from '@/components/drivers/CreateDriverModal';
import CreateVehicleModal from '@/components/fleet/CreateVehicleModal';
import CreateCustomerModal from '@/components/customers/CreateCustomerModal';
import CreateThirdPartyModal from '@/components/third-party/CreateThirdPartyModal';
import CustomerPreviewModal from '@/components/customers/CustomerPreviewModal';
import VehiclePreviewModal from '@/components/fleet/VehiclePreviewModal';
import DriverPreviewModal from '@/components/drivers/DriverPreviewModal';
import ThirdPartyPreviewModal from '@/components/third-party/ThirdPartyPreviewModal';
import EditCustomerModal from '@/components/customers/EditCustomerModal';
import EditVehicleModal from '@/components/fleet/EditVehicleModal';
import EditDriverModal from '@/components/drivers/EditDriverModal';
import EditThirdPartyModal from '@/components/third-party/EditThirdPartyModal';
import DriverAvatar from '@/components/ui/DriverAvatar';
import PastDateTripConfirmModal from '@/components/trips/PastDateTripConfirmModal';
import TripWizardHeader from '@/components/trips/wizard/TripWizardHeader';
import TripStep1UnifiedWorkspace from '@/components/trips/wizard/TripStep1UnifiedWorkspace';
import { MonthlyDaysSelector } from '@/components/trips/wizard/MonthlyDaysSelector';
import { resolveSlotDriverPayout } from '@mercon/shared-types';
import { TripReviewConfirmModal } from '@/components/trips/wizard/TripReviewConfirmModal';
import DriverPayoutMissingDialog from '@/components/trips/wizard/DriverPayoutMissingDialog';
import TripBatchGeneratorTab from '@/components/trips/wizard/TripBatchGeneratorTab';
import TripBulkImportTab from '@/components/trips/wizard/TripBulkImportTab';
import { Button } from '@/components/ui/button';
import { KbdBadge } from '@/components/ui/KbdBadge';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  useCreateTripForm,
  normalizeBillingType,
  normalizeRateCategory,
  normalizeVehicleClass,
  getVehicleTypeFromCapacity,
  isRoundTripCategory,
  getActualCapacityLabel,
} from '@/hooks/useCreateTripForm';

export { getActualCapacityLabel };

function MapBoundsAdjuster({ points }: { points: [number, number][] }) {
  const map = useMap();
  React.useEffect(() => {
    if (points && points.length > 0) {
      map.fitBounds(points, { padding: [15, 15], maxZoom: 12 });
    }
  }, [points, map]);
  return null;
}

const pickupMarkerIcon = L.divIcon({
  html: `
    <div style="position: relative; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">
      <div style="position: absolute; width: 24px; height: 24px; border-radius: 50%; background: rgba(16, 185, 129, 0.2);" class="animate-ping"></div>
      <div style="width: 12px; height: 12px; border-radius: 50%; background: #10B981; border: 2px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.3);"></div>
    </div>
  `,
  className: '',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const dropoffMarkerIcon = L.divIcon({
  html: `
    <div style="position: relative; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">
      <div style="position: absolute; width: 24px; height: 24px; border-radius: 50%; background: rgba(249, 115, 22, 0.2);" class="animate-ping"></div>
      <div style="width: 12px; height: 12px; border-radius: 50%; background: #F97316; border: 2px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.3);"></div>
    </div>
  `,
  className: '',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

export default function CreateTripPage() {
  const form = useCreateTripForm();
  const [isReviewModalOpen, setIsReviewModalOpen] = React.useState(false);

  // ── Driver payout missing ─────────────────────────────────────────────────
  // Own-fleet trips need a driver payout. Many quotations are saved without one,
  // so tell the operator as soon as such a quotation is picked, and again on
  // Review / Create (the trip can't be created without it).
  const payoutSlot: any = form.contractSlots[0];
  const payoutCard: any = payoutSlot?.matchedRateCard;
  const payoutPriced = Boolean(payoutSlot && (payoutCard || Number(payoutSlot.billingAmount) > 0));
  const payoutMissing =
    form.assignmentType === 'own' && payoutPriced && !(resolveSlotDriverPayout(payoutSlot) > 0);
  const payoutLabel = payoutCard
    ? [
        payoutCard.quotation_number != null ? `QT-${payoutCard.quotation_number}` : null,
        payoutSlot?.origin && payoutSlot?.destination ? `${payoutSlot.origin} → ${payoutSlot.destination}` : null,
        payoutCard.vehicle_class || payoutCard.vehicle_type || null,
      ].filter(Boolean).join(' · ')
    : '';
  const [payoutDialogOpen, setPayoutDialogOpen] = React.useState(false);
  const payoutPromptedFor = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    const cardId = payoutCard?.id;
    if (!cardId || !payoutMissing || payoutPromptedFor.current.has(cardId)) return;
    payoutPromptedFor.current.add(cardId);
    setPayoutDialogOpen(true);
  }, [payoutCard?.id, payoutMissing]);
  /** True (and opens the popup) when the payout still has to be entered. */
  const promptForMissingPayout = () => {
    if (!payoutMissing) return false;
    setPayoutDialogOpen(true);
    return true;
  };

  // Step Transition Focus Management
  React.useEffect(() => {
    if (form.submissionResult) return;
    const timer = setTimeout(() => {
      let target: HTMLElement | null = null;
      if (form.contractStep === 1) {
        target = document.getElementById('step1-customer-combobox');
      } else if (form.contractStep === 2) {
        target = document.getElementById('step2-first-field');
      }

      if (!target) {
        const stepContainer = document.querySelector('.custom-scrollbar');
        target = stepContainer?.querySelector('button:not([tabindex="-1"]), input:not([tabindex="-1"]), select:not([tabindex="-1"]), [tabindex="0"]') as HTMLElement;
      }

      if (target) {
        target.focus();
      }
    }, 60);

    return () => clearTimeout(timer);
  }, [form.contractStep, form.submissionResult]);

  /** The main button: go to the next missing section, then step 2 (monthly), then review. */
  const runPrimaryAction = () => {
    if (form.isSubmitting) return;
    if (form.contractStep === 1 && form.nextSection === 'price' && payoutMissing) {
      setPayoutDialogOpen(true);
      return;
    }
    if (form.contractStep === 1 && form.nextSection) {
      form.focusSection(form.nextSection);
      return;
    }
    if (form.contractBillingType === 'Monthly' && form.contractStep === 1) {
      if (form.canNavigateToStep(2)) form.setContractStep(2);
      else form.validateAndFocusErrors();
      return;
    }
    if (promptForMissingPayout()) return;
    if (form.validateAndFocusErrors()) setIsReviewModalOpen(true);
  };
  const primaryRef = React.useRef(runPrimaryAction);
  primaryRef.current = runPrimaryAction;

  // Keyboard: Ctrl+S and Ctrl+Enter do what the main button does; Alt+1/2 switch steps.
  React.useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && ['1', '2'].includes(e.key)) {
        const targetStep = parseInt(e.key, 10);
        if (form.canNavigateToStep(targetStep)) {
          e.preventDefault();
          form.setContractStep(targetStep as any);
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'Enter' || e.key.toLowerCase() === 's')) {
        e.preventDefault();
        if (document.querySelector('[data-radix-popper-content-wrapper]')) return; // a dropdown is open
        if (!isReviewModalOpen) primaryRef.current();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [form.canNavigateToStep, form.setContractStep, isReviewModalOpen]);

  // Leaving with unsaved work asks first (Cancel / close), and the browser warns on reload or tab close.
  const [isDiscardOpen, setIsDiscardOpen] = React.useState(false);
  const requestClose = () => (form.isDirty ? setIsDiscardOpen(true) : form.handleDialogClose());
  React.useEffect(() => {
    if (!form.isDirty || form.submissionResult) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [form.isDirty, form.submissionResult]);

  return (
    <DashboardLayout active="Trips" title="Create New Trip" hideBackButton fixedViewport compactHeader>
      <div className="px-2 sm:px-4 pb-2 sm:pb-3 animate-fade-in w-full h-full flex flex-col min-h-0">
        <div className="w-full flex-1 overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl rounded-2xl flex flex-col min-h-0">

          {/* Combined Navigation & Stepper Bar */}
          <TripWizardHeader
            contractStep={form.contractStep}
            contractBillingType={form.contractBillingType}
            submissionResult={form.submissionResult}
            isStepValid={form.isStepValid}
            getStepValidationErrors={form.getStepValidationErrors}
            validateAndFocusErrors={form.validateAndFocusErrors}
            canNavigateToStep={form.canNavigateToStep}
            setContractStep={form.setContractStep}
            handleContractSubmit={() => {
              if (promptForMissingPayout()) return;
              if (form.validateAndFocusErrors()) {
                setIsReviewModalOpen(true);
              }
            }}
            handleDialogClose={requestClose}
            isPending={form.isSubmitting}
            progress={form.progress}
            nextSection={form.nextSection}
            nextActionLabel={form.nextActionLabel}
            onJumpTo={(key) => {
              if (key === 'price' && promptForMissingPayout()) return;
              form.focusSection(key);
            }}
            batchTripRowsCount={form.batchTripRows.length}
            KbdBadge={KbdBadge}
            hasSavedDraft={form.hasSavedDraft}
            restoreDraft={form.restoreDraft}
            discardDraft={form.discardDraft}
          />

          {/* Modal Body */}
          <div className="flex-1 overflow-y-auto px-3 sm:px-4 pt-2 pb-4 min-h-0 custom-scrollbar">
            {/* TAB 1: SINGLE-SCREEN UNIFIED TRIP COMMAND CENTER */}
            {form.activeTab === 'contract' && (
              <div className="pb-4">
                {/* STEP 1: CONFIGURE & DISPATCH WORKSPACE */}
                {form.contractStep === 1 && (
                  <TripStep1UnifiedWorkspace
                    contractCustomer={form.contractCustomer}
                        setContractCustomer={form.setContractCustomer}
                        customers={form.customers}
                        customerRateCards={form.customerRateCards}
                        contractSlots={form.contractSlots}
                        contractRateCategory={form.contractRateCategory}
                        setContractRateCategory={form.setContractRateCategory}
                        contractBillingType={form.contractBillingType}
                        setContractBillingType={form.setContractBillingType}
                        contractVehicleType={form.contractVehicleType}
                        setContractVehicleType={form.setContractVehicleType}
                        selectedMonth={form.selectedMonth}
                        setSelectedMonth={form.setSelectedMonth}
                        selectedDates={form.selectedDates}
                        setSelectedDates={form.setSelectedDates}
                        triggerRateLookupForSlots={form.triggerRateLookupForSlots}
                        handleAddSlotIntermediate={form.handleAddSlotIntermediate}
                        handleRemoveTripSlot={form.handleRemoveTripSlot}
                        handleSlotLocationChange={form.handleSlotLocationChange}
                        handleUpdateTripSlot={form.handleUpdateTripSlot}
                        handleRemoveSlotIntermediate={form.handleRemoveSlotIntermediate}
                        handleUpdateSlotIntermediate={form.handleUpdateSlotIntermediate}
                        handleAddSlotReturnIntermediate={form.handleAddSlotReturnIntermediate}
                        handleRemoveSlotReturnIntermediate={form.handleRemoveSlotReturnIntermediate}
                        handleUpdateSlotReturnIntermediate={form.handleUpdateSlotReturnIntermediate}
                        recentRoutesList={form.recentRoutesList}
                        handleApplyRecentRoute={form.handleApplyRecentRoute}
                        isRoundTripCategory={isRoundTripCategory}
                        normalizeRateCategory={normalizeRateCategory}
                        getAvailableRateCardsForLane={form.getAvailableRateCardsForLane}
                        handleOpenCreateQuotation={form.handleOpenCreateQuotation}
                        setIsManualRateOverride={form.setIsManualRateOverride}
                        assignmentType={form.assignmentType}
                        setAssignmentType={form.setAssignmentType}
                        masterVehicle={form.masterVehicle}
                        masterDriver={form.masterDriver}
                        handleVehicleChange={form.handleVehicleChange}
                        handleDriverChange={form.handleDriverChange}
                        vehicleOptions={form.vehicleOptions}
                        driverOptions={form.driverOptions}
                        thirdPartyProviderId={form.thirdPartyProviderId}
                        setThirdPartyProviderId={form.setThirdPartyProviderId}
                        thirdPartyProviders={form.thirdPartyProviders}
                        thirdPartyVehiclePlate={form.thirdPartyVehiclePlate}
                        setThirdPartyVehiclePlate={form.setThirdPartyVehiclePlate}
                        thirdPartyDriverName={form.thirdPartyDriverName}
                        setThirdPartyDriverName={form.setThirdPartyDriverName}
                        thirdPartyDriverPhone={form.thirdPartyDriverPhone}
                        setThirdPartyDriverPhone={form.setThirdPartyDriverPhone}
                        thirdPartyCost={form.thirdPartyCost}
                        setThirdPartyCost={form.setThirdPartyCost}
                        marginMetrics={form.marginMetrics}
                        drivers={form.drivers}
                        vehicles={form.vehicles}
                        awbNumber={form.awbNumber}
                        setAwbNumber={form.setAwbNumber}
                        dayAssignments={form.dayAssignments}
                        setDayAssignments={form.setDayAssignments}
                        fieldErrors={form.fieldErrors}
                        nextSection={form.nextSection}
                        masterCoDriver={form.masterCoDriver}
                        setMasterCoDriver={form.setMasterCoDriver}
                        coDriverSplit={form.coDriverSplit}
                        setCoDriverSplit={form.setCoDriverSplit}
                        basePayout={resolveSlotDriverPayout(form.contractSlots[0] || ({} as any))}
                        loading={form.loading}
                        lastLaneTime={form.lastLaneTime}
                        handleUpdateSlotIntermediateFee={form.handleUpdateSlotIntermediateFee}
                        handleUpdateSlotReturnIntermediateFee={form.handleUpdateSlotReturnIntermediateFee}
                      />
                    )}

                    {/* STEP 2 FOR MONTHLY: OPERATING MONTH & DAYS */}
                    {form.contractBillingType === 'Monthly' && form.contractStep === 2 && (
                      <MonthlyDaysSelector
                        selectedMonth={form.selectedMonth}
                        onChangeSelectedMonth={form.setSelectedMonth}
                        selectedDates={form.selectedDates}
                        setSelectedDates={form.setSelectedDates}
                        contractSlotsCount={form.contractSlots.length}
                        crewMode={form.monthlyCrewMode}
                        setCrewMode={form.setMonthlyCrewMode}
                        crew={form.monthlyCrew}
                        setCrew={form.setMonthlyCrew}
                        dayOverrides={form.monthlyDayOverrides}
                        setDayOverrides={form.setMonthlyDayOverrides}
                        dayAssignments={form.dayAssignments}
                        rows={form.buildContractRows()}
                        basePayout={resolveSlotDriverPayout(form.contractSlots[0] || ({} as any))}
                        driverOptions={form.driverOptions}
                        vehicleOptions={form.vehicleOptions}
                        drivers={form.drivers}
                        vehicles={form.vehicles}
                        assignmentType={form.assignmentType}
                        thirdPartyProviderId={form.thirdPartyProviderId}
                        setThirdPartyProviderId={form.setThirdPartyProviderId}
                        thirdPartyProviders={form.thirdPartyProviders}
                        thirdPartyVehiclePlate={form.thirdPartyVehiclePlate}
                        setThirdPartyVehiclePlate={form.setThirdPartyVehiclePlate}
                        thirdPartyDriverName={form.thirdPartyDriverName}
                        setThirdPartyDriverName={form.setThirdPartyDriverName}
                        thirdPartyDriverPhone={form.thirdPartyDriverPhone}
                        setThirdPartyDriverPhone={form.setThirdPartyDriverPhone}
                        thirdPartyCost={form.thirdPartyCost}
                        setThirdPartyCost={form.setThirdPartyCost}
                        contractVehicleType={form.contractVehicleType}
                      />
                    )}
                  </div>
                )}

                {/* TAB 2: QUICK GRID ENTRY */}
                {form.activeTab === 'grid' && (
                  <TripBatchGeneratorTab
                    gridRows={form.gridRows}
                    setGridRows={form.setGridRows}
                    generateEmptyRow={form.generateEmptyRow}
                    updateGridRow={form.updateGridRow}
                    duplicateGridRow={form.duplicateGridRow}
                    deleteGridRow={form.deleteGridRow}
                    handleGridSubmit={form.handleGridSubmit}
                    customers={form.customers}
                    drivers={form.drivers}
                    vehicles={form.vehicles}
                    getVehicleTypeFromCapacity={getVehicleTypeFromCapacity}
                    isPending={form.isSubmitting}
                  />
                )}

                {/* TAB 3: CSV / EXCEL FILE IMPORT */}
                {form.activeTab === 'file' && (
                  <TripBulkImportTab
                    downloadSampleCsv={form.downloadSampleCsv}
                    fileInputRef={form.fileInputRef}
                    handleFileUpload={form.handleFileUpload}
                    importedFile={form.importedFile}
                    setImportedFile={form.setImportedFile}
                    parsedRows={form.parsedRows}
                    setParsedRows={form.setParsedRows}
                    parseError={form.parseError}
                    handleFileSubmit={form.handleFileSubmit}
                    isPending={form.isSubmitting}
                  />
                )}
          </div>

        </div>
      </div>

      <CreateDriverModal
        isOpen={form.isCreateDriverOpen}
        onClose={() => form.setIsCreateDriverOpen(false)}
        onSuccess={form.handleDriverCreated}
      />
      <CreateVehicleModal
        isOpen={form.isCreateVehicleOpen}
        onClose={() => form.setIsCreateVehicleOpen(false)}
        onSuccess={(v) => {
          form.setMasterVehicle(v.id);
          form.queryClient.invalidateQueries({ queryKey: ['vehicles'] });
        }}
      />
      <CreateCustomerModal
        isOpen={form.isCreateCustomerOpen}
        onClose={() => form.setIsCreateCustomerOpen(false)}
        onSuccess={(c) => {
          form.setContractCustomer(c.id);
          form.queryClient.invalidateQueries({ queryKey: ['customers'] });
        }}
      />
      <PastDateTripConfirmModal
        open={form.pastDateModalOpen}
        onClose={() => form.setPastDateModalOpen(false)}
        onConfirm={form.handlePastDateConfirm}
        analysis={form.pastDateAnalysis}
        isSubmitting={form.isSubmitting}
      />
      <CreateThirdPartyModal
        isOpen={form.isCreateProviderOpen}
        onClose={() => form.setIsCreateProviderOpen(false)}
        onSuccess={(provider) => {
          form.setThirdPartyProviderId(provider.id);
          form.queryClient.invalidateQueries({ queryKey: ['third-party-providers-select'] });
        }}
      />
      <VehiclePreviewModal
        vehicle={form.previewVehicle}
        isOpen={!!form.previewVehicle}
        onClose={() => form.setPreviewVehicle(null)}
        onEdit={(v) => form.setEditVehicle(v)}
      />
      <CustomerPreviewModal
        customer={form.previewCustomer}
        isOpen={!!form.previewCustomer}
        onClose={() => form.setPreviewCustomer(null)}
        onEdit={(c) => form.setEditCustomer(c)}
      />
      <ThirdPartyPreviewModal
        provider={form.previewThirdParty}
        isOpen={!!form.previewThirdParty}
        onClose={() => form.setPreviewThirdParty(null)}
        onEdit={(p) => form.setEditThirdParty(p)}
      />
      <DriverPreviewModal
        driver={form.previewDriver}
        isOpen={!!form.previewDriver}
        onClose={() => form.setPreviewDriver(null)}
        onEdit={(d) => form.setEditDriver(d)}
      />
      {form.editCustomer && (
        <EditCustomerModal
          isOpen={!!form.editCustomer}
          customer={form.editCustomer}
          onClose={() => form.setEditCustomer(null)}
        />
      )}
      {form.editThirdParty && (
        <EditThirdPartyModal
          isOpen={!!form.editThirdParty}
          provider={form.editThirdParty}
          onClose={() => form.setEditThirdParty(null)}
        />
      )}
      {form.editDriver && (
        <EditDriverModal
          isOpen={!!form.editDriver}
          driver={form.editDriver}
          onClose={() => form.setEditDriver(null)}
        />
      )}
      {form.editVehicle && (
        <EditVehicleModal
          isOpen={!!form.editVehicle}
          vehicle={form.editVehicle}
          onClose={() => form.setEditVehicle(null)}
        />
      )}

      <ConfirmModal
        isOpen={isDiscardOpen}
        onClose={() => setIsDiscardOpen(false)}
        onConfirm={() => {
          setIsDiscardOpen(false);
          form.discardDraft?.();
          form.handleDialogClose();
        }}
        title="Discard this trip?"
        message="What you've entered will be lost."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        variant="destructive"
      />

      <DriverPayoutMissingDialog
        isOpen={payoutDialogOpen}
        quotationLabel={payoutLabel}
        hasQuotation={Boolean(payoutCard)}
        onClose={() => setPayoutDialogOpen(false)}
        onSave={(payout, saveOnQuotation) => {
          if (payoutSlot) {
            form.handleUpdateTripSlot(payoutSlot.id, {
              driverPayout: payout,
              driverPayoutModified: true,
              // Unticked = this trip only; the quotation keeps no payout.
              updateQuotationPayout: saveOnQuotation,
            });
          }
          setPayoutDialogOpen(false);
        }}
      />

      <TripReviewConfirmModal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        onConfirm={() => {
          setIsReviewModalOpen(false);
          form.handleContractSubmit();
        }}
        isPending={form.isSubmitting}
        contractCustomer={form.contractCustomer}
        customers={form.customers}
        contractSlots={form.contractSlots}
        contractBillingType={form.contractBillingType}
        contractVehicleType={form.contractVehicleType}
        contractRateCategory={form.contractRateCategory}
        selectedMonth={form.selectedMonth}
        selectedDates={form.selectedDates}
        assignmentType={form.assignmentType}
        masterDriver={form.masterDriver}
        masterVehicle={form.masterVehicle}
        drivers={form.drivers}
        vehicles={form.vehicles}
        dayAssignments={form.dayAssignments}
        thirdPartyProviderId={form.thirdPartyProviderId}
        thirdPartyDriverName={form.thirdPartyDriverName}
        thirdPartyVehiclePlate={form.thirdPartyVehiclePlate}
        thirdPartyCost={form.thirdPartyCost}
        thirdPartyProviders={form.thirdPartyProviders}
        rows={isReviewModalOpen ? form.buildContractRows() : []}
      />
    </DashboardLayout>
  );
}

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
import { TripReviewConfirmModal } from '@/components/trips/wizard/TripReviewConfirmModal';
import TripBatchGeneratorTab from '@/components/trips/wizard/TripBatchGeneratorTab';
import TripBulkImportTab from '@/components/trips/wizard/TripBulkImportTab';
import { Button } from '@/components/ui/button';
import { KbdBadge } from '@/components/ui/KbdBadge';
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

  // Global Keyboard Shortcuts (Alt+1..2, Ctrl+Enter, Ctrl+S)
  React.useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const maxSteps = form.contractBillingType === 'Monthly' ? 2 : 1;

      // Alt + 1..2 Step Direct Navigation
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        if (['1', '2'].includes(e.key)) {
          const targetStep = parseInt(e.key, 10);
          if (form.canNavigateToStep(targetStep)) {
            e.preventDefault();
            form.setContractStep(targetStep as any);
            return;
          }
        }
      }

      // Ctrl + Enter or Cmd + Enter (Open Review Modal on Last Step)
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        const hasOpenPopover = !!document.querySelector('[data-state="open"]');
        if (form.contractStep === maxSteps && !hasOpenPopover && form.isStepValid(1) && !form.bulkMutation.isPending) {
          e.preventDefault();
          setIsReviewModalOpen(true);
          return;
        }
      }

      // Ctrl + S (Next step or Save)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        const hasOpenPopover = !!document.querySelector('[data-state="open"]');
        if (!hasOpenPopover) {
          if (form.contractStep < maxSteps && form.isStepValid(form.contractStep)) {
            form.setContractStep((prev) => (prev + 1) as any);
          } else if (form.contractStep === maxSteps && form.isStepValid(1) && !form.bulkMutation.isPending) {
            setIsReviewModalOpen(true);
          }
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [form.contractStep, form.canNavigateToStep, form.isStepValid, form.bulkMutation.isPending]);

  return (
    <DashboardLayout active="Trips" title="Create New Trip" hideBackButton hideHeader fixedViewport>
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
              if (form.validateAndFocusErrors()) {
                setIsReviewModalOpen(true);
              }
            }}
            handleDialogClose={form.handleDialogClose}
            isPending={form.bulkMutation.isPending}
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
                        masterDriver={form.masterDriver}
                        masterCoDriver={form.masterCoDriver}
                        setMasterCoDriver={form.setMasterCoDriver}
                        masterVehicle={form.masterVehicle}
                        handleDriverChange={form.handleDriverChange}
                        handleVehicleChange={form.handleVehicleChange}
                        driverOptions={form.driverOptions}
                        vehicleOptions={form.vehicleOptions}
                        drivers={form.drivers}
                        vehicles={form.vehicles}
                        dayAssignments={form.dayAssignments}
                        setDayAssignments={form.setDayAssignments}
                        assignmentType={form.assignmentType}
                        setAssignmentType={form.setAssignmentType}
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
                        setContractVehicleType={form.setContractVehicleType}
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
                    isPending={form.bulkMutation.isPending}
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
                    isPending={form.bulkMutation.isPending}
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
          form.setContractCustomer(c.name);
          form.queryClient.invalidateQueries({ queryKey: ['customers'] });
        }}
      />
      <PastDateTripConfirmModal
        open={form.pastDateModalOpen}
        onClose={() => form.setPastDateModalOpen(false)}
        onConfirm={form.handlePastDateConfirm}
        analysis={form.pastDateAnalysis}
        isSubmitting={form.bulkMutation.isPending}
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

      <TripReviewConfirmModal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        onConfirm={() => {
          setIsReviewModalOpen(false);
          form.handleContractSubmit();
        }}
        isPending={form.bulkMutation.isPending}
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
      />
    </DashboardLayout>
  );
}

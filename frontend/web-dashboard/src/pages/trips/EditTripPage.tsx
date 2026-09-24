import React, { useState } from 'react';
import { Truck, RotateCcw, Eye, Save, Lock, AlertCircle, ArrowRight, ShieldAlert } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
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
import TripStep1UnifiedWorkspace from '@/components/trips/wizard/TripStep1UnifiedWorkspace';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { KbdBadge } from '@/components/ui/KbdBadge';
import { useEditTripForm, isRoundTripCategory, normalizeRateCategory } from '@/hooks/useEditTripForm';

export default function EditTripPage() {
  const form = useEditTripForm();

  if (form.isTripLoading || !form.trip) {
    return (
      <DashboardLayout active="Trips" title="Edit Trip">
        <div className="p-12 flex flex-col items-center justify-center gap-3">
          <div className="h-8 w-8 border-2 border-brand border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs text-muted-foreground font-medium">Loading trip details...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout active="Trips" title={`Edit ${form.trip.ref_id || 'Trip'}`} hideBackButton hideHeader fixedViewport>
      <div className="px-2 sm:px-4 pb-2 sm:pb-3 animate-fade-in w-full h-full flex flex-col min-h-0 text-[#3E3C3D]">
        <div className="w-full flex-1 overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl rounded-2xl flex flex-col min-h-0">
          
          {/* Operational Header Bar */}
          <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 flex items-center justify-between px-4 py-2.5 gap-3 w-full flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              <Badge className="bg-[#FA634E] text-white font-black border-none text-xs px-2.5 py-1 flex items-center gap-1.5 shadow-2xs">
                <Truck className="w-3.5 h-3.5" /> Edit Trip
              </Badge>
              <span className="text-xs text-slate-700 dark:text-slate-300 font-mono font-black">
                Ref: {form.trip.ref_id || 'TRIP-LOG'}
              </span>

            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => form.handleReset()}
                className="h-7 text-xs text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 px-2.5 font-bold"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.history.back()}
                className="h-7 text-xs font-bold border-slate-200 dark:border-slate-800 px-2.5"
              >
                Cancel <KbdBadge keys="Esc" />
              </Button>
              <Button
                size="sm"
                onClick={() => form.handleSave()}
                disabled={form.isSubmitting}
                className="h-7 text-xs bg-[#FA634E] hover:bg-[#d13d0d] text-white font-black px-3.5 shadow-2xs"
              >
                {form.isSubmitting ? 'Saving...' : 'Save Changes'} <KbdBadge keys="Ctrl+S" />
              </Button>
            </div>
          </div>

          {/* Unified Workspace Form Body */}
          <div className="flex-1 overflow-y-auto px-3 sm:px-4 pt-2 pb-4 min-h-0 custom-scrollbar">
            <TripStep1UnifiedWorkspace
              contractCustomer={form.contractCustomer}
              setContractCustomer={form.setContractCustomer}
              customers={form.customers}
              customerRateCards={form.customerRateCards}
              customerOptions={form.customerOptions}
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
              thirdPartyCost={form.thirdPartyCost}
              setThirdPartyCost={form.setThirdPartyCost}
              marginMetrics={form.marginMetrics}
              drivers={form.drivers}
              vehicles={form.vehicles}
              dayAssignments={form.dayAssignments}
              isEditMode={true}
              isRouteLocked={form.isRouteLocked}
              isScheduleLocked={form.isScheduleLocked}
              isAssignmentLocked={form.isAssignmentLocked}
              isBaseBillingLocked={form.isBaseBillingLocked}
              isFinancialsLocked={form.isFinancialsLocked}
              status={form.status}
            />
          </div>

        </div>
      </div>

      {/* Modal Dialogs */}
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
        }}
      />
      <CreateCustomerModal
        isOpen={form.isCreateCustomerOpen}
        onClose={() => form.setIsCreateCustomerOpen(false)}
        onSuccess={(c) => {
          form.setContractCustomer(c.id);
        }}
      />
      <CreateThirdPartyModal
        isOpen={form.isCreateProviderOpen}
        onClose={() => form.setIsCreateProviderOpen(false)}
        onSuccess={(provider) => {
          form.setThirdPartyProviderId(provider.id);
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
    </DashboardLayout>
  );
}

import React from 'react';
import { Truck, Calendar, Zap, Layers, Tag } from 'lucide-react';
import { CustomerSelectionHeader } from './CustomerSelectionHeader';
import { RecentRoutesAccelerator } from './RecentRoutesAccelerator';
import { RouteWorkspace } from './RouteWorkspace';
import { ScheduleServicePanel } from './ScheduleServicePanel';
import { CommercialSection } from './CommercialSection';
import { ExecutionAssignmentSection } from './ExecutionAssignmentSection';
import { TripEconomicsSection } from './TripEconomicsSection';
import { MonthlyDaysSelector } from './MonthlyDaysSelector';
import TransitTimeBadge from '@/components/trips/TransitTimeBadge';
import { ComboboxOption } from '@/components/ui/combobox';
import { cn } from '@/lib/utils';

interface TripStep1UnifiedWorkspaceProps {
  contractCustomer: string;
  setContractCustomer: (customerId: string) => void;
  customers: any[];
  customerRateCards?: any[];
  customerOptions?: ComboboxOption[];
  contractSlots: any[];
  contractRateCategory: string;
  setContractRateCategory?: (cat: string) => void;
  contractBillingType: string;
  setContractBillingType?: (type: string) => void;
  contractVehicleType: string;
  setContractVehicleType?: (vType: string) => void;
  selectedMonth?: string;
  setSelectedMonth?: (m: string) => void;
  selectedDates?: string[];
  setSelectedDates?: React.Dispatch<React.SetStateAction<string[]>>;
  triggerRateLookupForSlots?: (vType?: string, rCat?: string, custId?: string, bType?: string) => void;
  handleAddSlotIntermediate: (slotId: string) => void;
  handleRemoveTripSlot: (slotId: string) => void;
  handleSlotLocationChange: (slotId: string, field: 'origin' | 'destination', locName: string, locObj: any) => void;
  handleUpdateTripSlot: (slotId: string, patch: any) => void;
  handleRemoveSlotIntermediate: (slotId: string, index: number) => void;
  handleUpdateSlotIntermediate: (slotId: string, index: number, locName: string) => void;
  handleAddSlotReturnIntermediate?: (slotId: string) => void;
  handleRemoveSlotReturnIntermediate?: (slotId: string, index: number) => void;
  handleUpdateSlotReturnIntermediate?: (slotId: string, index: number, locName: string) => void;
  recentRoutesList: any[];
  handleApplyRecentRoute: (route: any) => void;
  isRoundTripCategory: (cat: string) => boolean;
  normalizeRateCategory?: (cat?: string | null) => string;
  getAvailableRateCardsForLane: (slot: any) => any[];
  handleOpenCreateQuotation?: () => void;
  setIsManualRateOverride?: (override: boolean) => void;
  isRoundTrip?: boolean;
  assignmentType: 'own' | 'third_party' | '3pl' | 'fleet' | any;
  setAssignmentType: (type: any) => void;
  masterVehicle: string;
  masterDriver: string;
  handleVehicleChange: (val: string) => void;
  handleDriverChange: (val: string) => void;
  vehicleOptions: any[];
  driverOptions: any[];
  thirdPartyProviderId: string;
  setThirdPartyProviderId: (id: string) => void;
  thirdPartyProviders: any[];
  thirdPartyVehiclePlate: string;
  setThirdPartyVehiclePlate: (val: string) => void;
  thirdPartyDriverName: string;
  setThirdPartyDriverName: (val: string) => void;
  thirdPartyDriverPhone?: string;
  setThirdPartyDriverPhone?: (val: string) => void;
  thirdPartyCost: string;
  setThirdPartyCost?: (val: string) => void;
  marginMetrics: any;
  drivers?: any[];
  vehicles?: any[];
  dayAssignments?: Record<string, { driverId: string; vehicleId: string }>;
  setDayAssignments?: React.Dispatch<React.SetStateAction<Record<string, { driverId: string; vehicleId: string }>>>;
  fieldErrors?: Record<string, boolean>;
  isEditMode?: boolean;
  isRouteLocked?: boolean;
  isScheduleLocked?: boolean;
  isAssignmentLocked?: boolean;
  isBaseBillingLocked?: boolean;
  isFinancialsLocked?: boolean;
  status?: string;
  awbNumber?: string;
  setAwbNumber?: (val: string) => void;
}

export const TripStep1UnifiedWorkspace: React.FC<TripStep1UnifiedWorkspaceProps> = ({
  contractCustomer,
  setContractCustomer,
  customers,
  customerRateCards = [],
  customerOptions = [],
  contractSlots,
  contractRateCategory,
  setContractRateCategory,
  contractBillingType,
  setContractBillingType,
  contractVehicleType,
  setContractVehicleType,
  selectedMonth = '',
  setSelectedMonth,
  selectedDates = [],
  setSelectedDates,
  triggerRateLookupForSlots,
  handleAddSlotIntermediate,
  handleRemoveTripSlot,
  handleSlotLocationChange,
  handleUpdateTripSlot,
  handleRemoveSlotIntermediate,
  handleUpdateSlotIntermediate,
  handleAddSlotReturnIntermediate,
  handleRemoveSlotReturnIntermediate,
  handleUpdateSlotReturnIntermediate,
  recentRoutesList,
  handleApplyRecentRoute,
  isRoundTripCategory,
  normalizeRateCategory,
  getAvailableRateCardsForLane,
  handleOpenCreateQuotation,
  setIsManualRateOverride,
  isRoundTrip: isRoundTripProp,
  assignmentType,
  setAssignmentType,
  masterVehicle,
  masterDriver,
  handleVehicleChange,
  handleDriverChange,
  vehicleOptions,
  driverOptions,
  thirdPartyProviderId,
  setThirdPartyProviderId,
  thirdPartyProviders,
  thirdPartyVehiclePlate,
  setThirdPartyVehiclePlate,
  thirdPartyDriverName,
  setThirdPartyDriverName,
  thirdPartyDriverPhone = '',
  setThirdPartyDriverPhone,
  thirdPartyCost,
  setThirdPartyCost,
  marginMetrics,
  drivers = [],
  vehicles = [],
  dayAssignments = {},
  setDayAssignments,
  fieldErrors = {},
  isEditMode = false,
  isRouteLocked = false,
  isScheduleLocked = false,
  isAssignmentLocked = false,
  isBaseBillingLocked = false,
  isFinancialsLocked = false,
  status = '',
  awbNumber = '',
  setAwbNumber,
}) => {
  const primarySlot = contractSlots[0] || {};
  const isRoundTrip = isRoundTripProp ?? (isRoundTripCategory ? isRoundTripCategory(contractRateCategory) : contractRateCategory === 'Round Trip');

  const isQuotationDefinedOrSelected = Boolean(
    primarySlot.matchedRateCard ||
    primarySlot.rateMatched ||
    (primarySlot.billingAmount && Number(primarySlot.billingAmount) > 0)
  );

  return (
    <div className="space-y-4 animate-fade-in max-w-full text-[#3E3C3D]">
      {/* 58% / 42% 2-COLUMN COMMAND CENTER GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        
        {/* LEFT WORKSPACE (lg:col-span-7): COMMERCIAL QUOTATIONS + CUSTOMER + ROUTE WORKSPACE */}
        <div className="lg:col-span-7 space-y-3.5">
          {/* COMMERCIAL QUOTATIONS BAR WITH INTEGRATED CUSTOMER SELECTION (TOP LEFT ~60% WIDTH) */}
          <CommercialSection
            contractSlots={contractSlots}
            contractRateCategory={contractRateCategory}
            contractBillingType={contractBillingType}
            contractVehicleType={contractVehicleType}
            getAvailableRateCardsForLane={getAvailableRateCardsForLane}
            customerRateCards={customerRateCards}
            handleOpenCreateQuotation={handleOpenCreateQuotation}
            setIsManualRateOverride={setIsManualRateOverride}
            handleUpdateTripSlot={handleUpdateTripSlot}
            handleSlotLocationChange={handleSlotLocationChange}
            setContractRateCategory={setContractRateCategory}
            setContractBillingType={setContractBillingType}
            setContractVehicleType={setContractVehicleType}
            contractCustomer={contractCustomer}
            setContractCustomer={setContractCustomer}
            customers={customers}
            customerOptions={customerOptions}
            fieldErrors={fieldErrors}
            assignmentType={assignmentType}
            isEditMode={isEditMode}
          />

          {/* ROUTE WORKSPACE (ALWAYS 100% INTERACTIVE UNLESS ROUTE LOCKED) */}
          <div className="space-y-3">
            {contractSlots.map((slot) => (
              <RouteWorkspace
                key={slot.id}
                slot={slot}
                contractCustomer={contractCustomer}
                isRoundTrip={isRoundTrip}
                canRemoveSlot={contractSlots.length > 1}
                contractRateCategory={contractRateCategory}
                contractBillingType={contractBillingType}
                setContractRateCategory={setContractRateCategory}
                triggerRateLookupForSlots={triggerRateLookupForSlots}
                handleAddSlotIntermediate={handleAddSlotIntermediate}
                handleRemoveTripSlot={handleRemoveTripSlot}
                handleSlotLocationChange={handleSlotLocationChange}
                handleUpdateTripSlot={handleUpdateTripSlot}
                handleRemoveSlotIntermediate={handleRemoveSlotIntermediate}
                handleUpdateSlotIntermediate={handleUpdateSlotIntermediate}
                handleAddSlotReturnIntermediate={handleAddSlotReturnIntermediate}
                handleRemoveSlotReturnIntermediate={handleRemoveSlotReturnIntermediate}
                handleUpdateSlotReturnIntermediate={handleUpdateSlotReturnIntermediate}
                fieldErrors={fieldErrors}
                isRouteLocked={isRouteLocked}
              />
            ))}
          </div>
        </div>

        {/* RIGHT WORKSPACE (lg:col-span-5): EXECUTION ASSIGNMENT (TOP) & FINANCIAL SUMMARY (BELOW) */}
        <div className="lg:col-span-5">
          <div className="sticky top-4 space-y-3">
            <div className={cn("transition-opacity duration-200 space-y-3", !isEditMode && !isQuotationDefinedOrSelected && "opacity-50 pointer-events-none select-none")}>
              {/* REQUIREMENT 3: For Monthly trips, DO NOT show Assignment on Page 1 */}
              {contractBillingType?.toLowerCase() !== 'monthly' && (
                <ExecutionAssignmentSection
                  assignmentType={assignmentType}
                  setAssignmentType={setAssignmentType}
                  masterVehicle={masterVehicle}
                  masterDriver={masterDriver}
                  handleVehicleChange={handleVehicleChange}
                  handleDriverChange={handleDriverChange}
                  vehicleOptions={vehicleOptions}
                  driverOptions={driverOptions}
                  thirdPartyProviderId={thirdPartyProviderId}
                  setThirdPartyProviderId={setThirdPartyProviderId}
                  thirdPartyProviders={thirdPartyProviders}
                  thirdPartyVehiclePlate={thirdPartyVehiclePlate}
                  setThirdPartyVehiclePlate={setThirdPartyVehiclePlate}
                  thirdPartyDriverName={thirdPartyDriverName}
                  setThirdPartyDriverName={setThirdPartyDriverName}
                  thirdPartyDriverPhone={thirdPartyDriverPhone}
                  setThirdPartyDriverPhone={setThirdPartyDriverPhone}
                  thirdPartyCost={thirdPartyCost}
                  setThirdPartyCost={setThirdPartyCost}
                  contractSlots={contractSlots}
                  contractVehicleType={contractVehicleType}
                  setContractVehicleType={setContractVehicleType}
                  contractBillingType={contractBillingType}
                  fieldErrors={fieldErrors}
                  vehicles={vehicles}
                  isAssignmentLocked={isAssignmentLocked}
                  status={status}
                  awbNumber={awbNumber}
                  setAwbNumber={setAwbNumber}
                />
              )}

              <TripEconomicsSection
                contractSlots={contractSlots}
                masterDriver={masterDriver}
                assignmentType={assignmentType}
                thirdPartyCost={thirdPartyCost}
                marginMetrics={marginMetrics}
                contractCustomer={contractCustomer}
                customers={customers}
                handleUpdateTripSlot={handleUpdateTripSlot}
                isBaseBillingLocked={isBaseBillingLocked}
                isFinancialsLocked={isFinancialsLocked}
              />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default TripStep1UnifiedWorkspace;

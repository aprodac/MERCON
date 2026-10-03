import { useState, useEffect } from 'react';
import { toast } from 'sonner';

export const TRIP_DRAFT_STORAGE_KEY = 'mercon_trip_draft';

/** Drops the saved draft — called once its trips are created so it can't be restored twice. */
export function clearSavedTripDraft() {
  try {
    localStorage.removeItem(TRIP_DRAFT_STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function useTripDraftStorage(
  contractCustomer: string,
  contractRateCategory: string,
  contractBillingType: string,
  contractVehicleType: string,
  contractSlots: any[],
  masterDriver: string,
  masterVehicle: string,
  assignmentType: string,
  thirdPartyProviderId: string,
  thirdPartyDriverName: string,
  thirdPartyDriverPhone: string,
  thirdPartyVehiclePlate: string,
  thirdPartyCost: string,
  setContractCustomer: (val: string) => void,
  setContractRateCategory: (val: string) => void,
  setContractBillingType: (val: string) => void,
  setContractVehicleType: (val: string) => void,
  setContractSlots: (val: any[]) => void,
  setMasterDriver: (val: string) => void,
  setMasterVehicle: (val: string) => void,
  setAssignmentType: (val: any) => void,
  setThirdPartyProviderId: (val: string) => void,
  setThirdPartyDriverName: (val: string) => void,
  setThirdPartyDriverPhone: (val: string) => void,
  setThirdPartyVehiclePlate: (val: string) => void,
  setThirdPartyCost: (val: string) => void
) {
  const [hasSavedDraft, setHasSavedDraft] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(TRIP_DRAFT_STORAGE_KEY);
      if (saved) {
        setHasSavedDraft(true);
      }
    } catch (e) {
      console.warn('Failed to read draft from localStorage', e);
    }
  }, []);

  const restoreDraft = () => {
    try {
      const saved = localStorage.getItem(TRIP_DRAFT_STORAGE_KEY);
      if (!saved) return;
      const data = JSON.parse(saved);
      if (data.contractCustomer) setContractCustomer(data.contractCustomer);
      if (data.contractRateCategory) setContractRateCategory(data.contractRateCategory);
      if (data.contractBillingType) setContractBillingType(data.contractBillingType);
      if (data.contractVehicleType) setContractVehicleType(data.contractVehicleType);
      if (data.contractSlots && data.contractSlots.length > 0) setContractSlots(data.contractSlots);
      if (data.masterDriver) setMasterDriver(data.masterDriver);
      if (data.masterVehicle) setMasterVehicle(data.masterVehicle);
      if (data.assignmentType) setAssignmentType(data.assignmentType);
      if (data.thirdPartyProviderId) setThirdPartyProviderId(data.thirdPartyProviderId);
      if (data.thirdPartyDriverName) setThirdPartyDriverName(data.thirdPartyDriverName);
      if (data.thirdPartyDriverPhone) setThirdPartyDriverPhone(data.thirdPartyDriverPhone);
      if (data.thirdPartyVehiclePlate) setThirdPartyVehiclePlate(data.thirdPartyVehiclePlate);
      if (data.thirdPartyCost) setThirdPartyCost(data.thirdPartyCost);
      setHasSavedDraft(false);
      toast.success('Unsaved trip draft restored successfully.');
    } catch (e) {
      toast.error('Failed to restore draft.');
    }
  };

  const discardDraft = () => {
    localStorage.removeItem(TRIP_DRAFT_STORAGE_KEY);
    setHasSavedDraft(false);
    toast.info('Draft discarded.');
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (contractCustomer || contractSlots.some((s) => s.origin || s.destination)) {
        try {
          const draftPayload = {
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
            savedAt: new Date().toISOString(),
          };
          localStorage.setItem(TRIP_DRAFT_STORAGE_KEY, JSON.stringify(draftPayload));
        } catch (e) {
          console.warn('Failed to auto-save trip draft', e);
        }
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [
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
  ]);

  return {
    hasSavedDraft,
    restoreDraft,
    discardDraft,
  };
}

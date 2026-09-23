import { useState, useCallback } from 'react';
import { estimateTravelTimeByName, calculateArrivalDropoffTime } from '@/services/travelTimeService';
import { isUuid } from '@/lib/utils';
import { addDays } from './useCreateTripForm';

export interface TripSlot {
  id: string;
  origin: string;
  destination: string;
  originLocationId?: string | null;
  destinationLocationId?: string | null;
  rateMatched?: boolean;
  matchedRateCard?: any;
  rateCardId?: string;
  rateCardName?: string;
  rateCardBasePrice?: number;
  rateCardDefaultTripCharge?: number | null;
  pickupTime: string;
  dropoffTime: string;
  date: string;
  dropoffDate: string;
  billingAmount: string;
  tripCharges: string;
  driverPayout?: string;
  driverPayoutModified?: boolean;
  updateQuotationPayout?: boolean;
  saveAsQuotation?: boolean;
  saveAsRateCard?: boolean;
  pricingBasis?: 'Per Trip' | 'Per Month';
  rateReason?: string;
  isOvernight?: boolean;
  intermediateLocations: string[];
  intermediateLocationIds?: (string | null)[];
  intermediateStopFees?: string[];
  returnOrigin?: string;
  returnDestination?: string;
  returnOriginLocationId?: string | null;
  returnDestinationLocationId?: string | null;
  returnPickupTime?: string;
  returnDropoffTime?: string;
  returnIsOvernight?: boolean;
  returnIntermediateLocations?: string[];
  returnIntermediateLocationIds?: (string | null)[];
  returnIntermediateStopFees?: string[];
  originLat?: number | null;
  originLng?: number | null;
  originName?: string;
  originAddress?: string;
  originPrecision?: 'EXACT' | 'APPROXIMATE' | 'UNKNOWN';
  updateCanonicalOrigin?: boolean;
  destinationLat?: number | null;
  destinationLng?: number | null;
  destinationName?: string;
  destinationAddress?: string;
  destinationPrecision?: 'EXACT' | 'APPROXIMATE' | 'UNKNOWN';
  updateCanonicalDestination?: boolean;
  returnOriginLat?: number | null;
  returnOriginLng?: number | null;
  returnDestinationLat?: number | null;
  returnDestinationLng?: number | null;
  additionalCharges?: string;
  chargeLines?: any[];
}

export function useTripSlotsState() {
  const [contractSlots, setContractSlots] = useState<TripSlot[]>([
    {
      id: 'slot-1',
      origin: '',
      destination: '',
      originLocationId: null,
      destinationLocationId: null,
      rateMatched: false,
      pickupTime: '',
      dropoffTime: '',
      date: new Date().toISOString().slice(0, 10),
      dropoffDate: '',
      billingAmount: '',
      tripCharges: '',
      saveAsQuotation: false,
      saveAsRateCard: false,
      isOvernight: false,
      intermediateLocations: [],
      intermediateLocationIds: [],
      intermediateStopFees: [],
      returnOrigin: '',
      returnDestination: '',
      returnPickupTime: '',
      returnDropoffTime: '',
      returnIsOvernight: false,
      returnIntermediateLocations: [],
      returnIntermediateStopFees: [],
      originLat: null,
      originLng: null,
      destinationLat: null,
      destinationLng: null,
      returnOriginLat: null,
      returnOriginLng: null,
      returnDestinationLat: null,
      returnDestinationLng: null,
    },
  ]);

  const handleAddTripSlot = () => {
    setContractSlots((prev) => {
      const defaultPickup = prev[0]?.pickupTime || '';
      const defaultDropoff = prev[0]?.dropoffTime || '';
      return [
        ...prev,
        {
          id: `slot-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          origin: prev[0]?.origin || '',
          destination: prev[0]?.destination || '',
          originLocationId: prev[0]?.originLocationId || null,
          destinationLocationId: prev[0]?.destinationLocationId || null,
          pickupTime: defaultPickup,
          dropoffTime: defaultDropoff,
          date: prev[0]?.date || new Date().toISOString().slice(0, 10),
          dropoffDate: '',
          billingAmount: prev[0]?.billingAmount || '',
          tripCharges: prev[0]?.tripCharges || '',
          rateMatched: prev[0]?.rateMatched || false,
          rateCardId: prev[0]?.rateCardId,
          rateCardName: prev[0]?.rateCardName,
          rateCardBasePrice: prev[0]?.rateCardBasePrice,
          rateCardDefaultTripCharge: prev[0]?.rateCardDefaultTripCharge,
          isOvernight: false,
          intermediateLocations: [...(prev[0]?.intermediateLocations || [])],
          intermediateStopFees: [...(prev[0]?.intermediateStopFees || [])],
          returnOrigin: prev[0]?.returnOrigin || '',
          returnDestination: prev[0]?.returnDestination || '',
          returnIntermediateLocations: [...(prev[0]?.returnIntermediateLocations || [])],
          returnIntermediateStopFees: [...(prev[0]?.returnIntermediateStopFees || [])],
        },
      ];
    });
  };

  const handleRemoveTripSlot = (id: string) => {
    if (contractSlots.length <= 1) return;
    setContractSlots((prev) => prev.filter((s) => s.id !== id));
  };

  const handleUpdateTripSlot = (id: string, updates: Partial<TripSlot>) => {
    setContractSlots((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
  };

  const handleAddSlotIntermediate = (slotId: string) => {
    setContractSlots((prev) =>
      prev.map((s) => {
        if (s.id !== slotId) return s;
        const isUserTypedRate = Boolean(s.saveAsQuotation || s.saveAsRateCard || s.driverPayoutModified);
        return {
          ...s,
          intermediateLocations: [...s.intermediateLocations, ''],
          intermediateLocationIds: [...(s.intermediateLocationIds || []), null],
          intermediateStopFees: [...(s.intermediateStopFees || []), ''],
          rateMatched: false,
          matchedRateCard: null,
          rateCardId: undefined,
          billingAmount: isUserTypedRate ? s.billingAmount : '',
          driverPayout: isUserTypedRate ? s.driverPayout : '',
        };
      })
    );
  };

  const handleRemoveSlotIntermediate = (slotId: string, idx: number) => {
    setContractSlots((prev) =>
      prev.map((s) => {
        if (s.id !== slotId) return s;
        const isUserTypedRate = Boolean(s.saveAsQuotation || s.saveAsRateCard || s.driverPayoutModified);
        return {
          ...s,
          intermediateLocations: s.intermediateLocations.filter((_, i) => i !== idx),
          intermediateLocationIds: (s.intermediateLocationIds || []).filter((_, i) => i !== idx),
          intermediateStopFees: (s.intermediateStopFees || []).filter((_, i) => i !== idx),
          rateMatched: false,
          matchedRateCard: null,
          rateCardId: undefined,
          billingAmount: isUserTypedRate ? s.billingAmount : '',
          driverPayout: isUserTypedRate ? s.driverPayout : '',
        };
      })
    );
  };

  const handleUpdateSlotIntermediate = (slotId: string, idx: number, val: string, locObj?: any) => {
    setContractSlots((prev) =>
      prev.map((s) => {
        if (s.id !== slotId) return s;
        const newLocs = [...s.intermediateLocations];
        const newIds = [...(s.intermediateLocationIds || [])];
        newLocs[idx] = val;
        newIds[idx] = locObj?.id ?? null;
        const isUserTypedRate = Boolean(s.saveAsQuotation || s.saveAsRateCard || s.driverPayoutModified);
        return {
          ...s,
          intermediateLocations: newLocs,
          intermediateLocationIds: newIds,
          rateMatched: false,
          matchedRateCard: null,
          rateCardId: undefined,
          billingAmount: isUserTypedRate ? s.billingAmount : '',
          driverPayout: isUserTypedRate ? s.driverPayout : '',
        };
      })
    );
  };

  const handleUpdateSlotIntermediateFee = (slotId: string, idx: number, val: string) => {
    setContractSlots((prev) =>
      prev.map((s) => {
        if (s.id !== slotId) return s;
        const newFees = [...(s.intermediateStopFees || [])];
        newFees[idx] = val;
        return {
          ...s,
          intermediateStopFees: newFees,
        };
      })
    );
  };

  const handleAddSlotReturnIntermediate = (slotId: string) => {
    setContractSlots((prev) =>
      prev.map((s) =>
        s.id === slotId
          ? {
              ...s,
              returnIntermediateLocations: [...(s.returnIntermediateLocations || []), ''],
              returnIntermediateStopFees: [...(s.returnIntermediateStopFees || []), ''],
            }
          : s
      )
    );
  };

  const handleRemoveSlotReturnIntermediate = (slotId: string, idx: number) => {
    setContractSlots((prev) =>
      prev.map((s) =>
        s.id === slotId
          ? {
              ...s,
              returnIntermediateLocations: (s.returnIntermediateLocations || []).filter((_, i) => i !== idx),
              returnIntermediateStopFees: (s.returnIntermediateStopFees || []).filter((_, i) => i !== idx),
            }
          : s
      )
    );
  };

  const handleUpdateSlotReturnIntermediate = (slotId: string, idx: number, val: string) => {
    setContractSlots((prev) =>
      prev.map((s) => {
        if (s.id !== slotId) return s;
        const newLocs = [...(s.returnIntermediateLocations || [])];
        newLocs[idx] = val;
        return {
          ...s,
          returnIntermediateLocations: newLocs,
        };
      })
    );
  };

  const handleUpdateSlotReturnIntermediateFee = (slotId: string, idx: number, val: string) => {
    setContractSlots((prev) =>
      prev.map((s) => {
        if (s.id !== slotId) return s;
        const newFees = [...(s.returnIntermediateStopFees || [])];
        newFees[idx] = val;
        return {
          ...s,
          returnIntermediateStopFees: newFees,
        };
      })
    );
  };

  return {
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
  };
}

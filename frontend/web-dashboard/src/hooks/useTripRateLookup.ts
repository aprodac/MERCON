import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { quotationService, RateCard } from '@/services/quotationService';
import { normalizeVehicleClass, normalizeRateCategory, normalizeBillingType } from './useCreateTripForm';
import { isRoundTripCategory, quotationMatchesRoute } from '@mercon/shared-types';
import { routeLegsFromSlot } from '@/utils/tripStopsHelper';

export function useTripRateLookup(
  contractCustomer: string,
  contractVehicleType: string,
  contractRateCategory: string,
  contractBillingType: string,
  contractStep: number,
  explicitBillingType?: string | null
) {
  const navigate = useNavigate();

  const { data: rateCardsRes } = useQuery({
    queryKey: ['quotations', 'select-all'],
    queryFn: () => quotationService.getAll({ active_only: true }),
    staleTime: 0,
  });

  const allRateCards: RateCard[] = rateCardsRes?.data ?? [];

  const targetBillingType = explicitBillingType ? normalizeBillingType(explicitBillingType) : null;

  const customerRateCards: RateCard[] = useMemo(() => {
    let baseCards = allRateCards;
    if (contractCustomer) {
      baseCards = baseCards.filter((rc) => rc.customerId === contractCustomer || (rc as any).customer_id === contractCustomer);
    }
    if (targetBillingType) {
      baseCards = baseCards.filter((rc) => {
        const rcBilling = normalizeBillingType((rc as any).operation_type || (rc as any).quotation_operation_type || rc.billing_type);
        return rcBilling === targetBillingType;
      });
    }
    return baseCards;
  }, [allRateCards, contractCustomer, targetBillingType]);

  const handleOpenCreateQuotation = (slot?: any) => {
    const originId = slot?.originLocationId || '';
    const destId = slot?.destinationLocationId || '';
    const originName = slot?.originLocationName || slot?.origin || '';
    const destName = slot?.destinationLocationName || slot?.destination || '';
    const vClass = normalizeVehicleClass(contractVehicleType);
    const lType = normalizeRateCategory(contractRateCategory);
    const bType = normalizeBillingType(contractBillingType);
    const priceVal = slot?.billingAmount || '';

    const params = new URLSearchParams({
      return_to_trip: 'true',
      return_step: String(contractStep),
      customer_id: contractCustomer || '',
      origin_id: originId,
      destination_id: destId,
      origin_name: originName,
      destination_name: destName,
      vehicle_class: vClass,
      line_type: lType,
      billing_type: bType,
      price: priceVal,
    });

    navigate(`/quotations/new?${params.toString()}`);
  };

  const getMatchingRateCard = useCallback((
    origin?: string,
    destination?: string,
    vehicleType?: string,
    rateCategory?: string,
    billingType?: string,
    targetDate?: string,
    originLocationId?: string | null,
    destinationLocationId?: string | null
  ): RateCard | null => {
    if ((!origin && !originLocationId) || (!destination && !destinationLocationId) || customerRateCards.length === 0) return null;

    const norm = (s?: string | null) => String(s || '').toLowerCase().replace(/[\s,_()[\]\/{}\-.]/g, '');
    const oNorm = norm(origin);
    const dNorm = norm(destination);
    const vNorm = norm(vehicleType);
    const cNorm = norm(rateCategory);
    const bNormTarget = norm(billingType);

    const checkValidity = (rc: RateCard) => {
      if (!targetDate) return true;
      const t = new Date(targetDate).getTime();
      if (isNaN(t)) return true;
      if (rc.valid_from && new Date(rc.valid_from).getTime() > t) return false;
      if (rc.valid_to && new Date(rc.valid_to).getTime() < t) return false;
      return true;
    };

    const matchLocation = (cardLocRaw: string, targetLocRaw: string) => {
      if (!cardLocRaw || !targetLocRaw) return false;
      const cleanCard = norm(cardLocRaw);
      const cleanTarget = norm(targetLocRaw);
      if (cleanCard === cleanTarget) return true;
      if (cleanCard.includes(cleanTarget) || cleanTarget.includes(cleanCard)) return true;

      const getTokens = (s: string) =>
        s.toLowerCase().split(/[\s,_()[\]\/{}\-.]+/).filter((t) => t.length > 2 && t !== 'al' && t !== 'el' && t !== 'the' && t !== 'station' && t !== 'centre' && t !== 'center' && t !== 'hub');

      const cardTokens = getTokens(cardLocRaw);
      const targetTokens = getTokens(targetLocRaw);
      if (cardTokens.length === 0 || targetTokens.length === 0) return false;
      return cardTokens.some((ct) => targetTokens.some((tt) => ct === tt || ct.includes(tt) || tt.includes(ct)));
    };

    const matchLane = (rc: RateCard) => {
      const firstStop = rc.stops && rc.stops.length > 0 ? rc.stops[0] : null;
      const lastStop = rc.stops && rc.stops.length > 1 ? rc.stops[rc.stops.length - 1] : firstStop;

      const rcO = String(
        firstStop?.source_label || firstStop?.location?.name || firstStop?.location?.address || (firstStop as any)?.location_name || rc.route_origin || rc.origin_name || rc.originLocation?.name || rc.originLocation?.address || (rc as any).origin_location_id || rc.originLocationId || ''
      );
      const rcD = String(
        lastStop?.source_label || lastStop?.location?.name || lastStop?.location?.address || (lastStop as any)?.location_name || rc.route_destination || rc.destination_name || rc.destinationLocation?.name || rc.destinationLocation?.address || (rc as any).destination_location_id || rc.destinationLocationId || ''
      );

      const rcOriginLocId = firstStop?.locationId || firstStop?.location?.id || (rc as any).origin_location_id || rc.originLocationId;
      const rcDestLocId = lastStop?.locationId || lastStop?.location?.id || (rc as any).destination_location_id || rc.destinationLocationId;

      if (originLocationId && destinationLocationId && rcOriginLocId && rcDestLocId) {
        if (rcOriginLocId === originLocationId && rcDestLocId === destinationLocationId) {
          return true;
        }
      }

      return matchLocation(rcO, origin || '') && matchLocation(rcD, destination || '');
    };

    const normalizeLineTypeToken = (s?: string | null): string => {
      if (!s) return '';
      const str = String(s).toUpperCase().replace(/_/g, ' ');
      if (str.includes('10')) return '10_HRS';
      if (str.includes('12')) return '12_HRS';
      if (str.includes('ROUND')) return 'ROUND_TRIP';
      if (str.includes('SINGLE')) return 'SINGLE_TRIP';
      return str.replace(/[\s,_()[\]\/{}\-.]/g, '');
    };

    const exact = customerRateCards.find((rc) => {
      if (!checkValidity(rc)) return false;
      if (!matchLane(rc)) return false;

      const rcV = norm(rc.vehicle_type || rc.vehicle_class || rc.source_vehicle_label);
      const rcC = normalizeLineTypeToken(rc.rate_category || rc.line_type);
      const targetC = normalizeLineTypeToken(rateCategory);
      const rcB = norm(normalizeBillingType((rc as any).operation_type || (rc as any).quotation_operation_type || rc.billing_type));
      const targetB = norm(normalizeBillingType(contractBillingType));

      const vMatch = !vNorm || !rcV || rcV === vNorm;
      const cMatch = !targetC || !rcC || rcC === targetC;
      const bMatch = !targetB || !rcB || rcB === targetB;

      return vMatch && cMatch && bMatch;
    });

    return exact || null;
  }, [customerRateCards]);

  const getAvailableRateCardsForLane = useCallback((
    originOrSlot?: any,
    destination?: string,
    originLocationId?: string | null,
    destinationLocationId?: string | null,
    rateCategory?: string | null,
    returnDestination?: string | null,
    returnDestinationLocationId?: string | null
  ): RateCard[] => {
    if (!customerRateCards || customerRateCards.length === 0) return [];

    let orig = originOrSlot;
    let dest = destination;
    let origLocId = originLocationId;
    let destLocId = destinationLocationId;
    let rCat = rateCategory;
    let retDest = returnDestination;
    let retDestLocId = returnDestinationLocationId;

    // Handle single object slot argument (e.g. getAvailableRateCardsForLane(primarySlot))
    if (originOrSlot && typeof originOrSlot === 'object') {
      const slot = originOrSlot;
      orig = slot.origin;
      dest = slot.destination;
      origLocId = slot.originLocationId;
      destLocId = slot.destinationLocationId;
      rCat = slot.contractRateCategory || rateCategory;
      retDest = slot.returnDestination;
      retDestLocId = slot.returnDestinationLocationId;
    }

    const norm = (s?: any) => String(s?.name || s || '').toLowerCase().replace(/[\s,_()[\]\/{}\-.]/g, '');

    // If no origin or destination has been set yet, show all active quotations across all companies!
    const hasOrigin = Boolean(orig || origLocId);
    const hasDestination = Boolean(dest || destLocId);
    if (!hasOrigin && !hasDestination) {
      return customerRateCards;
    }

    const isRoundTrip = isRoundTripCategory(rCat || contractRateCategory || '');

    // With a full route entered, only quotations for exactly this route count:
    // every stop, outbound and return, in order. Adding a stop (or a return
    // stop) therefore leaves no match, which opens "Define Quotation".
    if (originOrSlot && typeof originOrSlot === 'object' && hasOrigin && hasDestination) {
      const legs = routeLegsFromSlot(originOrSlot, isRoundTrip);
      return customerRateCards.filter((rc) => {
        if (isRoundTrip !== isRoundTripCategory(String(rc.line_type || rc.rate_category || ''))) return false;
        return quotationMatchesRoute(rc as any, legs, isRoundTrip);
      });
    }

    const matchLocation = (cardLocRaw: any, targetLocRaw: any) => {
      if (!cardLocRaw || !targetLocRaw) return false;
      const cleanCard = norm(cardLocRaw);
      const cleanTarget = norm(targetLocRaw);
      if (!cleanCard || !cleanTarget) return false;
      if (cleanCard === cleanTarget) return true;
      if (cleanCard.includes(cleanTarget) || cleanTarget.includes(cleanCard)) return true;

      const getTokens = (s: any) =>
        String(s?.name || s || '')
          .toLowerCase()
          .split(/[\s,_()[\]\/{}\-.]+/)
          .filter((t) => t.length > 2 && t !== 'al' && t !== 'el' && t !== 'the' && t !== 'station' && t !== 'center' && t !== 'centre' && t !== 'hub');

      const cardTokens = getTokens(cardLocRaw);
      const targetTokens = getTokens(targetLocRaw);
      if (cardTokens.length === 0 || targetTokens.length === 0) return false;
      return cardTokens.some((ct) => targetTokens.some((tt) => ct === tt || ct.includes(tt) || tt.includes(ct)));
    };

    return customerRateCards.filter((rc) => {
      const firstStop = rc.stops && rc.stops.length > 0 ? rc.stops[0] : null;
      const lastStop = rc.stops && rc.stops.length > 1 ? rc.stops[rc.stops.length - 1] : firstStop;

      const rcO = String(
        firstStop?.source_label || firstStop?.location?.name || firstStop?.location?.address || (firstStop as any)?.location_name || rc.route_origin || rc.origin_name || rc.originLocation?.name || rc.originLocation?.address || (rc as any).origin_location_id || rc.originLocationId || ''
      );
      const rcD = String(
        lastStop?.source_label || lastStop?.location?.name || lastStop?.location?.address || (lastStop as any)?.location_name || rc.route_destination || rc.destination_name || rc.destinationLocation?.name || rc.destinationLocation?.address || (rc as any).destination_location_id || rc.destinationLocationId || ''
      );

      const rcOriginLocId = firstStop?.locationId || firstStop?.location?.id || (rc as any).origin_location_id || rc.originLocationId;
      const rcDestLocId = lastStop?.locationId || lastStop?.location?.id || (rc as any).destination_location_id || rc.destinationLocationId;

      if (origLocId && rcOriginLocId && rcOriginLocId === origLocId) {
        if (destLocId && rcDestLocId === destLocId) return true;
        if (retDestLocId && rcDestLocId === retDestLocId) return true;
      }

      const originMatches = matchLocation(rcO, orig || '');
      const destMatches = matchLocation(rcD, dest || '') || (retDest ? matchLocation(rcD, retDest) : false);

      if (!originMatches) return false;

      if (isRoundTrip) {
        const rcLineType = norm(rc.line_type || rc.rate_category);
        if (rcLineType.includes('roundtrip') || rcLineType.includes('round')) {
          return true;
        }
      }

      return destMatches;
    });
  }, [customerRateCards, contractRateCategory]);

  return {
    customerRateCards,
    handleOpenCreateQuotation,
    getMatchingRateCard,
    getAvailableRateCardsForLane,
  };
}

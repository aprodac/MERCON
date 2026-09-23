import { isUuid } from '@/lib/utils';
import { buildTripStops, BuiltTripStop } from '@mercon/shared-types';

const safeUuid = (id?: string | null): string | null => (id && isUuid(id) ? id : null);

export interface MapSlotToStopsInput {
  origin?: string;
  originName?: string;
  originAddress?: string;
  originLocationId?: string | null;
  originLat?: number | null;
  originLng?: number | null;
  originPrecision?: string;
  updateCanonicalOrigin?: boolean;

  destination?: string;
  destinationName?: string;
  destinationAddress?: string;
  destinationLocationId?: string | null;
  destinationLat?: number | null;
  destinationLng?: number | null;
  destinationPrecision?: string;
  updateCanonicalDestination?: boolean;

  intermediateLocations?: string[];
  intermediateLocationIds?: (string | null)[];

  returnOrigin?: string;
  returnOriginLocationId?: string | null;
  returnOriginLat?: number | null;
  returnOriginLng?: number | null;

  returnDestination?: string;
  returnDestinationLocationId?: string | null;
  returnDestinationLat?: number | null;
  returnDestinationLng?: number | null;

  returnIntermediateLocations?: string[];
  returnIntermediateLocationIds?: (string | null)[];
}

export function buildStopsFromSlot(slot: MapSlotToStopsInput, isRound: boolean): BuiltTripStop[] {
  const originStr = (slot.origin || '').trim();
  const destStr = (slot.destination || '').trim();

  const outboundStops = (slot.intermediateLocations || []).map((s) => (s || '').trim()).filter(Boolean);
  const returnStops = (slot.returnIntermediateLocations || []).map((s) => (s || '').trim()).filter(Boolean);

  const returnStart = (slot.returnOrigin || '').trim() || destStr;
  const returnEnd = (slot.returnDestination || '').trim() || originStr;

  return buildTripStops({
    origin: {
      name: slot.originName || originStr,
      address: slot.originAddress || null,
      location_id: safeUuid(slot.originLocationId),
      lat: slot.originLat ?? null,
      lng: slot.originLng ?? null,
      coordinate_precision: slot.originPrecision || (slot.originLat != null ? 'APPROXIMATE' : 'UNKNOWN'),
      update_canonical_location: slot.updateCanonicalOrigin === true,
    },
    intermediates: outboundStops.map((stopName: string, idx: number) => ({
      name: stopName,
      location_id: safeUuid(slot.intermediateLocationIds?.[idx]),
    })),
    destination: {
      name: slot.destinationName || destStr,
      address: slot.destinationAddress || null,
      location_id: safeUuid(slot.destinationLocationId),
      lat: slot.destinationLat ?? null,
      lng: slot.destinationLng ?? null,
      coordinate_precision: slot.destinationPrecision || (slot.destinationLat != null ? 'APPROXIMATE' : 'UNKNOWN'),
      update_canonical_location: slot.updateCanonicalDestination === true,
    },
    isRound,
    returnOrigin: isRound
      ? {
          name: returnStart,
          location_id: safeUuid(
            slot.returnOriginLocationId ||
              (returnStart === destStr ? slot.destinationLocationId : null)
          ),
          lat: slot.returnOriginLat ?? null,
          lng: slot.returnOriginLng ?? null,
        }
      : undefined,
    returnIntermediates: isRound
      ? returnStops.map((stopName: string, idx: number) => ({
          name: stopName,
          location_id: safeUuid(slot.returnIntermediateLocationIds?.[idx]),
        }))
      : undefined,
    returnDestination: isRound
      ? {
          name: returnEnd,
          location_id: safeUuid(
            slot.returnDestinationLocationId ||
              (returnEnd === originStr ? slot.originLocationId : null)
          ),
          lat: slot.returnDestinationLat ?? null,
          lng: slot.returnDestinationLng ?? null,
        }
      : undefined,
  });
}

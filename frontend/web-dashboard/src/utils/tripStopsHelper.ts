import { isUuid } from '@/lib/utils';
import { buildTripStops, BuiltTripStop, type RouteLegs, type RouteStopRef } from '@mercon/shared-types';

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

/**
 * The wizard route as legs for quotation matching: every stop, in order —
 * outbound [origin, …stops, destination] and, for a round trip, return
 * [return loading (default: destination), …return stops, final drop (default: origin)].
 */
export function routeLegsFromSlot(slot: MapSlotToStopsInput, isRound: boolean): RouteLegs {
  // Some wizard fields hold a Location id in the name slot — treat it as the id.
  const ref = (name?: string | null, id?: string | null): RouteStopRef => {
    const n = (name || '').trim();
    const resolvedId = safeUuid(id ?? null) ?? safeUuid(n);
    return { id: resolvedId, name: resolvedId && isUuid(n) ? null : n || null };
  };
  const origin = ref(slot.originName || slot.origin, slot.originLocationId);
  const destination = ref(slot.destinationName || slot.destination, slot.destinationLocationId);
  const mids = (names?: string[], ids?: (string | null)[]) =>
    (names || [])
      .map((n, i) => ({ n: (n || '').trim(), id: ids?.[i] ?? null }))
      .filter((x) => x.n || x.id)
      .map((x) => ref(x.n, x.id));
  const outbound = [origin, ...mids(slot.intermediateLocations, slot.intermediateLocationIds), destination];
  if (!isRound) return [outbound];
  const retStart = (slot.returnOrigin || '').trim()
    ? ref(slot.returnOrigin, slot.returnOriginLocationId)
    : destination;
  const retEnd = (slot.returnDestination || '').trim()
    ? ref(slot.returnDestination, slot.returnDestinationLocationId)
    : origin;
  return [outbound, [retStart, ...mids(slot.returnIntermediateLocations, slot.returnIntermediateLocationIds), retEnd]];
}

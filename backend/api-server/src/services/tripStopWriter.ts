import { Prisma, StopType } from '@prisma/client';
import { resolveLocation } from '../controllers/locationController';
import { validateTripStops } from './tripValidationService';
import { isRoundTripCategory, getLegEndpoints } from '@mercon/shared-types';
import { parseFullTripStops } from './legacyStopStringParser';
import { logger } from '../utils/logger';

function parseOptionalFloat(val: any): number | null {
  if (val === undefined || val === null || val === '') return null;
  const num = Number(val);
  return isNaN(num) ? null : num;
}

export interface TripStopWriterInput {
  customerId: string;
  createdBy?: string | null;
  stops?: any[];
  origin?: string;
  destination?: string;
  plannedStart?: Date | null;
  plannedEnd?: Date | null;
  rateCategory?: string | null;
  quotationStops?: any[];
}

export interface TripStopWriterResult {
  stopsToCreate: Array<{
    stop_sequence: number;
    leg_index: number;
    stop_type: StopType;
    location_lat: number | null;
    location_lng: number | null;
    location_coordinate_precision: string;
    location_name: string | null;
    location_address: string | null;
    locationId: string | null;
    planned_arrival: Date | null;
  }>;
  resolvedStops: Array<any>;
  originLocationId: string | null;
  destinationLocationId: string | null;
  normalizedRateCategory: string | null;
  hasReturnLeg: boolean;
}

export async function writeTripStops(
  tx: Prisma.TransactionClient,
  input: TripStopWriterInput
): Promise<TripStopWriterResult> {
  const { customerId, createdBy, plannedStart, plannedEnd, rateCategory } = input;

  let rawStops: any[] = [];
  if (Array.isArray(input.stops) && input.stops.length > 0) {
    rawStops = input.stops.map((st, idx) => ({
      stop_sequence: st.stop_sequence ?? (idx + 1),
      leg_index: st.leg_index !== undefined && st.leg_index !== null ? Number(st.leg_index) : undefined,
      stop_type: st.stop_type || 'Rest',
      location_name: String(st.location_name ?? st.name ?? '').trim(),
      location_address: String(st.location_address ?? st.address ?? '').trim() || null,
      location_id: st.location_id || st.locationId || null,
      lat: st.lat ?? st.location_lat ?? null,
      lng: st.lng ?? st.location_lng ?? null,
      coordinate_precision: st.coordinate_precision || st.location_coordinate_precision || null,
      update_canonical_location: Boolean(st.update_canonical_location),
      planned_arrival: st.planned_arrival ?? null,
    }));
  } else if (input.origin || input.destination) {
    rawStops = parseFullTripStops(input.origin || '', input.destination || '');
  } else if (Array.isArray(input.quotationStops) && input.quotationStops.length > 0) {
    rawStops = input.quotationStops.map((qs: any, idx: number) => ({
      stop_sequence: idx + 1,
      leg_index: qs.leg_index !== undefined && qs.leg_index !== null ? Number(qs.leg_index) : 0,
      stop_type: qs.stop_type || (idx === 0 ? 'Pickup' : 'Dropoff'),
      location_name: String(qs.location_name || qs.source_label || qs.location?.name || '').trim(),
      location_id: qs.location_id || qs.locationId || null,
      lat: qs.lat ?? qs.location?.lat ?? null,
      lng: qs.lng ?? qs.location?.lng ?? null,
    }));
  }

  if (rawStops.length === 0) {
    return {
      stopsToCreate: [],
      resolvedStops: [],
      originLocationId: null,
      destinationLocationId: null,
      normalizedRateCategory: rateCategory || null,
      hasReturnLeg: false,
    };
  }

  // 1. Resolve locations & canonical master data
  const resolvedStops = await Promise.all(
    rawStops.map(async (stop: any) => {
      const stopName = String(stop.location_name ?? '').trim();
      let locId = stop.location_id || null;
      let resolvedLoc: any = null;

      if (locId) {
        resolvedLoc = await resolveLocation(
          tx,
          { id: locId, customerId, skipCanonicalUpdate: true },
          createdBy
        );
        if (resolvedLoc) locId = resolvedLoc.id;
      } else if (stopName) {
        try {
          const loc = await resolveLocation(
            tx,
            {
              customerId,
              name: stopName,
              address: String(stop.location_address ?? '').trim() || null,
              lat: parseOptionalFloat(stop.lat),
              lng: parseOptionalFloat(stop.lng),
              skipCanonicalUpdate: !stop.update_canonical_location,
            },
            createdBy
          );
          if (loc) { locId = loc.id; resolvedLoc = loc; }
        } catch (e) {
          logger.warn({ err: e }, 'Failed to resolve location for trip stop');
        }
      }

      // Stops sent without coordinates/address (the default return-leg stops
      // from buildTripStops, spreadsheet/CSV rows) take them from the Location
      // master record — driver navigation and geofence arrival need them.
      const hasCoords = parseOptionalFloat(stop.lat) != null && parseOptionalFloat(stop.lng) != null;
      if (!hasCoords && resolvedLoc?.lat != null && resolvedLoc?.lng != null) {
        stop = {
          ...stop,
          lat: resolvedLoc.lat,
          lng: resolvedLoc.lng,
          coordinate_precision: stop.coordinate_precision || resolvedLoc.coordinate_precision || 'APPROXIMATE',
        };
      }
      if (!stop.location_address && resolvedLoc?.address) {
        stop = { ...stop, location_address: resolvedLoc.address };
      }

      if (stop.update_canonical_location === true && locId) {
        const parsedLat = parseOptionalFloat(stop.lat);
        const parsedLng = parseOptionalFloat(stop.lng);
        try {
          await tx.location.update({
            where: { id: locId },
            data: {
              ...(parsedLat != null ? { lat: parsedLat } : {}),
              ...(parsedLng != null ? { lng: parsedLng } : {}),
              ...(stop.location_address ? { address: String(stop.location_address).trim() } : {}),
              coordinate_precision: 'EXACT',
              updated_by: createdBy,
            },
          });
        } catch (uErr) {
          logger.warn({ err: uErr }, 'Failed to update canonical location master data during trip creation');
        }
      }

      return { ...stop, location_id: locId };
    })
  );

  // 2. Validate stops
  const stopValidation = validateTripStops(resolvedStops);
  if (!stopValidation.isValid) {
    throw new Error(stopValidation.error || 'Invalid trip stops configuration.');
  }

  // 3. Check for return leg presence (explicit leg_index === 1)
  const hasReturnLeg = resolvedStops.some((s) => Number(s.leg_index ?? 0) === 1);
  const isRoundCat = rateCategory ? isRoundTripCategory(rateCategory) : false;

  if (hasReturnLeg && rateCategory && !isRoundCat) {
    throw new Error(
      `ROUND_TRIP_MISMATCH: Trip contains return leg stops (leg_index = 1) but rate_category "${rateCategory}" is not a round-trip classification.`
    );
  }
  if (!hasReturnLeg && rateCategory && isRoundCat) {
    throw new Error(
      `ROUND_TRIP_MISMATCH: rate_category "${rateCategory}" requires a return leg (leg_index = 1) stop configuration.`
    );
  }

  let normalizedRateCategory = rateCategory || null;
  if (!normalizedRateCategory && hasReturnLeg) {
    normalizedRateCategory = 'ROUND_TRIP';
  } else if (!normalizedRateCategory && !hasReturnLeg) {
    normalizedRateCategory = 'SINGLE_TRIP';
  }

  // 4. Build database create records
  const stopsToCreate = resolvedStops.map((stop: any, index: number) => {
    let rawLat = parseOptionalFloat(stop.lat);
    let rawLng = parseOptionalFloat(stop.lng);
    if (rawLat === 0 && rawLng === 0) {
      rawLat = null;
      rawLng = null;
    }

    const isValidCoord =
      rawLat != null &&
      rawLng != null &&
      rawLat >= -90 &&
      rawLat <= 90 &&
      rawLng >= -180 &&
      rawLng <= 180;

    const latVal = isValidCoord ? rawLat : null;
    const lngVal = isValidCoord ? rawLng : null;
    const precisionVal =
      stop.coordinate_precision ||
      stop.location_coordinate_precision ||
      (latVal == null || lngVal == null ? 'UNKNOWN' : 'APPROXIMATE');

    let stopPlannedArrival: Date | null = null;
    if (stop.planned_arrival && !isNaN(Date.parse(stop.planned_arrival))) {
      stopPlannedArrival = new Date(stop.planned_arrival);
    } else if (index === 0 && plannedStart) {
      stopPlannedArrival = plannedStart;
    } else if (index === resolvedStops.length - 1 && plannedEnd) {
      stopPlannedArrival = plannedEnd;
    }

    const rawStopType = String(stop.stop_type || 'Dropoff');
    const normalizedStopType: StopType = (rawStopType === 'Stop' ? 'Rest' : rawStopType) as StopType;

    const calculatedLegIndex = stop.leg_index !== undefined && stop.leg_index !== null ? Number(stop.leg_index) : 0;

    return {
      stop_sequence: index + 1,
      leg_index: calculatedLegIndex,
      stop_type: normalizedStopType,
      location_lat: latVal,
      location_lng: lngVal,
      location_coordinate_precision: precisionVal,
      location_name: String(stop.location_name ?? '').trim() || null,
      location_address: String(stop.location_address ?? '').trim() || null,
      locationId: stop.location_id || null,
      planned_arrival: stopPlannedArrival,
    };
  });

  // 5. Derive lane endpoints using getLegEndpoints for Leg 0
  const leg0Endpoints = getLegEndpoints({ stops: stopsToCreate as any }, 0);
  const originLocationId = leg0Endpoints.loading?.locationId || null;
  const destinationLocationId = leg0Endpoints.delivery?.locationId || null;

  return {
    stopsToCreate,
    resolvedStops,
    originLocationId,
    destinationLocationId,
    normalizedRateCategory,
    hasReturnLeg,
  };
}

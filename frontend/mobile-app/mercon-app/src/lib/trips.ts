import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { api } from './api';

export const workflowStateStore = {
  async getState(tripId: string): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        return localStorage.getItem(`workflow_state_${tripId}`);
      }
      return await SecureStore.getItemAsync(`workflow_state_${tripId}`);
    } catch {
      return null;
    }
  },
  async saveState(tripId: string, state: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        localStorage.setItem(`workflow_state_${tripId}`, state);
        return;
      }
      await SecureStore.setItemAsync(`workflow_state_${tripId}`, state);
    } catch {}
  },
  async clearState(tripId: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        localStorage.removeItem(`workflow_state_${tripId}`);
        return;
      }
      await SecureStore.deleteItemAsync(`workflow_state_${tripId}`);
    } catch {}
  }
};

export type TripStatus =
  | 'Scheduled' | 'Loading' | 'InTransit' | 'Delayed'
  | 'Emergency' | 'Completed' | 'Invoiced' | 'Cancelled'
  | 'Draft' | 'Dispatched' | 'AtPickup' | 'AtDelivery';

export type StopType = 'Pickup' | 'Dropoff' | 'Rest' | 'Refuel';

export interface TripStop {
  id: string;
  stop_sequence: number;
  leg_index?: number;
  stop_type: StopType;
  location_lat: number;
  location_lng: number;
  location_name: string | null;
  location_address: string | null;
  location?: { id: string; name: string; address: string | null } | null;
  actual_arrival?: string | null;
  actual_departure?: string | null;
}

/** Checks if a string looks like a raw ID, CUID, UUID, or database key. */
export function isIdString(str?: string | null): boolean {
  if (!str || typeof str !== 'string') return true;
  const s = str.trim();
  if (!s) return true;
  // Standard UUID pattern
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return true;
  // Prefixed ID like loc-..., loc_..., location..., trip-..., CUID (cly..., clx...)
  if (/^(loc|location|trp|trip|stop)[-_0-9]/i.test(s) || /^location$/i.test(s)) return true;
  if (/^c[a-z0-9]{15,}/i.test(s)) return true;
  // Alphanumeric/hex ID string with no spaces (e.g. loc9028, 65f29a018b...)
  if (/^[a-z0-9_-]{8,}$/i.test(s) && !s.includes(' ') && (/\d/.test(s) || /[-_]/.test(s))) return true;
  // Pure numbers string like "829103"
  if (/^\d+$/.test(s)) return true;
  return false;
}

/** Sanitizes an address string by stripping out any UUID, CUID, or raw ID segments. */
export function cleanAddress(rawAddress?: string | null): string | null {
  if (!rawAddress || typeof rawAddress !== 'string') return null;
  const parts = rawAddress
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p && !isIdString(p));

  if (parts.length === 0) return null;
  return parts.join(', ');
}

/** The best single line address for a stop, rejecting raw ID strings and UUID segments. */
export function stopAddress(stop: TripStop | null | undefined, fallback?: string): string | null {
  if (!stop) return fallback ?? null;
  const rawAddr = stop.location_address || stop.location?.address;
  const cleaned = cleanAddress(rawAddr);
  if (cleaned) {
    return cleaned;
  }
  const label = stopLabel(stop, fallback);
  if (label && label !== fallback) {
    return label;
  }
  return fallback ?? null;
}

/** The best short label for a stop — falls back to nested location name or extracted city, never raw IDs. */
export function stopLabel(stop: TripStop | null | undefined, fallback?: string): string | null {
  if (!stop) return fallback ?? null;

  // 1. Nested Location object's name if valid and not an ID
  if (stop.location?.name && !isIdString(stop.location.name)) {
    return stop.location.name.trim();
  }

  // 2. Direct stop location_name if valid and not an ID
  if (stop.location_name && !isIdString(stop.location_name)) {
    return stop.location_name.trim();
  }

  // 3. Extract city / area from location_address or location.address if present (reject country names)
  const rawAddr = stop.location_address || stop.location?.address;
  const cleanedAddr = cleanAddress(rawAddr);
  if (cleanedAddr) {
    const parts = cleanedAddr.split(',').map((p) => p.trim());
    if (parts.length > 0) {
      const cityCandidate = parts[0];
      if (!/^(saudi arabia|ksa|uae|united arab emirates|qatar|kuwait|oman|bahrain)$/i.test(cityCandidate)) {
        return cityCandidate;
      }
    }
  }

  return fallback ?? null;
}

export interface MobileTrip {
  id: string;
  ref_id: string | null;
  status: TripStatus;
  driver_workflow: 'NATIVE' | 'EXTERNAL_APP';
  driver_workflow_state?: string | null;
  planned_distance: number | null;
  planned_start?: string | null;
  actual_start?: string | null;
  planned_end: string | null;
  actual_end?: string | null;
  driver_payout?: number | string | null;
  driver_charge?: number | string | null;
  trip_charges?: number | string | null;
  billing_amount?: number | string | null;
  applied_rate?: number | string | null;
  extra_driver_payment?: number | string | null;
  trip_type?: string | null;
  quotation_line_type?: string | null;
  rate_category?: string | null;
  customer?: { id: string; name: string; logo_url?: string | null } | null;
  vehicle?: { id: string; plate_number: string } | null;
  origin?: string | null;
  destination?: string | null;
  stops: TripStop[];
  /**
   * Server-computed route timeline from the same function the web dashboard
   * renders (backend/api-server/src/services/tripRouteTimeline.ts). When
   * present, parseTripRouteNodes() in routeParser.ts uses this directly
   * instead of re-deriving one locally, so this app can't disagree with the
   * web dashboard about a trip's route again.
   */
  route_timeline?: unknown[] | null;
  documents?: Array<{
    id: string;
    doc_type?: string;
    file_url: string;
    mime_type?: string;
    ai_extracted_json?: any;
    createdAt?: string;
  }> | null;
}

function extractChargeNumber(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const parsed = parseFloat(val);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof val === 'object') {
    if (val.toNumber && typeof val.toNumber === 'function') {
      return val.toNumber();
    }
    const parsed = parseFloat(String(val));
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

/**
 * The amount this trip pays the driver. `trip.driver_payout` is already the
 * server-computed value (calculateBackendTripFinancials in
 * backend/api-server/src/utils/tripFinancials.ts — the same function the web
 * dashboard uses), so this just reads it rather than re-deriving it, the way
 * two separate copies of this function used to.
 */
export function getTripChargeValue(t: MobileTrip | null | undefined): number {
  if (!t) return 0;
  return extractChargeNumber(t.driver_payout ?? t.driver_charge ?? t.trip_charges);
}

/** Check whether a trip's completion date falls in the specified month (defaults to current month). */
export function isTripInMonth(t: MobileTrip | null | undefined, refDate: Date = new Date()): boolean {
  if (!t) return false;
  const dateStr = t.actual_end ?? t.planned_end ?? t.actual_start ?? t.planned_start ?? (t as any).createdAt;
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  return d.getMonth() === refDate.getMonth() && d.getFullYear() === refDate.getFullYear();
}

/** Calculates total driver payout for completed/invoiced trips completed in the specified month. */
export function getMonthlyDriverPayout(trips: (MobileTrip | null | undefined)[], refDate: Date = new Date()): number {
  if (!Array.isArray(trips)) return 0;
  return trips.reduce((sum, t) => {
    if (t && (t.status === 'Completed' || t.status === 'Invoiced') && isTripInMonth(t, refDate)) {
      return sum + getTripChargeValue(t);
    }
    return sum;
  }, 0);
}

/** Check whether a trip is genuinely a Round Trip */
export function isRoundTrip(trip: MobileTrip | null | undefined): boolean {
  if (!trip) return false;

  // Primary check: explicit return leg in structured stops
  if (trip.stops?.some((s) => (s.leg_index ?? 0) === 1)) return true;

  const lineType = (
    trip.quotation_line_type ||
    trip.trip_type ||
    (trip as any).rate_category ||
    ''
  ).toLowerCase().trim();
  if (lineType.includes('round')) return true;

  if (trip.destination?.includes('[RETURN:')) return true;
  if (trip.stops?.some((s) => (s.location_name || '').includes('[RETURN:'))) return true;

  const hasSecondPickup = (trip.stops ?? []).some((s, idx) => idx > 0 && s.stop_type === 'Pickup');
  if (hasSecondPickup) return true;

  // Check if first and last stop locations are identical (circular round trip)
  const stops = trip.stops ?? [];
  if (stops.length >= 3) {
    const first = (stops[0].location_name || stops[0].location?.name || '').toLowerCase().trim();
    const last = (stops[stops.length - 1].location_name || stops[stops.length - 1].location?.name || '').toLowerCase().trim();
    if (first && last && first === last) {
      return true;
    }
  }

  return false;
}

/**
 * Intelligently derives the true driver workflow state from both the explicit
 * driver_workflow_state and the real-world stop progress (actual_arrival and actual_departure).
 * This ensures that completed stops (e.g. Stop 1 arrived or loaded or departed)
 * NEVER regress to ASSIGNED or GOING_TO_PICKUP if the cache or local state was cleared.
 */
export function getEffectiveWorkflowState(trip: MobileTrip | null | undefined): string {
  if (!trip) return 'ASSIGNED';
  const ws = trip.driver_workflow_state;
  const stops = [...(trip.stops || [])].sort((a, b) => a.stop_sequence - b.stop_sequence);
  const isRound = isRoundTrip(trip);

  if (trip.status === 'Completed' || trip.status === 'Invoiced' || ws === 'COMPLETED') {
    return 'COMPLETED';
  }

  if (stops.length > 0) {
    const outboundStops = stops.filter((s) => (s.leg_index ?? 0) === 0);
    const returnStops = stops.filter((s) => (s.leg_index ?? 0) === 1);
    const hasExplicitLegs = returnStops.length > 0;

    const s1 = outboundStops[0] || stops[0];
    const s2 = hasExplicitLegs
      ? (outboundStops.filter((s) => s.stop_type === 'Dropoff').pop() || outboundStops[outboundStops.length - 1])
      : (stops.find((s) => s.stop_sequence === 2) || stops[1] || stops[stops.length - 1]);

    const s3 = isRound
      ? (hasExplicitLegs
          ? (returnStops.find((s) => s.stop_type === 'Pickup') || returnStops[0])
          : stops.find((s) => s.stop_sequence === 3))
      : null;

    const s4 = isRound
      ? (hasExplicitLegs
          ? (returnStops.filter((s) => s.stop_type === 'Dropoff').pop() || returnStops[returnStops.length - 1])
          : (stops.find((s) => s.stop_sequence === 4) || stops[stops.length - 1]))
      : null;

    // 1. Final Delivery (Stop 4 for round trip, Stop 2 for single trip)
    if (isRound && s4) {
      if (s4.actual_departure || ws === 'RETURN_DELIVERY_COMPLETED' || ws === 'COMPLETED') {
        return 'COMPLETED';
      }
      if (s4.actual_arrival || ws === 'ARRIVED_AT_FINAL_DELIVERY' || ws === 'FINAL_DELIVERY_VERIFICATION') {
        return ws && ['ARRIVED_AT_FINAL_DELIVERY', 'FINAL_DELIVERY_VERIFICATION'].includes(ws) ? ws : 'ARRIVED_AT_FINAL_DELIVERY';
      }
    }

    // 2. Return Loading (Stop 3 for round trip)
    if (isRound && s3) {
      if (s3.actual_departure) {
        // Return loading completed and departed -> In transit to return delivery
        return (ws && ['IN_TRANSIT_RETURN', 'ARRIVED_AT_FINAL_DELIVERY', 'FINAL_DELIVERY_VERIFICATION'].includes(ws))
          ? ws
          : 'IN_TRANSIT_RETURN';
      }
      if (s3.actual_arrival || ws === 'RETURN_LOADING' || ws === 'RETURN_LOADING_COMPLETED') {
        return ws && ['RETURN_LOADING', 'RETURN_LOADING_COMPLETED'].includes(ws) ? ws : 'RETURN_LOADING';
      }
    }

    // 3. Outbound Delivery (Stop 2)
    if (s2) {
      if (s2.actual_departure) {
        if (isRound) {
          // First delivery completed and departed -> Ready for return loading
          return (ws && ['RETURN_LOADING', 'RETURN_LOADING_COMPLETED', 'IN_TRANSIT_RETURN', 'ARRIVED_AT_FINAL_DELIVERY'].includes(ws))
            ? ws
            : 'RETURN_LOADING';
        } else {
          return 'COMPLETED';
        }
      }
      if (s2.actual_arrival || ws === 'ARRIVED_AT_DELIVERY' || ws === 'DELIVERY_VERIFICATION' || ws === 'FIRST_DELIVERY_COMPLETED') {
        return ws && ['ARRIVED_AT_DELIVERY', 'DELIVERY_VERIFICATION', 'FIRST_DELIVERY_COMPLETED'].includes(ws) ? ws : 'ARRIVED_AT_DELIVERY';
      }
    }

    // 4. Initial Pickup (Stop 1)
    if (s1) {
      if (s1.actual_departure) {
        // Pickup departed -> In transit to delivery
        return (ws && ['IN_TRANSIT', 'GOING_TO_STOP', 'ARRIVED_AT_STOP', 'STOP_VERIFICATION', 'ARRIVED_AT_DELIVERY', 'DELIVERY_VERIFICATION'].includes(ws))
          ? ws
          : 'IN_TRANSIT';
      }
      if (s1.actual_arrival || ws === 'ARRIVED_AT_PICKUP' || ws === 'LOADING' || ws === 'LOADING_COMPLETED') {
        return ws && ['ARRIVED_AT_PICKUP', 'LOADING', 'LOADING_COMPLETED'].includes(ws) ? ws : 'ARRIVED_AT_PICKUP';
      }
    }
  }

  return ws || 'ASSIGNED';
}

export interface ExternalAppAction {
  label: string;
  targetStatus: TripStatus;
  targetWorkflowState: string;
  /** Tag written to the evidence photo's Document — matches the vocabulary
   * `TripPhotoEvidence.tsx` on the web dashboard already categorizes by. */
  operation: string;
  legIndex: 0 | 1;
}

/**
 * The single next action for an EXTERNAL_APP-workflow trip, keyed purely off
 * the trip's current state — mirrors the exact (status, workflow_state)
 * pairs the NATIVE screens (PickupVerificationScreen, DeliveryVerificationScreen,
 * LiveNavigationScreen) already use for every stage, including round trips.
 * Returns null once the trip is complete.
 */
export function getNextExternalAppAction(trip: MobileTrip | null | undefined): ExternalAppAction | null {
  if (!trip) return null;
  const ws = getEffectiveWorkflowState(trip);
  // `isRoundTrip()` also fires on weak signals (quotation line-type text,
  // destination markers) that don't guarantee a real return-leg stop exists.
  // `getEffectiveWorkflowState` itself only takes the round-trip path when
  // there's an actual 3rd/4th stop (or an explicit leg_index:1 stop) to
  // visit — match that same real-data gate here, or a "round trip" with no
  // real return stop sends the driver through phantom return-leg stages
  // that never resolve to Completed.
  const stops = trip.stops ?? [];
  const isRound = stops.some((s) => (s.leg_index ?? 0) === 1) || stops.length >= 3;

  switch (ws) {
    case 'ASSIGNED':
    case 'GOING_TO_PICKUP':
      return { label: 'Arrived at Pickup', targetStatus: 'Loading', targetWorkflowState: 'ARRIVED_AT_PICKUP', operation: 'pickup_arrival', legIndex: 0 };
    case 'ARRIVED_AT_PICKUP':
    case 'LOADING':
      return { label: 'Loading Completed', targetStatus: 'Loading', targetWorkflowState: 'LOADING_COMPLETED', operation: 'pickup', legIndex: 0 };
    case 'LOADING_COMPLETED':
      return { label: 'Departed (In Transit)', targetStatus: 'InTransit', targetWorkflowState: 'IN_TRANSIT', operation: 'pickup', legIndex: 0 };
    case 'IN_TRANSIT':
    case 'GOING_TO_STOP':
    case 'ARRIVED_AT_STOP':
    case 'STOP_VERIFICATION':
      return { label: 'Arrived at Delivery', targetStatus: 'InTransit', targetWorkflowState: 'ARRIVED_AT_DELIVERY', operation: 'delivery_arrival', legIndex: 0 };
    case 'ARRIVED_AT_DELIVERY':
    case 'DELIVERY_VERIFICATION':
    case 'FIRST_DELIVERY_COMPLETED':
      return isRound
        ? { label: 'Delivery Completed', targetStatus: 'Loading', targetWorkflowState: 'RETURN_LOADING', operation: 'delivery', legIndex: 0 }
        : { label: 'Delivery Completed', targetStatus: 'Completed', targetWorkflowState: 'COMPLETED', operation: 'delivery', legIndex: 0 };
    case 'RETURN_LOADING':
      return { label: 'Loading Completed', targetStatus: 'Loading', targetWorkflowState: 'RETURN_LOADING_COMPLETED', operation: 'return_loading_arrival', legIndex: 1 };
    case 'RETURN_LOADING_COMPLETED':
      return { label: 'Departed (In Transit)', targetStatus: 'InTransit', targetWorkflowState: 'IN_TRANSIT_RETURN', operation: 'return_loading', legIndex: 1 };
    case 'IN_TRANSIT_RETURN':
      return { label: 'Arrived at Final Delivery', targetStatus: 'InTransit', targetWorkflowState: 'ARRIVED_AT_FINAL_DELIVERY', operation: 'return_delivery_arrival', legIndex: 1 };
    case 'ARRIVED_AT_FINAL_DELIVERY':
    case 'FINAL_DELIVERY_VERIFICATION':
      return { label: 'Delivery Completed', targetStatus: 'Completed', targetWorkflowState: 'COMPLETED', operation: 'return_delivery', legIndex: 1 };
    case 'COMPLETED':
    default:
      return null;
  }
}

export interface AuthoritativeActiveStop {
  activeStop: TripStop | null;
  activeStopId: string | null;
  activeStopSequence: number | null;
  currentLegIndex: number;
  nextStop: TripStop | null;
  nextStopId: string | null;
  isOutboundCompleted: boolean;
  isReturnAllowedToStart: boolean;
  isTripCompleted: boolean;
  effectiveWorkflowState: string;
}

/**
 * Single authoritative active stop resolver across MERCON.
 * Resolves current active stop, next stop, active leg, and return readiness
 * dynamically from stop records without hardcoding stop sequences or array positions.
 */
export function resolveAuthoritativeActiveStop(
  trip?: { stops?: TripStop[]; status?: string; driver_workflow_state?: string | null } | null
): AuthoritativeActiveStop {
  const stops = trip?.stops || [];
  const statusUpper = (trip?.status || '').toUpperCase();
  const ws = trip?.driver_workflow_state || null;
  const sortedStops = [...stops].sort((a, b) => a.stop_sequence - b.stop_sequence);

  if (statusUpper === 'COMPLETED' || statusUpper === 'INVOICED' || ws === 'COMPLETED') {
    return {
      activeStop: null,
      activeStopId: null,
      activeStopSequence: null,
      currentLegIndex: sortedStops.some((s) => (s.leg_index ?? 0) === 1) ? 1 : 0,
      nextStop: null,
      nextStopId: null,
      isOutboundCompleted: true,
      isReturnAllowedToStart: true,
      isTripCompleted: true,
      effectiveWorkflowState: 'COMPLETED',
    };
  }

  if (sortedStops.length === 0) {
    return {
      activeStop: null,
      activeStopId: null,
      activeStopSequence: null,
      currentLegIndex: 0,
      nextStop: null,
      nextStopId: null,
      isOutboundCompleted: false,
      isReturnAllowedToStart: false,
      isTripCompleted: false,
      effectiveWorkflowState: ws || (['IN_TRANSIT', 'DISPATCHED', 'ACTIVE'].includes(statusUpper) ? 'AT_PICKUP' : 'SCHEDULED'),
    };
  }

  const outboundStops = sortedStops.filter((s) => (s.leg_index ?? 0) === 0);
  const returnStops = sortedStops.filter((s) => (s.leg_index ?? 0) === 1);
  const isRound = returnStops.length > 0 || (trip ? isRoundTrip(trip as any) : false);

  const outboundDelivery = outboundStops.filter((s) => s.stop_type === 'Dropoff').pop() ||
    (outboundStops.length > 0 ? outboundStops[outboundStops.length - 1] : null);

  const isOutboundCompleted = Boolean(
    outboundDelivery && (outboundDelivery.actual_departure != null || outboundDelivery.actual_arrival != null)
  );

  const isReturnAllowedToStart = isRound ? isOutboundCompleted : false;

  // Find active stop: first stop that has not departed yet
  let activeIdx = sortedStops.findIndex((s) => !s.actual_departure);

  if (activeIdx === -1) {
    return {
      activeStop: null,
      activeStopId: null,
      activeStopSequence: null,
      currentLegIndex: returnStops.length > 0 ? 1 : 0,
      nextStop: null,
      nextStopId: null,
      isOutboundCompleted: true,
      isReturnAllowedToStart: true,
      isTripCompleted: true,
      effectiveWorkflowState: 'COMPLETED',
    };
  }

  let activeStop = sortedStops[activeIdx];
  const activeLeg = activeStop.leg_index ?? 0;

  // STRICT RETURN START GUARD:
  // If active stop is on return leg (leg 1), but outbound delivery has NOT arrived,
  // return leg CANNOT be active. The active stop must remain the outbound delivery stop.
  if (activeLeg === 1 && !isOutboundCompleted && outboundDelivery) {
    activeStop = outboundDelivery;
    activeIdx = sortedStops.findIndex((s) => s.id === outboundDelivery.id);
  }

  const nextStop = activeIdx + 1 < sortedStops.length ? sortedStops[activeIdx + 1] : null;

  return {
    activeStop,
    activeStopId: activeStop?.id || null,
    activeStopSequence: activeStop?.stop_sequence || null,
    currentLegIndex: activeStop?.leg_index ?? 0,
    nextStop,
    nextStopId: nextStop?.id || null,
    isOutboundCompleted,
    isReturnAllowedToStart,
    isTripCompleted: false,
    effectiveWorkflowState: getEffectiveWorkflowState(trip as any),
  };
}

/** A road route to the trip's next stop, as MERCON returns it. */
export interface TripRoute {
  /** [lng, lat] pairs, GeoJSON order. */
  geometry: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
  /** Which routing provider answered. Diagnostic only. */
  provider: string;
}

export const tripService = {
  async getCurrent(): Promise<MobileTrip | null> {
    const { data } = await api.get('/mobile/trips/current');
    const trip = data.data as MobileTrip | null;
    if (trip) {
      const localState = await workflowStateStore.getState(trip.id);
      if (localState && !trip.driver_workflow_state) {
        trip.driver_workflow_state = localState;
      } else if (trip.driver_workflow_state) {
        await workflowStateStore.saveState(trip.id, trip.driver_workflow_state);
      }
    }
    return trip;
  },

  /** Past trips (completed / invoiced / cancelled), newest first. */
  async getHistory(limit = 30): Promise<MobileTrip[]> {
    const { data } = await api.get('/mobile/trips/history', { params: { limit } });
    return (data.data ?? []) as MobileTrip[];
  },

  /** Scheduled / assigned trips for the driver. */
  async getScheduled(limit = 30): Promise<MobileTrip[]> {
    try {
      const { data } = await api.get('/mobile/trips/scheduled', { params: { limit } });
      return (data.data ?? []) as MobileTrip[];
    } catch {
      return [];
    }
  },

  /**
   * The road route from where the driver is now to the trip's next stop.
   *
   * Only the origin is sent — the server decides which stop is next and which
   * routing provider to ask, so neither is baked into this app.
   */
  async getRoute(id: string, fromLat: number, fromLng: number): Promise<TripRoute> {
    const { data } = await api.get(`/mobile/trips/${id}/route`, {
      params: { from_lat: fromLat, from_lng: fromLng },
    });
    return data.data as TripRoute;
  },

  async sendLocationUpdate(
    tripId: string,
    coords: {
      latitude: number;
      longitude: number;
      speed_kph?: number | null;
      heading_deg?: number | null;
      accuracy_m?: number | null;
      recorded_at?: string;
    }
  ): Promise<void> {
    try {
      await api.post(`/mobile/trips/${tripId}/location`, coords);
    } catch {
      // Background location update failures are non-fatal to mobile navigation
    }
  },

  /** Details for a specific trip by ID with remote API + list fallback. */
  async getTripDetails(id: string): Promise<MobileTrip | null> {
    try {
      const { data } = await api.get(`/mobile/trips/${id}`);
      if (data?.data) return data.data as MobileTrip;
    } catch {
      // Endpoint not on dev server yet, fallback to list lookup
    }

    try {
      const { data } = await api.get(`/trips/${id}`);
      if (data?.data) return data.data as MobileTrip;
    } catch {
      // Fallback to searching driver trip lists
    }

    // Unstoppable fallback: search history, scheduled, and current trip
    try {
      const [history, scheduled, current] = await Promise.all([
        tripService.getHistory().catch(() => []),
        tripService.getScheduled().catch(() => []),
        tripService.getCurrent().catch(() => null),
      ]);

      const allTrips: MobileTrip[] = [...history, ...scheduled];
      if (current) allTrips.push(current);

      const found = allTrips.find(
        (t) =>
          t.id === id ||
          t.ref_id === id ||
          t.id.slice(0, 8) === id ||
          `TRP-${t.ref_id}` === id ||
          `TRP-${t.id.slice(0, 8)}` === id
      );

      return found ?? null;
    } catch {
      return null;
    }
  },

  async updateStatus(id: string, status: TripStatus, driver_workflow_state?: string, reason?: string): Promise<MobileTrip> {
    if (driver_workflow_state) {
      if (driver_workflow_state === 'COMPLETED') {
        await workflowStateStore.clearState(id);
      } else {
        await workflowStateStore.saveState(id, driver_workflow_state);
      }
    }
    const { data } = await api.post(`/mobile/trips/${id}/status`, { status, driver_workflow_state, reason, notes: reason });
    const trip = data.data as MobileTrip;
    if (driver_workflow_state && !trip.driver_workflow_state) {
      trip.driver_workflow_state = driver_workflow_state;
    }
    return trip;
  },

  async updateTripStatus(
    id: string,
    payload: { status: TripStatus; driver_workflow_state?: string; reason?: string } | TripStatus,
    driver_workflow_state?: string,
    reason?: string
  ): Promise<MobileTrip> {
    if (typeof payload === 'object' && payload !== null) {
      return tripService.updateStatus(id, payload.status, payload.driver_workflow_state, payload.reason);
    }
    return tripService.updateStatus(id, payload, driver_workflow_state, reason);
  },

  /** Upload a cargo (pickup) or POD (delivery) photo and attach it to the trip. */
  async uploadPhoto(
    id: string,
    kind: 'cargo' | 'pod',
    asset: { uri: string; mimeType?: string | null; fileName?: string | null; location?: { latitude: number; longitude: number; timestamp: string } | null },
    legIndex?: number,
    operation?: string,
    stopId?: string,
  ): Promise<void> {
    const form = new FormData();
    form.append('kind', kind);
    if (operation) {
      form.append('operation', operation);
    }
    if (legIndex !== undefined) {
      form.append('leg_index', String(legIndex));
    }
    if (stopId) {
      form.append('stop_id', stopId);
    }
    if (asset.location) {
      form.append('location_lat', String(asset.location.latitude));
      form.append('location_lng', String(asset.location.longitude));
      form.append('captured_at', String(asset.location.timestamp));
    }
    const isVideo = operation === 'delay' || (asset.mimeType && asset.mimeType.startsWith('video/')) || (asset.fileName && /\.(mp4|mov|webm|3gp)$/i.test(asset.fileName));
    const fileName = asset.fileName || (isVideo ? 'delay-video.mp4' : `${kind}.jpg`);
    const mimeType = asset.mimeType || (isVideo ? 'video/mp4' : 'image/jpeg');

    form.append('file', {
      uri: asset.uri,
      name: fileName,
      type: mimeType,
    } as unknown as Blob);
    // Don't set Content-Type manually — axios/RN needs to generate it
    // itself so it includes the multipart boundary. A hardcoded header
    // here strips the boundary and the backend fails to parse the body.
    // Use extended 180s timeout for video/media uploads to prevent ECONNABORTED
    await api.post(`/mobile/trips/${id}/photo`, form, {
      timeout: 180000,
    });
  },
};

/** Which transitions require a photo first (business rules BR-006 / BR-009). */
export const PHOTO_FOR: Partial<Record<TripStatus, 'cargo' | 'pod'>> = {
  InTransit: 'cargo', // cargo photo required before moving to In Transit
  Completed: 'pod',   // POD photo required before completing
};

/** The next step a driver can take from the current status (null = nothing to do). */
export const NEXT_STEP: Partial<Record<TripStatus, { to: TripStatus; label: string }>> = {
  Scheduled:  { to: 'Loading',   label: 'Arrived at Pickup / Start Loading' },
  Loading:    { to: 'InTransit', label: 'Start Trip (Picked Up)' },
  InTransit:  { to: 'Completed', label: 'Complete Delivery' },
  Delayed:    { to: 'InTransit', label: 'Resume Trip' },
  AtPickup:   { to: 'InTransit',  label: 'Start Trip (Picked Up)' },
  AtDelivery: { to: 'Completed',  label: 'Complete Delivery' },
};

/** Human-friendly label for a status. */
export function statusLabel(s: TripStatus): string {
  switch (s) {
    case 'Draft':
    case 'Dispatched':
    case 'Scheduled': return 'Scheduled';
    case 'AtPickup':
    case 'Loading': return 'Loading';
    case 'InTransit': return 'In Transit';
    case 'Delayed': return 'Delayed';
    case 'Emergency': return 'Emergency';
    case 'AtDelivery':
    case 'Completed': return 'Completed';
    default: return s;
  }
}

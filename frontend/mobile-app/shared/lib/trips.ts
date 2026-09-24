import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { api } from './api';
import {
  isRoundTrip,
  getLegIntermediateDbStops,
  getEffectiveWorkflowState,
  resolveAuthoritativeActiveStop,
  parseStopWorkflowState,
  stopLabel as sharedStopLabel,
  stopAddress as sharedStopAddress,
  DRIVER_WORKFLOW_STATES,
  getLegEndpoints,
  getLegStops,
  type AuthoritativeActiveStop,
} from '@mercon/shared-types';

export {
  isRoundTrip,
  getLegIntermediateDbStops,
  getEffectiveWorkflowState,
  resolveAuthoritativeActiveStop,
  parseStopWorkflowState,
  DRIVER_WORKFLOW_STATES,
  getLegEndpoints,
  getLegStops,
  type AuthoritativeActiveStop,
};

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
  const rawAddr = sharedStopAddress(stop as any);
  if (rawAddr) {
    const cleaned = cleanAddress(rawAddr);
    if (cleaned) {
      return cleaned;
    }
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

  const shared = sharedStopLabel(stop as any);
  if (shared && shared !== 'Stop' && !isIdString(shared)) {
    return shared.trim();
  }

  // Extract city / area from location_address or location.address if present (reject country names)
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
  const isRound = isRoundTrip(trip);

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

  async updateStatus(
    id: string,
    status: TripStatus,
    driver_workflow_state?: string,
    reason?: string,
    /** TripStop id of an intermediate stop the driver just finished — stamps its arrival/departure. */
    completedStopId?: string,
  ): Promise<MobileTrip> {
    if (driver_workflow_state) {
      if (driver_workflow_state === 'COMPLETED') {
        await workflowStateStore.clearState(id);
      } else {
        await workflowStateStore.saveState(id, driver_workflow_state);
      }
    }
    const { data } = await api.post(`/mobile/trips/${id}/status`, {
      status, driver_workflow_state, reason, notes: reason, completed_stop_id: completedStopId,
    });
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

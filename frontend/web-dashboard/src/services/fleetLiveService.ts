import { api, ApiResponse } from '@/lib/api';

/** Mirrors `LiveUnit` in backend/api-server/src/services/fleetLiveMap.ts. */
export type LiveFeed = 'both' | 'vehicle' | 'driver' | 'none';
export type LiveMotion = 'moving' | 'idle' | 'stale' | 'no_signal';
export type LiveTripPhase = 'upcoming' | 'active' | 'delayed';

export interface LiveGpsFix {
  lat: number;
  lng: number;
  speed_kph: number | null;
  heading_deg: number | null;
  accuracy_m: number | null;
  recorded_at: string;
  fresh: boolean;
}

export interface LiveStop {
  id: string;
  sequence: number;
  type: string;
  name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  planned_arrival: string | null;
  actual_arrival: string | null;
  actual_departure: string | null;
}

export interface LiveUnit {
  key: string;
  vehicle: {
    id: string;
    ref_id: string | null;
    plate_number: string;
    asset_type: string;
    status: string;
    image_url: string | null;
    has_tracker: boolean;
  } | null;
  driver: {
    id: string;
    ref_id: string | null;
    name: string;
    phone: string | null;
    avatar_url: string | null;
    /** Available / OnTrip / OffDuty / Inactive — dispatch only accepts Available. */
    status?: string | null;
  } | null;
  trip: {
    id: string;
    ref_id: string | null;
    status: string;
    phase: LiveTripPhase;
    customer_name: string | null;
    planned_start: string | null;
    planned_end: string | null;
    stops: LiveStop[];
    next_stop_index: number | null;
  } | null;
  vehicle_gps: LiveGpsFix | null;
  driver_gps: LiveGpsFix | null;
  position: (LiveGpsFix & { source: 'vehicle' | 'driver' }) | null;
  feed: LiveFeed;
  motion: LiveMotion;
  feeds_gap_m: number | null;
}

export type LiveMediaKind = 'pod' | 'photo' | 'video';
/** The step the driver took it at — from the app's upload tag. */
export type LiveMediaStage = 'loaded' | 'arrived' | 'stop' | 'delivered' | 'delay' | 'other';

export interface LiveMediaItem {
  id: string;
  kind: LiveMediaKind;
  stage: LiveMediaStage;
  url: string;
  mime: string | null;
  captured_at: string;
}

export interface LiveStopMedia {
  stop_id: string;
  sequence: number;
  delay: { reason: string | null; note: string | null; logged_at: string | null } | null;
  media: LiveMediaItem[];
}

export interface LiveTripMedia {
  stops: LiveStopMedia[];
  unplaced: LiveMediaItem[];
}

export type TripPhase = 'planned' | 'active' | 'done' | 'cancelled';

/** Mirrors `TripOverview` in backend/api-server/src/services/tripOverview.ts. */
/** Where a trip's truck stood still 5 min+ — at one of its stops, or a break on the way (API tracking/tripHalts.ts). */
export interface TripHalt {
  lat: number;
  lng: number;
  from: string;
  to: string;
  minutes: number;
  kind: 'at_stop' | 'break';
  stop_id: string | null;
  ongoing: boolean;
}

/** The trip so far, split into driving, at stops and breaks (minutes). */
export interface TripTimeSplit {
  total_min: number;
  driving_min: number;
  at_stops_min: number;
  breaks_min: number;
  breaks: number;
}

export interface TripOverview {
  trip_id: string;
  status: string;
  phase: TripPhase;
  stops: LiveStop[];
  next_stop_index: number | null;
  unit: LiveUnit | null;
  /** [lng, lat] points driven, oldest first. */
  path: [number, number][];
  path_distance_m: number | null;
  /** Absent from an older API. */
  halts?: TripHalt[];
  time_split?: TripTimeSplit | null;
  checks: {
    driver_assigned: boolean;
    truck_assigned: boolean;
    third_party: boolean;
    expiring: { entity: 'Truck' | 'Driver'; name: string; label: string; expiry_date: string; expired: boolean }[];
  } | null;
}

export interface LiveRoute {
  /** [lng, lat] pairs. */
  geometry: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
  provider: string;
}

/** The road still ahead of a trip's truck to its next stop — one route kept by the server for every screen. */
export interface RouteAhead extends LiveRoute {
  /** Arrival = computedAt + durationSeconds: the same on every screen. */
  computedAt: string;
  stopId: string;
  /** False while a stray GPS fix is off the route (not re-routed yet). */
  onRoute: boolean;
  routedAt: string;
}

export const fleetLiveService = {
  async getLiveMap(): Promise<{ units: LiveUnit[]; generated_at: string }> {
    const res = await api.get<ApiResponse<{ units: LiveUnit[]; generated_at: string }>>('/vehicles/live-map');
    return res.data.data;
  },

  /** Null when the routing provider is unavailable — callers fall back to a straight line. */
  async getRoute(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<LiveRoute | null> {
    try {
      const res = await api.get<ApiResponse<LiveRoute>>('/vehicles/live-map/route', {
        params: { from: `${from.lat},${from.lng}`, to: `${to.lat},${to.lng}` },
      });
      return res.data.data;
    } catch {
      return null;
    }
  },

  /**
   * The road from the trip's truck to its next stop: the server keeps one route
   * per trip (started in the truck's heading, re-routed only when it leaves it)
   * and sends only what's still ahead. Null when there's nothing to route or
   * routing is down — callers fall back to a straight line.
   */
  async getRouteAhead(tripId: string): Promise<RouteAhead | null> {
    try {
      const res = await api.get<ApiResponse<RouteAhead | null>>(`/vehicles/live-map/trips/${tripId}/route-ahead`);
      return res.data.data ?? null;
    } catch {
      return null;
    }
  },

  /** Road route through several points in order; null when routing is unavailable. */
  async getRouteThrough(points: { lat: number; lng: number }[]): Promise<LiveRoute | null> {
    try {
      const res = await api.get<ApiResponse<LiveRoute>>('/vehicles/live-map/route', {
        params: { points: points.map((p) => `${p.lat},${p.lng}`).join(';') },
      });
      return res.data.data;
    } catch {
      return null;
    }
  },

  async getTripOverview(tripId: string): Promise<TripOverview> {
    const res = await api.get<ApiResponse<TripOverview>>(`/vehicles/live-map/trips/${tripId}/overview`);
    return res.data.data;
  },

  /** POD photos, cargo photos and delay videos for a trip, grouped by stop. */
  async getTripMedia(tripId: string): Promise<LiveTripMedia> {
    const res = await api.get<ApiResponse<LiveTripMedia>>(`/vehicles/live-map/trips/${tripId}/media`);
    return res.data.data;
  },
};

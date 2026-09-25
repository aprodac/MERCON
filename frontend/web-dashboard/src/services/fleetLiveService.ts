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

export interface LiveRoute {
  /** [lng, lat] pairs. */
  geometry: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
  provider: string;
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
};

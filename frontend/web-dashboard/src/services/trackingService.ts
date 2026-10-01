import { api, ApiResponse } from '@/lib/api';

/** Mirrors backend/api-server/src/services/tracking/customerTracking.ts. */
export type TrackingPhase = 'planned' | 'active' | 'done' | 'cancelled';

export interface PublicTrackingStop {
  name: string;
  type: string;
  state: 'done' | 'next' | 'upcoming';
  lat: number | null;
  lng: number | null;
  actual_arrival: string | null;
  actual_departure: string | null;
}

export interface PublicTracking {
  brand: { name: string; logo_url: string | null; primary_color: string | null };
  timezone: string;
  trip: { ref: string | null; phase: TrackingPhase; started_at: string | null; finished_at: string | null; planned_start: string | null };
  vehicle: { plate: string | null; type: string | null };
  driver_first_name: string | null;
  position: {
    lat: number; lng: number; heading_deg: number | null; speed_kph: number | null;
    recorded_at: string; fresh: boolean; moving: boolean;
  } | null;
  eta: { stop_index: number; arrival: string; seconds: number; distance_m: number } | null;
  eta_gap: 'no_position' | 'stale' | 'no_route' | null;
  progress: { done_m: number; total_m: number; pct: number } | null;
  stops: PublicTrackingStop[];
  next_stop_index: number | null;
  path: [number, number][];
  ahead: [number, number][] | null;
  route: [number, number][] | null;
  generated_at: string;
}

export interface TrackingLink {
  url: string;
  token: string;
  expires_at: string;
  created: boolean;
}

export const trackingService = {
  /** The customer-facing page's data. No login. */
  async getPublic(token: string): Promise<PublicTracking> {
    const res = await api.get<ApiResponse<PublicTracking>>(`/public/track/${encodeURIComponent(token)}`);
    return res.data.data;
  },

  /** The trip's tracking link, created on first ask. `renew` replaces it (the old link stops working). */
  async getTripLink(tripId: string, renew = false): Promise<TrackingLink> {
    const res = await api.post<ApiResponse<TrackingLink>>(`/trips/${tripId}/tracking-link`, { renew });
    return res.data.data;
  },
};

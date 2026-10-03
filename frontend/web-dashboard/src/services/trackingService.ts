import { api, ApiResponse } from '@/lib/api';

/** Mirrors backend/api-server/src/services/tracking/customerTracking.ts. */
export type TrackingPhase = 'planned' | 'active' | 'done' | 'cancelled';

export interface TrackingBrand {
  name: string;
  logo_url: string | null;
  primary_color: string | null;
  /** Ops WhatsApp number (digits) for the "Ask us" button — the fallback. */
  support_whatsapp: string | null;
  /** The customer's WhatsApp group (invite link): "Ask" opens it when set. */
  ask_group_url?: string | null;
}

export interface TrackingOptions {
  show_deadline: boolean;
  show_delay_reason: boolean;
  show_photos: boolean;
}

export interface PublicTrackingPhoto {
  url: string;
  kind: 'pod' | 'photo' | 'video';
  /** Sent by the driver to explain a delay (often a video). */
  delay: boolean;
  captured_at: string;
}

export interface PublicTrackingStop {
  name: string;
  type: string;
  state: 'done' | 'next' | 'upcoming';
  lat: number | null;
  lng: number | null;
  actual_arrival: string | null;
  actual_departure: string | null;
  due_at: string | null;
  late_min: number | null;
  photos: PublicTrackingPhoto[];
}

export interface TrackingPosition {
  lat: number; lng: number; heading_deg: number | null; speed_kph: number | null;
  recorded_at: string; fresh: boolean; moving: boolean;
}

export interface PublicTracking {
  brand: TrackingBrand;
  timezone: string;
  options: TrackingOptions;
  trip: { ref: string | null; phase: TrackingPhase; route_label: string | null; started_at: string | null; finished_at: string | null; planned_start: string | null };
  customer: { name: string; logo_url: string | null } | null;
  vehicle: { plate: string | null; type: string | null; photo_url: string | null };
  driver_first_name: string | null;
  driver_photo_url: string | null;
  position: TrackingPosition | null;
  eta: { stop_index: number; arrival: string; seconds: number; distance_m: number } | null;
  eta_gap: 'no_position' | 'stale' | 'no_route' | null;
  punctuality: { late_min: number } | null;
  delay: { reason: string } | null;
  progress: { done_m: number; total_m: number; pct: number } | null;
  stops: PublicTrackingStop[];
  next_stop_index: number | null;
  path: [number, number][];
  ahead: [number, number][] | null;
  route: [number, number][] | null;
  generated_at: string;
}

/** Mirrors backend/api-server/src/services/tracking/customerFleetTracking.ts. */
export interface FleetTruck {
  token: string;
  ref: string | null;
  phase: TrackingPhase;
  route_label: string | null;
  plate: string | null;
  type: string | null;
  vehicle_photo_url: string | null;
  driver_first_name: string | null;
  driver_photo_url: string | null;
  position: TrackingPosition | null;
  next_stop_name: string | null;
  last_stop_name: string | null;
  eta: { arrival: string; seconds: number } | null;
  eta_gap: PublicTracking['eta_gap'];
  punctuality: PublicTracking['punctuality'];
  delay: PublicTracking['delay'];
  progress_pct: number | null;
  stops_done: number;
  stops_total: number;
  planned_start: string | null;
  finished_at: string | null;
}

export interface CustomerFleetTracking {
  brand: TrackingBrand;
  timezone: string;
  options: TrackingOptions;
  customer: { name: string; logo_url: string | null };
  trucks: FleetTruck[];
  delivered: DeliveredTrip[];
  generated_at: string;
}

export interface DeliveredTrip {
  token: string;
  ref: string | null;
  plate: string | null;
  type: string | null;
  route_label: string | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface TrackingLink {
  /** False when the customer has tracking switched off — then url is null. */
  enabled: boolean;
  /** Whether status / ETA messages should end with the link (customer setting). */
  auto_link: boolean;
  url: string | null;
  token: string | null;
  expires_at: string | null;
  created: boolean;
  open_count: number;
  first_opened_at: string | null;
  last_opened_at: string | null;
}

/** One time a customer opened a tracking link (GET /customers/:id/tracking-opens). */
export interface TrackingOpen {
  id: string;
  opened_at: string;
  /** e.g. "iPhone · Safari"; null when the browser didn't say. */
  device: string | null;
  link: { kind: 'all_trucks' } | { kind: 'trip'; trip_id: string | null; ref_id: string | null };
}

export interface CustomerTrackingOpens {
  /** Opens in the history (the list holds the newest ones). */
  total: number;
  /** Opens counted before the history was kept — known only as a number. */
  earlier_opens: number;
  opens: TrackingOpen[];
}

export interface CustomerTrackingLink {
  enabled: boolean;
  url: string | null;
  token: string | null;
  created: boolean;
  open_count: number;
  last_opened_at: string | null;
}

export const trackingService = {
  /** The customer-facing trip page's data. No login. `view` counts a page load (not a refresh). */
  async getPublic(token: string, view = false): Promise<PublicTracking> {
    const res = await api.get<ApiResponse<PublicTracking>>(`/public/track/${encodeURIComponent(token)}`, { params: view ? { view: 1 } : undefined });
    return res.data.data;
  },

  /** The customer-wide page: every truck of theirs on the road. No login. */
  async getPublicFleet(token: string, view = false): Promise<CustomerFleetTracking> {
    const res = await api.get<ApiResponse<CustomerFleetTracking>>(`/public/fleet/${encodeURIComponent(token)}`, { params: view ? { view: 1 } : undefined });
    return res.data.data;
  },

  /** The trip's tracking link, created on first ask. `renew` replaces it (the old link stops working). */
  async getTripLink(tripId: string, renew = false): Promise<TrackingLink> {
    const res = await api.post<ApiResponse<TrackingLink>>(`/trips/${tripId}/tracking-link`, { renew });
    return res.data.data;
  },

  /** Links for several trips at once, keyed by trip id. */
  async getTripLinks(tripIds: string[]): Promise<Record<string, TrackingLink>> {
    if (tripIds.length === 0) return {};
    const res = await api.post<ApiResponse<Record<string, TrackingLink>>>('/trips/tracking-links', { trip_ids: tripIds.slice(0, 100) });
    return res.data.data;
  },

  /** Every open of this customer's tracking links, newest first. */
  async getCustomerOpens(customerId: string, limit = 200): Promise<CustomerTrackingOpens> {
    const res = await api.get<ApiResponse<CustomerTrackingOpens>>(`/customers/${customerId}/tracking-opens`, { params: { limit } });
    return res.data.data;
  },

  /** The customer-wide page link, created on first ask; `renew` replaces it. */
  async getCustomerLink(customerId: string, renew = false): Promise<CustomerTrackingLink> {
    const res = await api.post<ApiResponse<CustomerTrackingLink>>(`/customers/${customerId}/tracking-link`, { renew });
    return res.data.data;
  },
};

/**
 * The trip's photo/video gallery, opened by its tracking token — never by trip
 * number (those could be changed to see other customers' trips). Null when the
 * customer has tracking switched off.
 */
export function galleryUrl(link: TrackingLink | null | undefined): string | null {
  return link?.enabled && link.token ? `${window.location.origin}/trips/evidence-gallery?t=${encodeURIComponent(link.token)}` : null;
}

/** The link a status message should end with: only when the customer wants links added automatically. */
export function autoTrackingUrl(link: TrackingLink | null | undefined): string | null {
  return link?.enabled && link.auto_link ? link.url : null;
}

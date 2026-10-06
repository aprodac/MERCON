/**
 * Customer links API — the tracking links customers get on WhatsApp: one per
 * trip (/t/) and one per customer showing all their trucks (/c/).
 * Admins and Operators (backend: routes/trackingLinkRoutes.ts):
 *   GET    /tracking-links?status=&kind=&q=&customer_id=&trip_id=&before=
 *   GET    /tracking-links/:kind/:id
 *   PATCH  /tracking-links/:kind/:id            label, expiry, what the page shows
 *   POST   /tracking-links/:kind/:id/revoke     stops working now
 *   POST   /tracking-links/:kind/:id/replace    new link, same settings
 */
import { api } from '@mercon/mobile-shared/lib/api';

export type LinkKind = 'trip' | 'customer';
export type LinkStatus = 'live' | 'expired' | 'revoked' | 'cancelled' | 'disabled';
export type LinkListStatus = 'live' | 'ended' | 'all';

export interface LinkPerson { id: string; name: string }

export interface LinkRow {
  kind: LinkKind;
  id: string;
  url: string;
  status: LinkStatus;
  label: string | null;
  customer: { id: string; name: string } | null;
  trip: { id: string; ref_id: string | null; status: string; route_label: string | null } | null;
  created_at: string;
  created_by: LinkPerson | null;
  /** When it stops working (the trip's finish rule included). Null: never. */
  expires_at: string | null;
  expiry_custom: boolean;
  expiring_soon: boolean;
  revoked_at: string | null;
  revoked_by: LinkPerson | null;
  open_count: number;
  first_opened_at: string | null;
  last_opened_at: string | null;
}

/** The link's own settings: null on the first three = follow the customer's setting. */
export interface LinkView {
  show_deadline: boolean | null;
  show_delay_reason: boolean | null;
  show_photos: boolean | null;
  show_driver: boolean;
  show_plate: boolean;
  show_position: boolean;
}

export interface LinkOpen { id: string; opened_at: string; device: string | null; city: string | null; country: string | null }

export interface LinkDetail extends LinkRow {
  view: LinkView;
  effective: Record<keyof LinkView, boolean>;
  customer_defaults: { show_deadline: boolean; show_delay_reason: boolean; show_photos: boolean } | null;
  opens: LinkOpen[];
  summary: { logged: number; earlier_opens: number; devices: number; places: { label: string; count: number }[] };
  history: LinkRow[];
}

export interface LinkList {
  links: LinkRow[];
  has_more: boolean;
  counts: { live_trip: number; live_customer: number };
}

export interface LinkListQuery {
  status?: LinkListStatus;
  kind?: LinkKind | 'all';
  q?: string;
  customer_id?: string;
  trip_id?: string;
  before?: string;
}

export interface LinkChanges {
  label?: string | null;
  /** ISO time; null = back to the default (trip: follows the trip; customer page: never). */
  expires_at?: string | null;
  view?: Partial<LinkView>;
}

export const linksApi = {
  async list(query: LinkListQuery): Promise<LinkList> {
    const params = Object.fromEntries(Object.entries(query).filter(([, v]) => v != null && v !== ''));
    const { data } = await api.get('/tracking-links', { params });
    return data.data as LinkList;
  },
  async get(kind: LinkKind, id: string): Promise<LinkDetail> {
    const { data } = await api.get(`/tracking-links/${kind}/${id}`);
    return data.data as LinkDetail;
  },
  async update(kind: LinkKind, id: string, changes: LinkChanges): Promise<LinkDetail> {
    const { data } = await api.patch(`/tracking-links/${kind}/${id}`, changes);
    return data.data as LinkDetail;
  },
  async revoke(kind: LinkKind, id: string): Promise<LinkDetail> {
    const { data } = await api.post(`/tracking-links/${kind}/${id}/revoke`);
    return data.data as LinkDetail;
  },
  /** Returns the new link. */
  async replace(kind: LinkKind, id: string): Promise<LinkDetail> {
    const { data } = await api.post(`/tracking-links/${kind}/${id}/replace`);
    return data.data as LinkDetail;
  },
};

import { api, ApiResponse } from '@/lib/api';
import type { LiveMediaItem, LiveMediaStage } from '@/services/fleetLiveService';

/** Mirrors backend/api-server/src/services/operatorInbox.ts. */
export type ShareRecipient = 'customer_contact' | 'customer_group' | 'internal' | 'other';
export type ShareChannel = 'link' | 'whatsapp_api';

export interface InboxCustomer {
  name: string;
  whatsapp_number: string | null;
  contact_person: string | null;
  contact_phone: string | null;
  group_name: string | null;
  group_link: string | null;
}

export interface DriverUpdate {
  key: string;
  trip: { id: string; ref_id: string | null; status: string; route: string };
  customer: InboxCustomer | null;
  vehicle_plate: string | null;
  driver: { name: string; phone: string | null } | null;
  stop: { id: string; name: string; type: string; sequence: number } | null;
  stage: LiveMediaStage;
  items: LiveMediaItem[];
  delay_note: string | null;
  latest_at: string;
  shares: { id: string; recipient: ShareRecipient; channel: ShareChannel; shared_by: string | null; shared_at: string; count: number }[];
  sent_ids: string[];
  unsent_count: number;
}

export interface ExpiryItem {
  key: string;
  entity_type: 'Vehicle' | 'Driver' | 'Customer' | 'Company' | 'Other';
  entity_id: string;
  entity_name: string;
  label: string;
  expiry_date: string;
  days: number;
  document_id: string | null;
  document_type_id: string | null;
  doc_type: string | null;
  contact: { name: string; phone: string } | null;
  on_trip_ref: string | null;
}

export interface ShareResult {
  share_url: string;
  text: string;
  whatsapp_url: string;
  sent_via_api: boolean;
  headline: string;
}

export interface PublicShare {
  trip_ref: string | null;
  headline: string;
  customer_name: string | null;
  route: string;
  vehicle_plate: string | null;
  driver_name: string | null;
  delay_note: string | null;
  items: { id: string; kind: LiveMediaItem['kind']; stage: LiveMediaStage; url: string; captured_at: string }[];
  shared_at: string;
}

export const operatorInboxService = {
  async getDriverUpdates(): Promise<{ updates: DriverUpdate[]; whatsapp_api_available: boolean }> {
    const res = await api.get<ApiResponse<{ updates: DriverUpdate[]; whatsapp_api_available: boolean }>>('/operator-inbox/driver-updates');
    return res.data.data;
  },

  async share(body: {
    trip_id: string;
    update_key: string;
    media_ids: string[];
    recipient: ShareRecipient;
    recipient_phone?: string | null;
    channel: ShareChannel;
  }): Promise<ShareResult> {
    const res = await api.post<ApiResponse<ShareResult>>('/operator-inbox/driver-updates/share', body);
    return res.data.data;
  },

  async getDocumentExpiries(): Promise<ExpiryItem[]> {
    const res = await api.get<ApiResponse<{ items: ExpiryItem[] }>>('/operator-inbox/document-expiries');
    return res.data.data.items;
  },

  async getPublicShare(token: string): Promise<PublicShare> {
    const res = await api.get<ApiResponse<PublicShare>>(`/public/shares/${encodeURIComponent(token)}`);
    return res.data.data;
  },
};

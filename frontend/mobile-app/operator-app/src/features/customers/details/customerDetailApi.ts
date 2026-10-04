/**
 * Data for the customer details screen: the customer record, their statement
 * (invoices + totals), their trips, quotations and saved places — all existing
 * endpoints the web customer page uses too.
 */
import { api } from '@mercon/mobile-shared/lib/api';
import { dateInZone, zonedWallTimeToUtcIso } from '@mercon/shared-types';
import type { OperatorTrip } from '../../../lib/operator';

export interface CustomerDetail {
  id: string;
  name: string;
  contact_phone: string | null;
  logo_url: string | null;
  primary_contact_person: string | null;
  primary_contact_phone: string | null;
  secondary_contact_person: string | null;
  secondary_contact_phone: string | null;
  payment_terms: string | null;
  whatsapp_number: string | null;
  whatsapp_group_link: string | null;
  whatsapp_group_name: string | null;
  driver_workflow: 'NATIVE' | 'EXTERNAL_APP' | string;
  isActive: boolean;
  createdAt: string;
  /** The latest 100 trips, newest first (GET /customers/:id). `_count.trips` is the true total. */
  trips?: (CustomerTrip & { is_delayed?: boolean; createdAt?: string })[];
  _count?: { trips?: number };
}

export interface StatementInvoice {
  id: string;
  ref_id: string | null;
  invoice_date: string | null;
  due_date: string | null;
  status: string;
  total_amount: number;
  paid_amount: number;
  balance_due: number;
  currency: string | null;
}

export interface CustomerStatement {
  invoices: StatementInvoice[];
  total_outstanding: number;
  total_invoiced: number;
  total_paid: number;
}

/** A trip as the list endpoint returns it (billing included). */
export type CustomerTrip = OperatorTrip & { billing_amount?: number | string | null };

const OPEN = 'Draft,Scheduled,Loading,InTransit,Delayed';

async function trips(params: Record<string, string | number>): Promise<{ trips: CustomerTrip[]; total: number }> {
  const { data } = await api.get('/trips', { params });
  return { trips: (data.data ?? []) as CustomerTrip[], total: Number(data.meta?.total ?? data.pagination?.total ?? (data.data ?? []).length) };
}

/** The customer's all-trucks tracking page link (mirrors the web's trackingService.CustomerTrackingLink). */
export interface CustomerTrackingLink {
  /** False when tracking is switched off for this customer — then url is null. */
  enabled: boolean;
  url: string | null;
  open_count: number;
  last_opened_at: string | null;
}

export interface TrackingOpen {
  id: string;
  opened_at: string;
  /** e.g. "iPhone · Safari"; null when the browser didn't say. */
  device: string | null;
  link: { kind: 'all_trucks' } | { kind: 'trip'; trip_id: string | null; ref_id: string | null };
}

export const customerDetailApi = {
  /** POST /customers/:id/tracking-link — the all-trucks link, created on first ask (same call the web makes). */
  async trackingLink(id: string): Promise<CustomerTrackingLink> {
    const { data } = await api.post(`/customers/${id}/tracking-link`, { renew: false });
    return data.data as CustomerTrackingLink;
  },

  /** GET /customers/:id/tracking-opens — every time the customer opened a link, newest first. */
  async trackingOpens(id: string): Promise<{ total: number; opens: TrackingOpen[] }> {
    const { data } = await api.get(`/customers/${id}/tracking-opens`, { params: { limit: 50 } });
    return { total: Number(data.data?.total ?? 0), opens: (data.data?.opens ?? []) as TrackingOpen[] };
  },

  async customer(id: string): Promise<CustomerDetail> {
    const { data } = await api.get(`/customers/${id}`);
    return data.data as CustomerDetail;
  },

  async statement(id: string): Promise<CustomerStatement> {
    const { data } = await api.get(`/customers/${id}/statement`);
    return data.data as CustomerStatement;
  },

  /** Trips not yet finished. */
  openTrips(id: string) {
    return trips({ customer_id: id, status: OPEN, per_page: 100 });
  },

  /** Trips planned this calendar month (company timezone), cancelled ones included for the caller to drop. */
  monthTrips(id: string, tz: string) {
    const today = dateInZone(Date.now(), tz);
    const [y, m] = today.split('-').map(Number);
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const start = zonedWallTimeToUtcIso(`${today.slice(0, 7)}-01`, '00:00', tz);
    const end = new Date(new Date(zonedWallTimeToUtcIso(next, '00:00', tz)).getTime() - 1).toISOString();
    return trips({ customer_id: id, start_date: start, end_date: end, per_page: 500 });
  },

  async timezone(): Promise<string> {
    try {
      const { data } = await api.get('/settings/public');
      return data?.data?.timezone || 'Asia/Riyadh';
    } catch {
      return 'Asia/Riyadh';
    }
  },
};

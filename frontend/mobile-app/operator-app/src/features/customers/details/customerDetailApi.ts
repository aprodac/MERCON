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

export const customerDetailApi = {
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

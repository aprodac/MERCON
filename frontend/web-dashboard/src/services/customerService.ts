import { api, ApiResponse } from '@/lib/api';
import type { ImportSummary } from '@/components/fleet/ExcelImportDialog';

export interface Customer {
  id: string;
  name: string;
  contact_phone: string;
  phone?: string;
  logo_url?: string | null;
  whatsapp_number?: string;
  whatsapp_group_link?: string;
  whatsapp_group_name?: string;
  primary_contact_person?: string;
  primary_contact_phone?: string;
  secondary_contact_person?: string;
  secondary_contact_phone?: string;
  payment_terms?: string;
  driver_workflow?: 'NATIVE' | 'EXTERNAL_APP';
  isActive: boolean;
  createdAt: string;
  trips?: { id: string; ref_id: string; status: string; createdAt: string }[];
  /** Present on list responses only — total trip count, used to rank frequent shippers. */
  _count?: { trips: number };
}

export interface CreateCustomerPayload {
  name: string;
  contact_phone: string;
  logo_url?: string | null;
  primary_contact_person?: string;
  primary_contact_phone?: string;
  secondary_contact_person?: string;
  secondary_contact_phone?: string;
  payment_terms?: string;
  driver_workflow?: 'NATIVE' | 'EXTERNAL_APP';
  isActive?: boolean;
  whatsapp_number?: string;
  whatsapp_group_link?: string;
  whatsapp_group_name?: string;
}

export interface CustomerFilters {
  search?: string;
  is_active?: boolean;
  page?: number;
  per_page?: number;
  /** Light "picker" shape — scalars only, no per-row trip count. */
  mode?: 'lookup';
}

export interface CustomerStatementInvoice {
  id: string;
  ref_id?: string | null;
  invoice_date: string;
  due_date?: string | null;
  status: 'Draft' | 'Issued' | 'PartiallyPaid' | 'Paid' | 'Void';
  total_amount: number;
  paid_amount: number;
  balance_due: number;
  currency: string;
}

export interface CustomerStatementData {
  customer: { id: string; name: string };
  invoices: CustomerStatementInvoice[];
  total_outstanding: number;
  total_invoiced: number;
  total_paid: number;
}

export const customerService = {
  async getAll(filters: CustomerFilters = {}): Promise<ApiResponse<Customer[]>> {
    const res = await api.get<ApiResponse<Customer[]>>('/customers', { params: filters });
    return res?.data ?? { success: false, data: [] };
  },

  async getById(id: string): Promise<Customer> {
    const res = await api.get<ApiResponse<Customer>>(`/customers/${id}`);
    return res?.data?.data;
  },

  async getStatement(id: string, params?: { date_from?: string; date_to?: string }): Promise<CustomerStatementData> {
    const res = await api.get<ApiResponse<CustomerStatementData>>(`/customers/${id}/statement`, { params });
    return res.data.data;
  },

  async create(payload: CreateCustomerPayload): Promise<Customer> {
    const res = await api.post<ApiResponse<Customer>>('/customers', payload);
    return res.data.data;
  },

  async update(id: string, payload: Partial<CreateCustomerPayload>): Promise<Customer> {
    const res = await api.patch<ApiResponse<Customer>>(`/customers/${id}`, payload);
    return res.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/customers/${id}`);
  },

  // 120s matches nginx's proxy_read_timeout for /api — a large sheet takes far
  // longer server-side than the client's default 15s request timeout allows.
  async importRows(rows: Record<string, string | number>[]): Promise<ImportSummary> {
    const res = await api.post<ApiResponse<ImportSummary>>('/customers/import', { rows }, { timeout: 120_000 });
    return res.data.data;
  },
};

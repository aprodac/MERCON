import { api, ApiResponse } from '@/lib/api';

export type ExpenseStatus = 'Paid' | 'Pending';

export interface Expense {
  id: string;
  /** Sequential expense number, e.g. "EXP-001". Null only for un-backfilled rows. */
  ref_id?: string | null;
  category: string;
  status: ExpenseStatus;
  driverId?: string | null;
  vehicleId?: string | null;
  /** A cost of one trip; its truck and driver are copied onto vehicleId / driverId. */
  tripId?: string | null;
  /** Bank or cash GL account a paid expense came out of. */
  paymentAccountId?: string | null;
  /** It has a posted ledger entry (list, create and update responses). */
  ledger_posted?: boolean;
  /** Returned by create / update: what happened in the ledger. */
  ledger?: ExpenseLedgerResult;
  payee?: string | null;
  /** What was paid, VAT included. */
  amount: number;
  /** Reclaimable VAT inside `amount`; the cost is amount − vat_amount. */
  vat_amount?: number | string;
  currency: string;
  expense_date: string;
  payment_method?: string | null;
  description?: string | null;
  /** When the vendor's bill was issued — distinct from expense_date. */
  bill_issued_date?: string | null;
  /** When the bill was actually paid — set once the record is settled. */
  bill_paid_date?: string | null;
  createdAt: string;
  updatedAt: string;
  driver?: {
    id: string;
    first_name: string;
    last_name: string;
    ref_id: string | null;
    deletedAt?: string | null;
  } | null;
  vehicle?: {
    id: string;
    plate_number: string;
    ref_id: string | null;
    deletedAt?: string | null;
  } | null;
  trip?: {
    id: string;
    ref_id: string | null;
    status: string;
    is_third_party: boolean;
    vehicleId: string | null;
    driverId: string | null;
    deletedAt?: string | null;
  } | null;
}

export interface CreateExpensePayload {
  category: string;
  status?: ExpenseStatus;
  driver_id?: string | null;
  vehicle_id?: string | null;
  trip_id?: string | null;
  payment_account_id?: string | null;
  payee?: string;
  amount: number;
  vat_amount?: number;
  currency?: string;
  expense_date?: string;
  payment_method?: string;
  description?: string;
  bill_issued_date?: string | null;
  bill_paid_date?: string | null;
}

export interface UpdateExpensePayload extends Partial<CreateExpensePayload> {}

export type ExpenseSort = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';
/** 'trip' = a trip's cost, 'vehicle' = a truck (no trip), 'driver' = a driver only, 'overhead' = none. */
export type ExpenseLink = 'trip' | 'vehicle' | 'driver' | 'overhead';

export interface ExpenseFilters {
  category?: string;
  status?: string;
  driver_id?: string;
  vehicle_id?: string;
  trip_id?: string;
  payment_method?: string;
  linked?: ExpenseLink;
  date_from?: string;
  date_to?: string;
  search?: string;
  sort?: ExpenseSort;
  page?: number;
  per_page?: number;
}

/** Totals over the same filters as the list (GET /expenses/summary). */
export interface ExpenseSummary {
  count: number;
  total: number;
  paid: number;
  pending: number;
  pending_count: number;
  by_category: { category: string; amount: number; count: number }[];
  by_month: { month: string; amount: number; count: number }[];
  linked: { trip: number; vehicle: number; driver: number; overhead: number };
  top_payees: { payee: string; amount: number; count: number }[];
  /** Spend in the equal-length period before the date range; null without a range. */
  previous_total: number | null;
}

export interface ExpenseLedgerEntry {
  id: string;
  ref_id: string | null;
  /** 'Expense' (the cost) or 'ExpensePayment' (paying a to-pay expense). */
  source: string;
  day: string;
  amount: number;
}

export interface ExpenseLedgerResult {
  entries: ExpenseLedgerEntry[];
  /** Why it isn't (fully) in the ledger. */
  problem: string | null;
  /** Posted through this supplier bill instead. */
  viaBill: string | null;
}

export interface ExpenseLedgerStatus extends ExpenseLedgerResult {
  planned: { source: string; day: string; memo: string; lines: { accountId: string; debit: number; credit: number; description: string }[] }[];
  accounts: { id: string; account_code: string; name: string }[];
}

export interface ExpenseLedgerSetup {
  enabled: boolean;
  default_expense_account_id: string | null;
  category_accounts: Record<string, string>;
  payable_account_id: string | null;
  vat_input_account_id?: string | null;
  unposted_count: number;
}

export interface PostUnpostedResult {
  considered: number;
  posted: number;
  remaining: number;
  problems: { message: string; count: number; example: string }[];
}

export interface ExpenseKpis {
  total_amount: number;
  paid_amount: number;
  pending_amount: number;
  salary_amount: number;
  total_count: number;
}

export interface ExpenseListResponse {
  success: boolean;
  data: Expense[];
  kpis?: ExpenseKpis;
  meta: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

export const expenseService = {
  async getAll(filters: ExpenseFilters = {}): Promise<ExpenseListResponse> {
    const res = await api.get<ExpenseListResponse>('/expenses', { params: filters });
    return res.data;
  },

  async getSummary(filters: Omit<ExpenseFilters, 'page' | 'per_page' | 'sort'> = {}): Promise<ExpenseSummary> {
    const res = await api.get<ApiResponse<ExpenseSummary>>('/expenses/summary', { params: filters });
    return res.data.data;
  },

  async getById(id: string): Promise<Expense> {
    const res = await api.get<ApiResponse<Expense>>(`/expenses/${id}`);
    return res.data.data;
  },

  async create(payload: CreateExpensePayload): Promise<Expense> {
    const res = await api.post<ApiResponse<Expense> & { ledger?: ExpenseLedgerResult }>('/expenses', payload);
    return { ...res.data.data, ledger: res.data.ledger };
  },

  async update(id: string, payload: UpdateExpensePayload): Promise<Expense> {
    const res = await api.patch<ApiResponse<Expense> & { ledger?: ExpenseLedgerResult }>(`/expenses/${id}`, payload);
    return { ...res.data.data, ledger: res.data.ledger };
  },

  async getLedger(id: string): Promise<ExpenseLedgerStatus> {
    const res = await api.get<ApiResponse<ExpenseLedgerStatus>>(`/expenses/${id}/ledger`);
    return res.data.data;
  },

  /** Post or repost now. */
  async postLedger(id: string): Promise<ExpenseLedgerResult> {
    const res = await api.post<ApiResponse<ExpenseLedgerResult>>(`/expenses/${id}/ledger`);
    return res.data.data;
  },

  async getLedgerSetup(): Promise<ExpenseLedgerSetup> {
    const res = await api.get<ApiResponse<ExpenseLedgerSetup>>('/expenses/ledger/setup');
    return res.data.data;
  },

  async updateLedgerSetup(body: { default_expense_account_id: string | null; category_accounts: Record<string, string>; payable_account_id?: string | null; vat_input_account_id?: string | null }): Promise<void> {
    await api.put('/expenses/ledger/setup', body);
  },

  /** Post expenses (matching the filters) that aren't in the ledger yet; up to 500 per call. */
  /** `fallback_payment_account_id` fills in "paid from" on paid expenses saved without one. */
  async postUnposted(filters: Omit<ExpenseFilters, 'page' | 'per_page' | 'sort'> & { fallback_payment_account_id?: string } = {}): Promise<PostUnpostedResult> {
    const res = await api.post<ApiResponse<PostUnpostedResult>>('/expenses/ledger/post-unposted', filters);
    return res.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/expenses/${id}`);
  },
};

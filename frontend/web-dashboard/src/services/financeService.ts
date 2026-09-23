import { api, type ApiResponse } from '@/lib/api';
import type {
  Account,
  AccountingPeriod,
  JournalEntry,
  AccountType,
  CashFlowCategory,
  PeriodStatus,
  JournalEntryStatus,
  Invoice,
  InvoiceStatus,
  Bill,
  BillStatus,
  BankAccount,
  BankReconciliation,
  Advance,
  AdvanceApplication,
  AdvancePartyType,
  AdvanceDirection,
  AdvanceStatus,
  ReconciliationStatus,
} from '@mercon/shared-types';

export interface GetAccountsParams {
  type?: AccountType | 'all';
  search?: string;
  include_inactive?: boolean;
  tree?: boolean;
}

export interface CreateAccountDTO {
  account_code: string;
  name: string;
  account_type: AccountType;
  cash_flow_category?: CashFlowCategory | null;
  parentId?: string | null;
  description?: string | null;
  is_postable?: boolean;
  isActive?: boolean;
}

export interface CreateAccountingPeriodDTO {
  name: string;
  start_date: string;
  end_date: string;
}

export interface JournalLineDTO {
  accountId: string;
  debit: number;
  credit: number;
  currency?: string;
  description?: string | null;
}

export interface CreateJournalEntryDTO {
  entry_date: string;
  memo?: string | null;
  periodId: string;
  source_type?: string;
  source_id?: string | null;
  lines: JournalLineDTO[];
}

export interface InvoiceLineDTO {
  tripId?: string | null;
  description: string;
  quantity?: number;
  rate: number;
  amount: number;
}

export interface CreateInvoiceDTO {
  customerId: string;
  invoice_date: string;
  due_date?: string | null;
  tax_rate?: number;
  currency?: string;
  tripIds?: string[];
  lines?: InvoiceLineDTO[];
}

export interface RecordInvoicePaymentDTO {
  amount: number;
  payment_date: string;
  accountId: string;
  payment_method?: string | null;
  reference?: string | null;
}

export interface BillLineDTO {
  source_type?: string;
  source_id?: string | null;
  accountId?: string | null;
  description: string;
  amount: number;
}

export interface CreateBillDTO {
  providerId?: string | null;
  payee_name?: string | null;
  bill_date: string;
  due_date?: string | null;
  tax_amount?: number;
  currency?: string;
  expenseIds?: string[];
  tripSubcontractIds?: string[];
  lines?: BillLineDTO[];
}

export interface RecordBillPaymentDTO {
  amount: number;
  payment_date: string;
  accountId: string;
  payment_method?: string | null;
  reference?: string | null;
}

export interface CreateBankAccountDTO {
  accountId: string;
  bank_name?: string | null;
  account_number?: string | null;
  iban?: string | null;
  swift_code?: string | null;
  is_cash?: boolean;
  opening_balance?: number;
  opening_date?: string | null;
  currency?: string;
}

export interface UpdateBankAccountDTO {
  bank_name?: string | null;
  account_number?: string | null;
  iban?: string | null;
  swift_code?: string | null;
  is_cash?: boolean;
  opening_balance?: number;
  opening_date?: string | null;
  currency?: string;
  isActive?: boolean;
}

export interface TransferFundsDTO {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date: string;
  memo?: string | null;
}

export interface GetAdvancesParams {
  party_type?: AdvancePartyType | string;
  party_id?: string;
  status?: AdvanceStatus | string;
  direction?: AdvanceDirection | string;
}

export interface CreateAdvanceDTO {
  party_type: AdvancePartyType;
  party_id?: string | null;
  direction: AdvanceDirection;
  amount: number;
  advance_date: string;
  accountId: string;
  memo?: string | null;
  currency?: string;
}

export interface ApplyAdvanceDTO {
  targetId: string;
  targetType: 'Invoice' | 'Bill';
  amount: number;
}

export interface CreateReconciliationDTO {
  bankAccountId: string;
  statement_date: string;
  statement_closing_balance: number;
  journalLineIds: string[];
}

export const financeService = {
  // Accounts
  getAccounts: async (params?: GetAccountsParams) => {
    const response = await api.get('/accounts', { params });
    return response.data;
  },

  getAccountById: async (id: string) => {
    const response = await api.get(`/accounts/${id}`);
    return response.data;
  },

  createAccount: async (data: CreateAccountDTO) => {
    const response = await api.post('/accounts', data);
    return response.data;
  },

  updateAccount: async (id: string, data: Partial<CreateAccountDTO>) => {
    const response = await api.patch(`/accounts/${id}`, data);
    return response.data;
  },

  deleteAccount: async (id: string) => {
    const response = await api.delete(`/accounts/${id}`);
    return response.data;
  },

  // Accounting Periods
  getAccountingPeriods: async (params?: { status?: PeriodStatus | 'all' }) => {
    const response = await api.get('/accounting-periods', { params });
    return response.data;
  },

  createAccountingPeriod: async (data: CreateAccountingPeriodDTO) => {
    const response = await api.post('/accounting-periods', data);
    return response.data;
  },

  closeAccountingPeriod: async (id: string) => {
    const response = await api.post(`/accounting-periods/${id}/close`);
    return response.data;
  },

  lockAccountingPeriod: async (id: string) => {
    const response = await api.post(`/accounting-periods/${id}/lock`);
    return response.data;
  },

  closeFiscalYear: async (closing_date: string) => {
    const response = await api.post('/accounting-periods/close-fiscal-year', { closing_date });
    return response.data;
  },

  // Journal Entries
  getJournalEntries: async (params?: {
    period_id?: string;
    status?: JournalEntryStatus | 'all';
    source_type?: string;
    account_id?: string;
    date_from?: string;
    date_to?: string;
    search?: string;
    page?: number;
    per_page?: number;
  }) => {
    const response = await api.get('/journal-entries', { params });
    return response.data;
  },

  getJournalEntryById: async (id: string) => {
    const response = await api.get(`/journal-entries/${id}`);
    return response.data;
  },

  createDraftJournalEntry: async (data: CreateJournalEntryDTO) => {
    const response = await api.post('/journal-entries', data);
    return response.data;
  },

  updateDraftJournalEntry: async (id: string, data: Partial<CreateJournalEntryDTO>) => {
    const response = await api.patch(`/journal-entries/${id}`, data);
    return response.data;
  },

  deleteDraftJournalEntry: async (id: string) => {
    const response = await api.delete(`/journal-entries/${id}`);
    return response.data;
  },

  postJournalEntry: async (id: string) => {
    const response = await api.post(`/journal-entries/${id}/post`);
    return response.data;
  },

  voidJournalEntry: async (id: string, memo?: string) => {
    const response = await api.post(`/journal-entries/${id}/void`, { memo });
    return response.data;
  },

  // Invoices (Accounts Receivable)
  getInvoices: async (params?: {
    customer_id?: string;
    status?: InvoiceStatus | 'all';
    date_from?: string;
    date_to?: string;
    search?: string;
    page?: number;
    per_page?: number;
  }) => {
    const response = await api.get('/invoices', { params });
    return response.data;
  },

  getInvoiceById: async (id: string) => {
    const response = await api.get(`/invoices/${id}`);
    return response.data;
  },

  createDraftInvoice: async (data: CreateInvoiceDTO) => {
    const response = await api.post('/invoices', data);
    return response.data;
  },

  updateDraftInvoice: async (id: string, data: Partial<CreateInvoiceDTO>) => {
    const response = await api.patch(`/invoices/${id}`, data);
    return response.data;
  },

  deleteDraftInvoice: async (id: string) => {
    const response = await api.delete(`/invoices/${id}`);
    return response.data;
  },

  issueInvoice: async (id: string) => {
    const response = await api.post(`/invoices/${id}/issue`);
    return response.data;
  },

  recordInvoicePayment: async (id: string, data: RecordInvoicePaymentDTO) => {
    const response = await api.post(`/invoices/${id}/payments`, data);
    return response.data;
  },

  voidInvoice: async (id: string) => {
    const response = await api.post(`/invoices/${id}/void`);
    return response.data;
  },

  // Bills (Accounts Payable)
  getBills: async (params?: {
    provider_id?: string;
    status?: BillStatus | 'all';
    date_from?: string;
    date_to?: string;
    search?: string;
    page?: number;
    per_page?: number;
  }) => {
    const response = await api.get('/bills', { params });
    return response.data;
  },

  getBillById: async (id: string) => {
    const response = await api.get(`/bills/${id}`);
    return response.data;
  },

  createDraftBill: async (data: CreateBillDTO) => {
    const response = await api.post('/bills', data);
    return response.data;
  },

  updateDraftBill: async (id: string, data: Partial<CreateBillDTO>) => {
    const response = await api.patch(`/bills/${id}`, data);
    return response.data;
  },

  deleteDraftBill: async (id: string) => {
    const response = await api.delete(`/bills/${id}`);
    return response.data;
  },

  approveBill: async (id: string) => {
    const response = await api.post(`/bills/${id}/approve`);
    return response.data;
  },

  recordBillPayment: async (id: string, data: RecordBillPaymentDTO) => {
    const response = await api.post(`/bills/${id}/payments`, data);
    return response.data;
  },

  voidBill: async (id: string) => {
    const response = await api.post(`/bills/${id}/void`);
    return response.data;
  },

  // Finance Reports
  getTrialBalance: async (params?: { period_id?: string }): Promise<ApiResponse<TrialBalanceData>> => {
    const response = await api.get('/finance/reports/trial-balance', { params });
    return response.data;
  },

  getProfitAndLoss: async (params?: { date_from?: string; date_to?: string }): Promise<ApiResponse<ProfitAndLossData>> => {
    const response = await api.get('/finance/reports/profit-and-loss', { params });
    return response.data;
  },

  getBalanceSheet: async (params?: { as_of?: string }): Promise<ApiResponse<BalanceSheetData>> => {
    const response = await api.get('/finance/reports/balance-sheet', { params });
    return response.data;
  },

  getARAgeing: async (params?: { as_of?: string }): Promise<ApiResponse<AgeingReportData>> => {
    const response = await api.get('/finance/reports/ar-ageing', { params });
    return response.data;
  },

  getAPAgeing: async (params?: { as_of?: string }): Promise<ApiResponse<AgeingReportData>> => {
    const response = await api.get('/finance/reports/ap-ageing', { params });
    return response.data;
  },

  getCashFlow: async (params?: { date_from?: string; date_to?: string }): Promise<ApiResponse<CashFlowData>> => {
    const response = await api.get('/finance/reports/cash-flow', { params });
    return response.data;
  },

  // Bank Accounts
  getBankAccounts: async (): Promise<ApiResponse<BankAccount[]>> => {
    const response = await api.get('/bank-accounts');
    return response.data;
  },

  getBankAccountById: async (id: string): Promise<ApiResponse<BankAccount>> => {
    const response = await api.get(`/bank-accounts/${id}`);
    return response.data;
  },

  createBankAccount: async (data: CreateBankAccountDTO): Promise<ApiResponse<BankAccount>> => {
    const response = await api.post('/bank-accounts', data);
    return response.data;
  },

  updateBankAccount: async (id: string, data: UpdateBankAccountDTO): Promise<ApiResponse<BankAccount>> => {
    const response = await api.put(`/bank-accounts/${id}`, data);
    return response.data;
  },

  transferFunds: async (data: TransferFundsDTO): Promise<ApiResponse<any>> => {
    const response = await api.post('/bank-accounts/transfer', data);
    return response.data;
  },

  // Advances
  getAdvances: async (params?: GetAdvancesParams): Promise<ApiResponse<Advance[]>> => {
    const response = await api.get('/advances', { params });
    return response.data;
  },

  getAdvanceById: async (id: string): Promise<ApiResponse<Advance>> => {
    const response = await api.get(`/advances/${id}`);
    return response.data;
  },

  createAdvance: async (data: CreateAdvanceDTO): Promise<ApiResponse<Advance>> => {
    const response = await api.post('/advances', data);
    return response.data;
  },

  applyAdvance: async (id: string, data: ApplyAdvanceDTO): Promise<ApiResponse<any>> => {
    const response = await api.post(`/advances/${id}/apply`, data);
    return response.data;
  },

  voidAdvance: async (id: string): Promise<ApiResponse<any>> => {
    const response = await api.post(`/advances/${id}/void`);
    return response.data;
  },

  // Bank Reconciliation
  getReconciliations: async (params?: { bankAccountId?: string }): Promise<ApiResponse<BankReconciliation[]>> => {
    const response = await api.get('/reconciliations', { params });
    return response.data;
  },

  getReconciliationById: async (id: string): Promise<ApiResponse<BankReconciliation>> => {
    const response = await api.get(`/reconciliations/${id}`);
    return response.data;
  },

  createReconciliation: async (data: CreateReconciliationDTO): Promise<ApiResponse<BankReconciliation>> => {
    const response = await api.post('/reconciliations', data);
    return response.data;
  },
};

export interface TrialBalanceItem {
  account_id: string;
  account_code: string;
  name: string;
  account_type: AccountType;
  debit: number;
  credit: number;
  balance: number;
}

export interface TrialBalanceData {
  period_id?: string;
  period_name?: string;
  items: TrialBalanceItem[];
  total_debit: number;
  total_credit: number;
  is_balanced: boolean;
}

export interface ReportLineItem {
  account_id?: string | null;
  account_code: string;
  name: string;
  amount: number;
}

export interface ProfitAndLossData {
  date_from?: string;
  date_to?: string;
  revenues: ReportLineItem[];
  expenses: ReportLineItem[];
  total_revenue: number;
  total_expense: number;
  net_profit: number;
}

export interface BalanceSheetData {
  as_of: string;
  using_snapshot: boolean;
  assets: ReportLineItem[];
  liabilities: ReportLineItem[];
  equity: ReportLineItem[];
  total_assets: number;
  total_liabilities: number;
  total_equity: number;
  is_balanced: boolean;
}

export interface AgeingRow {
  party_name: string;
  current: number;
  days_1_30: number;
  days_31_60: number;
  days_61_90: number;
  days_90_plus: number;
  total: number;
}

export interface AgeingReportData {
  as_of: string;
  rows: AgeingRow[];
  grand_total: AgeingRow;
}

export interface CashFlowData {
  date_from?: string;
  date_to?: string;
  operating: {
    net_income: number;
    adjustments: ReportLineItem[];
    total: number;
  };
  investing: {
    items: ReportLineItem[];
    total: number;
  };
  financing: {
    items: ReportLineItem[];
    total: number;
  };
  net_change_in_cash: number;
  opening_cash: number;
  closing_cash: number;
}


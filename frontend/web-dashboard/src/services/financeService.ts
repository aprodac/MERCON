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
  /** Percent, 0–100; `amount` is net of it. */
  discount_pct?: number;
  /** Percent; defaults to the invoice's VAT rate. */
  tax_rate?: number;
}

export interface CreateInvoiceDTO {
  customerId: string;
  invoice_date: string;
  due_date?: string | null;
  tax_rate?: number;
  currency?: string;
  tripIds?: string[];
  /** Per-trip VAT / discount overrides, keyed by trip id. */
  tripOptions?: Record<string, { tax_rate?: number; discount_pct?: number }>;
  lines?: InvoiceLineDTO[];
  /** Shown on the printed invoice. */
  notes?: string | null;
  terms?: string | null;
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
  /** Truck the line is for, so it counts in Vehicle P&L (manual lines only). */
  vehicleId?: string | null;
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
  /** Deposit slip, cheque or transfer (UTR) number. */
  reference?: string | null;
  /** Bank charges, posted to `charges_account_id` (an Expense account). */
  charges_amount?: number | null;
  charges_account_id?: string | null;
}

export interface ProfitTotals {
  trips: number;
  revenue: number;
  driverPay: number;
  subcontract: number;
  expenses: number;
  cost: number;
  margin: number;
  marginPct: number | null;
  lossTrips: number;
  unpricedTrips: number;
}

export interface ProfitTripRow {
  id: string;
  refId: string | null;
  day: string;
  customerId: string;
  customer: string;
  lane: string;
  vehicleId: string | null;
  vehicle: string | null;
  driver: string | null;
  thirdParty: boolean;
  status: string;
  revenue: number;
  driverPay: number;
  subcontract: number;
  expenses: number;
  cost: number;
  margin: number;
  marginPct: number | null;
}

export interface ProfitGroupRow extends ProfitTotals {
  key: string;
  label: string;
}

export type ProfitGroupBy = 'trip' | 'customer' | 'lane' | 'vehicle';

export interface TripProfitability {
  range: { from: string | null; to: string | null };
  group: ProfitGroupBy;
  summary: ProfitTotals;
  filtered: ProfitTotals;
  rows: (ProfitTripRow | ProfitGroupRow)[];
  meta: { total: number; page: number; per_page: number; truncated: boolean };
}

export interface TripProfitabilityParams {
  from?: string;
  to?: string;
  group?: ProfitGroupBy;
  customer_id?: string;
  vehicle_id?: string;
  only?: 'loss' | 'unpriced';
  search?: string;
  sort?: 'margin_pct' | 'margin' | 'revenue' | 'date';
  dir?: 'asc' | 'desc';
  page?: number;
  per_page?: number;
}

export interface SettlementQueueRow {
  driver_id: string;
  driver_ref: string | null;
  driver_name: string;
  owed: number;
  trips: number;
  oldest: string;
  open_advances: number;
}

export interface PayableTrip {
  tripId: string;
  refId: string | null;
  role: 'driver' | 'co_driver';
  amount: number;
  day: string;
  customer: string;
  lane: string;
}

export interface DriverPayable {
  trips: PayableTrip[];
  advances: { id: string; ref_id: string | null; amount: number; remaining: number; date: string; memo: string | null }[];
  driver_pay_account_id: string | null;
}

export interface DriverSettlementRow {
  id: string;
  ref_id: string | null;
  driver_id: string;
  driver_name: string;
  status: 'Paid' | 'Voided';
  paid_date: string;
  gross: number;
  deducted: number;
  net: number;
  trips: number;
  reference: string | null;
  journal_entry_id: string | null;
}

export interface DriverSettlementDetail extends Omit<DriverSettlementRow, 'trips'> {
  notes: string | null;
  voided_at: string | null;
  paid_from: string | null;
  lines: { trip_id: string; trip_ref: string | null; customer: string; day: string | null; role: 'driver' | 'co_driver'; amount: number }[];
  advances: { advance_id: string; ref_id: string | null; amount: number }[];
}

export interface CreateDriverSettlementDTO {
  driver_id: string;
  lines: { trip_id: string; role: 'driver' | 'co_driver' }[];
  advances: { advance_id: string; amount: number }[];
  paid_date: string;
  payment_account_id?: string | null;
  driver_pay_account_id?: string | null;
  reference?: string | null;
  notes?: string | null;
  period_from?: string | null;
  period_to?: string | null;
}

export interface CreditNoteLine {
  description: string;
  amount: number;
  tax_rate: number;
  tax_amount?: number;
}

export interface CreditNote {
  id: string;
  ref_id: string | null;
  invoice_id: string;
  invoice_ref: string | null;
  customer_name: string | null;
  credit_date: string;
  reason: string;
  status: 'Issued' | 'Void';
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  journal_entry_id: string | null;
  voided_at: string | null;
  lines: CreditNoteLine[];
}

export type VatBox = 'standard_sales' | 'zero_sales' | 'standard_purchases' | 'no_vat_purchases';

export interface VatDoc {
  box: VatBox;
  kind: 'invoice' | 'credit_note' | 'bill';
  id: string;
  ref: string | null;
  date: string;
  party: string;
  amount: number;
  adjustment: number;
  vat: number;
}

export interface VatReturn {
  from: string;
  to: string;
  boxes: Record<VatBox, { amount: number; adjustment: number; vat: number; docs: number }>;
  sales: { amount: number; adjustment: number; vat: number };
  purchases: { amount: number; vat: number };
  net_vat: number;
  documents: VatDoc[];
}

/** Cash → bank, bank → cash, bank → bank (cash → cash between two tills). */
export type ContraType = 'deposit' | 'withdrawal' | 'bank_to_bank' | 'cash_to_cash';

export interface ContraSide {
  account_id: string;
  bank_account_id: string | null;
  name: string;
  code: string;
  is_cash: boolean;
}

/** One contra entry: a BankTransfer journal entry read as a transfer. */
export interface ContraEntry {
  id: string;
  ref_id: string | null;
  entry_date: string;
  memo: string | null;
  reference: string | null;
  status: 'Posted' | 'Voided';
  voided_by: { id: string; ref_id: string | null; entry_date: string } | null;
  from: ContraSide | null;
  to: ContraSide | null;
  amount: number;
  charges: number;
  type: ContraType | null;
}

export type ContraSummary = Record<ContraType, { count: number; amount: number }> & { charges: number };

export interface ContraListParams {
  type?: ContraType | 'all';
  bank_account_id?: string;
  date_from?: string;
  date_to?: string;
  status?: 'posted' | 'voided' | 'all';
  search?: string;
  page?: number;
  per_page?: number;
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

/** The accounts an issued invoice posts to (null = not set). */
export interface InvoiceLedgerSetup {
  receivable_account_id: string | null;
  revenue_account_id: string | null;
  vat_output_account_id: string | null;
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

  reopenAccountingPeriod: async (id: string, reason: string) => {
    const response = await api.post(`/accounting-periods/${id}/reopen`, { reason });
    return response.data;
  },

  getAccountingPeriodActivity: async (id: string) => {
    const response = await api.get(`/accounting-periods/${id}/activity`);
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

  getJournalEntryActivity: async (id: string) => {
    const response = await api.get(`/journal-entries/${id}/activity`);
    return response.data;
  },

  // Invoices (Accounts Receivable)
  getInvoices: async (params?: InvoiceListParams) => {
    const response = await api.get('/invoices', { params });
    return response.data;
  },

  /** Tab counts and totals for the invoice list; honours the same filters (minus status). */
  getInvoiceSummary: async (params?: Omit<InvoiceListParams, 'status' | 'sort' | 'page' | 'per_page'>): Promise<ApiResponse<InvoiceSummary>> => {
    const response = await api.get('/invoices/summary', { params });
    return response.data;
  },

  /** Completed trips not on any invoice yet, grouped by customer. */
  getUnbilledTrips: async (): Promise<ApiResponse<UnbilledTrips>> => {
    const response = await api.get('/invoices/unbilled-trips');
    return response.data;
  },

  getInvoiceActivity: async (id: string): Promise<ApiResponse<InvoiceActivity[]>> => {
    const response = await api.get(`/invoices/${id}/activity`);
    return response.data;
  },

  /** Record that an invoice was sent or shared (shows in its activity). */
  logInvoiceSent: async (id: string, channel: InvoiceShareChannel) => {
    const response = await api.post(`/invoices/${id}/activity`, { action: 'SENT', channel });
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

  /** Where issuing an invoice posts: receivable (Dr), revenue and VAT output (Cr). */
  getInvoiceLedgerSetup: async (): Promise<InvoiceLedgerSetup> => {
    const response = await api.get('/invoices/ledger/setup');
    return response.data.data;
  },

  /** Admin: set any of the three accounts; a field left out is kept. */
  updateInvoiceLedgerSetup: async (body: Partial<InvoiceLedgerSetup>) => {
    const response = await api.put('/invoices/ledger/setup', body);
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

  getARAgeing: async (params?: GetAgeingParams): Promise<ApiResponse<AgeingReportData>> => {
    const response = await api.get('/finance/reports/ar-ageing', { params });
    return response.data;
  },

  getCustomerStatementLedger: async (params: { customer_id: string; date_from?: string; date_to?: string }): Promise<ApiResponse<CustomerStatementLedger>> => {
    const response = await api.get('/finance/reports/customer-statement', { params });
    return response.data;
  },

  getAPAgeing: async (params?: GetAgeingParams): Promise<ApiResponse<AgeingReportData>> => {
    const response = await api.get('/finance/reports/ap-ageing', { params });
    return response.data;
  },

  getCashFlow: async (params?: { date_from?: string; date_to?: string }): Promise<ApiResponse<CashFlowData>> => {
    const response = await api.get('/finance/reports/cash-flow', { params });
    return response.data;
  },

  getGeneralLedger: async (params?: {
    account_id?: string;
    date_from?: string;
    date_to?: string;
    page?: number;
    per_page?: number;
    source_type?: string;
    search?: string;
    side?: 'debit' | 'credit';
    min_amount?: number;
    max_amount?: number;
  }): Promise<ApiResponse<import('@mercon/shared-types').GeneralLedgerData>> => {
    const response = await api.get('/finance/reports/general-ledger', { params });
    return response.data;
  },

  getGeneralLedgerSummary: async (params?: {
    date_from?: string;
    date_to?: string;
    include_zero?: boolean | string;
  }): Promise<ApiResponse<import('@mercon/shared-types').GeneralLedgerSummaryData>> => {
    const response = await api.get('/finance/reports/general-ledger/summary', { params });
    return response.data;
  },

  getGeneralLedgerMonthly: async (params?: {
    account_id?: string;
    date_from?: string;
    date_to?: string;
  }): Promise<ApiResponse<import('@mercon/shared-types').GeneralLedgerMonthlyData>> => {
    const response = await api.get('/finance/reports/general-ledger/monthly', { params });
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

  getBankAccountTransactions: async (
    id: string,
    params?: {
      date_from?: string;
      date_to?: string;
      direction?: 'in' | 'out';
      reconciled?: boolean | string;
      search?: string;
      page?: number;
      per_page?: number;
    }
  ): Promise<ApiResponse<import('@mercon/shared-types').BankTransactionsResponse>> => {
    const response = await api.get(`/bank-accounts/${id}/transactions`, { params });
    return response.data;
  },

  getBankAccountBalanceHistory: async (
    id: string,
    params?: { days?: number }
  ): Promise<ApiResponse<import('@mercon/shared-types').BankBalanceHistoryPoint[]>> => {
    const response = await api.get(`/bank-accounts/${id}/balance-history`, { params });
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

  /** VAT return boxes for a period, from invoices, credit notes and bills. */
  getVatReturn: async (from: string, to: string): Promise<VatReturn> => (await api.get('/finance/reports/vat-return', { params: { from, to } })).data.data,
  getCreditNotes: async (params: { invoice_id?: string; customer_id?: string } = {}): Promise<CreditNote[]> => (await api.get('/invoices/credit-notes', { params })).data.data,
  /** Issues a credit note on an issued invoice and posts it. */
  createCreditNote: async (invoiceId: string, body: { credit_date: string; reason: string; lines: CreditNoteLine[] }): Promise<CreditNote> =>
    (await api.post(`/invoices/${invoiceId}/credit-notes`, body)).data.data,
  voidCreditNote: async (id: string) => (await api.post(`/invoices/credit-notes/${id}/void`)).data,

  /** Drivers with unpaid trip pay, most owed first. */
  getSettlementQueue: async (): Promise<SettlementQueueRow[]> => (await api.get('/driver-settlements/queue')).data.data,
  /** A driver's unpaid trips and open advances, for a new settlement. */
  getDriverPayable: async (driverId: string, upTo?: string): Promise<DriverPayable> =>
    (await api.get('/driver-settlements/payable', { params: { driver_id: driverId, up_to: upTo } })).data.data,
  getDriverSettlements: async (params: { driver_id?: string; status?: string; date_from?: string; date_to?: string } = {}): Promise<DriverSettlementRow[]> =>
    (await api.get('/driver-settlements', { params })).data.data,
  getDriverSettlement: async (id: string): Promise<DriverSettlementDetail> => (await api.get(`/driver-settlements/${id}`)).data.data,
  /** Pays the chosen trips and posts the entry. */
  createDriverSettlement: async (body: CreateDriverSettlementDTO): Promise<{ id: string; ref_id: string; net: number }> => (await api.post('/driver-settlements', body)).data.data,
  voidDriverSettlement: async (id: string) => (await api.post(`/driver-settlements/${id}/void`)).data,

  /** Earned trips' margins after driver pay, subcontract and trip expenses; by trip, customer, lane or truck. */
  getTripProfitability: async (params: TripProfitabilityParams = {}): Promise<TripProfitability> => {
    const response = await api.get('/finance/reports/trip-profitability', { params });
    return response.data.data;
  },

  /** The contra register (cash/bank transfers) with per-type totals for the period. */
  getContraEntries: async (params: ContraListParams = {}): Promise<{ data: ContraEntry[]; summary: ContraSummary; meta: { total: number; page: number; per_page: number; truncated: boolean } }> => {
    const response = await api.get('/bank-accounts/transfers', { params });
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
  account_code?: string | null;
  name: string;
  parent_id?: string | null;
  parent_code?: string | null;
  parent_name?: string | null;
  is_bank_or_cash?: boolean;
  kind?: string;
  amount: number;
}

export type InvoiceListStatus = InvoiceStatus | 'all' | 'unpaid' | 'overdue';
export type InvoiceSort = 'due_asc' | 'date_desc' | 'date_asc' | 'total_desc' | 'balance_desc' | 'created_desc';
export type InvoiceShareChannel = 'whatsapp' | 'email' | 'copy' | 'download' | 'print';

export interface InvoiceListParams {
  customer_id?: string;
  status?: InvoiceListStatus;
  date_from?: string;
  date_to?: string;
  search?: string;
  sort?: InvoiceSort;
  page?: number;
  per_page?: number;
}

export interface InvoiceSummary {
  counts: { all: number; Draft: number; unpaid: number; overdue: number; Paid: number; Void: number };
  unpaid_balance: number;
  overdue_balance: number;
  paid_this_month: number;
  payments_this_month: number;
}

export interface UnbilledCustomer {
  customer_id: string;
  customer_name: string;
  payment_terms: string | null;
  trip_ids: string[];
  amount: number;
  /** Completed trips with no billing amount set — they can't be invoiced yet. */
  missing_amount: number;
}

export interface UnbilledTrips {
  customers: UnbilledCustomer[];
  trip_count: number;
  amount: number;
  missing_amount_count: number;
}

export interface InvoiceActivity {
  id: string;
  action: string;
  at: string;
  by: string | null;
  details: { channel?: InvoiceShareChannel; amount?: number | string; ref_id?: string };
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

export interface GetAgeingParams {
  as_of?: string;
  basis?: 'due' | 'bill';
  include_bills?: boolean;
  include_invoices?: boolean;
  include_documents?: boolean;
  provider_id?: string;
  customer_id?: string;
}

export type StatementLineType = 'Invoice' | 'Payment' | 'AdvanceApplied' | 'InvoiceVoided';

export interface CustomerStatementLine {
  date: string;
  type: StatementLineType;
  ref: string | null;
  description: string;
  debit: number;
  credit: number;
  running_balance: number;
  document_id: string;
}

/** Ledger-style statement of account for one customer (GET /finance/reports/customer-statement). */
export interface CustomerStatementLedger {
  customer: { id: string; name: string; phone: string | null; payment_terms: string | null };
  date_from: string | null;
  date_to: string;
  opening_balance: number;
  lines: CustomerStatementLine[];
  total_debit: number;
  total_credit: number;
  closing_balance: number;
  ageing: { current: number; days_1_30: number; days_31_60: number; days_61_90: number; days_90_plus: number; total: number };
  unapplied_advances: number;
}

export interface AgeingBillDetail {
  id: string;
  ref_id: string | null;
  bill_date: string;
  due_date: string | null;
  days_overdue: number;
  balance: number;
  bucket: 'current' | '1-30' | '31-60' | '61-90' | '90+';
}

export interface AgeingPartyContact {
  type: 'provider' | 'payee' | 'customer';
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

export interface AgeingBucketCounts {
  current: number;
  days_1_30: number;
  days_31_60: number;
  days_61_90: number;
  days_90_plus: number;
  total: number;
}

export interface AgeingRow {
  party_id: string;
  party_name: string;
  party?: AgeingPartyContact;
  current: number;
  days_1_30: number;
  days_31_60: number;
  days_61_90: number;
  days_90_plus: number;
  total: number;
  bills?: AgeingBillDetail[];
  invoices?: AgeingBillDetail[];
}

export interface AgeingReportData {
  as_of: string;
  as_of_date?: string;
  basis?: 'due' | 'bill';
  summary: {
    total_current: number;
    total_1_30: number;
    total_31_60: number;
    total_61_90: number;
    total_90_plus: number;
    total_outstanding: number;
  };
  grand_total: AgeingRow;
  bucket_counts?: AgeingBucketCounts;
  rows: AgeingRow[];
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

export type {
  GeneralLedgerLineItem,
  GeneralLedgerData,
  GeneralLedgerSummaryItem,
  GeneralLedgerSummaryData,
  GeneralLedgerMonthlyItem,
  GeneralLedgerMonthlyData,
  GLContraLine,
} from '@mercon/shared-types';



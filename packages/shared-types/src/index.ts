/**
 * @mercon/shared-types
 * Canonical DTOs and enums shared between the API server and the web dashboard.
 * Import via: import type { User, ApiResponse } from '@mercon/shared-types';
 */

// ─── Enums / unions ──────────────────────────────────────────────
/** Mirrors the Prisma `Role` enum in backend/api-server/prisma/schema.prisma */
export type UserRole = 'SuperAdmin' | 'Admin' | 'Operator' | 'Driver';
export type UserStatus = 'Active' | 'Inactive';

/**
 * The owner-set tonnage tiers every rate card / trip should be filed under.
 * Not a Postgres enum — the column stays a nullable String, and both the
 * create/edit form and the bulk importer offer a "Custom" free-text escape
 * hatch for anything that doesn't fit one of these — but this is the list
 * offered by default. Superseded the old per-carrier list scraped straight
 * from the quotation workbooks ('6.5M-10TON', '5M-5TON', '13.5M-20TON',
 * '3TON/4TON', 'DYNA 3 TON', 'LORRY'), which mixed several carriers' own
 * wording for the same handful of real tonnage classes.
 */
export const VEHICLE_TYPES = [
  '3-4 TON',
  '3TON/4TON',
  '5 TON',
  '10 TON',
  '20 TON',
  '40 FEET',
] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

/**
 * The owner-set trip shapes every rate card / trip should be filed under.
 * Not a Postgres enum, same reasoning as VEHICLE_TYPES — "Custom" is a
 * free-text escape hatch, not a literal value stored here. Superseded the
 * old list ('Trip', 'Trip/Round Trip', 'Monthly Round', 'Extra Trip/Round
 * Trip', 'Daily Local', 'Airport', 'Regular Trip', 'Monthly (ROUND TRIP, 2
 * vehicles)'), which conflated trip shape with billing frequency — that
 * second dimension now lives in BILLING_TYPES instead.
 */
export const LINE_TYPES = [
  'SINGLE_TRIP',
  'ROUND_TRIP',
  '10_HRS',
  '12_HRS',
] as const;
export type LineType = (typeof LINE_TYPES)[number];

/** Legacy alias for backward compatibility */
export const RATE_CATEGORIES = LINE_TYPES;
export type RateCategory = LineType | string;

/**
 * Approved V1 billing types: MONTHLY, EXTRA.
 */
export const BILLING_TYPES = [
  'MONTHLY',
  'EXTRA',
] as const;
export type BillingType = (typeof BILLING_TYPES)[number];

/**
 * Approved V1 pricing basis types: PER_TRIP, PER_MONTH.
 */
export const PRICING_BASIS_TYPES = [
  'PER_TRIP',
  'PER_MONTH',
] as const;
export type PricingBasisType = (typeof PRICING_BASIS_TYPES)[number];

/**
 * Approved V1 pricing source types for traceability.
 */
export const PRICING_SOURCE_TYPES = [
  'SIGNED_CONTRACT',
  'AMENDMENT',
  'QUOTATION',
  'BILLING_TEMPLATE',
  'IMPORT',
  'MANUAL',
] as const;
export type PricingSourceType = (typeof PRICING_SOURCE_TYPES)[number];


/**
 * Suggested SurchargeRule.charge_type values — names only, no rates. Not a
 * Postgres enum (the column is free text, same reasoning as VEHICLE_TYPES),
 * and NOT seeded into the database: these exist purely so the charge-type
 * combobox has something to offer before any real SurchargeRule has been
 * saved, without inventing priced data. Taken from the fee types actually
 * named across the real customer quotation workbooks (AKS, HORIZON, etc.) —
 * every customer's real rate for each of these is still pending confirmation.
 */
export const SUGGESTED_CHARGE_TYPES = [
  'Additional Stop',
  'Waiting / Labor',
  'Labour Charge',
  'Offloading Charge',
  'Same-Day Delivery',
  'Trolley Fee',
] as const;

/**
 * Which unit each SUGGESTED_CHARGE_TYPES entry naturally goes with — picking
 * "Additional Stop" should offer "per stop" without a separate click. Applies
 * only to the suggested pairing; the unit field stays freely editable
 * afterward for anything a real customer prices differently.
 */
export const SUGGESTED_UNIT_BY_CHARGE_TYPE: Record<(typeof SUGGESTED_CHARGE_TYPES)[number], string> = {
  'Additional Stop': 'per stop',
  'Waiting / Labor': 'per hour',
  'Labour Charge': 'per person',
  'Offloading Charge': 'per vehicle',
  'Same-Day Delivery': 'per delivery',
  'Trolley Fee': 'flat',
};

/** Suggested SurchargeRule.unit values — display labels only, same reasoning as above. */
export const SUGGESTED_CHARGE_UNITS = [
  'per stop',
  'per hour',
  'per person',
  'per delivery',
  'per vehicle',
  'flat',
] as const;

/**
 * Suggested Expense.category values. Not a Postgres enum — the column stays a
 * free-text String so a category typed once outside this list never breaks a
 * deploy — but this is the list the create/edit form offers by default.
 */
export const EXPENSE_CATEGORIES = [
  'Salary',
  'Salary Advance',
  'Fuel',
  'Toll & Parking',
  'Rent',
  'Utilities',
  'Office Supplies',
  'Insurance',
  'Vehicle Maintenance',
  'Government Fees',
  'Other',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** Suggested Expense.payment_method values (free-text column, same reasoning as above). */
export const EXPENSE_PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Cheque', 'Card'] as const;
export type ExpensePaymentMethod = (typeof EXPENSE_PAYMENT_METHODS)[number];

/**
 * Platform modules that deployment superadmins can toggle via Settings.
 * Supports Agile phased deployment where any page/module can be enabled/disabled.
 */
export const MODULE_KEYS = [
  'dashboard',
  'quotations',
  'trips',
  'drivers',
  'vehicles',
  'customers',
  'locations',
  'taxonomy',
  'expenses',
  'documents',
  'reports',
  'company-reports',
  'report-builder',
  'maintenance',
  'third-party',
  'invoices',
  'aprodac-documents',
  'learning',
  'recycle-bin',
  'finance',
] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';
export type CashFlowCategory = 'Operating' | 'Investing' | 'Financing';
export type PeriodStatus = 'Open' | 'Closed' | 'Locked';
export type JournalEntryStatus = 'Draft' | 'Posted' | 'Voided';
export type InvoiceStatus = 'Draft' | 'Issued' | 'PartiallyPaid' | 'Paid' | 'Void';
export type BillStatus = 'Draft' | 'Approved' | 'PartiallyPaid' | 'Paid' | 'Void';

/**
 * Canonical fields a company-specific Excel report template's columns can be
 * mapped to. Source of truth for both the mapping-editor UI dropdown and the
 * backend row resolver (services/reports/xlsxTemplate/tripReportData.ts) —
 * keep both in sync with this list instead of hardcoding field names.
 */
export const TRIP_REPORT_FIELDS = [
  { key: 'serial', label: 'Row number', type: 'number' },
  { key: 'ref_id', label: 'Trip / Job No.', type: 'string' },
  { key: 'date', label: 'Trip date', type: 'date' },
  { key: 'driver_name', label: 'Driver name', type: 'string' },
  { key: 'driver_phone', label: 'Driver mobile', type: 'string' },
  { key: 'vehicle_plate', label: 'Vehicle plate', type: 'string' },
  { key: 'vehicle_type', label: 'Vehicle type', type: 'string' },
  { key: 'carrier_name', label: 'Carrier / 3rd party', type: 'string' },
  { key: 'customer_name', label: 'Customer / sender', type: 'string' },
  { key: 'receiver', label: 'Receiver / consignee', type: 'string' },
  { key: 'origin', label: 'Pickup location', type: 'string' },
  { key: 'destination', label: 'Dropoff location', type: 'string' },
  { key: 'total_charges', label: 'Extra charges (waiting, stops, etc.)', type: 'money' },
  { key: 'billing_amount', label: 'Billing amount', type: 'money' },
  { key: 'total_amount', label: 'Total amount', type: 'money' },
  { key: 'driver_payout', label: 'Driver payout', type: 'money' },
  { key: 'balance_amount', label: 'Balance amount', type: 'money' },
  { key: 'status', label: 'Trip status', type: 'string' },
  { key: 'rate_category', label: 'Rate category', type: 'string' },
] as const;
export type TripReportFieldKey = (typeof TRIP_REPORT_FIELDS)[number]['key'];

/**
 * A confirmed mapping between an uploaded company template's Excel columns
 * and MERCON data. Auto-detection produces a first draft; a human confirms
 * it once via the mapping editor, and this saved layout — not a re-guess —
 * is what report generation reads (see ReportTemplate.layout in schema.prisma).
 */
export interface TemplateLayout {
  sheetName: string;
  headerRowIdx: number; // 1-based
  dataStartRow: number; // 1-based; first row of the style band
  /**
   * 1-based, inclusive. The last row of the template's sample data block —
   * everything in [dataStartRow, dataEndRow] is replaced by generated rows,
   * and anything below it (a totals row, notes, signature block) is kept and
   * shifted. Without this the customer's own sample rows survive underneath
   * the real data in the generated report.
   */
  dataEndRow: number;
  bandSize: number; // 1 = uniform rows, 2 = striped, N = repeating block
  columns: Array<{
    colIndex: number; // 1-based
    headerText: string; // for display only
    source:
      | { kind: 'field'; key: TripReportFieldKey }
      | { kind: 'const'; value: string }
      | { kind: 'formula' } // keep the template's own formula, row-shifted
      | { kind: 'blank' };
  }>;
  tokens?: Record<string, string>;
}

// ─── Domain entities ─────────────────────────────────────────────
export interface User {
  id: string;
  name?: string;
  username: string;
  email?: string;
  phone?: string;
  role: UserRole;
  status?: UserStatus;
  lastLogin?: string;
  isSuperAdmin?: boolean;
}

/**
 * IANA timezones offered in the deployment's timezone setting. Defaults to
 * Asia/Riyadh (Saudi Arabia, UTC+3, no DST) — kept as a short curated list
 * rather than the full IANA database since this is a "pick your region"
 * dropdown, not a general-purpose timezone picker. Add more here as new
 * deployment regions come up; every DB timestamp stays UTC regardless.
 */
export const COMMON_TIMEZONES = [
  'Asia/Riyadh',
  'Asia/Dubai',
  'Asia/Kuwait',
  'Asia/Qatar',
  'Asia/Bahrain',
  'Asia/Baghdad',
  'Africa/Cairo',
  'Europe/London',
  'Europe/Istanbul',
  'UTC',
] as const;
export type CommonTimezone = (typeof COMMON_TIMEZONES)[number];

/** Standard list of GCC and common international country dial codes with flag emojis */
export interface CountryCode {
  code: string;
  dialCode: string;
  name: string;
  flag: string;
}

export const COUNTRY_CODES: CountryCode[] = [
  { code: 'SA', dialCode: '+966', name: 'Saudi Arabia', flag: '🇸🇦' },
  { code: 'AE', dialCode: '+971', name: 'United Arab Emirates', flag: '🇦🇪' },
  { code: 'KW', dialCode: '+965', name: 'Kuwait', flag: '🇰🇼' },
  { code: 'QA', dialCode: '+974', name: 'Qatar', flag: '🇶🇦' },
  { code: 'OM', dialCode: '+968', name: 'Oman', flag: '🇴🇲' },
  { code: 'BH', dialCode: '+973', name: 'Bahrain', flag: '🇧🇭' },
  { code: 'EG', dialCode: '+20', name: 'Egypt', flag: '🇪🇬' },
  { code: 'US', dialCode: '+1', name: 'United States', flag: '🇺🇸' },
  { code: 'GB', dialCode: '+44', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'JO', dialCode: '+962', name: 'Jordan', flag: '🇯🇴' },
  { code: 'LB', dialCode: '+961', name: 'Lebanon', flag: '🇱🇧' },
  { code: 'IQ', dialCode: '+964', name: 'Iraq', flag: '🇮🇶' },
  { code: 'YE', dialCode: '+967', name: 'Yemen', flag: '🇾🇪' },
  { code: 'IN', dialCode: '+91', name: 'India', flag: '🇮🇳' },
  { code: 'PK', dialCode: '+92', name: 'Pakistan', flag: '🇵🇰' },
  { code: 'BD', dialCode: '+880', name: 'Bangladesh', flag: '🇧🇩' },
  { code: 'PH', dialCode: '+63', name: 'Philippines', flag: '🇵🇭' },
  { code: 'SD', dialCode: '+249', name: 'Sudan', flag: '🇸🇩' },
];

export const DEFAULT_COUNTRY = COUNTRY_CODES[0]; // Saudi Arabia +966

/** This deployment's branding + module config. Singleton — one row per client database. */
export interface Settings {
  id: string;
  appName: string;
  companyLegalName: string;
  vatNumber?: string | null;
  crNumber?: string | null;
  logoUrl?: string | null;
  primaryColor: string;
  themeColors?: Record<string, any> | null;
  taxonomyConfig?: Record<string, any> | null;
  maintenanceMode?: boolean;
  maintenanceBanner?: string | null;
  enabledModules: ModuleKey[];
  hiddenModules: ModuleKey[];
  /** IANA timezone (e.g. "Asia/Riyadh") the frontends convert UTC timestamps to for display. */
  timezone: string;
  /** Default country code (e.g. "SA") for phone number fields across the deployment. */
  defaultCountryCode?: string;
  /** Default dial code (e.g. "+966") for phone number fields across the deployment. */
  defaultCountryDialCode?: string;
  defaultReceivableAccountId?: string | null;
  defaultRevenueAccountId?: string | null;
  defaultPayableAccountId?: string | null;
  defaultCustomerAdvanceAccountId?: string | null;
  defaultProviderAdvanceAccountId?: string | null;
  defaultEmployeeAdvanceAccountId?: string | null;
  defaultRetainedEarningsAccountId?: string | null;
  updatedAt: string;
}

/** Subset returned by the unauthenticated GET /settings/public endpoint. */
export type PublicSettings = Pick<Settings, 'appName' | 'companyLegalName' | 'vatNumber' | 'crNumber' | 'logoUrl' | 'primaryColor' | 'timezone' | 'defaultCountryCode' | 'defaultCountryDialCode'>;

// ─── Location DTO ───────────────────────────────────────────────
export interface Location {
  id: string;
  name: string;
  slug?: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  codes?: string[];
  is_active?: boolean;
}

// ─── API envelope ────────────────────────────────────────────────
/** Standard response wrapper returned by the API (`res.json({ data })`). */
export interface ApiResponse<T> {
  data: T;
  message?: string;
  error?: string;
}

// ─── Commercial Pricing Snapshot DTO ────────────────────────────────
export interface TripFinancialsDto {
  id?: string;
  tripId?: string;
  quotationId?: string | null;
  applied_rate?: number | string | null;
  quotation_line_type?: LineType | string | null;
  quotation_operation_type?: BillingType | string | null;
  quotation_billing_type?: BillingType | string | null;
  quotation_pricing_basis?: PricingBasisType | string | null;
  quotation_vehicle_class?: string | null;
  quotation_source_vehicle_label?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface TripCommercialSnapshot extends TripFinancialsDto {}

// ─── Subcontract / Rental Carrier DTO ──────────────────────────────
export interface TripSubcontractDto {
  id?: string;
  tripId?: string;
  providerId?: string | null;
  provider?: { id: string; name: string; contact_person?: string | null; phone?: string | null } | null;
  driverName?: string | null;
  driverPhone?: string | null;
  vehiclePlate?: string | null;
  vehicleType?: string | null;
  cost?: number | string | null;
  createdAt?: string;
  updatedAt?: string;
}

// ─── Quotation V1 DTOs ──────────────────────────────────────────
export interface QuotationStop {
  id: string;
  quotationId: string;
  sequence: number;
  leg_index?: number;
  locationId?: string | null;
  stop_type: string;
  source_label?: string | null;
  location?: Location | null;
  location_name?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface TripStopDTO {
  id: string;
  tripId: string;
  stop_sequence: number;
  leg_index: number;
  stop_type: 'Pickup' | 'Dropoff' | 'Rest' | 'Refuel';
  location_name?: string | null;
  location_address?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  location_coordinate_precision?: string | null;
  locationId?: string | null;
  location?: Location | null;
  planned_arrival?: string | null;
  actual_arrival?: string | null;
  actual_departure?: string | null;
  delay_reason?: string | null;
  delay_note?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Quotation {
  id: string;
  quotation_number?: number | string | null;
  name: string;
  customerId: string;
  customer?: { id: string; name: string } | null;
  agreement_ref?: string | null;
  documentId?: string | null;
  document?: any | null;
  vehicle_class?: string | null;
  source_vehicle_label?: string | null;
  vehicle_type?: string | null;
  line_type?: LineType | string | null;
  rate_category?: string | null;
  operation_type?: BillingType | string | null;
  billing_type?: BillingType | string | null;
  pricing_basis?: PricingBasisType | string | null;
  rate: number;
  base_price?: number;
  currency: string;
  valid_from?: string | null;
  valid_to?: string | null;
  source_type?: string | null;
  source_reference?: string | null;
  is_active: boolean;
  version?: number;
  created_by?: string | null;
  updated_by?: string | null;
  createdAt: string;
  updatedAt: string;
  stops?: QuotationStop[];
  route_origin?: string;
  route_destination?: string;
  origin_name?: string | null;
  destination_name?: string | null;
  originLocationId?: string | null;
  destinationLocationId?: string | null;
  originLocation?: Location | null;
  destinationLocation?: Location | null;
  default_trip_charge?: number | null;
  driver_payout?: number | null;
}

export interface QuotationHistory {
  id: string;
  quotationId: string;
  old_rate?: number | string | null;
  new_rate?: number | string | null;
  old_base_price?: number | null;
  new_base_price?: number | null;
  changed_by?: string | null;
  changed_by_user_id?: string | null;
  changed_by_name?: string | null;
  reason?: string | null;
  source: string;
  trip_id?: string | null;
  createdAt: string;
}

/** Backward compatibility aliases */
export type PricingRule = Quotation;
export type PricingRuleStop = QuotationStop;
export type PricingRuleHistory = QuotationHistory;
export type RateCard = Quotation;

// ─── Accounting / Finance Types ──────────────────────────────
export interface Account {
  id: string;
  account_code: string;
  name: string;
  account_type: AccountType;
  cash_flow_category?: CashFlowCategory | null;
  parentId?: string | null;
  parent?: Account | null;
  children?: Account[];
  description?: string | null;
  is_postable: boolean;
  current_balance?: number;
  total_debit?: number;
  total_credit?: number;
  journalLines?: JournalLine[];
  created_by?: string | null;
  updated_by?: string | null;
  deleted_by?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  isActive: boolean;
  version?: number;
}

export interface AccountingPeriod {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: PeriodStatus;
  journalEntries?: JournalEntry[];
  closed_by?: string | null;
  closed_at?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JournalEntry {
  id: string;
  ref_id?: string | null;
  entry_date: string;
  memo?: string | null;
  status: JournalEntryStatus;
  periodId: string;
  period?: AccountingPeriod;
  source_type: string;
  source_id?: string | null;
  reversalOfId?: string | null;
  reversalOf?: JournalEntry | null;
  reversedBy?: JournalEntry | null;
  lines?: JournalLine[];
  created_by?: string | null;
  posted_by?: string | null;
  posted_at?: string | null;
  createdAt: string;
  updatedAt: string;
  version?: number;
}

export interface JournalLine {
  id: string;
  journalEntryId: string;
  journalEntry?: JournalEntry;
  accountId: string;
  account?: Account;
  debit: number | string;
  credit: number | string;
  currency: string;
  description?: string | null;
  createdAt: string;
}

export interface Invoice {
  id: string;
  ref_id?: string | null;
  customerId: string;
  customer?: any;
  invoice_date: string;
  due_date?: string | null;
  status: InvoiceStatus;
  subtotal: number | string;
  tax_rate: number | string;
  tax_amount: number | string;
  total_amount: number | string;
  paid_amount: number | string;
  balance_due: number | string;
  currency: string;
  lines?: InvoiceLine[];
  payments?: InvoicePayment[];
  trips?: any[];
  journalEntryId?: string | null;
  journalEntry?: JournalEntry | null;
  created_by?: string | null;
  updated_by?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceLine {
  id: string;
  invoiceId: string;
  invoice?: Invoice;
  tripId?: string | null;
  trip?: any;
  description: string;
  quantity: number;
  rate: number | string;
  amount: number | string;
  createdAt: string;
}

export interface InvoicePayment {
  id: string;
  invoiceId: string;
  invoice?: Invoice;
  amount: number | string;
  payment_date: string;
  payment_method?: string | null;
  reference?: string | null;
  accountId: string;
  account?: Account;
  journalEntryId?: string | null;
  journalEntry?: JournalEntry | null;
  created_by?: string | null;
  createdAt: string;
}

export interface Bill {
  id: string;
  ref_id?: string | null;
  providerId?: string | null;
  provider?: any;
  payee_name?: string | null;
  bill_date: string;
  due_date?: string | null;
  status: BillStatus;
  subtotal: number | string;
  tax_amount: number | string;
  total_amount: number | string;
  paid_amount: number | string;
  balance_due: number | string;
  currency: string;
  lines?: BillLine[];
  payments?: BillPayment[];
  journalEntryId?: string | null;
  journalEntry?: JournalEntry | null;
  created_by?: string | null;
  updated_by?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BillLine {
  id: string;
  billId: string;
  bill?: Bill;
  source_type: string;
  source_id?: string | null;
  accountId?: string | null;
  account?: Account | null;
  description: string;
  amount: number | string;
  createdAt: string;
}

export interface BillPayment {
  id: string;
  billId: string;
  bill?: Bill;
  amount: number | string;
  payment_date: string;
  payment_method?: string | null;
  reference?: string | null;
  accountId: string;
  account?: Account;
  journalEntryId?: string | null;
  journalEntry?: JournalEntry | null;
  created_by?: string | null;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId?: string | null;
  user?: { id: string; name: string | null; username: string; role: string } | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, any> | null;
  createdAt: string;
}

// ─── Phase 4 Finance Types ──────────────────────────────────────────
export type ReconciliationStatus = 'Draft' | 'Completed';
export type AdvancePartyType = 'Customer' | 'Provider' | 'Employee';
export type AdvanceDirection = 'Received' | 'Paid';
export type AdvanceStatus = 'Open' | 'PartiallyApplied' | 'FullyApplied' | 'Void';

export interface BankAccount {
  id: string;
  accountId: string;
  account?: Account;
  bank_name?: string | null;
  account_number?: string | null;
  iban?: string | null;
  swift_code?: string | null;
  is_cash: boolean;
  opening_balance: number | string;
  opening_date?: string | null;
  currency: string;
  reconciliations?: BankReconciliation[];
  created_by?: string | null;
  updated_by?: string | null;
  deletedAt?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BankReconciliation {
  id: string;
  bankAccountId: string;
  bankAccount?: BankAccount;
  statement_date: string;
  statement_closing_balance: number | string;
  status: ReconciliationStatus;
  lines?: JournalLine[];
  _count?: { lines: number };
  reconciled_by?: string | null;
  reconciled_at?: string | null;
  createdAt: string;
}

export interface Advance {
  id: string;
  ref_id?: string | null;
  party_type: AdvancePartyType;
  party_id?: string | null;
  direction: AdvanceDirection;
  amount: number | string;
  applied_amount: number | string;
  remaining_amount: number | string;
  advance_date: string;
  status: AdvanceStatus;
  currency: string;
  memo?: string | null;
  accountId: string;
  account?: Account;
  journalEntryId?: string | null;
  journalEntry?: JournalEntry | null;
  applications?: AdvanceApplication[];
  created_by?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdvanceApplication {
  id: string;
  advanceId: string;
  advance?: Advance;
  invoiceId?: string | null;
  invoice?: Invoice | null;
  billId?: string | null;
  bill?: Bill | null;
  amount: number | string;
  applied_date: string;
  journalEntryId?: string | null;
  journalEntry?: JournalEntry | null;
  created_by?: string | null;
  createdAt: string;
}

export interface AccountClosingBalance {
  id: string;
  periodId: string;
  period?: AccountingPeriod;
  accountId: string;
  account?: Account;
  closing_debit_total: number | string;
  closing_credit_total: number | string;
  closing_balance: number | string;
  computed_at: string;
}

export interface TrialBalanceItem {
  account_code: string;
  name: string;
  account_type: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface TrialBalanceReport {
  period_id?: string;
  period_name?: string;
  items: TrialBalanceItem[];
  total_debit: number;
  total_credit: number;
  is_balanced: boolean;
}

export interface ProfitAndLossReport {
  date_from?: string;
  date_to?: string;
  revenues: { account_code: string; name: string; amount: number }[];
  expenses: { account_code: string; name: string; amount: number }[];
  total_revenue: number;
  total_expense: number;
  net_profit: number;
}

export interface BalanceSheetReport {
  as_of?: string;
  using_snapshot: boolean;
  assets: { account_code: string; name: string; amount: number }[];
  liabilities: { account_code: string; name: string; amount: number }[];
  equity: { account_code: string; name: string; amount: number }[];
  total_assets: number;
  total_liabilities: number;
  total_equity: number;
  is_balanced: boolean;
}

export interface TimestampedStep {
  time: string;
  title: string;
  description: string;
}

export interface LearningResource {
  id: string;
  title: string;
  category: string;
  categoryLabel: string;
  courseName?: string | null;
  episodeNumber?: number | null;
  targetRoute?: string | null;
  description: string;
  durationSeconds: number;
  videoUrl: string;
  thumbnailUrl?: string | null;
  steps?: TimestampedStep[] | null;
  keyTakeaways?: string[] | null;
  created_by?: string | null;
  createdAt: string;
  updatedAt: string;
  isWatched?: boolean;
  createdBy?: {
    id: string;
    name?: string | null;
  } | null;
}

export interface CreateLearningResourceDTO {
  title: string;
  category: string;
  categoryLabel?: string;
  courseName?: string;
  episodeNumber?: number;
  targetRoute?: string;
  description: string;
  durationSeconds?: number;
}

export * from './quotationMatching';
export * from './quotationSearch';
export * from './monthlyRotation';
export * from './tripRoute';









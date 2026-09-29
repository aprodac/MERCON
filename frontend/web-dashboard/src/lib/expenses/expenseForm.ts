/**
 * The expense editor's form: its empty and loaded states, what blocks saving, and expenses that
 * look like the one being entered (same amount and category or payee, within a few days).
 * Linking rules come from @mercon/shared-types, the same ones the API enforces.
 */
import { EXPENSE_CATEGORIES, expenseCategoryRule, expenseLinkProblem, type ExpenseLinkKind } from '@mercon/shared-types';
import type { Expense, ExpenseStatus } from '@/services/expenseService';
import { todayIso } from './expenseMeta';

export interface ExpenseForm {
  status: ExpenseStatus;
  category: string;
  /** Typing a category that isn't in the list. */
  customCategory: boolean;
  amount: string;
  /** Reclaimable VAT inside the amount ('' = none). */
  vat_amount: string;
  expense_date: string;
  payee: string;
  payment_method: string;
  /** Bank or cash GL account a paid expense came out of. */
  payment_account_id: string;
  trip_id: string;
  vehicle_id: string;
  driver_id: string;
  bill_issued_date: string;
  bill_paid_date: string;
  description: string;
}

/** What the form knows about the chosen trip. */
export interface FormTrip {
  id: string;
  is_third_party?: boolean;
  vehicleId?: string | null;
  driverId?: string | null;
}

const dateOnly = (iso?: string | null) => (iso ? iso.slice(0, 10) : '');

export const emptyExpenseForm = (): ExpenseForm => ({
  status: 'Paid',
  category: '',
  customCategory: false,
  amount: '',
  vat_amount: '',
  expense_date: todayIso(),
  payee: '',
  payment_method: 'Bank Transfer',
  payment_account_id: '',
  trip_id: '',
  vehicle_id: '',
  driver_id: '',
  bill_issued_date: '',
  bill_paid_date: '',
  description: '',
});

/** The form for an existing expense; a duplicate is dated today, paid, with no bill dates. */
export function expenseFormFrom(e: Expense, duplicate: boolean): ExpenseForm {
  const known = (EXPENSE_CATEGORIES as readonly string[]).includes(e.category);
  return {
    status: duplicate ? 'Paid' : e.status,
    category: e.category,
    customCategory: !known && Boolean(e.category),
    amount: e.amount !== undefined && e.amount !== null ? String(e.amount) : '',
    vat_amount: Number(e.vat_amount) > 0 ? String(Number(e.vat_amount)) : '',
    expense_date: duplicate ? todayIso() : dateOnly(e.expense_date) || todayIso(),
    payee: e.payee ?? '',
    payment_method: e.payment_method ?? '',
    payment_account_id: e.paymentAccountId ?? '',
    // A trip is billed once; a duplicate keeps the truck but not the trip
    trip_id: duplicate ? '' : e.tripId ?? '',
    vehicle_id: e.vehicleId ?? '',
    driver_id: e.driverId ?? '',
    bill_issued_date: duplicate ? '' : dateOnly(e.bill_issued_date),
    bill_paid_date: duplicate ? '' : dateOnly(e.bill_paid_date),
    description: e.description ?? '',
  };
}

/** Which link fields the category allows. */
export function allowedLinks(category: string): Record<ExpenseLinkKind, boolean> {
  const allowed = expenseCategoryRule(category).allowed;
  return { trip: allowed.includes('trip'), vehicle: allowed.includes('vehicle'), driver: allowed.includes('driver'), company: allowed.includes('company') };
}

/**
 * Links that don't fit a newly chosen category are dropped (a rent expense can't keep a truck).
 * A trip carries its own truck and driver.
 */
export function fitLinksToCategory(f: ExpenseForm, category: string): Pick<ExpenseForm, 'trip_id' | 'vehicle_id' | 'driver_id'> {
  const a = allowedLinks(category);
  if (f.trip_id && a.trip) return { trip_id: f.trip_id, vehicle_id: f.vehicle_id, driver_id: f.driver_id };
  return { trip_id: '', vehicle_id: a.vehicle && !f.trip_id ? f.vehicle_id : '', driver_id: a.driver && !f.trip_id ? f.driver_id : '' };
}

/** What stops the expense being saved, in the order to fix it. */
export function expenseFormProblems(f: ExpenseForm, trip?: FormTrip | null): string[] {
  const out: string[] = [];
  if (!f.category.trim()) out.push('Choose a category.');
  if (!(Number(f.amount) > 0)) out.push('Enter an amount above zero.');
  const vat = Number(f.vat_amount) || 0;
  if (vat < 0) out.push('VAT can’t be negative.');
  else if (vat > 0 && Number(f.amount) > 0 && vat >= Number(f.amount)) out.push('The VAT must be less than the amount (the amount includes the VAT).');
  if (f.category.trim()) {
    const link = expenseLinkProblem({
      category: f.category,
      status: f.status,
      tripId: f.trip_id || null,
      vehicleId: f.trip_id ? trip?.vehicleId ?? null : f.vehicle_id || null,
      driverId: f.trip_id ? trip?.driverId ?? null : f.driver_id || null,
      tripIsThirdParty: Boolean(f.trip_id && trip?.is_third_party),
    });
    if (link) out.push(link);
  }
  if (f.bill_paid_date && f.bill_issued_date && f.bill_paid_date < f.bill_issued_date) out.push('The bill was paid before it was issued.');
  return out;
}

const DAY = 86_400_000;

/** Recorded expenses with the same amount and the same category or payee within 3 days. */
export function likelyDuplicates(f: ExpenseForm, recorded: Expense[], windowDays = 3): Expense[] {
  const amount = Number(f.amount);
  if (!(amount > 0) || !f.expense_date) return [];
  const when = new Date(`${f.expense_date}T00:00:00Z`).getTime();
  const payee = f.payee.trim().toLowerCase();
  return recorded
    .filter((e) => {
      if (Math.abs((Number(e.amount) || 0) - amount) >= 0.005) return false;
      const sameWho = (payee !== '' && e.payee?.trim().toLowerCase() === payee) || (f.category !== '' && e.category === f.category);
      if (!sameWho) return false;
      const d = new Date(`${dateOnly(e.expense_date)}T00:00:00Z`).getTime();
      return Math.abs(d - when) <= windowDays * DAY;
    })
    .slice(0, 3);
}

/** A bank or cash account the form can offer as "paid from". */
export interface PayFromAccount {
  accountId: string;
  is_cash: boolean;
}

/** A bank or cash account an expense can be paid from, as the pickers show it. */
export interface PayFromOption extends PayFromAccount {
  name: string;
  code: string;
}

/** The active bank and cash accounts from `GET /finance/bank-accounts`. */
export function payFromOptions(rows: any[]): PayFromOption[] {
  return rows
    .filter((b) => !b.deletedAt && b.isActive !== false)
    .map((b) => ({ accountId: b.accountId as string, is_cash: Boolean(b.is_cash), name: (b.account?.name ?? b.bank_name ?? 'Account') as string, code: (b.account?.account_code ?? '') as string }));
}

const PAY_FROM_KEY = 'mercon.expense.payFrom';

/** The "paid from" account last used per payment method, remembered in this browser. */
export function lastPayFrom(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(PAY_FROM_KEY) || '{}');
  } catch {
    return {}; // private mode: no memory
  }
}

export function rememberPayFrom(method: string, accountId: string) {
  try {
    localStorage.setItem(PAY_FROM_KEY, JSON.stringify({ ...lastPayFrom(), [method]: accountId }));
  } catch {
    /* private mode */
  }
}

/**
 * The "paid from" account to suggest: the last one used for this method, else cash for cash
 * payments and the first bank account for the rest.
 */
export function suggestPayFrom(method: string, accounts: PayFromAccount[], lastUsed: Record<string, string>): string {
  if (accounts.length === 0) return '';
  const remembered = lastUsed[method];
  if (remembered && accounts.some((a) => a.accountId === remembered)) return remembered;
  const wantCash = method === 'Cash';
  return (accounts.find((a) => a.is_cash === wantCash) ?? accounts[0]).accountId;
}

/** What the expense is charged to, as the "What it's for" choice shows it. */
export type ExpenseFor = ExpenseLinkKind;
const FOR_ORDER: ExpenseFor[] = ['trip', 'vehicle', 'driver', 'company'];

/** The choices a category offers, in display order. */
export const forOptions = (category: string): ExpenseFor[] => {
  const a = allowedLinks(category);
  return FOR_ORDER.filter((k) => a[k]);
};

/** The choice a newly picked category starts on: pay goes to a driver, truck costs to a trip or truck. */
export function defaultFor(category: string): ExpenseFor {
  const options = forOptions(category);
  const rule = expenseCategoryRule(category);
  if (['Salary', 'Salary Advance'].includes(category.trim()) && options.includes('driver')) return 'driver';
  if (rule.needsTruckWhenPaid) return options.includes('trip') ? 'trip' : 'vehicle';
  if (options.length === FOR_ORDER.length) return 'company'; // Other / custom: overhead unless said otherwise
  return options[0] ?? 'company';
}

/** The choice a saved form is on. */
export const forOf = (f: Pick<ExpenseForm, 'trip_id' | 'vehicle_id' | 'driver_id'>): ExpenseFor | null =>
  f.trip_id ? 'trip' : f.vehicle_id ? 'vehicle' : f.driver_id ? 'driver' : null;

/**
 * Links kept when switching what the expense is for: a truck may keep its driver (e.g. a
 * government fee for both), everything else starts empty.
 */
export function linksFor(f: Pick<ExpenseForm, 'trip_id' | 'vehicle_id' | 'driver_id'>, kind: ExpenseFor): Pick<ExpenseForm, 'trip_id' | 'vehicle_id' | 'driver_id'> {
  if (kind === 'trip') return { trip_id: f.trip_id, vehicle_id: '', driver_id: '' };
  if (kind === 'vehicle') return { trip_id: '', vehicle_id: f.vehicle_id, driver_id: f.trip_id ? '' : f.driver_id };
  if (kind === 'driver') return { trip_id: '', vehicle_id: '', driver_id: f.trip_id ? '' : f.driver_id };
  return { trip_id: '', vehicle_id: '', driver_id: '' };
}

/** Saudi standard VAT rate. */
export const STANDARD_VAT_RATE = 15;

/** The VAT inside a VAT-inclusive amount at the standard rate (15/115 of it). */
export function vatInside(amount: number, rate = STANDARD_VAT_RATE): number {
  if (!(amount > 0)) return 0;
  return Math.round(((amount * rate) / (100 + rate)) * 100) / 100;
}

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
  expense_date: string;
  payee: string;
  payment_method: string;
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
  expense_date: todayIso(),
  payee: '',
  payment_method: 'Bank Transfer',
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
    expense_date: duplicate ? todayIso() : dateOnly(e.expense_date) || todayIso(),
    payee: e.payee ?? '',
    payment_method: e.payment_method ?? '',
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

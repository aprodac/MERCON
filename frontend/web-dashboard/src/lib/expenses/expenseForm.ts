/**
 * The expense editor's form: its empty and loaded states, what blocks saving, and expenses that
 * look like the one being entered (same amount and category or payee, within a few days).
 */
import { EXPENSE_CATEGORIES, VEHICLE_REQUIRED_EXPENSE_CATEGORIES } from '@mercon/shared-types';
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
  vehicle_id: string;
  driver_id: string;
  bill_issued_date: string;
  bill_paid_date: string;
  description: string;
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
    vehicle_id: e.vehicleId ?? '',
    driver_id: e.driverId ?? '',
    bill_issued_date: duplicate ? '' : dateOnly(e.bill_issued_date),
    bill_paid_date: duplicate ? '' : dateOnly(e.bill_paid_date),
    description: e.description ?? '',
  };
}

/** What stops the expense being saved, in the order to fix it. */
export function expenseFormProblems(f: ExpenseForm): string[] {
  const out: string[] = [];
  if (!f.category.trim()) out.push('Choose a category.');
  if (!(Number(f.amount) > 0)) out.push('Enter an amount above zero.');
  if (f.status === 'Paid' && VEHICLE_REQUIRED_EXPENSE_CATEGORIES.includes(f.category) && !f.vehicle_id)
    out.push(`Choose the truck this ${f.category.toLowerCase()} cost is for; it counts in that truck's P&L.`);
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

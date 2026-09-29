/**
 * Contra entries (cash ⇄ bank, bank ⇄ bank): their types, colours, and the checks the new-contra
 * form runs. The type is never chosen; it follows from the two accounts, as the API reads it
 * (utils/contraEntries.ts).
 */
import type { Account } from '@mercon/shared-types';
import type { ChipTone } from '@/components/ui/chip';
import type { ContraType } from '@/services/financeService';

export const CONTRA_META: Record<ContraType, { label: string; short: string; tone: ChipTone; hint: string }> = {
  deposit: { label: 'Cash deposit', short: 'Deposit', tone: 'teal', hint: 'Cash taken to the bank' },
  withdrawal: { label: 'Cash withdrawal', short: 'Withdrawal', tone: 'orange', hint: 'Cash drawn from the bank' },
  bank_to_bank: { label: 'Bank to bank', short: 'Transfer', tone: 'info', hint: 'Between two bank accounts' },
  cash_to_cash: { label: 'Cash to cash', short: 'Cash move', tone: 'neutral', hint: 'Between two cash tills' },
};

/** Types shown as filters; cash-to-cash only when there's more than one till. */
export const CONTRA_FILTERS: ContraType[] = ['deposit', 'withdrawal', 'bank_to_bank'];

export function contraTypeOf(fromCash: boolean, toCash: boolean): ContraType {
  if (fromCash && !toCash) return 'deposit';
  if (!fromCash && toCash) return 'withdrawal';
  return fromCash ? 'cash_to_cash' : 'bank_to_bank';
}

/** Which side the bank's fee comes out of: the sending bank, or the receiving bank for a cash deposit. */
export const chargedSide = (fromCash: boolean): 'from' | 'to' => (fromCash ? 'to' : 'from');

export interface ContraDraft {
  fromId: string;
  toId: string;
  amount: number;
  charges: number;
  chargesAccountId: string;
  periodOpen: boolean;
}

/** What stops the contra being posted, in the order to fix it. */
export function contraProblems(d: ContraDraft): string[] {
  const out: string[] = [];
  if (!d.fromId || !d.toId) out.push('Choose both accounts.');
  else if (d.fromId === d.toId) out.push('The two accounts must be different.');
  if (!(d.amount > 0)) out.push('Enter an amount above zero.');
  if (d.charges < 0) out.push('Bank charges can’t be negative.');
  if (d.charges > 0 && !d.chargesAccountId) out.push('Choose the expense account for the bank charges.');
  if (!d.periodOpen) out.push('No open accounting period covers this date.');
  return out;
}

/** Balances after the entry: the source loses the amount (and the fee if it's the charged bank). */
export function balancesAfter(fromBalance: number, toBalance: number, amount: number, charges: number, fromCash: boolean) {
  const fee = charges > 0 ? charges : 0;
  const side = chargedSide(fromCash);
  return {
    from: fromBalance - amount - (side === 'from' ? fee : 0),
    to: toBalance + amount - (side === 'to' ? fee : 0),
  };
}

/** The expense account whose name fits bank charges best, else none. */
export function suggestChargesAccount(accounts: Account[]): string {
  const expense = accounts.filter((a) => a.account_type === 'Expense' && a.is_postable !== false && a.isActive !== false && !a.deletedAt);
  return (expense.find((a) => /bank\s*(charge|fee)/i.test(a.name)) ?? expense.find((a) => /charge|fee|commission/i.test(a.name)))?.id ?? '';
}

const LAST_CHARGES_KEY = 'mercon.contra.chargesAccount';
export function lastChargesAccount(): string {
  try {
    return localStorage.getItem(LAST_CHARGES_KEY) || '';
  } catch {
    return '';
  }
}
export function rememberChargesAccount(id: string) {
  try {
    localStorage.setItem(LAST_CHARGES_KEY, id);
  } catch {
    /* private mode */
  }
}

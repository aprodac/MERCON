/**
 * Driver pay settlement: the figures the settle sheet shows before anything posts. Mirrors the API
 * (utils/driverSettlementEngine.settlementPosting): gross trip pay, less advances recovered, = net.
 */
import type { Account } from '@mercon/shared-types';

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface SettleDraft {
  tripAmounts: number[];
  advances: { amount: number; remaining: number }[];
  paymentAccountId: string;
  driverPayAccountId: string;
  periodOpen: boolean;
}

export function settleTotals(d: Pick<SettleDraft, 'tripAmounts' | 'advances'>) {
  const gross = r2(d.tripAmounts.reduce((t, a) => t + a, 0));
  const deducted = r2(d.advances.reduce((t, a) => t + (a.amount > 0 ? a.amount : 0), 0));
  return { gross, deducted, net: r2(gross - deducted) };
}

/** What stops paying, in the order to fix it. */
export function settleProblems(d: SettleDraft): string[] {
  const { gross, deducted, net } = settleTotals(d);
  const out: string[] = [];
  if (!(gross > 0)) out.push('Choose at least one trip.');
  if (d.advances.some((a) => a.amount - a.remaining > 0.005)) out.push('An advance can’t be recovered for more than is left on it.');
  if (deducted - gross > 0.005) out.push('Advances recovered can’t be more than the trip pay.');
  if (net > 0.005 && !d.paymentAccountId) out.push('Choose the bank or cash account you paid from.');
  if (!d.driverPayAccountId) out.push('Choose the expense account driver pay posts to.');
  if (!d.periodOpen) out.push('No open accounting period covers the pay date.');
  return out;
}

/**
 * Recover advances oldest first, up to the trip pay: the usual deduction, which the user can change.
 */
export function suggestRecovery(gross: number, advances: { remaining: number }[]): number[] {
  let left = gross;
  return advances.map((a) => {
    const take = r2(Math.max(0, Math.min(a.remaining, left)));
    left = r2(left - take);
    return take;
  });
}

/** The expense account whose name fits driver trip pay best, else none. */
export function suggestDriverPayAccount(accounts: Account[]): string {
  const expense = accounts.filter((a) => a.account_type === 'Expense' && a.is_postable !== false && a.isActive !== false && !a.deletedAt);
  return (
    expense.find((a) => /driver.*(trip|pay)|trip\s*pay/i.test(a.name)) ??
    expense.find((a) => /driver/i.test(a.name)) ??
    expense.find((a) => /wage|salar/i.test(a.name))
  )?.id ?? '';
}

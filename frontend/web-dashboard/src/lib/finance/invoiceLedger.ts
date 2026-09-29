/**
 * The accounts issuing an invoice posts to, what's missing before an invoice can be issued, and
 * which account from the chart to suggest for each. The API checks the same slots and types
 * (updateInvoiceLedgerSetup, invoiceEngine.issueInvoice).
 */
import type { Account, AccountType } from '@mercon/shared-types';
import type { InvoiceLedgerSetup } from '@/services/financeService';

export type LedgerSlot = keyof InvoiceLedgerSetup;

export const LEDGER_SLOTS: LedgerSlot[] = ['receivable_account_id', 'revenue_account_id', 'vat_output_account_id'];

export const SLOT_META: Record<LedgerSlot, { label: string; type: AccountType; side: 'Dr' | 'Cr'; hint: RegExp }> = {
  receivable_account_id: { label: 'Accounts receivable', type: 'Asset', side: 'Dr', hint: /receivable/i },
  revenue_account_id: { label: 'Revenue', type: 'Revenue', side: 'Cr', hint: /freight|revenue|sales/i },
  vat_output_account_id: { label: 'VAT output', type: 'Liability', side: 'Cr', hint: /vat|tax/i },
};

/** Slots an invoice can't be issued without: receivable and revenue always, VAT output when it carries VAT. */
export function ledgerGaps(setup: InvoiceLedgerSetup | null | undefined, hasVat: boolean): LedgerSlot[] {
  if (!setup) return [];
  return LEDGER_SLOTS.filter((slot) => (slot !== 'vat_output_account_id' || hasVat) && !setup[slot]);
}

/** Active, postable accounts of the slot's type. */
export const slotAccounts = (slot: LedgerSlot, accounts: Account[]): Account[] =>
  accounts.filter((a) => a.account_type === SLOT_META[slot].type && a.is_postable !== false && a.isActive !== false && !a.deletedAt);

/** The account whose name fits the slot best (e.g. "VAT output payable" for VAT), else none. */
export function suggestAccount(slot: LedgerSlot, accounts: Account[]): string {
  const hint = SLOT_META[slot].hint;
  const fits = slotAccounts(slot, accounts).filter((a) => hint.test(a.name));
  // "VAT output" beats "VAT input" for the output slot
  const best = slot === 'vat_output_account_id' ? fits.find((a) => /output|payable/i.test(a.name)) ?? fits.find((a) => !/input|receivable/i.test(a.name)) : fits[0];
  return best?.id ?? '';
}

import { describe, expect, it } from 'vitest';
import type { Account } from '@mercon/shared-types';
import { ledgerGaps, slotAccounts, suggestAccount } from './invoiceLedger';

const acc = (id: string, name: string, account_type: Account['account_type'], extra: Partial<Account> = {}): Account =>
  ({ id, name, account_type, account_code: id, is_postable: true, isActive: true, ...extra }) as Account;

const chart = [
  acc('1200', 'Accounts Receivable', 'Asset'),
  acc('1100', 'Cash', 'Asset'),
  acc('2310', 'VAT Input Recoverable', 'Liability'),
  acc('2300', 'VAT Output Payable', 'Liability'),
  acc('2000', 'Accounts Payable', 'Liability'),
  acc('4010', 'Freight Revenue', 'Revenue'),
  acc('4999', 'Old Revenue', 'Revenue', { isActive: false }),
];

describe('invoice ledger setup', () => {
  it('needs VAT output only when the invoice carries VAT', () => {
    const setup = { receivable_account_id: 'a', revenue_account_id: 'r', vat_output_account_id: null };
    expect(ledgerGaps(setup, false)).toEqual([]);
    expect(ledgerGaps(setup, true)).toEqual(['vat_output_account_id']);
    expect(ledgerGaps({ receivable_account_id: null, revenue_account_id: null, vat_output_account_id: null }, true)).toHaveLength(3);
    expect(ledgerGaps(undefined, true)).toEqual([]);
  });

  it('offers only active accounts of the right type', () => {
    expect(slotAccounts('revenue_account_id', chart).map((a) => a.id)).toEqual(['4010']);
    expect(slotAccounts('vat_output_account_id', chart).map((a) => a.id)).toEqual(['2310', '2300', '2000']);
  });

  it('suggests the account whose name fits', () => {
    expect(suggestAccount('receivable_account_id', chart)).toBe('1200');
    expect(suggestAccount('revenue_account_id', chart)).toBe('4010');
    expect(suggestAccount('vat_output_account_id', chart)).toBe('2300');
    expect(suggestAccount('vat_output_account_id', [acc('2000', 'Accounts Payable', 'Liability')])).toBe('');
  });
});

describe('VAT input account', () => {
  it('is offered from assets and liabilities, suggested by name, and never blocks invoices', () => {
    expect(slotAccounts('vat_input_account_id', chart).map((a) => a.id)).toEqual(['1200', '1100', '2310', '2300', '2000']);
    expect(suggestAccount('vat_input_account_id', chart)).toBe('2310');
    expect(ledgerGaps({ receivable_account_id: 'a', revenue_account_id: 'r', vat_output_account_id: 'v', vat_input_account_id: null }, true)).toEqual([]);
  });
});

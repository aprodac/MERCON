import { describe, expect, it } from 'vitest';
import type { Account } from '@mercon/shared-types';
import { balancesAfter, contraProblems, contraTypeOf, suggestChargesAccount } from './contra';

const ok = { fromId: 'a', toId: 'b', amount: 100, charges: 0, chargesAccountId: '', periodOpen: true };

describe('contra entries', () => {
  it('reads the type from the two accounts', () => {
    expect(contraTypeOf(true, false)).toBe('deposit');
    expect(contraTypeOf(false, true)).toBe('withdrawal');
    expect(contraTypeOf(false, false)).toBe('bank_to_bank');
    expect(contraTypeOf(true, true)).toBe('cash_to_cash');
  });

  it('lists what stops posting', () => {
    expect(contraProblems(ok)).toEqual([]);
    expect(contraProblems({ ...ok, toId: 'a' })).toEqual(['The two accounts must be different.']);
    expect(contraProblems({ ...ok, amount: 0 })).toEqual(['Enter an amount above zero.']);
    expect(contraProblems({ ...ok, charges: 15 })).toEqual(['Choose the expense account for the bank charges.']);
    expect(contraProblems({ ...ok, periodOpen: false })).toEqual(['No open accounting period covers this date.']);
  });

  it('takes the fee from the sending bank, or the receiving bank on a cash deposit', () => {
    expect(balancesAfter(1000, 500, 200, 10, false)).toEqual({ from: 790, to: 700 });
    expect(balancesAfter(1000, 500, 200, 10, true)).toEqual({ from: 800, to: 690 });
    expect(balancesAfter(1000, 500, 200, 0, true)).toEqual({ from: 800, to: 700 });
  });

  it('suggests a bank charges expense account', () => {
    const acc = (id: string, name: string, account_type: Account['account_type']) => ({ id, name, account_type, is_postable: true, isActive: true }) as Account;
    expect(suggestChargesAccount([acc('1', 'Fuel', 'Expense'), acc('2', 'Bank Charges', 'Expense')])).toBe('2');
    expect(suggestChargesAccount([acc('1', 'Bank Charges', 'Liability')])).toBe('');
  });
});

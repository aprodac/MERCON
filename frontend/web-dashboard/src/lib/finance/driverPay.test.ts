import { describe, expect, it } from 'vitest';
import type { Account } from '@mercon/shared-types';
import { settleProblems, settleTotals, suggestDriverPayAccount, suggestRecovery } from './driverPay';

const ok = { tripAmounts: [300, 200], advances: [], paymentAccountId: 'bank', driverPayAccountId: 'exp', periodOpen: true };

describe('driver pay settlement', () => {
  it('nets advances off the trip pay', () => {
    expect(settleTotals({ tripAmounts: [300, 200], advances: [{ amount: 150, remaining: 400 }] })).toEqual({ gross: 500, deducted: 150, net: 350 });
  });

  it('recovers oldest advances first, never more than the pay', () => {
    expect(suggestRecovery(500, [{ remaining: 300 }, { remaining: 400 }])).toEqual([300, 200]);
    expect(suggestRecovery(100, [{ remaining: 300 }])).toEqual([100]);
    expect(suggestRecovery(0, [{ remaining: 300 }])).toEqual([0]);
  });

  it('lists what stops paying', () => {
    expect(settleProblems(ok)).toEqual([]);
    expect(settleProblems({ ...ok, tripAmounts: [] })[0]).toMatch(/at least one trip/);
    expect(settleProblems({ ...ok, advances: [{ amount: 600, remaining: 800 }] })).toContain('Advances recovered can’t be more than the trip pay.');
    expect(settleProblems({ ...ok, advances: [{ amount: 100, remaining: 50 }] })[0]).toMatch(/more than is left/);
    expect(settleProblems({ ...ok, paymentAccountId: '' })).toEqual(['Choose the bank or cash account you paid from.']);
    // Fully covered by advances: no bank needed
    expect(settleProblems({ ...ok, paymentAccountId: '', advances: [{ amount: 500, remaining: 500 }] })).toEqual([]);
  });

  it('suggests a driver pay account', () => {
    const acc = (id: string, name: string) => ({ id, name, account_type: 'Expense', is_postable: true, isActive: true }) as Account;
    expect(suggestDriverPayAccount([acc('1', 'Fuel'), acc('2', 'Driver Trip Pay')])).toBe('2');
    expect(suggestDriverPayAccount([acc('1', 'Fuel'), acc('3', 'Salaries and Wages')])).toBe('3');
    expect(suggestDriverPayAccount([acc('1', 'Fuel')])).toBe('');
  });
});

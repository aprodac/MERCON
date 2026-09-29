import { describe, expect, it } from 'vitest';
import type { Expense } from '@/services/expenseService';
import { emptyExpenseForm, expenseFormFrom, expenseFormProblems, likelyDuplicates } from './expenseForm';

const exp = (p: Partial<Expense>): Expense =>
  ({ id: 'e1', ref_id: 'EXP-001', category: 'Fuel', status: 'Paid', amount: 250, currency: 'SAR', expense_date: '2026-09-20T00:00:00.000Z', createdAt: '', updatedAt: '', ...p }) as Expense;

describe('expense form', () => {
  it('blocks saving without category or amount, and a paid fuel cost without its truck', () => {
    const f = { ...emptyExpenseForm(), category: 'Fuel', amount: '100' };
    expect(expenseFormProblems({ ...emptyExpenseForm() })).toEqual(['Choose a category.', 'Enter an amount above zero.']);
    expect(expenseFormProblems(f)[0]).toMatch(/truck/);
    expect(expenseFormProblems({ ...f, status: 'Pending' })).toEqual([]);
    expect(expenseFormProblems({ ...f, vehicle_id: 'v1' })).toEqual([]);
    expect(expenseFormProblems({ ...f, vehicle_id: 'v1', bill_issued_date: '2026-09-10', bill_paid_date: '2026-09-01' })).toHaveLength(1);
  });

  it('loads an expense, and a duplicate becomes a fresh paid one', () => {
    const e = exp({ status: 'Pending', category: 'Camel feed', bill_issued_date: '2026-09-18T00:00:00Z', payee: 'Farm' });
    expect(expenseFormFrom(e, false)).toMatchObject({ status: 'Pending', category: 'Camel feed', customCategory: true, amount: '250', expense_date: '2026-09-20', bill_issued_date: '2026-09-18' });
    const dup = expenseFormFrom(e, true);
    expect(dup).toMatchObject({ status: 'Paid', bill_issued_date: '', payee: 'Farm' });
    expect(dup.expense_date).not.toBe('2026-09-20');
  });

  it('flags the same amount for the same category or payee within 3 days', () => {
    const recorded = [
      exp({ id: 'a', amount: 250, expense_date: '2026-09-21T00:00:00Z' }),
      exp({ id: 'b', amount: 250, expense_date: '2026-09-30T00:00:00Z' }),
      exp({ id: 'c', amount: 251, expense_date: '2026-09-20T00:00:00Z' }),
      exp({ id: 'd', amount: 250, category: 'Rent', payee: 'SASCO', expense_date: '2026-09-19T00:00:00Z' }),
    ];
    const f = { ...emptyExpenseForm(), category: 'Fuel', amount: '250', expense_date: '2026-09-20', payee: 'sasco ' };
    expect(likelyDuplicates(f, recorded).map((e) => e.id)).toEqual(['a', 'd']);
    expect(likelyDuplicates({ ...f, amount: '' }, recorded)).toEqual([]);
  });
});

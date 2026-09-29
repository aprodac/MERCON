import { describe, expect, it } from 'vitest';
import { EXPENSE_CATEGORIES, expenseLinkProblem } from '@mercon/shared-types';
import type { Expense } from '@/services/expenseService';
import { allowedLinks, emptyExpenseForm, expenseFormFrom, expenseFormProblems, fitLinksToCategory, likelyDuplicates } from './expenseForm';

const exp = (p: Partial<Expense>): Expense =>
  ({ id: 'e1', ref_id: 'EXP-001', category: 'Fuel', status: 'Paid', amount: 250, currency: 'SAR', expense_date: '2026-09-20T00:00:00.000Z', createdAt: '', updatedAt: '', ...p }) as Expense;

describe('category link rules (shared with the API)', () => {
  it('fuel needs a trip or a truck once paid; a trip brings its truck', () => {
    expect(expenseLinkProblem({ category: 'Fuel', status: 'Paid' })).toMatch(/trip or truck/);
    expect(expenseLinkProblem({ category: 'Fuel', status: 'Pending' })).toBeNull();
    expect(expenseLinkProblem({ category: 'Fuel', status: 'Paid', vehicleId: 'v' })).toBeNull();
    expect(expenseLinkProblem({ category: 'Fuel', status: 'Paid', tripId: 't', vehicleId: 'v', driverId: 'd' })).toBeNull();
    expect(expenseLinkProblem({ category: 'Fuel', status: 'Paid', driverId: 'd', vehicleId: 'v' })).toMatch(/driver/);
  });

  it('keeps each category to what it can be charged to', () => {
    expect(expenseLinkProblem({ category: 'Tyres', status: 'Paid', tripId: 't', vehicleId: 'v' })).toMatch(/trip/);
    expect(expenseLinkProblem({ category: 'Rent', status: 'Paid', vehicleId: 'v' })).toMatch(/truck/);
    expect(expenseLinkProblem({ category: 'Salary', status: 'Paid', driverId: 'd' })).toBeNull();
    expect(expenseLinkProblem({ category: 'Salary', status: 'Paid', vehicleId: 'v' })).toMatch(/truck/);
    expect(expenseLinkProblem({ category: 'Government Fees', status: 'Paid', driverId: 'd' })).toBeNull();
    // Custom categories may go anywhere
    expect(expenseLinkProblem({ category: 'Camel feed', status: 'Paid', tripId: 't' })).toBeNull();
  });

  it('never allows a subcontracted trip', () => {
    expect(expenseLinkProblem({ category: 'Other', status: 'Paid', tripId: 't', tripIsThirdParty: true })).toMatch(/subcontractor/);
  });

  it('no longer offers salary advance as a category', () => {
    expect(EXPENSE_CATEGORIES as readonly string[]).not.toContain('Salary Advance');
  });
});

describe('expense form', () => {
  it('blocks saving without category or amount, and a paid fuel cost without a trip or truck', () => {
    const f = { ...emptyExpenseForm(), category: 'Fuel', amount: '100' };
    expect(expenseFormProblems({ ...emptyExpenseForm() })).toEqual(['Choose a category.', 'Enter an amount above zero.']);
    expect(expenseFormProblems(f)[0]).toMatch(/truck/);
    expect(expenseFormProblems({ ...f, status: 'Pending' })).toEqual([]);
    expect(expenseFormProblems({ ...f, vehicle_id: 'v1' })).toEqual([]);
    // With a trip, its truck counts
    expect(expenseFormProblems({ ...f, trip_id: 't1' }, { id: 't1', vehicleId: 'v1', driverId: 'd1' })).toEqual([]);
    expect(expenseFormProblems({ ...f, trip_id: 't1' }, { id: 't1', is_third_party: true })[0]).toMatch(/subcontractor/);
    expect(expenseFormProblems({ ...f, vehicle_id: 'v1', bill_issued_date: '2026-09-10', bill_paid_date: '2026-09-01' })).toHaveLength(1);
  });

  it('drops links a new category cannot carry', () => {
    const f = { ...emptyExpenseForm(), category: 'Fuel', vehicle_id: 'v1', driver_id: 'd1' };
    expect(fitLinksToCategory(f, 'Rent')).toEqual({ trip_id: '', vehicle_id: '', driver_id: '' });
    expect(fitLinksToCategory(f, 'Tyres')).toEqual({ trip_id: '', vehicle_id: 'v1', driver_id: '' });
    expect(fitLinksToCategory({ ...f, trip_id: 't1' }, 'Toll & Parking').trip_id).toBe('t1');
    expect(allowedLinks('Salary')).toEqual({ trip: false, vehicle: false, driver: true, company: true });
  });

  it('loads an expense, and a duplicate becomes a fresh paid one without the trip', () => {
    const e = exp({ status: 'Pending', category: 'Camel feed', bill_issued_date: '2026-09-18T00:00:00Z', payee: 'Farm', tripId: 't1', vehicleId: 'v1' });
    expect(expenseFormFrom(e, false)).toMatchObject({ status: 'Pending', category: 'Camel feed', customCategory: true, amount: '250', expense_date: '2026-09-20', bill_issued_date: '2026-09-18', trip_id: 't1' });
    const dup = expenseFormFrom(e, true);
    expect(dup).toMatchObject({ status: 'Paid', bill_issued_date: '', payee: 'Farm', trip_id: '', vehicle_id: 'v1' });
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

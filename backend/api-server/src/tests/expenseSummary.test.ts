import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExpenseWhere, expenseOrderBy, filterDate, previousRange, summarizeExpenses, type SummaryRow } from '../utils/expenseSummary';

const row = (p: Partial<SummaryRow>): SummaryRow => ({
  amount: '0',
  status: 'Paid',
  category: 'Fuel',
  expense_date: '2026-09-10T00:00:00Z',
  vehicleId: null,
  driverId: null,
  payee: null,
  ...p,
});

test('summarizeExpenses: totals, pending, categories, links and payees', () => {
  const s = summarizeExpenses([
    row({ amount: '1000.10', category: 'Fuel', vehicleId: 'v1', tripId: 't1', payee: 'Aldrees' }),
    row({ amount: 500, category: 'Fuel', vehicleId: 'v2', payee: 'aldrees ', status: 'Pending' }),
    row({ amount: '3000', category: 'Salary', driverId: 'd1' }),
    row({ amount: 250.45, category: 'Rent', payee: 'Landlord', expense_date: '2026-07-01T00:00:00Z' }),
  ]);
  assert.equal(s.count, 4);
  assert.equal(s.total, 4750.55);
  assert.equal(s.paid, 4250.55);
  assert.equal(s.pending, 500);
  assert.equal(s.pending_count, 1);
  assert.deepEqual(s.by_category.map((c) => [c.category, c.amount, c.count]), [['Salary', 3000, 1], ['Fuel', 1500.1, 2], ['Rent', 250.45, 1]]);
  assert.deepEqual(s.linked, { trip: 1000.1, vehicle: 500, driver: 3000, overhead: 250.45 });
  // Payees are matched case- and space-insensitively
  assert.deepEqual(s.top_payees[0], { payee: 'Aldrees', amount: 1500.1, count: 2 });
  // Months without spend inside the data span are filled with zero
  assert.deepEqual(s.by_month.map((m) => [m.month, m.amount]), [['2026-07', 250.45], ['2026-08', 0], ['2026-09', 4500.1]]);
  assert.equal(s.previous_total, null);
});

test('summarizeExpenses: months follow the requested range; empty input is all zeros', () => {
  const s = summarizeExpenses([], { from: new Date('2026-01-15T00:00:00Z'), to: new Date('2026-03-31T23:59:59Z') }, 1234.567);
  assert.deepEqual(s.by_month.map((m) => m.month), ['2026-01', '2026-02', '2026-03']);
  assert.equal(s.total, 0);
  assert.equal(s.previous_total, 1234.57);
});

test('filterDate / previousRange: a date-only upper bound covers the whole day', () => {
  assert.equal(filterDate('2026-09-30', true)?.toISOString(), '2026-09-30T23:59:59.999Z');
  assert.equal(filterDate('2026-09-01')?.toISOString(), '2026-09-01T00:00:00.000Z');
  assert.equal(filterDate('not a date'), undefined);
  assert.equal(filterDate('all'), undefined);
  const p = previousRange(new Date('2026-09-01T00:00:00.000Z'), new Date('2026-09-30T23:59:59.999Z'));
  assert.equal(p.to.toISOString(), '2026-08-31T23:59:59.999Z');
  assert.equal(p.from.toISOString(), '2026-08-02T00:00:00.000Z');
});

test('buildExpenseWhere: filters, link kinds and "all" values', () => {
  assert.deepEqual(buildExpenseWhere({ category: 'all', status: '' }), { deletedAt: null });
  assert.deepEqual(buildExpenseWhere({ category: 'Fuel', status: 'Pending', payment_method: 'Cash' }), {
    deletedAt: null,
    category: 'Fuel',
    status: 'Pending',
    payment_method: 'Cash',
  });
  assert.deepEqual(buildExpenseWhere({ linked: 'overhead' }), { deletedAt: null, vehicleId: null, driverId: null, tripId: null });
  assert.deepEqual(buildExpenseWhere({ linked: 'trip' }), { deletedAt: null, tripId: { not: null } });
  assert.deepEqual(buildExpenseWhere({ trip_id: 't9' }), { deletedAt: null, tripId: 't9' });
  assert.deepEqual(buildExpenseWhere({ linked: 'vehicle' }), { deletedAt: null, vehicleId: { not: null }, tripId: null });
  const dated = buildExpenseWhere({ date_from: '2026-09-01', date_to: '2026-09-30' }) as any;
  assert.equal(dated.expense_date.lte.toISOString(), '2026-09-30T23:59:59.999Z');
  assert.equal((buildExpenseWhere({ date_from: '2026-09-01' }, { withDates: false }) as any).expense_date, undefined);
});

test('expenseOrderBy: newest first by default', () => {
  assert.deepEqual(expenseOrderBy(undefined)[0], { expense_date: 'desc' });
  assert.deepEqual(expenseOrderBy('amount_desc')[0], { amount: 'desc' });
});

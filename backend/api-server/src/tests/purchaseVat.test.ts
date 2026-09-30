import test from 'node:test';
import assert from 'node:assert/strict';
import { planExpenseEntries, EXPENSE_PAYMENT_SOURCE } from '../utils/expenseLedger';

const base = {
  ref_id: 'EXP-1',
  category: 'Fuel',
  status: 'Paid',
  amount: 115,
  vat_amount: 15,
  expense_date: new Date('2026-09-10T00:00:00Z'),
  bill_paid_date: null,
  payee: 'Aldrees',
  paymentAccountId: 'BANK',
};
const setup = { expenseAccountId: 'FUEL', payableAccountId: 'AP', vatInputAccountId: 'VATIN' };
const rows = (lines: { accountId: string; debit: number; credit: number }[]) => lines.map((l) => [l.accountId, l.debit, l.credit]);

test('an expense with VAT costs the net amount; the VAT goes to VAT input', () => {
  const p = planExpenseEntries(base, setup, null);
  assert.equal(p.problem, null);
  assert.deepEqual(rows(p.entries[0].lines), [['FUEL', 100, 0], ['VATIN', 15, 0], ['BANK', 0, 115]]);
});

test('to pay with VAT: payables carry the full amount, and paying clears the full amount', () => {
  const pending = planExpenseEntries({ ...base, status: 'Pending', paymentAccountId: null }, setup, null);
  assert.deepEqual(rows(pending.entries[0].lines), [['FUEL', 100, 0], ['VATIN', 15, 0], ['AP', 0, 115]]);
  const paid = planExpenseEntries({ ...base, bill_paid_date: new Date('2026-09-20T00:00:00Z') }, setup, { day: '2026-09-10', lines: pending.entries[0].lines });
  const payment = paid.entries.find((e) => e.source === EXPENSE_PAYMENT_SOURCE)!;
  assert.deepEqual(rows(payment.lines), [['AP', 115, 0], ['BANK', 0, 115]]);
});

test('no VAT posts exactly as before', () => {
  const p = planExpenseEntries({ ...base, amount: 100, vat_amount: 0 }, { ...setup, vatInputAccountId: null }, null);
  assert.deepEqual(rows(p.entries[0].lines), [['FUEL', 100, 0], ['BANK', 0, 100]]);
});

test('VAT without a VAT input account, or VAT not below the amount, is reported', () => {
  assert.match(planExpenseEntries(base, { ...setup, vatInputAccountId: null }, null).problem ?? '', /VAT input account/);
  assert.match(planExpenseEntries({ ...base, vat_amount: 115 }, setup, null).problem ?? '', /less than the amount/);
});

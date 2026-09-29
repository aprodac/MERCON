import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../db';
import { Prisma } from '@prisma/client';
import { expenseAccountFor, planExpenseEntries, syncExpenseLedger, EXPENSE_SOURCE, EXPENSE_PAYMENT_SOURCE } from '../utils/expenseLedger';

const base = {
  ref_id: 'EXP-1',
  category: 'Fuel',
  status: 'Paid',
  amount: 100,
  expense_date: new Date('2026-09-10T00:00:00Z'),
  bill_paid_date: null,
  payee: 'Aldrees',
  paymentAccountId: 'BANK',
};
const setup = { expenseAccountId: 'FUEL', payableAccountId: 'AP' };

test('plan: paid expense is Dr expense / Cr bank on its date', () => {
  const p = planExpenseEntries(base, setup, null);
  assert.equal(p.problem, null);
  assert.equal(p.entries.length, 1);
  assert.equal(p.entries[0].source, EXPENSE_SOURCE);
  assert.equal(p.entries[0].day, '2026-09-10');
  assert.deepEqual(p.entries[0].lines.map((l) => [l.accountId, l.debit, l.credit]), [['FUEL', 100, 0], ['BANK', 0, 100]]);
});

test('plan: to-pay goes to payables; paid later clears them on the paid date', () => {
  const pending = planExpenseEntries({ ...base, status: 'Pending', paymentAccountId: null }, setup, null);
  assert.deepEqual(pending.entries[0].lines.map((l) => [l.accountId, l.debit, l.credit]), [['FUEL', 100, 0], ['AP', 0, 100]]);
  const incurred = { day: '2026-09-10', lines: pending.entries[0].lines };
  const paid = planExpenseEntries({ ...base, bill_paid_date: new Date('2026-09-25T00:00:00Z') }, setup, incurred);
  assert.deepEqual(paid.entries.map((e) => e.source), [EXPENSE_SOURCE, EXPENSE_PAYMENT_SOURCE]);
  assert.equal(paid.entries[1].day, '2026-09-25');
  assert.deepEqual(paid.entries[1].lines.map((l) => [l.accountId, l.debit, l.credit]), [['AP', 100, 0], ['BANK', 0, 100]]);
});

test('plan: set-up gaps are reported, not guessed', () => {
  assert.match(planExpenseEntries(base, { ...setup, expenseAccountId: null }, null).problem ?? '', /No expense account/);
  assert.match(planExpenseEntries({ ...base, paymentAccountId: null }, setup, null).problem ?? '', /paid from/);
  assert.match(planExpenseEntries({ ...base, status: 'Pending' }, { ...setup, payableAccountId: null }, null).problem ?? '', /payable/);
  assert.equal(planExpenseEntries({ ...base, amount: 0 }, setup, null).entries.length, 0);
  assert.equal(expenseAccountFor('Fuel', { Fuel: 'F' }, 'D'), 'F');
  assert.equal(expenseAccountFor('Rent', { Fuel: 'F' }, 'D'), 'D');
});

test('sync against the database: post, change, to pay → paid, delete', async (t) => {
  const ts = Date.now();
  const mk = (code: string, name: string, type: 'Asset' | 'Liability' | 'Expense') =>
    prisma.account.create({ data: { account_code: `T-${code}-${ts}`, name, account_type: type, is_postable: true } });
  const fuel = await mk('FUEL', 'Fuel (test)', 'Expense');
  const other = await mk('OTH', 'Other costs (test)', 'Expense');
  const bankGl = await mk('BANK', 'Bank (test)', 'Asset');
  const ap = await mk('AP', 'Payables (test)', 'Liability');
  const bank = await prisma.bankAccount.create({ data: { accountId: bankGl.id, bank_name: 'Test bank' } });
  // Reuse an open period covering the test date when the database has one (start/end are unique).
  const day = new Date('2026-09-10T00:00:00Z');
  const existing = await prisma.accountingPeriod.findFirst({ where: { status: 'Open', start_date: { lte: day }, end_date: { gte: day } } });
  const period = existing ?? (await prisma.accountingPeriod.create({ data: { name: `Test ${ts}`, start_date: new Date('2026-09-01T00:00:00Z'), end_date: new Date('2026-09-30T23:59:59Z'), status: 'Open' } as any }));
  const before = await prisma.settings.findUnique({ where: { id: 'singleton' } });
  await prisma.settings.update({ where: { id: 'singleton' }, data: { defaultExpenseAccountId: other.id, expenseAccountMap: { Fuel: fuel.id }, defaultPayableAccountId: ap.id } });
  const exp = await prisma.expense.create({
    data: { ref_id: `EXP-T-${ts}`, category: 'Fuel', status: 'Paid', amount: 250, expense_date: new Date('2026-09-10T00:00:00Z'), paymentAccountId: bankGl.id },
  });

  t.after(async () => {
    const jes = await prisma.journalEntry.findMany({ where: { source_id: exp.id }, select: { id: true } });
    await prisma.journalEntry.updateMany({ where: { id: { in: jes.map((j) => j.id) } }, data: { reversalOfId: null } });
    await prisma.journalLine.deleteMany({ where: { journalEntryId: { in: jes.map((j) => j.id) } } });
    await prisma.journalEntry.deleteMany({ where: { id: { in: jes.map((j) => j.id) } } });
    await prisma.expense.deleteMany({ where: { id: exp.id } });
    await prisma.bankAccount.delete({ where: { id: bank.id } });
    if (!existing) await prisma.accountingPeriod.delete({ where: { id: period.id } });
    await prisma.account.deleteMany({ where: { id: { in: [fuel.id, other.id, bankGl.id, ap.id] } } });
    await prisma.settings.update({
      where: { id: 'singleton' },
      data: { defaultExpenseAccountId: before?.defaultExpenseAccountId ?? null, expenseAccountMap: (before?.expenseAccountMap as any) ?? Prisma.DbNull, defaultPayableAccountId: before?.defaultPayableAccountId ?? null },
    });
  });

  const lines = async () =>
    (await prisma.journalLine.findMany({ where: { journalEntry: { source_id: exp.id, status: 'Posted', reversalOfId: null } }, include: { account: true } }))
      .map((l) => `${l.account.name}:${Number(l.debit)}/${Number(l.credit)}`)
      .sort();

  const first = await syncExpenseLedger(exp.id);
  assert.equal(first.problem, null);
  assert.equal(first.entries.length, 1);
  assert.deepEqual(await lines(), ['Bank (test):0/250', 'Fuel (test):250/0']);

  // Unchanged: nothing reposted
  const again = await syncExpenseLedger(exp.id);
  assert.equal(again.entries[0].id, first.entries[0].id);

  // Amount and category change: the old entry is reversed and a new one posted
  await prisma.expense.update({ where: { id: exp.id }, data: { amount: 300, category: 'Car wash' } });
  const changed = await syncExpenseLedger(exp.id);
  assert.notEqual(changed.entries[0].id, first.entries[0].id);
  assert.deepEqual(await lines(), ['Bank (test):0/300', 'Other costs (test):300/0']);
  assert.equal((await prisma.journalEntry.findUnique({ where: { id: first.entries[0].id } }))?.status, 'Voided');

  // To pay, then paid: payable entry stays, a payment entry clears it
  await prisma.expense.update({ where: { id: exp.id }, data: { status: 'Pending' } });
  await syncExpenseLedger(exp.id);
  assert.deepEqual(await lines(), ['Other costs (test):300/0', 'Payables (test):0/300']);
  await prisma.expense.update({ where: { id: exp.id }, data: { status: 'Paid', bill_paid_date: new Date('2026-09-20T00:00:00Z') } });
  const paid = await syncExpenseLedger(exp.id);
  assert.equal(paid.problem, null);
  assert.deepEqual(paid.entries.map((e) => e.source).sort(), [EXPENSE_SOURCE, EXPENSE_PAYMENT_SOURCE].sort());
  assert.deepEqual(await lines(), ['Bank (test):0/300', 'Other costs (test):300/0', 'Payables (test):0/300', 'Payables (test):300/0']);

  // Deleted: everything reversed
  await prisma.expense.delete({ where: { id: exp.id } });
  const gone = await syncExpenseLedger(exp.id);
  assert.equal(gone.entries.length, 0);
  assert.deepEqual(await lines(), []);
});

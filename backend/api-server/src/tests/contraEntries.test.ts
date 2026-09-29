import test from 'node:test';
import assert from 'node:assert/strict';
import { readContra, type BankLookup } from '../utils/contraEntries';

const banks = new Map<string, BankLookup>([
  ['gl-cash', { id: 'ba-cash', accountId: 'gl-cash', is_cash: true, bank_name: 'Petty cash' }],
  ['gl-rajhi', { id: 'ba-rajhi', accountId: 'gl-rajhi', is_cash: false, bank_name: 'Al Rajhi' }],
  ['gl-snb', { id: 'ba-snb', accountId: 'gl-snb', is_cash: false, bank_name: 'SNB' }],
]);
const line = (accountId: string, debit: number, credit: number) => ({ accountId, debit, credit, account: { account_code: accountId, name: accountId } });

test('a cash deposit: cash to bank', () => {
  const c = readContra([line('gl-rajhi', 15000, 0), line('gl-cash', 0, 15000)], banks);
  assert.equal(c.type, 'deposit');
  assert.equal(c.from?.bank_account_id, 'ba-cash');
  assert.equal(c.to?.name, 'Al Rajhi');
  assert.equal(c.amount, 15000);
  assert.equal(c.charges, 0);
});

test('a withdrawal and a bank-to-bank transfer', () => {
  assert.equal(readContra([line('gl-cash', 500, 0), line('gl-snb', 0, 500)], banks).type, 'withdrawal');
  assert.equal(readContra([line('gl-rajhi', 500, 0), line('gl-snb', 0, 500)], banks).type, 'bank_to_bank');
});

test('bank charges on a transfer are split out of the amount', () => {
  const c = readContra([line('gl-rajhi', 60000, 0), line('gl-snb', 0, 60000), line('gl-fees', 15, 0), line('gl-snb', 0, 15)], banks);
  assert.equal(c.type, 'bank_to_bank');
  assert.equal(c.amount, 60000);
  assert.equal(c.charges, 15);
  assert.equal(c.from?.bank_account_id, 'ba-snb');
});

test('a deposit whose fee the receiving bank took still reads cash as the source', () => {
  const c = readContra([line('gl-rajhi', 1000, 0), line('gl-cash', 0, 1000), line('gl-fees', 5, 0), line('gl-rajhi', 0, 5)], banks);
  assert.equal(c.type, 'deposit');
  assert.equal(c.from?.bank_account_id, 'ba-cash');
  assert.equal(c.charges, 5);
});

test('an old transfer between accounts that are not bank accounts still reads', () => {
  const c = readContra([line('gl-x', 100, 0), line('gl-y', 0, 100)], banks);
  assert.equal(c.amount, 100);
  assert.equal(c.from?.bank_account_id, null);
  assert.equal(c.type, 'bank_to_bank');
});

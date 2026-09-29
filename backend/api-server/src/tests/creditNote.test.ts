import test from 'node:test';
import assert from 'node:assert/strict';
import { creditNoteFigures, statusForBalance } from '../utils/creditNoteEngine';

test('VAT is worked out per line and totalled', () => {
  const f = creditNoteFigures([
    { description: 'Trip TRP-0199 cancelled', amount: 1000, tax_rate: 15 },
    { description: 'International leg', amount: 500, tax_rate: 0 },
  ]);
  assert.equal(f.subtotal, 1500);
  assert.equal(f.tax, 150);
  assert.equal(f.total, 1650);
  assert.equal(f.lines[1].tax_amount, 0);
});

test('rejects empty, zero and badly rated lines', () => {
  assert.throws(() => creditNoteFigures([]), /at least one line/);
  assert.throws(() => creditNoteFigures([{ description: 'x', amount: 0, tax_rate: 15 }]), /above zero/);
  assert.throws(() => creditNoteFigures([{ description: ' ', amount: 10, tax_rate: 15 }]), /description/);
  assert.throws(() => creditNoteFigures([{ description: 'x', amount: 10, tax_rate: 120 }]), /VAT rate/);
});

test('the invoice status follows its balance', () => {
  assert.equal(statusForBalance(0, 0, 1650), 'Paid');
  assert.equal(statusForBalance(500, 0, 1150), 'PartiallyPaid');
  assert.equal(statusForBalance(500, 0, 0), 'Issued');
  assert.equal(statusForBalance(500, 200, 0), 'PartiallyPaid');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { invoiceTotals, lineAmounts } from '../utils/invoiceMath';

test('invoice arithmetic', async (t) => {
  await t.test('a line is quantity × rate less its discount, with VAT on the net amount', () => {
    assert.deepEqual(lineAmounts({ quantity: 2, rate: 1500, discount_pct: 10, tax_rate: 15 }), {
      quantity: 2, rate: 1500, discount_pct: 10, amount: 2700, tax_rate: 15, tax_amount: 405,
    });
  });

  await t.test('missing or silly inputs fall back safely', () => {
    const l = lineAmounts({ quantity: 0, rate: 100, discount_pct: 150, tax_rate: -5 });
    assert.equal(l.quantity, 1);
    assert.equal(l.discount_pct, 100);
    assert.equal(l.amount, 0);
    assert.equal(l.tax_rate, 0);
  });

  await t.test('VAT rounds per line to 2 decimals', () => {
    assert.equal(lineAmounts({ rate: 333.33, tax_rate: 15 }).tax_amount, 50);
    assert.equal(lineAmounts({ rate: 0.1, quantity: 3, tax_rate: 15 }).amount, 0.3);
  });

  await t.test('totals mix a 15% line and a zero-rated line and group VAT by rate', () => {
    const lines = [lineAmounts({ rate: 1000, tax_rate: 15 }), lineAmounts({ rate: 4000, tax_rate: 0 }), lineAmounts({ rate: 200, tax_rate: 15 })];
    assert.deepEqual(invoiceTotals(lines), {
      subtotal: 5200,
      tax_amount: 180,
      total: 5380,
      vat: [
        { rate: 15, taxable: 1200, tax: 180 },
        { rate: 0, taxable: 4000, tax: 0 },
      ],
    });
  });

  await t.test('stored decimal strings are accepted', () => {
    assert.equal(invoiceTotals([{ amount: '100.10', tax_amount: '15.02', tax_rate: '15' }]).total, 115.12);
  });
});

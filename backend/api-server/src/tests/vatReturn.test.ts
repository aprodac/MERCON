import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVatReturn, type VatDoc } from '../services/vatReturn';

const doc = (p: Partial<VatDoc>): VatDoc => ({ box: 'standard_sales', kind: 'invoice', id: 'i', ref: 'INV-1', date: '2026-09-10', party: 'SHIPA', amount: 0, adjustment: 0, vat: 0, ...p });

test('sales VAT less purchase VAT is what is owed', () => {
  const r = buildVatReturn('2026-07-01', '2026-09-30', [
    doc({ amount: 10000, vat: 1500 }),
    doc({ box: 'zero_sales', amount: 4000 }),
    doc({ kind: 'credit_note', adjustment: -1000, vat: -150 }),
    doc({ box: 'standard_purchases', kind: 'bill', amount: 2000, vat: 300 }),
    doc({ box: 'no_vat_purchases', kind: 'bill', amount: 500 }),
  ]);
  assert.deepEqual(r.boxes.standard_sales, { amount: 10000, adjustment: -1000, vat: 1350, docs: 2 });
  assert.equal(r.sales.amount, 14000);
  assert.equal(r.sales.adjustment, -1000);
  assert.equal(r.sales.vat, 1350);
  assert.deepEqual(r.purchases, { amount: 2500, vat: 300 });
  assert.equal(r.net_vat, 1050);
});

test('more input than output VAT is a refund (negative)', () => {
  const r = buildVatReturn('2026-07-01', '2026-09-30', [doc({ box: 'standard_purchases', kind: 'bill', amount: 2000, vat: 300 })]);
  assert.equal(r.net_vat, -300);
  assert.equal(r.boxes.zero_sales.docs, 0);
});

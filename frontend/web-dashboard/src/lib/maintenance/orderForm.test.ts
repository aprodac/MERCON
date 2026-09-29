import { describe, expect, it } from 'vitest';
import { draftTotals, newLine, orderProblems, type OrderDraft } from './orderForm';

const base = (p: Partial<OrderDraft> = {}): OrderDraft => ({
  vehicle_id: 'v1', odometer: '212400', maintenance_type: 'Routine', system: 'engine', workshop_name: 'Petromin', workshop_contact: '',
  status: 'In_Progress', start_date: '2026-09-30', expected_end_date: '', end_date: '',
  lines: [newLine('part', { description: 'Oil', quantity: '38', unit_price: '15' }), newLine('labour', { description: 'Labour', unit_price: '100' })],
  vat_on: true, vat_amount: '', vat_auto: true, payment_status: 'Paid', payment_account_id: '', invoice_number: '', notes: '', ...p,
});

describe('service order form', () => {
  it('totals the lines and adds 15% VAT', () => {
    expect(draftTotals(base())).toEqual({ net: 670, parts: 570, labour: 100, other: 0, vat: 100.5, total: 770.5 });
    expect(draftTotals(base({ vat_auto: false, vat_amount: '90' })).vat).toBe(90);
    expect(draftTotals(base({ vat_on: false })).total).toBe(670);
  });

  it('checks the order', () => {
    expect(orderProblems(base(), '2026-09-30')).toEqual([]);
    expect(orderProblems(base({ workshop_name: ' ' }), '2026-09-30')).toEqual(['Enter the workshop.']);
    expect(orderProblems(base({ start_date: '2026-09-20' }), '2026-09-30')[0]).toMatch(/can’t start in the past/);
    // A completed (logged) service may be in the past
    expect(orderProblems(base({ status: 'Completed', start_date: '2026-09-20', end_date: '2026-09-21' }), '2026-09-30')).toEqual([]);
    expect(orderProblems(base({ expected_end_date: '2026-09-29' }), '2026-09-30')).toContain('Back-by date is before the in date.');
    expect(orderProblems(base({ lines: [newLine('part', { description: 'x', quantity: '0', unit_price: '1' })] }), '2026-09-30')).toContain('Quantities must be above zero.');
  });

  it('needs the odometer when a planned service is done', () => {
    const planned = [newLine('other', { description: 'Oil change', unit_price: '0', planId: 'p1', planTask: 'Oil change' })];
    expect(orderProblems(base({ status: 'Completed', lines: planned, odometer: '', vat_on: false }), '2026-09-30')[0]).toMatch(/odometer/);
  });
});

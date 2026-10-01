import { describe, expect, it } from 'vitest';
import type { Invoice } from '@mercon/shared-types';
import { buildInvoicePayload, daysBetween, draftIssues, draftTotals, lineFigures, linesFromInvoice, newManualLine, type DraftHeader, type DraftLine } from './invoiceDraft';

const trip = (id: string, rate: number, extra: Partial<DraftLine> = {}): DraftLine => ({ key: id, kind: 'trip', tripId: id, description: `Trip ${id}`, quantity: 1, rate, discount_pct: 0, tax_rate: null, ...extra });
const manual = (description: string, quantity: number, rate: number, extra: Partial<DraftLine> = {}): DraftLine => ({ ...newManualLine(description, rate), quantity, ...extra });
const header: DraftHeader = { customerId: 'c1', invoiceDate: '2026-09-29', dueDate: '2026-10-29', taxRate: 15, notes: ' Thanks ', terms: '' };

describe('lineFigures', () => {
  it('matches the server: discount on quantity × rate, VAT on the net, 2-decimal rounding', () => {
    expect(lineFigures({ quantity: 3, rate: 333.33, discount_pct: 10, tax_rate: null }, 15)).toEqual({ gross: 999.99, discount: 100, amount: 899.99, tax_rate: 15, tax_amount: 135, total: 1034.99 });
    // A line's own rate wins over the default; quantity 0 counts as 1
    expect(lineFigures({ quantity: 0, rate: 100, discount_pct: 0, tax_rate: 0 }, 15)).toMatchObject({ amount: 100, tax_amount: 0 });
  });
});

describe('draftTotals', () => {
  it('sums the lines and splits VAT by rate', () => {
    const t = draftTotals([trip('a', 1000), trip('b', 500, { tax_rate: 0 }), manual('Waiting', 2, 100, { discount_pct: 50 })], 15);
    expect(t).toMatchObject({ gross: 1700, discount: 100, subtotal: 1600, tax: 165, total: 1765, tripCount: 2, manualCount: 1 });
    expect(t.vat).toEqual([
      { rate: 15, taxable: 1100, tax: 165 },
      { rate: 0, taxable: 500, tax: 0 },
    ]);
  });
});

describe('buildInvoicePayload', () => {
  it('sends trips by id with only their overrides, drops blank charges and trims text', () => {
    const p = buildInvoicePayload(header, [trip('a', 1000), trip('b', 500, { tax_rate: 0, discount_pct: 5 }), manual('Detention', 1, 200), manual('  ', 1, 50)]);
    expect(p.tripIds).toEqual(['a', 'b']);
    expect(p.tripOptions).toEqual({ b: { tax_rate: 0, discount_pct: 5 } });
    expect(p.lines).toEqual([{ description: 'Detention', quantity: 1, rate: 200, amount: 200, discount_pct: 0 }]);
    expect(p).toMatchObject({ customerId: 'c1', tax_rate: 15, due_date: '2026-10-29', notes: 'Thanks', terms: null });
  });

  it('omits tripOptions when no trip overrides anything', () => {
    expect(buildInvoicePayload(header, [trip('a', 1)]).tripOptions).toBeUndefined();
  });
});

describe('draftIssues', () => {
  it('blocks saving without a customer, lines or a sane due date', () => {
    const msgs = draftIssues({ ...header, customerId: '', dueDate: '2026-09-01' }, []).filter((i) => i.level === 'error').map((i) => i.message);
    expect(msgs).toEqual(['Choose a customer.', 'Add at least one trip or charge.', 'The due date is before the invoice date.']);
  });

  it('warns about zero lines, unnamed charges and a missing due date', () => {
    const w = draftIssues({ ...header, dueDate: '' }, [trip('a', 0), manual('', 1, 10)]).map((i) => i.level);
    expect(w).toEqual(['warning', 'warning', 'warning']);
    expect(draftIssues(header, [trip('a', 10)])).toEqual([]);
  });
});

describe('linesFromInvoice', () => {
  it('keeps overrides and lets lines at the invoice rate follow the default', () => {
    const inv = {
      tax_rate: '15',
      lines: [
        { id: 'l1', tripId: 't1', description: 'Trip', quantity: 1, rate: '1000', discount_pct: '10', tax_rate: '15' },
        { id: 'l2', tripId: null, description: 'Extra', quantity: 2, rate: '50', discount_pct: '0', tax_rate: '0' },
      ],
    } as unknown as Invoice;
    expect(linesFromInvoice(inv)).toMatchObject([
      { key: 't1', kind: 'trip', tripId: 't1', rate: 1000, discount_pct: 10, tax_rate: null },
      { kind: 'manual', description: 'Extra', quantity: 2, rate: 50, tax_rate: 0 },
    ]);
  });
});

it('daysBetween counts calendar days', () => {
  expect(daysBetween('2026-09-29', '2026-10-29')).toBe(30);
  expect(daysBetween('', '2026-10-29')).toBeNull();
});

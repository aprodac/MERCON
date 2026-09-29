import { describe, expect, it } from 'vitest';
import { creditFigures, creditProblems, wholeBalanceLine } from './creditNote';

const line = (amount: string, taxRate = '15', description = 'Trip cancelled') => ({ key: amount, description, amount, taxRate });

describe('credit notes', () => {
  it('adds VAT per line', () => {
    expect(creditFigures([line('1000'), line('500', '0')])).toEqual({ subtotal: 1500, tax: 150, total: 1650 });
  });

  it('can’t credit more than is owed, and needs a reason', () => {
    const ok = { lines: [line('100')], reason: 'Price correction', balanceDue: 115, periodOpen: true };
    expect(creditProblems(ok)).toEqual([]);
    expect(creditProblems({ ...ok, balanceDue: 100 })[0]).toMatch(/more than the invoice still owes/);
    expect(creditProblems({ ...ok, reason: ' ' })).toEqual(['Say why the credit note is issued.']);
    expect(creditProblems({ ...ok, lines: [line('0')] })).toContain('Line amounts must be above zero.');
  });

  it('credits the whole balance net of VAT', () => {
    const l = wholeBalanceLine(1150, 15, 'INV-0014');
    expect(l.amount).toBe('1000');
    expect(creditFigures([{ key: 'a', ...l }]).total).toBe(1150);
  });
});

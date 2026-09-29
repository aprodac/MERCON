import { describe, expect, it } from 'vitest';
import type { InvoiceLine } from '@mercon/shared-types';
import { canVoid, daysToDue, dueDateFor, dueText, duplicableLines, invoiceNotice, invoiceState, nextAction, paidShare, termsToDays } from './invoices';

const TODAY = '2026-09-25';
const inv = (status: string, due: string | null, balance: number, total = 1000, paid = total - balance) =>
  ({ id: 'abcdef123456', ref_id: 'INV-0003', status, due_date: due, balance_due: balance, total_amount: total, paid_amount: paid, invoice_date: '2026-08-01' }) as any;

describe('invoice state', () => {
  it('reads each status, with overdue derived from the due date', () => {
    expect(invoiceState(inv('Draft', '2026-08-01', 1000), TODAY)).toBe('draft');
    expect(invoiceState(inv('Issued', '2026-08-19', 1000), TODAY)).toBe('overdue');
    expect(invoiceState(inv('Issued', TODAY, 1000), TODAY)).toBe('unpaid');
    expect(invoiceState(inv('PartiallyPaid', '2026-10-30', 400), TODAY)).toBe('part_paid');
    expect(invoiceState(inv('PartiallyPaid', '2026-09-01', 400), TODAY)).toBe('overdue');
    expect(invoiceState(inv('Paid', '2026-08-01', 0), TODAY)).toBe('paid');
    expect(invoiceState(inv('Void', null, 1000), TODAY)).toBe('void');
  });

  it('suggests one next action per state', () => {
    expect(nextAction('draft')).toBe('issue');
    expect(nextAction('overdue')).toBe('remind');
    expect(nextAction('unpaid')).toBe('record_payment');
    expect(nextAction('part_paid')).toBe('record_payment');
    expect(nextAction('paid')).toBeNull();
  });

  it('describes the due date in plain words', () => {
    expect(dueText(inv('Issued', '2026-08-19', 1000), TODAY)).toBe('37 days overdue');
    expect(dueText(inv('Issued', '2026-09-24', 1000), TODAY)).toBe('1 day overdue');
    expect(dueText(inv('Issued', TODAY, 1000), TODAY)).toBe('Due today');
    expect(dueText(inv('Issued', '2026-09-30', 1000), TODAY)).toBe('Due in 5 days');
    expect(dueText(inv('Issued', null, 1000), TODAY)).toBe('No due date');
    expect(dueText(inv('Paid', '2026-08-01', 0), TODAY)).toBe('Paid');
    expect(daysToDue('2026-10-25T00:00:00.000Z', TODAY)).toBe(30);
  });

  it('allows voiding only issued invoices with nothing paid', () => {
    expect(canVoid(inv('Issued', null, 1000))).toBe(true);
    expect(canVoid(inv('PartiallyPaid', null, 400))).toBe(false);
    expect(canVoid(inv('Draft', null, 1000))).toBe(false);
  });

  it('works out the paid share', () => {
    expect(paidShare(inv('PartiallyPaid', null, 400))).toBe(60);
    expect(paidShare({ total_amount: 0, paid_amount: 0 })).toBe(0);
  });
});

describe('invoice helpers', () => {
  it('turns payment terms into a due date, defaulting to 30 days', () => {
    expect(termsToDays('Net 45')).toBe(45);
    expect(termsToDays('Due on receipt')).toBe(0);
    expect(dueDateFor('2026-09-25', 'Net 15')).toBe('2026-10-10');
    expect(dueDateFor('2026-09-25', 'monthly')).toBe('2026-10-25');
    expect(dueDateFor('2026-09-25', null)).toBe('2026-10-25');
  });

  it('duplicates manual lines only, never trip lines', () => {
    const lines = [
      { id: '1', invoiceId: 'x', tripId: 't1', description: 'Freight TR-1', quantity: 1, rate: 500, amount: 500 },
      { id: '2', invoiceId: 'x', tripId: null, description: 'Monthly retainer', quantity: 1, rate: 2000, amount: 2000 },
    ] as unknown as InvoiceLine[];
    expect(duplicableLines(lines)).toEqual([{ description: 'Monthly retainer', quantity: 1, rate: 2000, amount: 2000 }]);
  });

  it('writes the invoice message, with the balance only when part paid', () => {
    const full = invoiceNotice(inv('Issued', '2026-10-25', 1000), 'Najd Steel Works', 'Mercon', false);
    expect(full).toContain('Please find invoice INV-0003 dated 1 Aug 2026 from Mercon.');
    expect(full).toContain('Amount: SAR 1,000.00');
    expect(full).not.toContain('Balance due');
    expect(full).toContain('Due by: 25 Oct 2026');
    const part = invoiceNotice(inv('PartiallyPaid', null, 400), 'Najd Steel Works', 'Mercon', true);
    expect(part).toContain('Balance due: SAR 400.00');
    expect(part).toContain('الرصيد المستحق: 400.00 ريال');
  });
});

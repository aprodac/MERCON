import test from 'node:test';
import assert from 'node:assert/strict';
import { baseInvoiceWhere, invoiceOrderBy, invoiceWhere, startOfTodayUtc, statusWhere, termsToDays } from '../utils/invoiceQuery';

const NOW = new Date('2026-09-25T10:00:00.000Z');

test('invoice list filters', async (t) => {
  await t.test('unpaid covers issued and partly paid invoices', () => {
    assert.deepEqual(statusWhere('unpaid', NOW), { status: { in: ['Issued', 'PartiallyPaid'] } });
  });

  await t.test('overdue is unpaid with a due date before today (due today is not overdue)', () => {
    const w = statusWhere('overdue', NOW);
    assert.deepEqual(w.status, { in: ['Issued', 'PartiallyPaid'] });
    assert.equal(w.due_date.lt.toISOString(), '2026-09-25T00:00:00.000Z');
    assert.equal(startOfTodayUtc(NOW).toISOString(), '2026-09-25T00:00:00.000Z');
  });

  await t.test('plain statuses pass through and "all" adds nothing', () => {
    assert.deepEqual(statusWhere('Draft'), { status: 'Draft' });
    assert.deepEqual(statusWhere('all'), {});
    assert.deepEqual(statusWhere(undefined), {});
  });

  await t.test('the end date covers the whole day', () => {
    const w = baseInvoiceWhere({ date_from: '2026-07-01', date_to: '2026-09-30' });
    assert.equal(w.invoice_date.gte.toISOString(), '2026-07-01T00:00:00.000Z');
    assert.equal(w.invoice_date.lte.toISOString(), '2026-09-30T23:59:59.999Z');
  });

  await t.test('search reaches invoice number, customer, line text, trip ref and AWB', () => {
    const w = baseInvoiceWhere({ search: ' AWB-778 ' });
    assert.equal(w.OR.length, 5);
    assert.deepEqual(w.OR[0], { ref_id: { contains: 'AWB-778', mode: 'insensitive' } });
    assert.deepEqual(w.OR[4], { trips: { some: { OR: [{ ref_id: { contains: 'AWB-778', mode: 'insensitive' } }, { awb_number: { contains: 'AWB-778', mode: 'insensitive' } }] } } });
  });

  await t.test('customer filter ignores "all" and empty values', () => {
    assert.equal(baseInvoiceWhere({ customer_id: 'all' }).customerId, undefined);
    assert.equal(baseInvoiceWhere({ customer_id: '' }).customerId, undefined);
    assert.equal(invoiceWhere({ customer_id: 'c1', status: 'Paid' }).customerId, 'c1');
  });

  await t.test('unpaid and overdue default to the oldest due date first; others to newest invoice first', () => {
    assert.deepEqual(invoiceOrderBy(undefined, 'overdue')[0], { due_date: { sort: 'asc', nulls: 'last' } });
    assert.deepEqual(invoiceOrderBy(undefined, 'all')[0], { invoice_date: 'desc' });
    assert.deepEqual(invoiceOrderBy('balance_desc', 'overdue'), [{ balance_due: 'desc' }]);
  });

  await t.test('payment terms become days', () => {
    assert.equal(termsToDays('Net 30'), 30);
    assert.equal(termsToDays('net60'), 60);
    assert.equal(termsToDays('45 days'), 45);
    assert.equal(termsToDays('Due on receipt'), 0);
    assert.equal(termsToDays('Monthly'), null);
    assert.equal(termsToDays(null), null);
  });
});

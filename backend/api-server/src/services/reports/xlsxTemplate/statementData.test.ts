import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStatement, type Entry } from './statementData';

const e = (date: string, doc_type: Entry['doc_type'], debit: number, credit: number, doc_no = ''): Entry => ({
  date: new Date(`${date}T10:00:00Z`),
  doc_type,
  doc_no,
  invoice_no: 'INV-1',
  reference: '',
  due_date: null,
  debit,
  credit,
  invoice_status: 'Issued',
});

test('statement carries earlier activity into the opening balance and runs the balance per row', () => {
  const result = buildStatement(
    [
      e('2026-07-10', 'Invoice', 1000, 0, 'INV-1'),
      e('2026-07-20', 'Payment', 0, 400),
      e('2026-08-05', 'Invoice', 2500, 0, 'INV-2'),
      e('2026-08-12', 'Credit note', 0, 100),
      e('2026-08-20', 'Payment', 0, 600),
    ],
    new Date('2026-08-01T00:00:00Z')
  );
  assert.equal(result.openingBalance, 600);
  assert.equal(result.closingBalance, 2400);
  assert.deepEqual(result.rows.map((r) => r.balance), [3100, 3000, 2400]);
  assert.deepEqual(result.rows.map((r) => r.serial), [1, 2, 3]);
  // Zero side is left empty, not 0, so the Excel debit/credit columns stay clean.
  assert.equal(result.rows[0].credit, null);
  assert.equal(result.rows[1].debit, null);
});

test('same-day entries list the invoice before the payment against it', () => {
  const result = buildStatement(
    [e('2026-08-05', 'Payment', 0, 500), e('2026-08-05', 'Invoice', 500, 0, 'INV-3')],
    new Date('2026-08-01T00:00:00Z')
  );
  assert.deepEqual(result.rows.map((r) => r.doc_type), ['Invoice', 'Payment']);
  assert.deepEqual(result.rows.map((r) => r.balance), [500, 0]);
});

test('a period with no activity still reports the balance brought forward', () => {
  const result = buildStatement([e('2026-06-01', 'Invoice', 750.5, 0)], new Date('2026-08-01T00:00:00Z'));
  assert.equal(result.rows.length, 0);
  assert.equal(result.openingBalance, 750.5);
  assert.equal(result.closingBalance, 750.5);
});

import type { StatementReportFieldKey } from '@mercon/shared-types';
import { prisma } from '../../../db';

export type Entry = {
  date: Date;
  doc_type: 'Invoice' | 'Payment' | 'Advance applied' | 'Credit note';
  doc_no: string;
  invoice_no: string;
  reference: string;
  due_date: Date | null;
  debit: number;
  credit: number;
  invoice_status: string;
};

export interface StatementResult {
  rows: Record<StatementReportFieldKey, unknown>[];
  openingBalance: number;
  closingBalance: number;
}

const ORDER: Record<Entry['doc_type'], number> = { Invoice: 0, 'Credit note': 1, 'Advance applied': 2, Payment: 3 };

/**
 * A customer's statement of account for a date range: every issued invoice
 * (debit) and every payment, advance applied and credit note against those
 * invoices (credit), oldest first with a running balance. Everything before
 * the range is summed into the opening balance. Draft and void invoices —
 * and anything recorded against them — are left out, the same rule as the
 * customer's Financial Summary.
 */
export async function fetchStatementRows(customerId: string, startDate: string, endDate: string): Promise<StatementResult> {
  const start = new Date(startDate);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  const invoices = await prisma.invoice.findMany({
    where: { customerId, status: { notIn: ['Draft', 'Void'] }, invoice_date: { lte: end } },
    select: {
      id: true, ref_id: true, invoice_date: true, due_date: true, status: true, total_amount: true,
      payments: { where: { payment_date: { lte: end } }, select: { id: true, amount: true, payment_date: true, payment_method: true, reference: true } },
      advanceApplications: { where: { applied_date: { lte: end } }, select: { id: true, amount: true, applied_date: true, advance: { select: { ref_id: true } } } },
      creditNotes: { where: { status: 'Issued', credit_date: { lte: end } }, select: { id: true, ref_id: true, credit_date: true, reason: true, total_amount: true } },
    },
  });

  const entries: Entry[] = [];
  for (const inv of invoices) {
    const invoiceNo = inv.ref_id ?? inv.id.slice(0, 8);
    entries.push({
      date: inv.invoice_date, doc_type: 'Invoice', doc_no: invoiceNo, invoice_no: invoiceNo, reference: '',
      due_date: inv.due_date, debit: Number(inv.total_amount), credit: 0, invoice_status: inv.status,
    });
    for (const p of inv.payments) {
      entries.push({
        date: p.payment_date, doc_type: 'Payment', doc_no: p.reference ?? '', invoice_no: invoiceNo,
        reference: [p.payment_method, p.reference].filter(Boolean).join(' · '),
        due_date: null, debit: 0, credit: Number(p.amount), invoice_status: inv.status,
      });
    }
    for (const a of inv.advanceApplications) {
      entries.push({
        date: a.applied_date, doc_type: 'Advance applied', doc_no: a.advance?.ref_id ?? '', invoice_no: invoiceNo,
        reference: 'Customer advance applied', due_date: null, debit: 0, credit: Number(a.amount), invoice_status: inv.status,
      });
    }
    for (const c of inv.creditNotes) {
      entries.push({
        date: c.credit_date, doc_type: 'Credit note', doc_no: c.ref_id ?? '', invoice_no: invoiceNo,
        reference: c.reason, due_date: null, debit: 0, credit: Number(c.total_amount), invoice_status: inv.status,
      });
    }
  }

  return buildStatement(entries, start);
}

/**
 * Pure part: sorts the entries (same day → invoice, credit note, advance,
 * payment), folds everything before `start` into the opening balance and
 * gives each row in the period its running balance.
 */
export function buildStatement(entries: Entry[], start: Date): StatementResult {
  entries = [...entries].sort((a, b) => a.date.getTime() - b.date.getTime() || ORDER[a.doc_type] - ORDER[b.doc_type]);

  const round = (n: number) => Math.round(n * 100) / 100;
  let balance = 0;
  const rows: Record<StatementReportFieldKey, unknown>[] = [];
  for (const e of entries) {
    if (e.date < start) {
      balance += e.debit - e.credit;
      continue;
    }
    balance += e.debit - e.credit;
    rows.push({
      serial: rows.length + 1,
      date: e.date,
      doc_type: e.doc_type,
      doc_no: e.doc_no,
      invoice_no: e.invoice_no,
      reference: e.reference,
      due_date: e.due_date,
      debit: e.debit || null,
      credit: e.credit || null,
      balance: round(balance),
      invoice_status: e.invoice_status,
    });
  }

  const inPeriod = rows.reduce((sum, r) => sum + Number(r.debit ?? 0) - Number(r.credit ?? 0), 0);
  const closingBalance = round(balance);
  return { rows, openingBalance: round(closingBalance - inPeriod), closingBalance };
}

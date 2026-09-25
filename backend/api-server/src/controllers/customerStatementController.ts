import { Request, Response } from 'express';
import { prisma } from '../db';
import { logger } from '../utils/logger';
import { parseReportDateRange } from './financeReportsController';
import { computeARAgeing } from './ageingReportsController';

/**
 * Customer statement of account (Tally "Ledger" / Zoho "Customer statement").
 * Movements on the customer's receivable: invoices issued (debit), payments and advance applications
 * (credit), and invoice voids (credit on the reversal date, so a void nets to zero like the ledger).
 */

export type StatementLineType = 'Invoice' | 'Payment' | 'AdvanceApplied' | 'InvoiceVoided';

export interface StatementLine {
  date: string;
  type: StatementLineType;
  ref: string | null;
  description: string;
  debit: number;
  credit: number;
  running_balance: number;
  document_id: string;
}

interface Movement {
  date: Date;
  type: StatementLineType;
  ref: string | null;
  description: string;
  debit: number;
  credit: number;
  document_id: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Every receivable movement for one customer up to `to` (inclusive), oldest first. */
async function loadMovements(customerId: string, to: Date): Promise<Movement[]> {
  const invoices = await prisma.invoice.findMany({
    where: { customerId, status: { in: ['Issued', 'PartiallyPaid', 'Paid', 'Void'] }, invoice_date: { lte: to } },
    include: {
      payments: { where: { payment_date: { lte: to } } },
      advanceApplications: { where: { applied_date: { lte: to } }, include: { advance: { select: { ref_id: true } } } },
      journalEntry: { select: { status: true, reversedBy: { select: { entry_date: true } } } },
    },
  });

  const movements: Movement[] = [];
  for (const inv of invoices) {
    // A void only exists on the books if the invoice was issued (it has a journal entry)
    if (inv.status === 'Void' && !inv.journalEntry) continue;
    const ref = inv.ref_id;
    const total = Number(inv.total_amount || 0);

    movements.push({
      date: inv.invoice_date,
      type: 'Invoice',
      ref,
      description: `Invoice ${ref ?? ''}`.trim(),
      debit: total,
      credit: 0,
      document_id: inv.id,
    });

    for (const p of inv.payments) {
      movements.push({
        date: p.payment_date,
        type: 'Payment',
        ref: p.reference || ref,
        description: `Payment received${p.payment_method ? ` · ${p.payment_method}` : ''} for ${ref ?? 'invoice'}`,
        debit: 0,
        credit: Number(p.amount || 0),
        document_id: inv.id,
      });
    }

    for (const a of inv.advanceApplications) {
      movements.push({
        date: a.applied_date,
        type: 'AdvanceApplied',
        ref: a.advance?.ref_id ?? null,
        description: `Advance ${a.advance?.ref_id ?? ''} applied to ${ref ?? 'invoice'}`.replace(/\s+/g, ' '),
        debit: 0,
        credit: Number(a.amount || 0),
        document_id: inv.id,
      });
    }

    if (inv.status === 'Void') {
      // No void date is stored on Invoice — the reversal journal entry's date is the accounting date.
      const voidDate = inv.journalEntry?.reversedBy?.entry_date ?? inv.updatedAt;
      if (voidDate <= to) {
        movements.push({
          date: voidDate,
          type: 'InvoiceVoided',
          ref,
          description: `Invoice ${ref ?? ''} voided`.trim(),
          debit: 0,
          credit: total,
          document_id: inv.id,
        });
      }
    }
  }

  return movements.sort((a, b) => a.date.getTime() - b.date.getTime() || a.debit - b.debit);
}

export async function buildCustomerStatement(customerId: string, dateFrom?: string, dateTo?: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, deletedAt: null },
    select: { id: true, name: true, contact_phone: true, primary_contact_phone: true, whatsapp_number: true, payment_terms: true },
  });
  if (!customer) return null;

  const { fromDate, toDate } = await parseReportDateRange(dateFrom, dateTo);
  const to = toDate ?? new Date();

  const movements = await loadMovements(customer.id, to);

  let opening = 0;
  let running = 0;
  const lines: StatementLine[] = [];
  for (const m of movements) {
    if (fromDate && m.date < fromDate) {
      opening += m.debit - m.credit;
      continue;
    }
    if (lines.length === 0) running = opening;
    running += m.debit - m.credit;
    lines.push({
      date: m.date.toISOString(),
      type: m.type,
      ref: m.ref,
      description: m.description,
      debit: round2(m.debit),
      credit: round2(m.credit),
      running_balance: round2(running),
      document_id: m.document_id,
    });
  }
  const closing = lines.length > 0 ? running : opening;

  const [ageing, advances] = await Promise.all([
    computeARAgeing({ asOf: to, customerId: customer.id }),
    prisma.advance.findMany({
      where: {
        party_type: 'Customer',
        party_id: customer.id,
        direction: 'Received',
        status: { in: ['Open', 'PartiallyApplied'] },
        advance_date: { lte: to },
      },
      select: { remaining_amount: true },
    }),
  ]);
  const g = ageing.grand_total;

  return {
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.whatsapp_number || customer.contact_phone || customer.primary_contact_phone || null,
      payment_terms: customer.payment_terms ?? null,
    },
    date_from: fromDate ? fromDate.toISOString() : null,
    date_to: to.toISOString(),
    opening_balance: round2(opening),
    lines,
    total_debit: round2(lines.reduce((s, l) => s + l.debit, 0)),
    total_credit: round2(lines.reduce((s, l) => s + l.credit, 0)),
    closing_balance: round2(closing),
    ageing: {
      current: round2(g.current),
      days_1_30: round2(g.days_1_30),
      days_31_60: round2(g.days_31_60),
      days_61_90: round2(g.days_61_90),
      days_90_plus: round2(g.days_90_plus),
      total: round2(g.total),
    },
    unapplied_advances: round2(advances.reduce((s, a) => s + Number(a.remaining_amount || 0), 0)),
  };
}

export const getCustomerStatementLedger = async (req: Request, res: Response) => {
  try {
    const customerId = String(req.query.customer_id || '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(customerId)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_CUSTOMER_ID', message: 'customer_id is required' } });
    }
    const data = await buildCustomerStatement(
      customerId,
      req.query.date_from ? String(req.query.date_from) : undefined,
      req.query.date_to ? String(req.query.date_to) : undefined,
    );
    if (!data) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Customer not found' } });
    }
    return res.json({ success: true, data });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to build customer statement');
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

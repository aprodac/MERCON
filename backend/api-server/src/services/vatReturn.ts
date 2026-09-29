/**
 * VAT return, shaped like the ZATCA return's sales and purchases boxes, built from the documents:
 * issued invoices (per-line VAT), credit notes (adjustments, negative) and approved bills.
 * Voided documents don't count. Expenses carry no VAT field, so they are not in purchases.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../db';
import { localDateToUtc } from '../controllers/financeReportsController';
import { localDay } from './vehicleFinancials/engine';

type Db = PrismaClient | Prisma.TransactionClient;

export type VatBox = 'standard_sales' | 'zero_sales' | 'standard_purchases' | 'no_vat_purchases';

export interface VatDoc {
  box: VatBox;
  kind: 'invoice' | 'credit_note' | 'bill';
  id: string;
  ref: string | null;
  date: string;
  party: string;
  amount: number;
  /** Negative on credit notes. */
  adjustment: number;
  vat: number;
}

export interface BoxTotal {
  amount: number;
  adjustment: number;
  vat: number;
  docs: number;
}

export interface VatReturn {
  from: string;
  to: string;
  boxes: Record<VatBox, BoxTotal>;
  sales: { amount: number; adjustment: number; vat: number };
  purchases: { amount: number; vat: number };
  /** Output VAT − input VAT: positive = payable to ZATCA, negative = refundable / carried forward. */
  net_vat: number;
  documents: VatDoc[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const BOXES: VatBox[] = ['standard_sales', 'zero_sales', 'standard_purchases', 'no_vat_purchases'];

/** Adds up the documents into the boxes. Pure: the tests feed it rows directly. */
export function buildVatReturn(from: string, to: string, docs: VatDoc[]): VatReturn {
  const boxes = Object.fromEntries(BOXES.map((b) => [b, { amount: 0, adjustment: 0, vat: 0, docs: 0 }])) as Record<VatBox, BoxTotal>;
  for (const d of docs) {
    const b = boxes[d.box];
    b.amount = r2(b.amount + d.amount);
    b.adjustment = r2(b.adjustment + d.adjustment);
    b.vat = r2(b.vat + d.vat);
    b.docs += 1;
  }
  const sales = {
    amount: r2(boxes.standard_sales.amount + boxes.zero_sales.amount),
    adjustment: r2(boxes.standard_sales.adjustment + boxes.zero_sales.adjustment),
    vat: r2(boxes.standard_sales.vat + boxes.zero_sales.vat),
  };
  const purchases = { amount: r2(boxes.standard_purchases.amount + boxes.no_vat_purchases.amount), vat: r2(boxes.standard_purchases.vat) };
  return { from, to, boxes, sales, purchases, net_vat: r2(sales.vat - purchases.vat), documents: docs };
}

const ISSUED = ['Issued', 'PartiallyPaid', 'Paid'] as const;
const APPROVED_BILLS = ['Approved', 'PartiallyPaid', 'Paid'] as const;

export async function loadVatReturn(fromDay: string, toDay: string, db: Db = defaultPrisma): Promise<VatReturn> {
  const s = await db.settings.findUnique({ where: { id: 'singleton' }, select: { timezone: true } }).catch(() => null);
  const tz = s?.timezone || 'Asia/Riyadh';
  // Documents are dated in company-local days
  const day = (d: Date) => localDay(d, tz);
  const range = { gte: localDateToUtc(fromDay, tz, false), lte: localDateToUtc(toDay, tz, true) };

  const [invoices, notes, bills] = await Promise.all([
    db.invoice.findMany({
      where: { status: { in: [...ISSUED] }, invoice_date: range },
      select: { id: true, ref_id: true, invoice_date: true, customer: { select: { name: true } }, lines: { select: { amount: true, tax_rate: true, tax_amount: true } } },
    }),
    db.creditNote.findMany({
      where: { status: 'Issued', credit_date: range },
      select: { id: true, ref_id: true, credit_date: true, invoice: { select: { customer: { select: { name: true } } } }, lines: { select: { amount: true, tax_rate: true, tax_amount: true } } },
    }),
    db.bill.findMany({
      where: { status: { in: [...APPROVED_BILLS] }, bill_date: range },
      select: { id: true, ref_id: true, bill_date: true, subtotal: true, tax_amount: true, payee_name: true, provider: { select: { name: true } } },
    }),
  ]);

  const docs: VatDoc[] = [];
  // An invoice can mix 15% and 0% lines: it counts in each box for its own lines
  for (const inv of invoices) {
    for (const box of ['standard_sales', 'zero_sales'] as const) {
      const lines = inv.lines.filter((l) => (box === 'standard_sales' ? Number(l.tax_rate) > 0 : Number(l.tax_rate) === 0));
      if (!lines.length) continue;
      docs.push({
        box, kind: 'invoice', id: inv.id, ref: inv.ref_id, date: day(inv.invoice_date), party: inv.customer?.name ?? '—',
        amount: r2(lines.reduce((t, l) => t + Number(l.amount), 0)), adjustment: 0, vat: r2(lines.reduce((t, l) => t + Number(l.tax_amount), 0)),
      });
    }
  }
  for (const n of notes) {
    for (const box of ['standard_sales', 'zero_sales'] as const) {
      const lines = n.lines.filter((l) => (box === 'standard_sales' ? Number(l.tax_rate) > 0 : Number(l.tax_rate) === 0));
      if (!lines.length) continue;
      docs.push({
        box, kind: 'credit_note', id: n.id, ref: n.ref_id, date: day(n.credit_date), party: n.invoice?.customer?.name ?? '—',
        amount: 0, adjustment: -r2(lines.reduce((t, l) => t + Number(l.amount), 0)), vat: -r2(lines.reduce((t, l) => t + Number(l.tax_amount), 0)),
      });
    }
  }
  for (const b of bills) {
    const vat = Number(b.tax_amount);
    docs.push({
      box: vat > 0.005 ? 'standard_purchases' : 'no_vat_purchases', kind: 'bill', id: b.id, ref: b.ref_id, date: day(b.bill_date), party: b.provider?.name ?? b.payee_name ?? '—',
      amount: r2(Number(b.subtotal)), adjustment: 0, vat: r2(vat),
    });
  }
  docs.sort((a, b) => a.date.localeCompare(b.date));
  return buildVatReturn(fromDay, toDay, docs);
}

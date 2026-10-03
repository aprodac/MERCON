import type { Invoice, InvoiceLine } from '@mercon/shared-types';
import { addDays, toDateOnly } from './ageing';
import { formatDate, formatMoney } from './format';

/** Where an invoice stands, as the list and the panel talk about it. */
export type InvoiceState = 'draft' | 'unpaid' | 'part_paid' | 'overdue' | 'paid' | 'void';

/** The one thing to do next with an invoice in each state. */
export type InvoiceAction = 'issue' | 'record_payment' | 'remind' | 'send' | null;

const n = (v: number | string | null | undefined) => Number(v ?? 0);

/** Whole days from `today` to the due date (negative once overdue); null without a due date. */
export function daysToDue(dueDate: string | null | undefined, today: string): number | null {
  if (!dueDate) return null;
  const due = new Date(`${toDateOnly(dueDate)}T00:00:00Z`).getTime();
  const now = new Date(`${today}T00:00:00Z`).getTime();
  return Math.round((due - now) / 86_400_000);
}

export function invoiceState(inv: Pick<Invoice, 'status' | 'due_date' | 'balance_due'>, today: string): InvoiceState {
  if (inv.status === 'Draft') return 'draft';
  if (inv.status === 'Void') return 'void';
  if (inv.status === 'Paid' || n(inv.balance_due) < 0.005) return 'paid';
  const d = daysToDue(inv.due_date, today);
  if (d !== null && d < 0) return 'overdue';
  return inv.status === 'PartiallyPaid' ? 'part_paid' : 'unpaid';
}

export function nextAction(state: InvoiceState): InvoiceAction {
  if (state === 'draft') return 'issue';
  if (state === 'overdue') return 'remind';
  if (state === 'unpaid' || state === 'part_paid') return 'record_payment';
  return null;
}

/** Share of the total already paid, 0–100. */
export const paidShare = (inv: Pick<Invoice, 'total_amount' | 'paid_amount'>) =>
  n(inv.total_amount) > 0 ? Math.min(100, Math.max(0, (n(inv.paid_amount) / n(inv.total_amount)) * 100)) : 0;

/** Plain-words due line: "Due in 5 days", "Due today", "12 days overdue", "No due date". */
export function dueText(inv: Pick<Invoice, 'status' | 'due_date' | 'balance_due'>, today: string): string {
  const state = invoiceState(inv, today);
  if (state === 'paid') return 'Paid';
  if (state === 'void') return 'Void';
  const d = daysToDue(inv.due_date, today);
  if (d === null) return 'No due date';
  if (d === 0) return 'Due today';
  if (d > 0) return `Due in ${d} day${d === 1 ? '' : 's'}`;
  return `${-d} day${d === -1 ? '' : 's'} overdue`;
}

/** Only a voidable invoice: issued and nothing paid against it yet (the engine's rule). */
export const canVoid = (inv: Pick<Invoice, 'status' | 'paid_amount'>) => inv.status === 'Issued' && n(inv.paid_amount) < 0.005;

/** Parse "Net 30", "30 days", "net30" into days; null when the terms don't name a number. */
export function termsToDays(terms: string | null | undefined): number | null {
  if (!terms) return null;
  if (/receipt|immediate|cash/i.test(terms)) return 0;
  const m = terms.match(/(\d{1,3})/);
  return m ? Number(m[1]) : null;
}

/** Due date for a new invoice: the customer's terms, otherwise 30 days (the create form's default). */
export const dueDateFor = (invoiceDate: string, terms: string | null | undefined) => addDays(invoiceDate, termsToDays(terms) ?? 30);

/**
 * Lines a duplicate can carry over: manual lines only. Trip lines are left out — a trip can be
 * billed once, and it's already on the original.
 */
export function duplicableLines(lines: InvoiceLine[] | undefined) {
  return (lines ?? [])
    .filter((l) => !l.tripId)
    .map((l) => ({ description: l.description, quantity: Number(l.quantity) || 1, rate: n(l.rate), amount: n(l.amount) }));
}

/** Message sent with an invoice (WhatsApp / email / copy), in English and optionally Arabic. */
export function invoiceNotice(
  inv: Pick<Invoice, 'ref_id' | 'id' | 'invoice_date' | 'due_date' | 'total_amount' | 'balance_due'>,
  customerName: string,
  companyName: string,
  arabic: boolean,
): string {
  const ref = inv.ref_id ?? inv.id.slice(0, 8);
  const en = [
    `Dear ${customerName},`,
    '',
    `Please find invoice ${ref} dated ${formatDate(inv.invoice_date)} from ${companyName}.`,
    `Amount: SAR ${formatMoney(inv.total_amount)}`,
    n(inv.balance_due) < n(inv.total_amount) ? `Balance due: SAR ${formatMoney(inv.balance_due)}` : null,
    inv.due_date ? `Due by: ${formatDate(inv.due_date)}` : null,
    '',
    'The invoice PDF is attached. Thank you for your business.',
    '',
    companyName,
  ].filter((l) => l !== null);
  if (!arabic) return en.join('\n');
  const ar = [
    `السادة ${customerName} المحترمين،`,
    '',
    `مرفق لكم الفاتورة رقم ${ref} بتاريخ ${formatDate(inv.invoice_date)} من ${companyName}.`,
    `المبلغ: ${formatMoney(inv.total_amount)} ريال`,
    n(inv.balance_due) < n(inv.total_amount) ? `الرصيد المستحق: ${formatMoney(inv.balance_due)} ريال` : null,
    inv.due_date ? `تاريخ الاستحقاق: ${formatDate(inv.due_date)}` : null,
    '',
    'نشكركم على تعاملكم معنا.',
    '',
    companyName,
  ].filter((l) => l !== null);
  return `${en.join('\n')}\n\n────────\n\n${ar.join('\n')}`;
}

export interface PrintedLineVat {
  /** Net of any line discount. */
  amount: number;
  rate: number;
  vat: number;
  total: number;
}

/**
 * VAT on one stored line as issued: the line's own rate and tax (lines can differ, e.g. 15% and
 * 0% zero-rated), falling back to the invoice rate for lines saved before per-line VAT existed.
 */
export function printedLineVat(line: Pick<InvoiceLine, 'amount' | 'tax_rate' | 'tax_amount'>, invoiceRate: number): PrintedLineVat {
  const amount = n(line.amount);
  const rate = line.tax_rate !== undefined && line.tax_rate !== null ? n(line.tax_rate) : invoiceRate;
  const vat = line.tax_amount !== undefined && line.tax_amount !== null ? n(line.tax_amount) : Math.round(amount * rate) / 100;
  return { amount, rate, vat, total: Math.round((amount + vat) * 100) / 100 };
}

/** VAT grouped by rate for the printed summary, highest rate first. */
export function printedVatByRate(lines: Pick<InvoiceLine, 'amount' | 'tax_rate' | 'tax_amount'>[], invoiceRate: number) {
  const by = new Map<number, { rate: number; taxable: number; vat: number }>();
  lines.forEach((l) => {
    const p = printedLineVat(l, invoiceRate);
    const row = by.get(p.rate) ?? { rate: p.rate, taxable: 0, vat: 0 };
    row.taxable = Math.round((row.taxable + p.amount) * 100) / 100;
    row.vat = Math.round((row.vat + p.vat) * 100) / 100;
    by.set(p.rate, row);
  });
  return [...by.values()].sort((a, b) => b.rate - a.rate);
}

/**
 * Draft invoice editor model: lines (trips and manual charges), their amounts, the invoice totals
 * and the payload the API expects. The arithmetic mirrors the server's `invoiceMath.ts` so the
 * figures on screen are the ones that get stored.
 */
import type { Invoice } from '@mercon/shared-types';
import type { CreateInvoiceDTO } from '@/services/financeService';

export interface DraftLine {
  /** Stable React key; the trip id for trip lines. */
  key: string;
  kind: 'trip' | 'manual';
  tripId?: string;
  description: string;
  quantity: number;
  rate: number;
  /** Percent, 0–100. */
  discount_pct: number;
  /** Percent; null follows the invoice's default VAT rate. */
  tax_rate: number | null;
}

export interface LineFigures {
  gross: number;
  discount: number;
  /** Net of discount, before VAT. */
  amount: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const clampPct = (n: number | null | undefined) => Math.min(100, Math.max(0, Number(n) || 0));

/** Same rules as the server: quantity defaults to 1, rate × quantity less discount, VAT on the net. */
export function lineFigures(line: Pick<DraftLine, 'quantity' | 'rate' | 'discount_pct' | 'tax_rate'>, defaultTaxRate: number): LineFigures {
  const quantity = Number(line.quantity) > 0 ? Number(line.quantity) : 1;
  const rate = Number(line.rate) || 0;
  const discountPct = clampPct(line.discount_pct);
  const taxRate = clampPct(line.tax_rate ?? defaultTaxRate);
  const gross = round2(quantity * rate);
  const amount = round2(quantity * rate * (1 - discountPct / 100));
  const taxAmount = round2((amount * taxRate) / 100);
  return { gross, discount: round2(gross - amount), amount, tax_rate: taxRate, tax_amount: taxAmount, total: round2(amount + taxAmount) };
}

export interface DraftTotals {
  gross: number;
  discount: number;
  subtotal: number;
  tax: number;
  total: number;
  /** VAT per rate, highest first: [{ rate: 15, taxable: 1000, tax: 150 }]. */
  vat: { rate: number; taxable: number; tax: number }[];
  tripCount: number;
  manualCount: number;
}

export function draftTotals(lines: DraftLine[], defaultTaxRate: number): DraftTotals {
  const byRate = new Map<number, { rate: number; taxable: number; tax: number }>();
  const t: DraftTotals = { gross: 0, discount: 0, subtotal: 0, tax: 0, total: 0, vat: [], tripCount: 0, manualCount: 0 };
  lines.forEach((l) => {
    const f = lineFigures(l, defaultTaxRate);
    t.gross += f.gross;
    t.discount += f.discount;
    t.subtotal += f.amount;
    t.tax += f.tax_amount;
    if (l.kind === 'trip') t.tripCount += 1;
    else t.manualCount += 1;
    const row = byRate.get(f.tax_rate) ?? { rate: f.tax_rate, taxable: 0, tax: 0 };
    row.taxable = round2(row.taxable + f.amount);
    row.tax = round2(row.tax + f.tax_amount);
    byRate.set(f.tax_rate, row);
  });
  t.gross = round2(t.gross);
  t.discount = round2(t.discount);
  t.subtotal = round2(t.subtotal);
  t.tax = round2(t.tax);
  t.total = round2(t.subtotal + t.tax);
  t.vat = [...byRate.values()].sort((a, b) => b.rate - a.rate);
  return t;
}

export interface DraftHeader {
  customerId: string;
  invoiceDate: string;
  dueDate: string;
  taxRate: number;
  notes: string;
  terms: string;
}

/** Manual lines need a description; blank ones are dropped rather than rejected. */
const keptManual = (l: DraftLine) => l.kind === 'manual' && l.description.trim() !== '';

export function buildInvoicePayload(header: DraftHeader, lines: DraftLine[]): CreateInvoiceDTO {
  const trips = lines.filter((l) => l.kind === 'trip' && l.tripId);
  const tripOptions: NonNullable<CreateInvoiceDTO['tripOptions']> = {};
  trips.forEach((l) => {
    const o: { tax_rate?: number; discount_pct?: number } = {};
    if (l.tax_rate !== null) o.tax_rate = clampPct(l.tax_rate);
    if (l.discount_pct > 0) o.discount_pct = clampPct(l.discount_pct);
    if (Object.keys(o).length > 0) tripOptions[l.tripId as string] = o;
  });
  return {
    customerId: header.customerId,
    invoice_date: header.invoiceDate,
    due_date: header.dueDate || null,
    tax_rate: clampPct(header.taxRate),
    tripIds: trips.map((l) => l.tripId as string),
    tripOptions: Object.keys(tripOptions).length > 0 ? tripOptions : undefined,
    lines: lines.filter(keptManual).map((l) => {
      const f = lineFigures(l, header.taxRate);
      return {
        description: l.description.trim(),
        quantity: Number(l.quantity) > 0 ? Number(l.quantity) : 1,
        rate: Number(l.rate) || 0,
        amount: f.amount,
        discount_pct: clampPct(l.discount_pct),
        ...(l.tax_rate !== null ? { tax_rate: clampPct(l.tax_rate) } : {}),
      };
    }),
    notes: header.notes.trim() || null,
    terms: header.terms.trim() || null,
  };
}

export type IssueLevel = 'error' | 'warning';
export interface DraftIssue {
  level: IssueLevel;
  message: string;
}

/** What stops the draft being saved (errors) or is worth a second look (warnings). */
export function draftIssues(header: DraftHeader, lines: DraftLine[]): DraftIssue[] {
  const out: DraftIssue[] = [];
  if (!header.customerId) out.push({ level: 'error', message: 'Choose a customer.' });
  if (!header.invoiceDate) out.push({ level: 'error', message: 'Set the invoice date.' });
  const billable = lines.filter((l) => l.kind === 'trip' || keptManual(l));
  if (billable.length === 0) out.push({ level: 'error', message: 'Add at least one trip or charge.' });
  if (header.dueDate && header.invoiceDate && header.dueDate < header.invoiceDate) out.push({ level: 'error', message: 'The due date is before the invoice date.' });
  const blank = lines.filter((l) => l.kind === 'manual' && !l.description.trim() && Number(l.rate) > 0).length;
  if (blank > 0) out.push({ level: 'warning', message: `${blank} charge ${blank === 1 ? 'line has' : 'lines have'} no description and won't be saved.` });
  const zero = lines.filter((l) => (l.kind === 'trip' || keptManual(l)) && lineFigures(l, header.taxRate).amount < 0.005).length;
  if (zero > 0) out.push({ level: 'warning', message: `${zero} ${zero === 1 ? 'line is' : 'lines are'} 0.00.` });
  if (!header.dueDate) out.push({ level: 'warning', message: 'No due date: the invoice will never show as overdue.' });
  return out;
}

/** Lines of a saved draft, for editing it. */
export function linesFromInvoice(inv: Invoice): DraftLine[] {
  const invoiceRate = Number(inv.tax_rate) || 0;
  return (inv.lines ?? []).map((l, i) => {
    const lineRate = l.tax_rate !== undefined && l.tax_rate !== null ? Number(l.tax_rate) : null;
    return {
      key: l.tripId ?? `saved-${l.id ?? i}`,
      kind: l.tripId ? 'trip' : 'manual',
      tripId: l.tripId ?? undefined,
      description: l.description,
      quantity: Number(l.quantity) || 1,
      rate: Number(l.rate) || 0,
      discount_pct: Number(l.discount_pct) || 0,
      // A line at the invoice's rate keeps following it
      tax_rate: lineRate === null || Math.abs(lineRate - invoiceRate) < 0.005 ? null : lineRate,
    };
  });
}

let seq = 0;
export const newManualLine = (description = '', rate = 0): DraftLine => ({
  key: `manual-${Date.now().toString(36)}-${(seq += 1)}`,
  kind: 'manual',
  description,
  quantity: 1,
  rate,
  discount_pct: 0,
  tax_rate: null,
});

/** Days from one date-only string to another. */
export function daysBetween(from: string, to: string): number | null {
  if (!from || !to) return null;
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000);
}

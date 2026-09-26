/**
 * Invoice arithmetic, shared by create, edit, issue (and credit notes). Pure functions over plain
 * numbers, rounded to 2 decimals the way the amounts are stored.
 */

export interface LineInput {
  quantity?: number | null;
  rate: number;
  /** Percent, 0–100. */
  discount_pct?: number | null;
  /** Percent, e.g. 15 or 0. */
  tax_rate?: number | null;
}

export interface LineAmounts {
  quantity: number;
  rate: number;
  discount_pct: number;
  /** Net of discount, before VAT. */
  amount: number;
  tax_rate: number;
  tax_amount: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const clampPct = (n: number | null | undefined) => Math.min(100, Math.max(0, Number(n) || 0));

export function lineAmounts(line: LineInput): LineAmounts {
  const quantity = Number(line.quantity) > 0 ? Number(line.quantity) : 1;
  const rate = Number(line.rate) || 0;
  const discount_pct = clampPct(line.discount_pct);
  const tax_rate = clampPct(line.tax_rate);
  const amount = round2(quantity * rate * (1 - discount_pct / 100));
  return { quantity, rate, discount_pct, amount, tax_rate, tax_amount: round2((amount * tax_rate) / 100) };
}

export interface InvoiceTotals {
  subtotal: number;
  tax_amount: number;
  total: number;
  /** VAT grouped by rate, for the printed summary: [{ rate: 15, taxable: 1000, tax: 150 }, …]. */
  vat: { rate: number; taxable: number; tax: number }[];
}

/** A stored amount: number, numeric string, or Prisma Decimal. */
type Numeric = number | string | { toString(): string };

/** Totals from lines that already carry `amount` and `tax_amount` (as stored). */
export function invoiceTotals(lines: { amount: Numeric; tax_amount: Numeric; tax_rate: Numeric }[]): InvoiceTotals {
  const byRate = new Map<number, { rate: number; taxable: number; tax: number }>();
  let subtotal = 0;
  let tax = 0;
  for (const l of lines) {
    const amount = Number(l.amount) || 0;
    const t = Number(l.tax_amount) || 0;
    const rate = Number(l.tax_rate) || 0;
    subtotal += amount;
    tax += t;
    const row = byRate.get(rate) ?? { rate, taxable: 0, tax: 0 };
    row.taxable = round2(row.taxable + amount);
    row.tax = round2(row.tax + t);
    byRate.set(rate, row);
  }
  subtotal = round2(subtotal);
  tax = round2(tax);
  return { subtotal, tax_amount: tax, total: round2(subtotal + tax), vat: [...byRate.values()].sort((a, b) => b.rate - a.rate) };
}

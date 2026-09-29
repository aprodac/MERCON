/**
 * Credit note form: its figures and checks, matching the API (utils/creditNoteEngine): VAT per line,
 * and the credit can't be more than the invoice still owes.
 */
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface CreditLineDraft {
  key: string;
  description: string;
  amount: string;
  taxRate: string;
}

export const CREDIT_REASONS = ['Price correction', 'Trip cancelled', 'Discount agreed', 'Damage or claim', 'Billed twice'] as const;

export function creditFigures(lines: CreditLineDraft[]) {
  const parsed = lines.map((l) => {
    const amount = Number(l.amount) || 0;
    const rate = Number(l.taxRate) || 0;
    return { amount: r2(amount), tax: r2((amount * rate) / 100) };
  });
  const subtotal = r2(parsed.reduce((t, l) => t + l.amount, 0));
  const tax = r2(parsed.reduce((t, l) => t + l.tax, 0));
  return { subtotal, tax, total: r2(subtotal + tax) };
}

export function creditProblems(p: { lines: CreditLineDraft[]; reason: string; balanceDue: number; periodOpen: boolean }): string[] {
  const out: string[] = [];
  if (!p.lines.length) out.push('Add at least one line.');
  if (p.lines.some((l) => !l.description.trim())) out.push('Every line needs a description.');
  if (p.lines.some((l) => !(Number(l.amount) > 0))) out.push('Line amounts must be above zero.');
  if (p.lines.some((l) => { const r = Number(l.taxRate); return !(r >= 0 && r <= 100); })) out.push('VAT rate must be between 0 and 100.');
  const { total } = creditFigures(p.lines);
  if (total - p.balanceDue > 0.005) out.push(`The credit is more than the invoice still owes (${p.balanceDue.toFixed(2)}).`);
  if (!p.reason.trim()) out.push('Say why the credit note is issued.');
  if (!p.periodOpen) out.push('No open accounting period covers the credit date.');
  return out;
}

/** One line crediting the whole remaining balance at the invoice's VAT rate (net of VAT). */
export function wholeBalanceLine(balanceDue: number, taxRate: number, invoiceRef: string): Omit<CreditLineDraft, 'key'> {
  const net = r2(balanceDue / (1 + taxRate / 100));
  return { description: `Credit on ${invoiceRef}`, amount: String(net), taxRate: String(taxRate) };
}

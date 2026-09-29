/**
 * Credit notes: take part of an issued invoice back.
 *
 * Issuing posts   Dr revenue (before VAT) · Dr VAT output (the VAT) · Cr receivable (total)
 * and lowers the invoice's balance. Only what's still owed can be credited; voiding reverses the
 * entry and puts the balance back.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { AccountingError, postJournalEntryTx, voidJournalEntryTx } from './accountingEngine';
import { generateRefId, nextJournalEntryRefId } from './refId';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const toUuidOrNull = (id?: string | null): string | null => (id && UUID_REGEX.test(id) ? id : null);
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface CreditLineInput {
  description: string;
  amount: number;
  tax_rate: number;
}

/** Each line's VAT (rounded per line, like invoices) and the totals. */
export function creditNoteFigures(lines: CreditLineInput[]) {
  if (!lines.length) throw new AccountingError('Add at least one line to credit', 'NO_LINES', 400);
  const out = lines.map((l) => {
    if (!l.description?.trim()) throw new AccountingError('Every line needs a description', 'INVALID_LINE', 400);
    if (!(l.amount > 0)) throw new AccountingError('Line amounts must be above zero', 'INVALID_AMOUNT', 400);
    if (!(l.tax_rate >= 0 && l.tax_rate <= 100)) throw new AccountingError('VAT rate must be between 0 and 100', 'INVALID_TAX_RATE', 400);
    const amount = r2(l.amount);
    return { description: l.description.trim(), amount, tax_rate: l.tax_rate, tax_amount: r2((amount * l.tax_rate) / 100) };
  });
  const subtotal = r2(out.reduce((t, l) => t + l.amount, 0));
  const tax = r2(out.reduce((t, l) => t + l.tax_amount, 0));
  return { lines: out, subtotal, tax, total: r2(subtotal + tax) };
}

/** The invoice's status once its balance changes: settled, part-settled, or still issued. */
export function statusForBalance(balance: number, paid: number, credited: number): 'Paid' | 'PartiallyPaid' | 'Issued' {
  if (balance <= 0.005) return 'Paid';
  return paid > 0.005 || credited > 0.005 ? 'PartiallyPaid' : 'Issued';
}

export async function issueCreditNote(input: { invoiceId: string; creditDate: string; reason: string; lines: CreditLineInput[]; userId?: string | null }) {
  const reason = input.reason?.trim();
  if (!reason) throw new AccountingError('Say why the credit note is issued', 'REASON_REQUIRED', 400);
  const figures = creditNoteFigures(input.lines);

  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({ where: { id: input.invoiceId } });
    if (!invoice) throw new AccountingError('Invoice not found', 'NOT_FOUND', 404);
    if (!['Issued', 'PartiallyPaid'].includes(invoice.status)) {
      throw new AccountingError(
        invoice.status === 'Paid' ? 'This invoice is fully settled; a credit note can only reduce what is still owed. Record a refund instead.' : `A ${invoice.status.toLowerCase()} invoice can't take a credit note`,
        'CANNOT_CREDIT',
        400,
      );
    }
    const balance = Number(invoice.balance_due);
    if (figures.total - balance > 0.005) {
      throw new AccountingError(`The credit (${figures.total.toFixed(2)}) is more than the invoice still owes (${balance.toFixed(2)})`, 'EXCEEDS_BALANCE_DUE', 400);
    }

    const settings = await tx.settings.findUnique({ where: { id: 'singleton' } });
    const ar = settings?.defaultReceivableAccountId;
    const revenue = settings?.defaultRevenueAccountId;
    const vat = settings?.defaultVatOutputAccountId;
    if (!ar || !revenue) throw new AccountingError('The receivable or revenue account for invoices is not set. An Admin can choose them in Invoices → Ledger setup.', 'SETTINGS_NOT_CONFIGURED', 400);
    if (figures.tax > 0 && !vat) throw new AccountingError('The VAT output account is not set. An Admin can choose it in Invoices → Ledger setup.', 'SETTINGS_NOT_CONFIGURED', 400);

    const creditDate = new Date(input.creditDate);
    const period = await tx.accountingPeriod.findFirst({ where: { status: 'Open', start_date: { lte: creditDate }, end_date: { gte: creditDate } } });
    if (!period) throw new AccountingError(`No open accounting period covers ${input.creditDate}`, 'NO_OPEN_PERIOD', 400);

    const refId = await generateRefId('CN', () => tx.creditNote.findMany({ select: { ref_id: true } }));
    const note = await tx.creditNote.create({
      data: {
        ref_id: refId,
        invoiceId: invoice.id,
        customerId: invoice.customerId,
        credit_date: creditDate,
        reason,
        status: 'Issued',
        subtotal: figures.subtotal,
        tax_amount: figures.tax,
        total_amount: figures.total,
        created_by: toUuidOrNull(input.userId),
        lines: { create: figures.lines },
      },
    });

    const lines: Prisma.JournalLineCreateWithoutJournalEntryInput[] = [
      { account: { connect: { id: revenue } }, debit: figures.subtotal, credit: 0, description: `Credit note ${refId} on ${invoice.ref_id ?? 'invoice'}` },
      ...(figures.tax > 0 ? [{ account: { connect: { id: vat as string } }, debit: figures.tax, credit: 0, description: `VAT on credit note ${refId}` }] : []),
      { account: { connect: { id: ar } }, debit: 0, credit: figures.total, description: `Credit note ${refId} on ${invoice.ref_id ?? 'invoice'}` },
    ];
    const draft = await tx.journalEntry.create({
      data: {
        ref_id: await nextJournalEntryRefId(tx),
        entry_date: creditDate,
        memo: `Credit note ${refId} on ${invoice.ref_id ?? 'invoice'}: ${reason}`,
        status: 'Draft',
        periodId: period.id,
        source_type: 'CreditNote',
        source_id: note.id,
        created_by: toUuidOrNull(input.userId),
        lines: { create: lines },
      },
    });
    const entry = await postJournalEntryTx(tx, draft.id, input.userId);

    const credited = r2(Number(invoice.credited_amount) + figures.total);
    const newBalance = r2(balance - figures.total);
    const updated = await tx.invoice.updateMany({
      where: { id: invoice.id, balance_due: { gte: figures.total - 0.005 } },
      data: { credited_amount: credited, balance_due: newBalance, status: statusForBalance(newBalance, Number(invoice.paid_amount), credited), updated_by: toUuidOrNull(input.userId) },
    });
    if (updated.count === 0) throw new AccountingError('The invoice changed while crediting; try again', 'CONCURRENCY_ERROR', 409);

    return tx.creditNote.update({ where: { id: note.id }, data: { journalEntryId: entry.id }, include: { lines: true } });
  });
}

export async function voidCreditNote(id: string, userId?: string | null) {
  return prisma.$transaction(async (tx) => {
    const note = await tx.creditNote.findUnique({ where: { id }, include: { invoice: true } });
    if (!note) throw new AccountingError('Credit note not found', 'NOT_FOUND', 404);
    if (note.status !== 'Issued') throw new AccountingError('Only an issued credit note can be voided', 'CANNOT_VOID', 400);
    if (note.invoice.status === 'Void') throw new AccountingError('Its invoice is void', 'CANNOT_VOID', 400);
    if (note.journalEntryId) await voidJournalEntryTx(tx, note.journalEntryId, userId, `Void of credit note ${note.ref_id ?? ''}`.trim());
    const total = Number(note.total_amount);
    const credited = r2(Number(note.invoice.credited_amount) - total);
    const balance = r2(Number(note.invoice.balance_due) + total);
    await tx.invoice.update({
      where: { id: note.invoiceId },
      data: { credited_amount: credited, balance_due: balance, status: statusForBalance(balance, Number(note.invoice.paid_amount), credited), updated_by: toUuidOrNull(userId) },
    });
    return tx.creditNote.update({ where: { id: note.id }, data: { status: 'Void', voidedAt: new Date() } });
  });
}

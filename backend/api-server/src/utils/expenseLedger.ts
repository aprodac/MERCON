/**
 * Expenses in the general ledger.
 *
 * An expense posts when it is saved:
 *   Paid     Dr <category's expense account>   Cr <bank / cash account it was paid from>
 *   To pay   Dr <category's expense account>   Cr Accounts payable          (source_type 'Expense')
 *   …later paid: Dr Accounts payable          Cr <bank / cash account>     (source_type 'ExpensePayment')
 *
 * Posting is idempotent: `syncExpenseLedger` works out the entries the expense should have, keeps
 * posted ones that already match, and voids + reposts the rest (a void is a dated reversal, so the
 * history stays). It never throws for accounting set-up gaps; it returns why nothing posted, and the
 * expense itself is saved regardless.
 *
 * Not posted: expenses on a supplier bill (the bill posts them), and everything until a default
 * expense account is set (Expenses → Ledger setup).
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { AccountingError, postJournalEntryTx, voidJournalEntryTx } from './accountingEngine';
import { nextJournalEntryRefId } from './refId';

export const EXPENSE_SOURCE = 'Expense';
export const EXPENSE_PAYMENT_SOURCE = 'ExpensePayment';

type Tx = Prisma.TransactionClient;

export interface PlannedLine {
  accountId: string;
  debit: number;
  credit: number;
  description: string;
}

export interface PlannedEntry {
  source: typeof EXPENSE_SOURCE | typeof EXPENSE_PAYMENT_SOURCE;
  /** Calendar day, YYYY-MM-DD. */
  day: string;
  memo: string;
  lines: PlannedLine[];
}

export interface ExpenseForPlan {
  ref_id: string | null;
  category: string;
  status: string;
  amount: number;
  expense_date: Date;
  bill_paid_date: Date | null;
  payee: string | null;
  paymentAccountId: string | null;
}

export interface LedgerSetup {
  /** Resolved for the expense's category (map, else default); null when not set up. */
  expenseAccountId: string | null;
  payableAccountId: string | null;
}

/** An incurred-to-payable entry already in the ledger, which a later payment clears. */
export interface PostedIncurred {
  day: string;
  lines: { accountId: string; debit: number; credit: number }[];
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const dayOf = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The entries an expense should have. `alreadyIncurred` is its posted 'Expense' entry, if any: when
 * a to-pay expense is paid, that payable entry stays and a payment entry clears it.
 */
export function planExpenseEntries(
  e: ExpenseForPlan,
  setup: LedgerSetup,
  alreadyIncurred: PostedIncurred | null,
): { entries: PlannedEntry[]; problem: string | null } {
  const amount = r2(Number(e.amount) || 0);
  if (!(amount > 0)) return { entries: [], problem: null };
  const ref = e.ref_id ?? 'expense';
  const what = `${e.category}${e.payee ? ` · ${e.payee}` : ''}`;
  if (!setup.expenseAccountId) return { entries: [], problem: `No expense account for ${e.category}. Set it in Expenses → Ledger setup.` };
  const expenseLine = (credit: string): PlannedLine[] => [
    { accountId: setup.expenseAccountId as string, debit: amount, credit: 0, description: what },
    { accountId: credit, debit: 0, credit: amount, description: what },
  ];

  if (e.status === 'Pending') {
    if (!setup.payableAccountId) return { entries: [], problem: 'No accounts payable account is set, so a to-pay expense cannot post.' };
    return { entries: [{ source: EXPENSE_SOURCE, day: dayOf(e.expense_date), memo: `${ref} ${e.category} (to pay)`, lines: expenseLine(setup.payableAccountId) }], problem: null };
  }

  if (!e.paymentAccountId) return { entries: [], problem: 'Choose the bank or cash account it was paid from.' };

  // Paid after being to-pay: keep the payable entry if it still matches, and clear it
  const incurred: PlannedEntry = { source: EXPENSE_SOURCE, day: dayOf(e.expense_date), memo: `${ref} ${e.category} (to pay)`, lines: setup.payableAccountId ? expenseLine(setup.payableAccountId) : [] };
  if (alreadyIncurred && setup.payableAccountId && sameLines(alreadyIncurred.lines, incurred.lines) && alreadyIncurred.day === incurred.day) {
    const paidDay = dayOf(e.bill_paid_date ?? e.expense_date);
    return {
      entries: [
        incurred,
        {
          source: EXPENSE_PAYMENT_SOURCE,
          day: paidDay < incurred.day ? incurred.day : paidDay,
          memo: `${ref} ${e.category} (paid)`,
          lines: [
            { accountId: setup.payableAccountId, debit: amount, credit: 0, description: what },
            { accountId: e.paymentAccountId, debit: 0, credit: amount, description: what },
          ],
        },
      ],
      problem: null,
    };
  }
  return { entries: [{ source: EXPENSE_SOURCE, day: dayOf(e.expense_date), memo: `${ref} ${e.category}`, lines: expenseLine(e.paymentAccountId) }], problem: null };
}

const lineKey = (l: { accountId: string; debit: number; credit: number }) => `${l.accountId}|${r2(Number(l.debit))}|${r2(Number(l.credit))}`;
export function sameLines(a: { accountId: string; debit: number; credit: number }[], b: { accountId: string; debit: number; credit: number }[]): boolean {
  if (a.length !== b.length) return false;
  const x = a.map(lineKey).sort();
  const y = b.map(lineKey).sort();
  return x.every((k, i) => k === y[i]);
}

/** The expense account for a category: the map's entry, else the default. */
export function expenseAccountFor(category: string, map: unknown, defaultId: string | null): string | null {
  const m = map && typeof map === 'object' ? (map as Record<string, unknown>) : {};
  const hit = m[category.trim()];
  return typeof hit === 'string' && hit ? hit : defaultId;
}

export interface LedgerSyncResult {
  /** Journal entries now posted for the expense. */
  entries: { id: string; ref_id: string | null; source: string; day: string; amount: number }[];
  /** Why it is not (fully) in the ledger; null when it is, or when it doesn't belong there. */
  problem: string | null;
  /** Posted through a supplier bill instead. */
  viaBill: string | null;
}

async function postedEntries(tx: Tx | typeof prisma, expenseId: string) {
  return tx.journalEntry.findMany({
    // A void leaves the original 'Voided' plus a posted reversal with the same source: only live originals count
    where: { source_id: expenseId, source_type: { in: [EXPENSE_SOURCE, EXPENSE_PAYMENT_SOURCE] }, status: 'Posted', reversalOfId: null },
    include: { lines: true },
    orderBy: { entry_date: 'asc' },
  });
}

const toResultEntries = (rows: Awaited<ReturnType<typeof postedEntries>>) =>
  rows.map((j) => ({
    id: j.id,
    ref_id: j.ref_id,
    source: j.source_type,
    day: dayOf(j.entry_date),
    amount: r2(j.lines.reduce((s, l) => s + Number(l.debit), 0)),
  }));

/** The bill an expense was put on (and that therefore posts it), if any. */
async function billFor(tx: Tx | typeof prisma, expenseId: string): Promise<string | null> {
  const line = await tx.billLine.findFirst({
    where: { source_type: 'Expense', source_id: expenseId, bill: { status: { not: 'Void' } } },
    include: { bill: { select: { ref_id: true, id: true } } },
  });
  return line ? line.bill.ref_id ?? line.bill.id : null;
}

async function loadSetup(tx: Tx | typeof prisma, category: string): Promise<LedgerSetup & { enabled: boolean }> {
  const s = await tx.settings.findUnique({ where: { id: 'singleton' } });
  return {
    enabled: Boolean(s?.defaultExpenseAccountId),
    expenseAccountId: expenseAccountFor(category, s?.expenseAccountMap, s?.defaultExpenseAccountId ?? null),
    payableAccountId: s?.defaultPayableAccountId ?? null,
  };
}

/**
 * Bring an expense's ledger entries in line with the expense. Safe to call after every change;
 * does nothing when the entries already match.
 */
export async function syncExpenseLedger(expenseId: string, userId?: string | null): Promise<LedgerSyncResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      const e = await tx.expense.findUnique({ where: { id: expenseId } });
      const existing = await postedEntries(tx, expenseId);
      const setup = await loadSetup(tx, e?.category ?? '');
      const viaBill = e ? await billFor(tx, expenseId) : null;

      // Gone, or carried by a bill: nothing of its own in the ledger
      if (!e || e.deletedAt || viaBill) {
        for (const j of existing) await voidJournalEntryTx(tx, j.id, userId, `Reversal of ${j.ref_id ?? j.id}: ${e ? `expense now on bill ${viaBill}` : 'expense deleted'}`);
        return { entries: [], problem: null, viaBill };
      }
      // Ledger posting not switched on yet: leave whatever is there alone
      if (!setup.enabled) return { entries: toResultEntries(existing), problem: 'Expenses are not posting to the ledger yet. Set the accounts in Expenses → Ledger setup.', viaBill: null };

      const incurredNow = existing.find((j) => j.source_type === EXPENSE_SOURCE);
      const plan = planExpenseEntries(
        {
          ref_id: e.ref_id,
          category: e.category,
          status: e.status,
          amount: Number(e.amount),
          expense_date: e.expense_date,
          bill_paid_date: e.bill_paid_date,
          payee: e.payee,
          paymentAccountId: e.paymentAccountId,
        },
        setup,
        incurredNow ? { day: dayOf(incurredNow.entry_date), lines: incurredNow.lines.map((l) => ({ accountId: l.accountId, debit: Number(l.debit), credit: Number(l.credit) })) } : null,
      );
      // A set-up gap keeps what is posted (a later fix reposts it) rather than emptying the ledger
      if (plan.problem) return { entries: toResultEntries(existing), problem: plan.problem, viaBill: null };

      for (const source of [EXPENSE_SOURCE, EXPENSE_PAYMENT_SOURCE] as const) {
        const want = plan.entries.find((p) => p.source === source);
        const have = existing.filter((j) => j.source_type === source);
        const keep = want && have.length === 1 && dayOf(have[0].entry_date) === want.day && sameLines(have[0].lines.map((l) => ({ accountId: l.accountId, debit: Number(l.debit), credit: Number(l.credit) })), want.lines);
        if (keep) continue;
        for (const j of have) await voidJournalEntryTx(tx, j.id, userId, `Reversal of ${j.ref_id ?? j.id}: ${e.ref_id ?? 'expense'} changed`);
        if (want) await postPlanned(tx, e.id, want, userId);
      }
      return { entries: toResultEntries(await postedEntries(tx, expenseId)), problem: null, viaBill: null };
    });
  } catch (err) {
    if (err instanceof AccountingError) {
      const existing = await postedEntries(prisma, expenseId);
      return { entries: toResultEntries(existing), problem: err.message, viaBill: null };
    }
    throw err;
  }
}

async function postPlanned(tx: Tx, expenseId: string, p: PlannedEntry, userId?: string | null) {
  const date = new Date(`${p.day}T12:00:00.000Z`);
  const period = await tx.accountingPeriod.findFirst({ where: { status: 'Open', start_date: { lte: date }, end_date: { gte: date } } });
  if (!period) throw new AccountingError(`No open accounting period covers ${p.day}, so this expense cannot post yet.`, 'NO_OPEN_PERIOD', 400);
  const draft = await tx.journalEntry.create({
    data: {
      ref_id: await nextJournalEntryRefId(tx),
      entry_date: date,
      memo: p.memo,
      status: 'Draft',
      periodId: period.id,
      source_type: p.source,
      source_id: expenseId,
      created_by: userId && /^[0-9a-f-]{36}$/i.test(userId) ? userId : null,
      lines: { create: p.lines.map((l) => ({ accountId: l.accountId, debit: l.debit, credit: l.credit, description: l.description })) },
    },
  });
  // The engine checks balance, postable accounts and the open period
  await postJournalEntryTx(tx, draft.id, userId);
}

/** What is posted for an expense and, when it isn't fully posted, why (without changing anything). */
export async function expenseLedgerStatus(expenseId: string): Promise<LedgerSyncResult & { planned: PlannedEntry[] }> {
  const e = await prisma.expense.findUnique({ where: { id: expenseId } });
  const existing = await postedEntries(prisma, expenseId);
  const viaBill = e ? await billFor(prisma, expenseId) : null;
  if (!e || viaBill) return { entries: toResultEntries(existing), problem: null, viaBill, planned: [] };
  const setup = await loadSetup(prisma, e.category);
  if (!setup.enabled) return { entries: toResultEntries(existing), problem: 'Expenses are not posting to the ledger yet. Set the accounts in Expenses → Ledger setup.', viaBill: null, planned: [] };
  const incurredNow = existing.find((j) => j.source_type === EXPENSE_SOURCE);
  const plan = planExpenseEntries(
    { ref_id: e.ref_id, category: e.category, status: e.status, amount: Number(e.amount), expense_date: e.expense_date, bill_paid_date: e.bill_paid_date, payee: e.payee, paymentAccountId: e.paymentAccountId },
    setup,
    incurredNow ? { day: dayOf(incurredNow.entry_date), lines: incurredNow.lines.map((l) => ({ accountId: l.accountId, debit: Number(l.debit), credit: Number(l.credit) })) } : null,
  );
  const matches =
    !plan.problem &&
    plan.entries.every((p) => {
      const have = existing.filter((j) => j.source_type === p.source);
      return have.length === 1 && dayOf(have[0].entry_date) === p.day && sameLines(have[0].lines.map((l) => ({ accountId: l.accountId, debit: Number(l.debit), credit: Number(l.credit) })), p.lines);
    }) &&
    existing.length === plan.entries.length;
  return {
    entries: toResultEntries(existing),
    problem: plan.problem ?? (matches ? null : 'Not posted yet, or changed since it was posted. Use "Post to ledger".'),
    viaBill: null,
    planned: plan.entries,
  };
}

/** Which of these expenses have a posted ledger entry. */
export async function postedExpenseIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await prisma.journalEntry.findMany({
    where: { source_id: { in: ids }, source_type: EXPENSE_SOURCE, status: 'Posted', reversalOfId: null },
    select: { source_id: true },
  });
  return new Set(rows.map((r) => r.source_id as string));
}

/** Expenses already in the ledger: posted directly, or carried by a supplier bill that isn't void. */
export async function inLedgerExpenseIds(ids: string[]): Promise<Set<string>> {
  const direct = await postedExpenseIds(ids);
  const rest = ids.filter((id) => !direct.has(id));
  if (rest.length === 0) return direct;
  const onBills = await prisma.billLine.findMany({
    where: { source_type: 'Expense', source_id: { in: rest }, bill: { status: { not: 'Void' } } },
    select: { source_id: true },
  });
  for (const b of onBills) if (b.source_id) direct.add(b.source_id);
  return direct;
}

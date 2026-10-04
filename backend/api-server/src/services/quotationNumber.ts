import type { Prisma } from '@prisma/client';

/**
 * The number for a new quotation, given like trip numbers (TRP-0001): the
 * lowest number not in use. Quotations in the Recycle bin keep theirs, so a
 * number is never shown for two quotations at once; a permanently deleted
 * quotation's number becomes free again. Replaces the database counter, which
 * also used up numbers on failed saves.
 *
 * Call inside the transaction that creates the quotation: the advisory lock
 * holds until it commits, so two saves at the same moment can't take the same number.
 */
export async function nextQuotationNumber(tx: Prisma.TransactionClient): Promise<number> {
  await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext('quotation_number'))`);
  const rows = await tx.$queryRawUnsafe<{ n: number }[]>(
    `SELECT MIN(s.n)::int AS n
       FROM generate_series(1, (SELECT COALESCE(MAX(quotation_number), 0) + 1 FROM "Quotation")) AS s(n)
      WHERE NOT EXISTS (SELECT 1 FROM "Quotation" q WHERE q.quotation_number = s.n)`,
  );
  return rows[0]?.n ?? 1;
}

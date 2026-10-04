import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../db';
import { nextQuotationNumber } from '../services/quotationNumber';

// Runs against the local database inside a transaction that is always rolled back.
const ROLLBACK = new Error('rollback');

test('a new quotation takes the lowest free number; Recycle-bin quotations keep theirs', async (t) => {
  const customer = await prisma.customer.findFirst({ select: { id: true } });
  if (!customer) return t.skip('no customer in the local database');

  await prisma.$transaction(async (tx) => {
    const make = (n: number, deleted = false) =>
      tx.quotation.create({ data: { quotation_number: n, name: `zz-test-${n}`, rate: 1, customerId: customer.id, deletedAt: deleted ? new Date() : null } });

    const first = await nextQuotationNumber(tx);
    await make(first, true);
    const second = await nextQuotationNumber(tx);
    assert.ok(second > first, 'a quotation in the Recycle bin keeps its number');

    await make(second + 1); // leave a gap at `second`
    assert.equal(await nextQuotationNumber(tx), second, 'the gap is filled first');
    await make(second);
    assert.ok(await nextQuotationNumber(tx) > second + 1, 'then it moves past the taken numbers');
    throw ROLLBACK;
  }).catch((e) => { if (e !== ROLLBACK) throw e; });
});

test.after(() => prisma.$disconnect());

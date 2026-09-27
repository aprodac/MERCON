import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/mercon_db';
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../db';
import { buildCustomerStatement } from '../controllers/customerStatementController';
import { computeARAgeing } from '../controllers/ageingReportsController';

test('Customer statement of account', async (t) => {
  const ts = Date.now();
  let customerId = '';
  const created: { invoices: string[]; advanceId?: string; accountId?: string } = { invoices: [] };

  t.before(async () => {
    const customer = await prisma.customer.create({ data: { name: `Statement Customer ${ts}`, contact_phone: '+966500000001' } });
    customerId = customer.id;
    const account = await prisma.account.create({
      data: { account_code: `TEST-CADV-${ts}`, name: 'Customer advances (test)', account_type: 'Liability', is_postable: true },
    });
    created.accountId = account.id;

    // A: 1,000 invoiced 10 Jul, fully paid 20 Jul
    const a = await prisma.invoice.create({
      data: {
        customerId, ref_id: `INV-ST-${ts}-A`, invoice_date: new Date('2026-07-10T09:00:00Z'), due_date: new Date('2026-08-09T09:00:00Z'),
        status: 'Paid', subtotal: 1000, total_amount: 1000, paid_amount: 1000, balance_due: 0,
        payments: { create: [{ amount: 1000, payment_date: new Date('2026-07-20T09:00:00Z'), accountId: account.id, payment_method: 'Bank transfer' }] },
      },
    });
    // B: 500 invoiced 5 Aug, 200 paid 10 Aug, 100 settled by an advance on 15 Aug
    const b = await prisma.invoice.create({
      data: {
        customerId, ref_id: `INV-ST-${ts}-B`, invoice_date: new Date('2026-08-05T09:00:00Z'), due_date: new Date('2026-09-04T09:00:00Z'),
        status: 'PartiallyPaid', subtotal: 500, total_amount: 500, paid_amount: 300, balance_due: 200,
        payments: { create: [{ amount: 200, payment_date: new Date('2026-08-10T09:00:00Z'), accountId: account.id }] },
      },
    });
    created.invoices.push(a.id, b.id);

    const advance = await prisma.advance.create({
      data: {
        ref_id: `ADV-ST-${ts}`, party_type: 'Customer', party_id: customerId, direction: 'Received', amount: 400, applied_amount: 100,
        remaining_amount: 300, advance_date: new Date('2026-08-01T09:00:00Z'), status: 'PartiallyApplied', accountId: account.id,
        applications: { create: [{ invoiceId: b.id, amount: 100, applied_date: new Date('2026-08-15T09:00:00Z') }] },
      },
    });
    created.advanceId = advance.id;
  });

  t.after(async () => {
    if (created.advanceId) {
      await prisma.advanceApplication.deleteMany({ where: { advanceId: created.advanceId } });
      await prisma.advance.delete({ where: { id: created.advanceId } });
    }
    await prisma.invoicePayment.deleteMany({ where: { invoiceId: { in: created.invoices } } });
    await prisma.invoice.deleteMany({ where: { id: { in: created.invoices } } });
    if (created.accountId) await prisma.account.delete({ where: { id: created.accountId } });
    if (customerId) await prisma.customer.delete({ where: { id: customerId } });
    await prisma.$disconnect();
  });

  await t.test('opening + debits − credits = closing, and closing = ageing total', async () => {
    const st = await buildCustomerStatement(customerId, '2026-08-01', '2026-08-31');
    assert.ok(st);
    assert.equal(st.opening_balance, 0);
    assert.deepEqual(st.lines.map((l) => [l.type, l.debit, l.credit]), [
      ['Invoice', 500, 0],
      ['Payment', 0, 200],
      ['AdvanceApplied', 0, 100],
    ]);
    assert.equal(st.closing_balance, 200);
    assert.equal(st.lines[st.lines.length - 1].running_balance, 200);
    assert.equal(st.opening_balance + st.total_debit - st.total_credit, st.closing_balance);

    const ageing = await computeARAgeing({ asOf: new Date(st.date_to), customerId });
    assert.equal(Math.round(ageing.grand_total.total * 100) / 100, st.closing_balance);
    assert.equal(st.ageing.total, st.closing_balance);
    assert.equal(st.unapplied_advances, 300);
  });

  await t.test('movements before the period roll into the opening balance', async () => {
    const st = await buildCustomerStatement(customerId, '2026-07-15', '2026-08-31');
    assert.ok(st);
    assert.equal(st.opening_balance, 1000); // invoice A before the period, its payment inside it
    assert.equal(st.lines[0].type, 'Payment');
    assert.equal(st.lines[0].running_balance, 0);
    assert.equal(st.closing_balance, 200);
  });

  await t.test('unknown customer returns null', async () => {
    assert.equal(await buildCustomerStatement('00000000-0000-4000-8000-000000000000'), null);
  });
});

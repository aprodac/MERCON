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
import { getAPAgeing, getARAgeing } from '../controllers/ageingReportsController';

test('Ageing Reports API Engine & Historical As-Of Test Suite', async (t) => {
  let provider: any;
  let customer: any;
  let bill1: any;
  let bill2: any;
  let invoice1: any;

  t.before(async () => {
    const ts = Date.now();

    provider = await prisma.thirdPartyProvider.create({
      data: {
        name: `Test Provider Ageing ${ts}`,
        phone: '+966599999999',
      },
    });

    customer = await prisma.customer.create({
      data: {
        name: `Test Customer Ageing ${ts}`,
        contact_phone: '+966588888888',
      },
    });

    // Create GL Accounts
    const apAcc = await prisma.account.create({
      data: {
        account_code: `TEST-AP-${ts}`,
        name: 'AP Test Account',
        account_type: 'Liability',
        is_postable: true,
      },
    });

    const bankAcc = await prisma.account.create({
      data: {
        account_code: `TEST-BANK-${ts}`,
        name: 'Bank Test Account',
        account_type: 'Asset',
        is_postable: true,
      },
    });

    // Create Bills
    // Bill 1: Dated 2026-08-01, Due 2026-08-15, Amount 1000
    bill1 = await prisma.bill.create({
      data: {
        providerId: provider.id,
        bill_date: new Date('2026-08-01T00:00:00Z'),
        due_date: new Date('2026-08-15T00:00:00Z'),
        total_amount: 1000,
        balance_due: 1000,
        status: 'Approved',
        ref_id: `BIL-${ts}-1`,
      },
    });

    // Bill 2: Dated 2026-09-01, Due 2026-09-15, Amount 2000
    bill2 = await prisma.bill.create({
      data: {
        providerId: provider.id,
        bill_date: new Date('2026-09-01T00:00:00Z'),
        due_date: new Date('2026-09-15T00:00:00Z'),
        total_amount: 2000,
        balance_due: 2000,
        status: 'Approved',
        ref_id: `BIL-${ts}-2`,
      },
    });

    // Payment on Bill 1 on 2026-09-10 (amount 400)
    await prisma.billPayment.create({
      data: {
        billId: bill1.id,
        amount: 400,
        payment_date: new Date('2026-09-10T00:00:00Z'),
        accountId: bankAcc.id,
      },
    });

    // Invoice 1 for AR test
    invoice1 = await prisma.invoice.create({
      data: {
        customerId: customer.id,
        invoice_date: new Date('2026-08-01T00:00:00Z'),
        due_date: new Date('2026-08-15T00:00:00Z'),
        subtotal: 1500,
        tax_amount: 0,
        total_amount: 1500,
        balance_due: 1500,
        status: 'Issued',
        ref_id: `INV-${ts}-1`,
      },
    });
  });

  t.after(async () => {
    if (bill1) await prisma.billPayment.deleteMany({ where: { billId: bill1.id } });
    if (bill1) await prisma.bill.delete({ where: { id: bill1.id } });
    if (bill2) await prisma.bill.delete({ where: { id: bill2.id } });
    if (invoice1) await prisma.invoice.delete({ where: { id: invoice1.id } });
    if (provider) await prisma.thirdPartyProvider.delete({ where: { id: provider.id } });
    if (customer) await prisma.customer.delete({ where: { id: customer.id } });
  });

  await t.test('as_of param excludes bills dated after as_of', async () => {
    const req = {
      query: {
        as_of: '2026-08-31',
        provider_id: provider.id,
      },
    } as any;

    let resData: any = null;
    const res = {
      json: (d: any) => {
        resData = d;
      },
      status: () => res,
    } as any;

    await getAPAgeing(req, res);

    assert.equal(resData.success, true);
    assert.equal(resData.data.rows.length, 1);
    // On 2026-08-31, Bill 2 (dated 2026-09-01) is excluded.
    // Bill 1 balance on 2026-08-31 is 1000 because payment (2026-09-10) happened after as_of.
    const partyRow = resData.data.rows[0];
    assert.equal(partyRow.total, 1000);
  });

  await t.test('Payment dated after as_of is NOT subtracted from historical balance', async () => {
    const reqAug = {
      query: { as_of: '2026-08-31', provider_id: provider.id },
    } as any;
    let resAugData: any = null;
    await getAPAgeing(reqAug, { json: (d: any) => (resAugData = d) } as any);
    assert.equal(resAugData.data.grand_total.total, 1000);

    // As of 2026-09-15, payment on 2026-09-10 IS subtracted -> Bill 1 balance = 600, Bill 2 = 2000 => Total 2600
    const reqSep = {
      query: { as_of: '2026-09-15', provider_id: provider.id },
    } as any;
    let resSepData: any = null;
    await getAPAgeing(reqSep, { json: (d: any) => (resSepData = d) } as any);
    assert.equal(resSepData.data.grand_total.total, 2600);
  });

  await t.test('basis=bill vs due classifies bill into different buckets', async () => {
    // As of 2026-08-20:
    // Bill 1: bill_date = 2026-08-01 (19 days overdue on bill basis), due_date = 2026-08-15 (5 days overdue on due basis)
    const reqDue = {
      query: { as_of: '2026-08-20', provider_id: provider.id, basis: 'due' },
    } as any;
    let resDue: any = null;
    await getAPAgeing(reqDue, { json: (d: any) => (resDue = d) } as any);
    assert.equal(resDue.data.rows[0].days_1_30, 1000);
  });

  await t.test('include_bills=true includes detail bills ordered oldest first', async () => {
    const req = {
      query: { as_of: '2026-09-20', provider_id: provider.id, include_bills: 'true' },
    } as any;
    let resData: any = null;
    await getAPAgeing(req, { json: (d: any) => (resData = d) } as any);

    const partyRow = resData.data.rows[0];
    assert.ok(partyRow.bills);
    assert.equal(partyRow.bills.length, 2);
    // Bill 1 (Aug) should be first, Bill 2 (Sep) second
    assert.equal(partyRow.bills[0].id, bill1.id);
    assert.equal(partyRow.bills[1].id, bill2.id);
  });

  await t.test('AR Ageing returns compatible summary, grand_total, and as_of', async () => {
    const req = {
      query: { as_of: '2026-08-31', customer_id: customer.id },
    } as any;
    let resData: any = null;
    await getARAgeing(req, { json: (d: any) => (resData = d) } as any);

    assert.equal(resData.success, true);
    assert.ok(resData.data.summary);
    assert.ok(resData.data.grand_total);
    assert.equal(resData.data.grand_total.total, 1500);
  });
});

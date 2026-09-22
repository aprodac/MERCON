import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../db';
import { postJournalEntry, voidJournalEntry, AccountingError } from '../utils/accountingEngine';

test('Real Accounting Posting Engine & Void Reversal Integration Test Suite', async (t) => {
  let assetAccount: any;
  let liabilityAccount: any;
  let headerAccount: any;
  let inactiveAccount: any;
  let openPeriod: any;
  let closedPeriod: any;

  t.before(async () => {
    // Setup test data in DB
    const timestamp = Date.now();

    assetAccount = await prisma.account.create({
      data: {
        account_code: `TEST-1010-${timestamp}`,
        name: 'Test Cash Account',
        account_type: 'Asset',
        is_postable: true,
        isActive: true,
      },
    });

    liabilityAccount = await prisma.account.create({
      data: {
        account_code: `TEST-2010-${timestamp}`,
        name: 'Test Accounts Payable',
        account_type: 'Liability',
        is_postable: true,
        isActive: true,
      },
    });

    headerAccount = await prisma.account.create({
      data: {
        account_code: `TEST-1000-${timestamp}`,
        name: 'Test Current Assets Header',
        account_type: 'Asset',
        is_postable: false,
        isActive: true,
      },
    });

    inactiveAccount = await prisma.account.create({
      data: {
        account_code: `TEST-9999-${timestamp}`,
        name: 'Test Inactive Account',
        account_type: 'Expense',
        is_postable: true,
        isActive: false,
      },
    });

    openPeriod = await prisma.accountingPeriod.create({
      data: {
        name: `Open Period ${timestamp}`,
        start_date: new Date('2026-01-01T00:00:00Z'),
        end_date: new Date('2026-12-31T23:59:59Z'),
        status: 'Open',
      },
    });

    closedPeriod = await prisma.accountingPeriod.create({
      data: {
        name: `Closed Period ${timestamp}`,
        start_date: new Date('2025-01-01T00:00:00Z'),
        end_date: new Date('2025-12-31T23:59:59Z'),
        status: 'Closed',
      },
    });
  });

  t.after(async () => {
    // Clean up test data
    if (openPeriod) {
      await prisma.journalLine.deleteMany({
        where: { journalEntry: { periodId: openPeriod.id } },
      });
      await prisma.journalEntry.deleteMany({
        where: { periodId: openPeriod.id },
      });
      await prisma.accountingPeriod.delete({ where: { id: openPeriod.id } });
    }
    if (closedPeriod) {
      await prisma.journalLine.deleteMany({
        where: { journalEntry: { periodId: closedPeriod.id } },
      });
      await prisma.journalEntry.deleteMany({
        where: { periodId: closedPeriod.id },
      });
      await prisma.accountingPeriod.delete({ where: { id: closedPeriod.id } });
    }
    try {
      if (assetAccount) await prisma.account.delete({ where: { id: assetAccount.id } });
      if (liabilityAccount) await prisma.account.delete({ where: { id: liabilityAccount.id } });
      if (headerAccount) await prisma.account.delete({ where: { id: headerAccount.id } });
      if (inactiveAccount) await prisma.account.delete({ where: { id: inactiveAccount.id } });
    } catch (_) {}
  });

  await t.test('1. postJournalEntry successfully posts a valid balanced draft entry', async () => {
    const draft = await prisma.journalEntry.create({
      data: {
        ref_id: `JE-TEST-${Date.now()}-1`,
        entry_date: new Date('2026-06-15T12:00:00Z'),
        memo: 'Test opening entry',
        status: 'Draft',
        periodId: openPeriod.id,
        lines: {
          create: [
            { accountId: assetAccount.id, debit: 500.0, credit: 0 },
            { accountId: liabilityAccount.id, debit: 0, credit: 500.0 },
          ],
        },
      },
    });

    const posted = await postJournalEntry(draft.id, '00000000-0000-0000-0000-000000000001');
    assert.equal(posted.status, 'Posted');
    assert.equal(posted.posted_by, '00000000-0000-0000-0000-000000000001');
    assert.ok(posted.posted_at);
  });

  await t.test('2. postJournalEntry rejects unbalanced entry', async () => {
    const draft = await prisma.journalEntry.create({
      data: {
        ref_id: `JE-TEST-${Date.now()}-2`,
        entry_date: new Date('2026-06-15T12:00:00Z'),
        memo: 'Unbalanced entry',
        status: 'Draft',
        periodId: openPeriod.id,
        lines: {
          create: [
            { accountId: assetAccount.id, debit: 500.0, credit: 0 },
            { accountId: liabilityAccount.id, debit: 0, credit: 400.0 },
          ],
        },
      },
    });

    await assert.rejects(
      async () => await postJournalEntry(draft.id, '00000000-0000-0000-0000-000000000001'),
      (err: any) => err instanceof AccountingError && err.code === 'UNBALANCED_JOURNAL_ENTRY',
    );
  });

  await t.test('3. postJournalEntry rejects posting to non-postable header account', async () => {
    const draft = await prisma.journalEntry.create({
      data: {
        ref_id: `JE-TEST-${Date.now()}-3`,
        entry_date: new Date('2026-06-15T12:00:00Z'),
        memo: 'Header account entry',
        status: 'Draft',
        periodId: openPeriod.id,
        lines: {
          create: [
            { accountId: headerAccount.id, debit: 500.0, credit: 0 },
            { accountId: liabilityAccount.id, debit: 0, credit: 500.0 },
          ],
        },
      },
    });

    await assert.rejects(
      async () => await postJournalEntry(draft.id, '00000000-0000-0000-0000-000000000001'),
      (err: any) => err instanceof AccountingError && err.code === 'ACCOUNT_NOT_POSTABLE',
    );
  });

  await t.test('4. postJournalEntry rejects posting into a Closed period', async () => {
    const draft = await prisma.journalEntry.create({
      data: {
        ref_id: `JE-TEST-${Date.now()}-4`,
        entry_date: new Date('2025-06-15T12:00:00Z'),
        memo: 'Closed period entry',
        status: 'Draft',
        periodId: closedPeriod.id,
        lines: {
          create: [
            { accountId: assetAccount.id, debit: 500.0, credit: 0 },
            { accountId: liabilityAccount.id, debit: 0, credit: 500.0 },
          ],
        },
      },
    });

    await assert.rejects(
      async () => await postJournalEntry(draft.id, '00000000-0000-0000-0000-000000000001'),
      (err: any) => err instanceof AccountingError && err.code === 'PERIOD_NOT_OPEN',
    );
  });

  await t.test('5. voidJournalEntry correctly voids a posted entry and posts a reversal entry into an Open period', async () => {
    const draft = await prisma.journalEntry.create({
      data: {
        ref_id: `JE-TEST-${Date.now()}-5`,
        entry_date: new Date('2026-06-15T12:00:00Z'),
        memo: 'Entry to be voided',
        status: 'Draft',
        periodId: openPeriod.id,
        lines: {
          create: [
            { accountId: assetAccount.id, debit: 1200.0, credit: 0, description: 'Cash debit' },
            { accountId: liabilityAccount.id, debit: 0, credit: 1200.0, description: 'Payable credit' },
          ],
        },
      },
    });

    const postedOriginal = await postJournalEntry(draft.id, '00000000-0000-0000-0000-000000000001');
    assert.equal(postedOriginal.status, 'Posted');

    const result = await voidJournalEntry(postedOriginal.id, '00000000-0000-0000-0000-000000000001', 'Testing void reversal');

    assert.equal(result.original.status, 'Voided');
    assert.equal(result.reversal.status, 'Posted');

    // Verify reversal entry lines are debits/credits swapped
    const reversalLines = result.reversal.lines;
    assert.equal(reversalLines.length, 2);

    const assetReversalLine = reversalLines.find((l: any) => l.accountId === assetAccount.id);
    const liabilityReversalLine = reversalLines.find((l: any) => l.accountId === liabilityAccount.id);

    assert.ok(assetReversalLine);
    assert.ok(liabilityReversalLine);
    assert.equal(Number(assetReversalLine.credit), 1200.0);
    assert.equal(Number(assetReversalLine.debit), 0.0);
    assert.equal(Number(liabilityReversalLine.debit), 1200.0);
    assert.equal(Number(liabilityReversalLine.credit), 0.0);
  });
});

import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/mercon_dev?schema=public';
}

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../db';
import { enrichBankAccountsBatch } from '../controllers/bankAccountController';

describe('Bank Account Analytics & Balances Unit/Integration Suite', () => {
  let testAccountId: string;
  let testBankAccountId: string;
  let testPeriodId: string;

  before(async () => {
    // 1. Create a test Asset GL Account
    const glAccount = await prisma.account.create({
      data: {
        account_code: `1010-TEST-${Date.now().toString().slice(-4)}`,
        name: 'Unit Test Bank Account',
        account_type: 'Asset',
        is_postable: true,
        isActive: true,
      },
    });
    testAccountId = glAccount.id;

    // 2. Create a test BankAccount record with opening balance 50,000
    const bankAcc = await prisma.bankAccount.create({
      data: {
        accountId: testAccountId,
        bank_name: 'Unit Test Bank',
        account_number: '123456789',
        iban: 'SA1234567890123456789012',
        opening_balance: 50000.0,
        currency: 'SAR',
      },
    });
    testBankAccountId = bankAcc.id;

    // 3. Ensure an Open Accounting Period
    const now = new Date();
    const period = await prisma.accountingPeriod.create({
      data: {
        name: `Test Period ${Date.now()}`,
        start_date: new Date(Date.UTC(now.getFullYear(), 0, 1)),
        end_date: new Date(Date.UTC(now.getFullYear(), 11, 31)),
        status: 'Open',
      },
    });
    testPeriodId = period.id;
  });

  after(async () => {
    // Cleanup
    if (testBankAccountId) {
      await prisma.bankAccount.deleteMany({ where: { id: testBankAccountId } });
    }
    if (testAccountId) {
      await prisma.journalLine.deleteMany({ where: { accountId: testAccountId } });
      await prisma.account.deleteMany({ where: { id: testAccountId } });
    }
    if (testPeriodId) {
      await prisma.journalEntry.deleteMany({ where: { periodId: testPeriodId } });
      await prisma.accountingPeriod.deleteMany({ where: { id: testPeriodId } });
    }
  });

  it('book_balance equals opening_balance + ledger_balance', async () => {
    const rawAcc = await prisma.bankAccount.findUnique({
      where: { id: testBankAccountId },
      include: { account: true },
    });

    const [enriched] = await enrichBankAccountsBatch([rawAcc]);

    assert.equal(enriched.opening_balance, 50000.0);
    assert.equal(enriched.ledger_balance, 0.0);
    assert.equal(enriched.book_balance, 50000.0);
  });

  it('posted debits and credits correctly update ledger_balance and book_balance', async () => {
    // Post a journal entry with +10,000 debit to test account
    await prisma.journalEntry.create({
      data: {
        ref_id: `JE-TEST-${Date.now()}-1`,
        entry_date: new Date(),
        memo: 'Test Deposit',
        status: 'Posted',
        periodId: testPeriodId,
        lines: {
          create: [
            {
              accountId: testAccountId,
              debit: 10000.0,
              credit: 0.0,
              description: 'Deposit in',
            },
          ],
        },
      },
    });

    const rawAcc = await prisma.bankAccount.findUnique({
      where: { id: testBankAccountId },
      include: { account: true },
    });

    const [enriched] = await enrichBankAccountsBatch([rawAcc]);

    assert.equal(enriched.ledger_balance, 10000.0);
    assert.equal(enriched.book_balance, 60000.0);
  });

  it('voided entries and their reversals net out to zero', async () => {
    const refBase = `JE-TEST-VOID-${Date.now()}`;

    // Original entry: +5000 debit
    const origJE = await prisma.journalEntry.create({
      data: {
        ref_id: `${refBase}-ORIG`,
        entry_date: new Date(),
        memo: 'Test Void Entry',
        status: 'Voided',
        periodId: testPeriodId,
        lines: {
          create: [
            {
              accountId: testAccountId,
              debit: 5000.0,
              credit: 0.0,
              description: 'Original Debit',
            },
          ],
        },
      },
    });

    // Reversal entry: +5000 credit
    await prisma.journalEntry.create({
      data: {
        ref_id: `${refBase}-REV`,
        entry_date: new Date(),
        memo: `Reversal of ${origJE.ref_id}`,
        status: 'Posted',
        periodId: testPeriodId,
        source_type: 'VoidReversal',
        source_id: origJE.id,
        lines: {
          create: [
            {
              accountId: testAccountId,
              debit: 0.0,
              credit: 5000.0,
              description: 'Reversal Credit',
            },
          ],
        },
      },
    });

    const rawAcc = await prisma.bankAccount.findUnique({
      where: { id: testBankAccountId },
      include: { account: true },
    });

    const [enriched] = await enrichBankAccountsBatch([rawAcc]);

    // Original 10000 + (5000 - 5000) = 10000 net ledger balance
    assert.equal(enriched.ledger_balance, 10000.0);
    assert.equal(enriched.book_balance, 60000.0);
  });
});

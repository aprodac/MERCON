-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('Draft', 'Completed');

-- CreateEnum
CREATE TYPE "AdvancePartyType" AS ENUM ('Customer', 'Provider', 'Employee');

-- CreateEnum
CREATE TYPE "AdvanceDirection" AS ENUM ('Received', 'Paid');

-- CreateEnum
CREATE TYPE "AdvanceStatus" AS ENUM ('Open', 'PartiallyApplied', 'FullyApplied', 'Void');

-- AlterTable
ALTER TABLE "JournalLine" ADD COLUMN "reconciled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "reconciliationId" UUID;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "defaultCustomerAdvanceAccountId" UUID,
ADD COLUMN "defaultProviderAdvanceAccountId" UUID,
ADD COLUMN "defaultEmployeeAdvanceAccountId" UUID;

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "accountId" UUID NOT NULL,
    "bank_name" TEXT,
    "account_number" TEXT,
    "iban" TEXT,
    "swift_code" TEXT,
    "is_cash" BOOLEAN NOT NULL DEFAULT false,
    "opening_balance" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
    "opening_date" TIMESTAMPTZ,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "created_by" UUID,
    "updated_by" UUID,
    "deletedAt" TIMESTAMPTZ,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankReconciliation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bankAccountId" UUID NOT NULL,
    "statement_date" TIMESTAMPTZ NOT NULL,
    "statement_closing_balance" DECIMAL(12,2) NOT NULL,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'Draft',
    "reconciled_by" UUID,
    "reconciled_at" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Advance" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ref_id" TEXT,
    "party_type" "AdvancePartyType" NOT NULL,
    "party_id" UUID,
    "direction" "AdvanceDirection" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "applied_amount" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
    "remaining_amount" DECIMAL(12,2) NOT NULL,
    "advance_date" TIMESTAMPTZ NOT NULL,
    "status" "AdvanceStatus" NOT NULL DEFAULT 'Open',
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "memo" TEXT,
    "accountId" UUID NOT NULL,
    "journalEntryId" UUID,
    "created_by" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Advance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvanceApplication" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "advanceId" UUID NOT NULL,
    "invoiceId" UUID,
    "billId" UUID,
    "amount" DECIMAL(12,2) NOT NULL,
    "applied_date" TIMESTAMPTZ NOT NULL,
    "journalEntryId" UUID,
    "created_by" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdvanceApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountClosingBalance" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "periodId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "closing_debit_total" DECIMAL(14,2) NOT NULL,
    "closing_credit_total" DECIMAL(14,2) NOT NULL,
    "closing_balance" DECIMAL(14,2) NOT NULL,
    "computed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountClosingBalance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_accountId_key" ON "BankAccount"("accountId");
CREATE INDEX "BankAccount_deletedAt_idx" ON "BankAccount"("deletedAt");

-- CreateIndex
CREATE INDEX "BankReconciliation_bankAccountId_idx" ON "BankReconciliation"("bankAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Advance_ref_id_key" ON "Advance"("ref_id");
CREATE INDEX "Advance_party_type_party_id_idx" ON "Advance"("party_type", "party_id");
CREATE INDEX "Advance_status_idx" ON "Advance"("status");

-- CreateIndex
CREATE INDEX "AdvanceApplication_advanceId_idx" ON "AdvanceApplication"("advanceId");
CREATE INDEX "AdvanceApplication_invoiceId_idx" ON "AdvanceApplication"("invoiceId");
CREATE INDEX "AdvanceApplication_billId_idx" ON "AdvanceApplication"("billId");

-- CreateIndex
CREATE INDEX "AccountClosingBalance_periodId_idx" ON "AccountClosingBalance"("periodId");
CREATE UNIQUE INDEX "AccountClosingBalance_periodId_accountId_key" ON "AccountClosingBalance"("periodId", "accountId");

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankReconciliation" ADD CONSTRAINT "BankReconciliation_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "BankReconciliation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Advance" ADD CONSTRAINT "Advance_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Advance" ADD CONSTRAINT "Advance_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvanceApplication" ADD CONSTRAINT "AdvanceApplication_advanceId_fkey" FOREIGN KEY ("advanceId") REFERENCES "Advance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvanceApplication" ADD CONSTRAINT "AdvanceApplication_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvanceApplication" ADD CONSTRAINT "AdvanceApplication_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvanceApplication" ADD CONSTRAINT "AdvanceApplication_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountClosingBalance" ADD CONSTRAINT "AccountClosingBalance_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "AccountingPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountClosingBalance" ADD CONSTRAINT "AccountClosingBalance_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

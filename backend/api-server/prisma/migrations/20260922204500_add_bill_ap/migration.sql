-- CreateEnum
CREATE TYPE "BillStatus" AS ENUM ('Draft', 'Approved', 'PartiallyPaid', 'Paid', 'Void');

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "defaultPayableAccountId" UUID;

-- CreateTable
CREATE TABLE "Bill" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ref_id" TEXT,
    "providerId" UUID,
    "payee_name" TEXT,
    "bill_date" TIMESTAMPTZ NOT NULL,
    "due_date" TIMESTAMPTZ,
    "status" "BillStatus" NOT NULL DEFAULT 'Draft',
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
    "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
    "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
    "paid_amount" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
    "balance_due" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "journalEntryId" UUID,
    "created_by" UUID,
    "updated_by" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillLine" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "billId" UUID NOT NULL,
    "source_type" TEXT NOT NULL DEFAULT 'Manual',
    "source_id" UUID,
    "accountId" UUID,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillPayment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "billId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payment_date" TIMESTAMPTZ NOT NULL,
    "payment_method" TEXT,
    "reference" TEXT,
    "accountId" UUID NOT NULL,
    "journalEntryId" UUID,
    "created_by" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Bill_ref_id_key" ON "Bill"("ref_id");
CREATE INDEX "Bill_providerId_idx" ON "Bill"("providerId");
CREATE INDEX "Bill_status_idx" ON "Bill"("status");

-- CreateIndex
CREATE INDEX "BillLine_billId_idx" ON "BillLine"("billId");
CREATE INDEX "BillLine_source_type_source_id_idx" ON "BillLine"("source_type", "source_id");
CREATE INDEX "BillLine_accountId_idx" ON "BillLine"("accountId");

-- CreateIndex
CREATE INDEX "BillPayment_billId_idx" ON "BillPayment"("billId");
CREATE INDEX "BillPayment_accountId_idx" ON "BillPayment"("accountId");

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ThirdPartyProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillLine" ADD CONSTRAINT "BillLine_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillLine" ADD CONSTRAINT "BillLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillPayment" ADD CONSTRAINT "BillPayment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillPayment" ADD CONSTRAINT "BillPayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillPayment" ADD CONSTRAINT "BillPayment_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

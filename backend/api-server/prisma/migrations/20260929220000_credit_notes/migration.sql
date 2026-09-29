-- Credit notes. Additive: two new tables and one column on Invoice (default 0, so existing
-- invoices keep balance_due = total - paid).

ALTER TABLE "Invoice" ADD COLUMN     "credited_amount" DECIMAL(12,2) NOT NULL DEFAULT 0.0;

CREATE TABLE "CreditNote" (
    "id" UUID NOT NULL,
    "ref_id" TEXT,
    "invoiceId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "credit_date" TIMESTAMPTZ NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Issued',
    "subtotal" DECIMAL(12,2) NOT NULL,
    "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "journalEntryId" UUID,
    "voidedAt" TIMESTAMPTZ,
    "created_by" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CreditNoteLine" (
    "id" UUID NOT NULL,
    "creditNoteId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "CreditNoteLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CreditNote_ref_id_key" ON "CreditNote"("ref_id");

CREATE INDEX "CreditNote_invoiceId_idx" ON "CreditNote"("invoiceId");

CREATE INDEX "CreditNote_customerId_idx" ON "CreditNote"("customerId");

CREATE INDEX "CreditNoteLine_creditNoteId_idx" ON "CreditNoteLine"("creditNoteId");

ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CreditNoteLine" ADD CONSTRAINT "CreditNoteLine_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "CreditNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Invoices: notes and terms printed on the invoice
ALTER TABLE "Invoice" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "terms" TEXT;

-- Invoice lines: discount and VAT per line (so 0% international freight can sit next to 15% lines)
ALTER TABLE "InvoiceLine" ADD COLUMN     "discount_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- Settings: VAT output account, invoice numbering, default notes/terms
ALTER TABLE "Settings" ADD COLUMN     "defaultVatOutputAccountId" UUID,
ADD COLUMN     "invoiceDefaultNotes" TEXT,
ADD COLUMN     "invoiceDefaultTerms" TEXT,
ADD COLUMN     "invoiceNumberPadding" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN     "invoiceNumberYearly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "invoicePrefix" TEXT NOT NULL DEFAULT 'INV';

-- Backfill: existing lines carry their invoice's single VAT rate, so every invoice keeps its totals.
-- (Stored invoice totals are not recomputed; line VAT is informational for invoices issued before this.)
UPDATE "InvoiceLine" l
SET "tax_rate" = i."tax_rate",
    "tax_amount" = ROUND(l."amount" * i."tax_rate" / 100, 2)
FROM "Invoice" i
WHERE l."invoiceId" = i."id";

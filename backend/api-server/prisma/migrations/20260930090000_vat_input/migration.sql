-- VAT on purchases: reclaimable VAT on expenses, and the VAT input account bills and expenses
-- post it to. Additive: existing expenses get vat_amount 0 (no change to what they post).

ALTER TABLE "Expense" ADD COLUMN "vat_amount" DECIMAL(12,2) NOT NULL DEFAULT 0.0;

ALTER TABLE "Settings" ADD COLUMN "defaultVatInputAccountId" UUID;

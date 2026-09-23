-- =============================================================================
-- MERCON Finance — REMOVE the demo data created by finance_demo_data.sql
-- LOCAL DATABASE ONLY. Deletes only rows marked
-- created_by = 00000000-0000-4000-8000-00000000de30 (plus their child rows),
-- demo audit-log rows, and Settings default accounts that point at demo accounts.
-- Anything you created yourself in the app is left alone, unless it points at demo
-- rows (for example a payment you recorded on a demo invoice); those are removed too
-- so the foreign keys stay valid.
-- =============================================================================
DO $$
DECLARE d uuid := '00000000-0000-4000-8000-00000000de30';
BEGIN
  -- Anything referencing demo invoices / bills / advances
  DELETE FROM "AdvanceApplication"
   WHERE created_by = d
      OR "advanceId" IN (SELECT id FROM "Advance" WHERE created_by = d)
      OR "invoiceId" IN (SELECT id FROM "Invoice" WHERE created_by = d)
      OR "billId"    IN (SELECT id FROM "Bill" WHERE created_by = d);
  DELETE FROM "Advance" WHERE created_by = d;
  DELETE FROM "InvoicePayment" WHERE created_by = d OR "invoiceId" IN (SELECT id FROM "Invoice" WHERE created_by = d);
  DELETE FROM "BillPayment"    WHERE created_by = d OR "billId"    IN (SELECT id FROM "Bill" WHERE created_by = d);
  UPDATE "Trip" SET "invoiceId" = NULL WHERE "invoiceId" IN (SELECT id FROM "Invoice" WHERE created_by = d);
  DELETE FROM "Invoice" WHERE created_by = d;   -- lines cascade
  DELETE FROM "Bill"    WHERE created_by = d;   -- lines cascade

  -- Reconciliations on demo bank accounts
  UPDATE "JournalLine" SET reconciled = false, "reconciliationId" = NULL
   WHERE "reconciliationId" IN (SELECT r.id FROM "BankReconciliation" r
                                  JOIN "BankAccount" b ON b.id = r."bankAccountId" WHERE b.created_by = d);
  DELETE FROM "BankReconciliation"
   WHERE "bankAccountId" IN (SELECT id FROM "BankAccount" WHERE created_by = d);

  -- Journal entries (break reversal links first; lines cascade)
  UPDATE "JournalEntry" SET "reversalOfId" = NULL
   WHERE created_by = d OR "reversalOfId" IN (SELECT id FROM "JournalEntry" WHERE created_by = d);
  DELETE FROM "JournalEntry" WHERE created_by = d;

  DELETE FROM "BankAccount" WHERE created_by = d;

  -- Periods / accounts created by the demo, only if nothing else uses them now
  DELETE FROM "AccountClosingBalance"
   WHERE "periodId" IN (SELECT id FROM "AccountingPeriod" WHERE created_by = d)
      OR "accountId" IN (SELECT id FROM "Account" WHERE created_by = d);
  DELETE FROM "AccountingPeriod" p
   WHERE p.created_by = d AND NOT EXISTS (SELECT 1 FROM "JournalEntry" je WHERE je."periodId" = p.id);

  UPDATE "Settings" SET
    "defaultReceivableAccountId"       = CASE WHEN "defaultReceivableAccountId"       IN (SELECT id FROM "Account" WHERE created_by = d) THEN NULL ELSE "defaultReceivableAccountId" END,
    "defaultRevenueAccountId"          = CASE WHEN "defaultRevenueAccountId"          IN (SELECT id FROM "Account" WHERE created_by = d) THEN NULL ELSE "defaultRevenueAccountId" END,
    "defaultPayableAccountId"          = CASE WHEN "defaultPayableAccountId"          IN (SELECT id FROM "Account" WHERE created_by = d) THEN NULL ELSE "defaultPayableAccountId" END,
    "defaultCustomerAdvanceAccountId"  = CASE WHEN "defaultCustomerAdvanceAccountId"  IN (SELECT id FROM "Account" WHERE created_by = d) THEN NULL ELSE "defaultCustomerAdvanceAccountId" END,
    "defaultProviderAdvanceAccountId"  = CASE WHEN "defaultProviderAdvanceAccountId"  IN (SELECT id FROM "Account" WHERE created_by = d) THEN NULL ELSE "defaultProviderAdvanceAccountId" END,
    "defaultEmployeeAdvanceAccountId"  = CASE WHEN "defaultEmployeeAdvanceAccountId"  IN (SELECT id FROM "Account" WHERE created_by = d) THEN NULL ELSE "defaultEmployeeAdvanceAccountId" END,
    "defaultRetainedEarningsAccountId" = CASE WHEN "defaultRetainedEarningsAccountId" IN (SELECT id FROM "Account" WHERE created_by = d) THEN NULL ELSE "defaultRetainedEarningsAccountId" END
  WHERE id = 'singleton';

  -- Children before parents; skip any account still used by non-demo data
  DELETE FROM "Account" a
   WHERE a.created_by = d AND a."parentId" IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM "JournalLine" jl WHERE jl."accountId" = a.id)
     AND NOT EXISTS (SELECT 1 FROM "BillLine" bl WHERE bl."accountId" = a.id)
     AND NOT EXISTS (SELECT 1 FROM "BankAccount" b WHERE b."accountId" = a.id)
     AND NOT EXISTS (SELECT 1 FROM "InvoicePayment" ip WHERE ip."accountId" = a.id)
     AND NOT EXISTS (SELECT 1 FROM "BillPayment" bp WHERE bp."accountId" = a.id)
     AND NOT EXISTS (SELECT 1 FROM "Advance" ad WHERE ad."accountId" = a.id);
  DELETE FROM "Account" a
   WHERE a.created_by = d AND a."parentId" IS NULL
     AND NOT EXISTS (SELECT 1 FROM "Account" c WHERE c."parentId" = a.id);

  DELETE FROM "Customer" c
   WHERE c.created_by = d
     AND NOT EXISTS (SELECT 1 FROM "Invoice" i WHERE i."customerId" = c.id)
     AND NOT EXISTS (SELECT 1 FROM "Trip" t WHERE t."customerId" = c.id);
  DELETE FROM "ThirdPartyProvider" p
   WHERE p.created_by = d AND NOT EXISTS (SELECT 1 FROM "Bill" b WHERE b."providerId" = p.id);

  DELETE FROM audit_logs WHERE metadata->>'demo' = 'true';

  RAISE NOTICE 'Finance demo data removed.';
END $$;

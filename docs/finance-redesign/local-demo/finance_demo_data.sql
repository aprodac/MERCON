-- =============================================================================
-- MERCON Finance — CONNECTED DEMO DATA  (LOCAL DATABASE ONLY)
-- =============================================================================
-- !! Never run this against production (mercon.tech). CLAUDE.md forbids demo
-- !! data there. This is for your local Postgres (port 5432) only, so you can
-- !! see the finance pages with realistic data.
--
-- HOW TO RUN (Beekeeper Studio):
--   1. Connect to your LOCAL mercon database.
--   2. Open this file in a query tab and run the WHOLE script at once
--      (nothing selected → Run). Helper functions are created in a scratch
--      schema "finance_demo_tmp" and dropped again at the end.
--   3. Refresh the app. To remove everything later, run finance_demo_cleanup.sql.
--
-- WHAT IT CREATES (all linked together, posted the same way the app's engines post):
--   * Chart of accounts (27 accounts: 6 headers + 21 postable), periods Jun–Oct 2026
--     (Jun–Aug Closed, Sep–Oct Open), Settings default accounts (only if empty)
--   * 3 bank/cash accounts + opening capital entry, 1 completed reconciliation (Jul)
--   * 6 customers, 13 invoices (Draft/Issued/PartiallyPaid/Paid/Void, overdue & current),
--     payments, a customer advance applied to an invoice
--   * 4 providers + 1 landlord payee, 8 bills (Draft/Approved/PartiallyPaid/Paid/Void)
--   * Payroll, tolls, admin, bank transfer, 2 draft JEs, 1 voided JE + reversal
--   * Provider & employee advances, audit-log activity for invoices/bills/JEs
--
-- Every row created here has created_by = 00000000-0000-4000-8000-00000000de30
-- (the "demo marker"), which is what the cleanup script deletes by.
-- Reference numbers continue from your existing highest INV-/BIL-/JE- numbers.
-- Invoice lines are not linked to trips (tripId is null); descriptions name the route.
-- =============================================================================

-- ─── Helpers (in a scratch schema, dropped at the end of this script) ────────

DROP SCHEMA IF EXISTS finance_demo_tmp CASCADE;
CREATE SCHEMA finance_demo_tmp;

CREATE OR REPLACE FUNCTION finance_demo_tmp.demo() RETURNS uuid LANGUAGE sql IMMUTABLE AS
$$ SELECT '00000000-0000-4000-8000-00000000de30'::uuid $$;

CREATE OR REPLACE FUNCTION finance_demo_tmp.admin_id() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT id FROM "User" WHERE username = 'admin' LIMIT 1 $$;

CREATE TABLE finance_demo_tmp._demo_seq (prefix text PRIMARY KEY, n int NOT NULL);
INSERT INTO finance_demo_tmp._demo_seq VALUES
  ('JE',  COALESCE((SELECT max((regexp_match(ref_id, '^JE-(\d+)$'))[1]::int)  FROM "JournalEntry"), 0)),
  ('INV', COALESCE((SELECT max((regexp_match(ref_id, '^INV-(\d+)$'))[1]::int) FROM "Invoice"), 0)),
  ('BIL', COALESCE((SELECT max((regexp_match(ref_id, '^BIL-(\d+)$'))[1]::int) FROM "Bill"), 0));

CREATE OR REPLACE FUNCTION finance_demo_tmp.next_ref(p text) RETURNS text LANGUAGE sql AS
$$ UPDATE finance_demo_tmp._demo_seq SET n = n + 1 WHERE prefix = p RETURNING p || '-' || lpad(n::text, 4, '0') $$;

CREATE OR REPLACE FUNCTION finance_demo_tmp.acct(p_code text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v uuid;
BEGIN
  SELECT id INTO v FROM "Account" WHERE account_code = p_code AND "deletedAt" IS NULL;
  IF v IS NULL THEN RAISE EXCEPTION 'Account % not found', p_code; END IF;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION finance_demo_tmp.period_for(p_date timestamptz) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v uuid;
BEGIN
  SELECT id INTO v FROM "AccountingPeriod"
   WHERE start_date <= p_date AND end_date >= p_date
   ORDER BY start_date DESC LIMIT 1;
  IF v IS NULL THEN RAISE EXCEPTION 'No accounting period covers %', p_date; END IF;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION finance_demo_tmp.audit(p_action text, p_entity text, p_id uuid, p_at timestamptz, p_meta jsonb)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO audit_logs (id, "userId", action, "entityType", "entityId", metadata, "createdAt")
  VALUES (gen_random_uuid(), finance_demo_tmp.admin_id(), p_action, p_entity, p_id::text,
          COALESCE(p_meta, '{}'::jsonb) || '{"demo": true}'::jsonb, p_at)
$$;

-- Journal entry with lines. p_lines = [{"a":"1010","dr":100,"cr":0,"d":"text"}, ...]
CREATE OR REPLACE FUNCTION finance_demo_tmp.je(
  p_date timestamptz, p_memo text, p_source_type text, p_source_id uuid,
  p_status text, p_lines jsonb, p_ref text DEFAULT NULL, p_reversal_of uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid := gen_random_uuid(); v_ref text; v_dr numeric; v_cr numeric;
BEGIN
  SELECT COALESCE(sum((l->>'dr')::numeric), 0), COALESCE(sum((l->>'cr')::numeric), 0)
    INTO v_dr, v_cr FROM jsonb_array_elements(p_lines) l;
  IF v_dr <> v_cr OR v_dr = 0 THEN RAISE EXCEPTION 'Unbalanced JE "%": Dr % / Cr %', p_memo, v_dr, v_cr; END IF;
  v_ref := COALESCE(p_ref, finance_demo_tmp.next_ref('JE'));

  INSERT INTO "JournalEntry" (id, ref_id, entry_date, memo, status, "periodId", source_type, source_id,
                              "reversalOfId", created_by, posted_by, posted_at, "createdAt", "updatedAt")
  VALUES (v_id, v_ref, p_date, p_memo, p_status::"JournalEntryStatus", finance_demo_tmp.period_for(p_date),
          p_source_type, p_source_id, p_reversal_of, finance_demo_tmp.demo(),
          CASE WHEN p_status = 'Draft' THEN NULL ELSE finance_demo_tmp.admin_id() END,
          CASE WHEN p_status = 'Draft' THEN NULL ELSE p_date + interval '5 minutes' END,
          p_date, p_date);

  INSERT INTO "JournalLine" (id, "journalEntryId", "accountId", debit, credit, currency, description, "createdAt")
  SELECT gen_random_uuid(), v_id, finance_demo_tmp.acct(l->>'a'),
         COALESCE((l->>'dr')::numeric, 0), COALESCE((l->>'cr')::numeric, 0), 'SAR', l->>'d', p_date
    FROM jsonb_array_elements(p_lines) l;

  IF p_status = 'Posted' AND p_source_type = 'Manual' THEN
    PERFORM finance_demo_tmp.audit('JOURNAL_ENTRY_POSTED', 'JournalEntry', v_id, p_date + interval '5 minutes', jsonb_build_object('ref_id', v_ref));
  END IF;
  RETURN v_id;
END $$;

-- Void a posted JE: mark Voided + post a swapped reversal in the period of p_date
CREATE OR REPLACE FUNCTION finance_demo_tmp.void_je(p_je uuid, p_date timestamptz, p_memo text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE o record; v_id uuid := gen_random_uuid(); v_ref text := finance_demo_tmp.next_ref('JE');
BEGIN
  SELECT * INTO o FROM "JournalEntry" WHERE id = p_je;
  UPDATE "JournalEntry" SET status = 'Voided', "updatedAt" = p_date WHERE id = p_je;
  INSERT INTO "JournalEntry" (id, ref_id, entry_date, memo, status, "periodId", source_type, source_id,
                              "reversalOfId", created_by, posted_by, posted_at, "createdAt", "updatedAt")
  VALUES (v_id, v_ref, p_date, COALESCE(p_memo, 'Reversal of ' || o.ref_id), 'Posted', finance_demo_tmp.period_for(p_date),
          o.source_type, o.source_id, o.id, finance_demo_tmp.demo(), finance_demo_tmp.admin_id(), p_date, p_date, p_date);
  INSERT INTO "JournalLine" (id, "journalEntryId", "accountId", debit, credit, currency, description, "createdAt")
  SELECT gen_random_uuid(), v_id, "accountId", credit, debit, currency, trim('Reversal: ' || COALESCE(description, '')), p_date
    FROM "JournalLine" WHERE "journalEntryId" = p_je;
  IF o.source_type = 'Manual' THEN
    PERFORM finance_demo_tmp.audit('JOURNAL_ENTRY_VOIDED', 'JournalEntry', p_je, p_date, jsonb_build_object('ref_id', o.ref_id, 'reversal_ref_id', v_ref));
  END IF;
  RETURN v_id;
END $$;

-- Invoice (15% VAT). p_lines = [{"d":"...","q":3,"r":2500}]. Issuing posts Dr AR / Cr Revenue (total), like invoiceEngine.
CREATE OR REPLACE FUNCTION finance_demo_tmp.invoice(p_customer text, p_date timestamptz, p_due timestamptz, p_lines jsonb, p_issue boolean)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid := gen_random_uuid(); v_ref text := finance_demo_tmp.next_ref('INV'); v_cust uuid;
        v_sub numeric; v_tax numeric; v_total numeric; v_je uuid;
BEGIN
  SELECT id INTO v_cust FROM "Customer" WHERE name = p_customer AND created_by = finance_demo_tmp.demo();
  SELECT sum(round((l->>'q')::numeric * (l->>'r')::numeric, 2)) INTO v_sub FROM jsonb_array_elements(p_lines) l;
  v_tax := round(v_sub * 0.15, 2); v_total := v_sub + v_tax;

  INSERT INTO "Invoice" (id, ref_id, "customerId", invoice_date, due_date, status, subtotal, tax_rate, tax_amount,
                         total_amount, paid_amount, balance_due, currency, created_by, updated_by, "createdAt", "updatedAt")
  VALUES (v_id, v_ref, v_cust, p_date, p_due, 'Draft', v_sub, 15, v_tax, v_total, 0, v_total, 'SAR',
          finance_demo_tmp.demo(), finance_demo_tmp.demo(), p_date, p_date);
  INSERT INTO "InvoiceLine" (id, "invoiceId", "tripId", description, quantity, rate, amount, "createdAt")
  SELECT gen_random_uuid(), v_id, NULL, l->>'d', (l->>'q')::float, (l->>'r')::numeric,
         round((l->>'q')::numeric * (l->>'r')::numeric, 2), p_date
    FROM jsonb_array_elements(p_lines) l;

  IF p_issue THEN
    v_je := finance_demo_tmp.je(p_date + interval '1 hour', 'Invoice ' || v_ref || ' - ' || p_customer, 'Invoice', v_id, 'Posted',
      jsonb_build_array(
        jsonb_build_object('a', '1200', 'dr', v_total, 'cr', 0, 'd', 'AR Invoice ' || v_ref),
        jsonb_build_object('a', '4010', 'dr', 0, 'cr', v_total, 'd', 'Revenue Invoice ' || v_ref)));
    UPDATE "Invoice" SET status = 'Issued', "journalEntryId" = v_je WHERE id = v_id;
    PERFORM finance_demo_tmp.audit('INVOICE_ISSUED', 'Invoice', v_id, p_date + interval '1 hour',
      jsonb_build_object('ref_id', v_ref, 'customerId', v_cust, 'total_amount', v_total, 'journalEntryId', v_je));
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION finance_demo_tmp.pay_invoice(p_inv uuid, p_amount numeric, p_date timestamptz, p_bank text, p_method text, p_reference text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE inv record; v_pay uuid := gen_random_uuid(); v_je uuid; v_bal numeric;
BEGIN
  SELECT * INTO inv FROM "Invoice" WHERE id = p_inv;
  INSERT INTO "InvoicePayment" (id, "invoiceId", amount, payment_date, payment_method, reference, "accountId", created_by, "createdAt")
  VALUES (v_pay, p_inv, p_amount, p_date, p_method, p_reference, finance_demo_tmp.acct(p_bank), finance_demo_tmp.demo(), p_date);
  v_je := finance_demo_tmp.je(p_date, 'Payment for Invoice ' || inv.ref_id, 'InvoicePayment', v_pay, 'Posted',
    jsonb_build_array(
      jsonb_build_object('a', p_bank, 'dr', p_amount, 'cr', 0, 'd', 'Payment received for Invoice ' || inv.ref_id),
      jsonb_build_object('a', '1200', 'dr', 0, 'cr', p_amount, 'd', 'AR Credit for Invoice ' || inv.ref_id)));
  UPDATE "InvoicePayment" SET "journalEntryId" = v_je WHERE id = v_pay;
  v_bal := inv.balance_due - p_amount;
  UPDATE "Invoice" SET paid_amount = paid_amount + p_amount, balance_due = v_bal,
         status = CASE WHEN v_bal = 0 THEN 'Paid'::"InvoiceStatus" ELSE 'PartiallyPaid'::"InvoiceStatus" END,
         "updatedAt" = p_date
   WHERE id = p_inv;
  PERFORM finance_demo_tmp.audit('INVOICE_PAYMENT_RECORDED', 'Invoice', p_inv, p_date,
    jsonb_build_object('ref_id', inv.ref_id, 'amount', p_amount, 'paymentId', v_pay, 'journalEntryId', v_je));
END $$;

CREATE OR REPLACE FUNCTION finance_demo_tmp.void_invoice(p_inv uuid, p_date timestamptz) RETURNS void LANGUAGE plpgsql AS $$
DECLARE inv record;
BEGIN
  SELECT * INTO inv FROM "Invoice" WHERE id = p_inv;
  PERFORM finance_demo_tmp.void_je(inv."journalEntryId", p_date, 'Voiding Invoice ' || inv.ref_id);
  UPDATE "Invoice" SET status = 'Void', balance_due = 0, "updatedAt" = p_date WHERE id = p_inv;
  PERFORM finance_demo_tmp.audit('INVOICE_VOIDED', 'Invoice', p_inv, p_date,
    jsonb_build_object('ref_id', inv.ref_id, 'customerId', inv."customerId", 'journalEntryId', inv."journalEntryId"));
END $$;

-- Bill. p_lines = [{"d":"...","a":"5010","amt":1000}]. Approving posts Dr expense (tax spread like billEngine) / Cr AP.
CREATE OR REPLACE FUNCTION finance_demo_tmp.bill(p_provider text, p_payee text, p_date timestamptz, p_due timestamptz,
                                        p_lines jsonb, p_tax numeric, p_approve boolean)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid := gen_random_uuid(); v_ref text := finance_demo_tmp.next_ref('BIL'); v_prov uuid;
        v_sub numeric; v_total numeric; v_je uuid; v_name text; v_je_lines jsonb := '[]'::jsonb;
        l jsonb; i int := 0; n int; v_alloc numeric := 0; v_dr numeric;
BEGIN
  IF p_provider IS NOT NULL THEN SELECT id INTO v_prov FROM "ThirdPartyProvider" WHERE name = p_provider; END IF;
  v_name := COALESCE(p_payee, p_provider, 'Vendor Bill');
  SELECT sum((x->>'amt')::numeric), count(*) INTO v_sub, n FROM jsonb_array_elements(p_lines) x;
  v_total := v_sub + p_tax;

  INSERT INTO "Bill" (id, ref_id, "providerId", payee_name, bill_date, due_date, status, subtotal, tax_amount,
                      total_amount, paid_amount, balance_due, currency, created_by, updated_by, "createdAt", "updatedAt")
  VALUES (v_id, v_ref, v_prov, p_payee, p_date, p_due, 'Draft', v_sub, p_tax, v_total, 0, v_total, 'SAR',
          finance_demo_tmp.demo(), finance_demo_tmp.demo(), p_date, p_date);
  INSERT INTO "BillLine" (id, "billId", source_type, source_id, "accountId", description, amount, "createdAt")
  SELECT gen_random_uuid(), v_id, 'Manual', NULL, finance_demo_tmp.acct(x->>'a'), x->>'d', (x->>'amt')::numeric, p_date
    FROM jsonb_array_elements(p_lines) x;

  IF p_approve THEN
    FOR l IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
      i := i + 1;
      IF p_tax > 0 AND i = n THEN v_dr := v_total - v_alloc;
      ELSIF p_tax > 0 THEN v_dr := (l->>'amt')::numeric + round((l->>'amt')::numeric / v_sub * p_tax, 2);
      ELSE v_dr := (l->>'amt')::numeric; END IF;
      v_alloc := v_alloc + v_dr;
      v_je_lines := v_je_lines || jsonb_build_array(jsonb_build_object('a', l->>'a', 'dr', v_dr, 'cr', 0, 'd', l->>'d'));
    END LOOP;
    v_je_lines := v_je_lines || jsonb_build_array(
      jsonb_build_object('a', '2010', 'dr', 0, 'cr', v_total, 'd', 'Accounts Payable - Bill ' || v_ref));
    v_je := finance_demo_tmp.je(p_date + interval '2 hours', 'Bill ' || v_ref || ' - ' || v_name, 'Bill', v_id, 'Posted', v_je_lines);
    UPDATE "Bill" SET status = 'Approved', "journalEntryId" = v_je WHERE id = v_id;
    PERFORM finance_demo_tmp.audit('BILL_APPROVED', 'Bill', v_id, p_date + interval '2 hours',
      jsonb_build_object('ref_id', v_ref, 'total_amount', v_total, 'journalEntryId', v_je));
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION finance_demo_tmp.pay_bill(p_bill uuid, p_amount numeric, p_date timestamptz, p_bank text, p_method text, p_reference text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE b record; v_pay uuid := gen_random_uuid(); v_je uuid; v_bal numeric; v_name text;
BEGIN
  SELECT bl.*, p.name AS provider_name INTO b FROM "Bill" bl LEFT JOIN "ThirdPartyProvider" p ON p.id = bl."providerId" WHERE bl.id = p_bill;
  v_name := COALESCE(b.payee_name, b.provider_name, 'Vendor');
  INSERT INTO "BillPayment" (id, "billId", amount, payment_date, payment_method, reference, "accountId", created_by, "createdAt")
  VALUES (v_pay, p_bill, p_amount, p_date, p_method, p_reference, finance_demo_tmp.acct(p_bank), finance_demo_tmp.demo(), p_date);
  v_je := finance_demo_tmp.je(p_date, 'Bill Payment for ' || b.ref_id || ' - ' || v_name, 'BillPayment', p_bill, 'Posted',
    jsonb_build_array(
      jsonb_build_object('a', '2010', 'dr', p_amount, 'cr', 0, 'd', 'AP Settlement - Bill ' || b.ref_id),
      jsonb_build_object('a', p_bank, 'dr', 0, 'cr', p_amount, 'd', 'Cash/Bank Payment - Bill ' || b.ref_id)));
  UPDATE "BillPayment" SET "journalEntryId" = v_je WHERE id = v_pay;
  v_bal := b.balance_due - p_amount;
  UPDATE "Bill" SET paid_amount = paid_amount + p_amount, balance_due = v_bal,
         status = CASE WHEN v_bal = 0 THEN 'Paid'::"BillStatus" ELSE 'PartiallyPaid'::"BillStatus" END,
         "updatedAt" = p_date
   WHERE id = p_bill;
  PERFORM finance_demo_tmp.audit('BILL_PAYMENT_RECORDED', 'Bill', p_bill, p_date,
    jsonb_build_object('ref_id', b.ref_id, 'amount', p_amount, 'paymentId', v_pay, 'journalEntryId', v_je));
END $$;

CREATE OR REPLACE FUNCTION finance_demo_tmp.void_bill(p_bill uuid, p_date timestamptz) RETURNS void LANGUAGE plpgsql AS $$
DECLARE b record;
BEGIN
  SELECT * INTO b FROM "Bill" WHERE id = p_bill;
  PERFORM finance_demo_tmp.void_je(b."journalEntryId", p_date, 'Voiding Bill ' || b.ref_id);
  UPDATE "Bill" SET status = 'Void', "updatedAt" = p_date WHERE id = p_bill;
  PERFORM finance_demo_tmp.audit('BILL_VOIDED', 'Bill', p_bill, p_date, jsonb_build_object('ref_id', b.ref_id, 'journalEntryId', b."journalEntryId"));
END $$;

-- Advance (ref_id = its JE ref, like advanceEngine). Received: Dr bank / Cr advance liability. Paid: Dr advance asset / Cr bank.
CREATE OR REPLACE FUNCTION finance_demo_tmp.advance(p_party_type text, p_party_id uuid, p_direction text, p_amount numeric,
                                           p_date timestamptz, p_bank text, p_adv_acct text, p_memo text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid := gen_random_uuid(); v_ref text := finance_demo_tmp.next_ref('JE'); v_je uuid;
BEGIN
  IF p_direction = 'Received' THEN
    v_je := finance_demo_tmp.je(p_date, p_memo, 'Advance', p_party_id, 'Posted', jsonb_build_array(
      jsonb_build_object('a', p_bank, 'dr', p_amount, 'cr', 0, 'd', 'Advance received via ' || p_bank),
      jsonb_build_object('a', p_adv_acct, 'dr', 0, 'cr', p_amount, 'd', 'Customer advance liability (' || COALESCE(p_party_id::text, 'General') || ')')), v_ref);
  ELSE
    v_je := finance_demo_tmp.je(p_date, p_memo, 'Advance', p_party_id, 'Posted', jsonb_build_array(
      jsonb_build_object('a', p_adv_acct, 'dr', p_amount, 'cr', 0, 'd', p_party_type || ' advance asset (' || COALESCE(p_party_id::text, 'General') || ')'),
      jsonb_build_object('a', p_bank, 'dr', 0, 'cr', p_amount, 'd', 'Advance paid out via ' || p_bank)), v_ref);
  END IF;
  INSERT INTO "Advance" (id, ref_id, party_type, party_id, direction, amount, applied_amount, remaining_amount,
                         advance_date, status, currency, memo, "accountId", "journalEntryId", created_by, "createdAt", "updatedAt")
  VALUES (v_id, v_ref, p_party_type::"AdvancePartyType", p_party_id, p_direction::"AdvanceDirection", p_amount, 0, p_amount,
          p_date, 'Open', 'SAR', p_memo, finance_demo_tmp.acct(p_adv_acct), v_je, finance_demo_tmp.demo(), p_date, p_date);
  RETURN v_id;
END $$;

-- Apply a customer advance to an invoice: Dr Customer Advances / Cr AR (AdvanceApplication JE)
CREATE OR REPLACE FUNCTION finance_demo_tmp.apply_advance_to_invoice(p_adv uuid, p_inv uuid, p_amount numeric, p_date timestamptz)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE a record; inv record; v_je uuid; v_bal numeric;
BEGIN
  SELECT * INTO a FROM "Advance" WHERE id = p_adv;
  SELECT * INTO inv FROM "Invoice" WHERE id = p_inv;
  v_je := finance_demo_tmp.je(p_date, 'Contra advance application (Invoice ' || p_inv || ')', 'AdvanceApplication', p_adv, 'Posted',
    jsonb_build_array(
      jsonb_build_object('a', '2300', 'dr', p_amount, 'cr', 0, 'd', 'Advance application to Invoice ' || inv.ref_id),
      jsonb_build_object('a', '1200', 'dr', 0, 'cr', p_amount, 'd', 'Settlement via Advance ' || a.ref_id)));
  INSERT INTO "AdvanceApplication" (id, "advanceId", "invoiceId", "billId", amount, applied_date, "journalEntryId", created_by, "createdAt")
  VALUES (gen_random_uuid(), p_adv, p_inv, NULL, p_amount, p_date, v_je, finance_demo_tmp.demo(), p_date);
  v_bal := inv.balance_due - p_amount;
  UPDATE "Invoice" SET paid_amount = paid_amount + p_amount, balance_due = v_bal,
         status = CASE WHEN v_bal = 0 THEN 'Paid'::"InvoiceStatus" ELSE 'PartiallyPaid'::"InvoiceStatus" END
   WHERE id = p_inv;
  UPDATE "Advance" SET applied_amount = applied_amount + p_amount, remaining_amount = remaining_amount - p_amount,
         status = CASE WHEN remaining_amount - p_amount = 0 THEN 'FullyApplied'::"AdvanceStatus" ELSE 'PartiallyApplied'::"AdvanceStatus" END,
         "updatedAt" = p_date
   WHERE id = p_adv;
END $$;

-- ─── The data ────────────────────────────────────────────────────────────────

DO $$
DECLARE
  d uuid := finance_demo_tmp.demo();
  c_noor uuid; c_gulf uuid; c_redsea uuid; c_najd uuid; c_petro uuid; c_tabuk uuid;
  p_hawk uuid;
  i1 uuid; i2 uuid; i3 uuid; i4 uuid; i5 uuid; i6 uuid; i7 uuid; i8 uuid; i9 uuid; i10 uuid; i11 uuid;
  b1 uuid; b2 uuid; b3 uuid; b4 uuid; b5 uuid; b7 uuid; b8 uuid;
  adv_gulf uuid; je_dup uuid; ba_rajhi uuid; rec uuid;
  r record;
BEGIN
  IF EXISTS (SELECT 1 FROM "Customer" WHERE created_by = d) THEN
    RAISE EXCEPTION 'Finance demo data is already loaded. Run finance_demo_cleanup.sql first.';
  END IF;

  -- 1. Chart of accounts (existing codes are kept as they are) ------------------
  FOR r IN SELECT * FROM (VALUES
    ('1000','Assets','Asset',NULL,NULL,false),
    ('2000','Liabilities','Liability',NULL,NULL,false),
    ('3000','Equity','Equity',NULL,NULL,false),
    ('4000','Revenue','Revenue',NULL,NULL,false),
    ('5000','Cost of Services','Expense',NULL,NULL,false),
    ('6000','Operating Expenses','Expense',NULL,NULL,false),
    ('1010','Al Rajhi Bank - Current','Asset',NULL,'1000',true),
    ('1020','SNB - Operations','Asset',NULL,'1000',true),
    ('1050','Petty Cash','Asset',NULL,'1000',true),
    ('1200','Accounts Receivable','Asset','Operating','1000',true),
    ('1400','Provider Advances','Asset','Operating','1000',true),
    ('1410','Employee Advances','Asset','Operating','1000',true),
    ('1600','Vehicles','Asset','Investing','1000',true),
    ('2010','Accounts Payable','Liability','Operating','2000',true),
    ('2100','Accrued Expenses','Liability','Operating','2000',true),
    ('2300','Customer Advances','Liability','Operating','2000',true),
    ('3100','Owner''s Capital','Equity','Financing','3000',true),
    ('3200','Retained Earnings','Equity',NULL,'3000',true),
    ('4010','Freight Revenue','Revenue',NULL,'4000',true),
    ('5010','Fuel','Expense',NULL,'5000',true),
    ('5020','Driver Salaries','Expense',NULL,'5000',true),
    ('5030','Tolls & Permits','Expense',NULL,'5000',true),
    ('5040','Vehicle Maintenance','Expense',NULL,'5000',true),
    ('5050','Subcontractor Haulage','Expense',NULL,'5000',true),
    ('6010','Office Rent','Expense',NULL,'6000',true),
    ('6020','Insurance','Expense',NULL,'6000',true),
    ('6030','General & Admin','Expense',NULL,'6000',true)
  ) AS t(code, name, typ, cfc, parent, postable)
  LOOP
    INSERT INTO "Account" (id, account_code, name, account_type, cash_flow_category, "parentId", is_postable,
                           created_by, updated_by, "createdAt", "updatedAt")
    VALUES (gen_random_uuid(), r.code, r.name, r.typ::"AccountType", r.cfc::"CashFlowCategory",
            (SELECT id FROM "Account" WHERE account_code = r.parent), r.postable, d, d,
            '2026-06-01 09:00+03', '2026-06-01 09:00+03')
    ON CONFLICT (account_code) DO NOTHING;
  END LOOP;

  -- Settings defaults (only fill the empty ones)
  INSERT INTO "Settings" (id) VALUES ('singleton') ON CONFLICT (id) DO NOTHING;
  UPDATE "Settings" SET
    "defaultReceivableAccountId"      = COALESCE("defaultReceivableAccountId", finance_demo_tmp.acct('1200')),
    "defaultRevenueAccountId"         = COALESCE("defaultRevenueAccountId", finance_demo_tmp.acct('4010')),
    "defaultPayableAccountId"         = COALESCE("defaultPayableAccountId", finance_demo_tmp.acct('2010')),
    "defaultCustomerAdvanceAccountId" = COALESCE("defaultCustomerAdvanceAccountId", finance_demo_tmp.acct('2300')),
    "defaultProviderAdvanceAccountId" = COALESCE("defaultProviderAdvanceAccountId", finance_demo_tmp.acct('1400')),
    "defaultEmployeeAdvanceAccountId" = COALESCE("defaultEmployeeAdvanceAccountId", finance_demo_tmp.acct('1410')),
    "defaultRetainedEarningsAccountId"= COALESCE("defaultRetainedEarningsAccountId", finance_demo_tmp.acct('3200'))
  WHERE id = 'singleton';

  -- 2. Accounting periods (reuse any period that already covers the month) ------
  FOR r IN SELECT * FROM (VALUES
    ('June 2026',      '2026-06-01'::date, '2026-06-30'::date, 'Open'),
    ('July 2026',      '2026-07-01'::date, '2026-07-31'::date, 'Open'),
    ('August 2026',    '2026-08-01'::date, '2026-08-31'::date, 'Open'),
    ('September 2026', '2026-09-01'::date, '2026-09-30'::date, 'Open'),
    ('October 2026',   '2026-10-01'::date, '2026-10-31'::date, 'Open')
  ) AS t(name, s, e, st)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM "AccountingPeriod"
                    WHERE start_date <= (r.s + 14)::timestamptz AND end_date >= (r.s + 14)::timestamptz) THEN
      INSERT INTO "AccountingPeriod" (id, name, start_date, end_date, status, created_by, updated_by, "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), r.name, r.s::timestamp AT TIME ZONE 'UTC',
              (r.e::timestamp + interval '23 hours 59 minutes 59 seconds') AT TIME ZONE 'UTC',
              r.st::"PeriodStatus", d, d, now(), now());
    END IF;
  END LOOP;

  -- 3. Bank & cash accounts ----------------------------------------------------
  INSERT INTO "BankAccount" (id, "accountId", bank_name, account_number, iban, swift_code, is_cash, opening_balance, opening_date, currency, created_by, updated_by, "createdAt", "updatedAt")
  VALUES
    (gen_random_uuid(), finance_demo_tmp.acct('1010'), 'Al Rajhi Bank', '****4417', 'SA03 8000 0000 6080 1016 4417', 'RJHISARI', false, 0, '2026-06-30 12:00+03', 'SAR', d, d, '2026-06-30 12:00+03', '2026-06-30 12:00+03'),
    (gen_random_uuid(), finance_demo_tmp.acct('1020'), 'Saudi National Bank', '****9021', 'SA44 1000 0000 1234 5678 9021', 'NCBKSAJE', false, 0, '2026-06-30 12:00+03', 'SAR', d, d, '2026-06-30 12:00+03', '2026-06-30 12:00+03'),
    (gen_random_uuid(), finance_demo_tmp.acct('1050'), NULL, NULL, NULL, NULL, true, 0, '2026-06-30 12:00+03', 'SAR', d, d, '2026-06-30 12:00+03', '2026-06-30 12:00+03')
  ON CONFLICT ("accountId") DO NOTHING;
  SELECT id INTO ba_rajhi FROM "BankAccount" WHERE "accountId" = finance_demo_tmp.acct('1010');

  -- Opening balances (June): capital injection + existing fleet
  PERFORM finance_demo_tmp.je('2026-06-30 12:00+03', 'Opening balances - owner capital and fleet', 'Manual', NULL, 'Posted', '[
    {"a":"1010","dr":400000,"cr":0,"d":"Opening balance - Al Rajhi"},
    {"a":"1020","dr":150000,"cr":0,"d":"Opening balance - SNB"},
    {"a":"1050","dr":5000,"cr":0,"d":"Opening petty cash float"},
    {"a":"1600","dr":1200000,"cr":0,"d":"Fleet at cost"},
    {"a":"3100","dr":0,"cr":1755000,"d":"Owner capital contribution"}]');

  -- 4. Customers & providers ---------------------------------------------------
  INSERT INTO "Customer" (id, name, contact_phone, primary_contact_person, primary_contact_phone, payment_terms, created_by, updated_by, "createdAt", "updatedAt") VALUES
    (gen_random_uuid(), 'Al Noor Trading Co.',    '+966501110001', 'Faisal Al-Harbi',  '+966501110001', 'Net 30', d, d, '2026-06-15 10:00+03', '2026-06-15 10:00+03'),
    (gen_random_uuid(), 'Gulf Cement Supply',     '+966501110002', 'Omar Al-Qahtani',  '+966501110002', 'Net 30', d, d, '2026-06-15 10:00+03', '2026-06-15 10:00+03'),
    (gen_random_uuid(), 'Red Sea Logistics',      '+966501110003', 'Hassan Bakr',      '+966501110003', 'Net 30', d, d, '2026-06-15 10:00+03', '2026-06-15 10:00+03'),
    (gen_random_uuid(), 'Najd Steel Works',       '+966501110004', 'Saad Al-Otaibi',   '+966501110004', 'Net 30', d, d, '2026-06-15 10:00+03', '2026-06-15 10:00+03'),
    (gen_random_uuid(), 'Eastern Petro Services', '+966501110005', 'Khalid Al-Dossary','+966501110005', 'Net 30', d, d, '2026-06-15 10:00+03', '2026-06-15 10:00+03'),
    (gen_random_uuid(), 'Tabuk Agro Farms',       '+966501110006', 'Yousef Al-Anazi',  '+966501110006', 'Net 30', d, d, '2026-06-15 10:00+03', '2026-06-15 10:00+03');
  SELECT id INTO c_gulf FROM "Customer" WHERE name = 'Gulf Cement Supply' AND created_by = d;

  INSERT INTO "ThirdPartyProvider" (id, name, contact_person, phone, email, tax_id, notes, created_by, updated_by, "createdAt", "updatedAt") VALUES
    (gen_random_uuid(), 'Sahara Fuel Stations',  'Accounts Dept.', '+966112220001', 'ar@sahara-fuel.example',   '300000000100003', 'Fleet fuel card supplier', d, d, '2026-06-15 10:00+03', '2026-06-15 10:00+03'),
    (gen_random_uuid(), 'Desert Hawk Transport', 'Majed Al-Shammari', '+966112220002', 'ops@deserthawk.example', NULL, 'Subcontract haulage partner', d, d, '2026-06-15 10:00+03', '2026-06-15 10:00+03'),
    (gen_random_uuid(), 'Falcon Auto Workshop',  'Service Desk', '+966112220003', 'service@falconauto.example', '300000000200003', 'Maintenance & tyres', d, d, '2026-06-15 10:00+03', '2026-06-15 10:00+03'),
    (gen_random_uuid(), 'Gulf Shield Insurance', 'Corporate Desk', '+966112220004', 'corporate@gulfshield.example', '300000000300003', 'Fleet insurance', d, d, '2026-06-15 10:00+03', '2026-06-15 10:00+03')
  ON CONFLICT (name) DO NOTHING;
  SELECT id INTO p_hawk FROM "ThirdPartyProvider" WHERE name = 'Desert Hawk Transport';

  -- 5. July ----------------------------------------------------------------------
  b7 := finance_demo_tmp.bill('Gulf Shield Insurance', NULL, '2026-07-05 10:00+03', '2026-08-04 10:00+03',
        '[{"d":"Fleet insurance - Q3 2026","a":"6020","amt":62300}]', 9345, true);
  i1 := finance_demo_tmp.invoice('Al Noor Trading Co.', '2026-07-05 11:00+03', '2026-08-04 11:00+03',
        '[{"d":"Flatbed haulage Riyadh → Dammam (4 trips)","q":4,"r":2500}]', true);
  i2 := finance_demo_tmp.invoice('Gulf Cement Supply', '2026-07-12 11:00+03', '2026-08-11 11:00+03',
        '[{"d":"Flatbed haulage Riyadh → Al Kharj (3 trips)","q":3,"r":1800},{"d":"Reefer haulage Jeddah → Riyadh","q":1,"r":3500}]', true);
  PERFORM finance_demo_tmp.pay_bill(b7, 71645, '2026-07-20 13:00+03', '1020', 'Bank transfer', 'SNB-TRX-70211');
  i3 := finance_demo_tmp.invoice('Red Sea Logistics', '2026-07-20 11:00+03', '2026-08-19 11:00+03',
        '[{"d":"Lowbed haulage Jeddah → Yanbu (2 trips)","q":2,"r":6000}]', true);
  i4 := finance_demo_tmp.invoice('Najd Steel Works', '2026-07-28 11:00+03', '2026-08-27 11:00+03',
        '[{"d":"Flatbed haulage Riyadh → Buraydah (5 trips)","q":5,"r":2200}]', true);
  PERFORM finance_demo_tmp.pay_invoice(i1, 11500, '2026-07-30 10:00+03', '1010', 'Bank transfer', 'RJH-55120');
  b1 := finance_demo_tmp.bill('Sahara Fuel Stations', NULL, '2026-07-31 10:00+03', '2026-08-30 10:00+03',
        '[{"d":"Diesel - fleet fuel cards, July","a":"5010","amt":38000}]', 5700, true);
  PERFORM finance_demo_tmp.je('2026-07-31 16:00+03', 'Driver salaries - July 2026', 'Manual', NULL, 'Posted', '[
    {"a":"5020","dr":86000,"cr":0,"d":"July payroll"},{"a":"1010","dr":0,"cr":86000,"d":"Payroll transfer WPS"}]');
  PERFORM finance_demo_tmp.je('2026-07-31 16:30+03', 'Tolls & permits - July 2026', 'Manual', NULL, 'Posted', '[
    {"a":"5030","dr":11800,"cr":0,"d":"Road tolls and transit permits"},{"a":"1020","dr":0,"cr":11800,"d":"Paid from SNB"}]');

  -- 6. August --------------------------------------------------------------------
  i5 := finance_demo_tmp.invoice('Eastern Petro Services', '2026-08-03 11:00+03', '2026-09-02 11:00+03',
        '[{"d":"Tanker haulage Jubail → Dammam (6 trips)","q":6,"r":1500}]', true);
  PERFORM finance_demo_tmp.pay_invoice(i2, 10235, '2026-08-08 10:00+03', '1020', 'Bank transfer', 'SNB-TRX-80814');
  b2 := finance_demo_tmp.bill('Desert Hawk Transport', NULL, '2026-08-10 10:00+03', '2026-09-09 10:00+03',
        '[{"d":"Subcontract haulage Jeddah → Riyadh (3 trips)","a":"5050","amt":9600}]', 0, true);
  adv_gulf := finance_demo_tmp.advance('Customer', c_gulf, 'Received', 5000, '2026-08-10 12:00+03', '1010', '2300',
        'Advance from Gulf Cement Supply for September loads');
  i6 := finance_demo_tmp.invoice('Al Noor Trading Co.', '2026-08-14 11:00+03', '2026-09-13 11:00+03',
        '[{"d":"Flatbed haulage Riyadh → Dammam (6 trips)","q":6,"r":2500},{"d":"Detention / waiting time at Dammam port","q":1,"r":1200}]', true);
  PERFORM finance_demo_tmp.je('2026-08-15 12:00+03', 'Office supplies, software & utilities - August', 'Manual', NULL, 'Posted', '[
    {"a":"6030","dr":16400,"cr":0,"d":"G&A expenses"},{"a":"1020","dr":0,"cr":16400,"d":"Paid from SNB"}]');
  b3 := finance_demo_tmp.bill('Falcon Auto Workshop', NULL, '2026-08-18 10:00+03', '2026-09-17 10:00+03',
        '[{"d":"Brake overhaul - 2 tractors","a":"5040","amt":4200},{"d":"Tyres x6 (385/65 R22.5)","a":"5040","amt":7800}]', 0, true);
  i7 := finance_demo_tmp.invoice('Tabuk Agro Farms', '2026-08-20 11:00+03', '2026-09-19 11:00+03',
        '[{"d":"Reefer haulage Tabuk → Riyadh (2 trips)","q":2,"r":3000}]', true);
  PERFORM finance_demo_tmp.advance('Provider', p_hawk, 'Paid', 3000, '2026-08-20 14:00+03', '1020', '1400',
        'Advance to Desert Hawk Transport for September capacity');
  PERFORM finance_demo_tmp.void_invoice(i7, '2026-08-22 09:30+03');
  PERFORM finance_demo_tmp.pay_invoice(i4, 6000, '2026-08-25 10:00+03', '1010', 'Bank transfer', 'RJH-58833');
  PERFORM finance_demo_tmp.pay_bill(b1, 43700, '2026-08-25 13:00+03', '1010', 'Bank transfer', 'RJH-OUT-2291');
  PERFORM finance_demo_tmp.pay_bill(b2, 5000, '2026-08-30 13:00+03', '1020', 'Bank transfer', 'SNB-OUT-4410');
  b4 := finance_demo_tmp.bill('Sahara Fuel Stations', NULL, '2026-08-31 10:00+03', '2026-09-30 10:00+03',
        '[{"d":"Diesel - fleet fuel cards, August","a":"5010","amt":41500}]', 6225, true);
  PERFORM finance_demo_tmp.je('2026-08-31 16:00+03', 'Driver salaries - August 2026', 'Manual', NULL, 'Posted', '[
    {"a":"5020","dr":88500,"cr":0,"d":"August payroll"},{"a":"1010","dr":0,"cr":88500,"d":"Payroll transfer WPS"}]');
  PERFORM finance_demo_tmp.je('2026-08-31 16:30+03', 'Tolls & permits - August 2026', 'Manual', NULL, 'Posted', '[
    {"a":"5030","dr":12950,"cr":0,"d":"Road tolls and transit permits"},{"a":"1020","dr":0,"cr":12950,"d":"Paid from SNB"}]');

  -- 7. September -----------------------------------------------------------------
  PERFORM finance_demo_tmp.pay_invoice(i5, 10350, '2026-09-01 10:00+03', '1010', 'Bank transfer', 'RJH-60102');
  b5 := finance_demo_tmp.bill(NULL, 'Riyadh Office Landlord', '2026-09-01 09:00+03', '2026-09-05 09:00+03',
        '[{"d":"Office rent - Q3 2026","a":"6010","amt":45000}]', 0, true);
  i8 := finance_demo_tmp.invoice('Gulf Cement Supply', '2026-09-02 11:00+03', '2026-10-02 11:00+03',
        '[{"d":"Flatbed haulage Riyadh → Al Kharj (4 trips)","q":4,"r":1800}]', true);
  PERFORM finance_demo_tmp.advance('Employee', NULL, 'Paid', 2000, '2026-09-02 15:00+03', '1050', '1410',
        'Salary advance - driver (to be deducted from September payroll)');
  PERFORM finance_demo_tmp.pay_bill(b5, 45000, '2026-09-03 11:00+03', '1010', 'Bank transfer', 'RJH-OUT-2350');
  je_dup := finance_demo_tmp.je('2026-09-05 10:00+03', 'Toll reimbursement - trip claims', 'Manual', NULL, 'Posted', '[
    {"a":"5030","dr":1250,"cr":0,"d":"Toll receipts reimbursed"},{"a":"1050","dr":0,"cr":1250,"d":"Paid from petty cash"}]');
  PERFORM finance_demo_tmp.apply_advance_to_invoice(adv_gulf, i8, 2000, '2026-09-05 12:00+03');
  PERFORM finance_demo_tmp.void_je(je_dup, '2026-09-06 09:00+03', 'Duplicate entry - claims already booked in August tolls');
  i9 := finance_demo_tmp.invoice('Eastern Petro Services', '2026-09-10 11:00+03', '2026-10-10 11:00+03',
        '[{"d":"Tanker haulage Jubail → Dammam (8 trips)","q":8,"r":1500}]', true);
  PERFORM finance_demo_tmp.je('2026-09-10 12:00+03', 'Transfer Al Rajhi → Petty Cash', 'BankTransfer', NULL, 'Posted', '[
    {"a":"1050","dr":3000,"cr":0,"d":"Petty cash top-up"},{"a":"1010","dr":0,"cr":3000,"d":"Transfer out"}]');
  b8 := finance_demo_tmp.bill('Falcon Auto Workshop', NULL, '2026-09-12 10:00+03', '2026-10-12 10:00+03',
        '[{"d":"Clutch replacement (entered in error - duplicate of Aug bill)","a":"5040","amt":2500}]', 0, true);
  PERFORM finance_demo_tmp.void_bill(b8, '2026-09-13 09:00+03');
  PERFORM finance_demo_tmp.pay_invoice(i8, 3000, '2026-09-15 10:00+03', '1020', 'Cheque', 'CHQ-004418');
  PERFORM finance_demo_tmp.bill('Desert Hawk Transport', NULL, '2026-09-15 10:00+03', '2026-10-15 10:00+03',
        '[{"d":"Subcontract haulage Dammam → Riyadh (2 trips)","a":"5050","amt":6400}]', 0, false);
  i10 := finance_demo_tmp.invoice('Red Sea Logistics', '2026-09-16 11:00+03', '2026-10-16 11:00+03',
        '[{"d":"Lowbed haulage Jeddah → Yanbu (3 trips)","q":3,"r":6000}]', true);
  i11 := finance_demo_tmp.invoice('Najd Steel Works', '2026-09-19 11:00+03', '2026-10-19 11:00+03',
        '[{"d":"Flatbed haulage Riyadh → Buraydah (2 trips)","q":2,"r":2200}]', true);
  PERFORM finance_demo_tmp.je('2026-09-20 17:00+03', 'Accrued fuel - September 2026 (estimate)', 'Manual', NULL, 'Draft', '[
    {"a":"5010","dr":21000,"cr":0,"d":"Fuel consumed, invoice not yet received"},{"a":"2100","dr":0,"cr":21000,"d":"Accrual"}]');
  PERFORM finance_demo_tmp.invoice('Tabuk Agro Farms', '2026-09-21 11:00+03', '2026-10-21 11:00+03',
        '[{"d":"Reefer haulage Tabuk → Riyadh (2 trips)","q":2,"r":3000}]', false);
  PERFORM finance_demo_tmp.invoice('Al Noor Trading Co.', '2026-09-22 11:00+03', '2026-10-22 11:00+03',
        '[{"d":"Flatbed haulage Riyadh → Dammam (5 trips)","q":5,"r":2500}]', false);
  PERFORM finance_demo_tmp.je('2026-09-22 17:00+03', 'Driver salaries - September 2026', 'Manual', NULL, 'Draft', '[
    {"a":"5020","dr":90000,"cr":0,"d":"September payroll"},{"a":"1010","dr":0,"cr":90000,"d":"Payroll transfer WPS"}]');

  -- 8. Completed bank reconciliation: Al Rajhi, statement 31 Jul 2026 -----------
  rec := gen_random_uuid();
  INSERT INTO "BankReconciliation" (id, "bankAccountId", statement_date, statement_closing_balance, status, reconciled_by, reconciled_at, "createdAt")
  VALUES (rec, ba_rajhi, '2026-07-31 23:00+03',
          (SELECT sum(jl.debit - jl.credit) FROM "JournalLine" jl JOIN "JournalEntry" je ON je.id = jl."journalEntryId"
            WHERE jl."accountId" = finance_demo_tmp.acct('1010') AND je.status = 'Posted' AND je.entry_date <= '2026-07-31 23:59+03'
              AND je.created_by = d),
          'Completed', finance_demo_tmp.admin_id(), '2026-08-03 10:00+03', '2026-08-03 10:00+03');
  UPDATE "JournalLine" jl SET reconciled = true, "reconciliationId" = rec
    FROM "JournalEntry" je
   WHERE je.id = jl."journalEntryId" AND jl."accountId" = finance_demo_tmp.acct('1010') AND je.status = 'Posted'
     AND je.entry_date <= '2026-07-31 23:59+03' AND je.created_by = d;

  -- 9. Close June–August (only the periods this script created) ------------------
  UPDATE "AccountingPeriod" SET status = 'Closed', closed_by = finance_demo_tmp.admin_id(),
         closed_at = end_date + interval '5 days'
   WHERE created_by = d AND end_date < '2026-09-01 00:00:00+00';

  RAISE NOTICE 'Finance demo data loaded: % invoices, % bills, % journal entries.',
    (SELECT count(*) FROM "Invoice" WHERE created_by = d),
    (SELECT count(*) FROM "Bill" WHERE created_by = d),
    (SELECT count(*) FROM "JournalEntry" WHERE created_by = d);
END $$;

-- ─── Quick sanity checks (all "diff" values must be 0.00) ───────────────────
-- These count Posted + Voided entries (a voided original plus its posted reversal
-- net to zero, which is the correct accounting). NOTE: the app's reports currently
-- count only 'Posted', so a voided original is dropped while its reversal still counts,
-- and every void is applied twice there. That's an app bug, not a data problem.
SELECT 'Trial balance' AS "check", sum(debit) AS debit, sum(credit) AS credit, sum(debit) - sum(credit) AS diff
  FROM "JournalLine" jl JOIN "JournalEntry" je ON je.id = jl."journalEntryId" WHERE je.status IN ('Posted', 'Voided')
UNION ALL
SELECT 'AR subledger vs GL 1200',
       (SELECT sum(balance_due) FROM "Invoice" WHERE status IN ('Issued','PartiallyPaid') AND created_by = finance_demo_tmp.demo()),
       (SELECT sum(jl.debit - jl.credit) FROM "JournalLine" jl JOIN "JournalEntry" je ON je.id = jl."journalEntryId"
         WHERE jl."accountId" = finance_demo_tmp.acct('1200') AND je.status IN ('Posted','Voided') AND je.created_by = finance_demo_tmp.demo()),
       (SELECT sum(balance_due) FROM "Invoice" WHERE status IN ('Issued','PartiallyPaid') AND created_by = finance_demo_tmp.demo())
     - (SELECT sum(jl.debit - jl.credit) FROM "JournalLine" jl JOIN "JournalEntry" je ON je.id = jl."journalEntryId"
         WHERE jl."accountId" = finance_demo_tmp.acct('1200') AND je.status IN ('Posted','Voided') AND je.created_by = finance_demo_tmp.demo())
UNION ALL
SELECT 'AP subledger vs GL 2010',
       (SELECT sum(balance_due) FROM "Bill" WHERE status IN ('Approved','PartiallyPaid') AND created_by = finance_demo_tmp.demo()),
       (SELECT sum(jl.credit - jl.debit) FROM "JournalLine" jl JOIN "JournalEntry" je ON je.id = jl."journalEntryId"
         WHERE jl."accountId" = finance_demo_tmp.acct('2010') AND je.status IN ('Posted','Voided') AND je.created_by = finance_demo_tmp.demo()),
       (SELECT sum(balance_due) FROM "Bill" WHERE status IN ('Approved','PartiallyPaid') AND created_by = finance_demo_tmp.demo())
     - (SELECT sum(jl.credit - jl.debit) FROM "JournalLine" jl JOIN "JournalEntry" je ON je.id = jl."journalEntryId"
         WHERE jl."accountId" = finance_demo_tmp.acct('2010') AND je.status IN ('Posted','Voided') AND je.created_by = finance_demo_tmp.demo());

DROP SCHEMA finance_demo_tmp CASCADE;

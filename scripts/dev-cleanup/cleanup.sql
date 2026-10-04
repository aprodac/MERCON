-- Dev clean start (owner decision 2026-10-04): remove every trip, the demo and
-- test customers, the test drivers and all finance records, so real data can
-- be entered. Real customers (iMile, JDL, SHIPA, AKS, Horizon, GFS, JINGDONG),
-- their quotations and locations, the real drivers, all trucks and their
-- documents, users and settings stay.
--
-- Run only through dev-cleanup.sh. The wrapper appends ROLLBACK (preview) or
-- COMMIT (wipe); everything below happens in one transaction.

\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF current_database() NOT ILIKE '%dev%' THEN
    RAISE EXCEPTION 'Refusing to run: "%" is not a dev database', current_database();
  END IF;
END $$;

-- Row count of a table that may not exist yet (finance tables arrive with later migrations).
CREATE FUNCTION pg_temp.rows_in(t text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  IF to_regclass(format('%I', t)) IS NULL THEN RETURN 0; END IF;
  EXECUTE format('SELECT count(*) FROM %I', t) INTO n;
  RETURN n;
END $$;

-- ── What goes ──────────────────────────────────────────────────────────────
CREATE TEMP TABLE cleanup_customers AS
  SELECT id, name FROM "Customer"
  WHERE name IN ('Al Noor Trading Co.', 'Eastern Petro Services', 'Gulf Cement Supply', 'Najd Steel Works',
                 'Red Sea Logistics', 'Tabuk Agro Farms', 'CLAUDE TEST iMile', 'ZZ QA Customer');

CREATE TEMP TABLE cleanup_drivers AS
  SELECT id, "userId" FROM "Driver"
  WHERE trim(first_name || ' ' || coalesce(last_name, '')) IN ('ZZ QA Driver', 'Claude PushTest', 'Claude2 PushTest');

-- Test locations left on real customers ("CLAUDE TEST pickup", …), and locations already in the Recycle bin.
CREATE TEMP TABLE cleanup_locations AS
  SELECT id FROM "Location"
  WHERE "customerId" IN (SELECT id FROM cleanup_customers)
     OR name ILIKE 'CLAUDE %TEST%'
     OR "deletedAt" IS NOT NULL;

-- Quotations that use a test location are test quotations.
CREATE TEMP TABLE cleanup_quotations AS
  SELECT DISTINCT q.id FROM "Quotation" q
  LEFT JOIN "QuotationStop" s ON s."quotationId" = q.id
  WHERE q."customerId" IN (SELECT id FROM cleanup_customers)
     OR s."locationId" IN (SELECT id FROM cleanup_locations);

CREATE TEMP TABLE cleanup_docs AS
  SELECT id FROM "Document"
  WHERE entity_type = 'Trip'
     OR (entity_type = 'Customer' AND entity_id IN (SELECT id FROM cleanup_customers))
     OR (entity_type = 'Driver' AND entity_id IN (SELECT id FROM cleanup_drivers));

\echo
\echo '== Will be removed =='
SELECT 'trips (live + Recycle bin)' AS what, count(*) AS rows FROM "Trip"
UNION ALL SELECT 'trip stops', count(*) FROM "TripStop"
UNION ALL SELECT 'trip GPS points', count(*) FROM "TripLocation"
UNION ALL SELECT 'trip charges', count(*) FROM "TripCharge"
UNION ALL SELECT 'trip documents (POD, loading, other)', count(*) FROM "Document" WHERE entity_type = 'Trip'
UNION ALL SELECT 'files of removed documents', count(*) FROM "DocumentFile" WHERE "documentId" IN (SELECT id FROM cleanup_docs)
UNION ALL SELECT 'trip notifications', count(*) FROM "Notification" WHERE entity_type = 'Trip' OR "driverId" IN (SELECT id FROM cleanup_drivers)
UNION ALL SELECT 'customers (demo + test)', count(*) FROM cleanup_customers
UNION ALL SELECT 'quotations (test)', count(*) FROM cleanup_quotations
UNION ALL SELECT 'locations (test + Recycle bin)', count(*) FROM cleanup_locations
UNION ALL SELECT 'test drivers', count(*) FROM cleanup_drivers
UNION ALL SELECT 'invoices', pg_temp.rows_in('Invoice')
UNION ALL SELECT 'bills', pg_temp.rows_in('Bill')
UNION ALL SELECT 'expenses', pg_temp.rows_in('Expense')
UNION ALL SELECT 'driver settlements', pg_temp.rows_in('DriverSettlement')
UNION ALL SELECT 'journal entries', pg_temp.rows_in('JournalEntry');

\echo
\echo '== Customers being removed =='
SELECT name FROM cleanup_customers ORDER BY name;

-- ── Documents (files are moved off disk by the wrapper) ───────────────────
DELETE FROM "DocumentFile" WHERE "documentId" IN (SELECT id FROM cleanup_docs);
DELETE FROM "Document" WHERE id IN (SELECT id FROM cleanup_docs);
DELETE FROM "Notification" WHERE entity_type = 'Trip' OR "driverId" IN (SELECT id FROM cleanup_drivers);

-- ── Finance: every transaction record (chart of accounts, periods, bank accounts, settings stay) ──
\echo
\echo '== Finance + trip tables emptied (Postgres lists every table the cascade reaches) =='
DO $$
DECLARE
  t text;
  present text := '';
BEGIN
  FOREACH t IN ARRAY ARRAY['JournalLine', 'JournalEntry', 'InvoiceLine', 'InvoicePayment', 'CreditNoteLine', 'CreditNote',
                           'AdvanceApplication', 'Advance', 'Invoice', 'BillLine', 'BillPayment', 'Bill', 'BankReconciliation',
                           'DriverSettlementLine', 'DriverSettlement', 'AccountClosingBalance', 'Expense'] LOOP
    IF to_regclass(format('%I', t)) IS NOT NULL THEN
      present := present || CASE WHEN present = '' THEN '' ELSE ', ' END || format('%I', t);
    END IF;
  END LOOP;
  IF present <> '' THEN
    EXECUTE 'TRUNCATE ' || present || ' CASCADE';
  END IF;
END $$;

-- ── Every trip and what hangs off it (stops, GPS, charges, shares, acknowledgements…) ──
TRUNCATE "Trip" CASCADE;

-- ── Demo / test customers and test locations / quotations ─────────────────
DELETE FROM "SurchargeRule"
  WHERE "customerId" IN (SELECT id FROM cleanup_customers) OR "quotationId" IN (SELECT id FROM cleanup_quotations);
DELETE FROM "Quotation" WHERE id IN (SELECT id FROM cleanup_quotations);
DELETE FROM "QuotationStop" WHERE "locationId" IN (SELECT id FROM cleanup_locations);
DELETE FROM "ReportTemplate" WHERE "customerId" IN (SELECT id FROM cleanup_customers);
-- (tracking links go with the customer: ON DELETE CASCADE)
DELETE FROM "Location" WHERE id IN (SELECT id FROM cleanup_locations);
DELETE FROM "Customer" WHERE id IN (SELECT id FROM cleanup_customers);

-- ── Test drivers (devices, truck links, salaries go with them); their app login is switched off ──
UPDATE "Document" SET "executorDriverId" = NULL WHERE "executorDriverId" IN (SELECT id FROM cleanup_drivers);
DELETE FROM "Driver" WHERE id IN (SELECT id FROM cleanup_drivers);
UPDATE "User" SET "deletedAt" = NOW(), "isActive" = false
  WHERE id IN (SELECT "userId" FROM cleanup_drivers WHERE "userId" IS NOT NULL);

-- ── Nothing is on a trip any more ─────────────────────────────────────────
UPDATE "Driver" SET status = 'Available' WHERE status = 'OnTrip';
UPDATE "Vehicle" SET status = 'Available' WHERE status = 'OnTrip';

\echo
\echo '== After =='
SELECT 'trips' AS what, count(*) AS rows FROM "Trip"
UNION ALL SELECT 'customers', count(*) FROM "Customer"
UNION ALL SELECT 'quotations', count(*) FROM "Quotation"
UNION ALL SELECT 'locations', count(*) FROM "Location"
UNION ALL SELECT 'drivers', count(*) FROM "Driver"
UNION ALL SELECT 'trucks', count(*) FROM "Vehicle"
UNION ALL SELECT 'documents', count(*) FROM "Document";

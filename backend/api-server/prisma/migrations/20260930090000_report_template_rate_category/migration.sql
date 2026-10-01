-- A customer trip-sheet format can be limited to one rate category
-- (e.g. a separate "Extra trips" workbook). Additive, nullable.
ALTER TABLE "ReportTemplate" ADD COLUMN "rate_category" TEXT;

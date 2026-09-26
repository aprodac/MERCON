-- Prefix all soft-deleted trip reference IDs with TRP-DEL- and set isActive to FALSE
UPDATE "Trip"
SET 
  "ref_id" = CASE 
    WHEN "ref_id" LIKE 'TRP-%' AND NOT "ref_id" LIKE 'TRP-DEL-%'
    THEN REPLACE("ref_id", 'TRP-', 'TRP-DEL-')
    ELSE "ref_id"
  END,
  "isActive" = FALSE
WHERE "deletedAt" IS NOT NULL;

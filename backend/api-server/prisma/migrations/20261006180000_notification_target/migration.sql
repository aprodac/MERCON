-- Where a notification tap opens inside its entity (a trip's stop, or the
-- photos a driver sent). Null for existing rows: they open the entity page as
-- before. Additive only.

ALTER TABLE "Notification" ADD COLUMN "target" JSONB;

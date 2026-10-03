-- Settings for the floating assistant (what it reports, how it looks), edited
-- by an Admin in Settings -> Assistant. Additive only: one nullable column;
-- null means the defaults in @mercon/shared-types (AssistantConfig).

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "assistantConfig" JSONB;

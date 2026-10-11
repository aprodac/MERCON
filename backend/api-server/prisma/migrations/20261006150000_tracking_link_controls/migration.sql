-- Links page (operator app): per-link expiry, revoke, label, what the page shows,
-- and a rough city on each open. Additive only.

ALTER TABLE "trip_update_shares"
  ADD COLUMN "revokedAt" TIMESTAMPTZ,
  ADD COLUMN "revoked_by" UUID,
  ADD COLUMN "expiry_custom" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "label" TEXT,
  ADD COLUMN "show_deadline" BOOLEAN,
  ADD COLUMN "show_delay_reason" BOOLEAN,
  ADD COLUMN "show_photos" BOOLEAN,
  ADD COLUMN "show_driver" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "show_plate" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "show_position" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "customer_tracking_links"
  ADD COLUMN "revoked_by" UUID,
  ADD COLUMN "expiresAt" TIMESTAMPTZ,
  ADD COLUMN "label" TEXT,
  ADD COLUMN "show_deadline" BOOLEAN,
  ADD COLUMN "show_delay_reason" BOOLEAN,
  ADD COLUMN "show_photos" BOOLEAN,
  ADD COLUMN "show_driver" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "show_plate" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "show_position" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "tracking_link_opens"
  ADD COLUMN "city" TEXT,
  ADD COLUMN "country" TEXT;

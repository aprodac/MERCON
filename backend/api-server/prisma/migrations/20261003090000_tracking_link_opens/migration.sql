-- Tracking link open history: one row per time a customer opens a trip
-- tracking link or their all-trucks page, so ops see every open (when, which
-- device), not just the count. Additive only: one new table. No IP is stored.

-- CreateTable
CREATE TABLE "tracking_link_opens" (
    "id" UUID NOT NULL,
    "tripShareId" UUID,
    "customerLinkId" UUID,
    "opened_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "device" TEXT,

    CONSTRAINT "tracking_link_opens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tracking_link_opens_tripShareId_opened_at_idx" ON "tracking_link_opens"("tripShareId", "opened_at");

-- CreateIndex
CREATE INDEX "tracking_link_opens_customerLinkId_opened_at_idx" ON "tracking_link_opens"("customerLinkId", "opened_at");

-- AddForeignKey
ALTER TABLE "tracking_link_opens" ADD CONSTRAINT "tracking_link_opens_tripShareId_fkey" FOREIGN KEY ("tripShareId") REFERENCES "trip_update_shares"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_link_opens" ADD CONSTRAINT "tracking_link_opens_customerLinkId_fkey" FOREIGN KEY ("customerLinkId") REFERENCES "customer_tracking_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

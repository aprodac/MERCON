-- Customer tracking link, part 2: per-customer tracking settings, open counts
-- on links, a customer-wide tracking page, and the ops WhatsApp number for the
-- page's "Ask us" button. Additive only: new columns have defaults, one new table.

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "tracking_auto_link" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "tracking_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "tracking_show_deadline" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tracking_show_delay_reason" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tracking_show_photos" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "trip_update_shares" ADD COLUMN     "first_opened_at" TIMESTAMPTZ,
ADD COLUMN     "last_opened_at" TIMESTAMPTZ,
ADD COLUMN     "open_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "supportWhatsapp" TEXT;

-- CreateTable
CREATE TABLE "customer_tracking_links" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "created_by" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ,
    "open_count" INTEGER NOT NULL DEFAULT 0,
    "last_opened_at" TIMESTAMPTZ,

    CONSTRAINT "customer_tracking_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_tracking_links_token_key" ON "customer_tracking_links"("token");

-- CreateIndex
CREATE INDEX "customer_tracking_links_customerId_idx" ON "customer_tracking_links"("customerId");

-- AddForeignKey
ALTER TABLE "customer_tracking_links" ADD CONSTRAINT "customer_tracking_links_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;


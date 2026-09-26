-- CreateTable
CREATE TABLE "trip_update_shares" (
    "id" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "update_key" TEXT NOT NULL,
    "media_ids" UUID[],
    "token" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "recipient_phone" TEXT,
    "shared_by" UUID,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_update_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trip_update_shares_token_key" ON "trip_update_shares"("token");

-- CreateIndex
CREATE INDEX "trip_update_shares_tripId_update_key_idx" ON "trip_update_shares"("tripId", "update_key");

-- AddForeignKey
ALTER TABLE "trip_update_shares" ADD CONSTRAINT "trip_update_shares_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_update_shares" ADD CONSTRAINT "trip_update_shares_shared_by_fkey" FOREIGN KEY ("shared_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


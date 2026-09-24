-- CreateTable
CREATE TABLE IF NOT EXISTS "error_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fingerprint" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "route" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'New',
    "lastRequestId" TEXT,
    "firstUserId" UUID,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "error_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "error_events_fingerprint_key" ON "error_events"("fingerprint");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "error_events_status_idx" ON "error_events"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "error_events_source_idx" ON "error_events"("source");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "error_events_updatedAt_idx" ON "error_events"("updatedAt");

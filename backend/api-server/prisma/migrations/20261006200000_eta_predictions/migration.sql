-- ETA predictions per stop, to measure how accurate ETAs are (services/tracking/etaWatcher.ts).
-- New table only; nothing existing changes.

-- CreateTable
CREATE TABLE "EtaPrediction" (
    "id" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "stopId" UUID NOT NULL,
    "predictedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "predictedArrival" TIMESTAMPTZ NOT NULL,
    "distanceMeters" INTEGER NOT NULL,
    "approx" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "EtaPrediction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EtaPrediction_stopId_idx" ON "EtaPrediction"("stopId");

-- CreateIndex
CREATE INDEX "EtaPrediction_predictedAt_idx" ON "EtaPrediction"("predictedAt");


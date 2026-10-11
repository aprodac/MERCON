-- Truck tracker history during trips (TripLocation.source = 'vehicle'; existing rows are the
-- driver app's, so they default to 'driver') and a cache of place names for map points.
-- Additive only: a column with a default and a new table.

-- AlterTable
ALTER TABLE "TripLocation" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'driver';

-- CreateTable
CREATE TABLE "PlaceName" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaceName_pkey" PRIMARY KEY ("key")
);


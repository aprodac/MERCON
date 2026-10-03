-- One-time repair: driver / truck status drifted from their trips (QA pass 2026-10-03).
-- Before the fix, completing / reassigning / cancelling one trip set the driver and
-- truck to Available even when another of their trips was still running.
-- The code now only frees them when nothing else is running; this lines up the
-- existing rows. Safe to run more than once. Run on dev first, then production.

BEGIN;

-- Drivers with a running trip (Loading / In transit / Delayed) are On trip.
UPDATE "Driver" d SET status = 'OnTrip'
WHERE d."deletedAt" IS NULL AND d.status = 'Available'
  AND EXISTS (
    SELECT 1 FROM "Trip" t
    WHERE t."deletedAt" IS NULL AND t.status IN ('Loading', 'InTransit', 'Delayed')
      AND (t."driverId" = d.id OR t.co_driver_id = d.id));

-- Drivers marked On trip with nothing running are Available.
UPDATE "Driver" d SET status = 'Available'
WHERE d."deletedAt" IS NULL AND d.status = 'OnTrip'
  AND NOT EXISTS (
    SELECT 1 FROM "Trip" t
    WHERE t."deletedAt" IS NULL AND t.status IN ('Loading', 'InTransit', 'Delayed')
      AND (t."driverId" = d.id OR t.co_driver_id = d.id));

-- Same for trucks. Trucks in Maintenance / Inactive are left alone.
UPDATE "Vehicle" v SET status = 'OnTrip'
WHERE v."deletedAt" IS NULL AND v.status = 'Available'
  AND EXISTS (
    SELECT 1 FROM "Trip" t
    WHERE t."deletedAt" IS NULL AND t.status IN ('Loading', 'InTransit', 'Delayed') AND t."vehicleId" = v.id);

UPDATE "Vehicle" v SET status = 'Available'
WHERE v."deletedAt" IS NULL AND v.status = 'OnTrip'
  AND NOT EXISTS (
    SELECT 1 FROM "Trip" t
    WHERE t."deletedAt" IS NULL AND t.status IN ('Loading', 'InTransit', 'Delayed') AND t."vehicleId" = v.id);

COMMIT;

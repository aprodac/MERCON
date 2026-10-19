-- The driver app's language, so lock-screen pushes can be written in Urdu.
ALTER TABLE "driver_devices" ADD COLUMN "language" TEXT;

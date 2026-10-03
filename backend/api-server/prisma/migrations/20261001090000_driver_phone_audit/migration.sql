-- Driver phone health & notification audit (docs/DRIVER_PHONE_AUDIT_PLAN.md).
-- Additive: new nullable columns, three new tables; driver_devices.token becomes
-- nullable so phones that denied notifications can still report health.

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "driverAppMinVersion" TEXT;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "opened_at" TIMESTAMPTZ,
ADD COLUMN     "read_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "driver_devices" ADD COLUMN     "app_version" TEXT,
ADD COLUMN     "battery_level" DOUBLE PRECISION,
ADD COLUMN     "build_number" TEXT,
ADD COLUMN     "device_model" TEXT,
ADD COLUMN     "health_reported_at" TIMESTAMPTZ,
ADD COLUMN     "install_id" TEXT,
ADD COLUMN     "location_permission" TEXT,
ADD COLUMN     "location_services_on" BOOLEAN,
ADD COLUMN     "low_power_mode" BOOLEAN,
ADD COLUMN     "network_type" TEXT,
ADD COLUMN     "notif_permission" TEXT,
ADD COLUMN     "os_name" TEXT,
ADD COLUMN     "os_version" TEXT,
ALTER COLUMN "token" DROP NOT NULL;

-- CreateTable
CREATE TABLE "push_deliveries" (
    "id" UUID NOT NULL,
    "notificationId" UUID NOT NULL,
    "deviceId" UUID,
    "status" TEXT NOT NULL,
    "expo_ticket_id" TEXT,
    "error_code" TEXT,
    "error_message" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "sent_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receipt_checked_at" TIMESTAMPTZ,

    CONSTRAINT "push_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_acknowledgements" (
    "id" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "driverId" UUID NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_acknowledgements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_activity_events" (
    "id" UUID NOT NULL,
    "driverId" UUID NOT NULL,
    "tripId" UUID,
    "type" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_activity_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "push_deliveries_notificationId_idx" ON "push_deliveries"("notificationId");

-- CreateIndex
CREATE INDEX "push_deliveries_status_sent_at_idx" ON "push_deliveries"("status", "sent_at");

-- CreateIndex
CREATE INDEX "trip_acknowledgements_tripId_createdAt_idx" ON "trip_acknowledgements"("tripId", "createdAt");

-- CreateIndex
CREATE INDEX "trip_acknowledgements_driverId_createdAt_idx" ON "trip_acknowledgements"("driverId", "createdAt");

-- CreateIndex
CREATE INDEX "driver_activity_events_driverId_createdAt_idx" ON "driver_activity_events"("driverId", "createdAt");

-- CreateIndex
CREATE INDEX "driver_activity_events_tripId_createdAt_idx" ON "driver_activity_events"("tripId", "createdAt");

-- CreateIndex
CREATE INDEX "driver_activity_events_createdAt_idx" ON "driver_activity_events"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "driver_devices_install_id_key" ON "driver_devices"("install_id");

-- AddForeignKey
ALTER TABLE "push_deliveries" ADD CONSTRAINT "push_deliveries_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_deliveries" ADD CONSTRAINT "push_deliveries_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "driver_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_acknowledgements" ADD CONSTRAINT "trip_acknowledgements_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_acknowledgements" ADD CONSTRAINT "trip_acknowledgements_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_activity_events" ADD CONSTRAINT "driver_activity_events_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_activity_events" ADD CONSTRAINT "driver_activity_events_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;


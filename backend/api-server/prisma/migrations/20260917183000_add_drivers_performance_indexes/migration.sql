-- CreateIndex
CREATE INDEX "Driver_license_expiry_idx" ON "Driver"("license_expiry");

-- CreateIndex
CREATE INDEX "Driver_first_name_last_name_idx" ON "Driver"("first_name", "last_name");

-- CreateIndex
CREATE INDEX "Trip_driverId_status_deletedAt_idx" ON "Trip"("driverId", "status", "deletedAt");

-- CreateIndex
CREATE INDEX "Trip_co_driver_id_status_deletedAt_idx" ON "Trip"("co_driver_id", "status", "deletedAt");

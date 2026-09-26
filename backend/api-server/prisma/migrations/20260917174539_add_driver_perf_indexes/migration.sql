-- CreateIndex
CREATE INDEX "Driver_deletedAt_license_expiry_idx" ON "Driver"("deletedAt", "license_expiry");

-- CreateIndex
CREATE INDEX "Driver_deletedAt_createdAt_idx" ON "Driver"("deletedAt", "createdAt");

-- Driver trip-pay settlements. Additive: two new tables, one nullable column on Settings and one
-- on AdvanceApplication. Nothing existing changes.

ALTER TABLE "Settings" ADD COLUMN "defaultDriverPayAccountId" UUID;

CREATE TABLE "DriverSettlement" (
    "id" UUID NOT NULL,
    "ref_id" TEXT,
    "driverId" UUID NOT NULL,
    "period_from" TIMESTAMPTZ,
    "period_to" TIMESTAMPTZ,
    "status" TEXT NOT NULL DEFAULT 'Paid',
    "gross_amount" DECIMAL(12,2) NOT NULL,
    "advance_deducted" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
    "net_amount" DECIMAL(12,2) NOT NULL,
    "paid_date" TIMESTAMPTZ NOT NULL,
    "paymentAccountId" UUID,
    "reference" TEXT,
    "notes" TEXT,
    "journalEntryId" UUID,
    "voidedAt" TIMESTAMPTZ,
    "created_by" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DriverSettlement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DriverSettlement_ref_id_key" ON "DriverSettlement"("ref_id");
CREATE INDEX "DriverSettlement_driverId_idx" ON "DriverSettlement"("driverId");
CREATE INDEX "DriverSettlement_status_idx" ON "DriverSettlement"("status");
ALTER TABLE "DriverSettlement" ADD CONSTRAINT "DriverSettlement_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "DriverSettlementLine" (
    "id" UUID NOT NULL,
    "settlementId" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    CONSTRAINT "DriverSettlementLine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DriverSettlementLine_tripId_role_key" ON "DriverSettlementLine"("tripId", "role");
CREATE INDEX "DriverSettlementLine_settlementId_idx" ON "DriverSettlementLine"("settlementId");
ALTER TABLE "DriverSettlementLine" ADD CONSTRAINT "DriverSettlementLine_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "DriverSettlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DriverSettlementLine" ADD CONSTRAINT "DriverSettlementLine_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AdvanceApplication" ADD COLUMN "driverSettlementId" UUID;
CREATE INDEX "AdvanceApplication_driverSettlementId_idx" ON "AdvanceApplication"("driverSettlementId");
ALTER TABLE "AdvanceApplication" ADD CONSTRAINT "AdvanceApplication_driverSettlementId_fkey" FOREIGN KEY ("driverSettlementId") REFERENCES "DriverSettlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Maintenance: cost lines (parts / labour / other), VAT and paid / to-pay on service orders,
-- expected return date, and service plans (repeat by km or days). Additive.

ALTER TABLE "MaintenanceRecord" ADD COLUMN     "expected_end_date" TIMESTAMPTZ,
ADD COLUMN     "paymentAccountId" UUID,
ADD COLUMN     "payment_status" TEXT NOT NULL DEFAULT 'Paid',
ADD COLUMN     "vat_amount" DECIMAL(12,2) NOT NULL DEFAULT 0.0;

CREATE TABLE "MaintenanceItem" (
    "id" UUID NOT NULL,
    "recordId" UUID NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'other',
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
    "servicePlanId" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MaintenanceItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServicePlan" (
    "id" UUID NOT NULL,
    "task" TEXT NOT NULL,
    "asset_type" "AssetType",
    "vehicleId" UUID,
    "interval_km" INTEGER,
    "interval_days" INTEGER,
    "warn_km" INTEGER NOT NULL DEFAULT 1000,
    "warn_days" INTEGER NOT NULL DEFAULT 14,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServicePlan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MaintenanceItem_recordId_idx" ON "MaintenanceItem"("recordId");

CREATE INDEX "MaintenanceItem_servicePlanId_idx" ON "MaintenanceItem"("servicePlanId");

CREATE INDEX "ServicePlan_asset_type_idx" ON "ServicePlan"("asset_type");

CREATE INDEX "ServicePlan_vehicleId_idx" ON "ServicePlan"("vehicleId");

ALTER TABLE "MaintenanceItem" ADD CONSTRAINT "MaintenanceItem_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "MaintenanceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MaintenanceItem" ADD CONSTRAINT "MaintenanceItem_servicePlanId_fkey" FOREIGN KEY ("servicePlanId") REFERENCES "ServicePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ServicePlan" ADD CONSTRAINT "ServicePlan_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Existing orders keep their total as one line, so every order has lines
INSERT INTO "MaintenanceItem" ("id", "recordId", "kind", "description", "quantity", "unit_price", "amount", "sort_order")
SELECT gen_random_uuid(), r."id", 'other', COALESCE(NULLIF(TRIM(r."work_done"), ''), r."maintenance_type", 'Service'), 1, r."cost", r."cost", 0
FROM "MaintenanceRecord" r
WHERE r."cost" > 0;

-- CreateEnum
CREATE TYPE "CostFrequency" AS ENUM ('Monthly', 'Yearly');

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "purchase_date" TIMESTAMPTZ,
ADD COLUMN     "purchase_price" DECIMAL(12,2),
ADD COLUMN     "residual_value" DECIMAL(12,2),
ADD COLUMN     "useful_life_years" INTEGER;

-- AlterTable
ALTER TABLE "BillLine" ADD COLUMN     "vehicleId" UUID;

-- CreateTable
CREATE TABLE "VehicleFixedCost" (
    "id" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "frequency" "CostFrequency" NOT NULL DEFAULT 'Monthly',
    "start_date" TIMESTAMPTZ NOT NULL,
    "end_date" TIMESTAMPTZ,
    "notes" TEXT,
    "created_by" UUID,
    "updated_by" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "VehicleFixedCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverSalary" (
    "id" UUID NOT NULL,
    "driverId" UUID NOT NULL,
    "base_salary" DECIMAL(12,2) NOT NULL,
    "allowances" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
    "employer_costs" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
    "effective_from" TIMESTAMPTZ NOT NULL,
    "effective_to" TIMESTAMPTZ,
    "notes" TEXT,
    "created_by" UUID,
    "updated_by" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "DriverSalary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VehicleFixedCost_vehicleId_deletedAt_idx" ON "VehicleFixedCost"("vehicleId", "deletedAt");

-- CreateIndex
CREATE INDEX "DriverSalary_driverId_deletedAt_idx" ON "DriverSalary"("driverId", "deletedAt");

-- CreateIndex
CREATE INDEX "BillLine_vehicleId_idx" ON "BillLine"("vehicleId");

-- AddForeignKey
ALTER TABLE "VehicleFixedCost" ADD CONSTRAINT "VehicleFixedCost_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverSalary" ADD CONSTRAINT "DriverSalary_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillLine" ADD CONSTRAINT "BillLine_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "crNumber" TEXT,
ADD COLUMN "vatNumber" TEXT;

-- AlterTable
ALTER TABLE "Trip" ADD COLUMN "awb_number" TEXT;

-- AlterTable
ALTER TABLE "user_devices" ADD COLUMN     "api_base" TEXT;

-- AlterTable
ALTER TABLE "push_deliveries" ADD COLUMN     "received_at" TIMESTAMPTZ;


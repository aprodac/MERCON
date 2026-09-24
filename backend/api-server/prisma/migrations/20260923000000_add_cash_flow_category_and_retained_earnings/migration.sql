-- CreateEnum
CREATE TYPE "CashFlowCategory" AS ENUM ('Operating', 'Investing', 'Financing');

-- AlterTable
ALTER TABLE "Account" ADD COLUMN "cash_flow_category" "CashFlowCategory";

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "defaultRetainedEarningsAccountId" UUID;

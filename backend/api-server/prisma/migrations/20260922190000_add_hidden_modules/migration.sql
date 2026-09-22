-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "hiddenModules" TEXT[] DEFAULT ARRAY[]::TEXT[];

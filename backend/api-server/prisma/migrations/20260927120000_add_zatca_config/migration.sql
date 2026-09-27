-- CreateEnum
CREATE TYPE "ZatcaEnvironment" AS ENUM ('Sandbox', 'Simulation', 'Production');

-- CreateEnum
CREATE TYPE "ZatcaOnboardingStatus" AS ENUM ('NotStarted', 'ProfileSaved', 'ComplianceIssued', 'ComplianceChecked', 'Active');

-- CreateTable
CREATE TABLE "ZatcaConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "environment" "ZatcaEnvironment" NOT NULL DEFAULT 'Sandbox',
    "status" "ZatcaOnboardingStatus" NOT NULL DEFAULT 'NotStarted',
    "sellerNameAr" TEXT,
    "sellerNameEn" TEXT,
    "vatNumber" TEXT,
    "crNumber" TEXT,
    "branchName" TEXT,
    "businessCategory" TEXT,
    "invoiceTypes" TEXT NOT NULL DEFAULT '1000',
    "buildingNumber" TEXT,
    "streetName" TEXT,
    "district" TEXT,
    "city" TEXT,
    "postalCode" TEXT,
    "additionalNumber" TEXT,
    "shortAddress" TEXT,
    "egsSerial" TEXT,
    "egsCommonName" TEXT,
    "privateKeyEnc" TEXT,
    "csrPem" TEXT,
    "complianceRequestId" TEXT,
    "complianceCertificate" TEXT,
    "complianceSecretEnc" TEXT,
    "complianceIssuedAt" TIMESTAMPTZ,
    "complianceChecks" JSONB,
    "productionRequestId" TEXT,
    "productionCertificate" TEXT,
    "productionSecretEnc" TEXT,
    "productionIssuedAt" TIMESTAMPTZ,
    "certificateExpiresAt" TIMESTAMPTZ,
    "lastError" TEXT,
    "lastErrorAt" TIMESTAMPTZ,
    "invoiceCounter" INTEGER NOT NULL DEFAULT 0,
    "previousInvoiceHash" TEXT,
    "updated_by" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ZatcaConfig_pkey" PRIMARY KEY ("id")
);


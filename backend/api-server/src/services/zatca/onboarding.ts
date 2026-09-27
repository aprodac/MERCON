import crypto from 'crypto';
import { Prisma, type ZatcaConfig } from '@prisma/client';
import type { ZatcaStatus } from '@mercon/shared-types';
import { prisma } from '../../db';
import { generateKeyAndCsr } from './csr';
import { canOpen, dataKeyConfigured, openSecret, sealSecret } from '../secrets/secretBox';
import { certificateExpiry, requestComplianceCsid, requestProductionCsid, ZatcaApiError } from './zatcaApi';
import type { ZatcaProfileInput } from '../../schemas/zatcaSchemas';

const SINGLETON_ID = 'singleton';

/** Identifies our software in the CSR serial ("1-<solution>|2-<model>|3-<unit serial>"). */
const SOLUTION_NAME = 'Aprodac';
const SOLUTION_MODEL = 'Fleet-1.0';

export class ZatcaOnboardingError extends Error {
  constructor(public readonly httpStatus: number, public readonly code: string, message: string) {
    super(message);
    this.name = 'ZatcaOnboardingError';
  }
}

export async function getZatcaConfig(): Promise<ZatcaConfig> {
  return prisma.zatcaConfig.upsert({ where: { id: SINGLETON_ID }, update: {}, create: { id: SINGLETON_ID } });
}

const PROFILE_FIELDS = [
  'sellerNameAr', 'vatNumber', 'crNumber', 'branchName', 'businessCategory',
  'buildingNumber', 'streetName', 'district', 'city', 'postalCode',
] as const;

/** Everything the page needs — never the private key or API secrets. */
export function toStatus(config: ZatcaConfig): ZatcaStatus {
  return {
    environment: config.environment,
    status: config.status,
    profile: {
      sellerNameAr: config.sellerNameAr,
      sellerNameEn: config.sellerNameEn,
      vatNumber: config.vatNumber,
      crNumber: config.crNumber,
      branchName: config.branchName,
      businessCategory: config.businessCategory,
      invoiceTypes: config.invoiceTypes as ZatcaStatus['profile']['invoiceTypes'],
      buildingNumber: config.buildingNumber,
      streetName: config.streetName,
      district: config.district,
      city: config.city,
      postalCode: config.postalCode,
      additionalNumber: config.additionalNumber,
      shortAddress: config.shortAddress,
    },
    missingProfileFields: PROFILE_FIELDS.filter((f) => !config[f]),
    profileLocked: isLocked(config),
    egs: {
      serial: config.egsSerial,
      commonName: config.egsCommonName,
      hasPrivateKey: Boolean(config.privateKeyEnc),
    },
    complianceIssuedAt: config.complianceIssuedAt?.toISOString() ?? null,
    complianceChecks: (config.complianceChecks as ZatcaStatus['complianceChecks']) ?? null,
    productionIssuedAt: config.productionIssuedAt?.toISOString() ?? null,
    certificateExpiresAt: config.certificateExpiresAt?.toISOString() ?? null,
    lastError: config.lastError,
    lastErrorAt: config.lastErrorAt?.toISOString() ?? null,
    encryptionKeyConfigured: dataKeyConfigured(),
    certificateUnreadable: [config.privateKeyEnc, config.complianceSecretEnc, config.productionSecretEnc].some((v) => v !== null && !canOpen(v)),
    invoicesIssued: config.invoiceCounter,
  };
}

/** Once ZATCA has issued a certificate, the details baked into it can't change without a reset. */
function isLocked(config: ZatcaConfig): boolean {
  return config.status === 'ComplianceIssued' || config.status === 'ComplianceChecked' || config.status === 'Active';
}

export async function saveProfile(input: ZatcaProfileInput, userId?: string): Promise<ZatcaConfig> {
  const config = await getZatcaConfig();
  if (isLocked(config)) {
    throw new ZatcaOnboardingError(
      409,
      'ZATCA_PROFILE_LOCKED',
      'These details are inside the certificate ZATCA issued. Reset the connection to change them.',
    );
  }
  return prisma.zatcaConfig.update({
    where: { id: SINGLETON_ID },
    data: {
      ...input,
      sellerNameEn: input.sellerNameEn ?? null,
      additionalNumber: input.additionalNumber ?? null,
      shortAddress: input.shortAddress ?? null,
      status: 'ProfileSaved',
      lastError: null,
      lastErrorAt: null,
      updated_by: userId ?? null,
    },
  });
}

/** OTP step: generate the key pair + CSR and get the compliance certificate. */
export async function connectWithOtp(otp: string, userId?: string): Promise<ZatcaConfig> {
  const config = await getZatcaConfig();
  if (!dataKeyConfigured()) {
    throw new ZatcaOnboardingError(409, 'DATA_KEY_MISSING', 'This server has no DATA_ENCRYPTION_KEY yet. Aprodac’s deploy creates it; ask Aprodac to redeploy.');
  }
  if (config.status !== 'ProfileSaved') {
    throw new ZatcaOnboardingError(
      409,
      'ZATCA_WRONG_STEP',
      config.status === 'NotStarted' ? 'Save the business details first.' : 'Already connected. Reset the connection to connect again.',
    );
  }
  const missing = PROFILE_FIELDS.filter((f) => !config[f]);
  if (missing.length) {
    throw new ZatcaOnboardingError(400, 'ZATCA_PROFILE_INCOMPLETE', `Missing: ${missing.join(', ')}`);
  }

  const egsSerial = config.egsSerial ?? `1-${SOLUTION_NAME}|2-${SOLUTION_MODEL}|3-${crypto.randomUUID()}`;
  const egsCommonName = config.egsCommonName ?? `EGS-${config.vatNumber}-${crypto.randomBytes(3).toString('hex')}`;
  const { privateKeyPem, csrPem } = generateKeyAndCsr({
    environment: config.environment,
    commonName: egsCommonName,
    organizationName: config.sellerNameAr!,
    organizationUnit: config.branchName!,
    vatNumber: config.vatNumber!,
    egsSerial,
    invoiceTypes: config.invoiceTypes,
    registeredAddress: config.shortAddress || `${config.buildingNumber} ${config.streetName}, ${config.city}`,
    businessCategory: config.businessCategory!,
  });

  try {
    const csid = await requestComplianceCsid(config.environment, otp, csrPem);
    return prisma.zatcaConfig.update({
      where: { id: SINGLETON_ID },
      data: {
        egsSerial,
        egsCommonName,
        privateKeyEnc: sealSecret(privateKeyPem),
        csrPem,
        complianceRequestId: csid.requestId,
        complianceCertificate: csid.binarySecurityToken,
        complianceSecretEnc: sealSecret(csid.secret),
        complianceIssuedAt: new Date(),
        complianceChecks: Prisma.DbNull,
        status: 'ComplianceIssued',
        lastError: null,
        lastErrorAt: null,
        updated_by: userId ?? null,
      },
    });
  } catch (err) {
    await recordError(err);
    throw err;
  }
}

/** Last step, after ZATCA has accepted the sample invoices. */
export async function activateProduction(userId?: string): Promise<ZatcaConfig> {
  const config = await getZatcaConfig();
  if (config.status !== 'ComplianceChecked') {
    throw new ZatcaOnboardingError(
      409,
      'ZATCA_WRONG_STEP',
      config.status === 'Active' ? 'Already active.' : 'ZATCA’s compliance checks must pass before the production certificate can be requested.',
    );
  }
  try {
    const csid = await requestProductionCsid(
      config.environment,
      config.complianceCertificate!,
      openSecret(config.complianceSecretEnc!),
      config.complianceRequestId!,
    );
    return prisma.zatcaConfig.update({
      where: { id: SINGLETON_ID },
      data: {
        productionRequestId: csid.requestId,
        productionCertificate: csid.binarySecurityToken,
        productionSecretEnc: sealSecret(csid.secret),
        productionIssuedAt: new Date(),
        certificateExpiresAt: certificateExpiry(csid.binarySecurityToken) ?? null,
        status: 'Active',
        lastError: null,
        lastErrorAt: null,
        updated_by: userId ?? null,
      },
    });
  } catch (err) {
    await recordError(err);
    throw err;
  }
}

/**
 * Drops the key and certificates so onboarding can start again (wrong details,
 * switching environment). The invoice counter and hash chain are kept: they
 * belong to invoices already issued, not to the certificate.
 */
export async function resetConnection(opts: { userId?: string; isSuperAdmin: boolean }): Promise<ZatcaConfig> {
  const config = await getZatcaConfig();
  if (config.environment === 'Production' && config.status === 'Active' && !opts.isSuperAdmin) {
    throw new ZatcaOnboardingError(
      403,
      'ZATCA_RESET_FORBIDDEN',
      'This deployment is live with ZATCA. Only Aprodac can reset a live production connection.',
    );
  }
  const profileComplete = PROFILE_FIELDS.every((f) => config[f]);
  return prisma.zatcaConfig.update({
    where: { id: SINGLETON_ID },
    data: {
      status: profileComplete ? 'ProfileSaved' : 'NotStarted',
      egsSerial: null,
      egsCommonName: null,
      privateKeyEnc: null,
      csrPem: null,
      complianceRequestId: null,
      complianceCertificate: null,
      complianceSecretEnc: null,
      complianceIssuedAt: null,
      complianceChecks: Prisma.DbNull,
      productionRequestId: null,
      productionCertificate: null,
      productionSecretEnc: null,
      productionIssuedAt: null,
      certificateExpiresAt: null,
      lastError: null,
      lastErrorAt: null,
      updated_by: opts.userId ?? null,
    },
  });
}

async function recordError(err: unknown) {
  const message = err instanceof ZatcaApiError || err instanceof Error ? err.message : 'Unknown error';
  await prisma.zatcaConfig
    .update({ where: { id: SINGLETON_ID }, data: { lastError: message.slice(0, 1000), lastErrorAt: new Date() } })
    .catch(() => undefined);
}

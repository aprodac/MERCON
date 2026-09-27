import axios, { AxiosError } from 'axios';
import { X509Certificate } from 'crypto';
import type { ZatcaEnvironmentKey } from './csr';

/**
 * ZATCA Fatoora gateway. Endpoints and headers follow the Fatoora developer
 * portal API reference (compliance CSID, production CSID).
 */
export const ZATCA_BASE_URLS: Record<ZatcaEnvironmentKey, string> = {
  Sandbox: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal',
  Simulation: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation',
  Production: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core',
};

export interface CsidResponse {
  requestId: string;
  binarySecurityToken: string;
  secret: string;
  dispositionMessage?: string;
}

export class ZatcaApiError extends Error {
  constructor(message: string, public readonly httpStatus?: number) {
    super(message);
    this.name = 'ZatcaApiError';
  }
}

const COMMON_HEADERS = {
  'Accept-Version': 'V2',
  'Accept-Language': 'en',
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

const TIMEOUT_MS = 30_000;

/** Step 1 of onboarding: trade the taxpayer's OTP + our CSR for a compliance certificate. */
export async function requestComplianceCsid(environment: ZatcaEnvironmentKey, otp: string, csrPem: string): Promise<CsidResponse> {
  try {
    const res = await axios.post(
      `${ZATCA_BASE_URLS[environment]}/compliance`,
      { csr: Buffer.from(csrPem, 'utf8').toString('base64') },
      { headers: { ...COMMON_HEADERS, OTP: otp }, timeout: TIMEOUT_MS },
    );
    return toCsid(res.data);
  } catch (err) {
    throw toZatcaError(err, 'ZATCA rejected the compliance certificate request');
  }
}

/** Final step: exchange the compliance certificate (after checks pass) for the production one. */
export async function requestProductionCsid(
  environment: ZatcaEnvironmentKey,
  complianceToken: string,
  complianceSecret: string,
  complianceRequestId: string,
): Promise<CsidResponse> {
  try {
    const res = await axios.post(
      `${ZATCA_BASE_URLS[environment]}/production/csids`,
      { compliance_request_id: complianceRequestId },
      {
        headers: { ...COMMON_HEADERS, Authorization: basicAuth(complianceToken, complianceSecret) },
        timeout: TIMEOUT_MS,
      },
    );
    return toCsid(res.data);
  } catch (err) {
    throw toZatcaError(err, 'ZATCA rejected the production certificate request');
  }
}

export function basicAuth(token: string, secret: string): string {
  return `Basic ${Buffer.from(`${token}:${secret}`, 'utf8').toString('base64')}`;
}

/**
 * binarySecurityToken is base64 of the certificate's base64 DER text. Returns
 * undefined rather than throwing: expiry is informational, not a reason to
 * discard a certificate ZATCA just issued.
 */
export function certificateExpiry(binarySecurityToken: string): Date | undefined {
  try {
    const der = Buffer.from(Buffer.from(binarySecurityToken, 'base64').toString('utf8'), 'base64');
    return new Date(new X509Certificate(der).validTo);
  } catch {
    return undefined;
  }
}

function toCsid(data: any): CsidResponse {
  if (!data?.binarySecurityToken || !data?.secret || data?.requestID === undefined) {
    throw new ZatcaApiError('ZATCA returned an unexpected response (no certificate in it)');
  }
  return {
    requestId: String(data.requestID),
    binarySecurityToken: data.binarySecurityToken,
    secret: data.secret,
    dispositionMessage: data.dispositionMessage,
  };
}

/** Turns ZATCA's several error shapes into one readable sentence. */
export function toZatcaError(err: unknown, fallback: string): ZatcaApiError {
  if (err instanceof ZatcaApiError) return err;
  const axiosErr = err as AxiosError<any>;
  if (axiosErr?.isAxiosError) {
    const status = axiosErr.response?.status;
    const data = axiosErr.response?.data;
    const messages: string[] = [];
    if (typeof data === 'string' && data.trim()) messages.push(data.trim());
    if (data?.message) messages.push(String(data.message));
    if (Array.isArray(data?.errors)) {
      for (const e of data.errors) messages.push(typeof e === 'string' ? e : e?.message || e?.code || JSON.stringify(e));
    }
    if (status === 401) messages.unshift('ZATCA did not accept the OTP or certificate (an OTP expires 1 hour after it is generated)');
    if (!axiosErr.response) messages.push(`Could not reach ZATCA (${axiosErr.code || axiosErr.message})`);
    return new ZatcaApiError(messages.length ? messages.join(' · ') : `${fallback} (HTTP ${status})`, status);
  }
  return new ZatcaApiError(err instanceof Error ? err.message : fallback);
}

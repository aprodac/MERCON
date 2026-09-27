import crypto from 'crypto';
import { bitString, contextTag, integer, octetString, oid, printableString, rdn, sequence, set, utf8String } from './der';

/**
 * Builds the certificate signing request ZATCA's onboarding API expects
 * (E-invoicing Detailed Technical Guidelines, "CSR" section, and the field
 * layout of the Fatoora SDK's csr-config template):
 *
 *   Subject:  C=SA, OU=<branch / TIN>, O=<seller name>, CN=<EGS unit name>
 *   Ext 1.3.6.1.4.1.311.20.2 (certificate template): <env>ZATCA-Code-Signing
 *   SubjectAltName dirName:
 *     SN=1-<solution>|2-<model>|3-<serial>, UID=<VAT no.>, title=<invoice types>,
 *     registeredAddress=<address>, businessCategory=<industry>
 *
 * Keys are EC secp256k1 and the request is signed ecdsa-with-SHA256.
 */

export type ZatcaEnvironmentKey = 'Sandbox' | 'Simulation' | 'Production';

/** The certificate template name ZATCA matches to each environment. */
export const CERTIFICATE_TEMPLATE: Record<ZatcaEnvironmentKey, string> = {
  Sandbox: 'TSTZATCA-Code-Signing',
  Simulation: 'PREZATCA-Code-Signing',
  Production: 'ZATCA-Code-Signing',
};

const OID = {
  countryName: '2.5.4.6',
  organizationName: '2.5.4.10',
  organizationalUnitName: '2.5.4.11',
  commonName: '2.5.4.3',
  surname: '2.5.4.4', // "SN" — ZATCA puts the EGS serial here
  userId: '0.9.2342.19200300.100.1.1', // "UID" — VAT number
  title: '2.5.4.12', // invoice types, e.g. 1100
  registeredAddress: '2.5.4.26',
  businessCategory: '2.5.4.15',
  subjectAltName: '2.5.29.17',
  certificateTemplateName: '1.3.6.1.4.1.311.20.2',
  extensionRequest: '1.2.840.113549.1.9.14',
  ecdsaWithSha256: '1.2.840.10045.4.3.2',
};

export interface CsrInput {
  environment: ZatcaEnvironmentKey;
  commonName: string;
  organizationName: string;
  organizationUnit: string;
  vatNumber: string;
  egsSerial: string;
  invoiceTypes: string;
  registeredAddress: string;
  businessCategory: string;
}

export interface GeneratedKeyAndCsr {
  privateKeyPem: string;
  csrPem: string;
}

export function generateKeyAndCsr(input: CsrInput): GeneratedKeyAndCsr {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
  const privateKeyPem = privateKey.export({ type: 'sec1', format: 'pem' }).toString();
  const csrPem = buildCsr(input, privateKey, publicKey);
  return { privateKeyPem, csrPem };
}

export function buildCsr(input: CsrInput, privateKey: crypto.KeyObject, publicKey: crypto.KeyObject): string {
  const subject = sequence(
    rdn(OID.countryName, printableString('SA')),
    rdn(OID.organizationalUnitName, utf8String(input.organizationUnit)),
    rdn(OID.organizationName, utf8String(input.organizationName)),
    rdn(OID.commonName, utf8String(input.commonName)),
  );

  const altNameDirectory = sequence(
    rdn(OID.surname, utf8String(input.egsSerial)),
    rdn(OID.userId, utf8String(input.vatNumber)),
    rdn(OID.title, utf8String(input.invoiceTypes)),
    rdn(OID.registeredAddress, utf8String(input.registeredAddress)),
    rdn(OID.businessCategory, utf8String(input.businessCategory)),
  );
  // GeneralNames ::= SEQUENCE OF GeneralName; directoryName is [4] (explicit, since Name is a CHOICE).
  const subjectAltName = sequence(contextTag(4, altNameDirectory));

  const extensions = sequence(
    sequence(oid(OID.certificateTemplateName), octetString(printableString(CERTIFICATE_TEMPLATE[input.environment]))),
    sequence(oid(OID.subjectAltName), octetString(subjectAltName)),
  );

  const attributes = contextTag(0, sequence(oid(OID.extensionRequest), set(extensions)));

  const spki = publicKey.export({ type: 'spki', format: 'der' });
  const certificationRequestInfo = sequence(integer(0), subject, spki, attributes);

  const signature = crypto.sign('sha256', certificationRequestInfo, privateKey); // DER-encoded ECDSA signature
  const csrDer = sequence(certificationRequestInfo, sequence(oid(OID.ecdsaWithSha256)), bitString(signature));

  const body = csrDer.toString('base64').match(/.{1,64}/g)!.join('\n');
  return `-----BEGIN CERTIFICATE REQUEST-----\n${body}\n-----END CERTIFICATE REQUEST-----\n`;
}

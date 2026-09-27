import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { generateKeyAndCsr, CsrInput } from './csr';
import { sealSecret, openSecret, ZatcaEncryptionKeyMissingError } from './secretBox';

const input: CsrInput = {
  environment: 'Sandbox',
  commonName: 'EGS-1a2b3c4d',
  organizationName: 'شركة النقل المحدودة',
  organizationUnit: 'Riyadh Branch',
  vatNumber: '310122393500003',
  egsSerial: '1-Aprodac|2-Fleet-1.0|3-ed22f1d8-e6a2-1118-9b58-d9a8f11e445f',
  invoiceTypes: '1100',
  registeredAddress: 'RRRD2929',
  businessCategory: 'Transportation',
};

function opensslText(csrPem: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zatca-csr-'));
  const file = path.join(dir, 'req.csr');
  fs.writeFileSync(file, csrPem);
  try {
    // -verify checks the self-signature, which proves the DER structure and the
    // key pair are both right. nameopt keeps UTF-8 readable.
    const result = spawnSync('openssl', ['req', '-in', file, '-noout', '-verify', '-text', '-nameopt', 'utf8,sep_comma_plus'], {
      encoding: 'utf8',
    });
    return `${result.stdout}${result.stderr}`;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('CSR is well-formed, self-signature verifies, and carries every ZATCA field', () => {
  const { csrPem, privateKeyPem } = generateKeyAndCsr(input);
  assert.match(csrPem, /^-----BEGIN CERTIFICATE REQUEST-----\n/);
  assert.match(privateKeyPem, /BEGIN EC PRIVATE KEY/);

  const text = opensslText(csrPem);
  assert.match(text, /self-signature verify OK/);
  assert.match(text, /secp256k1/);
  assert.match(text, /ecdsa-with-SHA256/);
  assert.match(text, /C=SA,OU=Riyadh Branch,O=شركة النقل المحدودة,CN=EGS-1a2b3c4d/);
  assert.match(text, /TSTZATCA-Code-Signing/);
  assert.match(text, /SN=1-Aprodac\|2-Fleet-1\.0\|3-ed22f1d8-e6a2-1118-9b58-d9a8f11e445f/);
  assert.match(text, /UID=310122393500003/);
  assert.match(text, /title=1100/);
  assert.match(text, /registeredAddress=RRRD2929/);
  assert.match(text, /businessCategory=Transportation/);
});

test('certificate template follows the environment', () => {
  assert.match(opensslText(generateKeyAndCsr({ ...input, environment: 'Simulation' }).csrPem), /PREZATCA-Code-Signing/);
  const production = opensslText(generateKeyAndCsr({ ...input, environment: 'Production' }).csrPem);
  assert.match(production, /ZATCA-Code-Signing/);
  assert.doesNotMatch(production, /(TST|PRE)ZATCA/);
});

test('secrets round-trip and are unreadable without the key', () => {
  const previous = process.env.ZATCA_ENCRYPTION_KEY;
  try {
    process.env.ZATCA_ENCRYPTION_KEY = 'test-key-one';
    const sealed = sealSecret('-----BEGIN EC PRIVATE KEY-----abc');
    assert.doesNotMatch(sealed, /PRIVATE KEY/);
    assert.equal(openSecret(sealed), '-----BEGIN EC PRIVATE KEY-----abc');

    process.env.ZATCA_ENCRYPTION_KEY = 'a-different-key';
    assert.throws(() => openSecret(sealed));

    delete process.env.ZATCA_ENCRYPTION_KEY;
    assert.throws(() => sealSecret('x'), ZatcaEncryptionKeyMissingError);
  } finally {
    if (previous === undefined) delete process.env.ZATCA_ENCRYPTION_KEY;
    else process.env.ZATCA_ENCRYPTION_KEY = previous;
  }
});

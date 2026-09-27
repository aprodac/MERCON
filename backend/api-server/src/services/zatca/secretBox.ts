import crypto from 'crypto';

/**
 * Encrypts the ZATCA private key and API secrets before they touch the
 * database (AES-256-GCM). The key comes from ZATCA_ENCRYPTION_KEY — its own
 * variable, not derived from JWT_SECRET, so rotating login tokens never makes
 * a client's stored certificate unreadable.
 *
 * Generate one per deployment with: openssl rand -base64 32
 */

const VERSION = 'v1';

function getKey(): Buffer {
  const raw = process.env.ZATCA_ENCRYPTION_KEY;
  if (!raw || raw.trim() === '') {
    throw new ZatcaEncryptionKeyMissingError();
  }
  // Any string works; hashing normalises it to exactly 32 bytes.
  return crypto.createHash('sha256').update(raw.trim()).digest();
}

export class ZatcaEncryptionKeyMissingError extends Error {
  constructor() {
    super('ZATCA_ENCRYPTION_KEY is not set on this server. Ask Aprodac to add it before connecting to ZATCA.');
    this.name = 'ZatcaEncryptionKeyMissingError';
  }
}

export function encryptionKeyConfigured(): boolean {
  return Boolean(process.env.ZATCA_ENCRYPTION_KEY && process.env.ZATCA_ENCRYPTION_KEY.trim());
}

export function sealSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
}

export function openSecret(sealed: string): string {
  const [version, iv, tag, ciphertext] = sealed.split(':');
  if (version !== VERSION || !iv || !tag || !ciphertext) {
    throw new Error('Unrecognised encrypted value format');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
}

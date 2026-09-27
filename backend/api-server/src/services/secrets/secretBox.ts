import crypto from 'crypto';

/**
 * Encrypts integration secrets at rest (ZATCA private key + API secrets, and
 * any future integration credentials) with AES-256-GCM.
 *
 * Keys are per client deployment and live on that client's server, never in
 * git or GitHub: scripts/provision/client-secrets.sh creates them in
 * /etc/aprodac/clients/<client>/secrets.env and the deploy workflow passes
 * them to the container (runbook: docs/CLIENT_SECRETS.md).
 *
 *   DATA_ENCRYPTION_KEY           current key — everything new is sealed with it
 *   DATA_ENCRYPTION_KEY_PREVIOUS  comma-separated older keys, decrypt-only (rotation)
 *
 * Every sealed value names the key that sealed it ("v1:<keyId>:iv:tag:data"),
 * so rotation is possible and a lost key is detected instead of silently
 * producing garbage.
 */

const FORMAT = 'v1';

interface DataKey {
  id: string;
  key: Buffer;
}

export class DataKeyMissingError extends Error {
  constructor() {
    super('DATA_ENCRYPTION_KEY is not set on this server. Aprodac’s setup script creates it (scripts/provision/client-secrets.sh ensure <client>).');
    this.name = 'DataKeyMissingError';
  }
}

export class DataKeyUnavailableError extends Error {
  constructor(public readonly keyId: string) {
    super(`This value was encrypted with key ${keyId}, which this server no longer has. The encryption key was changed or lost.`);
    this.name = 'DataKeyUnavailableError';
  }
}

/**
 * A generated key (openssl rand -base64 32) is used as-is; any other string
 * of 32+ characters is hashed to 32 bytes. Shorter strings are refused.
 * The id is a domain-separated hash, so it identifies the key without
 * revealing any of it. client-secrets.sh computes the same id.
 */
export function parseDataKey(raw: string): DataKey {
  const trimmed = raw.trim();
  const decoded = Buffer.from(trimmed, 'base64');
  let key: Buffer;
  if (decoded.length === 32 && decoded.toString('base64') === trimmed) {
    key = decoded;
  } else if (trimmed.length >= 32) {
    key = crypto.createHash('sha256').update(trimmed).digest();
  } else {
    throw new Error('DATA_ENCRYPTION_KEY is too short. Generate one with: openssl rand -base64 32');
  }
  const id = crypto.createHash('sha256').update(`aprodac-key-id:${trimmed}`).digest('hex').slice(0, 8);
  return { id, key };
}

// Read on every call (not cached at import) so a test or a restart with new
// env always sees the current keys.
function loadKeys(): { current: DataKey | null; all: DataKey[] } {
  const currentRaw = process.env.DATA_ENCRYPTION_KEY?.trim();
  const current = currentRaw ? parseDataKey(currentRaw) : null;
  const previous = (process.env.DATA_ENCRYPTION_KEY_PREVIOUS || '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)
    .map(parseDataKey);
  return { current, all: current ? [current, ...previous] : previous };
}

/** Throws with a readable message when a configured key is malformed. Called once at startup. */
export function validateDataKeys(): { currentKeyId: string | null; previousKeyIds: string[] } {
  const { current, all } = loadKeys();
  return { currentKeyId: current?.id ?? null, previousKeyIds: all.filter((k) => k !== current).map((k) => k.id) };
}

export function dataKeyConfigured(): boolean {
  try {
    return loadKeys().current !== null;
  } catch {
    return false;
  }
}

export function currentDataKeyId(): string | null {
  return loadKeys().current?.id ?? null;
}

export function sealSecret(plaintext: string): string {
  const { current } = loadKeys();
  if (!current) throw new DataKeyMissingError();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', current.key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [FORMAT, current.id, iv.toString('base64'), cipher.getAuthTag().toString('base64'), ciphertext.toString('base64')].join(':');
}

export function sealedKeyId(sealed: string): string | null {
  const [format, keyId] = sealed.split(':');
  return format === FORMAT && keyId ? keyId : null;
}

export function openSecret(sealed: string): string {
  const [format, keyId, iv, tag, ciphertext] = sealed.split(':');
  if (format !== FORMAT || !keyId || !iv || !tag || !ciphertext) {
    throw new Error('Unrecognised encrypted value format');
  }
  const match = loadKeys().all.find((k) => k.id === keyId);
  if (!match) throw new DataKeyUnavailableError(keyId);
  const decipher = crypto.createDecipheriv('aes-256-gcm', match.key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
}

/** True when this server holds the key a sealed value needs. */
export function canOpen(sealed: string): boolean {
  const keyId = sealedKeyId(sealed);
  try {
    return keyId !== null && loadKeys().all.some((k) => k.id === keyId);
  } catch {
    return false;
  }
}

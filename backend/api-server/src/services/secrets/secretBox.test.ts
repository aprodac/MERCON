import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  canOpen, currentDataKeyId, DataKeyMissingError, DataKeyUnavailableError, openSecret, parseDataKey, sealedKeyId, sealSecret, validateDataKeys,
} from './secretBox';

const saved = { key: process.env.DATA_ENCRYPTION_KEY, prev: process.env.DATA_ENCRYPTION_KEY_PREVIOUS };
const KEY_A = crypto.randomBytes(32).toString('base64');
const KEY_B = crypto.randomBytes(32).toString('base64');

beforeEach(() => {
  process.env.DATA_ENCRYPTION_KEY = KEY_A;
  delete process.env.DATA_ENCRYPTION_KEY_PREVIOUS;
});
after(() => {
  for (const [name, value] of [['DATA_ENCRYPTION_KEY', saved.key], ['DATA_ENCRYPTION_KEY_PREVIOUS', saved.prev]] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test('round-trips and names the key that sealed it', () => {
  const sealed = sealSecret('-----BEGIN EC PRIVATE KEY-----abc');
  assert.doesNotMatch(sealed, /PRIVATE KEY/);
  assert.equal(sealedKeyId(sealed), currentDataKeyId());
  assert.equal(openSecret(sealed), '-----BEGIN EC PRIVATE KEY-----abc');
});

test('rotation: a previous key still opens old values, a lost key is reported by id', () => {
  const sealedWithA = sealSecret('secret');
  const idA = parseDataKey(KEY_A).id;

  process.env.DATA_ENCRYPTION_KEY = KEY_B;
  process.env.DATA_ENCRYPTION_KEY_PREVIOUS = KEY_A;
  assert.equal(openSecret(sealedWithA), 'secret');
  assert.equal(sealedKeyId(sealSecret('new')), parseDataKey(KEY_B).id);
  assert.deepEqual(validateDataKeys(), { currentKeyId: parseDataKey(KEY_B).id, previousKeyIds: [idA] });

  delete process.env.DATA_ENCRYPTION_KEY_PREVIOUS;
  assert.equal(canOpen(sealedWithA), false);
  assert.throws(() => openSecret(sealedWithA), (err: unknown) => err instanceof DataKeyUnavailableError && err.keyId === idA);
});

test('tampered data is rejected', () => {
  const parts = sealSecret('secret').split(':');
  parts[4] = Buffer.from('tampered').toString('base64');
  assert.throws(() => openSecret(parts.join(':')));
});

test('missing key refuses to seal; weak key refused outright', () => {
  delete process.env.DATA_ENCRYPTION_KEY;
  assert.throws(() => sealSecret('x'), DataKeyMissingError);
  assert.throws(() => parseDataKey('short'), /too short/);
  assert.equal(parseDataKey('x'.repeat(40)).key.length, 32);
});

test('client-secrets.sh generates keys the API accepts, with the same fingerprint', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'client-secrets-'));
  const script = path.resolve(__dirname, '../../../../../scripts/provision/client-secrets.sh');
  const run = (...args: string[]) => {
    const r = spawnSync('bash', [script, ...args], { encoding: 'utf8', env: { ...process.env, CLIENT_SECRETS_ROOT: root } });
    assert.equal(r.status, 0, r.stderr);
    return r;
  };
  try {
    run('ensure', 'acme');
    const file = path.join(root, 'acme', 'secrets.env');
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    const key = /^DATA_ENCRYPTION_KEY=(.+)$/m.exec(fs.readFileSync(file, 'utf8'))![1];
    assert.equal(run('fingerprint', 'acme').stdout.trim(), `current ${parseDataKey(key).id}`);

    // ensure is idempotent: never replaces an existing key
    run('ensure', 'acme');
    assert.match(fs.readFileSync(file, 'utf8'), new RegExp(`DATA_ENCRYPTION_KEY=${key.replace(/[+/=]/g, '\\$&')}`));

    // rotate keeps the old key as previous; export yields both for the deploy
    run('rotate', 'acme');
    const exported = run('export', 'acme').stdout;
    const env: Record<string, string> = {};
    for (const line of exported.trim().split('\n')) {
      const m = /^export ([A-Z_]+)=(.*)$/.exec(line)!;
      env[m[1]] = spawnSync('bash', ['-c', `printf %s ${m[2]}`], { encoding: 'utf8' }).stdout;
    }
    assert.equal(env.DATA_ENCRYPTION_KEY_PREVIOUS, key);
    assert.notEqual(env.DATA_ENCRYPTION_KEY, key);
    parseDataKey(env.DATA_ENCRYPTION_KEY);

    // a client name that could escape the secrets directory is refused
    const bad = spawnSync('bash', [script, 'ensure', '../etc'], { encoding: 'utf8', env: { ...process.env, CLIENT_SECRETS_ROOT: root } });
    assert.notEqual(bad.status, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

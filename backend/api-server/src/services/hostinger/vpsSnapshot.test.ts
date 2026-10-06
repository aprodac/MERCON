import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { getSnapshotStatus, takeSnapshot, SnapshotError, __resetSnapshotState } from './vpsSnapshot';

const realFetch = globalThis.fetch;
type Call = { method: string; url: string; auth: string | null };

function stub(routes: Record<string, { status?: number; body: any }>) {
  const calls: Call[] = [];
  globalThis.fetch = (async (url: any, init?: any) => {
    const method = init?.method ?? 'GET';
    calls.push({ method, url: String(url), auth: init?.headers?.Authorization ?? null });
    const path = String(url).replace('https://developers.hostinger.com/api/vps/v1', '');
    const hit = routes[`${method} ${path}`];
    if (!hit) return { ok: false, status: 404, text: async () => '' };
    const status = hit.status ?? 200;
    return { ok: status < 400, status, text: async () => JSON.stringify(hit.body) };
  }) as typeof fetch;
  return calls;
}

describe('server snapshot (Hostinger)', () => {
  beforeEach(() => {
    __resetSnapshotState();
    process.env.HOSTINGER_API_TOKEN = 'tok';
    process.env.HOSTINGER_VM = 'srv1752379.hstgr.cloud';
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.HOSTINGER_API_TOKEN;
    delete process.env.HOSTINGER_VM;
  });

  it('says what is missing and calls nobody when not set up', async () => {
    delete process.env.HOSTINGER_API_TOKEN;
    const calls = stub({});
    const s = await getSnapshotStatus();
    assert.equal(s.configured, false);
    assert.deepEqual(s.missing, ['HOSTINGER_API_TOKEN']);
    assert.equal(calls.length, 0);
  });

  it('finds the server by its hostname and reads its snapshot', async () => {
    const calls = stub({
      'GET /virtual-machines': { body: [{ id: 111, hostname: 'srv9.hstgr.cloud' }, { id: 1752379, hostname: 'srv1752379.hstgr.cloud' }] },
      'GET /virtual-machines/1752379/snapshot': { body: { id: 5, created_at: '2026-10-01T10:00:00Z', expires_at: '2026-10-21T10:00:00Z' } },
    });
    const s = await getSnapshotStatus();
    assert.equal(s.configured, true);
    assert.equal(s.hostname, 'srv1752379.hstgr.cloud');
    assert.deepEqual(s.snapshot, { createdAt: '2026-10-01T10:00:00Z', expiresAt: '2026-10-21T10:00:00Z' });
    assert.equal(calls[0].auth, 'Bearer tok');
  });

  it('reports no snapshot when Hostinger has none', async () => {
    process.env.HOSTINGER_VM = '42';
    stub({});
    const s = await getSnapshotStatus();
    assert.equal(s.snapshot, null);
  });

  it('starts a snapshot, shows it running, and refuses a second click right after', async () => {
    process.env.HOSTINGER_VM = '42';
    const calls = stub({
      'POST /virtual-machines/42/snapshot': { body: { id: 900, name: 'snapshot_create', state: 'sent' } },
      'GET /virtual-machines/42/actions/900': { body: { id: 900, state: 'started' } },
    });
    const started = await takeSnapshot();
    assert.equal(started.actionId, '900');
    assert.ok(calls.some((c) => c.method === 'POST' && c.url.endsWith('/virtual-machines/42/snapshot')));

    const s = await getSnapshotStatus();
    assert.equal(s.running?.state, 'started');

    await assert.rejects(() => takeSnapshot(), (e: any) => e instanceof SnapshotError && e.status === 409);
  });

  it('clears "running" once Hostinger says the snapshot finished', async () => {
    process.env.HOSTINGER_VM = '42';
    stub({
      'POST /virtual-machines/42/snapshot': { body: { id: 900, state: 'sent' } },
      'GET /virtual-machines/42/actions/900': { body: { id: 900, state: 'success' } },
    });
    await takeSnapshot();
    const s = await getSnapshotStatus();
    assert.equal(s.running, null);
  });

  it('turns a refused token into a clear message', async () => {
    process.env.HOSTINGER_VM = '42';
    stub({ 'GET /virtual-machines/42/snapshot': { status: 401, body: { message: 'Unauthenticated' } } });
    await assert.rejects(() => getSnapshotStatus(), /API token/);
  });

  it('says so when the hostname is not in the account', async () => {
    stub({ 'GET /virtual-machines': { body: [{ id: 1, hostname: 'other.hstgr.cloud' }] } });
    await assert.rejects(() => getSnapshotStatus(), /No server called/);
  });
});

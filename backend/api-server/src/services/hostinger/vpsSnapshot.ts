/**
 * The server's Hostinger snapshot, for the "Take snapshot" button on System
 * health (superadmin only).
 *
 * Hostinger keeps ONE snapshot per VPS: taking a new one replaces the old.
 * It's the quick way back before a risky release or a server upgrade
 * (docs/infra/BACKUP_RESTORE.md); restoring stays in hPanel on purpose —
 * a one-click "roll the whole server back" in the app is too dangerous.
 *
 *   HOSTINGER_API_TOKEN  hPanel → Account → API. Server-side only, never sent to a browser.
 *   HOSTINGER_VM         this server: its VM id, or its hostname as hPanel
 *                        shows it (srv1752379.hstgr.cloud) — looked up once.
 * Either missing → the card says it isn't set up; nothing else changes.
 *
 * API: https://developers.hostinger.com (Bearer token)
 *   GET  /api/vps/v1/virtual-machines                         list (to find the id)
 *   GET  /api/vps/v1/virtual-machines/{id}/snapshot           current snapshot
 *   POST /api/vps/v1/virtual-machines/{id}/snapshot           take one (returns an action)
 *   GET  /api/vps/v1/virtual-machines/{id}/actions/{actionId} that action's state
 */
import { logger } from '../../utils/logger';

const BASE = 'https://developers.hostinger.com/api/vps/v1';
const TIMEOUT_MS = 15_000;
/** One snapshot replaces the last; a second click within this long is almost certainly a mistake. */
export const SNAPSHOT_COOLDOWN_MS = 10 * 60_000;

export class SnapshotError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
    this.name = 'SnapshotError';
  }
}

export interface SnapshotInfo {
  createdAt: string | null;
  expiresAt: string | null;
}

export interface SnapshotStatus {
  /** Token and server both set. */
  configured: boolean;
  /** What the card shows when it isn't. */
  missing: string[];
  hostname: string | null;
  snapshot: SnapshotInfo | null;
  /** The snapshot this API started last, while Hostinger is still on it (state 'failed' if it didn't work). */
  running: { startedAt: string; state: string } | null;
}

const token = () => (process.env.HOSTINGER_API_TOKEN || '').trim();
const vmSetting = () => (process.env.HOSTINGER_VM || '').trim();

/** Hostinger wraps some answers in { data }, not others. */
const unwrap = (body: any) => (body && typeof body === 'object' && 'data' in body ? body.data : body);

async function call(method: 'GET' | 'POST', path: string): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token()}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      signal: controller.signal,
    });
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;
    if (res.status === 404) return null;
    if (res.status === 401 || res.status === 403) throw new SnapshotError('Hostinger refused the API token — check HOSTINGER_API_TOKEN.', 502);
    if (!res.ok) throw new SnapshotError(body?.message || `Hostinger answered ${res.status}.`, 502);
    return unwrap(body);
  } catch (err) {
    if (err instanceof SnapshotError) throw err;
    logger.warn({ err, path }, '[hostinger] request failed');
    throw new SnapshotError("Couldn't reach Hostinger. Try again in a minute.", 502);
  } finally {
    clearTimeout(timer);
  }
}

let vmCache: { setting: string; id: string; hostname: string | null } | null = null;

/** HOSTINGER_VM as a VM id: used as-is when it's a number, else matched by hostname. */
async function resolveVm(): Promise<{ id: string; hostname: string | null }> {
  const setting = vmSetting();
  if (vmCache?.setting === setting) return vmCache;
  if (/^\d+$/.test(setting)) {
    vmCache = { setting, id: setting, hostname: null };
    return vmCache;
  }
  const list = await call('GET', '/virtual-machines');
  const vms: any[] = Array.isArray(list) ? list : [];
  const want = setting.toLowerCase();
  const vm = vms.find((v) => String(v?.hostname ?? '').toLowerCase() === want)
    ?? vms.find((v) => String(v?.hostname ?? '').toLowerCase().split('.')[0] === want.split('.')[0]);
  if (!vm?.id) throw new SnapshotError(`No server called "${setting}" in this Hostinger account.`, 400);
  vmCache = { setting, id: String(vm.id), hostname: vm.hostname ?? null };
  return vmCache;
}

/** The snapshot this API process started, so the card can say "in progress". */
let lastStarted: { vmId: string; actionId: string | null; at: number } | null = null;

function toSnapshot(raw: any): SnapshotInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const createdAt = raw.created_at ?? raw.createdAt ?? null;
  if (!createdAt && raw.id == null) return null;
  return { createdAt, expiresAt: raw.expires_at ?? raw.expiresAt ?? null };
}

const OK_STATES = new Set(['success', 'completed', 'done']);
const FAILED_STATES = new Set(['error', 'failed']);
export async function getSnapshotStatus(): Promise<SnapshotStatus> {
  const missing = [!token() && 'HOSTINGER_API_TOKEN', !vmSetting() && 'HOSTINGER_VM'].filter(Boolean) as string[];
  if (missing.length) return { configured: false, missing, hostname: null, snapshot: null, running: null };

  const vm = await resolveVm();
  const snapshot = toSnapshot(await call('GET', `/virtual-machines/${vm.id}/snapshot`));

  let running: SnapshotStatus['running'] = null;
  if (lastStarted && lastStarted.vmId === vm.id) {
    let state = 'running';
    if (lastStarted.actionId) {
      const action = await call('GET', `/virtual-machines/${vm.id}/actions/${lastStarted.actionId}`).catch(() => null);
      state = String(action?.state ?? 'running').toLowerCase();
    }
    // Finished fine: the snapshot above is the new one. Failed: the card says so until the next try.
    if (OK_STATES.has(state)) lastStarted = null;
    else running = { startedAt: new Date(lastStarted.at).toISOString(), state: FAILED_STATES.has(state) ? 'failed' : state };
  }
  return { configured: true, missing: [], hostname: vm.hostname ?? vmSetting(), snapshot, running };
}

export async function takeSnapshot(): Promise<{ startedAt: string; actionId: string | null }> {
  if (!token() || !vmSetting()) throw new SnapshotError('Server snapshots are not set up (HOSTINGER_API_TOKEN / HOSTINGER_VM).', 400);
  const vm = await resolveVm();
  if (lastStarted && lastStarted.vmId === vm.id && Date.now() - lastStarted.at < SNAPSHOT_COOLDOWN_MS) {
    throw new SnapshotError('A snapshot was started a few minutes ago. Wait for it to finish before taking another.', 409);
  }
  const action = await call('POST', `/virtual-machines/${vm.id}/snapshot`);
  const actionId = action?.id != null ? String(action.id) : null;
  lastStarted = { vmId: vm.id, actionId, at: Date.now() };
  return { startedAt: new Date(lastStarted.at).toISOString(), actionId };
}

/** Tests only. */
export function __resetSnapshotState() {
  vmCache = null;
  lastStarted = null;
}

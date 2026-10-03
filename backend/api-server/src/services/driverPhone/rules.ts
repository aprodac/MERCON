/**
 * Driver phone health — the rules that turn a phone's last report into a
 * green / amber / red dot, plus every timing the driverWatch job uses.
 *
 * Pure (no database) so the job, the dashboard endpoints and the tests all
 * read the same thresholds. Plan: docs/DRIVER_PHONE_AUDIT_PLAN.md.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const PHONE_RULES = {
  /** Not seen for this long → amber. */
  staleAfterMs: 2 * HOUR,
  /** Not seen for this long → red. */
  lostAfterMs: 24 * HOUR,
  /** Battery below this (0..1) → amber. */
  lowBattery: 0.15,
} as const;

export const WATCH_TIMINGS = {
  /** A push is checked with Expo once it is this old (Expo needs time to hand it to Apple/Google). */
  receiptAfterMs: 15 * MIN,
  /** Expo keeps receipts ~24 h; after that the result can no longer be known. */
  receiptGiveUpMs: 24 * HOUR,
  /** Temporary send failures are retried this many times in total. */
  maxPushAttempts: 3,
  /** Drivers on trips starting within this window get a readiness check. */
  readinessWindowMs: 2 * HOUR,
  /** A new assignment not acknowledged after this long alerts operators. */
  ackTimeoutMs: 30 * MIN,
  /** On an active trip, the app silent this long (with no live truck GPS either) alerts operators. */
  silentAfterMs: 20 * MIN,
  /** Truck GPS newer than this counts as "operators can still see the truck". */
  truckGpsFreshMs: 10 * MIN,
  /** Activity log and push history older than this are deleted. */
  retentionMs: 180 * DAY,
  /** The same operator alert for the same trip/driver is not repeated within this window. */
  alertDedupeMs: 6 * HOUR,
} as const;

export type PhoneLevel = 'green' | 'amber' | 'red';

/** The subset of a DriverDevice row the rules need. */
export interface PhoneSnapshot {
  isActive: boolean;
  token: string | null;
  platform: string;
  lastSeenAt: Date;
  app_version: string | null;
  notif_permission: string | null;
  location_permission: string | null;
  location_services_on: boolean | null;
  battery_level: number | null;
  low_power_mode: boolean | null;
  health_reported_at: Date | null;
}

export interface PhoneStatus {
  level: PhoneLevel;
  /** Plain-language reasons, worst first. Empty when green. */
  reasons: string[];
  lastSeenAt: Date | null;
  /** The device the status was computed from (most recently seen active one). */
  device: PhoneSnapshot | null;
}

/** "1.10.0" > "1.9.3". Non-numeric parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((x) => parseInt(x, 10) || 0);
  const pb = b.split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export function isBelowMinVersion(version: string | null, minVersion: string | null | undefined): boolean {
  if (!minVersion) return false;
  if (!version) return true; // builds from before phone-health don't report a version
  return compareVersions(version, minVersion) < 0;
}

function ago(ms: number): string {
  const m = Math.round(ms / MIN);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} days`;
}

/**
 * Status for one driver from all their device rows. Uses the active device
 * seen most recently — an old phone the driver stopped using shouldn't turn
 * them red.
 */
export function computePhoneStatus(
  devices: PhoneSnapshot[],
  opts: { now?: Date; minVersion?: string | null; latestVersion?: string | null } = {},
): PhoneStatus {
  const now = (opts.now ?? new Date()).getTime();
  const active = devices
    .filter((d) => d.isActive)
    .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime());
  const device = active[0] ?? null;

  if (!device) {
    return { level: 'red', reasons: ['No phone registered — the driver has not logged in to the app'], lastSeenAt: null, device: null };
  }

  const red: string[] = [];
  const amber: string[] = [];
  const seenAgo = now - device.lastSeenAt.getTime();
  const reportsHealth = device.health_reported_at != null;

  if (seenAgo > PHONE_RULES.lostAfterMs) red.push(`App not seen for ${ago(seenAgo)}`);
  else if (seenAgo > PHONE_RULES.staleAfterMs) amber.push(`App not seen for ${ago(seenAgo)}`);

  if (device.notif_permission === 'denied') red.push('Notifications are turned off');
  else if (reportsHealth && device.notif_permission === 'undetermined') amber.push('Notifications not allowed yet');
  else if (!device.token) red.push('Phone cannot receive push notifications');

  if (device.location_permission === 'denied') red.push('Location access denied');
  else if (device.location_permission === 'undetermined') amber.push('Location access not allowed yet');
  if (device.location_services_on === false) amber.push("Phone's location (GPS) is switched off");

  if (isBelowMinVersion(device.app_version, opts.minVersion)) {
    red.push(device.app_version ? `App ${device.app_version} is too old — update required` : 'Old app version — update required');
  } else if (!reportsHealth) {
    amber.push('Old app version — phone health not reported');
  } else if (opts.latestVersion && device.app_version && compareVersions(device.app_version, opts.latestVersion) < 0) {
    amber.push(`App ${device.app_version} is not the latest`);
  }

  if (device.low_power_mode) amber.push('Battery saver is on — the app may be paused');
  if (device.battery_level != null && device.battery_level >= 0 && device.battery_level < PHONE_RULES.lowBattery) {
    amber.push(`Battery ${Math.round(device.battery_level * 100)}%`);
  }

  const reasons = [...red, ...amber];
  return {
    level: red.length ? 'red' : amber.length ? 'amber' : 'green',
    reasons,
    lastSeenAt: device.lastSeenAt,
    device,
  };
}

/** Expo error codes worth retrying (Expo itself or the network failed, not the device). */
export function isRetryablePushError(code: string | null | undefined): boolean {
  return code === 'ExpoUnreachable' || code === 'MessageRateExceeded';
}

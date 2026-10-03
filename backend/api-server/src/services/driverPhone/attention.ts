/**
 * "Needs attention" — drivers and trips an operator should look at now:
 *  - NotReady:        a trip starts within 2 h and the driver's phone is red/amber
 *  - NotAcknowledged: a trip was assigned 30+ min ago and the driver hasn't tapped "Got it"
 *  - Silent:          an active trip, the app silent 20+ min and no live truck GPS either
 *  - PushFailed:      a push to the driver failed in the last 24 h
 *
 * Shared by the operator inbox (GET /operator-inbox/attention) and the
 * driverWatch job, which turns the serious ones into operator notifications.
 */
import { TripStatus } from '@prisma/client';
import { prisma } from '../../db';
import { compareVersions, computePhoneStatus, isRetryablePushError, WATCH_TIMINGS, type PhoneLevel, type PhoneSnapshot } from './rules';

export type AttentionKind = 'NotReady' | 'NotAcknowledged' | 'Silent' | 'PushFailed';

export interface AttentionItem {
  kind: AttentionKind;
  driverId: string;
  driverName: string;
  driverPhone: string | null;
  tripId: string | null;
  tripRef: string | null;
  /** When the condition started (trip start, assignment time, last seen, failure time). */
  since: string | null;
  level: PhoneLevel;
  detail: string;
  reasons: string[];
}

const PHONE_SELECT = {
  driverId: true,
  isActive: true,
  token: true,
  platform: true,
  lastSeenAt: true,
  app_version: true,
  notif_permission: true,
  location_permission: true,
  location_services_on: true,
  battery_level: true,
  low_power_mode: true,
  health_reported_at: true,
} as const;

const ACTIVE: TripStatus[] = [TripStatus.Loading, TripStatus.InTransit, TripStatus.Delayed];
const CLOSED: TripStatus[] = [TripStatus.Completed, TripStatus.Invoiced, TripStatus.Cancelled];

export async function loadDevicesByDriver(driverIds: string[]): Promise<Map<string, PhoneSnapshot[]>> {
  const map = new Map<string, PhoneSnapshot[]>();
  if (driverIds.length === 0) return map;
  const rows = await prisma.driverDevice.findMany({ where: { driverId: { in: driverIds } }, select: PHONE_SELECT });
  for (const r of rows) {
    const list = map.get(r.driverId) ?? [];
    list.push(r);
    map.set(r.driverId, list);
  }
  return map;
}

export async function getDriverAppMinVersion(): Promise<string | null> {
  const s = await prisma.settings.findUnique({ where: { id: 'singleton' }, select: { driverAppMinVersion: true } });
  return s?.driverAppMinVersion ?? null;
}

/** Newest app version any driver is running — what "not the latest" compares against. */
export async function getLatestDriverAppVersion(): Promise<string | null> {
  const rows = await prisma.driverDevice.findMany({
    where: { isActive: true, app_version: { not: null } },
    select: { app_version: true },
    distinct: ['app_version'],
  });
  return rows.map((r) => r.app_version as string).sort(compareVersions).pop() ?? null;
}

/** True once the driver runs a build that reports health (and so can acknowledge / heartbeat). */
function reportsHealth(devices: PhoneSnapshot[] | undefined): boolean {
  return !!devices?.some((d) => d.isActive && d.health_reported_at != null);
}

function lastSeen(devices: PhoneSnapshot[] | undefined): Date | null {
  const times = (devices ?? []).filter((d) => d.isActive).map((d) => d.lastSeenAt.getTime());
  return times.length ? new Date(Math.max(...times)) : null;
}

const name = (d: { first_name: string; last_name: string }) => `${d.first_name} ${d.last_name}`.trim();

export async function computeAttention(now: Date = new Date()): Promise<AttentionItem[]> {
  const t = now.getTime();
  const items: AttentionItem[] = [];
  const [minVersion, latestVersion] = await Promise.all([getDriverAppMinVersion(), getLatestDriverAppVersion()]);

  const driverSel = { select: { id: true, first_name: true, last_name: true, phone_primary: true } } as const;

  // ── Upcoming and active trips ────────────────────────────────────────────
  const [upcoming, active] = await Promise.all([
    prisma.trip.findMany({
      where: {
        deletedAt: null,
        status: TripStatus.Scheduled,
        driverId: { not: null },
        planned_start: { gte: new Date(t - WATCH_TIMINGS.readinessWindowMs), lte: new Date(t + WATCH_TIMINGS.readinessWindowMs) },
      },
      select: { id: true, ref_id: true, planned_start: true, driver: driverSel },
    }),
    prisma.trip.findMany({
      where: { deletedAt: null, status: { in: ACTIVE }, driverId: { not: null } },
      select: {
        id: true,
        ref_id: true,
        driver: driverSel,
        vehicle: { select: { last_seen_at: true } },
      },
    }),
  ]);

  // ── Assignments still waiting for "Got it" ───────────────────────────────
  const assigned = await prisma.notification.findMany({
    where: {
      type: 'TripAssigned',
      entity_type: 'Trip',
      driverId: { not: null },
      createdAt: { gte: new Date(t - 3 * 24 * 3600_000), lte: new Date(t - WATCH_TIMINGS.ackTimeoutMs) },
    },
    select: { driverId: true, entity_id: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });

  const driverIds = new Set<string>();
  upcoming.forEach((tr) => tr.driver && driverIds.add(tr.driver.id));
  active.forEach((tr) => tr.driver && driverIds.add(tr.driver.id));
  assigned.forEach((n) => n.driverId && driverIds.add(n.driverId));
  const devices = await loadDevicesByDriver([...driverIds]);
  const statusOf = (driverId: string) => computePhoneStatus(devices.get(driverId) ?? [], { now, minVersion, latestVersion });

  for (const tr of upcoming) {
    if (!tr.driver) continue;
    const st = statusOf(tr.driver.id);
    if (st.level === 'green') continue;
    items.push({
      kind: 'NotReady',
      driverId: tr.driver.id,
      driverName: name(tr.driver),
      driverPhone: tr.driver.phone_primary,
      tripId: tr.id,
      tripRef: tr.ref_id,
      since: tr.planned_start?.toISOString() ?? null,
      level: st.level,
      detail: st.reasons[0] ?? 'Phone not ready',
      reasons: st.reasons,
    });
  }

  // Newest assignment per trip; only if that trip still belongs to that driver.
  const seenTrip = new Set<string>();
  const ackCandidates = assigned.filter((n) => {
    if (!n.entity_id || seenTrip.has(n.entity_id)) return false;
    seenTrip.add(n.entity_id);
    return reportsHealth(devices.get(n.driverId as string)); // old builds can't acknowledge
  });
  if (ackCandidates.length) {
    const [trips, acks] = await Promise.all([
      prisma.trip.findMany({
        where: { id: { in: ackCandidates.map((n) => n.entity_id as string) }, deletedAt: null, status: { notIn: CLOSED } },
        select: { id: true, ref_id: true, driverId: true, driver: driverSel },
      }),
      prisma.tripAcknowledgement.findMany({
        where: { tripId: { in: ackCandidates.map((n) => n.entity_id as string) } },
        select: { tripId: true, driverId: true, createdAt: true },
      }),
    ]);
    const tripById = new Map(trips.map((tr) => [tr.id, tr]));
    for (const n of ackCandidates) {
      const tr = tripById.get(n.entity_id as string);
      if (!tr || !tr.driver || tr.driverId !== n.driverId) continue;
      const acked = acks.some((a) => a.tripId === tr.id && a.driverId === n.driverId && a.createdAt >= n.createdAt);
      if (acked) continue;
      const mins = Math.round((t - n.createdAt.getTime()) / 60_000);
      items.push({
        kind: 'NotAcknowledged',
        driverId: tr.driver.id,
        driverName: name(tr.driver),
        driverPhone: tr.driver.phone_primary,
        tripId: tr.id,
        tripRef: tr.ref_id,
        since: n.createdAt.toISOString(),
        level: 'amber',
        detail: `Assigned ${mins < 120 ? `${mins} min` : `${Math.round(mins / 60)} h`} ago — driver hasn't tapped "Got it"`,
        reasons: statusOf(tr.driver.id).reasons,
      });
    }
  }

  for (const tr of active) {
    if (!tr.driver) continue;
    const devs = devices.get(tr.driver.id);
    if (!reportsHealth(devs)) continue; // old builds don't heartbeat
    const seen = lastSeen(devs);
    if (seen && t - seen.getTime() <= WATCH_TIMINGS.silentAfterMs) continue;
    // The app only reports while it is open, so a quiet phone is normal while
    // the driver drives or waits at a loading bay. It only matters when the
    // truck's own tracker has gone quiet too — then nobody can see the trip.
    const v = tr.vehicle;
    const truckLive = !!v?.last_seen_at && t - v.last_seen_at.getTime() <= WATCH_TIMINGS.truckGpsFreshMs;
    if (truckLive) continue;
    const mins = seen ? Math.round((t - seen.getTime()) / 60_000) : null;
    items.push({
      kind: 'Silent',
      driverId: tr.driver.id,
      driverName: name(tr.driver),
      driverPhone: tr.driver.phone_primary,
      tripId: tr.id,
      tripRef: tr.ref_id,
      since: seen?.toISOString() ?? null,
      level: 'red',
      detail: `${mins == null ? 'App never seen' : `App silent for ${mins < 120 ? `${mins} min` : `${Math.round(mins / 60)} h`}`} on an active trip, and no live truck GPS`,
      reasons: statusOf(tr.driver.id).reasons,
    });
  }

  // ── Failed pushes, last 24 h (one item per driver, newest failure) ───────
  const failed = await prisma.pushDelivery.findMany({
    where: {
      sent_at: { gte: new Date(t - 24 * 3600_000) },
      OR: [{ status: 'NoDevice' }, { status: 'Failed' }],
      notification: { driverId: { not: null } },
    },
    select: {
      status: true,
      error_code: true,
      error_message: true,
      attempts: true,
      sent_at: true,
      notification: { select: { title: true, entity_type: true, entity_id: true, driver: driverSel } },
    },
    orderBy: { sent_at: 'desc' },
  });
  const seenDriver = new Set<string>();
  for (const f of failed) {
    if (f.status === 'Failed' && isRetryablePushError(f.error_code) && f.attempts < WATCH_TIMINGS.maxPushAttempts) continue; // still retrying
    const d = f.notification.driver;
    if (!d || seenDriver.has(d.id)) continue;
    seenDriver.add(d.id);
    const count = failed.filter((x) => x.notification.driver?.id === d.id).length;
    items.push({
      kind: 'PushFailed',
      driverId: d.id,
      driverName: name(d),
      driverPhone: d.phone_primary,
      tripId: f.notification.entity_type === 'Trip' ? f.notification.entity_id : null,
      tripRef: null,
      since: f.sent_at.toISOString(),
      level: 'red',
      detail: `"${f.notification.title}" not delivered — ${pushFailureText(f.status, f.error_code, f.error_message)}${count > 1 ? ` (${count} in 24 h)` : ''}`,
      reasons: [],
    });
  }

  const order: Record<AttentionKind, number> = { Silent: 0, NotReady: 1, NotAcknowledged: 2, PushFailed: 3 };
  return items.sort((a, b) => order[a.kind] - order[b.kind] || (a.level === 'red' ? -1 : 0) - (b.level === 'red' ? -1 : 0));
}

/** Expo error codes in words an operator can act on. */
export function pushFailureText(status: string, code: string | null, message: string | null): string {
  if (status === 'NoDevice') return message ?? 'no phone to send to';
  switch (code) {
    case 'DeviceNotRegistered': return 'the app was uninstalled or logged out on that phone';
    case 'InvalidCredentials': return 'push is not set up for this platform yet (APNs/FCM credentials missing)';
    case 'MessageTooBig': return 'message too long';
    case 'MessageRateExceeded': return 'too many messages to this phone';
    case 'ExpoUnreachable': return 'push service unreachable';
    default: return message ?? code ?? 'unknown error';
  }
}

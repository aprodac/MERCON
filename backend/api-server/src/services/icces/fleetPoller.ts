/**
 * Polls ICCES for the whole fleet and feeds MERCON: latest position onto every
 * vehicle, and a live push to anyone watching a trip that vehicle is running.
 *
 * ## Fleet tracking and trip tracking are different questions
 *
 * "Where are all our trucks?" and "where is the truck on this delivery?" are
 * answered from the same data but for different people, and the previous
 * implementation conflated them: it only polled vehicles attached to a trip in
 * `InTransit`. Most of the 27 tracked vehicles are not on an active trip at any
 * given moment, so most of the fleet was invisible by construction.
 *
 * This polls the fleet — one request returns all 27 — writes every position it
 * receives, and additionally pushes to a trip room when the vehicle happens to
 * be running one. A vehicle needs no trip to be tracked.
 *
 * ## This must never take the API down
 *
 * Everything here is wrapped. A poller that throws on an unhandled rejection
 * can kill the process, and MERCON has been bitten by exactly this shape
 * before: a failing startup seed left the whole API down, because one
 * non-critical step was allowed to abort a critical one. Tracking is a feature;
 * the platform is not. If ICCES is unreachable, or the credentials are wrong,
 * or the response changes shape, this logs and the rest of MERCON carries on.
 */
function getPrisma() {
  return require('../../index').prisma;
}
function getIo() {
  return require('../../index').io;
}

import { logger } from '../../utils/logger';
import { env, iccesConfigured } from '../../config/env';
import { IccesSession, IccesAuthError } from './iccesSession';
import { createAxiosTransport } from './axiosTransport';
import type { IccesTelemetry } from './trackParser';
import { trackerLocationUpdate } from '../tracking/locationUpdate';
import { applyGpsStopEvents } from '../tracking/stopGeofence';
import { recordTrackerHistory } from '../tracking/trackerHistory';

/** Matches the dashboard's own refresh rate. Fast enough to watch a truck
 *  move, slow enough that 27 vehicles cost one request per 30s, not per truck. */
const POLL_INTERVAL_MS = 30_000;

/** Trip states where a vehicle is on the road and someone may be watching it.
 *  Mirrors IN_FLIGHT_STATUSES in tripController. */
const ACTIVE_TRIP_STATUSES = ['Scheduled', 'Loading', 'InTransit', 'Delayed'] as const;

let timer: NodeJS.Timeout | null = null;
let inFlight = false;

/**
 * Writes each reading onto its vehicle, and returns the vehicles that matched.
 *
 * Unmatched devices are normal, not errors: the ICCES account can contain
 * trackers for vehicles MERCON does not know about. The captured fleet has
 * exactly one such device, so this is counted and logged rather than treated
 * as a fault.
 *
 * Stale Protection:
 * Only updates the vehicle position if the incoming telemetry's `recordedAt` is
 * strictly newer than the vehicle's currently stored `last_seen_at` (or if
 * `last_seen_at` is null). Out-of-order or duplicate packets are skipped so the
 * vehicle position never moves backwards in time.
 */
// Global metrics for diagnostic endpoints
let lastPollAt: Date | null = null;
let lastMatchedCount = 0;
let lastUnmatchedDevices: string[] = [];
let lastErrorCount = 0;

/**
 * Writes each reading onto its vehicle, and returns the vehicles that matched.
 *
 * Unmatched devices are normal, not errors: the ICCES account can contain
 * trackers for vehicles MERCON does not know about. The captured fleet has
 * exactly one such device, so this is counted and logged rather than treated
 * as a fault.
 *
 * Stale Protection:
 * Only updates the vehicle position if the incoming telemetry's `recordedAt` is
 * strictly newer than the vehicle's currently stored `last_seen_at` (or if
 * `last_seen_at` is null). Out-of-order or duplicate packets are skipped so the
 * vehicle position never moves backwards in time.
 */
export async function persist(
  telemetry: IccesTelemetry[],
  client: any = null,
): Promise<{ matched: number; unmatched: string[] }> {
  const db = client || getPrisma();
  const unmatched: string[] = [];
  let matched = 0;

  for (const t of telemetry) {
    // updateMany rather than update: it is a no-op when no vehicle carries this
    // device id, where update would throw for a tracker MERCON has never seen.
    //
    // Guard against stale / out-of-order tracker updates:
    // Only overwrite vehicle position if this reading is strictly newer than the
    // currently stored `last_seen_at` (or if `last_seen_at` is null).
    const res = await db.vehicle.updateMany({
      where: {
        icces_device_id: t.deviceId,
        deletedAt: null,
        OR: [
          { last_seen_at: null },
          { last_seen_at: { lt: t.recordedAt } },
        ],
      },
      data: {
        last_lat: t.latitude,
        last_lng: t.longitude,
        last_speed_kph: t.speedKph,
        last_heading: t.headingDeg,
        last_status: t.status,
        last_seen_at: t.recordedAt,
      },
    });

    if (res.count > 0) {
      matched += res.count;

      // Auto-sync odometer if telemetry carries a higher odometer reading
      if (t.odometerKm != null && t.odometerKm > 0) {
        await db.vehicle.updateMany({
          where: {
            icces_device_id: t.deviceId,
            deletedAt: null,
            current_odometer: { lt: t.odometerKm },
          },
          data: {
            current_odometer: t.odometerKm,
          },
        });
      }
    } else {
      // Check if the vehicle exists in MERCON to distinguish unlinked devices from stale updates
      const exists = await db.vehicle.count({
        where: { icces_device_id: t.deviceId, deletedAt: null },
      });
      if (exists > 0) {
        matched += exists;
      } else {
        unmatched.push(t.deviceId);
      }
    }
  }

  return { matched, unmatched };
}

/**
 * Pushes positions to trip rooms so an operator watching `/trips/:id/track`
 * sees the marker move, and to the `fleet:telemetry` room so the fleet map moves.
 */
async function broadcastToActiveTrips(telemetry: IccesTelemetry[]): Promise<number> {
  const deviceIds = telemetry.map((t) => t.deviceId);
  if (deviceIds.length === 0) return 0;

  const io = getIo();

  // 1. Broadcast fleet-wide location updates to any watching fleet map
  const fleetUpdates = telemetry.map((t) => trackerLocationUpdate(t));
  io.to('fleet:telemetry').emit('fleet:location_update', fleetUpdates);

  // 2. Broadcast active trip updates
  const trips = await getPrisma().trip.findMany({
    where: {
      deletedAt: null,
      status: { in: ACTIVE_TRIP_STATUSES as unknown as any[] },
      vehicle: { icces_device_id: { in: deviceIds } },
    },
    select: { id: true, vehicle: { select: { icces_device_id: true } } },
  });

  const byDevice = new Map(telemetry.map((t) => [t.deviceId, t]));
  let sent = 0;

  for (const trip of trips) {
    const deviceId = trip.vehicle?.icces_device_id;
    if (!deviceId) continue;
    const t = byDevice.get(deviceId);
    if (!t) continue;

    io.to(`trip:${trip.id}`).emit(`trip:location_update:${trip.id}`, trackerLocationUpdate(t));
    sent += 1;
  }

  return sent;
}

async function pollOnce(session: IccesSession): Promise<void> {
  const { telemetry, errors, capturedAt } = await session.fetchFleet();

  const { matched, unmatched } = await persist(telemetry);
  const broadcast = await broadcastToActiveTrips(telemetry);
  // Trucks reaching / leaving their stops — fills stop times when the driver
  // runs the trip in the customer's app instead of MERCON's. Never throws.
  // The trip's road and breaks even when the driver's phone isn't sending. Never throws.
  const kept = await recordTrackerHistory(
    getPrisma(),
    telemetry.map((t) => ({ deviceId: t.deviceId, lat: t.latitude, lng: t.longitude, speedKph: t.speedKph, headingDeg: t.headingDeg, recordedAt: t.recordedAt })),
  );
  const stopEvents = await applyGpsStopEvents(
    getPrisma(),
    telemetry.map((t) => ({ deviceId: t.deviceId, lat: t.latitude, lng: t.longitude, recordedAt: t.recordedAt })),
  );

  lastPollAt = new Date();
  lastMatchedCount = matched;
  lastUnmatchedDevices = unmatched;
  lastErrorCount = errors.length;

  if (errors.length > 0) {
    logger.warn({ errors }, `[ICCES] ${errors.length} device(s) could not be parsed`);
  }
  if (unmatched.length > 0) {
    logger.info(
      { deviceIds: unmatched },
      `[ICCES] ${unmatched.length} tracked device(s) are not linked to any MERCON vehicle`,
    );
  }
  logger.info(
    { matched, broadcast, stopEvents, kept, capturedAt },
    `[ICCES] fleet updated: ${matched} vehicle(s), ${broadcast} trip broadcast(s), ${stopEvents} stop time(s) from GPS`,
  );
}

/**
 * Starts fleet polling, or explains why it is not starting.
 *
 * Silence would be the wrong outcome either way: an operator wondering why the
 * map is empty deserves a log line saying tracking is switched off, not the
 * absence of one.
 */
export function initFleetTracking(): void {
  if (timer) return;

  if (!iccesConfigured()) {
    logger.warn(
      '[ICCES] GPS tracking disabled — ICCES_USER / ICCES_PASS / ICCES_ACCT are not all set. ' +
        'Vehicle positions will not update.',
    );
    return;
  }

  const session = new IccesSession(
    { user: env.ICCES_USER!, password: env.ICCES_PASS!, account: env.ICCES_ACCT! },
    createAxiosTransport(),
  );

  logger.info(`[ICCES] GPS tracking enabled — polling every ${POLL_INTERVAL_MS / 1000}s`);

  timer = setInterval(() => {
    // Skip rather than queue. A slow ICCES response must not build a backlog of
    // overlapping polls, each holding a connection and writing stale positions
    // over fresh ones.
    if (inFlight) {
      logger.warn('[ICCES] previous poll still running — skipping this tick');
      return;
    }
    inFlight = true;

    pollOnce(session)
      .catch((err) => {
        if (err instanceof IccesAuthError) {
          // Distinct from a transient failure: this will not fix itself, and
          // says so, rather than repeating an anonymous error every 30s.
          logger.error({ err: err.message }, '[ICCES] authentication failed — check the credentials and LOGIN_FIELDS');
        } else {
          logger.error({ err }, '[ICCES] poll failed');
        }
      })
      .finally(() => {
        inFlight = false;
      });
  }, POLL_INTERVAL_MS);

  // Do not hold the process open on shutdown for the sake of a poll timer.
  if (typeof timer.unref === 'function') timer.unref();
}

/** For tests and graceful shutdown. */
export function stopFleetTracking(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  inFlight = false;
}

/**
 * Returns a lightweight status snapshot of the fleet poller so the
 * `/vehicles/icces-status` endpoint can surface tracking health without
 * exposing internal module state directly.
 */
export function getIccesStatusSummary(): {
  pollerRunning: boolean;
  pollerInFlight: boolean;
  iccesConfigured: boolean;
} {
  const { iccesConfigured: isConfigured } = require('../../config/env');
  return {
    pollerRunning: timer !== null,
    pollerInFlight: inFlight,
    iccesConfigured: isConfigured(),
  };
}

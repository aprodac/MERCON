/**
 * Every few minutes, for each running trip's truck: the ETA to its next stop
 * (the same shared road-ahead route the maps show), then
 *
 *   1. Records it (EtaPrediction, at most every RECORD_EVERY_MS per stop) so
 *      ETA accuracy can be measured once the truck arrives — see
 *      etaAccuracy.ts and System health → ETA accuracy.
 *   2. "Going to be late": when the road ETA is LATE_ALERT_MIN or more past the
 *      stop's planned arrival, tells every Admin and Operator once per stop —
 *      before the trip is actually late (tripDelayMonitor marks it Delayed only
 *      30 min after the planned time has passed). Not for trips already
 *      Delayed (they had that alert), nor for straight-line estimates (too
 *      rough to wake anyone).
 *
 * The rules (what counts as late, how an estimate is made) are the shared
 * ones in @mercon/shared-types fleetRules — the same the maps use. Best-effort:
 * one trip failing never stops the others, and nothing here throws.
 */
import { Role } from '@prisma/client';
import { computeEta, isSilent, LATE_ALERT_MIN, located, nextStop, onTrip, formatDriveTime } from '@mercon/shared-types';
import { prisma } from '../../db';
import { logger } from '../../utils/logger';
import { createNotification } from '../../controllers/notificationController';
import { loadLiveUnits, type LiveStop, type LiveUnit } from '../fleetLiveMap';
import { getRouteAhead, type RouteAhead } from '../routing/routeAhead';

const RUN_EVERY_MS = 5 * 60_000;
/** One prediction per stop this often is plenty to see how the ETA converged. */
export const RECORD_EVERY_MS = 10 * 60_000;
/** Predictions are kept this long. */
const KEEP_DAYS = 120;
export const ETA_LATE_TYPE = 'EtaLate';

let timer: NodeJS.Timeout | null = null;
let running = false;
let runs = 0;
const lastRecorded = new Map<string, number>();
/** Stops already alerted (also checked in the database, so a restart doesn't repeat them). */
const alerted = new Set<string>();

function timeIn(tz: string, d: Date): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  } catch {
    return d.toISOString().slice(11, 16);
  }
}

/** The late alert's text — one line an operator can act on. Exported for tests. */
export function lateAlertText(u: LiveUnit, stopName: string, arrival: Date, planned: Date, lateByMin: number, tz: string) {
  const trip = u.trip?.ref_id ?? 'A trip';
  const truck = [u.vehicle?.plate_number, u.driver?.name].filter(Boolean).join(' · ');
  return {
    title: `${trip} is going to be late`,
    message: `${truck ? `${truck} ` : ''}is expected at ${stopName} around ${timeIn(tz, arrival)} — ${formatDriveTime(lateByMin * 60)} after the planned ${timeIn(tz, planned)}. Call the driver or let the customer know.`,
  };
}

async function alertLate(u: LiveUnit, stop: LiveStop, arrival: Date, lateByMin: number, tz: string): Promise<boolean> {
  if (alerted.has(stop.id)) return false;
  const tripId = u.trip!.id;
  const already = await prisma.notification.findFirst({
    where: { type: ETA_LATE_TYPE, entity_type: 'Trip', entity_id: tripId, target: { path: ['stopId'], equals: stop.id } },
    select: { id: true },
  });
  alerted.add(stop.id);
  if (already) return false;

  const staff = await prisma.user.findMany({
    where: { role: { in: [Role.Admin, Role.Operator] }, isActive: true, deletedAt: null },
    select: { id: true },
  });
  const { title, message } = lateAlertText(u, stop.name || stop.address || `stop ${stop.sequence}`, arrival, new Date(stop.planned_arrival!), lateByMin, tz);
  await Promise.all(staff.map((s) => createNotification(s.id, title, message, ETA_LATE_TYPE, 'Trip', tripId, undefined, { tab: 'stops', stopId: stop.id })));
  return true;
}

/** One pass over the fleet. Returns what it did, for logs and tests. */
export async function runEtaWatch(now = Date.now()): Promise<{ recorded: number; alerted: number }> {
  if (running) return { recorded: 0, alerted: 0 };
  running = true;
  let recorded = 0;
  let alerts = 0;
  try {
    const [units, settings] = await Promise.all([
      loadLiveUnits(prisma),
      prisma.settings.findFirst({ select: { timezone: true } }),
    ]);
    const tz = settings?.timezone || 'Asia/Riyadh';

    for (const u of units) {
      try {
        const stop = nextStop(u);
        if (!u.trip || !onTrip(u) || !located(u) || isSilent(u, now) || !stop || stop.actual_arrival || stop.lat == null || stop.lng == null) continue;

        let ahead: RouteAhead | null = null;
        try {
          ahead = await getRouteAhead(u.trip.id, u.position!, { id: stop.id, lat: stop.lat, lng: stop.lng }, now);
        } catch {
          ahead = null; // routing down: the shared estimate below
        }
        // Accuracy is measured on the raw prediction, not the steadied one.
        const eta = computeEta(u, ahead ? { distanceMeters: ahead.distanceMeters, durationSeconds: ahead.rawDurationSeconds } : null, now);
        if (!eta?.arrival || eta.stopLooksWrong) continue;

        if (now - (lastRecorded.get(stop.id) ?? 0) >= RECORD_EVERY_MS) {
          await prisma.etaPrediction.create({
            data: {
              tripId: u.trip.id,
              stopId: stop.id,
              predictedAt: new Date(now),
              predictedArrival: eta.arrival,
              distanceMeters: Math.round((eta.distanceKm ?? 0) * 1000),
              approx: eta.approx,
            },
          });
          lastRecorded.set(stop.id, now);
          recorded++;
        }

        if (!eta.approx && u.trip.phase !== 'delayed' && stop.planned_arrival && eta.lateByMin != null && eta.lateByMin >= LATE_ALERT_MIN) {
          if (await alertLate(u, stop, eta.arrival, eta.lateByMin, tz)) alerts++;
        }
      } catch (err) {
        logger.warn({ err, tripId: u.trip?.id }, '[EtaWatcher] trip skipped');
      }
    }

    // Housekeeping, about once an hour.
    if (++runs % 12 === 1) {
      await prisma.etaPrediction.deleteMany({ where: { predictedAt: { lt: new Date(now - KEEP_DAYS * 86_400_000) } } });
      for (const [id, at] of lastRecorded) if (now - at > 2 * 86_400_000) lastRecorded.delete(id);
      if (alerted.size > 5000) alerted.clear();
    }
  } catch (err) {
    logger.error({ err }, '[EtaWatcher] run failed');
  } finally {
    running = false;
  }
  if (recorded || alerts) logger.info({ recorded, alerted: alerts }, '[EtaWatcher] run');
  return { recorded, alerted: alerts };
}

/** Starts a couple of minutes after boot, then every RUN_EVERY_MS. */
export function initEtaWatcher(): void {
  if (timer) return;
  const run = () => void runEtaWatch();
  setTimeout(run, 2 * 60_000).unref?.();
  timer = setInterval(run, RUN_EVERY_MS);
  timer.unref?.();
}

/** Tests only. */
export function __resetEtaWatcher() {
  lastRecorded.clear();
  alerted.clear();
  runs = 0;
  running = false;
}

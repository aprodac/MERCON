import { TripStatus, StopType, Role } from '@prisma/client';
import { prisma } from '../../db';
import { logger } from '../../utils/logger';
import { DELAY_THRESHOLD_MINUTES } from '../tripLifecycle';
import { notifyOperatorsOfDelay, createNotification, createDriverNotification } from '../../controllers/notificationController';

let monitorInterval: NodeJS.Timeout | null = null;
/** Trips already marked Delayed still get the driver prompt only this long after the stop was due. */
const ALREADY_DELAYED_PROMPT_WINDOW_MIN = 12 * 60;
let isChecking = false;

/**
 * Checks if a scheduled date belongs to a calendar day prior to `now`.
 */
export function isPreviousDay(date: Date, now: Date = new Date()): boolean {
  const d = new Date(date);
  const scheduledMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const currentMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return scheduledMidnight < currentMidnight;
}

/**
 * Formats date into human-readable YYYY-MM-DD or locale date string.
 */
function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Notifies operators and admins once about an unresolved / stale scheduled trip
 * whose scheduled day has ended without starting or completing.
 */
export async function notifyOperatorsOfStaleScheduled(
  tripId: string,
  tripRefId: string | null,
  scheduledDate: Date,
): Promise<void> {
  try {
    const staff = await prisma.user.findMany({
      where: { role: { in: [Role.Admin, Role.Operator] }, isActive: true, deletedAt: null },
      select: { id: true },
    });
    if (staff.length === 0) return;

    const tripLabel = tripRefId || 'A trip';
    const dateStr = formatDate(scheduledDate);
    const title = 'Unresolved Scheduled Trip';
    const message = `Trip ${tripLabel} was scheduled for ${dateStr} but was not started/completed. Please review this trip and cancel/remove it from the schedule or reschedule it.`;

    await Promise.all(
      staff.map((u) =>
        createNotification(u.id, title, message, 'StaleScheduled', 'Trip', tripId),
      ),
    );

    try {
      const { io } = require('../../index');
      if (io) {
        io.emit('trip:stale_scheduled', {
          tripId,
          ref_id: tripRefId,
          scheduledDate: dateStr,
        });
      }
    } catch {
      // Non-fatal socket broadcast
    }
  } catch (error) {
    logger.error({ err: error, tripId }, '[TripDelayMonitor] Failed to notify operators of stale scheduled trip');
  }
}

function startsIn(plannedStart: Date | null, now: Date): string {
  const min = plannedStart ? Math.round((plannedStart.getTime() - now.getTime()) / 60000) : 30;
  if (min <= 1) return 'starts now';
  return `starts in ${min} minutes`;
}

/**
 * Checks for trips starting within the next 30 minutes and sends an automated
 * TripStartingSoon push notification/reminder to the assigned driver.
 *
 * Requirements:
 * - Idempotency: Guaranteed by checking for an existing TripStartingSoon notification for (trip.id, trip.driverId).
 * - Only trips that have not started (actual_start == null).
 * - Only trips with an assigned driver (driverId != null).
 * - Status in [Scheduled, Draft].
 * - planned_start is in the upcoming window (now <= planned_start <= now + 30m).
 */
export async function checkTripsStartingSoon(now: Date = new Date()): Promise<number> {
  let remindedCount = 0;
  try {
    const windowStart = now;
    const windowEnd = new Date(now.getTime() + 30 * 60 * 1000);

    const upcomingTrips = await prisma.trip.findMany({
      where: {
        status: { in: [TripStatus.Scheduled, TripStatus.Draft] },
        deletedAt: null,
        driverId: { not: null },
        actual_start: null,
        planned_start: {
          gte: windowStart,
          lte: windowEnd,
        },
      },
      select: {
        id: true,
        ref_id: true,
        driverId: true,
        planned_start: true,
      },
    });

    for (const trip of upcomingTrips) {
      if (!trip.driverId) continue;

      const existingReminder = await prisma.notification.findFirst({
        where: {
          driverId: trip.driverId,
          entity_id: trip.id,
          entity_type: 'Trip',
          type: 'TripStartingSoon',
        },
      });

      if (!existingReminder) {
        await createDriverNotification(
          trip.driverId,
          'Trip Starting Soon',
          // Real time left: a trip given to a driver 2 minutes before it starts
          // used to say "starts in 30 minutes".
          `Your trip ${trip.ref_id ?? ''} ${startsIn(trip.planned_start, now)}. Open the app to prepare.`.replace('  ', ' '),
          'TripStartingSoon',
          'Trip',
          trip.id,
          {
            tripId: trip.id,
            ref_id: trip.ref_id,
            planned_start: trip.planned_start,
            event: 'TripStartingSoon',
          }
        );
        remindedCount++;
      }
    }
  } catch (error) {
    logger.error({ err: error }, '[TripDelayMonitor] Error checking trips starting soon');
  }

  return remindedCount;
}

/**
 * Checks all active trips against their planned stop schedules and timestamps.
 * 
 * 1. Stale Scheduled Trips: Previous-day scheduled trips that never started are
 *    flagged with a durable notification prompting review/cancellation/rescheduling.
 * 2. Same-Day Scheduled Trips: If running >= DELAY_THRESHOLD_MINUTES (30m) past planned
 *    operational start/arrival, transitions Trip.status to 'Delayed' in the database.
 * 3. Loading Trips: Once actual arrival is stamped, pickup-arrival deadline is satisfied.
 *    Will NOT immediately re-mark as Delayed based on pickup planned_arrival.
 * 4. InTransit Trips: Evaluates the first incomplete stop (actual_arrival == null) in sequence.
 *    If >= DELAY_THRESHOLD_MINUTES past planned arrival, transitions Trip.status to 'Delayed'.
 */
export async function checkTripsForDelay(now: Date = new Date()): Promise<number> {
  if (isChecking) {
    logger.debug('[TripDelayMonitor] Check already in progress, skipping iteration');
    return 0;
  }

  isChecking = true;
  let delayedCount = 0;

  try {
    // Check trips starting soon (30-minute automated reminder)
    await checkTripsStartingSoon(now);

    const activeTrips = await prisma.trip.findMany({
      where: {
        // Delayed too: a trip that is already late when it is created or given a
        // driver is marked Delayed straight away, and its driver must still get
        // the "report the reason" prompt (seen on dev: none was ever sent).
        status: { in: [TripStatus.Scheduled, TripStatus.Loading, TripStatus.InTransit, TripStatus.Delayed] },
        deletedAt: null,
      },
      include: {
        stops: {
          where: { deletedAt: null },
          orderBy: { stop_sequence: 'asc' },
        },
      },
    });

    for (const trip of activeTrips) {
      const alreadyDelayed = trip.status === TripStatus.Delayed;
      // A Delayed trip is judged like the stage it is really at.
      const firstPickup = trip.stops.find((s) => s.stop_type === StopType.Pickup) || trip.stops[0];
      const stage: TripStatus = !alreadyDelayed
        ? trip.status
        : !firstPickup || firstPickup.actual_arrival === null
          ? TripStatus.Scheduled
          : firstPickup.actual_departure === null
            ? TripStatus.Loading
            : TripStatus.InTransit;
      let isDelayed = false;
      let delayMinutes = 0;
      let targetStop: (typeof trip.stops)[number] | null = trip.stops[0] || null;
      // Every case below is "not there yet", except a pickup that was reached but not left.
      let situation: 'not_arrived' | 'not_departed' = 'not_arrived';

      if (stage === TripStatus.Scheduled) {
        const pickupStop = trip.stops.find((s) => s.stop_type === StopType.Pickup) || trip.stops[0];
        const plannedTime = pickupStop?.planned_arrival || trip.planned_start;

        if (plannedTime) {
          if (!pickupStop || pickupStop.actual_arrival === null) {
            const diffMs = now.getTime() - plannedTime.getTime();
            const diffMinutes = Math.round(diffMs / 60000);
            if (diffMinutes >= DELAY_THRESHOLD_MINUTES) {
              isDelayed = true;
              delayMinutes = diffMinutes;
              targetStop = pickupStop || null;
            }
          }

          if (isPreviousDay(plannedTime, now)) {
            const existingStaleNotif = await prisma.notification.findFirst({
              where: {
                entity_type: 'Trip',
                entity_id: trip.id,
                type: 'StaleScheduled',
              },
            });

            if (!existingStaleNotif) {
              await notifyOperatorsOfStaleScheduled(trip.id, trip.ref_id, plannedTime);
            }
          }
        }
      } else if (stage === TripStatus.Loading) {
        const pickupStop = trip.stops.find((s) => s.stop_type === StopType.Pickup) || trip.stops[0];

        // If actual pickup arrival has occurred, the arrival deadline is complete!
        // Do NOT re-flag as delayed based on planned arrival.
        if (pickupStop && pickupStop.actual_arrival !== null) {
          // Truck is actively at dock loading. Only delay if planned_departure is known and exceeded
          const plannedDep = (pickupStop as any).planned_departure;
          if (plannedDep) {
            const depTime = new Date(plannedDep);
            const diffMs = now.getTime() - depTime.getTime();
            const diffMinutes = Math.round(diffMs / 60000);
            if (diffMinutes >= DELAY_THRESHOLD_MINUTES && pickupStop.actual_departure === null) {
              isDelayed = true;
              delayMinutes = diffMinutes;
              targetStop = pickupStop;
              situation = 'not_departed';
            }
          }
        } else {
          // Loading status but arrival not yet recorded
          const plannedTime = pickupStop?.planned_arrival || trip.planned_start;
          if (plannedTime) {
            const diffMs = now.getTime() - plannedTime.getTime();
            const diffMinutes = Math.round(diffMs / 60000);
            if (diffMinutes >= DELAY_THRESHOLD_MINUTES) {
              isDelayed = true;
              delayMinutes = diffMinutes;
              targetStop = pickupStop || null;
            }
          }
        }
      } else if (stage === TripStatus.InTransit) {
        // Evaluate the first unreached stop in sequence
        const pendingStop = trip.stops.find((s) => s.actual_arrival === null);
        const plannedTime = pendingStop?.planned_arrival || trip.planned_end;

        if (plannedTime) {
          const diffMs = now.getTime() - plannedTime.getTime();
          const diffMinutes = Math.round(diffMs / 60000);
          if (diffMinutes >= DELAY_THRESHOLD_MINUTES) {
            isDelayed = true;
            delayMinutes = diffMinutes;
            targetStop = pendingStop || null;
          }
        }
      }

      // An already-Delayed trip only still owes its driver the prompt, and only
      // while the delay is fresh: old trips left Delayed for days must not start
      // alerting drivers or the office when this runs.
      if (alreadyDelayed && delayMinutes > ALREADY_DELAYED_PROMPT_WINDOW_MIN) isDelayed = false;

      if (isDelayed) {
        if (!alreadyDelayed) logger.warn(
          { tripId: trip.id, refId: trip.ref_id, delayMinutes, currentStatus: trip.status },
          '[TripDelayMonitor] Trip detected as delayed due to schedule overrun',
        );

        // Update database Trip.status to Delayed, preserving driver_workflow_state
        if (!alreadyDelayed) {
          await prisma.trip.update({
            where: { id: trip.id },
            data: { status: TripStatus.Delayed },
          });
          delayedCount++;
        }

        // Idempotent notification: max 1 per 6 hours for ongoing delay condition
        const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
        const existingNotif = await prisma.notification.findFirst({
          where: {
            entity_type: 'Trip',
            entity_id: trip.id,
            type: 'Delay',
            createdAt: { gte: sixHoursAgo },
          },
        });

        if (!existingNotif && !alreadyDelayed) {
          await notifyOperatorsOfDelay({
            tripId: trip.id,
            tripRefId: trip.ref_id,
            stopId: targetStop?.id || '',
            stopType: targetStop?.stop_type || StopType.Pickup,
            locationName: targetStop?.location_name || null,
            delayMinutes,
            situation,
          });
        }

        // Driver delay prompt notification with stop-level deduplication
        if (trip.driverId) {
          const targetStopId = targetStop?.id || '';
          const existingDriverPrompt = await prisma.notification.findFirst({
            where: {
              driverId: trip.driverId,
              entity_id: trip.id,
              entity_type: 'Trip',
              type: 'TripDelayPrompt',
              message: { contains: targetStopId ? `[stop:${targetStopId}]` : '' },
              // Already Delayed: once per stop, ever (this runs every minute).
              ...(alreadyDelayed ? {} : { createdAt: { gte: sixHoursAgo } }),
            },
          });

          if (!existingDriverPrompt) {
            const stopSeq = targetStop?.stop_sequence || 1;
            const stopLoc = targetStop?.location_name || 'your stop';
            const driverPromptTitle = 'Trip Delay Detected';
            const driverPromptMessage = `Your trip is delayed by ${delayMinutes} minutes at stop ${stopSeq} (${stopLoc}). Please report the reason for the delay. [stop:${targetStopId}]`;

            await createDriverNotification(
              trip.driverId,
              driverPromptTitle,
              driverPromptMessage,
              'TripDelayPrompt',
              'Trip',
              trip.id,
              {
                tripId: trip.id,
                stopId: targetStopId,
                stopSequence: stopSeq,
                delayMinutes,
              }
            );
          }
        }

        // Broadcast status update to sockets
        if (!alreadyDelayed) try {
          const { io } = require('../../index');
          if (io) {
            io.to(`trip:${trip.id}`).emit('trip:status_change', {
              tripId: trip.id,
              status: TripStatus.Delayed,
              driver_workflow_state: trip.driver_workflow_state,
            });
            io.emit('trip:delayed', {
              tripId: trip.id,
              ref_id: trip.ref_id,
              delayMinutes,
            });
          }
        } catch {
          // Socket broadcast is non-fatal
        }
      }
    }
  } catch (error) {
    logger.error({ err: error }, '[TripDelayMonitor] Error checking trips for delay');
  } finally {
    isChecking = false;
  }

  return delayedCount;
}

/**
 * Initializes the automated schedule overrun monitor background task.
 * Runs approximately every 60 seconds.
 */
export function initTripDelayMonitor(intervalMs: number = 60000): void {
  if (monitorInterval) {
    logger.warn('[TripDelayMonitor] Monitor already initialized');
    return;
  }

  logger.info(`[TripDelayMonitor] Initializing trip delay monitor (interval: ${intervalMs}ms)`);

  // Initial check shortly after startup
  setTimeout(() => {
    checkTripsForDelay().catch((err) => {
      logger.error({ err }, '[TripDelayMonitor] Error during initial delay check');
    });
  }, 5000);

  monitorInterval = setInterval(() => {
    checkTripsForDelay().catch((err) => {
      logger.error({ err }, '[TripDelayMonitor] Error during scheduled delay check');
    });
  }, intervalMs);
}

/**
 * Stops the delay monitor interval timer (for graceful shutdown / tests).
 */
export function stopTripDelayMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    logger.info('[TripDelayMonitor] Stopped trip delay monitor');
  }
}

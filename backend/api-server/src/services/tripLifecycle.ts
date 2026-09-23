import { Prisma, TripStatus, DriverStatus, AssetStatus, StopType } from '@prisma/client';
import { getLegEndpoints, isRoundTrip, resolveAuthoritativeActiveStop, type AuthoritativeActiveStop } from '@mercon/shared-types';

export { resolveAuthoritativeActiveStop, type AuthoritativeActiveStop };

/**
 * Legal next statuses for a trip, keyed by current status. Enforced by every
 * status-changing endpoint (web + mobile) so a trip can't skip stages (e.g.
 * straight to Invoiced without ever being Completed) or go backwards out of a
 * terminal state.
 */
export const ALLOWED_TRANSITIONS: Record<TripStatus, TripStatus[]> = {
  [TripStatus.Draft]: [TripStatus.Scheduled, TripStatus.Loading, TripStatus.InTransit, TripStatus.Cancelled],
  [TripStatus.Scheduled]: [TripStatus.Draft, TripStatus.Loading, TripStatus.InTransit, TripStatus.Delayed, TripStatus.Cancelled],
  [TripStatus.Loading]: [TripStatus.Draft, TripStatus.Scheduled, TripStatus.InTransit, TripStatus.Delayed, TripStatus.Cancelled],
  [TripStatus.InTransit]: [TripStatus.Draft, TripStatus.Scheduled, TripStatus.Loading, TripStatus.Delayed, TripStatus.Completed, TripStatus.Cancelled],
  [TripStatus.Delayed]: [TripStatus.Draft, TripStatus.Scheduled, TripStatus.Loading, TripStatus.InTransit, TripStatus.Completed, TripStatus.Cancelled],
  [TripStatus.Completed]: [TripStatus.Invoiced, TripStatus.InTransit, TripStatus.Loading, TripStatus.Scheduled],
  [TripStatus.Invoiced]: [TripStatus.Completed],
  [TripStatus.Cancelled]: [TripStatus.Draft, TripStatus.Scheduled],
};

export function isValidTransition(from: TripStatus, to: TripStatus): boolean {
  if (from === to) return true; // no-op update, not a transition
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * The moment each transition represents at a stop.
 */
const STOP_MARK_BY_STATUS: Partial<
  Record<TripStatus, { stop_type: StopType; field: 'actual_arrival' | 'actual_departure' }>
> = {
  [TripStatus.Loading]: { stop_type: StopType.Pickup, field: 'actual_arrival' },
  [TripStatus.InTransit]: { stop_type: StopType.Pickup, field: 'actual_departure' },
  [TripStatus.Completed]: { stop_type: StopType.Dropoff, field: 'actual_departure' },
};

/**
 * How late an arrival must be before it counts as a delay worth explaining.
 * Below this it is ordinary variance, and flagging it would only train
 * operators to ignore the alert.
 */
export const DELAY_THRESHOLD_MINUTES = 30;

/** A late arrival nobody has explained yet. */
export interface DelayDetection {
  tripId: string;
  tripRefId: string | null;
  stopId: string;
  stopType: StopType;
  locationName: string | null;
  delayMinutes: number;
}

/**
 * Record the real-world moment a status change stands for, and report back
 * whether that moment was late.
 *
 * **Every path that changes a trip's status must call this.** A stop that is
 * missed here is missed permanently — the moment has passed and no later job
 * can reconstruct when the driver actually arrived. That is exactly how
 * dropoff arrival came to be backfilled at completion time (making every
 * delivery look like it arrived the instant it finished), and how the mobile
 * geofence path recorded nothing at all.
 *
 * Only ever writes into a column that is still null, so a re-sent request or
 * an operator's manual correction is never clobbered by a later transition.
 * That same guard is what keeps the returned detection firing once instead of
 * on every retry.
 *
 * Returns null when nothing was stamped, when the moment was a departure
 * (only an arrival can be late), when no arrival was planned to measure
 * against, or when the delay is under the threshold. A non-null result is the
 * caller's cue to alert operators — **after its transaction commits**, so no
 * alert is ever sent for a trip update that then rolls back.
 */
export async function stampStopTransition(
  tx: Prisma.TransactionClient,
  tripId: string,
  to: TripStatus,
): Promise<DelayDetection | null> {
  const mark = STOP_MARK_BY_STATUS[to];
  if (!mark) return null;

  const now = new Date();
  
  // Dynamically find the specific stop relevant to this status change
  let targetStop = null;
  if (to === TripStatus.Loading || to === TripStatus.InTransit) {
    // Targets the outbound pickup stop (leg 0)
    targetStop = await tx.tripStop.findFirst({
      where: { tripId, stop_type: mark.stop_type, leg_index: 0, deletedAt: null },
      orderBy: { stop_sequence: 'asc' },
    }) || await tx.tripStop.findFirst({
      where: { tripId, stop_type: mark.stop_type, deletedAt: null },
      orderBy: { stop_sequence: 'asc' },
    });
  } else if (to === TripStatus.Completed) {
    // Targets the final dropoff stop (highest sequence)
    targetStop = await tx.tripStop.findFirst({
      where: { tripId, stop_type: mark.stop_type, deletedAt: null },
      orderBy: { stop_sequence: 'desc' },
    });
  }

  if (!targetStop) return null;
  if (targetStop[mark.field] !== null) return null; // already stamped — do not re-alert

  await tx.tripStop.update({
    where: { id: targetStop.id },
    data: { [mark.field]: now },
  });

  if (mark.field !== 'actual_arrival') return null;
  if (!targetStop.planned_arrival) return null;

  const delayMinutes = Math.round((now.getTime() - targetStop.planned_arrival.getTime()) / 60000);
  if (delayMinutes < DELAY_THRESHOLD_MINUTES) return null;

  const trip = await tx.trip.findUnique({ where: { id: tripId }, select: { ref_id: true } });
  return {
    tripId,
    tripRefId: trip?.ref_id ?? null,
    stopId: targetStop.id,
    stopType: mark.stop_type,
    locationName: targetStop.location_name,
    delayMinutes,
  };
}

/**
 * The one place a trip is marked Completed: releases the driver/vehicle back
 * to Available and stamps the final dropoff arrival and departure timestamps.
 *
 * NOTE: Invoice creation is intentionally NOT performed here. Invoices are
 * created manually by an operator via the POST /trips/:id/mark-invoiced
 * endpoint AFTER the trip is completed. This gives the billing team full
 * control over when and how trips are invoiced.
 *
 * Call from inside an existing `prisma.$transaction`.
 */
export async function completeTrip(
  tx: Prisma.TransactionClient,
  tripId: string,
  userId: string | null | undefined,
) {
  const trip = await tx.trip.findUnique({ where: { id: tripId } });
  if (!trip) throw new Error('NOT_FOUND');

  // Stamp the final dropoff stop
  const now = new Date();
  const finalDropoff = await tx.tripStop.findFirst({
    where: { tripId, stop_type: StopType.Dropoff, deletedAt: null },
    orderBy: { stop_sequence: 'desc' },
  }) || await tx.tripStop.findFirst({
    where: { tripId, deletedAt: null },
    orderBy: { stop_sequence: 'desc' },
  });

  if (finalDropoff) {
    await tx.tripStop.update({
      where: { id: finalDropoff.id },
      data: {
        actual_arrival: finalDropoff.actual_arrival ?? now,
        actual_departure: finalDropoff.actual_departure ?? now,
      },
    });
  }

  const updatedTrip = await tx.trip.update({
    where: { id: tripId },
    data: {
      status: TripStatus.Completed,
      actual_end: trip.actual_end ?? now,
      updated_by: userId ?? undefined,
    },
  });

  if (trip.driverId) await tx.driver.update({ where: { id: trip.driverId }, data: { status: DriverStatus.Available } });
  if (trip.vehicleId) await tx.vehicle.update({ where: { id: trip.vehicleId }, data: { status: AssetStatus.Available } });

  return updatedTrip;
}

/**
 * @deprecated Use completeTrip() instead.
 * This alias is kept temporarily to ease migration of any call sites still
 * referencing the old name. It will be removed in a future cleanup.
 */
export const completeTripAndInvoice = completeTrip;

export async function stampWorkflowTransition(
  tx: Prisma.TransactionClient,
  tripId: string,
  workflowState: string,
  targetStopId?: string,
) {
  const now = new Date();
  const stops = await tx.tripStop.findMany({
    where: { tripId, deletedAt: null },
    orderBy: { stop_sequence: 'asc' },
  });
  if (stops.length === 0) return;

  // Direct stop stamping if targetStopId is provided
  if (targetStopId) {
    const specificStop = stops.find(s => s.id === targetStopId);
    if (specificStop) {
      if (workflowState.includes('ARRIV')) {
        await tx.tripStop.updateMany({
          where: { id: specificStop.id, actual_arrival: null },
          data: { actual_arrival: now },
        });
      } else if (workflowState.includes('COMPLET') || workflowState.includes('DEPART') || workflowState === 'IN_TRANSIT') {
        await tx.tripStop.updateMany({
          where: { id: specificStop.id, actual_departure: null },
          data: { actual_departure: now },
        });
      }
      return;
    }
  }

  const outboundEndpoints = getLegEndpoints({ stops }, 0);
  const returnEndpoints = getLegEndpoints({ stops }, 1);

  const outboundOrigin = outboundEndpoints.loading;
  const outboundDelivery = outboundEndpoints.delivery;
  const returnLoading = returnEndpoints.loading;
  const finalDelivery = returnEndpoints.delivery || outboundDelivery;

  const isRound = isRoundTrip({ stops });

  // STRICT RETURN START GUARD:
  // Cannot start return leg loading before outbound delivery is completed.
  const returnStates = [
    'FIRST_DELIVERY_COMPLETED',
    'RETURN_LOADING',
    'RETURN_LOADING_COMPLETED',
    'IN_TRANSIT_RETURN',
    'ARRIVED_AT_FINAL_DELIVERY',
    'RETURN_DELIVERY_COMPLETED',
  ];
  if (isRound && returnStates.includes(workflowState) && outboundDelivery) {
    if (!outboundDelivery.actual_arrival && !outboundDelivery.actual_departure) {
      throw new Error('OUTBOUND_DELIVERY_NOT_COMPLETED: Cannot start return leg before completing outbound delivery.');
    }
    // Auto-stamp outbound departure if it arrived but departure timestamp wasn't recorded yet
    if (outboundDelivery.actual_arrival && !outboundDelivery.actual_departure) {
      await tx.tripStop.updateMany({
        where: { id: outboundDelivery.id, actual_departure: null },
        data: { actual_departure: now },
      });
    }
  }

  if (workflowState === 'ARRIVED_AT_PICKUP' || workflowState === 'LOADING') {
    if (outboundOrigin) {
      await tx.tripStop.updateMany({
        where: { id: outboundOrigin.id, actual_arrival: null },
        data: { actual_arrival: now },
      });
    }
  } else if (workflowState === 'IN_TRANSIT' || workflowState === 'LOADING_COMPLETED' || workflowState === 'GOING_TO_STOP') {
    if (outboundOrigin) {
      await tx.tripStop.updateMany({
        where: { id: outboundOrigin.id, actual_departure: null },
        data: { actual_departure: now },
      });
    }
  } else if (workflowState === 'ARRIVED_AT_DELIVERY') {
    if (outboundDelivery) {
      await tx.tripStop.updateMany({
        where: { id: outboundDelivery.id, actual_arrival: null },
        data: { actual_arrival: now },
      });
    }
  } else if (workflowState === 'FIRST_DELIVERY_COMPLETED' || workflowState === 'RETURN_LOADING') {
    if (outboundDelivery) {
      await tx.tripStop.updateMany({
        where: { id: outboundDelivery.id, actual_departure: null },
        data: { actual_departure: now },
      });
    }
    if (returnLoading) {
      await tx.tripStop.updateMany({
        where: { id: returnLoading.id, actual_arrival: null },
        data: { actual_arrival: now },
      });
    }
  } else if (workflowState === 'IN_TRANSIT_RETURN' || workflowState === 'RETURN_LOADING_COMPLETED' || workflowState === 'GOING_TO_RETURN_STOP') {
    if (returnLoading) {
      await tx.tripStop.updateMany({
        where: { id: returnLoading.id, actual_departure: null },
        data: { actual_departure: now },
      });
    }
  } else if (workflowState === 'ARRIVED_AT_FINAL_DELIVERY') {
    if (finalDelivery) {
      await tx.tripStop.updateMany({
        where: { id: finalDelivery.id, actual_arrival: null },
        data: { actual_arrival: now },
      });
    }
  } else if (workflowState === 'COMPLETED' || workflowState === 'RETURN_DELIVERY_COMPLETED') {
    if (finalDelivery) {
      await tx.tripStop.updateMany({
        where: { id: finalDelivery.id, actual_departure: null },
        data: { actual_departure: now },
      });
    }
  }
}

/**
 * Mark an intermediate stop as visited: the driver arrived, took the stop
 * photos and left. Intermediate stops have no workflow state of their own
 * that stampWorkflowTransition can map to a stop, so the driver app names the
 * stop explicitly. Scoped to `tripId` so a stop id from another trip is
 * ignored, and only fills null columns like every other stamp.
 */
export async function stampIntermediateStopVisit(
  tx: Prisma.TransactionClient,
  tripId: string,
  stopId: string,
) {
  const now = new Date();
  const where = { id: stopId, tripId, deletedAt: null };
  await tx.tripStop.updateMany({ where: { ...where, actual_arrival: null }, data: { actual_arrival: now } });
  await tx.tripStop.updateMany({ where: { ...where, actual_departure: null }, data: { actual_departure: now } });
}



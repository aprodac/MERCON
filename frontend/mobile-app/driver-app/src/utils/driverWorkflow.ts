/**
 * Where the DRIVER is in the trip, for choosing screens in this app.
 *
 * getEffectiveWorkflowState (shared-types) also reads stop times, and treats a
 * drop-off with a departure time as "trip completed". But the office can type
 * stop times in by hand (confirm times from a customer-app screenshot) while
 * the driver is still on that step. The app then jumped the driver past the
 * photo / Complete screen and he could never finish the trip — seen twice on
 * live round trips (TRP-0017, TRP-0018), closed by the office in the end.
 *
 * Rules here:
 * - Finished only when the server says so (status Completed / Invoiced).
 * - Otherwise the driver's own last step (driver_workflow_state) wins.
 * - Only without one (old trips) fall back to stop times, and even then never
 *   to "completed": he lands on the final delivery and can press Complete.
 */
import { findTimelineIndex, getEffectiveWorkflowState, getTimelineProgress, isReturnLoadingPhase, isRoundTrip, targetFromWorkflowState, type TimelineStop, type TimelineStopProgress } from '@mercon/shared-types';
import type { MobileTrip } from '@mercon/mobile-shared/lib/trips';

export function driverWorkflowState(trip: MobileTrip | null | undefined): string {
  if (!trip) return 'ASSIGNED';
  if (trip.status === 'Completed' || trip.status === 'Invoiced') return 'COMPLETED';

  const ws = trip.driver_workflow_state;
  if (ws && ws !== 'COMPLETED') {
    // A stale round-1 loading state after round 1 was delivered (TRP-0038):
    // he is at the return loading.
    if ((ws === 'ARRIVED_AT_PICKUP' || ws === 'LOADING') && isReturnLoadingPhase(trip)) return 'RETURN_LOADING';
    return ws;
  }

  const derived = getEffectiveWorkflowState(trip);
  if (derived !== 'COMPLETED') return derived;
  // Server says the trip is still open: put him on the last delivery.
  return isRoundTrip(trip) ? 'ARRIVED_AT_FINAL_DELIVERY' : 'ARRIVED_AT_DELIVERY';
}

/** Round trip, at (or heading to) the return loading. */
export function driverIsReturnLoading(trip: MobileTrip | null | undefined): boolean {
  if (!trip || !isRoundTrip(trip)) return false;
  const ws = driverWorkflowState(trip);
  return ws === 'RETURN_LOADING' || ws === 'FIRST_DELIVERY_COMPLETED';
}

/** Return-leg states: the outbound delivery is behind the driver. */
const RETURN_LEG_STATES = new Set([
  'FIRST_DELIVERY_COMPLETED',
  'RETURN_LOADING',
  'RETURN_LOADING_COMPLETED',
  'GOING_TO_RETURN_STOP',
  'IN_TRANSIT_RETURN',
  'ARRIVED_AT_FINAL_DELIVERY',
  'FINAL_DELIVERY_VERIFICATION',
  'RETURN_DELIVERY_COMPLETED',
  'COMPLETED',
]);

export function isOnReturnLeg(ws: string): boolean {
  return RETURN_LEG_STATES.has(ws) || /^ARRIVED_AT_RETURN_STOP_\d+$/.test(ws) || /^RETURN_STOP_/.test(ws);
}

/** Still at (or heading to) the outbound loading. */
const AT_OUTBOUND_LOADING = new Set(['ASSIGNED', 'GOING_TO_PICKUP', 'ARRIVED_AT_PICKUP', 'LOADING']);

export function isAtOutboundLoading(ws: string): boolean {
  return AT_OUTBOUND_LOADING.has(ws);
}

/**
 * Home's stop list, never ahead of the driver: stop times alone mark a stop
 * done, so office-typed times showed his return loading "Done" while he was
 * still loading. Capped at his loading / delivery step.
 */
export function driverTimelineProgress(trip: MobileTrip, nodes: TimelineStop[]): TimelineStopProgress[] {
  const progress = getTimelineProgress(nodes, false);
  const target = targetFromWorkflowState(driverWorkflowState(trip), isRoundTrip(trip));
  if (target.kind !== 'pickup' && target.kind !== 'delivery') return progress;
  const at = findTimelineIndex(nodes, target);
  if (progress.indexOf('current') <= at) return progress;
  return nodes.map((_, i) => (i < at ? 'completed' : i === at ? 'current' : 'upcoming'));
}

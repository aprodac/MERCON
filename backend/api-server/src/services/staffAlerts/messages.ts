/**
 * What staff are told when a driver does something in the app. Pure — the
 * notifier (./notify.ts) loads the trip and driver and sends the result to
 * every Admin and Operator.
 *
 * Wording is the office's: where the truck is and what just happened, with
 * the place named ("arrived at Jeddah Port"), not the app's workflow state.
 */
import { getLegEndpoints, stopLabel, type TripStopLike } from '../tripRouteTimeline';

export interface DriverUpdateContext {
  /** "Trip TRP-0042", or "A trip" when it has no reference yet. */
  trip: string;
  driverName: string;
  stops: TripStopLike[];
}

export interface StaffAlert {
  title: string;
  message: string;
  /**
   * The phone push's text. The push reads like a message from the driver —
   * their name is its title — so the text leaves the name out.
   */
  pushBody: string;
}

export interface TripStatusChange {
  fromStatus: string;
  toStatus: string;
  fromWorkflow?: string | null;
  /** undefined = the request did not touch the workflow state. */
  toWorkflow?: string | null;
  /** An intermediate stop the driver just finished. */
  completedStopId?: string | null;
  delayReason?: string | null;
}

export function tripName(refId: string | null | undefined): string {
  return refId ? `Trip ${refId}` : 'A trip';
}

export function driverDisplayName(d: { first_name?: string | null; last_name?: string | null } | null | undefined): string {
  return `${d?.first_name ?? ''} ${d?.last_name ?? ''}`.trim() || 'The driver';
}

const placeOf = (s: TripStopLike | null | undefined, fallback: string) => (s ? stopLabel(s) : fallback);

const alert = (ctx: DriverUpdateContext, title: string, what: string): StaffAlert => ({
  title,
  message: `${ctx.trip} — ${ctx.driverName} ${what}`,
  pushBody: `${ctx.trip}: ${what.charAt(0).toUpperCase()}${what.slice(1)}`,
});

/**
 * The alert for a driver's status update, or null when nothing changed (the
 * app re-sending a step it already sent, e.g. a retry after a timeout).
 */
export function describeTripStatusChange(change: TripStatusChange, ctx: DriverUpdateContext): StaffAlert | null {
  const toWorkflow = change.toWorkflow === undefined ? change.fromWorkflow ?? null : change.toWorkflow;
  const unchanged =
    change.fromStatus === change.toStatus &&
    (change.fromWorkflow ?? null) === toWorkflow &&
    !change.completedStopId &&
    !change.delayReason;
  if (unchanged) return null;

  const out = getLegEndpoints({ stops: ctx.stops }, 0);
  const ret = getLegEndpoints({ stops: ctx.stops }, 1);
  const pickup = placeOf(out.loading, 'the pickup');
  const delivery = placeOf(out.delivery, 'the delivery');
  const returnPickup = placeOf(ret.loading, 'the return pickup');
  const finalDelivery = placeOf(ret.delivery, 'the final delivery');

  const reason = change.delayReason?.trim();
  if (reason) return alert(ctx, 'Delay reported', `reported a delay: ${reason}`);

  if (change.toStatus === 'Completed') {
    const last = ret.delivery ?? out.delivery;
    return alert(ctx, 'Trip completed', `delivered${last ? ` at ${stopLabel(last)}` : ''} and completed the trip.`);
  }

  if (change.completedStopId) {
    const stop = ctx.stops.find((s) => s.id === change.completedStopId);
    return alert(ctx, 'Stop done', `finished at ${placeOf(stop, 'a stop')} and is moving on.`);
  }

  switch (toWorkflow) {
    case 'GOING_TO_PICKUP':
      return alert(ctx, 'Trip started', `started the trip and is driving to ${pickup}.`);
    case 'ARRIVED_AT_PICKUP':
      return alert(ctx, 'Arrived at pickup', `arrived at ${pickup}.`);
    case 'LOADING':
      return alert(ctx, 'Loading', `started loading at ${pickup}.`);
    case 'LOADING_COMPLETED':
    case 'GOING_TO_STOP':
    case 'IN_TRANSIT':
      return alert(ctx, 'Picked up', `loaded and left ${pickup} for ${delivery}.`);
    case 'ARRIVED_AT_DELIVERY':
      return alert(ctx, 'Arrived at delivery', `arrived at ${delivery}.`);
    case 'DELIVERY_COMPLETED':
    case 'FIRST_DELIVERY_COMPLETED':
    case 'RETURN_LOADING':
      return alert(ctx, 'Delivered', `delivered at ${delivery} and is loading for the return at ${returnPickup}.`);
    case 'RETURN_LOADING_COMPLETED':
    case 'GOING_TO_RETURN_STOP':
    case 'IN_TRANSIT_RETURN':
      return alert(ctx, 'Return leg started', `loaded and left ${returnPickup} for ${finalDelivery}.`);
    case 'ARRIVED_AT_FINAL_DELIVERY':
      return alert(ctx, 'Arrived at final delivery', `arrived at ${finalDelivery}.`);
  }

  // A step the app sent without a workflow state we know: say what the trip is now.
  switch (change.toStatus) {
    case 'Loading':
      return alert(ctx, 'Loading', 'is loading.');
    case 'InTransit':
      return alert(ctx, 'On the way', 'is on the way.');
    case 'Delayed':
      return alert(ctx, 'Delay reported', 'reported a delay.');
    case 'Scheduled':
      return alert(ctx, 'Trip started', 'started the trip.');
    default:
      return alert(ctx, 'Trip update', `moved the trip to ${change.toStatus}.`);
  }
}

export interface TripPhotoUpload {
  kind: 'cargo' | 'pod';
  isVideo: boolean;
  /** The app's step: pickup, return_loading, delivery, return_delivery, delay… */
  operation?: string | null;
  stopId?: string | null;
}

/**
 * The alert for a photo or video the driver sent. Photos come one upload at a
 * time; the notifier sends one alert per batch (same text within a few
 * minutes), so this names the batch, not the single photo.
 */
export function describeTripPhoto(upload: TripPhotoUpload, ctx: DriverUpdateContext): StaffAlert {
  if (upload.operation === 'delay') return alert(ctx, 'Delay video', 'sent a video of the delay.');

  // The app names the stop; older builds only say which step, so fall back to that leg's end.
  const leg = (n: 0 | 1) => getLegEndpoints({ stops: ctx.stops }, n);
  const byStep: Record<string, TripStopLike | null> = {
    pickup: leg(0).loading,
    delivery: leg(0).delivery,
    return_loading: leg(1).loading,
    return_delivery: leg(1).delivery,
  };
  const stop =
    (upload.stopId ? ctx.stops.find((s) => s.id === upload.stopId) : undefined) ??
    (upload.operation ? byStep[upload.operation] : null);
  const at = stop ? ` at ${stopLabel(stop)}` : '';
  if (upload.isVideo) return alert(ctx, 'Video sent', `sent a video${at}.`);
  return upload.kind === 'pod'
    ? alert(ctx, 'Delivery photos', `sent delivery (POD) photos${at}.`)
    : alert(ctx, 'Cargo photos', `sent cargo photos${at}.`);
}

export function describeTripAcknowledged(ctx: DriverUpdateContext): StaffAlert {
  return alert(ctx, 'Trip acknowledged', 'tapped "Got it" — they have seen the trip.');
}

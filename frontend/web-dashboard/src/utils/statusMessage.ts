/**
 * The web's side of the one WhatsApp status format (@mercon/shared-types
 * statusMessage, shared with the operator app): turns a dashboard Trip into
 * the format's input, with times in the deployment time zone.
 *
 * Used by the trips list / trip page share dialog, the kanban board's bulk
 * share and the dashboard share modal. The web has no live road ETA, so a
 * running trip shows its planned arrival — the live link carries the rest.
 */
import { formatFleetStatusMessage, formatStatusEntry, formatTripStatusMessage, type StatusTrip } from '@mercon/shared-types';
import type { Trip, TripStop } from '@/services/tripService';
import { formatInDeploymentTz } from '@/lib/datetime';

const DEFAULT_TZ = 'Asia/Riyadh';

const isUuid = (v?: string | null) => !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.trim());
/** A real name, not an id that leaked into a name field. */
const named = (v?: string | null) => (v && !isUuid(v) ? v : null);

/** A stop as a short place code ("KHA") when its location has one, else its name. */
function placeOf(s: Partial<TripStop> | undefined): string | null {
  if (!s) return null;
  const code = s.location?.codes?.find((c) => c?.trim());
  const name = code || named(s.location?.name) || named(s.location?.city) || named(s.location_name) || named(s.location_address) || '';
  return name.replace(/🔁\s*/g, '').split(',')[0].replace(/\]+$/, '').trim() || null;
}

const sortedStops = (t: Trip): Partial<TripStop>[] =>
  [...(t.stops ?? [])].sort((a, b) => (a.stop_sequence ?? 0) - (b.stop_sequence ?? 0));

function lineTypeOf(t: Trip): string | null {
  const raw = t.line_type?.name || t.quotation_line_type || t.rateCard?.rate_category || null;
  if (raw) return /round/i.test(raw) ? 'Round trip' : /single|one.?way/i.test(raw) ? 'Single trip' : raw;
  return (t.stops ?? []).some((s) => (s.leg_index ?? 0) === 1) ? 'Round trip' : null;
}

/** "MONTHLY" / "EXTRA" — the label operators put above a not-started trip. */
export function billingOf(t: Trip): 'MONTHLY' | 'EXTRA' {
  const raw = `${t.billing_type ?? ''} ${t.quotation_billing_type ?? ''} ${t.quotation_pricing_basis ?? ''}`.toUpperCase();
  return raw.includes('MONTH') ? 'MONTHLY' : 'EXTRA';
}

const notStarted = (t: Trip) => t.status === 'Draft' || t.status === 'Scheduled';

/** A dashboard trip as the shared status message reads it. */
export function statusTripOf(t: Trip, tz = DEFAULT_TZ, trackingUrl?: string | null, notes?: string[]): StatusTrip {
  const stops = sortedStops(t);
  const last = stops[stops.length - 1];
  const sameDay = (iso: string) => formatInDeploymentTz(iso, tz, 'yyyy-MM-dd') === formatInDeploymentTz(new Date(), tz, 'yyyy-MM-dd');
  const smart = (iso: string | null | undefined) => (iso ? formatInDeploymentTz(iso, tz, sameDay(iso) ? 'HH:mm' : 'd MMM HH:mm') : null);
  const planned = last?.planned_arrival || t.planned_end || null;
  return {
    from: placeOf(stops[0]),
    to: placeOf(last),
    vehicleClass: t.quotation_vehicle_class || t.vehicle_type || t.rateCard?.vehicle_type || (t.is_third_party ? t.third_party_vehicle_type : null) || null,
    lineType: lineTypeOf(t),
    driverName: t.is_third_party
      ? t.third_party_driver_name || null
      : t.driver ? `${t.driver.first_name} ${t.driver.last_name || ''}`.trim() : null,
    driverPhone: t.is_third_party ? t.third_party_driver_phone || null : t.driver?.phone_primary || null,
    plate: t.is_third_party ? t.third_party_vehicle_plate || null : t.vehicle?.plate_number || null,
    carrier: t.is_third_party ? t.thirdPartyProvider?.name || null : null,
    status: t.status,
    startsAt: t.planned_start ? formatInDeploymentTz(t.planned_start, tz, 'EEE d MMM HH:mm') : null,
    plannedArrival: smart(planned),
    deliveredAt: smart(t.actual_end),
    trackingUrl: trackingUrl ?? null,
    notes: notes ?? null,
  };
}

/** One trip's message, headed by its customer. */
export function tripStatusMessage(t: Trip, tz = DEFAULT_TZ, trackingUrl?: string | null, notes?: string[]): string {
  return formatTripStatusMessage(statusTripOf(t, tz, trackingUrl, notes), {
    customerName: t.customer?.name,
    billing: notStarted(t) ? billingOf(t) : null,
  });
}

/** Several trips: one block per customer, each numbered, in the shared format. */
export function tripsStatusMessage(trips: Trip[], tz = DEFAULT_TZ, links: Record<string, string | null> = {}): string {
  const groups = new Map<string, Trip[]>();
  for (const t of trips) {
    const key = t.customer?.id || t.customer?.name || 'none';
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  return [...groups.values()]
    .map((list) => formatFleetStatusMessage(list.map((t) => statusTripOf(t, tz, links[t.id])), {
      customerName: list[0].customer?.name,
      billing: list.every(notStarted) ? (list.every((t) => billingOf(t) === 'MONTHLY') ? 'MONTHLY' : 'EXTRA') : null,
    }))
    .join('\n\n───────────────────\n\n');
}

/** A numbered trip block for lists that keep their own header (the dashboard fleet report). */
export function tripStatusEntry(t: Trip, index: number, tz = DEFAULT_TZ, trackingUrl?: string | null): string {
  return formatStatusEntry(statusTripOf(t, tz, trackingUrl), index);
}

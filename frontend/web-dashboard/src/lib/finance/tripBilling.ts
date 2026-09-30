/**
 * Reading a trip for billing: where it went, what kind of work it was, when it finished and what
 * it bills. Trip records come from several eras of the trip model, so each field has fallbacks.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (s?: string | null) => (s ? UUID.test(s.trim()) : false);

/** A place name worth showing: not an id, not a placeholder. */
function place(name?: string | null): string | null {
  if (!name || isUuid(name)) return null;
  const cleaned = name.replace(/🔁\s*/g, '').trim();
  return cleaned.length > 0 && cleaned !== 'Origin' && cleaned !== 'Destination' ? cleaned : null;
}

function stopPlace(stop: any): string | null {
  if (!stop) return null;
  return (
    stop.location?.city ||
    stop.location?.codes?.[0] ||
    (!isUuid(stop.location_name) ? stop.location_name : null) ||
    stop.location?.name ||
    stop.location_address ||
    stop.source_label ||
    null
  );
}

export function tripOrigin(t: any): string {
  const pickup = t.stops?.find((s: any) => s.stop_type === 'Pickup') || t.stops?.[0];
  return (
    place(t.origin_city) ||
    place(t.origin_location?.name) ||
    place(t.origin_location_name) ||
    place(t.pickup_city) ||
    place(t.pickup_location_name) ||
    place(t.pickup) ||
    place(stopPlace(pickup)) ||
    place(t.rateCard?.route_origin) ||
    (t.route ? place(String(t.route).split(/[→➔-]/)[0]) : null) ||
    '—'
  );
}

export function tripDestination(t: any): string {
  const dropoff = t.stops?.find((s: any) => s.stop_type === 'Dropoff') || (t.stops && t.stops.length > 1 ? t.stops[t.stops.length - 1] : undefined);
  return (
    place(t.destination_city) ||
    place(t.destination_location?.name) ||
    place(t.destination_location_name) ||
    place(t.dropoff_city) ||
    place(t.dropoff_location_name) ||
    place(t.dropoff) ||
    place(stopPlace(dropoff)) ||
    place(t.rateCard?.route_destination) ||
    (t.route ? place(String(t.route).split(/[→➔-]/)[1]) : null) ||
    '—'
  );
}

export const tripLineType = (t: any): string | null =>
  t.rate_category || t.line_type?.name || t.quotation_line_type || t.financials?.quotation_line_type || t.rateCard?.rate_category || null;

export const tripOperationType = (t: any): string | null =>
  t.operation_type || t.billing_type || t.quotation_billing_type || t.financials?.quotation_billing_type || t.rateCard?.billing_type || null;

export const tripDriver = (t: any): string | null =>
  t.driver ? `${t.driver.first_name || ''} ${t.driver.last_name || ''}`.trim() || t.driver.name || null : t.driver_name || null;

export const tripRef = (t: any): string => t.ref_id || `TRIP-${String(t.id).slice(0, 6)}`;

/** When the trip finished (actual end, else planned end, else last update), as an ISO string. */
export const tripDoneAt = (t: any): string | null => t.actual_end || t.planned_end || t.updated_at || t.updatedAt || null;

export const tripAmount = (t: any): number => Number(t.billing_amount) || 0;

/** The line description the server writes for a trip line. */
export const tripLineDescription = (t: any) => `Freight Service: Trip ${t.ref_id || String(t.id).slice(0, 8)} (${t.vehicle_type || 'Standard'})`;

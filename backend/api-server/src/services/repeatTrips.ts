import { dateInZone } from '@mercon/shared-types';

/**
 * Repeat a day's trips: copies of finished or planned trips onto another day,
 * at the same times of day. The copy is made like "Same as a recent trip" in
 * Create trip — customer, quotation, route and stops, truck, driver, payout and
 * extras — and is then created through the ordinary create-trip path, so every
 * rule that applies there applies here.
 */

export const REPEAT_MAX_TRIPS = 200;
export const REPEAT_MAX_SHIFT_MIN = 12 * 60;

const DAY = 86_400_000;

/** Whole days from one YYYY-MM-DD to another. */
export function daysBetween(fromDay: string, toDay: string): number {
  return Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / DAY);
}

/** A time moved to `targetDay` at the same time of day (in `tz`), plus an optional shift in minutes. */
export function shiftToDay(time: Date, targetDay: string, shiftMin: number, tz: string): Date {
  const days = daysBetween(dateInZone(time.getTime(), tz), targetDay);
  return new Date(time.getTime() + days * DAY + shiftMin * 60_000);
}

export interface SourceStop {
  stop_type: string;
  stop_sequence: number;
  leg_index: number | null;
  location_lat: number | null;
  location_lng: number | null;
  location_name: string | null;
  location_address: string | null;
  locationId: string | null;
  planned_arrival: Date | null;
}

export interface SourceTrip {
  id: string;
  customerId: string;
  driverId: string | null;
  co_driver_id: string | null;
  vehicleId: string | null;
  quotationId: string | null;
  vehicle_type: string | null;
  rate_category: string | null;
  operation_type: string | null;
  billing_amount: unknown;
  driver_payout: unknown;
  co_driver_payout: unknown;
  planned_start: Date | null;
  planned_end: Date | null;
  is_third_party: boolean;
  subcontract?: { providerId: string | null; driverName: string | null; driverPhone: string | null; vehiclePlate: string | null; vehicleType: string | null; cost: unknown } | null;
  charges: Array<{ charge_type: string; rate: unknown; quantity: number; amount: unknown; surchargeRuleId: string | null }>;
  stops: SourceStop[];
}

const num = (v: unknown) => (v == null ? undefined : Number(v));

/** Why a trip can't be repeated at all, or null. */
export function repeatBlocker(t: { status: string; deletedAt: Date | null; planned_start: Date | null; stops: unknown[] }): string | null {
  if (t.deletedAt) return 'The trip was deleted';
  if (t.status === 'Cancelled') return 'The trip was cancelled';
  if (!t.planned_start) return 'The trip has no start time';
  if (t.stops.length < 2) return 'The trip has no route';
  return null;
}

/** The create-trip request for a copy of `t` on `targetDay`. */
export function copyTripBody(t: SourceTrip, o: { targetDay: string; shiftMin: number; tz: string }) {
  const move = (d: Date) => shiftToDay(d, o.targetDay, o.shiftMin, o.tz).toISOString();
  const stops = [...t.stops].sort((a, b) => a.stop_sequence - b.stop_sequence);
  return {
    customer_id: t.customerId,
    ...(t.driverId ? { driver_id: t.driverId } : {}),
    ...(t.co_driver_id ? { co_driver_id: t.co_driver_id } : {}),
    ...(t.vehicleId ? { vehicle_id: t.vehicleId } : {}),
    ...(t.quotationId ? { quotation_id: t.quotationId } : {}),
    vehicle_type: t.vehicle_type,
    rate_category: t.rate_category,
    billing_type: t.operation_type,
    ...(t.billing_amount != null ? { billing_amount: num(t.billing_amount) } : {}),
    // The driver's own share; a co-driver's is sent on its own so it isn't split again.
    trip_charges: num(t.driver_payout) ?? 0,
    ...(t.co_driver_id ? { co_driver_payout: num(t.co_driver_payout) ?? 0 } : {}),
    status: 'Scheduled' as const,
    planned_start: move(t.planned_start!),
    ...(t.planned_end ? { planned_end: move(t.planned_end) } : {}),
    ...(t.is_third_party ? {
      is_third_party: true,
      third_party_provider_id: t.subcontract?.providerId ?? null,
      third_party_driver_name: t.subcontract?.driverName ?? undefined,
      third_party_driver_phone: t.subcontract?.driverPhone ?? undefined,
      third_party_vehicle_plate: t.subcontract?.vehiclePlate ?? undefined,
      third_party_vehicle_type: t.subcontract?.vehicleType ?? undefined,
      third_party_cost: num(t.subcontract?.cost),
    } : {}),
    charges: t.charges.map((c) => ({
      charge_type: c.charge_type, rate: num(c.rate) ?? 0, quantity: c.quantity, amount: num(c.amount) ?? 0,
      ...(c.surchargeRuleId ? { surchargeRuleId: c.surchargeRuleId } : {}),
    })),
    stops: stops.map((s, i) => ({
      stop_type: s.stop_type,
      leg_index: s.leg_index ?? 0,
      stop_sequence: i + 1,
      lat: s.location_lat ?? 0,
      lng: s.location_lng ?? 0,
      ...(s.planned_arrival ? { planned_arrival: move(s.planned_arrival) } : {}),
      ...(s.location_name ? { location_name: s.location_name } : {}),
      ...(s.location_address ? { location_address: s.location_address } : {}),
      ...(s.locationId ? { location_id: s.locationId } : {}),
    })),
  };
}

export type ClashKind = 'double_booking' | 'rest' | 'same_day';
export interface RepeatClash { kind: ClashKind; message: string }

export type RepeatResult =
  | { trip_id: string; status: 'created'; new_trip_id: string; new_ref: string | null }
  | { trip_id: string; status: 'clash'; clashes: RepeatClash[] }
  | { trip_id: string; status: 'skipped'; reason: string };

/** "16 created, 2 skipped (reason)" — and clashes still waiting for a decision. */
export function repeatSummary(results: RepeatResult[]) {
  const created = results.filter((r) => r.status === 'created').length;
  const skipped = results.filter((r): r is Extract<RepeatResult, { status: 'skipped' }> => r.status === 'skipped');
  const clashes = results.filter((r) => r.status === 'clash').length;
  const reasons = [...new Set(skipped.map((r) => r.reason))];
  const parts = [`${created} created`];
  if (skipped.length) parts.push(`${skipped.length} skipped${reasons.length ? ` (${reasons.join('; ')})` : ''}`);
  if (clashes) parts.push(`${clashes} need${clashes === 1 ? 's' : ''} a decision`);
  return { created, skipped: skipped.length, clashes, text: parts.join(', ') };
}

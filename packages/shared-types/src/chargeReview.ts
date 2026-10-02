/**
 * "Any extra charges?" hints for a finished trip — shared by the web
 * dashboard's and the operator app's extra-charges assistant so both suggest
 * the same things. Hints only ever PRE-FILL a charge line; the operator still
 * confirms the quantity and rate before anything is billed to the customer.
 */
import { SUGGESTED_UNIT_BY_CHARGE_TYPE } from './index';

export interface ChargeReviewStopLike {
  stop_type: string;
  location_name: string | null;
  location: { name: string } | null;
  actual_arrival: string | null;
  actual_departure: string | null;
}

export interface ChargeReviewTripLike {
  customer: { name: string } | null;
  stops: ChargeReviewStopLike[];
  charges: { charge_type: string }[];
  actual_end: string | null;
  planned_start: string | null;
}

/** A customer's saved surcharge rule (only the fields the hints use). */
export interface ChargeRuleLike {
  id: string;
  charge_type: string;
  unit: string | null;
  rate: number | string;
}

/** What a customer usually gets charged extra (recent trips), most frequent first. */
export interface CustomerChargeHabit {
  charge_type: string;
  times: number;
  last_rate: number;
}

export interface ChargeHint {
  key: string;
  /** Plain sentence shown to the operator, e.g. "Waited 3 h 20 m at Hail". */
  text: string;
  line: {
    surchargeRuleId: string | null;
    charge_type: string;
    unit: string | null;
    rate: number | null;
    quantity: number;
  };
}

/** A stop counts as a long wait from this many minutes between arrival and departure. */
export const LONG_WAIT_MINUTES = 120;

const stopName = (s: ChargeReviewStopLike) => s.location?.name || s.location_name || 'a stop';

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h} h${m ? ` ${m} m` : ''}` : `${m} m`;
}

/** The customer's saved rule for a kind of charge, matched loosely by name ("waiting", "stop", "labour"). */
function findRule(rules: ChargeRuleLike[], pattern: RegExp): ChargeRuleLike | undefined {
  return rules.find((r) => pattern.test(r.charge_type));
}

export function buildChargeHints(
  trip: ChargeReviewTripLike,
  rules: ChargeRuleLike[],
  habits: CustomerChargeHabit[]
): ChargeHint[] {
  const hints: ChargeHint[] = [];
  const already = new Set(trip.charges.map((c) => c.charge_type.toLowerCase()));
  const habitRate = (type: string) => habits.find((h) => h.charge_type.toLowerCase() === type.toLowerCase())?.last_rate ?? null;

  // 1. Extra stops — every pickup / drop beyond the first pickup and last drop.
  const workStops = trip.stops.filter((s) => s.stop_type === 'Pickup' || s.stop_type === 'Dropoff');
  const extraStops = Math.max(0, workStops.length - 2);
  if (extraStops > 0) {
    const rule = findRule(rules, /stop/i);
    const type = rule?.charge_type || 'Additional Stop';
    if (!already.has(type.toLowerCase())) {
      hints.push({
        key: 'stops',
        text: `${extraStops} extra ${extraStops === 1 ? 'stop' : 'stops'} on this trip`,
        line: {
          surchargeRuleId: rule?.id ?? null,
          charge_type: type,
          unit: rule?.unit || SUGGESTED_UNIT_BY_CHARGE_TYPE['Additional Stop'],
          rate: rule ? Number(rule.rate) : habitRate(type),
          quantity: extraStops,
        },
      });
    }
  }

  // 2. Long waits — the longest arrival → departure at any stop.
  let longest: { minutes: number; where: string } | null = null;
  for (const s of trip.stops) {
    if (!s.actual_arrival || !s.actual_departure) continue;
    const minutes = (new Date(s.actual_departure).getTime() - new Date(s.actual_arrival).getTime()) / 60000;
    if (minutes >= LONG_WAIT_MINUTES && (!longest || minutes > longest.minutes)) longest = { minutes, where: stopName(s) };
  }
  if (longest) {
    const rule = findRule(rules, /wait|detention/i);
    const type = rule?.charge_type || 'Waiting / Labor';
    if (!already.has(type.toLowerCase())) {
      hints.push({
        key: 'wait',
        text: `Waited ${formatDuration(longest.minutes)} at ${longest.where}`,
        line: {
          surchargeRuleId: rule?.id ?? null,
          charge_type: type,
          unit: rule?.unit || SUGGESTED_UNIT_BY_CHARGE_TYPE['Waiting / Labor'],
          rate: rule ? Number(rule.rate) : habitRate(type),
          quantity: Math.max(1, Math.floor(longest.minutes / 60)),
        },
      });
    }
  }

  // 3. What this customer usually gets — only charges seen on several recent trips.
  const hinted = new Set(hints.map((h) => h.line.charge_type.toLowerCase()));
  const usual = habits.find((h) => h.times >= 3 && !hinted.has(h.charge_type.toLowerCase()) && !already.has(h.charge_type.toLowerCase()));
  if (usual) {
    const rule = rules.find((r) => r.charge_type.toLowerCase() === usual.charge_type.toLowerCase());
    hints.push({
      key: 'usual',
      text: `${trip.customer?.name || 'This customer'} often gets ${usual.charge_type} (${usual.times} recent trips)`,
      line: {
        surchargeRuleId: rule?.id ?? null,
        charge_type: usual.charge_type,
        unit: rule?.unit || null,
        rate: rule ? Number(rule.rate) : usual.last_rate,
        quantity: 1,
      },
    });
  }

  return hints;
}

/** Days since the trip finished — older trips make the assistant more insistent. */
export function daysWaiting(trip: ChargeReviewTripLike): number {
  const end = trip.actual_end || trip.planned_start;
  return end ? Math.floor((Date.now() - new Date(end).getTime()) / 86_400_000) : 0;
}

/**
 * A customer's WhatsApp group invite link ("https://chat.whatsapp.com/AbC123…"),
 * cleaned up — or null when the saved value isn't one. Used by the tracking
 * pages' "Ask in your WhatsApp group" button.
 */
export function whatsAppGroupUrl(raw: string | null | undefined): string | null {
  const m = (raw ?? '').trim().match(/^(?:https?:\/\/)?chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9]{10,40})\/?(?:\?.*)?$/i);
  return m ? `https://chat.whatsapp.com/${m[1]}` : null;
}

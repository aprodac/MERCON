/**
 * Which drivers to suggest for a trip, and why. Pure logic — the backend
 * gathers the facts (bookings, last trip, lane / customer history), this ranks
 * them, so the web wizard and the operator app always agree.
 *
 * Rule-outs keep a driver out of the suggestions (shown with the reason);
 * everyone else gets a score out of 100 made of named parts, each shown as a chip.
 */
import { TRUCK_CLASSES, normalizeTruckClass, truckClassOfVehicle } from './tripCreation';

/** Owner-set dispatch rules (2026-09-28). */
export const DISPATCH_RULES = {
  /** Minimum rest between the end of the previous trip and this pickup. */
  minRestHours: 6,
  /** Minimum gap between two trips of the same driver. */
  bufferHours: 1,
  /** History window for lane / customer experience and punctuality. */
  lookbackDays: 90,
  weights: {
    truckFit: 35,
    lane: 25,
    nearby: 15,
    customer: 10,
    workload: 10,
    onTime: 5,
  },
  /** Trips on the lane / for the customer that earn full points. */
  laneTripsForFull: 5,
  customerTripsForFull: 10,
  /** Best matches must score at least this. */
  bestMatchMinScore: 50,
} as const;

export interface DriverFacts {
  driverId: string;
  status?: string | null;
  isActive?: boolean;
  licenseExpiry?: string | Date | null;
  /** The driver's usual truck. */
  truck?: { id: string; plate?: string | null; capacityKg?: number | null; assetType?: string | null; inMaintenance?: boolean } | null;
  /** Their other active trips near this one (as primary or co-driver). */
  bookings: Array<{ tripId?: string; start: string | Date; end?: string | Date | null }>;
  /** Their previous trip before this pickup: when it ends and where. */
  lastTrip?: { end: string | Date; endPlace?: string | null; endLocationId?: string | null } | null;
  /** Trips in the lookback window on this lane / for this customer. */
  laneTrips: number;
  customerTrips: number;
  /** Trips this week, and the fleet average for comparison. */
  tripsThisWeek: number;
  /** Share of recent stops without a delay, 0–1; null when there's no history. */
  onTimeRate?: number | null;
}

export interface TripForMatching {
  start: string | Date;
  end?: string | Date | null;
  vehicleClass?: string | null;
  pickupPlace?: string | null;
  pickupLocationId?: string | null;
}

export type DriverGroup = 'best' | 'other' | 'bigger' | 'smaller' | 'unavailable';

export interface DriverReason {
  text: string;
  tone: 'good' | 'neutral' | 'warn';
}

export interface RankedDriver {
  driverId: string;
  score: number;
  group: DriverGroup;
  /** Why they can't take it (group 'unavailable'). */
  blockedReason?: string;
  truckFit: 'exact' | 'bigger' | 'smaller' | 'none';
  truckClass?: string;
  reasons: DriverReason[];
  /** Hours of rest before this pickup (null when unknown). */
  restHours: number | null;
  /** Start of the trip it clashes with, for the UI to show in local time. */
  clashStart?: string;
}

export const DRIVER_GROUP_LABELS: Record<DriverGroup, string> = {
  best: 'Best matches',
  other: 'Other free drivers',
  bigger: 'Bigger truck than needed',
  smaller: 'Usual truck too small — pick another truck',
  unavailable: "Can't take this trip",
};

const ms = (v: string | Date) => (v instanceof Date ? v.getTime() : new Date(v).getTime());
const HOUR = 3_600_000;

function sizeIndex(cls: string): number {
  return (TRUCK_CLASSES as readonly string[]).indexOf(normalizeTruckClass(cls));
}

/** How a truck's class compares with the class the trip is priced for. */
export function compareTruckClass(have: string, want: string): 'exact' | 'bigger' | 'smaller' {
  const h = sizeIndex(have);
  const w = sizeIndex(want);
  if (h < 0 || w < 0 || h === w) return 'exact';
  return h > w ? 'bigger' : 'smaller';
}

/** Rank every driver for one trip. Sorted: group order, then score, then longest rest. */
export function rankDrivers(
  drivers: DriverFacts[],
  trip: TripForMatching,
  options: { now?: number; fleetAvgTripsThisWeek?: number; rules?: typeof DISPATCH_RULES } = {},
): RankedDriver[] {
  const rules = options.rules ?? DISPATCH_RULES;
  const now = options.now ?? Date.now();
  const tripStart = ms(trip.start);
  const tripEnd = trip.end ? ms(trip.end) : tripStart + 4 * HOUR;
  const buffer = rules.bufferHours * HOUR;
  const wantIdx = trip.vehicleClass ? sizeIndex(trip.vehicleClass) : -1;
  const avgWeek = options.fleetAvgTripsThisWeek ?? 0;
  const norm = (s?: string | null) => (s || '').trim().toLowerCase();

  const ranked = drivers.map((d): RankedDriver => {
    const reasons: DriverReason[] = [];

    /* ── Truck fit ── */
    let truckFit: RankedDriver['truckFit'] = 'none';
    let truckClass: string | undefined;
    if (d.truck) {
      truckClass = truckClassOfVehicle({ capacity_kg: d.truck.capacityKg, asset_type: d.truck.assetType });
      const have = sizeIndex(truckClass);
      truckFit = wantIdx < 0 || have === wantIdx ? 'exact' : have > wantIdx ? 'bigger' : 'smaller';
    }

    /* ── Rest before this pickup ── */
    const lastEnd = d.lastTrip?.end ? ms(d.lastTrip.end) : null;
    const restHours = lastEnd !== null && lastEnd <= tripStart ? Math.round(((tripStart - lastEnd) / HOUR) * 10) / 10 : null;

    /* ── Rule-outs ── */
    let blockedReason: string | undefined;
    let clashStart: string | undefined;
    const status = (d.status || 'Available').replace(/\s+/g, '');
    if (d.isActive === false || status === 'Inactive') blockedReason = 'Inactive';
    else if (status === 'OffDuty') blockedReason = 'Off duty';
    else if (d.licenseExpiry && ms(d.licenseExpiry) < Math.max(now, tripEnd)) blockedReason = 'Licence expired before the trip ends';
    else if (d.truck?.inMaintenance) blockedReason = 'Truck in maintenance';
    else {
      const clash = d.bookings.find((b) => {
        const bs = ms(b.start);
        const be = b.end ? ms(b.end) : bs + 4 * HOUR;
        return bs < tripEnd + buffer && be > tripStart - buffer;
      });
      if (clash) {
        clashStart = new Date(ms(clash.start)).toISOString();
        blockedReason = `Already booked at that time (needs a ${rules.bufferHours} h gap between trips)`;
      } else if (restHours !== null && restHours < rules.minRestHours) {
        blockedReason = `Only ${restHours} h rest before pickup (needs ${rules.minRestHours} h)`;
      }
    }

    /* ── Score ── */
    const w = rules.weights;
    let score = 0;
    if (truckFit === 'exact') {
      score += w.truckFit;
      if (truckClass) reasons.push({ text: `${d.truck?.plate ? `${d.truck.plate} · ` : ''}${truckClass} ✓`, tone: 'good' });
    } else if (truckFit === 'bigger') {
      score += Math.round(w.truckFit * 0.3);
      reasons.push({ text: `Bigger truck · ${truckClass}`, tone: 'warn' });
    } else if (truckFit === 'smaller') {
      reasons.push({ text: `Truck too small · ${truckClass}`, tone: 'warn' });
    } else {
      reasons.push({ text: 'No truck', tone: 'neutral' });
    }

    if (d.laneTrips > 0) {
      score += Math.round(w.lane * Math.min(1, d.laneTrips / rules.laneTripsForFull));
      reasons.push({ text: `${d.laneTrips}× this lane`, tone: 'good' });
    }

    const endsHere =
      (trip.pickupLocationId && d.lastTrip?.endLocationId && trip.pickupLocationId === d.lastTrip.endLocationId) ||
      (norm(trip.pickupPlace) && norm(d.lastTrip?.endPlace) && norm(trip.pickupPlace) === norm(d.lastTrip?.endPlace));
    if (endsHere) {
      score += w.nearby;
      reasons.push({ text: `Ends near pickup`, tone: 'good' });
    }

    if (d.customerTrips > 0) {
      score += Math.round(w.customer * Math.min(1, d.customerTrips / rules.customerTripsForFull));
      reasons.push({ text: `${d.customerTrips} trips for this customer`, tone: 'neutral' });
    }

    if (avgWeek > 0 || d.tripsThisWeek === 0) {
      const light = d.tripsThisWeek < avgWeek || d.tripsThisWeek === 0;
      if (light) {
        score += w.workload;
        reasons.push({ text: d.tripsThisWeek === 0 ? 'No trips this week' : 'Light week', tone: 'neutral' });
      } else if (avgWeek > 0 && d.tripsThisWeek <= avgWeek * 1.5) {
        score += Math.round(w.workload / 2);
      }
    }

    if (d.onTimeRate != null) {
      score += Math.round(w.onTime * d.onTimeRate);
      if (d.onTimeRate >= 0.9) reasons.push({ text: `${Math.round(d.onTimeRate * 100)}% on time`, tone: 'good' });
      else if (d.onTimeRate < 0.7) reasons.push({ text: `${Math.round(d.onTimeRate * 100)}% on time`, tone: 'warn' });
    }

    if (restHours !== null && !blockedReason) {
      reasons.push({ text: restHours >= 48 ? `Idle ${Math.round(restHours / 24)} days` : `${Math.round(restHours)} h rest`, tone: 'neutral' });
    }

    const group: DriverGroup = blockedReason
      ? 'unavailable'
      : truckFit === 'smaller'
      ? 'smaller'
      : truckFit === 'bigger'
      ? 'bigger'
      : score >= rules.bestMatchMinScore && truckFit === 'exact'
      ? 'best'
      : 'other';

    return { driverId: d.driverId, score: blockedReason ? 0 : Math.min(100, score), group, blockedReason, clashStart, truckFit, truckClass, reasons, restHours };
  });

  const order: DriverGroup[] = ['best', 'other', 'bigger', 'smaller', 'unavailable'];
  return ranked.sort(
    (a, b) =>
      order.indexOf(a.group) - order.indexOf(b.group) ||
      b.score - a.score ||
      (b.restHours ?? 1e9) - (a.restHours ?? 1e9)
  );
}

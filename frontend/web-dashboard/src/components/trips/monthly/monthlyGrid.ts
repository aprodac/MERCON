import type { MonthlyBoardCompany, MonthlyBoardTrip } from '@/services/tripService';
import { formatLocationClean, formatMoney, isUnassigned } from './monthlyBoardUtils';

/**
 * One contracted line of work for a company: same shape, truck class, route
 * and price. The grid draws one row per group and the ledger drawer edits it.
 */
export interface TemplateGroup {
  key: string;
  customerId: string;
  lineType: string;
  vehicleClass: string;
  origin: string;
  destination: string;
  rate: number | null;
  currency: string;
  rateStr: string;
  /** Sorted by date, then planned start. */
  trips: MonthlyBoardTrip[];
}

/** What a single day cell means — drives its colour. */
export type CellState = 'done' | 'active' | 'planned' | 'gap' | 'cancelled';

const DONE = new Set(['Completed', 'Invoiced']);
const ACTIVE = new Set(['Loading', 'InTransit', 'Delayed']);

export function tripCellState(trip: MonthlyBoardTrip): CellState {
  if (trip.status === 'Cancelled') return 'cancelled';
  if (DONE.has(trip.status)) return 'done';
  if (isUnassigned(trip)) return 'gap';
  if (ACTIVE.has(trip.status)) return 'active';
  return 'planned';
}

const NOT_STARTED = new Set(['Draft', 'Scheduled']);

/** The day has passed and the trip never started or was never closed out. */
export function isOverdue(trip: MonthlyBoardTrip, today: string): boolean {
  return trip.date < today && NOT_STARTED.has(trip.status);
}

/** A day with several trips shows the state that most needs attention. */
const PRIORITY: CellState[] = ['gap', 'active', 'planned', 'done', 'cancelled'];
export function dayCellState(trips: MonthlyBoardTrip[]): CellState {
  const states = new Set(trips.map(tripCellState));
  return PRIORITY.find((s) => states.has(s)) ?? 'planned';
}

/**
 * Strong colour only where someone has to act (gap, in progress); finished
 * days stay soft so a completed month doesn't drown the exceptions.
 * Cells use `ring` for their own outline — selection uses `outline`.
 */
export const CELL_STYLES: Record<CellState, { cell: string; dot: string; label: string }> = {
  done: {
    cell: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-200 dark:hover:bg-emerald-900',
    dot: 'bg-emerald-100 ring-1 ring-inset ring-emerald-300 dark:bg-emerald-900/50 dark:ring-emerald-700',
    label: 'Completed',
  },
  active: { cell: 'bg-blue-500 text-white hover:bg-blue-600', dot: 'bg-blue-500', label: 'In progress' },
  planned: {
    cell: 'bg-white text-slate-600 ring-1 ring-inset ring-slate-300 hover:ring-slate-500 dark:bg-transparent dark:text-slate-300 dark:ring-slate-600',
    dot: 'bg-white ring-1 ring-inset ring-slate-300 dark:bg-transparent dark:ring-slate-600',
    label: 'Planned',
  },
  gap: { cell: 'bg-amber-400 text-amber-950 hover:bg-amber-500', dot: 'bg-amber-400', label: 'No driver or truck' },
  cancelled: {
    cell: 'text-rose-700 bg-[repeating-linear-gradient(45deg,#fecdd3_0_2px,transparent_2px_5px)] hover:bg-rose-100',
    dot: 'bg-[repeating-linear-gradient(45deg,#fecdd3_0_2px,transparent_2px_4px)] ring-1 ring-inset ring-rose-200',
    label: 'Cancelled',
  },
};

/** Past day still Draft/Scheduled: a red frame on top of (or instead of) the planned outline. */
export const OVERDUE_CELL = 'bg-white text-rose-700 ring-2 ring-inset ring-rose-500 dark:bg-transparent';
export const OVERDUE_RING = 'ring-2 ring-inset ring-rose-500';

export function groupKeyOf(customerId: string, trip: MonthlyBoardTrip): string {
  const lineType = trip.rate_category || trip.billing_type || 'Single Trip';
  const vehicleClass = trip.vehicle_type || 'Standard Truck';
  return [customerId, lineType, vehicleClass, formatLocationClean(trip.origin), formatLocationClean(trip.destination), trip.billing_amount ?? ''].join('||');
}

/** Split a company's month into its contracted lines, busiest first. */
export function buildGroups(company: MonthlyBoardCompany): TemplateGroup[] {
  const map = new Map<string, TemplateGroup>();
  for (const day of company.days) {
    for (const trip of day.trips) {
      const key = groupKeyOf(company.customer.id, trip);
      let group = map.get(key);
      if (!group) {
        group = {
          key,
          customerId: company.customer.id,
          lineType: trip.rate_category || trip.billing_type || 'Single Trip',
          vehicleClass: trip.vehicle_type || 'Standard Truck',
          origin: formatLocationClean(trip.origin),
          destination: formatLocationClean(trip.destination),
          rate: trip.billing_amount,
          currency: trip.currency || 'SAR',
          rateStr: trip.billing_amount != null ? formatMoney(trip.billing_amount, trip.currency) : '—',
          trips: [],
        };
        map.set(key, group);
      }
      group.trips.push(trip);
    }
  }
  const groups = [...map.values()];
  for (const g of groups) {
    g.trips.sort((a, b) => a.date.localeCompare(b.date) || (a.planned_start || '').localeCompare(b.planned_start || ''));
  }
  return groups.sort((a, b) => b.trips.length - a.trips.length);
}

export interface TripTotals {
  /** Trips that count toward the month (cancelled ones don't). */
  total: number;
  done: number;
  /** Uncovered trips dated from today up to `soonDays` ahead. */
  gapsSoon: number;
  gaps: number;
  /** Past days still Draft/Scheduled — ran but never closed, or never ran. */
  overdue: number;
  earned: number;
  expected: number;
}

export function totalsOf(trips: MonthlyBoardTrip[], today: string, soonUntil: string): TripTotals {
  const t: TripTotals = { total: 0, done: 0, gapsSoon: 0, gaps: 0, overdue: 0, earned: 0, expected: 0 };
  for (const trip of trips) {
    const state = tripCellState(trip);
    if (state === 'cancelled') continue;
    const amount = trip.billing_amount ?? 0;
    t.total += 1;
    t.expected += amount;
    if (state === 'done') {
      t.done += 1;
      t.earned += amount;
    }
    if (isOverdue(trip, today)) t.overdue += 1;
    if (state === 'gap') {
      t.gaps += 1;
      if (trip.date >= today && trip.date <= soonUntil) t.gapsSoon += 1;
    }
  }
  return t;
}

/** Local YYYY-MM-DD, `offset` days from today. */
export function localDay(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Every day of a YYYY-MM month as YYYY-MM-DD, with its weekday (0 = Sunday). */
export function daysOfMonth(month: string): { date: string; day: number; weekday: number }[] {
  const [year, m] = month.split('-').map(Number);
  const count = new Date(year, m, 0).getDate();
  return Array.from({ length: count }, (_, i) => ({
    date: `${month}-${String(i + 1).padStart(2, '0')}`,
    day: i + 1,
    weekday: new Date(year, m - 1, i + 1).getDay(),
  }));
}

/** Who else holds a driver or truck on a given day. */
export interface Booking {
  tripId: string;
  ref: string;
  customer: string;
  route: string;
  /** Customer + origin → destination: repeat runs of one line share it. */
  lineKey: string;
  start: string | null;
  end: string | null;
}

/** The bits of a trip needed to test it against other bookings. */
export interface Slot {
  tripId: string;
  lineKey: string;
  start: string | null;
  end: string | null;
}

export type BookingIndex = Map<string, Booking[]>;

export const driverDayKey = (driverId: string, date: string) => `d:${driverId}|${date}`;
export const vehicleDayKey = (vehicleId: string, date: string) => `v:${vehicleId}|${date}`;

const lineKeyOf = (customerId: string, trip: MonthlyBoardTrip) =>
  `${customerId}|${formatLocationClean(trip.origin)}|${formatLocationClean(trip.destination)}`;

export const slotOf = (customerId: string, trip: MonthlyBoardTrip): Slot => ({
  tripId: trip.id,
  lineKey: lineKeyOf(customerId, trip),
  start: trip.planned_start,
  end: trip.planned_end,
});

/**
 * Same driver or truck on two trips the same day is only a problem when the
 * trips can't both happen: their planned windows overlap, or (without times)
 * they're for different lines of work. Several runs of one line a day — 3–4
 * Riyadh locals for the same customer — are normal and not flagged.
 */
function clashes(a: Slot, b: Booking): boolean {
  if (a.tripId === b.tripId) return false;
  if (a.start && a.end && b.start && b.end) return a.start < b.end && b.start < a.end;
  return a.lineKey !== b.lineKey;
}

/** Every non-cancelled trip in the month, indexed by driver-day and truck-day. */
export function buildBookings(companies: MonthlyBoardCompany[]): BookingIndex {
  const index: BookingIndex = new Map();
  const add = (key: string, b: Booking) => {
    const list = index.get(key);
    if (list) list.push(b);
    else index.set(key, [b]);
  };
  for (const company of companies) {
    for (const day of company.days) {
      for (const trip of day.trips) {
        if (trip.status === 'Cancelled') continue;
        const b: Booking = {
          tripId: trip.id,
          ref: trip.ref_id ?? 'Trip',
          customer: company.customer.name,
          route: `${displayPlace(formatLocationClean(trip.origin))} → ${displayPlace(formatLocationClean(trip.destination))}`,
          lineKey: lineKeyOf(company.customer.id, trip),
          start: trip.planned_start,
          end: trip.planned_end,
        };
        if (trip.driver) add(driverDayKey(trip.driver.id, trip.date), b);
        if (trip.vehicle) add(vehicleDayKey(trip.vehicle.id, trip.date), b);
      }
    }
  }
  return index;
}

/** Other trips that day the driver / truck under `key` can't also do. */
export function otherBookings(index: BookingIndex, key: string, slot: Slot): Booking[] {
  return (index.get(key) ?? []).filter((b) => clashes(slot, b));
}

/** True when this trip's driver or truck is genuinely double-booked that day. */
export function isDoubleBooked(index: BookingIndex, customerId: string, trip: MonthlyBoardTrip): boolean {
  if (trip.status === 'Cancelled') return false;
  const slot = slotOf(customerId, trip);
  return (
    (!!trip.driver && otherBookings(index, driverDayKey(trip.driver.id, trip.date), slot).length > 0) ||
    (!!trip.vehicle && otherBookings(index, vehicleDayKey(trip.vehicle.id, trip.date), slot).length > 0)
  );
}

/** "khamis mushayt" → "Khamis Mushayt"; anything already cased (JED DC, Riyadh) is left alone. */
export function displayPlace(place: string): string {
  if (!place || place !== place.toLowerCase()) return place;
  return place.replace(/(^|[\s\-/(])(\p{L})/gu, (_, sep: string, c: string) => sep + c.toUpperCase());
}

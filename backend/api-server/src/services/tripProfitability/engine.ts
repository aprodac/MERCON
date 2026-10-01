/**
 * Trip profitability — the arithmetic. Each earned trip's margin is its billing minus what it
 * cost: driver pay (own fleet), the subcontractor (third-party trips) and the expenses charged to
 * it (fuel, tolls). Same figures as the Trip Details page (calculateBackendTripFinancials plus
 * trip expenses). Grouping by customer, lane or truck just adds trips up.
 */

export interface ProfitTrip {
  id: string;
  refId: string | null;
  day: string;
  customerId: string;
  customer: string;
  lane: string;
  vehicleId: string | null;
  vehicle: string | null;
  driver: string | null;
  thirdParty: boolean;
  status: string;
  revenue: number;
  driverPay: number;
  subcontract: number;
  expenses: number;
}

export interface Totals {
  trips: number;
  revenue: number;
  driverPay: number;
  subcontract: number;
  expenses: number;
  cost: number;
  margin: number;
  /** Margin as % of revenue; null with no revenue. */
  marginPct: number | null;
  lossTrips: number;
  /** Trips with no billing at all: a missing price, not a real loss. */
  unpricedTrips: number;
}

export type GroupBy = 'trip' | 'customer' | 'lane' | 'vehicle';

export interface Group extends Totals {
  key: string;
  label: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export const tripCost = (t: ProfitTrip) => t.driverPay + t.subcontract + t.expenses;
export const tripMargin = (t: ProfitTrip) => r2(t.revenue - tripCost(t));
export const marginPct = (margin: number, revenue: number) => (revenue > 0.005 ? Math.round((margin / revenue) * 1000) / 10 : null);

export function totals(trips: ProfitTrip[]): Totals {
  const t = trips.reduce(
    (a, x) => {
      a.revenue += x.revenue;
      a.driverPay += x.driverPay;
      a.subcontract += x.subcontract;
      a.expenses += x.expenses;
      if (x.revenue <= 0.005) a.unpricedTrips += 1;
      else if (tripMargin(x) < -0.005) a.lossTrips += 1;
      return a;
    },
    { revenue: 0, driverPay: 0, subcontract: 0, expenses: 0, lossTrips: 0, unpricedTrips: 0 },
  );
  const cost = t.driverPay + t.subcontract + t.expenses;
  const margin = r2(t.revenue - cost);
  return {
    trips: trips.length,
    revenue: r2(t.revenue),
    driverPay: r2(t.driverPay),
    subcontract: r2(t.subcontract),
    expenses: r2(t.expenses),
    cost: r2(cost),
    margin,
    marginPct: marginPct(margin, t.revenue),
    lossTrips: t.lossTrips,
    unpricedTrips: t.unpricedTrips,
  };
}

const KEY: Record<Exclude<GroupBy, 'trip'>, (t: ProfitTrip) => [string, string]> = {
  customer: (t) => [t.customerId, t.customer],
  lane: (t) => [t.lane, t.lane],
  vehicle: (t) => [t.vehicleId ?? (t.thirdParty ? '3pl' : 'none'), t.vehicle ?? (t.thirdParty ? 'Subcontracted' : 'No truck')],
};

/** Customers, lanes or trucks with their totals, lowest margin % first (the ones to look at). */
export function groupTrips(trips: ProfitTrip[], by: Exclude<GroupBy, 'trip'>): Group[] {
  const map = new Map<string, { label: string; trips: ProfitTrip[] }>();
  for (const t of trips) {
    const [key, label] = KEY[by](t);
    const g = map.get(key) ?? { label, trips: [] };
    g.trips.push(t);
    map.set(key, g);
  }
  return [...map.entries()].map(([key, g]) => ({ key, label: g.label, ...totals(g.trips) }));
}

export type SortKey = 'margin_pct' | 'margin' | 'revenue' | 'date';

/** Worst first by default; unpriced rows (no %) go last. */
export function sortRows<T extends { margin: number; marginPct: number | null; revenue: number; day?: string }>(rows: T[], key: SortKey, desc: boolean): T[] {
  const val = (r: T): number => (key === 'margin' ? r.margin : key === 'revenue' ? r.revenue : key === 'date' ? Date.parse(r.day ?? '') || 0 : r.marginPct ?? Number.NaN);
  return [...rows].sort((a, b) => {
    const x = val(a);
    const y = val(b);
    if (Number.isNaN(x) || Number.isNaN(y)) return Number.isNaN(x) === Number.isNaN(y) ? 0 : Number.isNaN(x) ? 1 : -1;
    return desc ? y - x : x - y;
  });
}

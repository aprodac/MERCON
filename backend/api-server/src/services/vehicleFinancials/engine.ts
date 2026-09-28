/**
 * Vehicle P&L engine — pure calculation, no database access.
 *
 * The loader (./loader.ts) turns Prisma rows into the plain inputs below; this
 * file decides what every number means, so it is the one place to read when a
 * figure on the Vehicle P&L pages is questioned.
 *
 * Per truck, per period:
 *
 *   Revenue                 trip billing + itemised extra charges (same figure
 *                           as the Trip Details page — calculateBackendTripFinancials)
 * − Trip pay                driver + co-driver payout on those trips
 * − Fuel, maintenance, tolls, other
 * = Contribution            "is this truck earning on the road?"
 * − Driver salary share     monthly salary split across the trucks each driver
 *                           drove that month, by trip count
 * − Depreciation            straight line over the truck's useful life
 * − Fixed costs             insurance, Istimara, … spread per month
 * = Net profit              "is owning this truck worth it?"
 *
 * Dates are company-local calendar days ("YYYY-MM-DD"). Time-based costs
 * (salary, depreciation, fixed costs) accrue per calendar month in proportion
 * to the days covered, and never past `accrueTo` (today) — so "this month"
 * mid-month shows costs to date, not the whole month's.
 */

export type DirectLine = 'fuel' | 'maintenance' | 'tolls' | 'other';
export type Frequency = 'Monthly' | 'Yearly';

/** Straight-line life used when a purchase price is set but no life is. */
export const DEFAULT_USEFUL_LIFE_YEARS = 5;

/* ── Calendar-day helpers ─────────────────────────────────────────────── */

const DAY_MS = 86_400_000;

/** Days since the epoch for a "YYYY-MM-DD" string (timezone-free arithmetic). */
export const dayNumber = (day: string): number => {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
};

export const dayString = (n: number): string => new Date(n * DAY_MS).toISOString().slice(0, 10);

const daysInMonth = (month: string): number => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

const nextMonth = (month: string): string => {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};

/** Calendar day of an instant in a timezone, as "YYYY-MM-DD". */
export const localDay = (instant: Date, tz: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);

/** "YYYY-MM" months from `from` to `to` inclusive. */
export const monthsBetween = (fromDay: string, toDay: string): string[] => {
  const out: string[] = [];
  const last = toDay.slice(0, 7);
  for (let m = fromDay.slice(0, 7); m <= last; m = nextMonth(m)) out.push(m);
  return out;
};

/** Adds whole years to a day, clamping 29 Feb to 28 Feb. */
export const addYears = (day: string, years: number): string => {
  const [y, m, d] = day.split('-').map(Number);
  const target = new Date(Date.UTC(y + years, m - 1, 1));
  const last = new Date(Date.UTC(y + years, m, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
};

/**
 * Spreads a monthly amount over the days of [activeFrom, activeTo] that fall
 * inside [from, to]. A full calendar month gets exactly `monthly`; a partial
 * month gets monthly × coveredDays / daysInMonth. Returns month → amount.
 */
export function accrueMonthly(
  monthly: number,
  activeFrom: string,
  activeTo: string | null,
  from: string,
  to: string,
): Map<string, number> {
  const out = new Map<string, number>();
  if (!(monthly > 0)) return out;
  const start = Math.max(dayNumber(activeFrom), dayNumber(from));
  const end = Math.min(activeTo ? dayNumber(activeTo) : Infinity, dayNumber(to));
  if (end < start) return out;
  for (const month of monthsBetween(dayString(start), dayString(end))) {
    const mStart = dayNumber(`${month}-01`);
    const mEnd = mStart + daysInMonth(month) - 1;
    const covered = Math.min(end, mEnd) - Math.max(start, mStart) + 1;
    if (covered > 0) out.set(month, (monthly * covered) / daysInMonth(month));
  }
  return out;
}

const sumMap = (m: Map<string, number>) => [...m.values()].reduce((s, v) => s + v, 0);

/* ── Expense classification ───────────────────────────────────────────── */

/**
 * Which P&L line a vehicle-linked expense lands on. `null` means it is not a
 * truck cost here: salary payments are the cash side of the salary this
 * engine already accrues from DriverSalary, and a salary advance is money the
 * driver owes back — counting either would double or invent a cost.
 */
export function classifyExpense(category: string | null | undefined): DirectLine | null {
  const c = (category || '').trim().toLowerCase();
  if (c === 'salary' || c === 'salary advance') return null;
  if (c === 'fuel') return 'fuel';
  if (c === 'vehicle maintenance' || c === 'maintenance' || c === 'tyres' || c === 'tires') return 'maintenance';
  if (c === 'toll & parking' || c === 'tolls' || c === 'parking') return 'tolls';
  return 'other';
}

/* ── Inputs ───────────────────────────────────────────────────────────── */

export interface EconTrip {
  id: string;
  vehicleId: string;
  /** Primary driver and co-driver, when present. */
  driverIds: string[];
  day: string;
  revenue: number;
  driverPay: number;
  distanceKm: number;
}

export interface EconCost {
  vehicleId: string;
  day: string;
  amount: number;
  line: DirectLine;
}

export interface EconFixedCost {
  id: string;
  category: string;
  label: string | null;
  amount: number;
  frequency: Frequency;
  startDay: string;
  endDay: string | null;
}

export interface EconVehicle {
  id: string;
  purchasePrice: number | null;
  residualValue: number | null;
  usefulLifeYears: number | null;
  purchaseDay: string | null;
  fixedCosts: EconFixedCost[];
}

export interface EconSalary {
  driverId: string;
  /** base + allowances + employer costs, per month. */
  monthly: number;
  fromDay: string;
  toDay: string | null;
}

export interface EconInput {
  from: string;
  to: string;
  /** Last day time-based costs accrue to — min(to, today). */
  accrueTo: string;
  vehicles: EconVehicle[];
  /** Earned own-fleet trips in range. May include trips on vehicles not in
   *  `vehicles` — they still count toward a driver's salary split. */
  trips: EconTrip[];
  costs: EconCost[];
  salaries: EconSalary[];
  /** Driver → truck they're assigned to now, for months they made no trips. */
  assignedVehicle: Map<string, string>;
}

/* ── Outputs ──────────────────────────────────────────────────────────── */

export interface Breakdown {
  revenue: number;
  driver_pay: number;
  fuel: number;
  maintenance: number;
  tolls: number;
  other: number;
  direct_costs: number;
  contribution: number;
  salary: number;
  depreciation: number;
  fixed_costs: number;
  overhead: number;
  total_costs: number;
  net_profit: number;
  /** Net profit / revenue, 1 decimal; null when there is no revenue. */
  margin_percent: number | null;
  contribution_percent: number | null;
}

export interface MonthPoint {
  month: string;
  revenue: number;
  direct_costs: number;
  overhead: number;
  net_profit: number;
}

export interface SalaryShare {
  driverId: string;
  month: string;
  amount: number;
  /** "trips": split by trips driven; "assigned": no trips that month, charged to the assigned truck. */
  basis: 'trips' | 'assigned';
  vehicleTrips: number;
  driverTrips: number;
}

export interface FixedCostShare {
  id: string;
  category: string;
  label: string | null;
  monthly: number;
  amount: number;
}

export interface VehicleEconomics {
  vehicleId: string;
  totals: Breakdown;
  monthly: MonthPoint[];
  trips: number;
  distanceKm: number;
  salaryShares: SalaryShare[];
  fixedCostShares: FixedCostShare[];
  depreciationMonthly: number;
  hasCostProfile: boolean;
}

export interface EconResult {
  vehicles: Map<string, VehicleEconomics>;
  /** Salary of drivers with no trips and no assigned truck in a month. */
  unallocatedSalary: { driverId: string; month: string; amount: number }[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

type Bucket = Record<'revenue' | 'driver_pay' | DirectLine | 'salary' | 'depreciation' | 'fixed_costs', number>;
const emptyBucket = (): Bucket => ({
  revenue: 0, driver_pay: 0, fuel: 0, maintenance: 0, tolls: 0, other: 0, salary: 0, depreciation: 0, fixed_costs: 0,
});

export function toBreakdown(b: Bucket): Breakdown {
  const direct = b.driver_pay + b.fuel + b.maintenance + b.tolls + b.other;
  const overhead = b.salary + b.depreciation + b.fixed_costs;
  const contribution = b.revenue - direct;
  const net = contribution - overhead;
  return {
    revenue: round2(b.revenue),
    driver_pay: round2(b.driver_pay),
    fuel: round2(b.fuel),
    maintenance: round2(b.maintenance),
    tolls: round2(b.tolls),
    other: round2(b.other),
    direct_costs: round2(direct),
    contribution: round2(contribution),
    salary: round2(b.salary),
    depreciation: round2(b.depreciation),
    fixed_costs: round2(b.fixed_costs),
    overhead: round2(overhead),
    total_costs: round2(direct + overhead),
    net_profit: round2(net),
    margin_percent: pct(net, b.revenue),
    contribution_percent: pct(contribution, b.revenue),
  };
}

/** Adds breakdowns field by field (for fleet totals); percentages recomputed. */
export function sumBreakdowns(list: Breakdown[]): Breakdown {
  const b = emptyBucket();
  for (const x of list) {
    b.revenue += x.revenue; b.driver_pay += x.driver_pay; b.fuel += x.fuel; b.maintenance += x.maintenance;
    b.tolls += x.tolls; b.other += x.other; b.salary += x.salary; b.depreciation += x.depreciation; b.fixed_costs += x.fixed_costs;
  }
  return toBreakdown(b);
}

/* ── The calculation ──────────────────────────────────────────────────── */

export function computeVehicleEconomics(input: EconInput): EconResult {
  const { from, to, accrueTo } = input;
  const accrueEnd = accrueTo < to ? accrueTo : to;
  const months = monthsBetween(from, to);

  const perVehicle = new Map<string, { total: Bucket; byMonth: Map<string, Bucket>; trips: number; km: number; salary: SalaryShare[]; fixed: FixedCostShare[]; depMonthly: number; profile: boolean }>();
  for (const v of input.vehicles) {
    perVehicle.set(v.id, { total: emptyBucket(), byMonth: new Map(), trips: 0, km: 0, salary: [], fixed: [], depMonthly: 0, profile: false });
  }
  const add = (vehicleId: string, month: string, key: keyof Bucket, amount: number) => {
    const acc = perVehicle.get(vehicleId);
    if (!acc || !amount) return;
    acc.total[key] += amount;
    if (!acc.byMonth.has(month)) acc.byMonth.set(month, emptyBucket());
    acc.byMonth.get(month)![key] += amount;
  };

  // Trips: revenue and trip pay land on the trip's day
  for (const t of input.trips) {
    const acc = perVehicle.get(t.vehicleId);
    if (!acc) continue;
    const month = t.day.slice(0, 7);
    add(t.vehicleId, month, 'revenue', t.revenue);
    add(t.vehicleId, month, 'driver_pay', t.driverPay);
    acc.trips += 1;
    acc.km += t.distanceKm;
  }

  for (const c of input.costs) add(c.vehicleId, c.day.slice(0, 7), c.line, c.amount);

  // Ownership: depreciation and recurring fixed costs
  for (const v of input.vehicles) {
    const acc = perVehicle.get(v.id)!;
    if (v.purchasePrice && v.purchasePrice > 0 && v.purchaseDay) {
      acc.profile = true;
      const life = v.usefulLifeYears && v.usefulLifeYears > 0 ? v.usefulLifeYears : DEFAULT_USEFUL_LIFE_YEARS;
      const depreciable = Math.max(0, v.purchasePrice - (v.residualValue ?? 0));
      const monthly = depreciable / (life * 12);
      acc.depMonthly = round2(monthly);
      const lastDay = dayString(dayNumber(addYears(v.purchaseDay, life)) - 1);
      for (const [month, amount] of accrueMonthly(monthly, v.purchaseDay, lastDay, from, accrueEnd)) add(v.id, month, 'depreciation', amount);
    }
    for (const fc of v.fixedCosts) {
      acc.profile = true;
      const monthly = fc.frequency === 'Yearly' ? fc.amount / 12 : fc.amount;
      const accrued = accrueMonthly(monthly, fc.startDay, fc.endDay, from, accrueEnd);
      for (const [month, amount] of accrued) add(v.id, month, 'fixed_costs', amount);
      acc.fixed.push({ id: fc.id, category: fc.category, label: fc.label, monthly: round2(monthly), amount: round2(sumMap(accrued)) });
    }
  }

  // Driver salary: per month, split across the trucks the driver drove
  const tripsByDriverMonth = new Map<string, Map<string, number>>(); // `${driver}|${month}` → vehicle → trips
  for (const t of input.trips) {
    for (const d of new Set(t.driverIds)) {
      const key = `${d}|${t.day.slice(0, 7)}`;
      if (!tripsByDriverMonth.has(key)) tripsByDriverMonth.set(key, new Map());
      const m = tripsByDriverMonth.get(key)!;
      m.set(t.vehicleId, (m.get(t.vehicleId) ?? 0) + 1);
    }
  }

  const salaryByDriverMonth = new Map<string, Map<string, number>>();
  for (const s of input.salaries) {
    if (!salaryByDriverMonth.has(s.driverId)) salaryByDriverMonth.set(s.driverId, new Map());
    const target = salaryByDriverMonth.get(s.driverId)!;
    for (const [month, amount] of accrueMonthly(s.monthly, s.fromDay, s.toDay, from, accrueEnd)) {
      target.set(month, (target.get(month) ?? 0) + amount);
    }
  }

  const unallocatedSalary: EconResult['unallocatedSalary'] = [];
  for (const [driverId, byMonth] of salaryByDriverMonth) {
    for (const [month, amount] of byMonth) {
      const split = tripsByDriverMonth.get(`${driverId}|${month}`);
      if (split && split.size > 0) {
        const driverTrips = [...split.values()].reduce((s, n) => s + n, 0);
        for (const [vehicleId, n] of split) {
          const share = (amount * n) / driverTrips;
          add(vehicleId, month, 'salary', share);
          perVehicle.get(vehicleId)?.salary.push({ driverId, month, amount: round2(share), basis: 'trips', vehicleTrips: n, driverTrips });
        }
        continue;
      }
      const assigned = input.assignedVehicle.get(driverId);
      if (assigned && perVehicle.has(assigned)) {
        add(assigned, month, 'salary', amount);
        perVehicle.get(assigned)!.salary.push({ driverId, month, amount: round2(amount), basis: 'assigned', vehicleTrips: 0, driverTrips: 0 });
      } else if (!assigned) {
        unallocatedSalary.push({ driverId, month, amount: round2(amount) });
      }
      // Assigned to a truck outside this result's scope: that truck's report carries it.
    }
  }

  const vehicles = new Map<string, VehicleEconomics>();
  for (const [vehicleId, acc] of perVehicle) {
    vehicles.set(vehicleId, {
      vehicleId,
      totals: toBreakdown(acc.total),
      monthly: months.map((month) => {
        const b = toBreakdown(acc.byMonth.get(month) ?? emptyBucket());
        return { month, revenue: b.revenue, direct_costs: b.direct_costs, overhead: b.overhead, net_profit: b.net_profit };
      }),
      trips: acc.trips,
      distanceKm: Math.round(acc.km),
      salaryShares: acc.salary,
      fixedCostShares: acc.fixed,
      depreciationMonthly: acc.depMonthly,
      hasCostProfile: acc.profile,
    });
  }
  return { vehicles, unallocatedSalary };
}

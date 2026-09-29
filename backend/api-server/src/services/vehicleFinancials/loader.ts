/**
 * Vehicle P&L — loads rows from the database, runs the engine, and shapes the
 * two API responses (fleet and single truck). All the arithmetic lives in
 * ./engine.ts; this file only decides which rows count and how they map in.
 */
import { Prisma, PrismaClient } from '@prisma/client';

import { prisma as defaultPrisma } from '../../db';
import { localDateToUtc } from '../../controllers/financeReportsController';
import { calculateBackendTripFinancials } from '../../utils/tripFinancials';
import {
  classifyExpense,
  computeVehicleEconomics,
  dayNumber,
  dayString,
  localDay,
  monthsBetween,
  sumBreakdowns,
  type Breakdown,
  type EconCost,
  type EconSalary,
  type EconTrip,
  type EconVehicle,
  type MonthPoint,
} from './engine';

type Db = PrismaClient | Prisma.TransactionClient;

const FALLBACK_TZ = 'Asia/Riyadh';
const EARNED_STATUSES = ['Completed', 'Invoiced'] as const;
/** Maintenance that hasn't happened (or won't) is not a cost yet. */
const NOT_INCURRED_MAINTENANCE = ['Scheduled', 'Cancelled'];
/** A bill is a real cost once approved; drafts and voided bills are not. */
const COUNTED_BILL_STATUSES = ['Approved', 'PartiallyPaid', 'Paid'] as const;
/** Mirror expenses that syncMaintenanceExpense writes for a MaintenanceRecord. */
const MAINTENANCE_MIRROR_PREFIX = 'EXP-MNT-';
const LEDGER_LIMIT = 500;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface FinancialsQuery {
  from?: string;
  to?: string;
}

interface Range {
  tz: string;
  /** Requested bounds; undefined = open ("all time"). */
  from?: string;
  to?: string;
  today: string;
}

async function companyTimezone(db: Db): Promise<string> {
  try {
    const s = await db.settings.findUnique({ where: { id: 'singleton' }, select: { timezone: true } });
    return s?.timezone || FALLBACK_TZ;
  } catch {
    return FALLBACK_TZ;
  }
}

/**
 * `from`/`to` may be company-local dates ("2026-09-01") or instants (the
 * operator app sends ISO timestamps); both become local calendar days.
 */
function toDay(value: string | undefined, tz: string): string | undefined {
  if (!value) return undefined;
  if (DAY_RE.test(value)) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : localDay(d, tz);
}

async function resolveRange(db: Db, q: FinancialsQuery): Promise<Range> {
  const tz = await companyTimezone(db);
  return { tz, from: toDay(q.from, tz), to: toDay(q.to, tz), today: localDay(new Date(), tz) };
}

/** Prisma filter for an instant column falling on local days [from, to]. */
function instantFilter(r: Range): Prisma.DateTimeFilter | undefined {
  if (!r.from && !r.to) return undefined;
  return {
    ...(r.from ? { gte: localDateToUtc(r.from, r.tz, false) } : {}),
    ...(r.to ? { lte: localDateToUtc(r.to, r.tz, true) } : {}),
  };
}

/**
 * A trip is dated by when it finished (else started, else was created) — the
 * same date its revenue is shown under — not by when it was booked.
 */
function tripDateWhere(r: Range): Prisma.TripWhereInput {
  const f = instantFilter(r);
  if (!f) return {};
  return {
    OR: [
      { actual_end: f },
      { actual_end: null, actual_start: f },
      { actual_end: null, actual_start: null, createdAt: f },
    ],
  };
}

const tripInclude = {
  customer: { select: { name: true } },
  quotation: { select: { rate: true, driver_payout: true, pricing_basis: true } },
  charges: { select: { amount: true } },
} satisfies Prisma.TripInclude;

type TripRow = Prisma.TripGetPayload<{ include: typeof tripInclude }>;

interface LoadedTrip extends EconTrip {
  refId: string | null;
  customer: string;
  status: string;
}

function mapTrip(t: TripRow, tz: string): LoadedTrip {
  // Same calculation as the Trip Details page, so both show the same numbers
  const fin = calculateBackendTripFinancials(t as any);
  const when = t.actual_end || t.actual_start || t.createdAt;
  return {
    id: t.id,
    refId: t.ref_id,
    vehicleId: t.vehicleId!,
    driverIds: [t.driverId, t.co_driver_id].filter((x): x is string => Boolean(x)),
    day: localDay(when, tz),
    revenue: fin.totalCustomerBilling,
    driverPay: fin.totalDriverPayout,
    distanceKm: t.planned_distance || 0,
    customer: t.customer?.name || '—',
    status: t.status,
  };
}

const num = (v: Prisma.Decimal | number | null | undefined) => (v == null ? 0 : Number(v));

interface CostRow extends EconCost {
  id: string;
  refId: string | null;
  source: 'expense' | 'maintenance' | 'bill';
  category: string;
  description: string | null;
}

interface Scope {
  /** Restrict to one truck; undefined = every live truck. */
  vehicleId?: string;
}

async function load(db: Db, range: Range, scope: Scope) {
  const { tz } = range;
  const dateF = instantFilter(range);
  const earned = { deletedAt: null, is_third_party: false, status: { in: [...EARNED_STATUSES] } } satisfies Prisma.TripWhereInput;

  const vehicles = await db.vehicle.findMany({
    where: { deletedAt: null, ...(scope.vehicleId ? { id: scope.vehicleId } : {}) },
    include: { fixedCosts: { where: { deletedAt: null }, orderBy: { start_date: 'asc' } } },
    orderBy: { plate_number: 'asc' },
  });
  const vehicleIds = vehicles.map((v) => v.id);

  // Trips: the scope's own trips, plus (single truck) every other trip its
  // drivers made — needed to split their salaries across trucks.
  const ownTrips = await db.trip.findMany({
    where: { ...earned, vehicleId: scope.vehicleId ?? { not: null }, ...tripDateWhere(range) },
    include: tripInclude,
    orderBy: { actual_end: 'desc' },
  });
  let tripRows = ownTrips;
  const drivers = await db.driver.findMany({
    where: scope.vehicleId ? {} : { deletedAt: null },
    select: { id: true, first_name: true, last_name: true, assignedVehicleId: true, deletedAt: true },
  });
  let driverIds = new Set(drivers.filter((d) => !d.deletedAt).map((d) => d.id));
  if (scope.vehicleId) {
    driverIds = new Set(ownTrips.flatMap((t) => [t.driverId, t.co_driver_id]).filter((x): x is string => Boolean(x)));
    for (const d of drivers) if (d.assignedVehicleId === scope.vehicleId && !d.deletedAt) driverIds.add(d.id);
    if (driverIds.size > 0) {
      const ids = [...driverIds];
      const others = await db.trip.findMany({
        where: { ...earned, vehicleId: { not: null, notIn: [scope.vehicleId] }, AND: [tripDateWhere(range), { OR: [{ driverId: { in: ids } }, { co_driver_id: { in: ids } }] }] },
        include: tripInclude,
      });
      tripRows = [...ownTrips, ...others];
    }
  }
  const trips = tripRows.map((t) => mapTrip(t, tz));

  const [expenses, maintenance, billLines, salaries] = await Promise.all([
    db.expense.findMany({
      where: {
        deletedAt: null,
        // A trip expense belongs to the trip's truck, even if the trip was reassigned after it was recorded
        OR: [{ vehicleId: scope.vehicleId ?? { not: null } }, { trip: { vehicleId: scope.vehicleId ?? { not: null } } }],
        ...(dateF ? { expense_date: dateF } : {}),
      },
      include: { trip: { select: { vehicleId: true } } },
      orderBy: { expense_date: 'desc' },
    }),
    db.maintenanceRecord.findMany({
      where: {
        deletedAt: null,
        status: { notIn: NOT_INCURRED_MAINTENANCE },
        ...(scope.vehicleId ? { vehicleId: scope.vehicleId } : {}),
        ...(dateF ? { start_date: dateF } : {}),
      },
      orderBy: { start_date: 'desc' },
    }),
    db.billLine.findMany({
      where: {
        source_type: 'Manual',
        vehicleId: scope.vehicleId ?? { not: null },
        bill: { status: { in: [...COUNTED_BILL_STATUSES] }, ...(dateF ? { bill_date: dateF } : {}) },
      },
      include: { bill: { select: { id: true, ref_id: true, bill_date: true, payee_name: true, provider: { select: { name: true } } } } },
    }),
    db.driverSalary.findMany({
      where: { deletedAt: null, ...(scope.vehicleId ? { driverId: { in: [...driverIds] } } : {}) },
      orderBy: [{ driverId: 'asc' }, { effective_from: 'asc' }],
    }),
  ]);

  const costs: CostRow[] = [];
  for (const e of expenses) {
    // The maintenance record itself is counted below; skip its mirror expense.
    // (Filtered here, not in SQL: NOT startsWith would also drop null ref_ids.)
    if (e.ref_id?.startsWith(MAINTENANCE_MIRROR_PREFIX)) continue;
    const line = classifyExpense(e.category);
    const vehicleId = e.trip?.vehicleId ?? e.vehicleId;
    if (!line || !vehicleId) continue;
    if (scope.vehicleId && vehicleId !== scope.vehicleId) continue;
    costs.push({ id: e.id, refId: e.ref_id, source: 'expense', vehicleId, day: localDay(e.expense_date, tz), amount: num(e.amount), line, category: e.category, description: e.description });
  }
  for (const m of maintenance) {
    costs.push({
      id: m.id, refId: m.ref_id, source: 'maintenance', vehicleId: m.vehicleId, day: localDay(m.start_date || m.service_date, tz),
      amount: num(m.cost), line: 'maintenance', category: m.maintenance_type, description: m.work_done || m.workshop_name,
    });
  }
  for (const l of billLines) {
    if (!l.vehicleId) continue;
    costs.push({
      id: l.bill.id, refId: l.bill.ref_id, source: 'bill', vehicleId: l.vehicleId, day: localDay(l.bill.bill_date, tz),
      amount: num(l.amount), line: 'other', category: 'Supplier bill', description: l.description,
    });
  }

  // Salary windows: a package runs to its own end date, else to the day
  // before the driver's next package, and never past the driver's deletion.
  const driverById = new Map(drivers.map((d) => [d.id, d]));
  const econSalaries: EconSalary[] = [];
  salaries.forEach((s, i) => {
    const next = salaries[i + 1]?.driverId === s.driverId ? salaries[i + 1] : null;
    let toDayStr = s.effective_to ? localDay(s.effective_to, tz) : next ? dayString(dayNumber(localDay(next.effective_from, tz)) - 1) : null;
    const deleted = driverById.get(s.driverId)?.deletedAt;
    if (deleted) {
      const del = localDay(deleted, tz);
      if (!toDayStr || del < toDayStr) toDayStr = del;
    }
    econSalaries.push({ driverId: s.driverId, monthly: num(s.base_salary) + num(s.allowances) + num(s.employer_costs), fromDay: localDay(s.effective_from, tz), toDay: toDayStr });
  });

  const inScope = new Set(vehicleIds);
  const assignedVehicle = new Map<string, string>();
  for (const d of drivers) {
    if (d.deletedAt || !d.assignedVehicleId) continue;
    if (scope.vehicleId ? d.assignedVehicleId === scope.vehicleId : inScope.has(d.assignedVehicleId)) assignedVehicle.set(d.id, d.assignedVehicleId);
    // Single truck: a driver assigned elsewhere is left out of the map, so a
    // month with no trips charges that other truck, not this one.
    else if (scope.vehicleId) assignedVehicle.set(d.id, d.assignedVehicleId);
  }

  // Open-ended ranges: start at the earliest activity, end today.
  const activityDays = [...trips.map((t) => t.day), ...costs.map((c) => c.day)].sort();
  const from = range.from ?? activityDays[0] ?? range.today;
  const to = range.to ?? (range.today > (activityDays[activityDays.length - 1] ?? '') ? range.today : activityDays[activityDays.length - 1]);
  const accrueTo = to < range.today ? to : range.today;

  const econVehicles: EconVehicle[] = vehicles.map((v) => ({
    id: v.id,
    purchasePrice: v.purchase_price == null ? null : num(v.purchase_price),
    residualValue: v.residual_value == null ? null : num(v.residual_value),
    usefulLifeYears: v.useful_life_years,
    purchaseDay: v.purchase_date ? localDay(v.purchase_date, tz) : null,
    fixedCosts: v.fixedCosts.map((fc) => ({
      id: fc.id, category: fc.category, label: fc.label, amount: num(fc.amount), frequency: fc.frequency,
      startDay: localDay(fc.start_date, tz), endDay: fc.end_date ? localDay(fc.end_date, tz) : null,
    })),
  }));

  const result = computeVehicleEconomics({ from, to, accrueTo, vehicles: econVehicles, trips, costs, salaries: econSalaries, assignedVehicle });
  const salaried = new Set(econSalaries.map((s) => s.driverId));

  return { vehicles, trips, costs, drivers, driverById, result, salaried, from, to, accrueTo };
}

/* ── Response shaping ─────────────────────────────────────────────────── */

const driverName = (d?: { first_name: string; last_name: string } | null) => (d ? `${d.first_name} ${d.last_name}`.trim() : null);

interface Flags {
  missing_billing: number;
  missing_driver_pay: number;
  no_fuel: boolean;
  no_cost_profile: boolean;
  drivers_without_salary: { id: string; name: string }[];
}

function flagsFor(vehicleId: string, loaded: Awaited<ReturnType<typeof load>>): Flags {
  const own = loaded.trips.filter((t) => t.vehicleId === vehicleId);
  const econ = loaded.result.vehicles.get(vehicleId)!;
  const unpaid = new Set<string>();
  for (const t of own) for (const d of t.driverIds) if (!loaded.salaried.has(d)) unpaid.add(d);
  return {
    missing_billing: own.filter((t) => t.revenue <= 0).length,
    missing_driver_pay: own.filter((t) => t.driverPay <= 0).length,
    no_fuel: own.length > 0 && econ.totals.fuel <= 0,
    no_cost_profile: !econ.hasCostProfile,
    drivers_without_salary: [...unpaid].map((id) => ({ id, name: driverName(loaded.driverById.get(id)) ?? 'Unknown driver' })),
  };
}

const perUnit = (amount: number, units: number) => (units > 0 ? Math.round((amount / units) * 100) / 100 : null);

export async function buildFleetFinancials(q: FinancialsQuery, db: Db = defaultPrisma) {
  const range = await resolveRange(db, q);
  const loaded = await load(db, range, {});
  const assignedDriver = new Map<string, { id: string; name: string }>();
  for (const d of loaded.drivers) if (d.assignedVehicleId && !d.deletedAt) assignedDriver.set(d.assignedVehicleId, { id: d.id, name: driverName(d)! });

  const rows = loaded.vehicles.map((v) => {
    const econ = loaded.result.vehicles.get(v.id)!;
    const t = econ.totals;
    return {
      vehicle_id: v.id,
      plate_number: v.plate_number,
      ref_id: v.ref_id,
      asset_type: v.asset_type,
      status: v.status,
      driver: assignedDriver.get(v.id) ?? null,
      ...t,
      trips_count: econ.trips,
      distance_km: econ.distanceKm,
      revenue_per_trip: perUnit(t.revenue, econ.trips),
      cost_per_km: econ.distanceKm > 0 ? perUnit(t.total_costs, econ.distanceKm) : null,
      active: econ.trips > 0 || t.direct_costs > 0,
      monthly: econ.monthly.map((m) => m.net_profit),
      flags: flagsFor(v.id, loaded),
    };
  });

  const totals = sumBreakdowns(rows.map((r) => loaded.result.vehicles.get(r.vehicle_id)!.totals));
  const months = monthsBetween(loaded.from, loaded.to);
  const monthly: MonthPoint[] = months.map((month, i) => {
    const pts = [...loaded.result.vehicles.values()].map((v) => v.monthly[i]);
    const sum = (k: keyof Omit<MonthPoint, 'month'>) => Math.round(pts.reduce((s, p) => s + p[k], 0) * 100) / 100;
    return { month, revenue: sum('revenue'), direct_costs: sum('direct_costs'), overhead: sum('overhead'), net_profit: sum('net_profit') };
  });
  const unallocated = loaded.result.unallocatedSalary.map((u) => ({ driver_id: u.driverId, driver_name: driverName(loaded.driverById.get(u.driverId)) ?? 'Unknown driver', month: u.month, amount: u.amount }));
  const noSalary = new Set(rows.flatMap((r) => r.flags.drivers_without_salary.map((d) => d.id)));

  return {
    range: { from: loaded.from, to: loaded.to, accrued_to: loaded.accrueTo, timezone: range.tz, open_start: !range.from },
    summary: {
      ...totals,
      vehicles_count: rows.length,
      active_count: rows.filter((r) => r.active).length,
      profitable_count: rows.filter((r) => r.active && r.net_profit > 0).length,
      loss_count: rows.filter((r) => r.active && r.net_profit < 0).length,
      idle_count: rows.filter((r) => !r.active).length,
      trips_count: rows.reduce((s, r) => s + r.trips_count, 0),
      distance_km: rows.reduce((s, r) => s + r.distance_km, 0),
      unallocated_salary: Math.round(unallocated.reduce((s, u) => s + u.amount, 0) * 100) / 100,
      flags: {
        missing_billing_trips: rows.reduce((s, r) => s + r.flags.missing_billing, 0),
        missing_driver_pay_trips: rows.reduce((s, r) => s + r.flags.missing_driver_pay, 0),
        trucks_without_fuel: rows.filter((r) => r.flags.no_fuel).length,
        trucks_without_cost_profile: rows.filter((r) => r.flags.no_cost_profile).length,
        drivers_without_salary: noSalary.size,
      },
    },
    vehicles: rows,
    monthly,
    unallocated_salary: unallocated,
  };
}

export async function buildVehicleFinancials(vehicleId: string, q: FinancialsQuery, db: Db = defaultPrisma) {
  const range = await resolveRange(db, q);
  const loaded = await load(db, range, { vehicleId });
  const v = loaded.vehicles[0];
  if (!v) return null;
  const econ = loaded.result.vehicles.get(v.id)!;
  const t: Breakdown = econ.totals;
  const assigned = loaded.drivers.find((d) => d.assignedVehicleId === v.id && !d.deletedAt);
  const own = loaded.trips.filter((x) => x.vehicleId === v.id).sort((a, b) => b.day.localeCompare(a.day));

  return {
    range: { from: loaded.from, to: loaded.to, accrued_to: loaded.accrueTo, timezone: range.tz, open_start: !range.from },
    vehicle: {
      id: v.id,
      plate_number: v.plate_number,
      ref_id: v.ref_id,
      asset_type: v.asset_type,
      status: v.status,
      capacity_kg: v.capacity_kg,
      driver: assigned ? { id: assigned.id, name: driverName(assigned)! } : null,
      purchase_price: v.purchase_price == null ? null : num(v.purchase_price),
      purchase_date: v.purchase_date,
      useful_life_years: v.useful_life_years,
      residual_value: v.residual_value == null ? null : num(v.residual_value),
      fixed_costs: v.fixedCosts.map((fc) => ({
        id: fc.id, category: fc.category, label: fc.label, amount: num(fc.amount), frequency: fc.frequency,
        start_date: fc.start_date, end_date: fc.end_date, notes: fc.notes,
      })),
    },
    totals: t,
    trips_count: econ.trips,
    distance_km: econ.distanceKm,
    revenue_per_trip: perUnit(t.revenue, econ.trips),
    cost_per_km: econ.distanceKm > 0 ? perUnit(t.total_costs, econ.distanceKm) : null,
    flags: flagsFor(v.id, loaded),
    monthly: econ.monthly,
    ledger: {
      trips: own.slice(0, LEDGER_LIMIT).map((x) => ({
        id: x.id, ref_id: x.refId, day: x.day, customer: x.customer, status: x.status,
        drivers: x.driverIds.map((d) => driverName(loaded.driverById.get(d)) ?? 'Unknown driver'),
        revenue: x.revenue, driver_pay: x.driverPay, distance_km: x.distanceKm,
      })),
      costs: loaded.costs
        .filter((c) => c.vehicleId === v.id)
        .sort((a, b) => b.day.localeCompare(a.day))
        .slice(0, LEDGER_LIMIT)
        .map((c) => ({ id: c.id, ref_id: c.refId, source: c.source, line: c.line, category: c.category, description: c.description, day: c.day, amount: c.amount })),
      salary: econ.salaryShares.map((s) => ({ ...s, driver_name: driverName(loaded.driverById.get(s.driverId)) ?? 'Unknown driver' })),
      fixed_costs: econ.fixedCostShares,
      depreciation: { monthly: econ.depreciationMonthly, amount: t.depreciation },
    },
    // Field names the operator app's "This month" card reads — keep them.
    summary: {
      total_income: t.revenue,
      total_expenses: t.total_costs,
      net_profit: t.net_profit,
      margin_percent: t.margin_percent ?? 0,
      fuel_expenses: t.fuel,
      maintenance_expenses: t.maintenance,
      driver_charges: t.driver_pay,
      completed_trips_count: econ.trips,
      total_distance_km: econ.distanceKm,
    },
  };
}

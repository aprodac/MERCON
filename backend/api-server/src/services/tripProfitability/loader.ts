/**
 * Trip profitability — which trips count and how they map in. Earned trips (Completed, Invoiced)
 * dated by when they finished, the same rule as Vehicle P&L; the arithmetic is in ./engine.ts.
 */
import { Prisma, PrismaClient, StopType } from '@prisma/client';

import { prisma as defaultPrisma } from '../../db';
import { calculateBackendTripFinancials } from '../../utils/tripFinancials';
import { localDay } from '../vehicleFinancials/engine';
import { resolveRange, tripDateWhere } from '../vehicleFinancials/loader';
import { groupTrips, sortRows, totals, tripMargin, marginPct, type GroupBy, type ProfitTrip, type SortKey } from './engine';

type Db = PrismaClient | Prisma.TransactionClient;

const EARNED_STATUSES = ['Completed', 'Invoiced'] as const;
const LIMIT = 5000;

export interface ProfitabilityQuery {
  from?: string;
  to?: string;
  group?: string;
  customer_id?: string;
  vehicle_id?: string;
  /** loss: margin below zero · unpriced: no billing. */
  only?: string;
  search?: string;
  sort?: string;
  dir?: string;
  page?: string;
  per_page?: string;
}

const tripInclude = {
  customer: { select: { name: true } },
  vehicle: { select: { plate_number: true } },
  driver: { select: { first_name: true, last_name: true } },
  quotation: { select: { rate: true, driver_payout: true, pricing_basis: true } },
  charges: { select: { amount: true } },
  subcontract: { select: { cost: true } },
  stops: {
    select: { stop_type: true, stop_sequence: true, location_name: true, location: { select: { name: true } } },
    orderBy: { stop_sequence: 'asc' },
  },
} satisfies Prisma.TripInclude;

type TripRow = Prisma.TripGetPayload<{ include: typeof tripInclude }>;

/** "Riyadh → Dammam": the lane endpoints of the first pickup and the last drop. */
export function laneOf(stops: TripRow['stops']): string {
  const name = (s: TripRow['stops'][number]) => s.location?.name || s.location_name || '?';
  const pickup = stops.find((s) => s.stop_type === StopType.Pickup);
  const drop = [...stops].reverse().find((s) => s.stop_type === StopType.Dropoff);
  return pickup && drop ? `${name(pickup)} → ${name(drop)}` : 'Unknown route';
}

export async function loadTripProfitability(q: ProfitabilityQuery, db: Db = defaultPrisma) {
  const range = await resolveRange(db, { from: q.from, to: q.to });
  const where: Prisma.TripWhereInput = {
    deletedAt: null,
    status: { in: [...EARNED_STATUSES] },
    ...(q.customer_id ? { customerId: q.customer_id } : {}),
    ...(q.vehicle_id ? { vehicleId: q.vehicle_id } : {}),
    ...tripDateWhere(range),
  };
  const rows: TripRow[] = await db.trip.findMany({ where, include: tripInclude, orderBy: { createdAt: 'desc' }, take: LIMIT });
  const ids = rows.map((t) => t.id);
  const expenseSums = ids.length
    ? await db.expense.groupBy({ by: ['tripId'], where: { tripId: { in: ids }, deletedAt: null }, _sum: { amount: true, vat_amount: true } })
    : [];
  // Cost is net of reclaimable VAT
  const expenseByTrip = new Map(expenseSums.map((e) => [e.tripId as string, Number(e._sum.amount ?? 0) - Number(e._sum.vat_amount ?? 0)]));

  const trips: ProfitTrip[] = rows.map((t) => {
    // Same calculation as the Trip Details page
    const fin = calculateBackendTripFinancials(t as any);
    const when = t.actual_end || t.actual_start || t.createdAt;
    return {
      id: t.id,
      refId: t.ref_id,
      day: localDay(when, range.tz),
      customerId: t.customerId,
      customer: t.customer?.name || '—',
      lane: laneOf(t.stops),
      vehicleId: t.vehicleId,
      vehicle: t.vehicle?.plate_number ?? null,
      driver: t.driver ? `${t.driver.first_name} ${t.driver.last_name}`.trim() : null,
      thirdParty: t.is_third_party,
      status: t.status,
      revenue: fin.totalCustomerBilling,
      // A third-party trip's cost is the subcontractor, not driver pay
      driverPay: t.is_third_party ? 0 : fin.totalDriverPayout,
      subcontract: t.is_third_party ? fin.totalDriverPayout : 0,
      expenses: expenseByTrip.get(t.id) ?? 0,
    };
  });

  const search = (q.search || '').trim().toLowerCase();
  const scoped = trips.filter((t) => {
    if (q.only === 'loss' && !(t.revenue > 0.005 && tripMargin(t) < -0.005)) return false;
    if (q.only === 'unpriced' && t.revenue > 0.005) return false;
    if (search && ![t.refId, t.customer, t.lane, t.vehicle, t.driver].filter(Boolean).join(' ').toLowerCase().includes(search)) return false;
    return true;
  });

  const group: GroupBy = ['customer', 'lane', 'vehicle'].includes(q.group || '') ? (q.group as GroupBy) : 'trip';
  const sort: SortKey = ['margin', 'revenue', 'date'].includes(q.sort || '') ? (q.sort as SortKey) : 'margin_pct';
  const desc = q.dir === 'desc';
  const page = Math.max(1, parseInt(q.page || '1', 10) || 1);
  const perPage = Math.min(200, Math.max(1, parseInt(q.per_page || '50', 10) || 50));

  const list =
    group === 'trip'
      ? sortRows(
          scoped.map((t) => {
            const margin = tripMargin(t);
            return { ...t, cost: Math.round((t.driverPay + t.subcontract + t.expenses) * 100) / 100, margin, marginPct: marginPct(margin, t.revenue) };
          }),
          sort,
          desc,
        )
      : sortRows(groupTrips(scoped, group), sort === 'date' ? 'margin_pct' : sort, desc);

  return {
    range: { from: range.from ?? null, to: range.to ?? null },
    group,
    // The whole period (all trips), and what the filters leave
    summary: totals(trips),
    filtered: totals(scoped),
    rows: list.slice((page - 1) * perPage, page * perPage),
    meta: { total: list.length, page, per_page: perPage, truncated: rows.length === LIMIT },
  };
}

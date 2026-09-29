/**
 * Driver payouts by month: the trip pay each driver earned in a month (trips finished that month,
 * own fleet) and how much of it is marked paid (in a paid driver settlement). Months are
 * company-local calendar months, the same dating as Vehicle P&L and Trip profitability.
 */
import { Prisma, PrismaClient, StopType } from '@prisma/client';
import { prisma as defaultPrisma } from '../db';
import { localDateToUtc } from '../controllers/financeReportsController';
import { tripPayShares } from '../utils/tripFinancials';
import { localDay } from './vehicleFinancials/engine';

type Db = PrismaClient | Prisma.TransactionClient;
const r2 = (n: number) => Math.round(n * 100) / 100;
const EARNED = ['Completed', 'Invoiced'] as const;

/** One driver's pay on one trip. */
export interface PayoutItem {
  month: string;
  driverId: string;
  tripId: string;
  tripRef: string | null;
  day: string;
  customer: string;
  lane: string;
  role: 'driver' | 'co_driver';
  amount: number;
  /** The paid settlement that covers it, if any. */
  settlement: { id: string; ref: string | null; paidDate: string } | null;
}

export interface MonthTotal {
  month: string;
  earned: number;
  paid: number;
  owed: number;
  trips: number;
  drivers: number;
}

export interface DriverMonth {
  driverId: string;
  month: string;
  trips: number;
  earned: number;
  paid: number;
  owed: number;
}

/** Totals per month (every month in range, even empty) and per driver per month. Pure. */
export function summarisePayouts(items: PayoutItem[], months: string[]): { months: MonthTotal[]; drivers: DriverMonth[] } {
  const byDriver = new Map<string, DriverMonth>();
  const byMonth = new Map<string, MonthTotal & { driverSet: Set<string> }>(months.map((m) => [m, { month: m, earned: 0, paid: 0, owed: 0, trips: 0, drivers: 0, driverSet: new Set() }]));
  for (const it of items) {
    const m = byMonth.get(it.month);
    if (!m) continue;
    const paid = it.settlement ? it.amount : 0;
    m.earned = r2(m.earned + it.amount);
    m.paid = r2(m.paid + paid);
    m.trips += 1;
    m.driverSet.add(it.driverId);
    const key = `${it.driverId}|${it.month}`;
    const d = byDriver.get(key) ?? { driverId: it.driverId, month: it.month, trips: 0, earned: 0, paid: 0, owed: 0 };
    d.trips += 1;
    d.earned = r2(d.earned + it.amount);
    d.paid = r2(d.paid + paid);
    d.owed = r2(d.earned - d.paid);
    byDriver.set(key, d);
  }
  return {
    months: [...byMonth.values()].map(({ driverSet, ...m }) => ({ ...m, owed: r2(m.earned - m.paid), drivers: driverSet.size })),
    drivers: [...byDriver.values()].sort((a, b) => b.owed - a.owed || b.earned - a.earned),
  };
}

/** "2026-07" … "2026-09": every month from `from` to `to`, inclusive. */
export function monthRange(from: string, to: string): string[] {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  const out: string[] = [];
  for (let y = fy, m = fm; y < ty || (y === ty && m <= tm); m === 12 ? (y++, (m = 1)) : m++) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    if (out.length > 36) break;
  }
  return out;
}

const lastDay = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
};

/** Every driver's trip pay for trips finished between the first and last month, with its paid status. */
export async function loadPayoutItems(fromMonth: string, toMonth: string, opts: { driverId?: string } = {}, db: Db = defaultPrisma): Promise<PayoutItem[]> {
  const s = await db.settings.findUnique({ where: { id: 'singleton' }, select: { timezone: true } }).catch(() => null);
  const tz = s?.timezone || 'Asia/Riyadh';
  const f = { gte: localDateToUtc(`${fromMonth}-01`, tz, false), lte: localDateToUtc(lastDay(toMonth), tz, true) };
  const trips = await db.trip.findMany({
    where: {
      deletedAt: null,
      is_third_party: false,
      status: { in: [...EARNED] },
      AND: [
        opts.driverId ? { OR: [{ driverId: opts.driverId }, { co_driver_id: opts.driverId }] } : { OR: [{ driverId: { not: null } }, { co_driver_id: { not: null } }] },
        { OR: [{ actual_end: f }, { actual_end: null, actual_start: f }, { actual_end: null, actual_start: null, createdAt: f }] },
      ],
    },
    include: {
      customer: { select: { name: true } },
      quotation: { select: { rate: true, driver_payout: true, pricing_basis: true } },
      charges: { select: { amount: true } },
      stops: { select: { stop_type: true, stop_sequence: true, location_name: true, location: { select: { name: true } } }, orderBy: { stop_sequence: 'asc' } },
      settlementLines: { select: { role: true, settlement: { select: { id: true, ref_id: true, paid_date: true, status: true } } } },
    },
    take: 20000,
  });

  const items: PayoutItem[] = [];
  for (const t of trips) {
    const shares = tripPayShares(t as any);
    const when = t.actual_end || t.actual_start || t.createdAt;
    const day = localDay(when, tz);
    const name = (x: (typeof t.stops)[number]) => x.location?.name || x.location_name || '?';
    const pickup = t.stops.find((x) => x.stop_type === StopType.Pickup);
    const drop = [...t.stops].reverse().find((x) => x.stop_type === StopType.Dropoff);
    const base = { month: day.slice(0, 7), tripId: t.id, tripRef: t.ref_id, day, customer: t.customer?.name ?? '—', lane: pickup && drop ? `${name(pickup)} → ${name(drop)}` : 'Unknown route' };
    const paidFor = (role: string) => {
      const line = t.settlementLines.find((l) => l.role === role && l.settlement.status === 'Paid');
      return line ? { id: line.settlement.id, ref: line.settlement.ref_id, paidDate: localDay(line.settlement.paid_date, tz) } : null;
    };
    if (t.driverId && shares.driver > 0.005 && (!opts.driverId || t.driverId === opts.driverId)) {
      items.push({ ...base, driverId: t.driverId, role: 'driver', amount: shares.driver, settlement: paidFor('driver') });
    }
    if (t.co_driver_id && shares.coDriver > 0.005 && (!opts.driverId || t.co_driver_id === opts.driverId)) {
      items.push({ ...base, driverId: t.co_driver_id, role: 'co_driver', amount: shares.coDriver, settlement: paidFor('co_driver') });
    }
  }
  return items.sort((a, b) => a.day.localeCompare(b.day));
}

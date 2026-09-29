/**
 * Maintenance — what the hub page reads: trucks in the workshop now, what's scheduled, what's
 * due by the service plans, and the month's cost and downtime. Arithmetic is in ./engine.ts.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../db';
import { localDateToUtc } from '../../controllers/financeReportsController';
import { localDay } from '../vehicleFinancials/engine';
import { ACTIVE_MAINTENANCE_STATUSES, SCHEDULED_STATUS } from '../../utils/vehicleMaintenanceStatus';
import { daysOut, dueFor, overlapDays, plansFor, type DueStatus } from './engine';

type Db = PrismaClient | Prisma.TransactionClient;
const r2 = (n: number) => Math.round(n * 100) / 100;
/** Orders that don't cost or take a truck off the road. */
const NOT_INCURRED = [SCHEDULED_STATUS, 'Cancelled'];
/** Over this many days in the workshop a truck is flagged. */
export const LONG_STAY_DAYS = 5;

async function tzOf(db: Db) {
  const s = await db.settings.findUnique({ where: { id: 'singleton' }, select: { timezone: true } }).catch(() => null);
  return s?.timezone || 'Asia/Riyadh';
}

const monthBounds = (month: string, tz: string) => {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: localDateToUtc(`${month}-01`, tz, false), to: localDateToUtc(`${month}-${String(last).padStart(2, '0')}`, tz, true) };
};
const shiftMonth = (month: string, n: number) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

export interface DueRow {
  vehicleId: string;
  plate: string;
  asset_type: string;
  odometer: number;
  odometer_updated_at: Date | null;
  planId: string;
  task: string;
  interval_km: number | null;
  interval_days: number | null;
  scope: 'truck' | 'type' | 'all';
  last: { date: Date; km: number; recordId: string; ref: string | null } | null;
  status: DueStatus;
  dueKm: number | null;
  dueDate: Date | null;
  remainingKm: number | null;
  remainingDays: number | null;
}

const ORDER_OF: Record<DueStatus, number> = { overdue: 0, due_soon: 1, never: 2, booked: 3, ok: 4 };

/** Every planned service on every live truck, most urgent first. */
export async function loadDue(db: Db = defaultPrisma, opts: { vehicleId?: string } = {}): Promise<DueRow[]> {
  const [vehicles, plans] = await Promise.all([
    db.vehicle.findMany({
      where: { deletedAt: null, status: { not: 'Inactive' }, ...(opts.vehicleId ? { id: opts.vehicleId } : {}) },
      select: { id: true, plate_number: true, asset_type: true, current_odometer: true, odometer_updated_at: true },
    }),
    db.servicePlan.findMany({ where: { isActive: true } }),
  ]);
  if (!plans.length || !vehicles.length) return [];
  const taskOfPlan = new Map(plans.map((p) => [p.id, p.task.trim().toLowerCase()]));
  // Orders that include a planned task: completed ones set "last done", open / scheduled ones book it
  const items = await db.maintenanceItem.findMany({
    where: { servicePlanId: { not: null }, record: { deletedAt: null, vehicleId: { in: vehicles.map((v) => v.id) }, status: { not: 'Cancelled' } } },
    select: { servicePlanId: true, record: { select: { id: true, ref_id: true, vehicleId: true, status: true, end_date: true, service_date: true, start_date: true, odometer_reading: true } } },
  });
  const last = new Map<string, DueRow['last']>();
  const booked = new Set<string>();
  for (const it of items) {
    const task = taskOfPlan.get(it.servicePlanId as string);
    if (!task) continue;
    const key = `${it.record.vehicleId}|${task}`;
    if (it.record.status === 'Completed') {
      const date = it.record.end_date ?? it.record.service_date ?? it.record.start_date;
      const cur = last.get(key);
      if (!cur || date > cur.date) last.set(key, { date, km: it.record.odometer_reading, recordId: it.record.id, ref: it.record.ref_id });
    } else {
      booked.add(key);
    }
  }

  const today = new Date();
  const rows: DueRow[] = [];
  for (const v of vehicles) {
    for (const p of plansFor(plans, { id: v.id, asset_type: v.asset_type })) {
      const key = `${v.id}|${p.task.trim().toLowerCase()}`;
      const l = last.get(key) ?? null;
      const due = dueFor(p, l ? { date: l.date, km: l.km } : null, v.current_odometer, today, booked.has(key));
      rows.push({
        vehicleId: v.id,
        plate: v.plate_number,
        asset_type: v.asset_type,
        odometer: v.current_odometer,
        odometer_updated_at: v.odometer_updated_at,
        planId: p.id,
        task: p.task,
        interval_km: p.interval_km,
        interval_days: p.interval_days,
        scope: p.vehicleId ? 'truck' : p.asset_type ? 'type' : 'all',
        last: l,
        ...due,
      });
    }
  }
  return rows.sort((a, b) => ORDER_OF[a.status] - ORDER_OF[b.status] || (a.remainingDays ?? 1e9) - (b.remainingDays ?? 1e9) || a.plate.localeCompare(b.plate));
}

/** The four figures on top of the hub page. */
export async function loadOverview(db: Db = defaultPrisma) {
  const tz = await tzOf(db);
  const now = new Date();
  const month = localDay(now, tz).slice(0, 7);
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(month, i - 5));
  const earliest = monthBounds(months[0], tz).from;
  const in14 = new Date(now.getTime() + 14 * 86_400_000);

  const [open, scheduled, costRows, due] = await Promise.all([
    db.maintenanceRecord.findMany({
      where: { deletedAt: null, status: { in: ACTIVE_MAINTENANCE_STATUSES } },
      select: { id: true, ref_id: true, start_date: true, expected_end_date: true, vehicle: { select: { plate_number: true } } },
      orderBy: { start_date: 'asc' },
    }),
    db.maintenanceRecord.findMany({
      where: { deletedAt: null, status: SCHEDULED_STATUS, start_date: { lte: in14 } },
      select: { id: true, ref_id: true, start_date: true, vehicle: { select: { plate_number: true } } },
      orderBy: { start_date: 'asc' },
    }),
    db.maintenanceRecord.findMany({
      where: { deletedAt: null, status: { notIn: NOT_INCURRED }, OR: [{ start_date: { gte: earliest } }, { end_date: null }, { end_date: { gte: earliest } }] },
      select: { start_date: true, end_date: true, cost: true, vat_amount: true },
    }),
    loadDue(db),
  ]);

  const openDays = open.map((o) => daysOut(o.start_date, null, now));
  const cost = months.map((m) => {
    const b = monthBounds(m, tz);
    return r2(costRows.filter((r) => r.start_date >= b.from && r.start_date <= b.to).reduce((t, r) => t + Number(r.cost) - Number(r.vat_amount), 0));
  });
  const thisMonth = monthBounds(month, tz);
  const downtime = costRows.reduce((t, r) => t + overlapDays(r.start_date, r.end_date, thisMonth.from, thisMonth.to, now), 0);

  // Scheduled per day for the next 7 days (0 = today)
  const todayKey = localDay(now, tz);
  const week = Array.from({ length: 7 }, (_, i) => localDay(new Date(now.getTime() + i * 86_400_000), tz));
  const perDay = week.map((day) => scheduled.filter((s) => localDay(s.start_date, tz) === day).length);
  const next = scheduled.find((s) => localDay(s.start_date, tz) >= todayKey) ?? scheduled[0] ?? null;

  return {
    in_workshop: {
      count: open.length,
      long: openDays.filter((d) => d > LONG_STAY_DAYS).length,
      longest: open.length ? { plate: open[0].vehicle.plate_number, days: Math.max(...openDays) } : null,
      overdue_return: open.filter((o) => o.expected_end_date && o.expected_end_date < now).length,
    },
    due: {
      overdue: due.filter((d) => d.status === 'overdue').length,
      due_soon: due.filter((d) => d.status === 'due_soon').length,
      never: due.filter((d) => d.status === 'never').length,
      plans: due.length,
    },
    scheduled: {
      count: scheduled.length,
      week: perDay,
      next: next ? { plate: next.vehicle.plate_number, date: next.start_date, ref: next.ref_id } : null,
    },
    cost: {
      month,
      this_month: cost[cost.length - 1],
      last_month: cost[cost.length - 2],
      trend: months.map((m, i) => ({ month: m, amount: cost[i] })),
      downtime_days: downtime,
    },
  };
}

/**
 * Vehicle P&L — the fleet and single-truck reports, plus the cost inputs they
 * need that live nowhere else: a truck's recurring fixed costs and a driver's
 * monthly salary history. The numbers themselves come from
 * services/vehicleFinancials (engine.ts has the definitions).
 */
import { Request, Response } from 'express';

import { prisma } from '../db';
import { logger } from '../utils/logger';
import { localDateToUtc } from './financeReportsController';
import { buildFleetFinancials, buildVehicleFinancials, type FinancialsQuery } from '../services/vehicleFinancials/loader';
import { dayNumber, dayString, localDay } from '../services/vehicleFinancials/engine';

const FALLBACK_TZ = 'Asia/Riyadh';

async function companyTz(): Promise<string> {
  try {
    const s = await prisma.settings.findUnique({ where: { id: 'singleton' }, select: { timezone: true } });
    return s?.timezone || FALLBACK_TZ;
  } catch {
    return FALLBACK_TZ;
  }
}

/** "YYYY-MM-DD" → the instant that company-local day starts. */
export async function dayToInstant(day: string, tz?: string): Promise<Date> {
  return localDateToUtc(day, tz ?? (await companyTz()), false);
}

const rangeQuery = (req: Request): FinancialsQuery => ({
  from: typeof req.query.from === 'string' ? req.query.from : undefined,
  to: typeof req.query.to === 'string' ? req.query.to : undefined,
});

const serverError = (res: Response, err: unknown, message: string) => {
  logger.error({ err }, message);
  res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message } });
};
const notFound = (res: Response, what: string) => res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `${what} not found` } });

/* ── Reports ──────────────────────────────────────────────────────────── */

export const getFleetFinancials = async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await buildFleetFinancials(rangeQuery(req)) });
  } catch (err) {
    serverError(res, err, 'Failed to fetch fleet financial report');
  }
};

export const getVehicleFinancials = async (req: Request, res: Response) => {
  try {
    const data = await buildVehicleFinancials(req.params.id as string, rangeQuery(req));
    if (!data) return notFound(res, 'Vehicle');
    res.json({ success: true, data });
  } catch (err) {
    serverError(res, err, 'Failed to fetch vehicle financial report');
  }
};

/* ── Cost setup overview ──────────────────────────────────────────────── */

/**
 * Everything the Cost setup page lists in one call: every truck's ownership
 * figures and recurring costs, and every driver's current salary package.
 */
export const getCostSetup = async (_req: Request, res: Response) => {
  try {
    const tz = await companyTz();
    const today = localDay(new Date(), tz);
    const [vehicles, drivers] = await Promise.all([
      prisma.vehicle.findMany({
        where: { deletedAt: null },
        orderBy: { plate_number: 'asc' },
        select: {
          id: true, plate_number: true, ref_id: true, asset_type: true, status: true,
          purchase_price: true, purchase_date: true, useful_life_years: true, residual_value: true,
          fixedCosts: { where: { deletedAt: null }, orderBy: { start_date: 'asc' } },
          assignedDriver: { select: { id: true, first_name: true, last_name: true } },
        },
      }),
      prisma.driver.findMany({
        where: { deletedAt: null },
        orderBy: [{ first_name: 'asc' }, { last_name: 'asc' }],
        select: {
          id: true, ref_id: true, first_name: true, last_name: true, status: true,
          assignedVehicle: { select: { id: true, plate_number: true } },
          salaries: { where: { deletedAt: null }, orderBy: { effective_from: 'desc' } },
        },
      }),
    ]);

    const activeOn = (from: Date, to: Date | null) => localDay(from, tz) <= today && (!to || localDay(to, tz) >= today);

    res.json({
      success: true,
      data: {
        today,
        vehicles: vehicles.map((v) => {
          const active = v.fixedCosts.filter((c) => activeOn(c.start_date, c.end_date));
          return {
            id: v.id,
            plate_number: v.plate_number,
            ref_id: v.ref_id,
            asset_type: v.asset_type,
            status: v.status,
            driver: v.assignedDriver ? { id: v.assignedDriver.id, name: `${v.assignedDriver.first_name} ${v.assignedDriver.last_name}`.trim() } : null,
            purchase_price: v.purchase_price == null ? null : Number(v.purchase_price),
            purchase_date: v.purchase_date ? localDay(v.purchase_date, tz) : null,
            useful_life_years: v.useful_life_years,
            residual_value: v.residual_value == null ? null : Number(v.residual_value),
            fixed_costs: v.fixedCosts.map((c) => ({
              id: c.id, category: c.category, label: c.label, amount: Number(c.amount), frequency: c.frequency,
              start_date: localDay(c.start_date, tz), end_date: c.end_date ? localDay(c.end_date, tz) : null, notes: c.notes,
              active: activeOn(c.start_date, c.end_date),
            })),
            fixed_monthly: Math.round(active.reduce((s, c) => s + (c.frequency === 'Yearly' ? Number(c.amount) / 12 : Number(c.amount)), 0) * 100) / 100,
          };
        }),
        drivers: drivers.map((d) => {
          const current = d.salaries.find((s) => activeOn(s.effective_from, s.effective_to)) ?? null;
          return {
            id: d.id,
            ref_id: d.ref_id,
            name: `${d.first_name} ${d.last_name}`.trim(),
            status: d.status,
            vehicle: d.assignedVehicle,
            current: current ? serializeSalary(current, tz) : null,
            history: d.salaries.map((s) => serializeSalary(s, tz)),
          };
        }),
      },
    });
  } catch (err) {
    serverError(res, err, 'Failed to load cost setup');
  }
};

type SalaryRow = { id: string; base_salary: unknown; allowances: unknown; employer_costs: unknown; effective_from: Date; effective_to: Date | null; notes: string | null };
function serializeSalary(s: SalaryRow, tz: string) {
  const base = Number(s.base_salary);
  const allowances = Number(s.allowances);
  const employer = Number(s.employer_costs);
  return {
    id: s.id,
    base_salary: base,
    allowances,
    employer_costs: employer,
    monthly_total: Math.round((base + allowances + employer) * 100) / 100,
    effective_from: localDay(s.effective_from, tz),
    effective_to: s.effective_to ? localDay(s.effective_to, tz) : null,
    notes: s.notes,
  };
}

/* ── Vehicle fixed costs ──────────────────────────────────────────────── */

export const createVehicleFixedCost = async (req: Request, res: Response) => {
  try {
    const vehicle = await prisma.vehicle.findFirst({ where: { id: req.params.id as string, deletedAt: null }, select: { id: true } });
    if (!vehicle) return notFound(res, 'Vehicle');
    const tz = await companyTz();
    const b = req.body;
    const created = await prisma.vehicleFixedCost.create({
      data: {
        vehicleId: vehicle.id,
        category: b.category,
        label: b.label || null,
        amount: b.amount,
        frequency: b.frequency,
        start_date: await dayToInstant(b.start_date, tz),
        end_date: b.end_date ? await dayToInstant(b.end_date, tz) : null,
        notes: b.notes || null,
        created_by: (req as any).user?.id,
      },
    });
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    serverError(res, err, 'Failed to add the fixed cost');
  }
};

export const updateVehicleFixedCost = async (req: Request, res: Response) => {
  try {
    const existing = await prisma.vehicleFixedCost.findFirst({ where: { id: req.params.itemId as string, vehicleId: req.params.id as string, deletedAt: null } });
    if (!existing) return notFound(res, 'Fixed cost');
    const tz = await companyTz();
    const b = req.body;
    const start = b.start_date ?? localDay(existing.start_date, tz);
    const end = b.end_date === undefined ? (existing.end_date ? localDay(existing.end_date, tz) : null) : b.end_date;
    if (end && end < start) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'End date is before the start date' } });
    }
    const updated = await prisma.vehicleFixedCost.update({
      where: { id: existing.id },
      data: {
        ...(b.category !== undefined ? { category: b.category } : {}),
        ...(b.label !== undefined ? { label: b.label || null } : {}),
        ...(b.amount !== undefined ? { amount: b.amount } : {}),
        ...(b.frequency !== undefined ? { frequency: b.frequency } : {}),
        ...(b.notes !== undefined ? { notes: b.notes || null } : {}),
        start_date: await dayToInstant(start, tz),
        end_date: end ? await dayToInstant(end, tz) : null,
        updated_by: (req as any).user?.id,
      },
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    serverError(res, err, 'Failed to update the fixed cost');
  }
};

export const deleteVehicleFixedCost = async (req: Request, res: Response) => {
  try {
    const existing = await prisma.vehicleFixedCost.findFirst({ where: { id: req.params.itemId as string, vehicleId: req.params.id as string, deletedAt: null } });
    if (!existing) return notFound(res, 'Fixed cost');
    await prisma.vehicleFixedCost.update({ where: { id: existing.id }, data: { deletedAt: new Date(), updated_by: (req as any).user?.id } });
    res.json({ success: true, data: { id: existing.id } });
  } catch (err) {
    serverError(res, err, 'Failed to remove the fixed cost');
  }
};

/* ── Driver salaries ──────────────────────────────────────────────────── */

export const getDriverSalaries = async (req: Request, res: Response) => {
  try {
    const tz = await companyTz();
    const rows = await prisma.driverSalary.findMany({ where: { driverId: req.params.id as string, deletedAt: null }, orderBy: { effective_from: 'desc' } });
    res.json({ success: true, data: rows.map((r) => serializeSalary(r, tz)) });
  } catch (err) {
    serverError(res, err, 'Failed to load salary history');
  }
};

/**
 * Adds a pay package. A package still open when the new one starts is closed
 * the day before, so a raise is one action and history stays continuous.
 */
export const createDriverSalary = async (req: Request, res: Response) => {
  try {
    const driver = await prisma.driver.findFirst({ where: { id: req.params.id as string, deletedAt: null }, select: { id: true } });
    if (!driver) return notFound(res, 'Driver');
    const tz = await companyTz();
    const b = req.body;
    const from = await dayToInstant(b.effective_from, tz);

    const clash = await prisma.driverSalary.findFirst({ where: { driverId: driver.id, deletedAt: null, effective_from: from } });
    if (clash) {
      return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'A salary already starts on that date — edit it instead.' } });
    }

    const created = await prisma.$transaction(async (tx) => {
      const open = await tx.driverSalary.findMany({
        where: { driverId: driver.id, deletedAt: null, effective_from: { lt: from }, OR: [{ effective_to: null }, { effective_to: { gte: from } }] },
      });
      const dayBefore = await dayToInstant(dayString(dayNumber(b.effective_from) - 1), tz);
      for (const o of open) await tx.driverSalary.update({ where: { id: o.id }, data: { effective_to: dayBefore, updated_by: (req as any).user?.id } });
      return tx.driverSalary.create({
        data: {
          driverId: driver.id,
          base_salary: b.base_salary,
          allowances: b.allowances ?? 0,
          employer_costs: b.employer_costs ?? 0,
          effective_from: from,
          effective_to: b.effective_to ? await dayToInstant(b.effective_to, tz) : null,
          notes: b.notes || null,
          created_by: (req as any).user?.id,
        },
      });
    });
    res.status(201).json({ success: true, data: serializeSalary(created, tz) });
  } catch (err) {
    serverError(res, err, 'Failed to add the salary');
  }
};

export const updateDriverSalary = async (req: Request, res: Response) => {
  try {
    const existing = await prisma.driverSalary.findFirst({ where: { id: req.params.itemId as string, driverId: req.params.id as string, deletedAt: null } });
    if (!existing) return notFound(res, 'Salary');
    const tz = await companyTz();
    const b = req.body;
    const from = b.effective_from ?? localDay(existing.effective_from, tz);
    const to = b.effective_to === undefined ? (existing.effective_to ? localDay(existing.effective_to, tz) : null) : b.effective_to;
    if (to && to < from) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'End date is before the start date' } });
    }
    const updated = await prisma.driverSalary.update({
      where: { id: existing.id },
      data: {
        ...(b.base_salary !== undefined ? { base_salary: b.base_salary } : {}),
        ...(b.allowances !== undefined ? { allowances: b.allowances } : {}),
        ...(b.employer_costs !== undefined ? { employer_costs: b.employer_costs } : {}),
        ...(b.notes !== undefined ? { notes: b.notes || null } : {}),
        effective_from: await dayToInstant(from, tz),
        effective_to: to ? await dayToInstant(to, tz) : null,
        updated_by: (req as any).user?.id,
      },
    });
    res.json({ success: true, data: serializeSalary(updated, tz) });
  } catch (err) {
    serverError(res, err, 'Failed to update the salary');
  }
};

export const deleteDriverSalary = async (req: Request, res: Response) => {
  try {
    const existing = await prisma.driverSalary.findFirst({ where: { id: req.params.itemId as string, driverId: req.params.id as string, deletedAt: null } });
    if (!existing) return notFound(res, 'Salary');
    await prisma.driverSalary.update({ where: { id: existing.id }, data: { deletedAt: new Date(), updated_by: (req as any).user?.id } });
    res.json({ success: true, data: { id: existing.id } });
  } catch (err) {
    serverError(res, err, 'Failed to remove the salary');
  }
};

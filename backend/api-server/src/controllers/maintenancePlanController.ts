import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { logger } from '../utils/logger';
import { loadDue, loadOverview } from '../services/maintenance/loader';

const fail = (res: Response, error: any, what: string) => {
  logger.error({ err: error }, `Failed to ${what}`);
  res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error?.message ?? 'Server error' } });
};

/** GET /maintenance/overview — the hub's four figures. */
export const getMaintenanceOverview = async (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await loadOverview() });
  } catch (error) {
    fail(res, error, 'load the maintenance overview');
  }
};

/** GET /maintenance/due?vehicle_id= — every planned service per truck, most urgent first. */
export const getMaintenanceDue = async (req: Request, res: Response) => {
  try {
    const vehicleId = typeof req.query.vehicle_id === 'string' && req.query.vehicle_id ? req.query.vehicle_id : undefined;
    res.json({ success: true, data: await loadDue(undefined, { vehicleId }) });
  } catch (error) {
    fail(res, error, 'load due services');
  }
};

const planSchema = z
  .object({
    task: z.string().trim().min(1, 'Name the service').max(120),
    asset_type: z.enum(['Flatbed', 'Reefer', 'Box', 'Tanker']).nullable().optional(),
    vehicle_id: z.string().uuid().nullable().optional(),
    interval_km: z.number().int().positive().nullable().optional(),
    interval_days: z.number().int().positive().nullable().optional(),
    warn_km: z.number().int().min(0).optional(),
    warn_days: z.number().int().min(0).optional(),
    notes: z.string().max(500).nullable().optional(),
    is_active: z.boolean().optional(),
  })
  .refine((p) => p.interval_km || p.interval_days, { message: 'Give an interval in km, in days, or both' })
  .refine((p) => !(p.vehicle_id && p.asset_type), { message: 'A plan is for one truck or a truck type, not both' });

const planOut = (p: any) => ({
  id: p.id,
  task: p.task,
  asset_type: p.asset_type,
  vehicle_id: p.vehicleId,
  vehicle_plate: p.vehicle?.plate_number ?? null,
  interval_km: p.interval_km,
  interval_days: p.interval_days,
  warn_km: p.warn_km,
  warn_days: p.warn_days,
  notes: p.notes,
  is_active: p.isActive,
  scope: p.vehicleId ? 'truck' : p.asset_type ? 'type' : 'all',
});

/** GET /maintenance/plans */
export const listServicePlans = async (_req: Request, res: Response) => {
  try {
    const rows = await prisma.servicePlan.findMany({
      include: { vehicle: { select: { plate_number: true } } },
      orderBy: [{ isActive: 'desc' }, { task: 'asc' }],
    });
    res.json({ success: true, data: rows.map(planOut) });
  } catch (error) {
    fail(res, error, 'list service plans');
  }
};

/** POST /maintenance/plans */
export const createServicePlan = async (req: Request, res: Response) => {
  try {
    const parsed = planSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
    const b = parsed.data;
    const row = await prisma.servicePlan.create({
      data: {
        task: b.task,
        asset_type: b.asset_type ?? null,
        vehicleId: b.vehicle_id ?? null,
        interval_km: b.interval_km ?? null,
        interval_days: b.interval_days ?? null,
        warn_km: b.warn_km ?? 1000,
        warn_days: b.warn_days ?? 14,
        notes: b.notes ?? null,
        isActive: b.is_active ?? true,
        created_by: (req as any).user?.id ?? null,
      },
      include: { vehicle: { select: { plate_number: true } } },
    });
    res.status(201).json({ success: true, data: planOut(row) });
  } catch (error) {
    fail(res, error, 'create the service plan');
  }
};

/** PUT /maintenance/plans/:planId */
export const updateServicePlan = async (req: Request, res: Response) => {
  try {
    const parsed = planSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
    const b = parsed.data;
    const row = await prisma.servicePlan.update({
      where: { id: String(req.params.planId) },
      data: {
        task: b.task,
        asset_type: b.asset_type ?? null,
        vehicleId: b.vehicle_id ?? null,
        interval_km: b.interval_km ?? null,
        interval_days: b.interval_days ?? null,
        ...(b.warn_km !== undefined ? { warn_km: b.warn_km } : {}),
        ...(b.warn_days !== undefined ? { warn_days: b.warn_days } : {}),
        notes: b.notes ?? null,
        ...(b.is_active !== undefined ? { isActive: b.is_active } : {}),
      },
      include: { vehicle: { select: { plate_number: true } } },
    });
    res.json({ success: true, data: planOut(row) });
  } catch (error: any) {
    if (error?.code === 'P2025') return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Service plan not found' } });
    fail(res, error, 'update the service plan');
  }
};

/** DELETE /maintenance/plans/:planId — past orders keep their lines; the link is cleared. */
export const deleteServicePlan = async (req: Request, res: Response) => {
  try {
    await prisma.servicePlan.delete({ where: { id: String(req.params.planId) } });
    res.json({ success: true });
  } catch (error: any) {
    if (error?.code === 'P2025') return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Service plan not found' } });
    fail(res, error, 'delete the service plan');
  }
};

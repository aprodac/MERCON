import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { logger } from '../utils/logger';
import { getValidUuid } from '../utils/uuid';
import { allQuotationTransits, clearPlannedTransit, quotationTransits } from '../services/transitQuotations';
import { PERIODS, loadSavedTransits, setPlannedTransit, transitRouteDetail, transitSummary } from '../services/transitTimes';

export const transitQuery = z.object({
  size: z.string().trim().max(20).optional(),
  days: z.coerce.number().int().refine((d) => (PERIODS as readonly number[]).includes(d), 'Use 7, 30 or 90 days').default(30),
});
export const transitRouteQuery = transitQuery.extend({ key: z.string().trim().min(3).max(300) });
export const transitPlannedBody = z.object({
  key: z.string().trim().min(3).max(300),
  planned_minutes: z.coerce.number().int().min(5).max(7 * 1440),
});

const fail = (res: Response, err: unknown, what: string) => {
  logger.error({ err }, what);
  res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: what } });
};

const sizeParam = (v?: string) => (v && v !== 'All' ? v : null);

/** GET /customers/:id/transit-times?size=&days= — every route with planned vs actual. */
export const getTransitSummary = async (req: Request, res: Response) => {
  try {
    const q = req.query as unknown as z.infer<typeof transitQuery>;
    res.json({ success: true, data: await transitSummary(String(req.params.id), { days: q.days, size: sizeParam(q.size) }) });
  } catch (err) { fail(res, err, 'Could not load transit times'); }
};

/** GET /customers/:id/transit-times/route?key=&days= — one route in detail. */
export const getTransitRoute = async (req: Request, res: Response) => {
  try {
    const q = req.query as unknown as z.infer<typeof transitRouteQuery>;
    const data = await transitRouteDetail(String(req.params.id), q.key, q.days);
    if (!data) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'No such route' } });
    res.json({ success: true, data });
  } catch (err) { fail(res, err, 'Could not load this route'); }
};

/** GET /customers/:id/transit-times/saved — the planned times Create trip uses for this customer. */
export const getSavedTransits = async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await loadSavedTransits(String(req.params.id)) });
  } catch (err) { fail(res, err, 'Could not load the planned times'); }
};

/** PUT /customers/:id/transit-times/planned — plan new trips of a route with this time (existing trips don't change). */
export const putPlannedTransit = async (req: Request, res: Response) => {
  try {
    const customer = await prisma.customer.findFirst({ where: { id: String(req.params.id), deletedAt: null }, select: { id: true } });
    if (!customer) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Customer not found' } });
    const data = await setPlannedTransit(prisma, { customerId: customer.id, key: req.body.key, plannedMin: req.body.planned_minutes, userId: getValidUuid((req as any).user?.id) });
    res.json({ success: true, data });
  } catch (err: any) {
    if (err?.message === 'INVALID_ROUTE_KEY' || err?.message === 'INVALID_MINUTES') {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: err.message === 'INVALID_MINUTES' ? 'Use between 5 minutes and 7 days' : 'Not a route key' } });
    }
    fail(res, err, 'Could not save the planned time');
  }
};

/** GET /customers/:id/transit-times/quotations — each quotation line's estimated, saved and actual transit time. */
export const getQuotationTransits = async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await quotationTransits(String(req.params.id)) });
  } catch (err) { fail(res, err, 'Could not load the quotations’ transit times'); }
};

export const transitKeyQuery = z.object({ key: z.string().trim().min(3).max(300) });

/** DELETE /customers/:id/transit-times/planned?key= — new trips go back to the estimate. */
export const deletePlannedTransit = async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await clearPlannedTransit(String(req.params.id), String(req.query.key)) });
  } catch (err: any) {
    if (err?.message === 'INVALID_ROUTE_KEY') return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Not a route key' } });
    fail(res, err, 'Could not clear the planned time');
  }
};

/** GET /customers/transit-overview — every customer's quotation routes with Given TT, actual and map points (Transit times page). */
export const getTransitOverview = async (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await allQuotationTransits() });
  } catch (err) { fail(res, err, 'Could not load the routes'); }
};

import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { AccountingError } from '../utils/accountingEngine';
import { payableTrips, settleDriver, unpaidByDriver, voidSettlement } from '../utils/driverSettlementEngine';
import { logAuditEvent } from '../services/auditService';
import { logger } from '../utils/logger';

const fail = (res: Response, error: any, what: string) => {
  if (error instanceof AccountingError) return res.status(error.statusCode).json({ success: false, error: { code: error.code, message: error.message } });
  logger.error({ err: error }, `Failed to ${what}`);
  return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
};

const driverName = (d: { first_name: string; last_name: string } | null) => (d ? `${d.first_name} ${d.last_name}`.trim() : '—');

/** Open employee advances paid to these drivers, by driver. */
async function openAdvances(driverIds: string[]) {
  if (!driverIds.length) return [];
  return prisma.advance.findMany({
    where: { party_type: 'Employee', direction: 'Paid', party_id: { in: driverIds }, status: { in: ['Open', 'PartiallyApplied'] } },
    select: { id: true, ref_id: true, party_id: true, amount: true, remaining_amount: true, advance_date: true, memo: true },
    orderBy: { advance_date: 'asc' },
  });
}

/** GET /driver-settlements/queue — drivers with unpaid trip pay, most owed first. */
export const getSettlementQueue = async (_req: Request, res: Response) => {
  try {
    const owed = await unpaidByDriver(prisma);
    const ids = [...owed.keys()];
    const [drivers, advances] = await Promise.all([
      prisma.driver.findMany({ where: { id: { in: ids } }, select: { id: true, ref_id: true, first_name: true, last_name: true } }),
      openAdvances(ids),
    ]);
    const rows = ids
      .map((id) => {
        const d = drivers.find((x) => x.id === id);
        const adv = advances.filter((a) => a.party_id === id).reduce((t, a) => t + Number(a.remaining_amount), 0);
        const o = owed.get(id)!;
        return { driver_id: id, driver_ref: d?.ref_id ?? null, driver_name: driverName(d ?? null), owed: o.amount, trips: o.trips, oldest: o.oldest, open_advances: Math.round(adv * 100) / 100 };
      })
      .sort((a, b) => b.owed - a.owed);
    res.json({ success: true, data: rows });
  } catch (error) {
    fail(res, error, 'load the settlement queue');
  }
};

/** GET /driver-settlements/payable?driver_id=&up_to= — the trips and advances a new settlement can use. */
export const getPayable = async (req: Request, res: Response) => {
  try {
    const driverId = String(req.query.driver_id || '');
    if (!driverId) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'driver_id is required' } });
    const upTo = req.query.up_to ? new Date(`${req.query.up_to}T23:59:59.999Z`) : undefined;
    const [trips, advances, settings] = await Promise.all([
      payableTrips(prisma, driverId, upTo),
      openAdvances([driverId]),
      prisma.settings.findUnique({ where: { id: 'singleton' }, select: { defaultDriverPayAccountId: true } }),
    ]);
    res.json({
      success: true,
      data: {
        trips,
        advances: advances.map((a) => ({ id: a.id, ref_id: a.ref_id, amount: Number(a.amount), remaining: Number(a.remaining_amount), date: a.advance_date, memo: a.memo })),
        driver_pay_account_id: settings?.defaultDriverPayAccountId ?? null,
      },
    });
  } catch (error) {
    fail(res, error, 'load payable trips');
  }
};

/** GET /driver-settlements — settlements, newest first. Filters: driver_id, status, date_from, date_to. */
export const listSettlements = async (req: Request, res: Response) => {
  try {
    const q = req.query as Record<string, string | undefined>;
    const paid: { gte?: Date; lte?: Date } = {};
    if (q.date_from) paid.gte = new Date(`${q.date_from}T00:00:00.000Z`);
    if (q.date_to) paid.lte = new Date(`${q.date_to}T23:59:59.999Z`);
    const rows = await prisma.driverSettlement.findMany({
      where: {
        ...(q.driver_id ? { driverId: q.driver_id } : {}),
        ...(q.status && q.status !== 'all' ? { status: q.status } : {}),
        ...(q.date_from || q.date_to ? { paid_date: paid } : {}),
      },
      include: { driver: { select: { first_name: true, last_name: true, ref_id: true } }, _count: { select: { lines: true } } },
      orderBy: [{ paid_date: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
    res.json({
      success: true,
      data: rows.map((s) => ({
        id: s.id,
        ref_id: s.ref_id,
        driver_id: s.driverId,
        driver_name: driverName(s.driver),
        status: s.status,
        paid_date: s.paid_date,
        gross: Number(s.gross_amount),
        deducted: Number(s.advance_deducted),
        net: Number(s.net_amount),
        trips: s._count.lines,
        reference: s.reference,
        journal_entry_id: s.journalEntryId,
      })),
    });
  } catch (error) {
    fail(res, error, 'list driver settlements');
  }
};

/** GET /driver-settlements/:id */
export const getSettlement = async (req: Request, res: Response) => {
  try {
    const s = await prisma.driverSettlement.findUnique({
      where: { id: String(req.params.id) },
      include: {
        driver: { select: { first_name: true, last_name: true, ref_id: true } },
        lines: { include: { trip: { select: { ref_id: true, actual_end: true, customer: { select: { name: true } } } } } },
        advanceApplications: { include: { advance: { select: { ref_id: true } } } },
      },
    });
    if (!s) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Settlement not found' } });
    const account = s.paymentAccountId ? await prisma.account.findUnique({ where: { id: s.paymentAccountId }, select: { account_code: true, name: true } }) : null;
    res.json({
      success: true,
      data: {
        id: s.id,
        ref_id: s.ref_id,
        driver_id: s.driverId,
        driver_name: driverName(s.driver),
        status: s.status,
        paid_date: s.paid_date,
        gross: Number(s.gross_amount),
        deducted: Number(s.advance_deducted),
        net: Number(s.net_amount),
        reference: s.reference,
        notes: s.notes,
        voided_at: s.voidedAt,
        journal_entry_id: s.journalEntryId,
        paid_from: account ? `${account.account_code} ${account.name}` : null,
        lines: s.lines.map((l) => ({ trip_id: l.tripId, trip_ref: l.trip.ref_id, customer: l.trip.customer?.name ?? '—', day: l.trip.actual_end, role: l.role, amount: Number(l.amount) })),
        advances: s.advanceApplications.map((a) => ({ advance_id: a.advanceId, ref_id: a.advance.ref_id, amount: Number(a.amount) })),
      },
    });
  } catch (error) {
    fail(res, error, 'load the settlement');
  }
};

const settleSchema = z.object({
  driver_id: z.string().uuid(),
  lines: z.array(z.object({ trip_id: z.string().uuid(), role: z.enum(['driver', 'co_driver']) })).min(1),
  advances: z.array(z.object({ advance_id: z.string().uuid(), amount: z.number().positive() })).default([]),
  paid_date: z.string().min(8),
  payment_account_id: z.string().uuid().nullable().optional(),
  driver_pay_account_id: z.string().uuid().nullable().optional(),
  reference: z.string().max(80).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  period_from: z.string().nullable().optional(),
  period_to: z.string().nullable().optional(),
});

/** POST /driver-settlements — pay a driver's chosen trips (posts to the ledger). */
export const createSettlement = async (req: Request, res: Response) => {
  try {
    const parsed = settleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
    const b = parsed.data;
    // Choosing where all driver pay posts is an Admin decision; afterwards anyone settling uses it
    if (b.driver_pay_account_id) {
      const s = await prisma.settings.findUnique({ where: { id: 'singleton' }, select: { defaultDriverPayAccountId: true } });
      const role = (req as any).user?.role;
      if (!s?.defaultDriverPayAccountId && role !== 'Admin' && role !== 'SuperAdmin') {
        return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Ask an Admin to choose the driver pay account first' } });
      }
    }
    const userId = (req as any).user?.id;
    const settlement = await settleDriver({
      driverId: b.driver_id,
      lines: b.lines.map((l) => ({ tripId: l.trip_id, role: l.role })),
      advances: b.advances.map((a) => ({ advanceId: a.advance_id, amount: a.amount })),
      paidDate: b.paid_date,
      paymentAccountId: b.payment_account_id ?? null,
      driverPayAccountId: b.driver_pay_account_id ?? null,
      reference: b.reference ?? null,
      notes: b.notes ?? null,
      periodFrom: b.period_from ?? null,
      periodTo: b.period_to ?? null,
      userId,
    });
    await logAuditEvent({ req, action: 'DRIVER_SETTLEMENT_PAID', entityType: 'DriverSettlement', entityId: settlement.id, metadata: { ref_id: settlement.ref_id, net: Number(settlement.net_amount) } });
    res.status(201).json({ success: true, data: { id: settlement.id, ref_id: settlement.ref_id, net: Number(settlement.net_amount) } });
  } catch (error) {
    fail(res, error, 'settle the driver');
  }
};

/** POST /driver-settlements/:id/void */
export const voidSettlementHandler = async (req: Request, res: Response) => {
  try {
    const s = await voidSettlement(String(req.params.id), (req as any).user?.id);
    await logAuditEvent({ req, action: 'DRIVER_SETTLEMENT_VOIDED', entityType: 'DriverSettlement', entityId: s.id, metadata: { ref_id: s.ref_id } });
    res.json({ success: true, data: { id: s.id, status: s.status } });
  } catch (error) {
    fail(res, error, 'void the settlement');
  }
};

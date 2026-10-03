/**
 * Driver settlements: paying drivers the trip pay they earned, less employee advances recovered.
 *
 * Paying posts one journal entry:
 *   Dr driver pay expense   (gross trip pay)
 *   Cr employee advance     (each advance recovered, on that advance's own account)
 *   Cr bank / cash          (net paid)
 * A trip's pay (per role: driver, co-driver) can be in one settlement only; voiding reverses the
 * entry, gives the advances their balance back and frees the trips.
 */
import { Prisma, StopType } from '@prisma/client';
import { prisma } from '../db';
import { AccountingError, postJournalEntryTx, voidJournalEntryTx } from './accountingEngine';
import { generateRefId, nextJournalEntryRefId } from './refId';
import { tripPayShares } from './tripFinancials';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const toUuidOrNull = (id?: string | null): string | null => (id && UUID_REGEX.test(id) ? id : null);
const r2 = (n: number) => Math.round(n * 100) / 100;

export const EARNED_STATUSES = ['Completed', 'Invoiced'] as const;
export type PayRole = 'driver' | 'co_driver';

export interface PayableTrip {
  tripId: string;
  refId: string | null;
  role: PayRole;
  amount: number;
  day: string;
  customer: string;
  lane: string;
}

export interface PostingLine {
  accountId: string;
  debit: number;
  credit: number;
  description: string;
}

/** The entry a settlement posts; pure so it can be tested. Throws when the figures don't work. */
export function settlementPosting(p: {
  gross: number;
  driverPayAccountId: string;
  advances: { accountId: string; amount: number; ref: string | null }[];
  paymentAccountId: string | null;
  driverName: string;
}): { lines: PostingLine[]; deducted: number; net: number } {
  const gross = r2(p.gross);
  if (!(gross > 0)) throw new AccountingError('Choose at least one trip with pay to settle', 'NOTHING_TO_SETTLE', 400);
  const deducted = r2(p.advances.reduce((t, a) => t + a.amount, 0));
  if (p.advances.some((a) => !(a.amount > 0))) throw new AccountingError('Advance amounts must be above zero', 'INVALID_AMOUNT', 400);
  if (deducted - gross > 0.005) throw new AccountingError('Advances recovered can’t be more than the trip pay', 'DEDUCTION_TOO_HIGH', 400);
  const net = r2(gross - deducted);
  if (net > 0.005 && !p.paymentAccountId) throw new AccountingError('Choose the bank or cash account the driver was paid from', 'PAYMENT_ACCOUNT_REQUIRED', 400);
  const lines: PostingLine[] = [
    { accountId: p.driverPayAccountId, debit: gross, credit: 0, description: `Trip pay: ${p.driverName}` },
    ...p.advances.map((a) => ({ accountId: a.accountId, debit: 0, credit: r2(a.amount), description: `Advance recovered${a.ref ? ` ${a.ref}` : ''}: ${p.driverName}` })),
    ...(net > 0.005 ? [{ accountId: p.paymentAccountId as string, debit: 0, credit: net, description: `Trip pay paid: ${p.driverName}` }] : []),
  ];
  return { lines, deducted, net };
}

type Db = typeof prisma | Prisma.TransactionClient;

const payTripInclude = {
  customer: { select: { name: true } },
  quotation: { select: { rate: true, driver_payout: true, pricing_basis: true } },
  charges: { select: { amount: true } },
  settlementLines: { select: { role: true } },
  stops: { select: { stop_type: true, stop_sequence: true, location_name: true, location: { select: { name: true } } }, orderBy: { stop_sequence: 'asc' as const } },
} satisfies Prisma.TripInclude;

const laneOf = (stops: { stop_type: StopType; location_name: string | null; location: { name: string } | null }[]) => {
  const name = (s: (typeof stops)[number]) => s.location?.name || s.location_name || '?';
  const pickup = stops.find((s) => s.stop_type === StopType.Pickup);
  const drop = [...stops].reverse().find((s) => s.stop_type === StopType.Dropoff);
  return pickup && drop ? `${name(pickup)} → ${name(drop)}` : 'Unknown route';
};

/**
 * Earned own-fleet trips where this driver (or co-driver) still has pay owed. `upTo` limits to
 * trips finished on or before that instant.
 */
export async function payableTrips(db: Db, driverId: string, upTo?: Date): Promise<PayableTrip[]> {
  const f = upTo ? { lte: upTo } : undefined;
  const trips = await db.trip.findMany({
    where: {
      deletedAt: null,
      is_third_party: false,
      status: { in: [...EARNED_STATUSES] },
      AND: [
        { OR: [{ driverId }, { co_driver_id: driverId }] },
        ...(f ? [{ OR: [{ actual_end: f }, { actual_end: null, actual_start: f }, { actual_end: null, actual_start: null, createdAt: f }] }] : []),
      ],
    },
    include: payTripInclude,
    orderBy: [{ actual_end: 'asc' }, { createdAt: 'asc' }],
    take: 2000,
  });
  const out: PayableTrip[] = [];
  for (const t of trips) {
    const shares = tripPayShares(t as any);
    const settled = new Set(t.settlementLines.map((l) => l.role));
    const when = (t.actual_end || t.actual_start || t.createdAt).toISOString();
    const base = { tripId: t.id, refId: t.ref_id, day: when, customer: t.customer?.name ?? '—', lane: laneOf(t.stops) };
    if (t.driverId === driverId && shares.driver > 0.005 && !settled.has('driver')) out.push({ ...base, role: 'driver', amount: shares.driver });
    if (t.co_driver_id === driverId && shares.coDriver > 0.005 && !settled.has('co_driver')) out.push({ ...base, role: 'co_driver', amount: shares.coDriver });
  }
  return out;
}

/** Every driver with unpaid trip pay: the settlement queue. */
export async function unpaidByDriver(db: Db) {
  const trips = await db.trip.findMany({
    where: { deletedAt: null, is_third_party: false, status: { in: [...EARNED_STATUSES] }, OR: [{ driverId: { not: null } }, { co_driver_id: { not: null } }] },
    include: { quotation: { select: { rate: true, driver_payout: true, pricing_basis: true } }, charges: { select: { amount: true } }, settlementLines: { select: { role: true } } },
    take: 10000,
  });
  const owed = new Map<string, { amount: number; trips: number; oldest: Date }>();
  const add = (driverId: string, amount: number, when: Date) => {
    const cur = owed.get(driverId) ?? { amount: 0, trips: 0, oldest: when };
    cur.amount = r2(cur.amount + amount);
    cur.trips += 1;
    if (when < cur.oldest) cur.oldest = when;
    owed.set(driverId, cur);
  };
  for (const t of trips) {
    const shares = tripPayShares(t as any);
    const settled = new Set(t.settlementLines.map((l) => l.role));
    const when = t.actual_end || t.actual_start || t.createdAt;
    if (t.driverId && shares.driver > 0.005 && !settled.has('driver')) add(t.driverId, shares.driver, when);
    if (t.co_driver_id && shares.coDriver > 0.005 && !settled.has('co_driver')) add(t.co_driver_id, shares.coDriver, when);
  }
  return owed;
}

export interface SettleInput {
  driverId: string;
  lines: { tripId: string; role: PayRole }[];
  advances: { advanceId: string; amount: number }[];
  paidDate: string;
  paymentAccountId?: string | null;
  driverPayAccountId?: string | null;
  reference?: string | null;
  notes?: string | null;
  periodFrom?: string | null;
  periodTo?: string | null;
  userId?: string | null;
}

export async function settleDriver(input: SettleInput) {
  if (!input.lines.length) throw new AccountingError('Choose at least one trip to settle', 'NOTHING_TO_SETTLE', 400);
  return prisma.$transaction(async (tx) => {
    const driver = await tx.driver.findUnique({ where: { id: input.driverId }, select: { id: true, first_name: true, last_name: true, deletedAt: true } });
    if (!driver) throw new AccountingError('Driver not found', 'NOT_FOUND', 404);
    const driverName = `${driver.first_name} ${driver.last_name}`.trim();

    // Amounts come from the trips, never from the request
    const payable = await payableTrips(tx, driver.id);
    const byKey = new Map(payable.map((p) => [`${p.tripId}:${p.role}`, p]));
    const chosen = input.lines.map((l) => {
      const p = byKey.get(`${l.tripId}:${l.role}`);
      if (!p) throw new AccountingError('A chosen trip is not payable to this driver any more (already settled, changed, or not earned)', 'TRIP_NOT_PAYABLE', 409);
      return p;
    });
    const gross = r2(chosen.reduce((t, p) => t + p.amount, 0));

    // Accounts
    const settings = await tx.settings.findUnique({ where: { id: 'singleton' } });
    const driverPayAccountId = input.driverPayAccountId || settings?.defaultDriverPayAccountId;
    if (!driverPayAccountId) throw new AccountingError('Choose the expense account driver trip pay posts to', 'SETTINGS_NOT_CONFIGURED', 400);
    const payAcc = await tx.account.findUnique({ where: { id: driverPayAccountId } });
    if (!payAcc || payAcc.account_type !== 'Expense' || !payAcc.is_postable || !payAcc.isActive || payAcc.deletedAt) {
      throw new AccountingError('Driver trip pay must post to an active, postable Expense account', 'INVALID_ACCOUNT', 400);
    }
    if (!settings?.defaultDriverPayAccountId) {
      await tx.settings.update({ where: { id: 'singleton' }, data: { defaultDriverPayAccountId: driverPayAccountId } });
    }

    // Advances recovered: this driver's open employee advances only
    const advanceRows = input.advances.length
      ? await tx.advance.findMany({ where: { id: { in: input.advances.map((a) => a.advanceId) } } })
      : [];
    const advances = input.advances.map((a) => {
      const row = advanceRows.find((r) => r.id === a.advanceId);
      if (!row || row.party_type !== 'Employee' || row.party_id !== driver.id || row.direction !== 'Paid' || !['Open', 'PartiallyApplied'].includes(row.status)) {
        throw new AccountingError('An advance can’t be recovered here: it must be an open advance paid to this driver', 'INVALID_ADVANCE', 400);
      }
      if (a.amount - Number(row.remaining_amount) > 0.005) throw new AccountingError(`Advance ${row.ref_id ?? ''} has only ${Number(row.remaining_amount).toFixed(2)} left`, 'DEDUCTION_TOO_HIGH', 400);
      return { row, amount: r2(a.amount) };
    });

    let paymentAccountId: string | null = input.paymentAccountId || null;
    if (paymentAccountId) {
      const bank = await tx.bankAccount.findFirst({ where: { accountId: paymentAccountId, deletedAt: null, isActive: true } });
      if (!bank) throw new AccountingError('Paid from must be an active bank or cash account', 'NOT_A_BANK_ACCOUNT', 400);
    }
    const posting = settlementPosting({
      gross,
      driverPayAccountId,
      advances: advances.map((a) => ({ accountId: a.row.accountId, amount: a.amount, ref: a.row.ref_id })),
      paymentAccountId,
      driverName,
    });
    if (posting.net <= 0.005) paymentAccountId = null;

    const paidDate = new Date(input.paidDate);
    const period = await tx.accountingPeriod.findFirst({ where: { status: 'Open', start_date: { lte: paidDate }, end_date: { gte: paidDate } } });
    if (!period) throw new AccountingError(`No open accounting period covers ${input.paidDate}`, 'NO_OPEN_PERIOD', 400);

    const refId = await generateRefId('DSET', () => tx.driverSettlement.findMany({ select: { ref_id: true } }));
    const settlement = await tx.driverSettlement.create({
      data: {
        ref_id: refId,
        driverId: driver.id,
        period_from: input.periodFrom ? new Date(input.periodFrom) : null,
        period_to: input.periodTo ? new Date(input.periodTo) : null,
        status: 'Paid',
        gross_amount: gross,
        advance_deducted: posting.deducted,
        net_amount: posting.net,
        paid_date: paidDate,
        paymentAccountId,
        reference: input.reference?.trim() || null,
        notes: input.notes?.trim() || null,
        created_by: toUuidOrNull(input.userId),
        lines: { create: chosen.map((c) => ({ tripId: c.tripId, role: c.role, amount: c.amount })) },
      },
    });

    const draft = await tx.journalEntry.create({
      data: {
        ref_id: await nextJournalEntryRefId(tx),
        entry_date: paidDate,
        memo: `Driver settlement ${refId}: ${driverName} (${chosen.length} ${chosen.length === 1 ? 'trip' : 'trips'})`,
        status: 'Draft',
        periodId: period.id,
        source_type: 'DriverSettlement',
        source_id: settlement.id,
        reference: input.reference?.trim() || null,
        created_by: toUuidOrNull(input.userId),
        lines: { create: posting.lines.map((l) => ({ accountId: l.accountId, debit: l.debit, credit: l.credit, description: l.description })) },
      },
    });
    const entry = await postJournalEntryTx(tx, draft.id, input.userId);

    for (const a of advances) {
      await tx.advanceApplication.create({
        data: { advanceId: a.row.id, driverSettlementId: settlement.id, amount: a.amount, applied_date: paidDate, journalEntryId: entry.id, created_by: toUuidOrNull(input.userId) },
      });
      const applied = new Prisma.Decimal(a.row.applied_amount).plus(a.amount);
      const remaining = new Prisma.Decimal(a.row.amount).minus(applied);
      const updated = await tx.advance.updateMany({
        where: { id: a.row.id, remaining_amount: { gte: a.amount }, status: { in: ['Open', 'PartiallyApplied'] } },
        data: { applied_amount: applied, remaining_amount: remaining, status: remaining.lte(0) ? 'FullyApplied' : 'PartiallyApplied' },
      });
      if (updated.count === 0) throw new AccountingError('An advance changed while settling; try again', 'CONCURRENCY_ERROR', 409);
    }

    return tx.driverSettlement.update({ where: { id: settlement.id }, data: { journalEntryId: entry.id }, include: { lines: true } });
  });
}

/** Void: reverse the entry, give the advances their balance back, free the trips. */
export async function voidSettlement(id: string, userId?: string | null) {
  return prisma.$transaction(async (tx) => {
    const s = await tx.driverSettlement.findUnique({ where: { id }, include: { advanceApplications: true } });
    if (!s) throw new AccountingError('Settlement not found', 'NOT_FOUND', 404);
    if (s.status !== 'Paid') throw new AccountingError('Only a paid settlement can be voided', 'CANNOT_VOID', 400);
    if (s.journalEntryId) await voidJournalEntryTx(tx, s.journalEntryId, userId, `Void of driver settlement ${s.ref_id ?? ''}`.trim());
    for (const app of s.advanceApplications) {
      const adv = await tx.advance.findUnique({ where: { id: app.advanceId } });
      if (!adv) continue;
      const applied = new Prisma.Decimal(adv.applied_amount).minus(app.amount);
      const remaining = new Prisma.Decimal(adv.amount).minus(applied);
      await tx.advance.update({ where: { id: adv.id }, data: { applied_amount: applied, remaining_amount: remaining, status: applied.lte(0) ? 'Open' : 'PartiallyApplied' } });
      await tx.advanceApplication.delete({ where: { id: app.id } });
    }
    await tx.driverSettlementLine.deleteMany({ where: { settlementId: s.id } });
    return tx.driverSettlement.update({ where: { id: s.id }, data: { status: 'Voided', voidedAt: new Date() } });
  });
}

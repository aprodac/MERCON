/**
 * "Remove driver payouts" on the Quotations page: clears `driver_payout` on
 * every quotation of the chosen customers (or all of them).
 *
 * A trip with no pay of its own (driver_payout 0) is paid its quotation's
 * payout (`calculateBackendTripFinancials`), so clearing the quotation would
 * drop that trip's driver pay — past trips, settlements and margins included.
 * Before clearing, such trips get the pay they were getting written onto
 * themselves (`frozenTripPayout`), so only trips created afterwards start with
 * no default payout.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { asNumber, type Money } from '../utils/tripFinancials';

export interface PayoutFreezeTrip {
  driver_payout: Money;
  co_driver_payout: Money;
  co_driver_id: string | null;
}

/**
 * The `driver_payout` to write on a trip so that, once its quotation's payout
 * is gone, `calculateBackendTripFinancials` pays the same as it does now.
 * `null` = the trip doesn't use the quotation's payout; leave it alone.
 *
 * Mirrors the co-driver rules there: with a co-driver whose pay is set, a
 * quotation default above that pay is split (driver gets default − co-driver),
 * and a trip value of twice the co-driver's pay or more is read the same way.
 */
export function frozenTripPayout(quotationPayout: Money, trip: PayoutFreezeTrip): number | null {
  const quoted = asNumber(quotationPayout);
  if (quoted <= 0 || asNumber(trip.driver_payout) > 0) return null;

  const co = asNumber(trip.co_driver_payout);
  const hasCoDriver = Boolean(trip.co_driver_id) || co > 0;
  if (!hasCoDriver || co <= 0) return quoted;

  const driverShare = quoted > co ? quoted - co : quoted;
  return driverShare >= co * 2 ? driverShare + co : driverShare;
}

export interface ClearPayoutsResult {
  quotations: number;
  /** Trips that were paid the quotation's payout and now carry it themselves. */
  trips_kept: number;
}

export async function clearQuotationDriverPayouts(opts: {
  customerIds: string[] | null;
  dryRun: boolean;
  user: { id: string | null; name: string | null };
}): Promise<ClearPayoutsResult> {
  const where: Prisma.QuotationWhereInput = {
    deletedAt: null,
    driver_payout: { not: null, gt: 0 },
    ...(opts.customerIds ? { customerId: { in: opts.customerIds } } : {}),
  };

  return prisma.$transaction(async (tx) => {
    const quotations = await tx.quotation.findMany({ where, select: { id: true, driver_payout: true } });
    if (quotations.length === 0) return { quotations: 0, trips_kept: 0 };

    const payoutOf = new Map(quotations.map((q) => [q.id, q.driver_payout]));
    // Deleted trips too: a trip restored from Recently deleted keeps its pay.
    const trips = await tx.trip.findMany({
      where: { quotationId: { in: [...payoutOf.keys()] }, is_third_party: false, driver_payout: { lte: 0 } },
      select: { id: true, quotationId: true, driver_payout: true, co_driver_payout: true, co_driver_id: true },
    });
    const keep = trips
      .map((t) => ({ id: t.id, payout: frozenTripPayout(payoutOf.get(t.quotationId!) ?? null, t) }))
      .filter((t): t is { id: string; payout: number } => t.payout !== null);

    if (opts.dryRun) return { quotations: quotations.length, trips_kept: keep.length };

    for (const t of keep) {
      await tx.trip.update({ where: { id: t.id }, data: { driver_payout: t.payout, updated_by: opts.user.id } });
    }
    await tx.quotation.updateMany({
      where: { id: { in: [...payoutOf.keys()] } },
      data: { driver_payout: null, updated_by: opts.user.id, version: { increment: 1 } },
    });
    await tx.quotationHistory.createMany({
      data: quotations.map((q) => ({
        quotationId: q.id,
        old_driver_payout: q.driver_payout,
        new_driver_payout: null,
        changed_by: opts.user.name,
        changed_by_user_id: opts.user.id,
        changed_by_name: opts.user.name,
        reason: 'Driver payouts removed',
        source: 'QUOTATION_MODULE',
      })),
    });
    return { quotations: quotations.length, trips_kept: keep.length };
  }, { timeout: 60_000 });
}

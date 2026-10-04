import { prisma } from '../db';
import { FINISHED_TRIP_STATUSES } from './driverPerformance';

/**
 * Lifetime trip pay per driver: driver_payout on trips they drove plus
 * co_driver_payout on trips they co-drove, counting only finished trips
 * (Completed / Invoiced). A cancelled trip earns nothing.
 *
 * One function for the Drivers list and GET /drivers/payouts — the payouts
 * endpoint used to add every trip (cancelled ones too, co-driver pay left
 * out) and the list page showed that number over the correct one.
 */
export async function sumDriverTripCharges(driverIds: string[]): Promise<Map<string, number>> {
  const totals = new Map<string, number>(driverIds.map((id) => [id, 0]));
  if (driverIds.length === 0) return totals;

  const status = { in: [...FINISHED_TRIP_STATUSES] as any };
  const [primarySums, coDriverSums] = await Promise.all([
    prisma.trip.groupBy({
      by: ['driverId'],
      where: { driverId: { in: driverIds }, deletedAt: null, status },
      _sum: { driver_payout: true },
    }),
    prisma.trip.groupBy({
      by: ['co_driver_id'],
      where: { co_driver_id: { in: driverIds }, deletedAt: null, status },
      _sum: { co_driver_payout: true },
    }),
  ]);

  for (const s of primarySums as any[]) {
    if (s.driverId) totals.set(s.driverId, (totals.get(s.driverId) || 0) + (Number(s._sum.driver_payout) || 0));
  }
  for (const s of coDriverSums as any[]) {
    if (s.co_driver_id) totals.set(s.co_driver_id, (totals.get(s.co_driver_id) || 0) + (Number(s._sum.co_driver_payout) || 0));
  }
  return totals;
}

/**
 * One month of pay for one driver (this month by default; step back with `prev`).
 *
 * With the finance module on: GET /driver-settlements/monthly/trips — what each
 * trip earned and whether a settlement has paid it (same data as the web).
 * With it off (403): the per-trip pay already on the driver's trips
 * (Trip.driver_payout) — earned only, since paid / owed lives in finance.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { driverDetailsApi, type RawDriverTrip } from '../api/driverDetailsApi';

export interface PayoutRow {
  key: string;
  tripId: string;
  day: string;
  title: string;
  sub: string;
  amount: number;
  /** null when paid / unpaid isn't known (finance module off). */
  paid: boolean | null;
}

export function useDriverPayouts(driverId: string | undefined, trips: RawDriverTrip[]) {
  /** 0 = this month, 1 = last month, … */
  const [back, setBack] = useState(0);
  const today = new Date();
  const now = new Date(today.getFullYear(), today.getMonth() - back, 1);
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const query = useQuery({
    queryKey: ['drivers', 'detail', driverId, 'payouts', month],
    queryFn: () => driverDetailsApi.getMonthPayouts(driverId!, month),
    enabled: !!driverId,
    retry: false,
  });
  const financeOff = (query.error as any)?.response?.status === 403;

  const rows = useMemo<PayoutRow[]>(() => {
    if (query.data) {
      return query.data.map((x) => ({
        key: `${x.tripId}-${x.role}`,
        tripId: x.tripId,
        day: x.day,
        title: x.lane || x.customer || x.tripRef || 'Trip',
        sub: [x.customer, x.role === 'co_driver' ? 'Co-driver' : null].filter(Boolean).join('  ·  ') || x.tripRef || '',
        amount: Number(x.amount) || 0,
        paid: Boolean(x.settlement),
      }));
    }
    if (!financeOff) return [];
    return trips
      .filter((t) => t.status !== 'Cancelled' && Number(t.driver_payout) > 0 && (t.planned_start ?? t.createdAt).slice(0, 7) === month)
      .map((t) => ({
        key: t.id,
        tripId: t.id,
        day: (t.planned_start ?? t.createdAt).slice(0, 10),
        title: t.customer?.name || t.ref_id || 'Trip',
        sub: t.ref_id ?? '',
        amount: Number(t.driver_payout) || 0,
        paid: null,
      }));
  }, [query.data, financeOff, trips, month]);

  const sorted = useMemo(() => [...rows].sort((a, b) => b.day.localeCompare(a.day)), [rows]);
  const earned = rows.reduce((n, x) => n + x.amount, 0);
  const paid = rows.filter((x) => x.paid).reduce((n, x) => n + x.amount, 0);

  return {
    monthLabel: now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
    prev: () => setBack((n) => Math.min(n + 1, 23)),
    next: () => setBack((n) => Math.max(n - 1, 0)),
    isCurrent: back === 0,
    rows: sorted,
    totals: { earned, paid, owed: earned - paid, trips: rows.length },
    /** False when only earnings are known (finance module off). */
    knowsPaid: !financeOff,
    loading: query.isFetching && !query.data && !financeOff,
    error: query.isError && !financeOff,
    refetch: query.refetch,
  };
}

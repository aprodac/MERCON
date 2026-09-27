import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tripService, type MobileTrip } from '@mercon/mobile-shared/lib/trips';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { queryClient } from '@mercon/mobile-shared/lib/query-client';
import { driverKeys } from './query-keys';

const isFinished = (t: MobileTrip | null | undefined) =>
  !t || t.status === 'Completed' || t.status === 'Invoiced' || t.status === 'Cancelled' || t.driver_workflow_state === 'COMPLETED';

/** Shared cache value: finished trips are never cached, so a fresh screen never shows a stale "current" trip. */
const toCache = (t: MobileTrip | null) => (isFinished(t) ? null : t);

export function clearCurrentTripCache() {
  queryClient.setQueryData(driverKeys.currentTrip, null);
}

/**
 * The driver's current active trip, shared by every screen through React
 * Query — one request serves all mounted screens instead of one per screen.
 * `pollMs` keeps it fresh in the background (used by DriverLiveTracking).
 */
export function useCurrentTrip(opts?: { pollMs?: number }) {
  const query = useQuery({
    queryKey: driverKeys.currentTrip,
    queryFn: async () => toCache(await tripService.getCurrent()),
    refetchInterval: opts?.pollMs,
  });

  // A screen that just finished a trip keeps showing that trip locally (as the
  // old per-screen state did) while the shared cache already holds null. The
  // override lapses as soon as the cache is refreshed from the server.
  const [local, setLocal] = useState<{ trip: MobileTrip | null; at: number } | null>(null);

  const setTrip = useCallback(
    (next: MobileTrip | null | ((prev: MobileTrip | null) => MobileTrip | null)) => {
      const prev = queryClient.getQueryData<MobileTrip | null>(driverKeys.currentTrip) ?? null;
      const value = typeof next === 'function' ? next(prev) : next;
      // Synchronous: a screen that navigates right after setTrip hands the next
      // screen the new trip, not the stale one.
      queryClient.setQueryData(driverKeys.currentTrip, toCache(value));
      const at = queryClient.getQueryState(driverKeys.currentTrip)?.dataUpdatedAt ?? 0;
      setLocal(toCache(value) === value ? null : { trip: value, at });
    },
    [],
  );

  const { refetch: queryRefetch } = query;
  const refetch = useCallback(async (_opts?: unknown) => {
    await queryRefetch();
  }, [queryRefetch]);

  const trip = local && local.at === query.dataUpdatedAt ? local.trip : (query.data ?? null);

  return {
    trip,
    loading: query.isPending,
    error: query.error ? getApiErrorMessage(query.error) : null,
    refetch,
    setTrip,
  };
}

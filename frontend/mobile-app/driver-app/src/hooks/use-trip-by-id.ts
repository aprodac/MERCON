import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tripService, type MobileTrip } from '@mercon/mobile-shared/lib/trips';
import { queryClient } from '@mercon/mobile-shared/lib/query-client';
import { driverKeys } from './query-keys';
import { useCurrentTrip } from './use-current-trip';

/**
 * ONE named trip, not "whatever is current". The trip-log screen used to show
 * the driver's current trip, so when two trips were open its screenshots and
 * Finish landed on the wrong one (TRP-0054 finished instead of TRP-0053, 22 Oct).
 * `tripId` comes from the route; with none (an old link), the current trip's id.
 */
export function useTripById(tripId?: string | null, opts?: { pollMs?: number }) {
  const current = useCurrentTrip();
  const id = tripId || current.trip?.id || null;
  const key = ['driver', 'trip', 'by-id', id] as const;
  const query = useQuery({
    queryKey: key,
    queryFn: () => tripService.getTripDetails(id as string),
    enabled: !!id,
    refetchInterval: opts?.pollMs,
  });

  const setTrip = useCallback(
    (next: MobileTrip | null) => {
      if (!id) return;
      queryClient.setQueryData(['driver', 'trip', 'by-id', id], next);
      // The home card and lists read other caches; refresh them.
      void queryClient.invalidateQueries({ queryKey: driverKeys.currentTrip });
      void queryClient.invalidateQueries({ queryKey: ['driver', 'trips'] });
    },
    [id],
  );

  const { refetch: queryRefetch } = query;
  const refetch = useCallback(async () => {
    if (id) await queryRefetch();
  }, [id, queryRefetch]);

  return { trip: query.data ?? null, refetch, setTrip };
}

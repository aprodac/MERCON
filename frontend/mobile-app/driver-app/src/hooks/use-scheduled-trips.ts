import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tripService } from '@mercon/mobile-shared/lib/trips';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { queryClient } from '@mercon/mobile-shared/lib/query-client';
import { driverKeys } from './query-keys';

/** The driver's scheduled and upcoming trips, shared across screens via React Query. */
export function useScheduledTrips() {
  const query = useQuery({
    queryKey: driverKeys.scheduledTrips,
    queryFn: () => tripService.getScheduled(),
  });

  const { refetch: queryRefetch } = query;
  const refetch = useCallback(async (_opts?: unknown) => {
    await queryRefetch();
  }, [queryRefetch]);

  /** Refreshes only when the cached list is older than the default staleTime — for screen-focus refreshes. */
  const refetchIfStale = useCallback(() => {
    queryClient.refetchQueries({ queryKey: driverKeys.scheduledTrips, stale: true });
  }, []);

  return {
    trips: query.data ?? [],
    loading: query.isPending,
    error: query.error ? getApiErrorMessage(query.error) : null,
    refetch,
    refetchIfStale,
  };
}

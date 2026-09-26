import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tripService } from '@mercon/mobile-shared/lib/trips';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { queryClient } from '@mercon/mobile-shared/lib/query-client';
import { driverKeys } from './query-keys';

const HISTORY_LIMIT = 100;

/**
 * The driver's past trips, shared across screens via React Query. This is the
 * heaviest driver request (up to 100 full trips), so screens refresh it on
 * focus only when it is stale (`refetchIfStale`), not on every tab switch.
 */
export function useTripHistory() {
  const query = useQuery({
    queryKey: driverKeys.tripHistory(HISTORY_LIMIT),
    queryFn: () => tripService.getHistory(HISTORY_LIMIT),
  });

  const { refetch: queryRefetch } = query;
  const refetch = useCallback(async (_opts?: unknown) => {
    await queryRefetch();
  }, [queryRefetch]);

  const refetchIfStale = useCallback(() => {
    queryClient.refetchQueries({ queryKey: driverKeys.tripHistory(HISTORY_LIMIT), stale: true });
  }, []);

  return {
    trips: query.data ?? [],
    loading: query.isPending,
    error: query.error ? getApiErrorMessage(query.error) : null,
    refetch,
    refetchIfStale,
  };
}

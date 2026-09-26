import { useQuery } from '@tanstack/react-query';
import { driversApi } from '../api/driversApi';

/** Fleet-wide driver counts (independent of the list's current search/filter), for the DriverStatCard row. */
export function useDriverStats() {
  const query = useQuery({
    queryKey: ['drivers', 'stats'],
    queryFn: driversApi.getDriverStats,
    staleTime: 60_000,
  });

  return {
    totalDrivers: query.data?.totalDrivers ?? 0,
    online: query.data?.online ?? 0,
    onTrip: query.data?.onTrip ?? 0,
    offline: query.data?.offline ?? 0,
    onLeave: query.data?.onLeave ?? 0,
    inactive: query.data?.inactive ?? 0,
    loading: query.isLoading,
    error: query.isError ? 'Could not load driver stats.' : null,
    refresh: query.refetch,
  };
}

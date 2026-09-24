import { useQuery } from '@tanstack/react-query';
import { vehiclesApi } from '../api/vehiclesApi';

/** Fleet-wide vehicle counts from GET /vehicles?mode=kpi, for the VehicleStatsSection row. */
export function useVehicleStats() {
  const query = useQuery({
    queryKey: ['vehicles', 'stats'],
    queryFn: vehiclesApi.getVehicleStats,
    staleTime: 60_000,
  });

  return {
    totalVehicles: query.data?.total ?? 0,
    available: query.data?.available ?? 0,
    onTrip: query.data?.onTrip ?? 0,
    maintenance: query.data?.maintenance ?? 0,
    loading: query.isLoading,
    error: query.isError ? 'Could not load vehicle stats.' : null,
    refresh: query.refetch,
  };
}

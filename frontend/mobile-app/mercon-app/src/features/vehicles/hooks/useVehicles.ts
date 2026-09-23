import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { vehiclesApi } from '../api/vehiclesApi';
import { sortVehicles, toVehicleListItem } from '../services/vehiclesService';
import type { AssetStatus, VehicleSortOption } from '../types';

const PAGE_SIZE = 10;

interface UseVehiclesParams {
  search?: string;
  status?: AssetStatus | null;
  sort?: VehicleSortOption;
  page?: number;
}

/** Paginated vehicle list (10 per page) — search/status/page reload from backend. */
export function useVehicles({ search = '', status = null, sort = 'plate', page = 1 }: UseVehiclesParams) {
  const query = useQuery({
    queryKey: ['vehicles', 'list', search, status, page],
    queryFn: () => vehiclesApi.getVehicles({ page, per_page: PAGE_SIZE, search, status }),
  });

  const rawVehicles = query.data?.data ?? [];
  const meta = query.data?.meta ?? { page: 1, per_page: 10, total: 0, total_pages: 1 };

  const vehicles = useMemo(() => {
    const list = rawVehicles.map(toVehicleListItem);
    return sortVehicles(list, sort);
  }, [rawVehicles, sort]);

  return {
    vehicles,
    total: meta.total,
    page: meta.page,
    totalPages: meta.total_pages,
    loading: query.isLoading,
    error: query.isError ? 'Could not load vehicles.' : null,
    refresh: query.refetch,
    isRefreshing: query.isRefetching,
    isFetching: query.isFetching,
    hasNextPage: meta.page < meta.total_pages,
    hasPrevPage: meta.page > 1,
  };
}

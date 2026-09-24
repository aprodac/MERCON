import { useMemo } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { driversApi } from '../api/driversApi';
import { sortDrivers, toDriverListItem, tripCountMap } from '../services/driversService';
import type { DriverSortOption, DriverStatus } from '../types';

const PAGE_SIZE = 10;

interface UseDriversParams {
  search?: string;
  status?: DriverStatus | null;
  sort?: DriverSortOption;
  page?: number;
}

/** Paginated driver list (10 per page) — search/status/page reload from backend. */
export function useDrivers({ search = '', status = null, sort = 'name', page = 1 }: UseDriversParams) {
  const tripCounts = useQuery({
    queryKey: ['drivers', 'trip-counts'],
    queryFn: driversApi.getDriverTripCounts,
    staleTime: 5 * 60_000,
  });
  const tripCountById = useMemo(() => tripCountMap(tripCounts.data ?? []), [tripCounts.data]);

  const query = useQuery({
    queryKey: ['drivers', 'list', search, status, page],
    queryFn: () => driversApi.getDrivers({ page, per_page: PAGE_SIZE, search, status }),
  });

  const rawDrivers = query.data?.data ?? [];
  const meta = query.data?.meta ?? { page: 1, per_page: 10, total: 0, total_pages: 1 };

  const drivers = useMemo(() => {
    const list = rawDrivers.map((raw) => toDriverListItem(raw, tripCountById));
    return sortDrivers(list, sort);
  }, [rawDrivers, tripCountById, sort]);

  return {
    drivers,
    total: meta.total,
    page: meta.page,
    totalPages: meta.total_pages,
    loading: query.isLoading,
    error: query.isError ? 'Could not load drivers.' : null,
    refresh: query.refetch,
    isRefreshing: query.isRefetching,
    isFetching: query.isFetching,
    hasNextPage: meta.page < meta.total_pages,
    hasPrevPage: meta.page > 1,
  };
}

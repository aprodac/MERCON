import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { quotationsApi } from '../api/quotationsApi';
import { sortQuotations, toQuotationListItem } from '../services/quotationsService';
import type { QuotationFilterStatus, QuotationSortOption } from '../types';

const PAGE_SIZE = 10;

interface UseQuotationsParams {
  search?: string;
  status?: QuotationFilterStatus;
  sort?: QuotationSortOption;
  page?: number;
}

/** Paginated quotation list (10 per page) with search and status filtering. */
export function useQuotations({ search = '', status = 'all', sort = 'route', page = 1 }: UseQuotationsParams) {
  const query = useQuery({
    queryKey: ['quotations', 'list', search, page],
    queryFn: () => quotationsApi.getQuotations({ page, per_page: PAGE_SIZE, search }),
  });

  const rawQuotations = query.data?.data ?? [];
  const meta = query.data?.meta ?? { page: 1, per_page: 10, total: 0, total_pages: 1 };

  const quotations = useMemo(() => {
    let list = rawQuotations.map(toQuotationListItem);
    if (status && status !== 'all') {
      list = list.filter((q) => q.validityStatus === status);
    }
    return sortQuotations(list, sort);
  }, [rawQuotations, status, sort]);

  return {
    quotations,
    total: meta.total,
    page: meta.page,
    totalPages: meta.total_pages,
    loading: query.isLoading,
    error: query.isError ? 'Could not load commercial quotations.' : null,
    refresh: query.refetch,
    isRefreshing: query.isRefetching,
    isFetching: query.isFetching,
    hasNextPage: meta.page < meta.total_pages,
    hasPrevPage: meta.page > 1,
  };
}

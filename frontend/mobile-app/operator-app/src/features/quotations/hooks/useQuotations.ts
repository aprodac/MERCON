import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { quotationsApi } from '../api/quotationsApi';
import { toQuotationListItem } from '../services/quotationsService';

export const QUOTATIONS_KEY = ['quotations', 'all'] as const;

/**
 * Every quotation, once (the list is a few hundred rows at most). Search,
 * status filter and sort then run on the phone, so the status tiles can show
 * true counts and the details page reads the same cached list.
 */
export function useQuotations() {
  const query = useQuery({
    queryKey: QUOTATIONS_KEY,
    queryFn: () => quotationsApi.getQuotations({ per_page: 'all' }),
  });

  const quotations = useMemo(() => (query.data?.data ?? []).map(toQuotationListItem), [query.data]);

  return {
    quotations,
    loading: query.isLoading,
    error: query.isError ? 'Could not load commercial quotations.' : null,
    refresh: query.refetch,
    isRefreshing: query.isRefetching,
  };
}

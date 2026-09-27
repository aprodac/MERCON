import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AgeingBucketFilter, PartySort } from '@/lib/finance/ageing';
import { asOfPresetDate } from '@/components/finance/kit/AsOfControl';

/** URL-backed state shared by the AP and AR ageing workspaces (view, as-of, basis, filters, sort). */
export function useAgeingUrlState<V extends string>(defaultView: V) {
  const [params, setParams] = useSearchParams();

  const set = useCallback(
    (key: string, value: string | null) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === null || value === '' || value === 'all') next.delete(key);
          else next.set(key, value);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  return {
    view: (params.get('view') as V) || defaultView,
    asOf: params.get('as_of') || asOfPresetDate('today'),
    basis: (params.get('basis') === 'bill' ? 'bill' : 'due') as 'due' | 'bill',
    bucket: (params.get('bucket') as AgeingBucketFilter) || 'all',
    search: params.get('search') || '',
    overdueOnly: params.get('overdue_only') === 'true',
    sort: (params.get('sort') as PartySort) || 'total_desc',
    set,
  };
}

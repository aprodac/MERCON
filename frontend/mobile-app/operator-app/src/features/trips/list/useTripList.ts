/**
 * Data for the Trips page, one query per view:
 *   now      — every open trip (draft → delayed); refreshes every 30 s
 *   schedule — all trips in a 3-week window around today, for the date strip
 *   history  — finished / cancelled trips, page by page
 *   search   — the server's word search across all trips
 */
import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from '@mercon/mobile-shared/lib/api';
import { operatorService, type OperatorTrip } from '../../../lib/operator';
import { makeTime } from './tripListModel';

export type View = 'now' | 'schedule' | 'history';

export const SCHEDULE_BEFORE = 7;
export const SCHEDULE_AFTER = 13;
const HISTORY_PAGE = 30;

async function fetchTrips(params: Record<string, string | number>): Promise<{ trips: OperatorTrip[]; total: number }> {
  const { data } = await api.get('/trips', { params });
  return { trips: (data.data ?? []) as OperatorTrip[], total: Number(data.meta?.total ?? data.pagination?.total ?? 0) };
}

/** "Now", updated every minute, so lateness and "starts in" stay current without re-fetching. */
export function useNow(everyMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

/**
 * `scope` narrows every view to one truck or one customer (opened from their
 * details screen), e.g. { vehicle_id } or { customer_id }.
 */
export function useTripList(view: View, search: string, now: number, scope?: Record<string, string>) {
  const filter: Record<string, string> = scope ?? {};
  const scopeKey = scope ? Object.entries(scope).map(([k, v]) => `${k}=${v}`).join('&') : undefined;
  const tzQuery = useQuery({ queryKey: ['trips', 'tz'], queryFn: () => operatorService.deploymentTimezone(), staleTime: Infinity });
  const tz = tzQuery.data ?? 'Asia/Riyadh';
  const f = useMemo(() => makeTime(tz), [tz]);
  const todayKey = f.dayKey(now);

  const openQ = useQuery({
    queryKey: ['trips', 'open', scopeKey ?? 'all'],
    queryFn: () => fetchTrips({ status: 'Draft,Scheduled,Loading,InTransit,Delayed', per_page: 300, ...filter }),
    refetchInterval: view === 'now' ? 30_000 : false,
    enabled: view === 'now' || view === 'schedule',
  });

  const windowStart = useMemo(() => {
    const [y, m, d] = todayKey.split('-').map(Number);
    return f.startOfDay(new Date(Date.UTC(y, m - 1, d - SCHEDULE_BEFORE)).toISOString().slice(0, 10));
  }, [f, todayKey]);
  const windowEnd = useMemo(() => {
    const [y, m, d] = todayKey.split('-').map(Number);
    return f.startOfDay(new Date(Date.UTC(y, m - 1, d + SCHEDULE_AFTER + 1)).toISOString().slice(0, 10));
  }, [f, todayKey]);

  const schedule = useQuery({
    queryKey: ['trips', 'window', todayKey, scopeKey ?? 'all'],
    queryFn: () => fetchTrips({ start_date: windowStart.toISOString(), end_date: new Date(windowEnd.getTime() - 1).toISOString(), per_page: 500, ...filter }),
    enabled: view === 'schedule',
    refetchInterval: view === 'schedule' ? 60_000 : false,
  });

  const history = useInfiniteQuery({
    queryKey: ['trips', 'history', scopeKey ?? 'all'],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => fetchTrips({ status: 'Completed,Invoiced,Cancelled', per_page: HISTORY_PAGE, page: pageParam, ...filter }),
    getNextPageParam: (last, pages) => (last.trips.length < HISTORY_PAGE ? undefined : pages.length + 1),
    enabled: view === 'history',
  });

  const term = search.trim();
  const found = useQuery({
    queryKey: ['trips', 'search', term, scopeKey ?? 'all'],
    queryFn: () => fetchTrips({ search: term, per_page: 60, ...filter }),
    enabled: term.length >= 2,
    staleTime: 15_000,
  });

  return {
    tz,
    f,
    todayKey,
    open: openQ.data?.trips ?? [],
    openLoading: openQ.isLoading,
    window: schedule.data?.trips ?? [],
    windowLoading: schedule.isLoading,
    history: history.data?.pages.flatMap((p) => p.trips) ?? [],
    historyLoading: history.isLoading,
    historyMore: history.hasNextPage,
    loadMoreHistory: () => { if (history.hasNextPage && !history.isFetchingNextPage) history.fetchNextPage(); },
    historyFetchingMore: history.isFetchingNextPage,
    results: found.data?.trips ?? [],
    searching: term.length >= 2,
    searchLoading: found.isFetching,
    error: (view === 'now' ? openQ.error : view === 'schedule' ? schedule.error : history.error) as Error | null,
    refresh: async () => {
      await Promise.all([
        view === 'now' || view === 'schedule' ? openQ.refetch() : null,
        view === 'schedule' ? schedule.refetch() : null,
        view === 'history' ? history.refetch() : null,
        term.length >= 2 ? found.refetch() : null,
      ]);
    },
  };
}

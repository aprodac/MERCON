/**
 * Loads every source behind Notifications → To do (and Home's emergency
 * strip, fleet map and Up next). Each source is its
 * own query under ['dashboard', ...] (so pull-to-refresh reloads them all) and
 * one failing source never hides the others. The live map refreshes every 30 s.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@mercon/mobile-shared/lib/api';
import { useNotifications } from '@/features/notifications/hooks/useNotifications';
import { operatorService } from '../../../lib/operator';
import { buildActions, type ActionItem, type ActionSources } from './actionModel';
import { makeTime } from '../../trips/list/tripListModel';

const LIVE_REFRESH_MS = 30_000;
const SLOW_REFRESH_MS = 120_000;

const safe = <T,>(fn: () => Promise<T>, fallback: T) => async () => {
  try {
    return await fn();
  } catch {
    return fallback;
  }
};

/**
 * Trips that ended today in `tz`. The server counts them (`ended_since` +
 * the list's total), so only one light row comes back — it used to download
 * 100 full finished trips just to count them.
 */
async function countFinishedToday(tz: string): Promise<number> {
  const f = makeTime(tz);
  const since = f.startOfDay(f.dayKey(Date.now()));
  const { data } = await api.get('/trips', {
    params: { status: 'Completed,Invoiced', ended_since: since.toISOString(), per_page: 1, lite: true },
  });
  return Number(data.meta?.total ?? 0);
}

export function useActionInbox() {
  const live = useQuery({
    queryKey: ['dashboard', 'actions', 'live-map'],
    queryFn: () => operatorService.liveMap(),
    refetchInterval: LIVE_REFRESH_MS,
  });
  const unassigned = useQuery({
    queryKey: ['dashboard', 'actions', 'upcoming-trips'],
    queryFn: safe(async () => {
      const { data } = await api.get('/trips', { params: { status: 'Draft,Scheduled', per_page: 100 } });
      return (data.data ?? []) as ActionSources['unassigned'];
    }, []),
    refetchInterval: SLOW_REFRESH_MS,
  });
  const updates = useQuery({
    queryKey: ['dashboard', 'actions', 'driver-updates'],
    queryFn: safe(async () => (await operatorService.driverUpdates()).updates ?? [], []),
    refetchInterval: LIVE_REFRESH_MS,
  });
  const expiries = useQuery({
    queryKey: ['dashboard', 'actions', 'expiries'],
    queryFn: safe(() => operatorService.documentExpiries(), []),
    staleTime: 5 * 60_000,
  });
  const reviews = useQuery({
    queryKey: ['dashboard', 'actions', 'reviews'],
    queryFn: safe(() => operatorService.tripDocumentsToReview(), []),
    refetchInterval: SLOW_REFRESH_MS,
  });
  const invoices = useQuery({
    queryKey: ['dashboard', 'actions', 'invoices'],
    queryFn: safe(() => operatorService.invoices(), []),
    staleTime: 5 * 60_000,
  });
  const notifications = useNotifications();

  const tzQuery = useQuery({ queryKey: ['dashboard', 'tz'], queryFn: () => operatorService.deploymentTimezone(), staleTime: Infinity });
  const tz = tzQuery.data ?? 'Asia/Riyadh';

  // Trips finished today, for Home's progress ring. "Today" is worked out
  // when the query runs (every 2 min), so the count rolls over at midnight.
  const finished = useQuery({
    queryKey: ['dashboard', 'actions', 'finished-today', tz],
    queryFn: safe(() => countFinishedToday(tz), 0),
    enabled: tzQuery.isSuccess,
    refetchInterval: SLOW_REFRESH_MS,
  });

  const units = useMemo(() => live.data ?? [], [live.data]);

  const items = useMemo<ActionItem[]>(
    () =>
      buildActions({
        units,
        unassigned: unassigned.data ?? [],
        updates: updates.data ?? [],
        expiries: expiries.data ?? [],
        reviews: reviews.data ?? [],
        invoices: invoices.data ?? [],
        notifications: notifications.data ?? [],
      }),
    [units, unassigned.data, updates.data, expiries.data, reviews.data, invoices.data, notifications.data],
  );


  const running = units.filter((u) => u.trip && u.trip.phase !== 'upcoming').length;
  const delayed = units.filter((u) => u.trip?.phase === 'delayed').length;

  return {
    items,
    /** Not-started trips (Draft / Scheduled), for Home's Up next and today's ring. */
    scheduled: unassigned.data ?? [],
    /** Documents expired or expiring soon (Home's Free trucks shows a truck's). */
    expiries: expiries.data ?? [],
    /** Driver photo sets, newest first on Home's "From drivers" strip. */
    updates: updates.data ?? [],
    /** Trips finished today; null until known. */
    finishedToday: finished.isSuccess ? finished.data : null,
    units,
    tz,
    counts: {
      running,
      delayed,
      action: items.filter((i) => i.urgency !== 'watch').length,
      now: items.filter((i) => i.urgency === 'now').length,
    },
    loading: live.isLoading,
    /** When the live data last arrived (ms), for "Updated 2 min ago". */
    updatedAt: live.dataUpdatedAt || null,
    liveError: live.isError,
    retry: () => live.refetch(),
  };
}

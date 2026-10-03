/**
 * Loads every source behind the home's "Needs action" list. Each source is its
 * own query under ['dashboard', ...] (so pull-to-refresh reloads them all) and
 * one failing source never hides the others. The live map refreshes every 30 s.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@mercon/mobile-shared/lib/api';
import { useNotifications } from '@/features/notifications/hooks/useNotifications';
import { operatorService } from '../../../lib/operator';
import { buildActions, todaysTrips, type ActionItem, type ActionSources } from './actionModel';
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

  // Today's workload for the progress bar: finished today, running now
  // (including trips carried over from earlier days) and still to start today.
  const f = useMemo(() => makeTime(tz), [tz]);
  const todayKey = f.dayKey(Date.now());
  const planned = useQuery({
    queryKey: ['dashboard', 'actions', 'planned-today', todayKey, tz],
    queryFn: safe(async () => {
      const start = f.startOfDay(todayKey);
      const end = new Date(start.getTime() + 24 * 3600_000 - 1);
      const { data } = await api.get('/trips', { params: { status: 'Draft,Scheduled', start_date: start.toISOString(), end_date: end.toISOString(), per_page: 300 } });
      return ((data.data ?? []) as unknown[]).length;
    }, 0),
    enabled: tzQuery.isSuccess,
    refetchInterval: SLOW_REFRESH_MS,
  });
  const finished = useQuery({
    queryKey: ['dashboard', 'actions', 'finished-today', todayKey, tz],
    queryFn: safe(async () => {
      const { data } = await api.get('/trips', { params: { status: 'Completed,Invoiced', per_page: 100 } });
      return ((data.data ?? []) as { actual_end?: string | null }[]).filter((t) => t.actual_end && f.dayKey(t.actual_end) === todayKey).length;
    }, 0),
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

  const today = useMemo(() => todaysTrips(units, tz), [units, tz]);

  const running = units.filter((u) => u.trip && u.trip.phase !== 'upcoming').length;
  const delayed = units.filter((u) => u.trip?.phase === 'delayed').length;
  const dayCounts = planned.isSuccess && finished.isSuccess
    ? { done: finished.data ?? 0, running, toStart: planned.data ?? 0, total: (finished.data ?? 0) + running + (planned.data ?? 0) }
    : null;

  return {
    items,
    today,
    day: dayCounts,
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

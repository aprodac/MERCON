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

  return {
    items,
    today,
    tz,
    counts: {
      running,
      delayed,
      action: items.filter((i) => i.urgency !== 'watch').length,
      now: items.filter((i) => i.urgency === 'now').length,
    },
    loading: live.isLoading,
    liveError: live.isError,
    retry: () => live.refetch(),
  };
}

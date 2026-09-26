import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { notificationService } from '../services/notifications';
import type { AppNotification } from '@mercon/mobile-shared/lib/notifications';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { queryClient } from '@mercon/mobile-shared/lib/query-client';
import { driverKeys } from './query-keys';

const setItems = (fn: (prev: AppNotification[]) => AppNotification[]) =>
  queryClient.setQueryData<AppNotification[]>(driverKeys.notifications, (prev) => fn(prev ?? []));

/** The driver's notifications (React Query cache) with optimistic mark-as-read. */
export function useNotifications() {
  const query = useQuery({
    queryKey: driverKeys.notifications,
    queryFn: () => notificationService.list(),
  });

  const { refetch: queryRefetch } = query;
  const refetch = useCallback(async () => {
    await queryRefetch();
  }, [queryRefetch]);

  const markRead = useCallback((id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    // Optimistic — if the request fails, the next refetch corrects it.
    notificationService.markRead(id).catch(() => {});
  }, []);

  const markAll = useCallback(() => {
    const items = queryClient.getQueryData<AppNotification[]>(driverKeys.notifications) ?? [];
    items.filter((n) => !n.is_read).forEach((n) => notificationService.markRead(n.id).catch(() => {}));
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }, []);

  return {
    items: query.data ?? [],
    loading: query.isFetching,
    error: query.error ? getApiErrorMessage(query.error) : null,
    refetch,
    markRead,
    markAll,
  };
}

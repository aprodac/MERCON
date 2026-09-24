import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppNotification } from '@mercon/mobile-shared/lib/notifications';
import { notificationsApi } from '../api/notificationsApi';

/** Shared with the dashboard header's unread badge, so reading here updates it. */
export const notificationsKey = ['notifications'] as const;

export function useNotifications() {
  return useQuery({
    queryKey: notificationsKey,
    queryFn: notificationsApi.list,
  });
}

/**
 * Optimistic mark-as-read. There is no bulk endpoint, so "mark all" sends one
 * PATCH per unread item; any failure is corrected by refetching.
 */
export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();

  const markIds = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      queryClient.setQueryData<AppNotification[]>(notificationsKey, (prev) =>
        prev?.map((n) => (ids.includes(n.id) ? { ...n, is_read: true } : n)),
      );
      Promise.all(ids.map((id) => notificationsApi.markRead(id))).catch(() =>
        queryClient.invalidateQueries({ queryKey: notificationsKey }),
      );
    },
    [queryClient],
  );

  const markRead = useCallback((id: string) => markIds([id]), [markIds]);

  const markAllRead = useCallback(() => {
    const items = queryClient.getQueryData<AppNotification[]>(notificationsKey) ?? [];
    markIds(items.filter((n) => !n.is_read).map((n) => n.id));
  }, [queryClient, markIds]);

  return { markRead, markAllRead };
}

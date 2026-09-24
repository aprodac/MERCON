/**
 * Pull-to-refresh: invalidates every query under the ['dashboard', ...] namespace,
 * plus the notifications feed behind the header's unread badge.
 */
import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { notificationsKey } from '@/features/notifications/hooks/useNotifications';

export function useDashboardRefresh() {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: notificationsKey }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [queryClient]);

  return { refreshing, refresh };
}

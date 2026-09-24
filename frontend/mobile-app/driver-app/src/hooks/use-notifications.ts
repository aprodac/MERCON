import { useCallback, useEffect, useState } from 'react';
import { notificationService } from '../services/notifications';
import type { AppNotification } from '@mercon/mobile-shared/lib/notifications';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';

/** Loads the driver's notifications with optimistic mark-as-read. Mirrors the
 *  other mobile hooks — fetch-on-mount with a manual refetch (no React Query). */
export function useNotifications() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await notificationService.list());
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  const markRead = useCallback((id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    // Optimistic — if the request fails, the next refetch corrects it.
    notificationService.markRead(id).catch(() => {});
  }, []);

  const markAll = useCallback(() => {
    setItems((prev) => {
      const unread = prev.filter((n) => !n.is_read).map((n) => n.id);
      unread.forEach((id) => notificationService.markRead(id).catch(() => {}));
      return prev.map((n) => ({ ...n, is_read: true }));
    });
  }, []);

  return { items, loading, error, refetch, markRead, markAll };
}

/**
 * Reacts to staff pushes while signed in:
 *  - a push arriving refreshes the notifications list (and the unread badge)
 *  - tapping a push (app open, in background, or cold start) opens the same
 *    page as tapping that notification in the Activity list, and marks it read
 *    (emergencies stay unread until Handled on To do, as in the list)
 */
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '@mercon/mobile-shared/lib/auth-context';
import { queryClient } from '@mercon/mobile-shared/lib/query-client';
import { getNotificationsModule } from '@mercon/mobile-shared/lib/push';
import { notificationsKey } from '@/features/notifications/hooks/useNotifications';
import { notificationsApi } from '@/features/notifications/api/notificationsApi';
import { targetFor } from '@/features/notifications/notificationModel';

// Taps already acted on — getLastNotificationResponseAsync returns the same
// response again after a remount.
const handledResponseIds = new Set<string>();

export function OperatorPushManager() {
  const router = useRouter();
  const { isLoggedIn } = useAuth();

  useEffect(() => {
    const N = getNotificationsModule();
    if (!isLoggedIn || !N) return;
    let mounted = true;

    const openFromPush = (response: any) => {
      const id = response?.notification?.request?.identifier;
      if (id) {
        if (handledResponseIds.has(id)) return;
        handledResponseIds.add(id);
      }
      const data = (response?.notification?.request?.content?.data ?? {}) as Record<string, any>;
      const type = typeof data.type === 'string' ? data.type : '';
      if (data.notificationId && type.toLowerCase() !== 'emergency') {
        notificationsApi.markRead(String(data.notificationId)).catch(() => {});
      }
      queryClient.invalidateQueries({ queryKey: notificationsKey });
      const target = targetFor({
        id: String(data.notificationId ?? ''),
        title: '',
        message: '',
        type,
        is_read: true,
        entity_type: data.entity_type ?? null,
        entity_id: data.entity_id ? String(data.entity_id) : null,
        createdAt: '',
      });
      router.push(target ?? '/notifications');
    };

    const subs: { remove: () => void }[] = [];
    try {
      N.getLastNotificationResponseAsync()
        .then((response) => {
          if (mounted && response) openFromPush(response);
        })
        .catch(() => {});
      subs.push(N.addNotificationResponseReceivedListener(openFromPush));
      subs.push(
        N.addNotificationReceivedListener(() => {
          queryClient.invalidateQueries({ queryKey: notificationsKey });
        }),
      );
    } catch (err) {
      console.warn('[OperatorPushManager] Notification listeners unavailable:', err);
    }

    return () => {
      mounted = false;
      subs.forEach((s) => s.remove());
    };
  }, [isLoggedIn, router]);

  return null;
}

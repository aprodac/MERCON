/**
 * Reacts to staff pushes while signed in:
 *  - a push arriving refreshes the notifications list (and the unread badge)
 *  - tapping a push (app open, in background, or cold start) opens the trip
 *    it's about, or the notifications screen for anything else
 */
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '@mercon/mobile-shared/lib/auth-context';
import { queryClient } from '@mercon/mobile-shared/lib/query-client';
import { getNotificationsModule } from '@mercon/mobile-shared/lib/push';
import { notificationsKey } from '@/features/notifications/hooks/useNotifications';

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
      queryClient.invalidateQueries({ queryKey: notificationsKey });
      if (data.entity_type === 'Trip' && data.entity_id) {
        router.push({ pathname: '/trip-details', params: { id: String(data.entity_id) } });
      } else {
        router.push('/notifications');
      }
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

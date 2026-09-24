/**
 * Operator notifications — shared list UI (@mercon/mobile-shared), operator API.
 * Tapping marks the notification read and, like the web dashboard, opens the
 * trip / driver / maintenance record it refers to when there is one.
 */
import { useRouter, type Href } from 'expo-router';
import SharedNotificationsScreen from '@mercon/mobile-shared/screens/NotificationsScreen';
import type { AppNotification } from '@mercon/mobile-shared/lib/notifications';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { useMarkNotificationsRead, useNotifications } from '../hooks/useNotifications';

function targetFor(n: AppNotification): Href | null {
  if (!n.entity_type) return null;
  switch (n.entity_type) {
    case 'Trip':
      return n.entity_id ? { pathname: '/trip-details', params: { id: n.entity_id } } : null;
    case 'Driver':
      return n.entity_id ? { pathname: '/driver-details', params: { id: n.entity_id } } : null;
    case 'MaintenanceRecord':
      return '/maintenance';
    default:
      return null;
  }
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { data, isLoading, isFetching, error, refetch } = useNotifications();
  const { markRead, markAllRead } = useMarkNotificationsRead();

  const handlePress = (item: AppNotification) => {
    if (!item.is_read) markRead(item.id);
    const target = targetFor(item);
    if (target) router.push(target);
  };

  return (
    <SharedNotificationsScreen
      items={data ?? []}
      loading={isLoading || isFetching}
      error={error ? getApiErrorMessage(error) : null}
      onRefresh={() => refetch()}
      onPressItem={handlePress}
      onMarkAllRead={markAllRead}
    />
  );
}

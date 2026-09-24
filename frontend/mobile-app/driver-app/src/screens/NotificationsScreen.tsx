/** Driver notifications feed — shared list UI, driver API (/mobile/notifications). */
import SharedNotificationsScreen from '@mercon/mobile-shared/screens/NotificationsScreen';
import { useNotifications } from '../hooks/use-notifications';

export default function NotificationsScreen() {
  const { items, loading, error, refetch, markRead, markAll } = useNotifications();
  return (
    <SharedNotificationsScreen
      items={items}
      loading={loading}
      error={error}
      onRefresh={refetch}
      onPressItem={(item) => markRead(item.id)}
      onMarkAllRead={markAll}
    />
  );
}

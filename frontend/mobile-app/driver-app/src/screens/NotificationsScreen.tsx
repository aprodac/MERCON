/** Driver notifications feed — shared list UI, driver API (/mobile/notifications). */
import SharedNotificationsScreen from '@mercon/mobile-shared/screens/NotificationsScreen';
import { useMemo } from 'react';
import { useLanguage } from '@mercon/mobile-shared/lib/language-context';
import { useNotifications } from '../hooks/use-notifications';
import { localizeNotification } from '../utils/notificationText';

export default function NotificationsScreen() {
  const { items, loading, error, refetch, markRead, markAll } = useNotifications();
  const { language } = useLanguage();
  // The server writes them in English; show them in the driver's language.
  const shown = useMemo(() => items.map((n) => localizeNotification(n, language)), [items, language]);
  return (
    <SharedNotificationsScreen
      items={shown}
      loading={loading}
      error={error}
      onRefresh={refetch}
      onPressItem={(item) => markRead(item.id)}
      onMarkAllRead={markAll}
    />
  );
}

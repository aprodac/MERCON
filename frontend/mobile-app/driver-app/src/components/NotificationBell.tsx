/** Home header bell: opens the Notifications list, red count = unread. */
import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Bell } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useLanguage } from '@mercon/mobile-shared/lib/language-context';
import { useNotifications } from '../hooks/use-notifications';

export function NotificationBell() {
  const router = useRouter();
  const { t } = useLanguage();
  const { items } = useNotifications();
  const unread = items.filter((n) => !n.is_read).length;

  return (
    <TouchableOpacity
      style={styles.bell}
      activeOpacity={0.8}
      onPress={() => router.push('/notifications' as any)}
      accessibilityRole="button"
      accessibilityLabel={
        unread > 0
          ? `${t('nav_notifications', 'Notifications')}, ${t('label_unread_count', '{count} unread').replace('{count}', String(unread))}`
          : t('nav_notifications', 'Notifications')
      }
      hitSlop={6}
    >
      <Bell size={18} color="#3E3C3D" strokeWidth={2.2} />
      {unread > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  bell: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
});

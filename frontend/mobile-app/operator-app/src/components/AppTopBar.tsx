/**
 * The one top bar every main operator page uses, so the menu, title and bell
 * are always in the same place:
 *
 *   [☰]  MERCON  (Home)   or   Page title (every other page)   [page actions] [🔔]
 *
 * ☰ opens the side drawer (owned here, so pages don't each wire their own),
 * the bell opens notifications and shows a dot for unread ones. Pages pass
 * their own icon buttons (search, filter, add…) through `actions`.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Bell, Menu, type LucideIcon } from 'lucide-react-native';
import { useNotifications } from '@/features/notifications/hooks/useNotifications';
import { OperatorSidebarDrawer } from './OperatorSidebarDrawer';

const FG = '#18181B';
const BORDER = '#E9E9EC';

export interface TopBarAction {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  /** Small dot on the icon, e.g. a filter is applied. */
  active?: boolean;
}

interface AppTopBarProps {
  /** Page title. Leave out on Home to show the MERCON brand instead. */
  title?: string;
  actions?: TopBarAction[];
  /** Hide the bell (on the notifications page itself). */
  hideBell?: boolean;
}

export function AppTopBar({ title, actions = [], hideBell }: AppTopBarProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const notifications = useNotifications();
  const unread = notifications.data?.filter((n) => !n.is_read).length ?? 0;

  return (
    <>
      <View style={s.bar}>
        <IconBtn icon={Menu} label="Open menu" onPress={() => setMenuOpen(true)} />

        {title ? (
          <Text style={s.title} numberOfLines={1}>{title}</Text>
        ) : (
          <View style={s.brand}>
            <Image source={require('@mercon/mobile-shared/assets/images/merconclosed.png')} style={s.mark} resizeMode="contain" accessibilityLabel="MERCON" />
            <Text style={s.word}>MERCON</Text>
          </View>
        )}

        {actions.map((a) => <IconBtn key={a.label} icon={a.icon} label={a.label} onPress={a.onPress} dot={a.active} />)}
        {hideBell ? null : (
          <IconBtn
            icon={Bell}
            label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
            onPress={() => router.push('/notifications')}
            dot={unread > 0}
            dotColor="#F04438"
          />
        )}
      </View>
      <OperatorSidebarDrawer visible={menuOpen} onClose={() => setMenuOpen(false)} side="left" />
    </>
  );
}

function IconBtn({ icon: Icon, label, onPress, dot, dotColor = FG }: { icon: LucideIcon; label: string; onPress: () => void; dot?: boolean; dotColor?: string }) {
  return (
    <TouchableOpacity style={s.btn} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} activeOpacity={0.7} hitSlop={4}>
      <Icon size={19} color={FG} strokeWidth={2} />
      {dot ? <View style={[s.dot, { backgroundColor: dotColor }]} /> : null}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 56, paddingHorizontal: 16 },
  btn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: BORDER },
  title: { flex: 1, fontSize: 20, fontWeight: '700', color: FG, letterSpacing: -0.3, marginLeft: 4 },
  brand: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 4 },
  mark: { width: 36, height: 24 },
  word: { fontSize: 15, fontWeight: '700', color: FG, letterSpacing: 1.5 },
  dot: { position: 'absolute', top: 8, right: 9, width: 9, height: 9, borderRadius: 5, borderWidth: 2, borderColor: '#FFFFFF' },
});

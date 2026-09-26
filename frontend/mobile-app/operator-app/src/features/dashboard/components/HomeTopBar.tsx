/**
 * Home top bar: menu (opens the side drawer), the MERCON mark — the same
 * image as the web dashboard's sidebar — and notifications. Sign out lives in
 * the drawer.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Bell, Menu } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';

const INK = '#2B2A2B';

export function HomeTopBar({ unread, onMenu, onNotifications }: { unread: number; onMenu: () => void; onNotifications: () => void }) {
  return (
    <View style={s.bar}>
      <TouchableOpacity style={s.btn} onPress={onMenu} accessibilityRole="button" accessibilityLabel="Open menu" activeOpacity={0.75}>
        <Menu size={21} color={INK} strokeWidth={2.2} />
      </TouchableOpacity>

      <View style={s.brand}>
        <Image source={require('@mercon/mobile-shared/assets/images/merconclosed.png')} style={s.mark} resizeMode="contain" accessibilityLabel="MERCON" />
        <Text style={s.word}>MERCON</Text>
      </View>

      <TouchableOpacity
        style={s.btn}
        onPress={onNotifications}
        accessibilityRole="button"
        accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        activeOpacity={0.75}
      >
        <Bell size={20} color={INK} strokeWidth={2.2} />
        {unread > 0 ? (
          <View style={s.badge}>
            <Text style={s.badgeText}>{unread > 99 ? '99+' : unread}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 52 },
  btn: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#EEF0F4',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mark: { width: 42, height: 28 },
  word: { fontSize: 17, fontWeight: '900', color: INK, letterSpacing: 2 },
  badge: {
    position: 'absolute', top: -4, right: -4, minWidth: 19, height: 19, borderRadius: 10, paddingHorizontal: 4,
    backgroundColor: '#D92D20', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#F4F5F8',
  },
  badgeText: { color: Colors.white, fontSize: 10, fontWeight: '800' },
});

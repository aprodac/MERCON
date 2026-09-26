/**
 * Home top bar: menu (opens the side drawer), the MERCON mark — the same
 * image as the web dashboard's sidebar — search and notifications.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Bell, Menu, Search } from 'lucide-react-native';

const FG = '#18181B';
const BORDER = '#E4E4E7';

export function HomeTopBar({ unread, onMenu, onSearch, onNotifications }: {
  unread: number; onMenu: () => void; onSearch: () => void; onNotifications: () => void;
}) {
  return (
    <View style={s.bar}>
      <TouchableOpacity style={s.btn} onPress={onMenu} accessibilityRole="button" accessibilityLabel="Open menu" activeOpacity={0.7}>
        <Menu size={19} color={FG} strokeWidth={2} />
      </TouchableOpacity>

      <View style={s.brand}>
        <Image source={require('@mercon/mobile-shared/assets/images/merconclosed.png')} style={s.mark} resizeMode="contain" accessibilityLabel="MERCON" />
        <Text style={s.word}>MERCON</Text>
      </View>

      <TouchableOpacity style={s.btn} onPress={onSearch} accessibilityRole="button" accessibilityLabel="Search trips" activeOpacity={0.7}>
        <Search size={18} color={FG} strokeWidth={2} />
      </TouchableOpacity>
      <TouchableOpacity
        style={s.btn}
        onPress={onNotifications}
        accessibilityRole="button"
        accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        activeOpacity={0.7}
      >
        <Bell size={18} color={FG} strokeWidth={2} />
        {unread > 0 ? <View style={s.dot} /> : null}
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 52 },
  btn: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: BORDER },
  brand: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 4 },
  mark: { width: 36, height: 24 },
  word: { fontSize: 15, fontWeight: '700', color: FG, letterSpacing: 1.5 },
  dot: { position: 'absolute', top: 8, right: 9, width: 9, height: 9, borderRadius: 5, backgroundColor: '#F04438', borderWidth: 2, borderColor: '#FFFFFF' },
});

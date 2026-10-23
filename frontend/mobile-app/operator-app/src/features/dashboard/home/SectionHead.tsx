/**
 * The one heading every Home section uses: title, an optional count, and an
 * optional link on the right ("All 3 on the road ›").
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { INK, MUTED, tap } from '../../notifications/components/parts';

export function SectionHead({ title, count, link, onLink }: { title: string; count?: number | null; link?: string; onLink?: () => void }) {
  return (
    <View style={s.head}>
      <Text style={s.h2} accessibilityRole="header">{title}</Text>
      {count != null && count > 0 ? <View style={s.count}><Text style={s.countText}>{count}</Text></View> : null}
      <View style={{ flex: 1 }} />
      {link && onLink ? (
        <TouchableOpacity onPress={() => { tap(); onLink(); }} hitSlop={8} style={s.link} accessibilityRole="button">
          <Text style={s.linkText}>{link}</Text>
          <ChevronRight size={15} color={MUTED} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 2, minHeight: 28 },
  h2: { fontSize: 18, fontWeight: '700', color: INK, letterSpacing: -0.3 },
  count: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E9E9EC' },
  countText: { fontSize: 12, fontWeight: '700', color: INK, fontVariant: ['tabular-nums'] },
  link: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  linkText: { fontSize: 14, fontWeight: '500', color: MUTED },
});

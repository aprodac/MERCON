/**
 * The status filter above a list: one slim pill per status (dot, label, small
 * count), scrolling sideways when they don't fit. The selected pill is
 * charcoal. Used by every list page instead of big number tiles.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors, Radius } from '@mercon/mobile-shared/theme/tokens';

export interface FilterChip<K> {
  key: K;
  label: string;
  /** Shown after the label; leave out for no count. */
  count?: string | number;
  dot?: string;
}

export function FilterChips<K extends string | null>({ items, value, onChange }: { items: FilterChip<K>[]; value: K; onChange: (key: K) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row} style={s.bleed} keyboardShouldPersistTaps="handled">
      {items.map((item) => {
        const active = item.key === value;
        return (
          <TouchableOpacity
            key={item.label}
            style={[s.chip, active && s.chipOn]}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); onChange(item.key); }}
          >
            {item.dot ? <View style={[s.dot, { backgroundColor: item.dot }]} /> : null}
            <Text style={[s.label, active && { color: Colors.white }]}>{item.label}</Text>
            {item.count == null ? null : <Text style={[s.count, active && { color: 'rgba(255,255,255,0.7)' }]}>{item.count}</Text>}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  // Pills run to the screen edge; the list's own 16px padding is cancelled here.
  bleed: { marginHorizontal: -16 },
  row: { gap: 8, paddingHorizontal: 16 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, paddingHorizontal: 14, borderRadius: Radius.full, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.coolGray },
  chipOn: { backgroundColor: Colors.charcoal, borderColor: Colors.charcoal },
  dot: { width: 7, height: 7, borderRadius: 4 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.charcoal },
  count: { fontSize: 13, fontWeight: '700', color: Colors.gray400, fontVariant: ['tabular-nums'] },
});

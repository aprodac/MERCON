/** Small pieces both Notifications tabs use: filter chips, section labels, empty and loading states. */
import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { LucideIcon } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';

export const INK = '#3E3C3D';
export const MUTED = '#6B6B76';
export const LINE = '#E9E9EC';
export const BG = '#F6F6F7';

export const tap = () => Haptics.selectionAsync().catch(() => {});

export function Chips<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={p.chips} style={{ flexGrow: 0 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <TouchableOpacity
            key={o.value}
            style={[p.chip, on && p.chipOn]}
            onPress={() => { tap(); onChange(o.value); }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
          >
            <Text style={[p.chipText, on && p.chipTextOn]}>{o.label}</Text>
            {o.count ? <Text style={[p.chipCount, on && p.chipCountOn]}>{o.count}</Text> : null}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

export function SectionLabel({ title, count, tone, right }: { title: string; count?: number; tone?: 'red'; right?: React.ReactNode }) {
  return (
    <View style={p.sectionRow}>
      <Text style={[p.section, tone === 'red' && { color: '#D92D20' }]}>{title}</Text>
      {count != null ? <Text style={p.sectionCount}>{count}</Text> : null}
      <View style={{ flex: 1 }} />
      {right}
    </View>
  );
}

export function EmptyState({ icon: Icon, color = '#A1A1AA', title, text }: { icon: LucideIcon; color?: string; title: string; text: string }) {
  return (
    <View style={p.empty}>
      <View style={p.emptyIcon}><Icon size={26} color={color} strokeWidth={2} /></View>
      <Text style={p.emptyTitle}>{title}</Text>
      <Text style={p.emptyText}>{text}</Text>
    </View>
  );
}

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <View style={p.card}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={[p.skelRow, i > 0 && p.rowBorder]}>
          <View style={[p.skel, { width: 36, height: 36, borderRadius: 10 }]} />
          <View style={{ flex: 1, gap: 7 }}>
            <View style={[p.skel, { width: '70%', height: 13 }]} />
            <View style={[p.skel, { width: '45%', height: 11 }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

export const p = StyleSheet.create({
  chips: { gap: 6, paddingHorizontal: 16 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 13, borderRadius: 17, backgroundColor: Colors.white, borderWidth: 1, borderColor: LINE },
  chipOn: { backgroundColor: INK, borderColor: INK },
  chipText: { fontSize: 13, fontWeight: '600', color: '#3F3F46' },
  chipTextOn: { color: Colors.white },
  chipCount: { fontSize: 13, fontWeight: '500', color: MUTED, fontVariant: ['tabular-nums'] },
  chipCountOn: { color: 'rgba(255,255,255,0.7)' },

  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4, marginBottom: 8 },
  section: { fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.6, textTransform: 'uppercase' },
  sectionCount: { fontSize: 12, fontWeight: '600', color: '#A1A1AA', fontVariant: ['tabular-nums'] },

  card: { backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: LINE, overflow: 'hidden' },
  rowBorder: { borderTopWidth: 1, borderTopColor: '#F1F1F3' },
  skelRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  skel: { backgroundColor: '#EDEDF0', borderRadius: 6 },

  empty: { alignItems: 'center', paddingTop: 56, paddingHorizontal: 32, gap: 6 },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.white, borderWidth: 1, borderColor: LINE, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: INK },
  emptyText: { fontSize: 14, color: MUTED, textAlign: 'center', lineHeight: 20 },
});

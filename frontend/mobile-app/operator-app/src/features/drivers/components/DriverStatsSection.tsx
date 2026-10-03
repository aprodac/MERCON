import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ErrorState } from '@mercon/mobile-shared/ui';
import { useDriverStats } from '../hooks';
import type { DriverStatus } from '../types';

interface DriverStatsSectionProps {
  /** The list's status filter — null is "all drivers". */
  status: DriverStatus | null;
  onSelect: (status: DriverStatus | null) => void;
}

/**
 * The fleet's drivers at a glance, and the list's status filter in one: four
 * tiles with a count each; tap one to show only those drivers.
 */
export function DriverStatsSection({ status, onSelect }: DriverStatsSectionProps) {
  const stats = useDriverStats();

  if (stats.error) {
    return <ErrorState message={stats.error} onRetry={() => stats.refresh()} />;
  }

  const cells: { value: DriverStatus | null; label: string; count: number; dot?: string }[] = [
    { value: null, label: 'All', count: stats.totalDrivers },
    { value: 'Available', label: 'Available', count: stats.online, dot: '#1F9D55' },
    { value: 'OnTrip', label: 'On trip', count: stats.onTrip, dot: '#2F5FD0' },
    { value: 'OffDuty', label: 'Offline', count: stats.offline, dot: '#9898A4' },
  ];

  return (
    <View style={s.row}>
      {cells.map((c) => {
        const on = status === c.value;
        return (
          <TouchableOpacity
            key={c.label}
            style={[s.tile, on && s.tileOn]}
            activeOpacity={0.8}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); onSelect(c.value); }}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${c.label}, ${c.count}`}
          >
            {stats.loading ? <View style={s.skel} /> : <Text style={[s.value, on && s.onText]}>{c.count.toLocaleString()}</Text>}
            <View style={s.labelRow}>
              {c.dot ? <View style={[s.dot, { backgroundColor: c.dot }]} /> : null}
              <Text style={[s.label, on && s.onLabel]} numberOfLines={1}>{c.label}</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#E9E9EC', paddingVertical: 12, paddingHorizontal: 10, gap: 3 },
  tileOn: { backgroundColor: '#18181B', borderColor: '#18181B' },
  value: { fontSize: 20, fontWeight: '700', color: '#18181B', fontVariant: ['tabular-nums'], letterSpacing: -0.3 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontSize: 12, color: '#6B6B76', flexShrink: 1 },
  onText: { color: '#FFFFFF' },
  onLabel: { color: '#D4D4D8' },
  skel: { width: 28, height: 22, borderRadius: 6, backgroundColor: '#EDEDF0', marginBottom: 2 },
});

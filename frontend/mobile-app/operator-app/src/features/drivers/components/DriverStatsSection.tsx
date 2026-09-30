import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ErrorState } from '@mercon/mobile-shared/ui';
import { useDriverStats } from '../hooks';

/**
 * The fleet's drivers at a glance — one card split into four counts, the same
 * shape as Home's status card so the two pages read as one app.
 */
export function DriverStatsSection() {
  const stats = useDriverStats();

  if (stats.error) {
    return <ErrorState message={stats.error} onRetry={() => stats.refresh()} />;
  }

  const cells = [
    { key: 'total', label: 'Drivers', value: stats.totalDrivers, color: '#18181B' },
    { key: 'free', label: 'Available', value: stats.online, color: '#067647' },
    { key: 'trip', label: 'On trip', value: stats.onTrip, color: '#1D4ED8' },
    { key: 'off', label: 'Offline', value: stats.offline, color: '#6B6B76' },
  ];

  return (
    <View style={s.card}>
      {cells.map((c, i) => (
        <View key={c.key} style={[s.cell, i > 0 && s.border]}>
          {stats.loading ? <View style={s.skel} /> : <Text style={[s.value, { color: c.color }]}>{c.value.toLocaleString()}</Text>}
          <Text style={s.label} numberOfLines={1}>{c.label}</Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E9E9EC', paddingVertical: 14 },
  cell: { flex: 1, alignItems: 'center', gap: 2 },
  border: { borderLeftWidth: 1, borderLeftColor: '#EDEDF0' },
  value: { fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'], letterSpacing: -0.3 },
  label: { fontSize: 12, color: '#6B6B76' },
  skel: { width: 28, height: 22, borderRadius: 6, backgroundColor: '#EDEDF0', marginBottom: 2 },
});

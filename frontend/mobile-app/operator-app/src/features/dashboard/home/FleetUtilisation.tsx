/**
 * "Fleet utilisation": how much of the fleet is working. Today / Week / Month
 * switches the ring — the share of trucks that ran at least one trip in the
 * period (on a trip right now when the company has the Reports module off).
 * Next to it, the fleet right now as one bar: on trip · free · maintenance ·
 * other. Below, one card per body type (Box, Reefer, …) with the same figures.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { useFleetUtilization } from '../hooks/useFleetUtilization';
import { CircularProgress } from '../components/CircularProgress';
import { FleetUtilizationCard } from '../components/FleetUtilizationCard';
import { SegmentControl } from '../components/SegmentControl';
import type { FleetPeriod } from '../types';
import { INK, LINE, MUTED, tap } from '../../notifications/components/parts';

const PERIODS: { value: FleetPeriod; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];
const IN_PERIOD: Record<FleetPeriod, string> = { today: 'today', week: 'in the last 7 days', month: 'in the last month' };

const BLUE = '#2563EB';
const GREEN = '#16A34A';
const AMBER = '#D97706';
const GREY = '#C4C4CC';

export function FleetUtilisation({ onAll }: { onAll: () => void }) {
  const [period, setPeriod] = useState<FleetPeriod>('today');
  const { data, isLoading, isError, refetch } = useFleetUtilization(period);

  if (!isLoading && !isError && (!data || data.totals.totalTrucks === 0)) return null;

  const t = data?.totals;
  const other = t ? Math.max(0, t.totalTrucks - t.inUse - t.idle - t.maintenance) : 0;
  const parts = t
    ? [
      { label: 'On trip', count: t.inUse, color: BLUE },
      { label: 'Free', count: t.idle, color: GREEN },
      { label: 'Maintenance', count: t.maintenance, color: AMBER },
      { label: 'Other', count: other, color: GREY },
    ].filter((p) => p.count > 0)
    : [];

  return (
    <View style={{ gap: 10 }}>
      <View style={s.head}>
        <Text style={s.h2}>Fleet utilisation</Text>
        <TouchableOpacity onPress={() => { tap(); onAll(); }} hitSlop={8} style={s.link}>
          <Text style={s.linkText}>All trucks</Text>
          <ChevronRight size={15} color={MUTED} />
        </TouchableOpacity>
      </View>

      <SegmentControl options={PERIODS} value={period} onChange={(p) => { tap(); setPeriod(p); }} className="self-start" />

      {isError ? (
        <TouchableOpacity style={s.card} onPress={() => { tap(); refetch(); }} activeOpacity={0.8}>
          <Text style={s.muted}>{"Couldn't load utilisation. Tap to retry."}</Text>
        </TouchableOpacity>
      ) : !data || !t ? (
        <View style={[s.card, { height: 132 }]} />
      ) : (
        <>
          <View style={[s.card, s.summary]}>
            <CircularProgress progress={data.fromTrips ? t.periodUtilization : t.overallUtilization} size={92} strokeWidth={9} label="Used" />
            <View style={{ flex: 1, gap: 10 }}>
              <Text style={s.lead}>
                <Text style={s.big}>{data.fromTrips ? t.activeInPeriod : t.inUse}</Text>
                <Text style={s.muted}> of {t.totalTrucks} trucks</Text>
              </Text>
              <Text style={s.sub} numberOfLines={2}>{data.fromTrips ? `ran a trip ${IN_PERIOD[period]}` : 'on a trip right now'}</Text>

              <View style={s.bar}>
                {parts.map((p) => <View key={p.label} style={{ flex: p.count, backgroundColor: p.color }} />)}
              </View>
              <View style={s.legend}>
                {parts.map((p) => (
                  <View key={p.label} style={s.legendItem}>
                    <View style={[s.dot, { backgroundColor: p.color }]} />
                    <Text style={s.legendText}>{p.label} <Text style={s.legendCount}>{p.count}</Text></Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          {data.categories.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.bleed} contentContainerStyle={s.strip}>
              {data.categories.map((c) => <FleetUtilizationCard key={c.assetType} category={c} />)}
            </ScrollView>
          ) : null}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  h2: { fontSize: 17, fontWeight: '700', color: INK, letterSpacing: -0.2 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  linkText: { fontSize: 14, fontWeight: '500', color: MUTED },

  card: { backgroundColor: Colors.white, borderRadius: 22, borderWidth: 1, borderColor: LINE, padding: 16 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  lead: { fontSize: 14 },
  big: { fontSize: 22, fontWeight: '800', color: INK, fontVariant: ['tabular-nums'] },
  muted: { fontSize: 13, color: MUTED },
  sub: { fontSize: 13, color: MUTED, marginTop: -8 },
  bar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: '#F1F1F3', gap: 2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, rowGap: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  legendText: { fontSize: 12, color: MUTED },
  legendCount: { fontWeight: '700', color: INK },

  // Bleed to the screen edges so the strip scrolls under the page padding.
  bleed: { marginHorizontal: -16, flexGrow: 0 },
  strip: { gap: 10, paddingHorizontal: 16 },
});

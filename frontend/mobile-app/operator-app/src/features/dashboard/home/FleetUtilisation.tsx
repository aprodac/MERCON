/**
 * "Fleet utilisation": how much of the fleet is working, in one card.
 *   Folded (default)  the share of trucks that ran a trip today as a big
 *                     figure, the fleet right now as one bar (on trip · free ·
 *                     maintenance · other) and its legend.
 *   Open              the same card grows: Today / Week / Month for the share,
 *                     and one row per body type (Box, Reefer, …) with its own
 *                     bar and share.
 * The share falls back to "on a trip right now" when the company has the
 * Reports module off. The phone remembers open / folded (owner, 23 Oct).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, LayoutAnimation } from 'react-native';
import { ChevronDown, Truck } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { safeSecureStore } from '@mercon/mobile-shared/lib/secure-store';
import { useFleetUtilization } from '../hooks/useFleetUtilization';
import type { FleetCategoryUtilization, FleetPeriod } from '../types';
import { INK, LINE, MUTED, tap } from '../../notifications/components/parts';
import { SectionHead } from './SectionHead';

const PERIODS: { value: FleetPeriod; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];
const IN_PERIOD: Record<FleetPeriod, string> = { today: 'today', week: 'in the last 7 days', month: 'in the last month' };
const PERIOD_SHORT: Record<FleetPeriod, string> = { today: 'today', week: 'this week', month: 'this month' };

/** Whether the utilisation card was left open on this phone. */
const EXPANDED_KEY = 'home.utilisation.expanded';

const BLUE = '#2563EB';
const GREEN = '#16A34A';
const AMBER = '#D97706';
const GREY = '#C4C4CC';
const CORAL = '#FA634E';

const pct = (x: number) => `${Math.round(Math.max(0, Math.min(1, x)) * 100)}%`;

/** The fleet as one bar: a segment per state, sized by its count. */
function SplitBar({ parts, height }: { parts: { label: string; count: number; color: string }[]; height: number }) {
  return (
    <View style={[s.bar, { height, borderRadius: height / 2 }]}>
      {parts.map((p) => <View key={p.label} style={{ flex: p.count, backgroundColor: p.color }} />)}
    </View>
  );
}

function TypeRow({ c }: { c: FleetCategoryUtilization }) {
  const other = Math.max(0, c.totalTrucks - c.inUse - c.idle - c.maintenance);
  const parts = [
    { label: 'On trip', count: c.inUse, color: BLUE },
    { label: 'Free', count: c.idle, color: GREEN },
    { label: 'Maintenance', count: c.maintenance, color: AMBER },
    { label: 'Other', count: other, color: GREY },
  ].filter((p) => p.count > 0);
  return (
    <View style={s.typeRow}>
      <View style={s.typeIcon}><Truck size={16} color={CORAL} strokeWidth={2.2} /></View>
      <View style={{ flex: 1, gap: 6, minWidth: 0 }}>
        <View style={s.typeHead}>
          <Text style={s.typeName} numberOfLines={1}>{c.assetType}</Text>
          <Text style={s.typeMeta}>{c.activeInPeriod} of {c.totalTrucks}</Text>
        </View>
        <SplitBar parts={parts} height={6} />
      </View>
      <Text style={s.typePct}>{pct(c.utilization)}</Text>
    </View>
  );
}

export function FleetUtilisation({ onAll }: { onAll: () => void }) {
  const [period, setPeriod] = useState<FleetPeriod>('today');
  const { data, isLoading, isError, refetch } = useFleetUtilization(period);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    let live = true;
    safeSecureStore.getItemAsync(EXPANDED_KEY).then((v) => { if (live && v === '1') setExpanded(true); }).catch(() => {});
    return () => { live = false; };
  }, []);
  const toggle = () => {
    tap();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const next = !expanded;
    setExpanded(next);
    // Folded shows today; opening again starts from today too.
    if (!next) setPeriod('today');
    safeSecureStore.setItemAsync(EXPANDED_KEY, next ? '1' : '0').catch(() => {});
  };

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
  const share = data && t ? (data.fromTrips ? t.periodUtilization : t.overallUtilization) : 0;
  const working = data && t ? (data.fromTrips ? t.activeInPeriod : t.inUse) : 0;

  return (
    <View style={{ gap: 10 }}>
      <SectionHead title="Fleet utilisation" link="All trucks" onLink={onAll} />

      {isError ? (
        <TouchableOpacity style={s.card} onPress={() => { tap(); refetch(); }} activeOpacity={0.8}>
          <Text style={s.muted}>{"Couldn't load utilisation. Tap to retry."}</Text>
        </TouchableOpacity>
      ) : !data || !t ? (
        <View style={[s.card, { height: expanded ? 220 : 128 }]} />
      ) : (
        <View style={s.card}>
          <TouchableOpacity style={s.top} onPress={toggle} activeOpacity={0.7} accessibilityRole="button" accessibilityState={{ expanded }}
            accessibilityLabel={`${pct(share)} of the fleet used ${PERIOD_SHORT[period]}. ${expanded ? 'Fold' : 'Open'}`}>
            <Text style={s.big}>{pct(share)}</Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.lead} numberOfLines={1}>{data.fromTrips ? `fleet used ${PERIOD_SHORT[period]}` : 'of the fleet on a trip'}</Text>
              <Text style={s.muted} numberOfLines={1}>
                {working} of {t.totalTrucks} trucks {data.fromTrips ? `ran a trip ${IN_PERIOD[period]}` : 'right now'}
              </Text>
            </View>
            <View style={[s.chev, expanded && { transform: [{ rotate: '180deg' }] }]}>
              <ChevronDown size={17} color={CORAL} />
            </View>
          </TouchableOpacity>

          {expanded ? (
            <View style={s.periods}>
              {PERIODS.map((p) => (
                <TouchableOpacity key={p.value} style={[s.period, period === p.value && s.periodOn]} onPress={() => { tap(); setPeriod(p.value); }}
                  accessibilityRole="radio" accessibilityState={{ selected: period === p.value }}>
                  <Text style={[s.periodText, period === p.value && s.periodTextOn]}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          <View style={{ gap: 8 }}>
            <Text style={s.caption}>Right now</Text>
            <SplitBar parts={parts} height={10} />
            <View style={s.legend}>
              {parts.map((p) => (
                <View key={p.label} style={s.legendItem}>
                  <View style={[s.dot, { backgroundColor: p.color }]} />
                  <Text style={s.legendText}>{p.label}</Text>
                  <Text style={s.legendCount}>{p.count}</Text>
                </View>
              ))}
            </View>
          </View>

          {expanded && data.categories.length > 1 ? (
            <View style={s.types}>
              <Text style={s.caption}>By body type</Text>
              {data.categories.map((c) => <TypeRow key={c.assetType} c={c} />)}
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: Colors.white, borderRadius: 22, borderWidth: 1, borderColor: LINE, padding: 16, gap: 16 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  big: { fontSize: 32, fontWeight: '800', color: CORAL, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  lead: { fontSize: 15, fontWeight: '700', color: INK },
  muted: { fontSize: 12, color: MUTED, marginTop: 1 },
  chev: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF0EB' },
  caption: { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.6, textTransform: 'uppercase' },
  bar: { flexDirection: 'row', overflow: 'hidden', backgroundColor: '#F1F1F3', gap: 2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, color: MUTED },
  legendCount: { fontSize: 12, fontWeight: '700', color: INK, fontVariant: ['tabular-nums'] },

  periods: { flexDirection: 'row', backgroundColor: '#F1F2F6', borderRadius: 12, padding: 3, gap: 3 },
  period: { flex: 1, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  periodOn: { backgroundColor: Colors.white, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  periodText: { fontSize: 13, fontWeight: '700', color: MUTED },
  periodTextOn: { color: INK },

  types: { gap: 12, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 14 },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  typeIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF0EB' },
  typeHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  typeName: { flexShrink: 1, fontSize: 14, fontWeight: '700', color: INK },
  typeMeta: { fontSize: 12, color: MUTED, fontVariant: ['tabular-nums'] },
  typePct: { width: 44, textAlign: 'right', fontSize: 14, fontWeight: '800', color: INK, fontVariant: ['tabular-nums'] },
});

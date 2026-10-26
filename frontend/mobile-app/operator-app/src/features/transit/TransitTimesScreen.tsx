/**
 * Route: /transit-times?customerId=…&customerName=… — Customers › <customer> › Transit times.
 * Each route of the customer with what Create trip plans against how long the
 * finished trips really took (loading departure → offload arrival).
 */
import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight } from 'lucide-react-native';
import { TRUCK_CLASSES } from '@mercon/shared-types';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { EmptyState, SkeletonBlock } from '@mercon/mobile-shared/ui';
import { PageTitle } from '@/components/pageCues';
import { operatorService, type TransitRow } from '../../lib/operator';
import { Card, INK, MUTED, PAGE, tap } from '../trips/details/components/parts';
import { niceName } from '../trips/create/components/ui';
import { PERIOD_OPTIONS, TONE, hm, skippedText } from './transitModel';

export default function TransitTimesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { customerId, customerName } = useLocalSearchParams<{ customerId: string; customerName?: string }>();
  const cid = String(customerId ?? '');
  const [size, setSize] = useState<string | null>(null);
  const [days, setDays] = useState<number>(30);
  const q = useQuery({ queryKey: ['transit', cid, size, days], queryFn: () => operatorService.transitTimes(cid, { size, days }), enabled: !!cid });
  const data = q.data;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/customers'));
  const open = (r: TransitRow) => router.push({ pathname: '/transit-route', params: { customerId: cid, customerName: customerName ?? '', routeKey: r.key, days: String(days) } });
  const skipped = data ? skippedText(data.skipped) : null;

  return (
    <View style={s.page}>
      <View style={[s.bar, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity style={s.barBtn} onPress={back} accessibilityLabel="Back"><ArrowLeft size={20} color={INK} strokeWidth={2.4} /></TouchableOpacity>
        <PageTitle title="Transit times" />
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={s.body} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}>
        {customerName ? <Text style={s.customer}>{niceName(String(customerName))}</Text> : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          {[null, ...TRUCK_CLASSES].map((c) => (
            <Pill key={c ?? 'all'} label={c ?? 'All sizes'} on={size === c} onPress={() => setSize(c)} />
          ))}
        </ScrollView>
        <View style={s.chips}>
          {PERIOD_OPTIONS.map((d) => <Pill key={d} label={`${d} days`} on={days === d} onPress={() => setDays(d)} />)}
        </View>

        <View style={s.kpis}>
          <Kpi label="Routes" value={data ? String(data.kpis.routes) : '—'} />
          <Kpi label="On time" value={data?.kpis.onTimePct != null ? `${data.kpis.onTimePct}%` : '—'} />
          <Kpi label="Avg late" value={data?.kpis.avgLateMin != null ? hm(data.kpis.avgLateMin) : '—'} />
        </View>

        {q.isLoading ? (
          <View style={{ gap: 10 }}><SkeletonBlock height={84} radius={16} /><SkeletonBlock height={84} radius={16} /></View>
        ) : q.isError ? (
          <EmptyState title="Couldn’t load transit times" subtitle="Pull down to try again." />
        ) : !data?.routes.length ? (
          <EmptyState title="No finished trips yet" subtitle="Routes show here once this customer’s trips have been delivered with real times." />
        ) : (
          data.routes.map((r) => <RouteCard key={r.key} r={r} onPress={() => { tap(); open(r); }} />)
        )}
        {skipped ? <Text style={s.skipped}>{skipped}</Text> : null}
        <Text style={s.note}>Green: at most 15 min over the planned time · amber: up to 1 h over · red: more.</Text>
      </ScrollView>
    </View>
  );
}

function Pill({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={() => { tap(); onPress(); }} style={[s.pill, on && s.pillOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
      <Text style={[s.pillText, on && s.pillTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.kpi}>
      <Text style={s.kpiValue}>{value}</Text>
      <Text style={s.kpiLabel}>{label}</Text>
    </View>
  );
}

export function RouteCard({ r, onPress }: { r: TransitRow; onPress: () => void }) {
  const tone = r.tone ? TONE[r.tone] : null;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} accessibilityRole="button">
      <Card style={{ padding: 14, gap: 10 }}>
        <View style={s.rowTop}>
          <Text style={s.route} numberOfLines={2}>{`${niceName(r.from)} → ${niceName(r.to)}`}{r.leg === 'return' ? <Text style={s.ret}>{' · return'}</Text> : null}</Text>
          <View style={s.sizeChip}><Text style={s.sizeText}>{r.size}</Text></View>
          <ChevronRight size={18} color={MUTED} />
        </View>
        {r.trips === 0 ? (
          <Text style={s.none}>No trips yet · planned {hm(r.plannedMin)}</Text>
        ) : (
          <View style={s.nums}>
            <View style={s.num}><Text style={s.numLabel}>Planned</Text><Text style={s.numValue}>{hm(r.plannedMin)}</Text></View>
            <View style={s.num}>
              <Text style={s.numLabel}>Actual avg</Text>
              <View style={[s.actual, tone && { backgroundColor: tone.bg }]}><Text style={[s.numValue, tone && { color: tone.fg }]}>{hm(r.actualAvgMin)}</Text></View>
            </View>
            <View style={s.num}><Text style={s.numLabel}>Trips</Text><Text style={s.numValue}>{r.trips}</Text></View>
          </View>
        )}
      </Card>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: PAGE },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  barBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E9E9EC' },
  body: { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  customer: { fontSize: 13, fontWeight: '700', color: MUTED },
  chips: { flexDirection: 'row', gap: 8 },
  pill: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999, backgroundColor: Colors.white, borderWidth: 1, borderColor: '#E4E4E8' },
  pillOn: { backgroundColor: INK, borderColor: INK },
  pillText: { fontSize: 13, fontWeight: '700', color: INK },
  pillTextOn: { color: Colors.white },
  kpis: { flexDirection: 'row', gap: 10 },
  kpi: { flex: 1, backgroundColor: Colors.white, borderRadius: 16, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#ECECEF' },
  kpiValue: { fontSize: 22, fontWeight: '800', color: INK },
  kpiLabel: { fontSize: 12, fontWeight: '600', color: MUTED, marginTop: 2 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  route: { flex: 1, fontSize: 15, fontWeight: '800', color: INK },
  ret: { fontWeight: '600', color: MUTED },
  sizeChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: '#F1F1F3' },
  sizeText: { fontSize: 11, fontWeight: '800', color: INK },
  none: { fontSize: 13, color: MUTED, fontWeight: '600' },
  nums: { flexDirection: 'row', gap: 10 },
  num: { flex: 1, gap: 3 },
  numLabel: { fontSize: 11, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 },
  numValue: { fontSize: 16, fontWeight: '800', color: INK },
  actual: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  skipped: { fontSize: 12, color: MUTED, fontWeight: '600' },
  note: { fontSize: 12, color: MUTED },
});

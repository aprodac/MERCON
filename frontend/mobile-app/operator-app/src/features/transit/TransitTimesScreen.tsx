/**
 * Route: /transit-times?customerId=…&customerName=…&size=…&tab=… — Customers › <customer> › Transit times.
 * Each route of the customer with what Create trip plans against how long the
 * finished trips really took (loading departure → offload arrival).
 */
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, TextInput, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight, Search, X } from 'lucide-react-native';
import { TRUCK_CLASSES } from '@mercon/shared-types';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { EmptyState, SkeletonBlock } from '@mercon/mobile-shared/ui';
import { PageTitle } from '@/components/pageCues';
import { operatorService, type TransitRow } from '../../lib/operator';
import { Card, INK, MUTED, PAGE, tap } from '../trips/details/components/parts';
import { niceName } from '../trips/create/components/ui';
import { PERIOD_OPTIONS, TONE, hm, onTimeTone, overText, routeMatches, sizeLabel, skippedText } from './transitModel';
import { QuotationTransits } from './QuotationTransits';

/** Above this many routes a search box shows. */
const SEARCH_FROM = 6;

export default function TransitTimesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { customerId, customerName, tab: tabParam, size: sizeParam } = useLocalSearchParams<{ customerId: string; customerName?: string; tab?: string; size?: string }>();
  const [tab, setTab] = useState<'routes' | 'quotations'>(tabParam === 'quotations' ? 'quotations' : 'routes');
  const cid = String(customerId ?? '');
  const queryClient = useQueryClient();
  // Opened from Create trip: start on that truck size.
  const [size, setSize] = useState<string | null>((TRUCK_CLASSES as readonly string[]).includes(String(sizeParam ?? '')) ? String(sizeParam) : null);
  const [days, setDays] = useState<number>(30);
  const [search, setSearch] = useState('');
  // Keeps the last list on screen while another size / period loads, so the page doesn't blank on every tap.
  const q = useQuery({ queryKey: ['transit', cid, size, days], queryFn: () => operatorService.transitTimes(cid, { size, days }), enabled: !!cid, placeholderData: keepPreviousData });
  const data = q.data;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/customers'));
  const open = (r: TransitRow) => router.push({ pathname: '/transit-route', params: { customerId: cid, customerName: customerName ?? '', routeKey: r.key, days: String(days) } });
  const skipped = data ? skippedText(data.skipped) : null;
  const routes = useMemo(() => (data?.routes ?? []).filter((r) => routeMatches(r, search)), [data, search]);
  const kpiTone = onTimeTone(data?.kpis.onTimePct ?? null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['transit', cid] });

  return (
    <View style={s.page}>
      <View style={[s.bar, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity style={s.barBtn} onPress={back} accessibilityLabel="Back"><ArrowLeft size={20} color={INK} strokeWidth={2.4} /></TouchableOpacity>
        <View style={{ alignItems: 'center', flex: 1 }}>
          <PageTitle title="Transit times" />
          {customerName ? <Text style={s.customer} numberOfLines={1}>{niceName(String(customerName))}</Text> : null}
        </View>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView
        contentContainerStyle={s.body}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={q.isRefetching && !q.isPlaceholderData} onRefresh={refresh} />}
      >
        <View style={s.seg}>
          {([['routes', 'Routes'], ['quotations', 'Quotations']] as const).map(([k, label]) => (
            <TouchableOpacity key={k} style={[s.segItem, tab === k && s.segOn]} onPress={() => { tap(); setTab(k); }} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}>
              <Text style={[s.segText, tab === k && s.segTextOn]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'quotations' ? <QuotationTransits customerId={cid} /> : (<>

        <View style={s.filters}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
            {[null, ...TRUCK_CLASSES].map((c) => (
              <Pill key={c ?? 'all'} label={c ?? 'All sizes'} on={size === c} onPress={() => setSize(c)} />
            ))}
          </ScrollView>
          <View style={s.period}>
            {PERIOD_OPTIONS.map((d) => (
              <TouchableOpacity key={d} style={[s.periodItem, days === d && s.periodOn]} onPress={() => { tap(); setDays(d); }} accessibilityRole="button" accessibilityState={{ selected: days === d }}>
                <Text style={[s.periodText, days === d && s.periodTextOn]}>{`${d} days`}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={s.kpis}>
          <Kpi label="Routes" value={data ? String(data.kpis.routes) : '—'} />
          <Kpi label="On time" value={data?.kpis.onTimePct != null ? `${data.kpis.onTimePct}%` : '—'} color={kpiTone?.fg} bg={kpiTone?.bg} />
          <Kpi label="Avg late" value={data?.kpis.avgLateMin != null ? hm(data.kpis.avgLateMin) : '—'} />
          {q.isFetching && q.isPlaceholderData ? <ActivityIndicator style={s.kpiSpin} size="small" color={MUTED} /> : null}
        </View>

        {(data?.routes.length ?? 0) > SEARCH_FROM ? (
          <View style={s.search}>
            <Search size={16} color={MUTED} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search a place"
              placeholderTextColor="#A0A0AA"
              style={s.searchInput}
              autoCorrect={false}
              returnKeyType="search"
            />
            {search ? <TouchableOpacity onPress={() => setSearch('')} hitSlop={8} accessibilityLabel="Clear search"><X size={16} color={MUTED} /></TouchableOpacity> : null}
          </View>
        ) : null}

        {q.isLoading ? (
          <View style={{ gap: 10 }}><SkeletonBlock height={96} radius={16} /><SkeletonBlock height={96} radius={16} /><SkeletonBlock height={96} radius={16} /></View>
        ) : q.isError && !data ? (
          <View style={{ alignItems: 'center' }}>
            <EmptyState title="Couldn’t load transit times" subtitle="Check the connection and try again." />
            <TouchableOpacity style={s.retry} onPress={() => { tap(); q.refetch(); }} accessibilityRole="button"><Text style={s.retryText}>Try again</Text></TouchableOpacity>
          </View>
        ) : !data?.routes.length ? (
          <EmptyState
            title={size ? `No ${size} routes in the last ${days} days` : `No finished trips in the last ${days} days`}
            subtitle={days < 90 || size ? 'Try a longer period or all sizes.' : 'Routes show here once this customer’s trips are delivered with real times.'}
          />
        ) : !routes.length ? (
          <EmptyState title={`No route matches “${search.trim()}”`} subtitle="Search by the pickup or drop-off name." />
        ) : (
          <View style={{ gap: 10, opacity: q.isPlaceholderData ? 0.6 : 1 }}>
            {routes.map((r) => <RouteCard key={r.key} r={r} onPress={() => { tap(); open(r); }} />)}
          </View>
        )}
        {skipped ? <Text style={s.skipped}>{skipped}</Text> : null}
        <View style={s.legend}>
          <Legend tone="green" label="On time · ≤15 min over" />
          <Legend tone="amber" label="Up to 1 h over" />
          <Legend tone="red" label="More than 1 h" />
        </View>
        </>)}
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

function Kpi({ label, value, color, bg }: { label: string; value: string; color?: string; bg?: string }) {
  return (
    <View style={[s.kpi, bg ? { backgroundColor: bg, borderColor: bg } : null]}>
      <Text style={[s.kpiValue, color ? { color } : null]}>{value}</Text>
      <Text style={[s.kpiLabel, color ? { color } : null]}>{label}</Text>
    </View>
  );
}

function Legend({ tone, label }: { tone: keyof typeof TONE; label: string }) {
  return (
    <View style={s.legendItem}>
      <View style={[s.dot, { backgroundColor: TONE[tone].fg }]} />
      <Text style={s.legendText}>{label}</Text>
    </View>
  );
}

export function RouteCard({ r, onPress }: { r: TransitRow; onPress: () => void }) {
  const tone = r.tone ? TONE[r.tone] : null;
  const over = overText(r.actualAvgMin, r.plannedMin);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={`${r.from} to ${r.to}, ${r.size}`}>
      <Card style={[{ padding: 14, gap: 10 }, tone ? { borderLeftWidth: 4, borderLeftColor: tone.fg } : null]}>
        <View style={s.rowTop}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.route} numberOfLines={2}>{`${niceName(r.from)} → ${niceName(r.to)}`}</Text>
            <View style={s.tags}>
              <View style={s.sizeChip}><Text style={s.sizeText}>{sizeLabel(r.size)}</Text></View>
              {r.leg === 'return' ? <View style={s.sizeChip}><Text style={s.tagText}>Way back</Text></View> : null}
              {r.plannedSaved ? <View style={[s.sizeChip, s.savedChip]}><Text style={[s.tagText, s.savedText]}>Saved time</Text></View> : null}
            </View>
          </View>
          <ChevronRight size={18} color={MUTED} />
        </View>
        {r.trips === 0 ? (
          <Text style={s.none}>{`No trips in this period · new trips plan ${hm(r.plannedMin)}`}</Text>
        ) : (
          <View style={s.nums}>
            <View style={s.num}><Text style={s.numLabel}>Given TT</Text><Text style={s.numValue}>{hm(r.plannedMin)}</Text></View>
            <View style={s.num}>
              <Text style={s.numLabel}>Actual avg</Text>
              <View style={[s.actual, tone && { backgroundColor: tone.bg }]}><Text style={[s.numValue, tone && { color: tone.fg }]}>{hm(r.actualAvgMin)}</Text></View>
              {over ? <Text style={[s.over, tone && { color: tone.fg }]}>{over}</Text> : null}
            </View>
            <View style={[s.num, { flex: 0.6 }]}><Text style={s.numLabel}>Trips</Text><Text style={s.numValue}>{r.trips}</Text></View>
          </View>
        )}
      </Card>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: PAGE },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  barBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E9E9EC' },
  body: { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  customer: { fontSize: 12, fontWeight: '700', color: MUTED, marginTop: 1 },
  seg: { flexDirection: 'row', backgroundColor: '#E9EAEE', borderRadius: 12, padding: 3 },
  segItem: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  segOn: { backgroundColor: Colors.white },
  segText: { fontSize: 14, fontWeight: '700', color: MUTED },
  segTextOn: { color: INK, fontWeight: '800' },
  filters: { gap: 10 },
  chips: { flexDirection: 'row', gap: 8 },
  pill: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999, backgroundColor: Colors.white, borderWidth: 1, borderColor: '#E4E4E8' },
  pillOn: { backgroundColor: INK, borderColor: INK },
  pillText: { fontSize: 13, fontWeight: '700', color: INK },
  pillTextOn: { color: Colors.white },
  period: { flexDirection: 'row', backgroundColor: Colors.white, borderRadius: 12, padding: 3, borderWidth: 1, borderColor: '#E9E9EC' },
  periodItem: { flex: 1, paddingVertical: 7, borderRadius: 9, alignItems: 'center' },
  periodOn: { backgroundColor: '#EEF1FB' },
  periodText: { fontSize: 13, fontWeight: '700', color: MUTED },
  periodTextOn: { color: '#1F4FD1', fontWeight: '800' },
  kpis: { flexDirection: 'row', gap: 10 },
  kpi: { flex: 1, backgroundColor: Colors.white, borderRadius: 16, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#ECECEF' },
  kpiValue: { fontSize: 22, fontWeight: '800', color: INK },
  kpiLabel: { fontSize: 12, fontWeight: '600', color: MUTED, marginTop: 2 },
  kpiSpin: { position: 'absolute', right: 6, top: 6 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.white, borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: '#E4E4E8' },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: INK },
  retry: { backgroundColor: INK, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 },
  retryText: { color: Colors.white, fontWeight: '800' },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  route: { fontSize: 15, fontWeight: '800', color: INK },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  sizeChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: '#F1F1F3' },
  sizeText: { fontSize: 11, fontWeight: '800', color: INK },
  tagText: { fontSize: 11, fontWeight: '700', color: MUTED },
  savedChip: { backgroundColor: '#EEF1FB' },
  savedText: { color: '#1F4FD1' },
  none: { fontSize: 13, color: MUTED, fontWeight: '600' },
  nums: { flexDirection: 'row', gap: 10 },
  num: { flex: 1, gap: 3 },
  numLabel: { fontSize: 11, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 },
  numValue: { fontSize: 16, fontWeight: '800', color: INK },
  actual: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginLeft: -8 },
  over: { fontSize: 12, fontWeight: '700', color: MUTED },
  skipped: { fontSize: 12, color: MUTED, fontWeight: '600' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, color: MUTED, fontWeight: '600' },
});

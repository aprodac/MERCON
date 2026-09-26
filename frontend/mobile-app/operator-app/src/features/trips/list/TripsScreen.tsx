/**
 * Route: /trips — the operator's trips.
 *
 *   Now      — a live board: needs attention, on the road, starting next.
 *   Schedule — a date strip (with a count per day) and that day's trips.
 *   History  — delivered and cancelled trips by day, loading as you scroll.
 * Search looks across every trip on the server. Long-press a trip for quick
 * actions (call, WhatsApp, send status, change driver).
 */
import React, { useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput, SectionList, FlatList, RefreshControl, ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  CalendarDays, CircleCheckBig, History, MessageCircle, Phone, Radio, Search, Send, UserRound, X, ArrowUpRight, type LucideIcon,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { AppModal } from '@mercon/mobile-shared/components/common/AppModal';
import type { OperatorTrip } from '../../../lib/operator';
import { TripCard } from './TripCard';
import { useNow, useTripList, SCHEDULE_AFTER, SCHEDULE_BEFORE, type View as ListView } from './useTripList';
import {
  dayLabel, dayRange, driverNameOf, driverPhoneOf, groupByDay, needsAttention, phaseOf, tripDayIso, type TimeFmt,
} from './tripListModel';

const INK = '#2B2A2B';
const MUTED = '#5F5F6E';
const PAGE = '#F4F5F8';

const tap = () => Haptics.selectionAsync().catch(() => {});


export default function TripsScreen() {
  const router = useRouter();
  const [view, setView] = useState<ListView>('now');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [actionsFor, setActionsFor] = useState<OperatorTrip | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const now = useNow();
  const data = useTripList(view, debounced, now);
  const { f, todayKey } = data;
  const selectedDay = day ?? todayKey;

  const onSearch = (v: string) => {
    setQuery(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebounced(v), 350);
  };

  const open = (t: OperatorTrip, extra: Record<string, string> = {}) =>
    router.push({ pathname: '/trip-details', params: { id: t.id, ...extra } });

  const refresh = async () => {
    setRefreshing(true);
    try { await data.refresh(); } finally { setRefreshing(false); }
  };

  // ── Now: the live board ───────────────────────────────────────────────────
  const board = useMemo(() => {
    const attention: OperatorTrip[] = [];
    const road: OperatorTrip[] = [];
    const next: OperatorTrip[] = [];
    for (const t of data.open) {
      const p = phaseOf(t.status);
      if (needsAttention(t, now)) attention.push(t);
      else if (p === 'running' || p === 'delayed') road.push(t);
      else next.push(t);
    }
    const byStart = (a: OperatorTrip, b: OperatorTrip) => new Date(tripDayIso(a) ?? 0).getTime() - new Date(tripDayIso(b) ?? 0).getTime();
    return {
      attention: attention.sort(byStart),
      road: road.sort(byStart),
      next: next.sort(byStart),
    };
  }, [data.open, now]);

  // The sections are the grouping — no filter chips on top of them.
  const nowSections = useMemo(() => [
    { key: 'attention', title: 'Needs attention', tone: '#D92D20', data: board.attention },
    { key: 'road', title: 'On the road', tone: '#2F5FD0', data: board.road },
    { key: 'next', title: 'Starting next', tone: '#7651D6', data: board.next },
  ].filter((sct) => sct.data.length > 0), [board]);

  // ── Schedule: counts per day and the chosen day's trips ───────────────────
  const days = useMemo(() => dayRange(todayKey, SCHEDULE_BEFORE, SCHEDULE_AFTER), [todayKey]);
  const perDay = useMemo(() => {
    const m = new Map<string, { total: number; attention: number }>();
    for (const t of data.window) {
      const iso = tripDayIso(t);
      if (!iso) continue;
      const k = f.dayKey(iso);
      const c = m.get(k) ?? { total: 0, attention: 0 };
      c.total += 1;
      if (needsAttention(t, now)) c.attention += 1;
      m.set(k, c);
    }
    return m;
  }, [data.window, f, now]);
  const dayTrips = useMemo(() => {
    return data.window
      .filter((t) => { const iso = tripDayIso(t); return iso && f.dayKey(iso) === selectedDay; })
      .sort((a, b) => new Date(tripDayIso(a) ?? 0).getTime() - new Date(tripDayIso(b) ?? 0).getTime());
  }, [data.window, f, selectedDay]);

  // ── History ───────────────────────────────────────────────────────────────
  const historySections = useMemo(() => groupByDay(data.history, f, todayKey, true), [data.history, f, todayKey]);

  const renderCard = (t: OperatorTrip, showDay = false) => (
    <TripCard trip={t} f={f} now={now} showDay={showDay} onPress={open} onLongPress={setActionsFor} />
  );

  const views: { id: ListView; label: string; icon: LucideIcon; badge?: number }[] = [
    { id: 'now', label: 'Now', icon: Radio, badge: board.attention.length || undefined },
    { id: 'schedule', label: 'Schedule', icon: CalendarDays },
    { id: 'history', label: 'History', icon: History },
  ];

  const refreshControl = <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.primary} />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: PAGE }} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.h1}>Trips</Text>
          <Text style={s.h1sub}>
            {board.road.length} on the road · {board.attention.length} need attention
          </Text>
        </View>
      </View>

      {/* Search */}
      <View style={s.searchBar}>
        <Search size={17} color={MUTED} />
        <TextInput
          style={s.searchInput}
          value={query}
          onChangeText={onSearch}
          placeholder="Trip no., customer, driver, truck, place"
          placeholderTextColor="#9898A4"
          autoCorrect={false}
          returnKeyType="search"
        />
        {data.searchLoading ? <ActivityIndicator size="small" color={MUTED} /> : null}
        {query ? (
          <TouchableOpacity onPress={() => { setQuery(''); setDebounced(''); }} hitSlop={8} accessibilityLabel="Clear search">
            <X size={17} color={MUTED} />
          </TouchableOpacity>
        ) : null}
      </View>

      {data.searching ? (
        <FlatList
          data={data.results}
          keyExtractor={(t) => t.id}
          contentContainerStyle={s.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => renderCard(item, true)}
          ItemSeparatorComponent={Gap}
          ListHeaderComponent={<Text style={s.resultsHead}>{data.searchLoading && data.results.length === 0 ? 'Searching…' : `${data.results.length} result${data.results.length === 1 ? '' : 's'} for “${debounced.trim()}”`}</Text>}
          ListEmptyComponent={!data.searchLoading ? <Empty icon={Search} title="No trips found" text="Try a trip number, customer, driver or plate." /> : null}
        />
      ) : (
        <>
          {/* View switch */}
          <View style={s.segment}>
            {views.map((v) => {
              const on = v.id === view;
              return (
                <TouchableOpacity key={v.id} style={[s.segItem, on && s.segOn]} onPress={() => { if (!on) tap(); setView(v.id); }} activeOpacity={0.8} accessibilityRole="tab" accessibilityState={{ selected: on }}>
                  <v.icon size={15} color={on ? INK : '#6E6E80'} strokeWidth={on ? 2.4 : 2} />
                  <Text style={[s.segText, on && s.segTextOn]}>{v.label}</Text>
                  {v.badge ? <View style={s.badge}><Text style={s.badgeText}>{v.badge}</Text></View> : null}
                </TouchableOpacity>
              );
            })}
          </View>

          {view === 'now' ? (
            <SectionList
              sections={nowSections}
              keyExtractor={(t) => t.id}
              contentContainerStyle={s.list}
              refreshControl={refreshControl}
              stickySectionHeadersEnabled={false}
              renderSectionHeader={({ section }) => <SectionHead title={section.title} count={section.data.length} tone={(section as any).tone} />}
              renderItem={({ item }) => renderCard(item, true)}
              ItemSeparatorComponent={Gap}
              ListEmptyComponent={data.openLoading ? <Loading /> : <Empty icon={CircleCheckBig} title="No open trips" text="Every trip is delivered or cancelled." good />}
            />
          ) : view === 'schedule' ? (
            <FlatList
              data={dayTrips}
              keyExtractor={(t) => t.id}
              contentContainerStyle={s.list}
              refreshControl={refreshControl}
              renderItem={({ item }) => renderCard(item)}
              ItemSeparatorComponent={Gap}
              ListHeaderComponent={(
                <View style={{ gap: 10, marginBottom: 4 }}>
                  <DateStrip days={days} selected={selectedDay} today={todayKey} counts={perDay} onSelect={(k) => { tap(); setDay(k); }} f={f} />
                  <View style={s.dayHead}>
                    <Text style={s.dayTitle}>{dayLabel(selectedDay, todayKey, f)}</Text>
                    <Text style={s.dayCount}>
                      {perDay.get(selectedDay)?.total ?? 0} trips
                      {perDay.get(selectedDay)?.attention ? <Text style={{ color: '#B42318' }}> · {perDay.get(selectedDay)!.attention} need attention</Text> : null}
                    </Text>
                  </View>
                </View>
              )}
              ListEmptyComponent={data.windowLoading ? <Loading /> : <Empty icon={CalendarDays} title="No trips this day" text="Pick another day, or create a trip." />}
            />
          ) : (
            <SectionList
              sections={historySections}
              keyExtractor={(t) => t.id}
              contentContainerStyle={s.list}
              refreshControl={refreshControl}
              stickySectionHeadersEnabled
              renderSectionHeader={({ section }) => <SectionHead title={section.title} count={section.data.length} sticky />}
              renderItem={({ item }) => renderCard(item)}
              ItemSeparatorComponent={Gap}
              onEndReached={data.loadMoreHistory}
              onEndReachedThreshold={0.4}
              ListFooterComponent={data.historyFetchingMore ? <Loading /> : null}
              ListEmptyComponent={data.historyLoading ? <Loading /> : <Empty icon={History} title="No finished trips yet" text="Delivered and cancelled trips show up here." />}
            />
          )}
        </>
      )}

      <QuickActions
        trip={actionsFor}
        onClose={() => setActionsFor(null)}
        onOpen={(t, extra) => { setActionsFor(null); setTimeout(() => open(t, extra), 250); }}
      />
    </SafeAreaView>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────────────

const Gap = () => <View style={{ height: 10 }} />;
const Loading = () => <ActivityIndicator color={Colors.primary} style={{ marginVertical: 30 }} />;

function Empty({ icon: Icon, title, text, good }: { icon: LucideIcon; title: string; text: string; good?: boolean }) {
  return (
    <View style={[s.empty, good && { backgroundColor: '#F2FBF5' }]}>
      <View style={s.emptyIcon}><Icon size={24} color={good ? '#1F9D55' : MUTED} /></View>
      <Text style={[s.emptyTitle, good && { color: '#146C3C' }]}>{title}</Text>
      <Text style={[s.emptyText, good && { color: '#146C3C' }]}>{text}</Text>
    </View>
  );
}

function SectionHead({ title, count, tone, sticky }: { title: string; count: number; tone?: string; sticky?: boolean }) {
  return (
    <View style={[s.sectionHead, sticky && { backgroundColor: PAGE }]}>
      {tone ? <View style={[s.sectionDot, { backgroundColor: tone }]} /> : null}
      <Text style={s.sectionTitle}>{title}</Text>
      <Text style={s.sectionCount}>{count}</Text>
    </View>
  );
}

function DateStrip({ days, selected, today, counts, onSelect }: {
  days: string[]; selected: string; today: string; counts: Map<string, { total: number; attention: number }>; onSelect: (k: string) => void; f: TimeFmt;
}) {
  const list = useRef<FlatList<string>>(null);
  const todayIdx = Math.max(0, days.indexOf(today));
  return (
    <FlatList
      ref={list}
      data={days}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyExtractor={(k) => k}
      initialScrollIndex={Math.max(0, todayIdx - 2)}
      getItemLayout={(_, i) => ({ length: 58, offset: 58 * i, index: i })}
      contentContainerStyle={{ gap: 6, paddingRight: 8 }}
      renderItem={({ item: k }) => {
        const [y, m, d] = k.split('-').map(Number);
        const date = new Date(Date.UTC(y, m - 1, d, 12));
        const wd = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short' }).format(date);
        const on = k === selected;
        const c = counts.get(k);
        const past = k < today;
        return (
          <TouchableOpacity style={[s.day, on && s.dayOn, !on && k === today && s.dayToday]} onPress={() => onSelect(k)} activeOpacity={0.8} accessibilityLabel={`${wd} ${d}, ${c?.total ?? 0} trips`}>
            <Text style={[s.dayWd, on && { color: '#C9C9D2' }, past && !on && { color: '#9898A4' }]}>{k === today ? 'Today' : wd}</Text>
            <Text style={[s.dayNum, on && { color: Colors.white }, past && !on && { color: '#6E6E80' }]}>{d}</Text>
            <View style={s.dayDots}>
              {c?.attention ? <View style={[s.dayDot, { backgroundColor: '#D92D20' }]} /> : null}
              {c?.total ? <Text style={[s.dayCountSmall, on && { color: Colors.white }]}>{c.total}</Text> : <Text style={[s.dayCountSmall, { color: 'transparent' }]}>0</Text>}
            </View>
          </TouchableOpacity>
        );
      }}
    />
  );
}

function QuickActions({ trip, onClose, onOpen }: { trip: OperatorTrip | null; onClose: () => void; onOpen: (t: OperatorTrip, extra?: Record<string, string>) => void }) {
  if (!trip) return <AppModal visible={false} onClose={onClose} type="bottom-sheet"><View /></AppModal>;
  const phone = driverPhoneOf(trip);
  const driver = driverNameOf(trip);
  const finished = ['Completed', 'Invoiced', 'Cancelled'].includes(trip.status);
  const rows: { icon: LucideIcon; label: string; sub?: string; bg: string; fg: string; onPress: () => void; hidden?: boolean }[] = [
    { icon: Phone, label: `Call ${driver ?? 'driver'}`, sub: phone ?? undefined, bg: '#E8F5EE', fg: '#146C3C', hidden: !phone, onPress: () => { onClose(); Linking.openURL(`tel:${phone}`).catch(() => {}); } },
    { icon: MessageCircle, label: 'WhatsApp driver', bg: '#E3F7EA', fg: '#0F6B37', hidden: !phone, onPress: () => { onClose(); Linking.openURL(`https://wa.me/${(phone ?? '').replace(/[^0-9]/g, '')}`).catch(() => {}); } },
    { icon: Send, label: 'Send status to customer', sub: 'Vehicle status update on WhatsApp', bg: '#FDECE8', fg: '#B43A27', hidden: finished, onPress: () => onOpen(trip, { tab: 'updates', share: 'status' }) },
    { icon: UserRound, label: trip.driver ? 'Change driver' : 'Assign driver', bg: '#E7EEFC', fg: '#2449A8', hidden: finished || !!trip.is_third_party, onPress: () => onOpen(trip, { assign: 'driver' }) },
    { icon: ArrowUpRight, label: 'Open trip', bg: '#F1F3F7', fg: INK, onPress: () => onOpen(trip) },
  ];
  return (
    <AppModal visible onClose={onClose} type="bottom-sheet" title={`${trip.ref_id ?? 'Trip'} · ${trip.customer?.name ?? ''}`}>
      <View>
        {rows.filter((r) => !r.hidden).map((r) => (
          <TouchableOpacity key={r.label} style={s.qaRow} onPress={r.onPress} activeOpacity={0.7}>
            <View style={[s.qaIcon, { backgroundColor: r.bg }]}><r.icon size={18} color={r.fg} strokeWidth={2.2} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.qaLabel}>{r.label}</Text>
              {r.sub ? <Text style={s.qaSub}>{r.sub}</Text> : null}
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </AppModal>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, gap: 12 },
  h1: { fontSize: 24, fontWeight: '700', color: INK, letterSpacing: -0.4 },
  h1sub: { fontSize: 13, fontWeight: '600', color: MUTED, marginTop: 1 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, height: 46, borderRadius: 14, backgroundColor: Colors.white, paddingHorizontal: 13, borderWidth: 1, borderColor: '#EEF0F4' },
  searchInput: { flex: 1, fontSize: 15, color: INK, paddingVertical: 0 },
  segment: { flexDirection: 'row', gap: 4, marginHorizontal: 16, marginTop: 12, backgroundColor: '#E4E7EE', borderRadius: 13, padding: 3 },
  segItem: { flex: 1, height: 38, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  segOn: { backgroundColor: Colors.white, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segText: { fontSize: 13, fontWeight: '700', color: '#4A4A55' },
  segTextOn: { color: INK, fontWeight: '800' },
  badge: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#D92D20', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeText: { color: Colors.white, fontSize: 11, fontWeight: '800' },
  list: { padding: 16, paddingBottom: 120, flexGrow: 1 },
  resultsHead: { fontSize: 13, fontWeight: '700', color: MUTED, marginBottom: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 12, paddingBottom: 8 },
  sectionDot: { width: 6, height: 6, borderRadius: 3 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#3F3F46' },
  sectionCount: { fontSize: 13, fontWeight: '500', color: '#A1A1AA' },
  dayHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 },
  dayTitle: { fontSize: 18, fontWeight: '800', color: INK },
  dayCount: { fontSize: 13, fontWeight: '700', color: MUTED },
  day: { width: 52, height: 74, borderRadius: 16, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center', gap: 2, borderWidth: 1, borderColor: '#EEF0F4' },
  dayOn: { backgroundColor: INK, borderColor: INK },
  dayToday: { borderColor: '#C4432F', borderWidth: 1.5 },
  dayWd: { fontSize: 11, fontWeight: '700', color: MUTED },
  dayNum: { fontSize: 19, fontWeight: '800', color: INK },
  dayDots: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 14 },
  dayDot: { width: 6, height: 6, borderRadius: 3 },
  dayCountSmall: { fontSize: 11, fontWeight: '800', color: MUTED },
  empty: { alignItems: 'center', gap: 6, backgroundColor: Colors.white, borderRadius: 18, padding: 24, marginTop: 8 },
  emptyIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#F4F5F8', alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: INK },
  emptyText: { fontSize: 13, color: MUTED, textAlign: 'center' },
  qaRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 9 },
  qaIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  qaLabel: { fontSize: 15, fontWeight: '700', color: INK },
  qaSub: { fontSize: 12, color: MUTED, marginTop: 1 },
});

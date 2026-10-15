/**
 * Route: /trips — the operator's trips.
 *
 *   Delayed  — every delayed trip, the longest-delayed first.
 *   Now      — trips under way only: needs attention, on the road. Trips
 *              that haven't started (draft / scheduled) live in Schedule.
 *   Schedule — a date strip (with a count per day) and every trip planned
 *              that day, finished ones included.
 *   History  — delivered and cancelled trips by day, loading as you scroll.
 * Search looks across every trip on the server. Long-press a trip for quick
 * actions (call, WhatsApp, send status, change driver).
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput, SectionList, FlatList, RefreshControl, ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  Building2, CalendarDays, CircleCheckBig, History, AlertTriangle, MessageCircle, Phone, Plus, Radio, Search, Send, Trash2, Truck, UserRound, X, ArrowUpRight, type LucideIcon,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { AppModal } from '@mercon/mobile-shared/components/common/AppModal';
import type { OperatorTrip } from '../../../lib/operator';
import { TripCard } from './TripCard';
import { AppTopBar } from '@/components/AppTopBar';
import { useNow, useTripList, SCHEDULE_AFTER, SCHEDULE_BEFORE, type View as ListView } from './useTripList';
import { askDeleteTrip, canDeleteTrip } from '../edit/movePlan';
import {
  clashesOf, dayLabel, dayRange, driverNameOf, driverPhoneOf, finishedDayIso, groupByDay, needsAttention, phaseOf, tripDayIso, type TimeFmt,
} from './tripListModel';

const INK = '#3E3C3D';
const MUTED = '#5F5F6E';
const PAGE = '#F4F5F8';

const tap = () => Haptics.selectionAsync().catch(() => {});


export default function TripsScreen() {
  const router = useRouter();
  // Opened from a truck's or a customer's details: their trips only, until the chip is cleared.
  const params = useLocalSearchParams<{ vehicleId?: string; plate?: string; customerId?: string; customerName?: string; view?: string }>();
  const [scope, setScope] = useState<{ kind: 'truck' | 'customer'; filter: Record<string, string>; label: string } | null>(
    params.vehicleId
      ? { kind: 'truck', filter: { vehicle_id: String(params.vehicleId) }, label: String(params.plate ?? 'This truck') }
      : params.customerId
        ? { kind: 'customer', filter: { customer_id: String(params.customerId) }, label: String(params.customerName ?? 'This customer') }
        : null,
  );
  const [view, setView] = useState<ListView>(
    params.vehicleId || params.customerId ? 'history'
      : params.view === 'delayed' || params.view === 'schedule' || params.view === 'history' ? params.view
      : 'now',
  );
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [actionsFor, setActionsFor] = useState<OperatorTrip | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const now = useNow();
  const data = useTripList(view, debounced, now, scope?.filter);

  // Coming back from a trip (edited, started, cancelled, created) shows it as it is now.
  const queryClient = useQueryClient();
  const firstFocus = useRef(true);
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) { firstFocus.current = false; return; }
    queryClient.invalidateQueries({ queryKey: ['trips'], refetchType: 'active' });
  }, [queryClient]));
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

  // ── Now: the live board — only trips under way; not-started ones are in Schedule ──
  const board = useMemo(() => {
    const attention: OperatorTrip[] = [];
    const road: OperatorTrip[] = [];
    for (const t of data.open) {
      const p = phaseOf(t.status);
      if (p !== 'running' && p !== 'delayed') continue;
      if (needsAttention(t, now)) attention.push(t);
      else road.push(t);
    }
    const byStart = (a: OperatorTrip, b: OperatorTrip) => new Date(tripDayIso(a) ?? 0).getTime() - new Date(tripDayIso(b) ?? 0).getTime();
    return {
      attention: attention.sort(byStart),
      road: road.sort(byStart),
    };
  }, [data.open, now]);

  // Delayed: every delayed / emergency trip, the one that's been late longest first.
  const delayedTrips = useMemo(
    () => data.open
      .filter((t) => phaseOf(t.status) === 'delayed')
      .sort((a, b) => new Date(tripDayIso(a) ?? 0).getTime() - new Date(tripDayIso(b) ?? 0).getTime()),
    [data.open],
  );

  // The sections are the grouping — no filter chips on top of them.
  const nowSections = useMemo(() => [
    { key: 'attention', title: 'Needs attention', tone: '#D92D20', data: board.attention },
    { key: 'road', title: 'On the road', tone: '#2F5FD0', data: board.road },
  ].filter((sct) => sct.data.length > 0), [board]);

  // ── Schedule: counts per day and the chosen day's trips ───────────────────
  const days = useMemo(() => dayRange(todayKey, SCHEDULE_BEFORE, SCHEDULE_AFTER), [todayKey]);
  const perDay = useMemo(() => {
    const m = new Map<string, DayCount>();
    for (const t of data.window) {
      const iso = tripDayIso(t);
      if (!iso) continue;
      const k = f.dayKey(iso);
      const c = m.get(k) ?? { total: 0, attention: 0, done: 0, cancelled: 0 };
      c.total += 1;
      const p = phaseOf(t.status);
      if (p === 'done') c.done += 1;
      else if (p === 'cancelled') c.cancelled += 1;
      else if (needsAttention(t, now)) c.attention += 1;
      m.set(k, c);
    }
    return m;
  }, [data.window, f, now]);
  // Still-open trips first (what needs doing), then finished, then cancelled — each by planned time.
  const dayTrips = useMemo(() => {
    const rank = (t: OperatorTrip) => { const p = phaseOf(t.status); return p === 'cancelled' ? 2 : p === 'done' ? 1 : 0; };
    return data.window
      .filter((t) => { const iso = tripDayIso(t); return iso && f.dayKey(iso) === selectedDay; })
      .sort((a, b) => rank(a) - rank(b) || new Date(tripDayIso(a) ?? 0).getTime() - new Date(tripDayIso(b) ?? 0).getTime());
  }, [data.window, f, selectedDay]);
  const selectedCount = perDay.get(selectedDay);
  const selectedPast = selectedDay < todayKey;

  // ── History ───────────────────────────────────────────────────────────────
  // Grouped by the day each trip finished, not the day it was planned.
  const historySections = useMemo(() => groupByDay(data.history, f, todayKey, true, finishedDayIso), [data.history, f, todayKey]);
  const historyCancelled = useMemo(() => data.history.filter((t) => phaseOf(t.status) === 'cancelled').length, [data.history]);

  // Trips that double-book a driver or truck, across everything loaded.
  const clashes = useMemo(() => {
    const seen = new Map<string, OperatorTrip>();
    for (const t of [...data.window, ...data.open, ...data.results]) seen.set(t.id, t);
    return clashesOf([...seen.values()]);
  }, [data.window, data.open, data.results]);

  const renderCard = (t: OperatorTrip, showDay = false) => (
    <TripCard trip={t} f={f} now={now} showDay={showDay} clash={clashes.get(t.id)} onPress={open} onLongPress={setActionsFor} />
  );

  const views: { id: ListView; label: string; icon: LucideIcon; badge?: number }[] = [
    { id: 'now', label: 'Now', icon: Radio },
    { id: 'delayed', label: 'Delayed', icon: AlertTriangle, badge: delayedTrips.length || undefined },
    { id: 'schedule', label: 'Schedule', icon: CalendarDays },
    { id: 'history', label: 'History', icon: History },
  ];

  const refreshControl = <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.primary} />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: PAGE }} edges={['top']}>
      <AppTopBar title="Trips" actions={[{ icon: Plus, label: 'New trip', onPress: () => router.push('/create-trip') }]} />
      {/* Scope chip (opened from a truck or customer) */}
      <View style={[s.header, !scope && { paddingTop: 0, paddingBottom: 4 }]}>
        <View style={{ flex: 1 }}>
          {scope ? (
            <TouchableOpacity
              style={s.truckChip}
              onPress={() => {
                tap();
                setScope(null);
                router.setParams({ vehicleId: undefined, plate: undefined, customerId: undefined, customerName: undefined });
              }}
              activeOpacity={0.75}
              accessibilityLabel="Show all trips"
            >
              {scope.kind === 'truck' ? <Truck size={13} color="#0C447C" /> : <Building2 size={13} color="#0C447C" />}
              <Text style={s.truckChipText} numberOfLines={1}>{scope.label}</Text>
              <X size={13} color="#0C447C" />
            </TouchableOpacity>
          ) : null}
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
                  <Text style={[s.segText, on && s.segTextOn]}>{v.label}</Text>
                  {v.badge ? <View style={s.badge}><Text style={s.badgeText}>{v.badge}</Text></View> : null}
                </TouchableOpacity>
              );
            })}
          </View>

          {view === 'delayed' ? (
            <FlatList
              data={delayedTrips}
              keyExtractor={(t) => t.id}
              contentContainerStyle={s.list}
              refreshControl={refreshControl}
              renderItem={({ item }) => renderCard(item, true)}
              ItemSeparatorComponent={Gap}
              ListHeaderComponent={delayedTrips.length ? <Text style={s.resultsHead}>{delayedTrips.length} delayed · longest first</Text> : null}
              ListEmptyComponent={data.openLoading ? <Loading /> : <Empty icon={CircleCheckBig} title="Nothing delayed" text="Every open trip is on schedule." good />}
            />
          ) : view === 'now' ? (
            <SectionList
              sections={nowSections}
              keyExtractor={(t) => t.id}
              contentContainerStyle={s.list}
              refreshControl={refreshControl}
              stickySectionHeadersEnabled={false}
              renderSectionHeader={({ section }) => <SectionHead title={section.title} count={section.data.length} tone={(section as any).tone} />}
              renderItem={({ item }) => renderCard(item, true)}
              ItemSeparatorComponent={Gap}
              ListEmptyComponent={data.openLoading ? <Loading /> : <Empty icon={CircleCheckBig} title="Nothing on the road" text="Trips show here once they start. Upcoming trips are in Schedule." good />}
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
                    {selectedDay !== todayKey ? (
                      <TouchableOpacity onPress={() => { tap(); setDay(null); }} hitSlop={8} accessibilityRole="button">
                        <Text style={s.todayLink}>Back to today</Text>
                      </TouchableOpacity>
                    ) : null}
                    <View style={{ flex: 1 }} />
                    <Text style={s.dayCount}>
                      {plural(selectedCount?.total ?? 0, 'trip')}
                      {selectedCount?.done ? <Text style={{ color: '#146C3C' }}> · {selectedCount.done} delivered</Text> : null}
                      {selectedCount?.cancelled ? <Text> · {selectedCount.cancelled} cancelled</Text> : null}
                      {selectedCount?.attention ? <Text style={{ color: '#B42318' }}> · {selectedCount.attention} need attention</Text> : null}
                    </Text>
                  </View>
                </View>
              )}
              ListEmptyComponent={data.windowLoading ? <Loading /> : selectedPast ? (
                <Empty
                  icon={CalendarDays}
                  title="No trips planned this day"
                  text="Trips show on the day they were planned to start. To see trips by the day they finished, open History."
                  action={{ label: 'Open History', icon: History, onPress: () => { tap(); setView('history'); } }}
                />
              ) : (
                <Empty
                  icon={CalendarDays}
                  title="No trips this day"
                  text="Pick another day, or create a trip."
                  action={{ label: 'New trip', icon: Plus, onPress: () => router.push('/create-trip') }}
                />
              )}
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
              ListHeaderComponent={data.history.length ? (
                <Text style={s.resultsHead}>
                  By the day they finished · newest first
                  {data.historyMore ? '' : ` · ${plural(data.history.length - historyCancelled, 'delivered trip')}${historyCancelled ? `, ${historyCancelled} cancelled` : ''}`}
                </Text>
              ) : null}
              ListFooterComponent={data.historyFetchingMore ? <Loading /> : data.history.length && !data.historyMore ? <Text style={s.endNote}>{"That's every finished trip."}</Text> : null}
              ListEmptyComponent={data.historyLoading ? <Loading /> : (
                <Empty
                  icon={History}
                  title="No finished trips yet"
                  text="Delivered and cancelled trips show up here. Trips still running are in Now and Schedule."
                  action={{ label: 'Open Schedule', icon: CalendarDays, onPress: () => { tap(); setView('schedule'); } }}
                />
              )}
            />
          )}
        </>
      )}

      <QuickActions
        trip={actionsFor}
        onClose={() => setActionsFor(null)}
        onOpen={(t, extra) => { setActionsFor(null); setTimeout(() => open(t, extra), 250); }}
        onDelete={(t) => askDeleteTrip(t, { deleted: () => queryClient.invalidateQueries({ queryKey: ['trips'] }) })}
      />
    </SafeAreaView>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────────────

const Gap = () => <View style={{ height: 12 }} />;
const Loading = () => <ActivityIndicator color={Colors.primary} style={{ marginVertical: 30 }} />;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

type DayCount = { total: number; attention: number; done: number; cancelled: number };

function Empty({ icon: Icon, title, text, good, action }: {
  icon: LucideIcon; title: string; text: string; good?: boolean;
  action?: { label: string; icon: LucideIcon; onPress: () => void };
}) {
  return (
    <View style={[s.empty, good && { backgroundColor: '#F2FBF5' }]}>
      <View style={s.emptyIcon}><Icon size={24} color={good ? '#1F9D55' : MUTED} /></View>
      <Text style={[s.emptyTitle, good && { color: '#146C3C' }]}>{title}</Text>
      <Text style={[s.emptyText, good && { color: '#146C3C' }]}>{text}</Text>
      {action ? (
        <TouchableOpacity style={s.emptyBtn} onPress={action.onPress} activeOpacity={0.8} accessibilityRole="button">
          <action.icon size={16} color={Colors.white} />
          <Text style={s.emptyBtnText}>{action.label}</Text>
        </TouchableOpacity>
      ) : null}
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
  days: string[]; selected: string; today: string; counts: Map<string, DayCount>; onSelect: (k: string) => void; f: TimeFmt;
}) {
  const list = useRef<FlatList<string>>(null);
  const todayIdx = Math.max(0, days.indexOf(today));
  // "Back to today" (or any change from outside) brings the chosen day into view.
  React.useEffect(() => {
    const i = days.indexOf(selected);
    if (i >= 0) list.current?.scrollToIndex({ index: Math.max(0, i - 2), animated: true });
  }, [selected, days]);
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
            {/* Every cell keeps a month line so the 1st of a month lines up with the rest. */}
            <Text style={[s.dayMonth, on && { color: Colors.white }]}>
              {d === 1 || k === days[0] ? new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'short' }).format(date) : ' '}
            </Text>
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

function QuickActions({ trip, onClose, onOpen, onDelete }: { trip: OperatorTrip | null; onClose: () => void; onOpen: (t: OperatorTrip, extra?: Record<string, string>) => void; onDelete: (t: OperatorTrip) => void }) {
  if (!trip) return <AppModal visible={false} onClose={onClose} type="bottom-sheet"><View /></AppModal>;
  const phone = driverPhoneOf(trip);
  const driver = driverNameOf(trip);
  const finished = ['Completed', 'Invoiced', 'Cancelled'].includes(trip.status);
  const rows: { icon: LucideIcon; label: string; sub?: string; bg: string; fg: string; onPress: () => void; hidden?: boolean; danger?: boolean }[] = [
    { icon: Phone, label: `Call ${driver ?? 'driver'}`, sub: phone ?? undefined, bg: '#E8F5EE', fg: '#146C3C', hidden: !phone, onPress: () => { onClose(); Linking.openURL(`tel:${phone}`).catch(() => {}); } },
    { icon: MessageCircle, label: 'WhatsApp driver', bg: '#E3F7EA', fg: '#0F6B37', hidden: !phone, onPress: () => { onClose(); Linking.openURL(`https://wa.me/${(phone ?? '').replace(/[^0-9]/g, '')}`).catch(() => {}); } },
    { icon: Send, label: 'Send status to customer', sub: 'Vehicle status update on WhatsApp', bg: '#FDECE8', fg: '#B43A27', hidden: finished, onPress: () => onOpen(trip, { tab: 'updates', share: 'status' }) },
    { icon: UserRound, label: trip.driver ? 'Change driver' : 'Assign driver', bg: '#E7EEFC', fg: '#2449A8', hidden: finished || !!trip.is_third_party, onPress: () => onOpen(trip, { assign: 'driver' }) },
    { icon: ArrowUpRight, label: 'Open trip', bg: '#F1F3F7', fg: INK, onPress: () => onOpen(trip) },
    { icon: Trash2, label: 'Delete trip', sub: 'Made by mistake? Remove it from every list', bg: '#FEF3F2', fg: '#B42318', danger: true, hidden: !canDeleteTrip(trip.status), onPress: () => { onClose(); setTimeout(() => onDelete(trip), 250); } },
  ];
  return (
    <AppModal visible onClose={onClose} type="bottom-sheet" title={`${trip.ref_id ?? 'Trip'} · ${trip.customer?.name ?? ''}`}>
      <View>
        {rows.filter((r) => !r.hidden).map((r) => (
          <TouchableOpacity key={r.label} style={s.qaRow} onPress={r.onPress} activeOpacity={0.7}>
            <View style={[s.qaIcon, { backgroundColor: r.bg }]}><r.icon size={18} color={r.fg} strokeWidth={2.2} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[s.qaLabel, r.danger && { color: '#B42318' }]}>{r.label}</Text>
              {r.sub ? <Text style={s.qaSub}>{r.sub}</Text> : null}
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </AppModal>
  );
}

const s = StyleSheet.create({
  truckChip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: '#E6F1FB' },
  truckChipText: { fontSize: 12, fontWeight: '700', color: '#0C447C' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, gap: 12 },
  h1: { fontSize: 24, fontWeight: '700', color: INK, letterSpacing: -0.4 },
  h1sub: { fontSize: 13, fontWeight: '600', color: MUTED, marginTop: 1 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, height: 46, borderRadius: 14, backgroundColor: Colors.white, paddingHorizontal: 13, borderWidth: 1, borderColor: '#EEF0F4' },
  searchInput: { flex: 1, fontSize: 15, color: INK, paddingVertical: 0 },
  segment: { flexDirection: 'row', gap: 4, marginHorizontal: 16, marginTop: 12, backgroundColor: '#E4E7EE', borderRadius: 13, padding: 3 },
  segItem: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, height: 38, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 4 },
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
  dayHead: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 4 },
  todayLink: { fontSize: 13, fontWeight: '700', color: '#C4432F' },
  dayMonth: { fontSize: 9, lineHeight: 11, fontWeight: '800', letterSpacing: 0.4, color: '#C4432F', textTransform: 'uppercase' },
  dayTitle: { fontSize: 18, fontWeight: '800', color: INK },
  dayCount: { fontSize: 13, fontWeight: '700', color: MUTED },
  day: { width: 52, height: 80, borderRadius: 16, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center', gap: 1, borderWidth: 1, borderColor: '#EEF0F4' },
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
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, height: 40, paddingHorizontal: 16, borderRadius: 12, backgroundColor: INK },
  emptyBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white },
  endNote: { fontSize: 12, fontWeight: '600', color: '#9898A4', textAlign: 'center', marginTop: 16 },
  qaRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 9 },
  qaIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  qaLabel: { fontSize: 15, fontWeight: '700', color: INK },
  qaSub: { fontSize: 12, color: MUTED, marginTop: 1 },
});

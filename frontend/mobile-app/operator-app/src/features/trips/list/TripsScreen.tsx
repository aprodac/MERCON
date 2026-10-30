/**
 * Route: /trips — the operator's trips.
 *
 *   Delayed  — every delayed trip, the longest-delayed first.
 *   Now      — trips under way only: needs attention, on the road. Trips
 *              that haven't started (draft / scheduled) live in Schedule;
 *              ones past their start that the driver never started sit in
 *              their own section on top, not under "On the road".
 *   Schedule — a date strip (with a count per day) and the trips still to
 *              run that day. Delivered and cancelled trips are in History.
 *   History  — the same date strip, for the day trips finished: delivered
 *              ones by when they ended, cancelled ones by their planned day.
 * Search looks across every trip on the server. Long-press a trip for quick
 * actions (call, WhatsApp, send status, change driver).
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput, SectionList, FlatList, RefreshControl, ActivityIndicator, Linking, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  BookOpen, Building2, CalendarDays, ChevronRight, CircleCheckBig, Copy, History, MessageCircle, Phone, Plus, Radio, Search, Send, Trash2, Truck, UserRound, X, ArrowUpRight, type LucideIcon,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { AppModal } from '@mercon/mobile-shared/components/common/AppModal';
import { ErrorState } from '@mercon/mobile-shared/ui';
import type { OperatorTrip } from '../../../lib/operator';
import { TripCard } from './TripCard';
import { AppTopBar } from '@/components/AppTopBar';
import { FilterChips } from '@/components/FilterChips';
import { useNow, useTripList, HISTORY_DAYS, SCHEDULE_AFTER, type View as ListView } from './useTripList';
import { askDeleteTrip, canDeleteTrip } from '../edit/movePlan';
import {
  clashesOf, dayLabel, isLateToStart, dayRange, daysBetween, driverNameOf, driverPhoneOf, historyDayIso, needsAttention, phaseOf, tripDayIso, type TimeFmt,
} from './tripListModel';

import { RepeatTripsSheet } from './RepeatTripsSheet';
import { CompanyFilterSheet } from './CompanyFilterSheet';

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
      : params.view === 'schedule' || params.view === 'history' ? params.view
      : 'now',
  );
  // Delayed is a filter inside Now, not a tab of its own (owner, 23 Oct: "too many tabs").
  // Links that still ask for the delayed view open Now on it.
  const [nowFilter, setNowFilter] = useState<NowFilter>(params.view === 'delayed' ? 'delayed' : 'all');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [historyDay, setHistoryDay] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'done' | 'cancelled' | 'deleted'>('all');
  // Schedule as a list of cards, or one row per truck across the day.
  const [actionsFor, setActionsFor] = useState<OperatorTrip | null>(null);
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [companyOpen, setCompanyOpen] = useState(false);
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
    const lateStart: OperatorTrip[] = [];
    for (const t of data.open) {
      const p = phaseOf(t.status);
      if (p !== 'running' && p !== 'delayed') continue;
      // Past its start but the driver never started: not on the road yet.
      if (isLateToStart(t)) lateStart.push(t);
      else if (needsAttention(t, now)) attention.push(t);
      else road.push(t);
    }
    const byStart = (a: OperatorTrip, b: OperatorTrip) => new Date(tripDayIso(a) ?? 0).getTime() - new Date(tripDayIso(b) ?? 0).getTime();
    return {
      attention: attention.sort(byStart),
      road: road.sort(byStart),
      lateStart: lateStart.sort(byStart),
    };
  }, [data.open, now]);

  // Delayed: every delayed / emergency trip, the one that's been late longest first.
  const delayedTrips = useMemo(
    () => data.open
      .filter((t) => phaseOf(t.status) === 'delayed')
      .sort((a, b) => new Date(tripDayIso(a) ?? 0).getTime() - new Date(tripDayIso(b) ?? 0).getTime()),
    [data.open],
  );

  // All: the board's sections. A chip narrows Now to one group — Delayed
  // (every delayed / emergency trip, started or not) or one of the sections.
  const nowGroups = useMemo(() => [
    { key: 'delayed' as const, label: 'Delayed', title: 'Delayed · longest first', tone: '#D92D20', data: delayedTrips },
    { key: 'lateStart' as const, label: 'Not started', title: 'Not started — past start time', tone: '#B54708', data: board.lateStart },
    { key: 'attention' as const, label: 'Needs attention', title: 'Needs attention', tone: '#D92D20', data: board.attention },
    { key: 'road' as const, label: 'On the road', title: 'On the road', tone: '#2F5FD0', data: board.road },
  ], [board, delayedTrips]);
  const nowTotal = board.lateStart.length + board.attention.length + board.road.length;
  const activeFilter = nowFilter !== 'all' && nowGroups.find((g) => g.key === nowFilter)?.data.length ? nowFilter : 'all';
  const nowSections = useMemo(
    () => (activeFilter === 'all' ? nowGroups.filter((g) => g.key !== 'delayed') : nowGroups.filter((g) => g.key === activeFilter))
      .filter((g) => g.data.length > 0),
    [nowGroups, activeFilter],
  );

  // ── Schedule: open trips only — counts per day and the chosen day's trips ─
  // Only trips still to start: once a trip is on the road it's in Now (TestFlight: "Schedule shows on the road").
  const toRun = useMemo(() => data.window.filter((t) => t.status === 'Draft' || t.status === 'Scheduled' || isLateToStart(t)), [data.window]);
  const perDay = useMemo(() => countByDay(toRun, f, tripDayIso, now), [toRun, f, now]);
  // From today on; earlier days only while a trip planned then still hasn't run.
  const days = useMemo(() => {
    const earliest = [...perDay.keys()].sort()[0];
    return dayRange(todayKey, earliest && earliest < todayKey ? -daysBetween(todayKey, earliest) : 0, SCHEDULE_AFTER);
  }, [perDay, todayKey]);
  const dayTrips = useMemo(() => tripsOn(toRun, f, tripDayIso, selectedDay, false), [toRun, f, selectedDay]);
  const selectedCount = perDay.get(selectedDay);
  // Trips planned for the chosen day that the driver already started on an earlier day.
  const ranEarly = useMemo(
    () => data.windowStarted.filter((t) => t.actual_start && t.planned_start && f.dayKey(t.planned_start) === selectedDay && f.dayKey(t.actual_start) < selectedDay),
    [data.windowStarted, f, selectedDay],
  );

  // ── History: the same strip, by the day each trip finished ─────────────────
  const historyPerDay = useMemo(() => countByDay(data.history, f, historyDayIso, now), [data.history, f, now]);
  const historyLatest = useMemo(() => [...historyPerDay.keys()].sort().reverse(), [historyPerDay]);
  // Opens on the latest day anything finished (today, if something did).
  const historyDefault = historyLatest.find((k) => k <= todayKey) ?? todayKey;
  const historySelected = historyDay ?? historyDefault;
  const historyDays = useMemo(() => {
    const last = historyLatest[0] && historyLatest[0] > todayKey ? historyLatest[0] : todayKey;
    return dayRange(todayKey, HISTORY_DAYS, daysBetween(todayKey, last));
  }, [historyLatest, todayKey]);
  const historyAll = useMemo(() => tripsOn(data.history, f, historyDayIso, historySelected, true), [data.history, f, historySelected]);
  // Filter (TestFlight: "add filter, deleted and completed"): delivered / cancelled / deleted that day.
  const deletedOnDay = useMemo(
    () => data.deleted.filter((d) => f.dayKey(d.deletedAt) === historySelected).sort((a, b) => b.deletedAt.localeCompare(a.deletedAt)),
    [data.deleted, f, historySelected],
  );
  const historyTrips = useMemo(
    () => historyFilter === 'deleted' ? []
      : historyFilter === 'all' ? historyAll
      : historyAll.filter((t) => (historyFilter === 'cancelled') === (t.status === 'Cancelled')),
    [historyAll, historyFilter],
  );
  const historyCount = historyPerDay.get(historySelected);

  // Trips that double-book a driver or truck, across everything loaded.
  // Only lists kept current on this tab (TestFlight 29 Oct: "TRP-0092 already deleted .. but still
  // showing overlaps" — Now read the Schedule list, which doesn't reload away from its tab, so a
  // trip deleted since kept clashing). Deleted trips are left out as well.
  const clashes = useMemo(() => {
    const gone = new Set(data.deleted.map((d) => d.id));
    const seen = new Map<string, OperatorTrip>();
    const lists = view === 'schedule' ? [...data.window, ...data.open] : view === 'history' ? [] : data.open;
    for (const t of [...lists, ...(data.searching ? data.results : [])]) if (!gone.has(t.id) && !(t as { deletedAt?: string | null }).deletedAt) seen.set(t.id, t);
    return clashesOf([...seen.values()]);
  }, [view, data.window, data.open, data.results, data.searching, data.deleted]);

  const renderCard = (t: OperatorTrip, showDay = false) => (
    <TripCard trip={t} f={f} now={now} showDay={showDay} clash={clashes.get(t.id)} onPress={open} onLongPress={setActionsFor} />
  );

  const views: { id: ListView; label: string; icon: LucideIcon; badge?: number }[] = [
    { id: 'now', label: 'Now', icon: Radio, badge: delayedTrips.length || undefined },
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
        {/* One company's trips only (TestFlight 29 Oct: "filter company wise"). */}
        <TouchableOpacity
          onPress={() => { tap(); setCompanyOpen(true); }}
          hitSlop={8}
          style={[s.companyBtn, scope?.kind === 'customer' && s.companyBtnOn]}
          accessibilityLabel="Filter by company"
        >
          <Building2 size={16} color={scope?.kind === 'customer' ? Colors.white : MUTED} />
        </TouchableOpacity>
      </View>
      <CompanyFilterSheet
        visible={companyOpen}
        onClose={() => setCompanyOpen(false)}
        onPick={(c) => {
          setCompanyOpen(false);
          setScope({ kind: 'customer', filter: { customer_id: c.id }, label: c.name });
          router.setParams({ vehicleId: undefined, plate: undefined, customerId: c.id, customerName: c.name });
        }}
      />

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

          {view === 'now' ? (
            <SectionList
              sections={nowSections}
              keyExtractor={(t) => t.id}
              contentContainerStyle={s.list}
              refreshControl={refreshControl}
              stickySectionHeadersEnabled={false}
              ListHeaderComponent={nowTotal > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterBleed} contentContainerStyle={s.filters}>
                  <FilterChip label="All" count={nowTotal} on={activeFilter === 'all'} onPress={() => setNowFilter('all')} />
                  {nowGroups.filter((g) => g.data.length > 0).map((g) => (
                    <FilterChip key={g.key} label={g.label} count={g.data.length} tone={g.tone} on={activeFilter === g.key} onPress={() => setNowFilter(g.key)} />
                  ))}
                </ScrollView>
              ) : null}
              renderSectionHeader={({ section }) => <SectionHead title={section.title} count={section.data.length} tone={(section as any).tone} />}
              renderItem={({ item }) => renderCard(item, true)}
              ItemSeparatorComponent={Gap}
              // A failed load says so — it used to read "Nothing on the road" while trips were out.
              ListEmptyComponent={data.openLoading ? <Loading /> : data.error ? <ErrorState message="Couldn't load trips." onRetry={refresh} /> : <Empty icon={CircleCheckBig} title="Nothing on the road" text="Trips show here once they start. Upcoming trips are in Schedule." good />}
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
                <View style={{ gap: 12, marginBottom: 12 }}>
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
                      {selectedCount?.attention ? <Text style={{ color: '#B42318' }}> · {selectedCount.attention} need attention</Text> : null}
                    </Text>
                  </View>
                  {dayTrips.length ? <RepeatLink onPress={() => { tap(); setRepeatOpen(true); }} /> : null}
                  {ranEarly.map((t) => (
                    <TouchableOpacity key={t.id} style={s.earlyRow} onPress={() => { tap(); open(t); }} activeOpacity={0.7} accessibilityRole="button">
                      <CircleCheckBig size={16} color="#146C3C" />
                      <Text style={s.earlyText} numberOfLines={2}>
                        <Text style={{ fontWeight: '800' }}>{t.ref_id ?? 'Trip'}</Text>
                        {` · ${driverNameOf(t) ?? 'driver'} · planned this day, started ${dayLabel(f.dayKey(t.actual_start as string), todayKey, f).replace(/^(Yesterday|Today)$/, (w) => w.toLowerCase())} ${f.time(t.actual_start as string)}`}
                        {phaseOf(t.status) === 'done' ? ' · delivered' : ' · on the road'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              ListEmptyComponent={data.windowLoading ? <Loading /> : data.error ? <ErrorState message="Couldn't load trips." onRetry={refresh} /> : (
                <Empty
                  icon={CalendarDays}
                  title="No trips to run this day"
                  text="Pick another day, or create a trip. Delivered and cancelled trips are in History."
                  action={{ label: 'New trip', icon: Plus, onPress: () => router.push('/create-trip') }}
                />
              )}
            />
          ) : (
            <FlatList
              data={historyTrips}
              keyExtractor={(t) => t.id}
              contentContainerStyle={s.list}
              refreshControl={refreshControl}
              renderItem={({ item }) => renderCard(item)}
              ItemSeparatorComponent={Gap}
              ListHeaderComponent={(
                <View style={{ gap: 12, marginBottom: 12 }}>
                  {/* The ledger is its own page now (owner 30 Oct: "split the ledger page completely"). */}
                  <TouchableOpacity style={s.ledgerLink} onPress={() => { tap(); router.push('/ledger' as any); }} accessibilityRole="link">
                    <BookOpen size={14} color={INK} strokeWidth={2.3} />
                    <Text style={s.ledgerLinkText}>Trip ledger · every trip by number</Text>
                    <ChevronRight size={15} color={MUTED} />
                  </TouchableOpacity>
                  <DateStrip days={historyDays} selected={historySelected} today={todayKey} counts={historyPerDay} onSelect={(k) => { tap(); setHistoryDay(k); }} f={f} />
                  <View style={s.dayHead}>
                    <Text style={s.dayTitle}>{dayLabel(historySelected, todayKey, f)}</Text>
                    {historySelected !== historyDefault ? (
                      <TouchableOpacity onPress={() => { tap(); setHistoryDay(null); }} hitSlop={8} accessibilityRole="button">
                        <Text style={s.todayLink}>{historyDefault === todayKey ? 'Back to today' : 'Latest'}</Text>
                      </TouchableOpacity>
                    ) : null}
                    <View style={{ flex: 1 }} />
                    <Text style={s.dayCount}>
                      <Text style={{ color: '#146C3C' }}>{historyCount?.done ?? 0} delivered</Text>
                      {historyCount?.cancelled ? <Text> · {historyCount.cancelled} cancelled</Text> : null}
                    </Text>
                  </View>
                  {historyAll.length ? <RepeatLink onPress={() => { tap(); setRepeatOpen(true); }} /> : null}
                  <FilterChips
                    value={historyFilter}
                    onChange={(v) => setHistoryFilter(v)}
                    // Counts only when there is something, so all four fit on a phone.
                    items={[
                      { key: 'all', label: 'All', count: historyAll.length || undefined },
                      { key: 'done', label: 'Delivered', count: historyCount?.done || undefined },
                      { key: 'cancelled', label: 'Cancelled', count: historyCount?.cancelled || undefined },
                      { key: 'deleted', label: 'Deleted', count: deletedOnDay.length || undefined },
                    ]}
                  />
                  {historyFilter === 'deleted' ? deletedOnDay.map((d) => (
                    <TouchableOpacity key={d.id} style={s.deletedRow} onPress={() => { tap(); router.push('/recycle-bin'); }} activeOpacity={0.7} accessibilityRole="button">
                      <Text style={s.deletedRef}>{d.name}</Text>
                      <Text style={s.deletedWhen}>deleted {f.time(d.deletedAt)} · in the Recycle bin</Text>
                    </TouchableOpacity>
                  )) : null}
                </View>
              )}
              ListEmptyComponent={historyFilter === 'deleted' ? (deletedOnDay.length ? null : (
                <Empty icon={History} title="Nothing deleted this day" text="Deleted trips stay in the Recycle bin, where they can be restored." />
              )) : data.historyLoading ? <Loading /> : (
                <Empty
                  icon={History}
                  title="Nothing finished this day"
                  text="Finished trips show on the day they started, cancelled ones on their planned day. Trips still to run are in Schedule."
                  action={{ label: 'Open Schedule', icon: CalendarDays, onPress: () => { tap(); setView('schedule'); } }}
                />
              )}
            />
          )}
        </>
      )}

      <RepeatTripsSheet
        visible={repeatOpen}
        trips={view === 'schedule' ? dayTrips : historyAll}
        sourceDay={view === 'schedule' ? selectedDay : historySelected}
        todayKey={todayKey}
        f={f}
        onClose={() => setRepeatOpen(false)}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ['trips'] })}
      />

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
const RepeatLink = ({ onPress }: { onPress: () => void }) => (
  <TouchableOpacity onPress={onPress} style={s.repeat} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Repeat trips">
    <Copy size={15} color={INK} strokeWidth={2.4} />
    <Text style={s.repeatText}>Repeat trips…</Text>
  </TouchableOpacity>
);
const Loading = () => <ActivityIndicator color={Colors.primary} style={{ marginVertical: 30 }} />;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

type DayCount = { total: number; attention: number; done: number; cancelled: number };

/** Trips per day (by `dayOf`), for a date strip. */
function countByDay(trips: OperatorTrip[], f: TimeFmt, dayOf: (t: OperatorTrip) => string | null, now: number) {
  const m = new Map<string, DayCount>();
  for (const t of trips) {
    const iso = dayOf(t);
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
}

/** One day's trips (by `dayOf`), in time order — newest first for History. */
function tripsOn(trips: OperatorTrip[], f: TimeFmt, dayOf: (t: OperatorTrip) => string | null, key: string, newestFirst: boolean) {
  const at = (t: OperatorTrip) => new Date(dayOf(t) ?? 0).getTime();
  return trips
    .filter((t) => { const iso = dayOf(t); return iso && f.dayKey(iso) === key; })
    .sort((a, b) => (newestFirst ? at(b) - at(a) : at(a) - at(b)));
}

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

/** History: by day (the date strip) or the ledger (every trip by number). */
type NowFilter = 'all' | 'delayed' | 'lateStart' | 'attention' | 'road';

function FilterChip({ label, count, tone, on, onPress }: { label: string; count: number; tone?: string; on: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[s.fChip, on && s.fChipOn]} onPress={() => { if (!on) tap(); onPress(); }} activeOpacity={0.75} accessibilityRole="button" accessibilityState={{ selected: on }}>
      {tone && !on ? <View style={[s.sectionDot, { backgroundColor: tone }]} /> : null}
      <Text style={[s.fChipText, on && { color: Colors.white }]}>{label}</Text>
      <Text style={[s.fChipCount, { color: on ? Colors.white : tone ?? MUTED }]}>{count}</Text>
    </TouchableOpacity>
  );
}

function SectionHead({ title, count, tone }: { title: string; count: number; tone?: string }) {
  return (
    <View style={s.sectionHead}>
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
  companyBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ECEDF1' },
  companyBtnOn: { backgroundColor: INK },
  truckChipText: { fontSize: 12, fontWeight: '700', color: '#0C447C' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, gap: 12 },
  h1: { fontSize: 24, fontWeight: '700', color: INK, letterSpacing: -0.4 },
  h1sub: { fontSize: 13, fontWeight: '600', color: MUTED, marginTop: 1 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, height: 44, borderRadius: 14, backgroundColor: Colors.white, paddingHorizontal: 13, borderWidth: 1, borderColor: '#E9EAEE' },
  searchInput: { flex: 1, fontSize: 15, color: INK, paddingVertical: 0 },
  // One tab bar, same gutter as the search bar; the content below starts 12 under it.
  segment: { flexDirection: 'row', gap: 2, marginHorizontal: 16, marginTop: 10, backgroundColor: '#E6E8ED', borderRadius: 12, padding: 3 },
  segItem: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, height: 36, borderRadius: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 2 },
  segOn: { backgroundColor: Colors.white, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  segText: { fontSize: 13, fontWeight: '600', color: '#6E6E80' },
  segTextOn: { color: INK, fontWeight: '800' },
  badge: { minWidth: 17, height: 17, borderRadius: 9, backgroundColor: '#D92D20', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: Colors.white, fontSize: 11, fontWeight: '800' },
  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 120, flexGrow: 1 },
  resultsHead: { fontSize: 13, fontWeight: '700', color: MUTED, marginBottom: 10 },
  ledgerLink: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch', height: 40, paddingHorizontal: 12, borderRadius: 12, backgroundColor: Colors.white, borderWidth: 1, borderColor: '#E9EAEE' },
  ledgerLinkText: { flex: 1, fontSize: 13.5, fontWeight: '700', color: INK },
  // Bleed to the screen edges so the chips scroll under the page padding.
  filterBleed: { marginHorizontal: -16, marginBottom: 12, flexGrow: 0 },
  filters: { gap: 6, paddingHorizontal: 16 },
  fChip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: Colors.white, borderWidth: 1, borderColor: '#E9EAEE' },
  fChipOn: { backgroundColor: INK, borderColor: INK },
  fChipText: { fontSize: 13, fontWeight: '600', color: '#3F3F46' },
  fChipCount: { fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 4, paddingBottom: 10 },
  sectionDot: { width: 6, height: 6, borderRadius: 3 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#3F3F46' },
  sectionCount: { fontSize: 13, fontWeight: '500', color: '#A1A1AA' },
  dayHead: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 2 },
  todayLink: { fontSize: 13, fontWeight: '700', color: '#C4432F' },
  dayMonth: { fontSize: 9, lineHeight: 11, fontWeight: '800', letterSpacing: 0.4, color: '#C4432F', textTransform: 'uppercase' },
  dayTitle: { fontSize: 18, fontWeight: '800', color: INK },
  earlyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F2FBF5', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  earlyText: { flex: 1, fontSize: 13, color: '#146C3C' },
  // Wraps rather than cutting off "· 2 need attention" on narrow phones.
  deletedRow: { backgroundColor: Colors.white, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, gap: 2 },
  deletedRef: { fontSize: 15, fontWeight: '800', color: INK },
  deletedWhen: { fontSize: 13, color: MUTED },
  dayCount: { fontSize: 13, fontWeight: '700', color: MUTED, flexShrink: 1, textAlign: 'right' },
  repeat: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E4E4E8' },
  repeatText: { fontSize: 13, fontWeight: '800', color: INK },
  day: { width: 52, height: 80, borderRadius: 16, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center', gap: 1, borderWidth: 1, borderColor: '#EEF0F4' },
  dayOn: { backgroundColor: INK, borderColor: INK },
  dayToday: { borderColor: '#C4432F', borderWidth: 1.5 },
  dayWd: { fontSize: 11, fontWeight: '700', color: MUTED },
  dayNum: { fontSize: 19, fontWeight: '800', color: INK },
  dayDots: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 14 },
  dayDot: { width: 6, height: 6, borderRadius: 3 },
  dayCountSmall: { fontSize: 11, fontWeight: '800', color: MUTED },
  empty: { alignItems: 'center', gap: 6, backgroundColor: Colors.white, borderRadius: 18, padding: 24 },
  emptyIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#F4F5F8', alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: INK },
  emptyText: { fontSize: 13, color: MUTED, textAlign: 'center' },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, height: 40, paddingHorizontal: 16, borderRadius: 12, backgroundColor: INK },
  emptyBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white },
  qaRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 9 },
  qaIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  qaLabel: { fontSize: 15, fontWeight: '700', color: INK },
  qaSub: { fontSize: 12, color: MUTED, marginTop: 1 },
});

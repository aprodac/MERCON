/**
 * Trips board — the web dashboard's Kanban, made for a phone: one column per
 * status (Scheduled · Loading · In transit · Delayed). Columns scroll sideways
 * and snap; the tab strip on top jumps between them and follows the swipe.
 * Each column scrolls on its own. Moving a trip between columns happens on the
 * trip itself (status changes need its checks), so cards open the trip.
 */
import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, FlatList, StyleSheet, RefreshControl,
  useWindowDimensions, ActivityIndicator, type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import { Clock, MapPin, Truck, AlertTriangle, CircleCheckBig, type LucideIcon } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import type { OperatorTrip } from '../../../lib/operator';
import { niceName } from '../create/components/ui';
import { delayReasonOf, driverNameOf, plateOf, progressOf, routeOf, tripDayIso, type TimeFmt } from './tripListModel';

interface Column {
  id: string;
  label: string;
  icon: LucideIcon;
  color: string;
  tint: string;
  statuses: string[];
}

const COLUMNS: Column[] = [
  { id: 'scheduled', label: 'Scheduled', icon: Clock, color: '#4F46E5', tint: '#EEF2FF', statuses: ['Draft', 'Scheduled'] },
  { id: 'loading', label: 'Loading', icon: MapPin, color: '#0284C7', tint: '#E0F2FE', statuses: ['Loading'] },
  { id: 'transit', label: 'In transit', icon: Truck, color: '#D97706', tint: '#FEF3C7', statuses: ['InTransit'] },
  { id: 'delayed', label: 'Delayed', icon: AlertTriangle, color: '#E11D48', tint: '#FFE4E6', statuses: ['Delayed', 'Emergency'] },
];

const INK = '#18181B';
const MUTED = '#71717A';
const GAP = 12;

interface Props {
  trips: OperatorTrip[];
  f: TimeFmt;
  now: number;
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onOpen: (t: OperatorTrip) => void;
  onLongPress: (t: OperatorTrip) => void;
}

const BoardCard = memo(function BoardCard({ trip: t, col, f, now, onOpen, onLongPress }: {
  trip: OperatorTrip; col: Column; f: TimeFmt; now: number; onOpen: (t: OperatorTrip) => void; onLongPress: (t: OperatorTrip) => void;
}) {
  const route = routeOf(t);
  const driver = driverNameOf(t);
  const plate = plateOf(t);
  const prog = progressOf(t);
  const reason = col.id === 'delayed' ? delayReasonOf(t) : null;
  const iso = tripDayIso(t);
  const sameDay = iso ? f.dayKey(iso) === f.dayKey(now) : true;
  const when = iso ? (sameDay ? f.time(iso) : `${f.day(iso)} · ${f.time(iso)}`) : '';
  const pct = prog.total > 0 ? prog.done / prog.total : 0;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => onOpen(t)}
      onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); onLongPress(t); }}
      delayLongPress={300}
      style={s.card}
    >
      <View style={s.cardTop}>
        <Text style={s.ref}>{t.ref_id ?? t.id.slice(0, 8)}</Text>
        <Text style={s.when}>{when}</Text>
      </View>
      <Text style={s.customer}>{niceName(t.customer?.name) || 'No customer'}</Text>

      <View style={s.routeBox}>
        <View style={s.rail}>
          <View style={[s.railDot, { backgroundColor: '#16A34A' }]} />
          <View style={s.railLine} />
          <View style={[s.railDot, { backgroundColor: col.color }]} />
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={s.place}>{niceName(route.from)}</Text>
          <Text style={s.place}>{niceName(route.to)}{route.via > 0 ? <Text style={s.via}>{`   +${route.via} stops`}</Text> : null}</Text>
        </View>
      </View>

      {prog.total > 0 && col.id !== 'scheduled' ? (
        <View style={s.progressRow}>
          <View style={s.track}><View style={[s.fill, { width: `${Math.round(pct * 100)}%`, backgroundColor: col.color }]} /></View>
          <Text style={s.progText}>{prog.done}/{prog.total}</Text>
        </View>
      ) : null}
      {reason ? <Text style={s.reason}>{reason}</Text> : null}

      <View style={s.foot}>
        <Text style={[s.driver, !driver && { color: '#B42318' }]}>{driver ? niceName(driver) : 'No driver yet'}</Text>
        {plate ? <Text style={s.plate}>{plate}</Text> : !t.is_third_party ? <Text style={[s.plate, { color: '#B42318', fontFamily: undefined }]}>No truck</Text> : null}
      </View>
    </TouchableOpacity>
  );
});

export function KanbanBoard({ trips, f, now, loading, refreshing, onRefresh, onOpen, onLongPress }: Props) {
  const { width } = useWindowDimensions();
  const colW = width - 56;
  const list = useRef<ScrollView>(null);
  const tabsRef = useRef<ScrollView>(null);
  const tabX = useRef<number[]>([]);
  const [active, setActive] = useState(0);

  const grouped = useMemo(() => {
    const byStart = (a: OperatorTrip, b: OperatorTrip) => new Date(tripDayIso(a) ?? 0).getTime() - new Date(tripDayIso(b) ?? 0).getTime();
    return COLUMNS.map((c) => trips.filter((t) => c.statuses.includes(t.status)).sort(byStart));
  }, [trips]);

  // Open on the first column that has trips, once the data is in.
  const placed = useRef(false);
  useEffect(() => {
    if (placed.current || loading) return;
    placed.current = true;
    const first = grouped.findIndex((g) => g.length > 0);
    if (first > 0) {
      setActive(first);
      setTimeout(() => list.current?.scrollTo({ x: first * (colW + GAP), animated: false }), 0);
    }
  }, [loading, grouped, colW]);

  // Keep the active tab in view as the columns are swiped.
  useEffect(() => {
    const x = tabX.current[active];
    if (x != null) tabsRef.current?.scrollTo({ x: Math.max(0, x - 16), animated: true });
  }, [active]);

  const jump = (i: number) => {
    Haptics.selectionAsync().catch(() => {});
    setActive(i);
    list.current?.scrollTo({ x: i * (colW + GAP), animated: true });
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / (colW + GAP));
    if (i !== active && i >= 0 && i < COLUMNS.length) setActive(i);
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Column tabs */}
      <ScrollView ref={tabsRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs} style={{ flexGrow: 0 }}>
        {COLUMNS.map((c, i) => {
          const on = i === active;
          return (
            <TouchableOpacity key={c.id} onLayout={(e) => { tabX.current[i] = e.nativeEvent.layout.x; }} onPress={() => jump(i)} activeOpacity={0.8} style={[s.tab, on && { backgroundColor: c.tint, borderColor: c.color }]}>
              <c.icon size={14} color={on ? c.color : MUTED} strokeWidth={2.2} />
              <Text style={[s.tabText, on && { color: c.color }]}>{c.label}</Text>
              <Text style={[s.tabCount, on && { color: c.color }]}>{grouped[i].length}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Columns */}
      <ScrollView
        ref={list}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={colW + GAP}
        decelerationRate="fast"
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingHorizontal: 16, gap: GAP }}
        style={{ flex: 1 }}
      >
        {COLUMNS.map((c, i) => (
          <View key={c.id} style={[s.column, { width: colW, backgroundColor: c.tint + '99' }]}>
            <View style={s.colHead}>
              <View style={[s.colDot, { backgroundColor: c.color }]} />
              <Text style={[s.colTitle, { color: c.color }]}>{c.label}</Text>
              <View style={[s.colBadge, { backgroundColor: c.color }]}><Text style={s.colBadgeText}>{grouped[i].length}</Text></View>
            </View>
            <FlatList
              data={grouped[i]}
              keyExtractor={(t) => t.id}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 8, paddingTop: 0, paddingBottom: 130, gap: 8, flexGrow: 1 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
              renderItem={({ item }) => <BoardCard trip={item} col={c} f={f} now={now} onOpen={onOpen} onLongPress={onLongPress} />}
              ListEmptyComponent={
                loading ? <ActivityIndicator color={c.color} style={{ marginTop: 30 }} /> : (
                  <View style={s.empty}>
                    <CircleCheckBig size={22} color={c.color} strokeWidth={2} />
                    <Text style={s.emptyText}>{`Nothing ${c.id === 'delayed' ? 'delayed' : c.id === 'scheduled' ? 'scheduled' : c.id === 'loading' ? 'loading' : 'in transit'}`}</Text>
                  </View>
                )
              }
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  tabs: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: Colors.white, borderWidth: 1, borderColor: '#E4E4E7' },
  tabText: { fontSize: 13, fontWeight: '700', color: '#3F3F46' },
  tabCount: { fontSize: 12, fontWeight: '800', color: MUTED },

  column: { borderRadius: 18, overflow: 'hidden', marginBottom: 0 },
  colHead: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, paddingBottom: 10 },
  colDot: { width: 8, height: 8, borderRadius: 4 },
  colTitle: { flex: 1, fontSize: 14, fontWeight: '800' },
  colBadge: { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  colBadgeText: { fontSize: 12, fontWeight: '800', color: '#fff' },

  card: { backgroundColor: Colors.white, borderRadius: 14, padding: 12, gap: 8, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  ref: { fontSize: 12, fontWeight: '700', color: MUTED },
  when: { fontSize: 12, fontWeight: '600', color: MUTED, fontVariant: ['tabular-nums'] },
  customer: { fontSize: 15, fontWeight: '700', color: INK, lineHeight: 20 },
  routeBox: { flexDirection: 'row', gap: 10, backgroundColor: '#F7F7F9', borderRadius: 10, padding: 10 },
  rail: { alignItems: 'center', paddingVertical: 4 },
  railDot: { width: 8, height: 8, borderRadius: 4 },
  railLine: { flex: 1, width: 2, backgroundColor: '#E4E4E7', marginVertical: 3, minHeight: 8 },
  place: { fontSize: 14, fontWeight: '600', color: '#27272A', lineHeight: 18 },
  via: { fontSize: 12, fontWeight: '500', color: MUTED },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  track: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#E4E4E7', overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
  progText: { fontSize: 11, fontWeight: '700', color: MUTED, fontVariant: ['tabular-nums'] },
  reason: { fontSize: 12, fontWeight: '600', color: '#B42318' },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F4F4F5' },
  driver: { flex: 1, fontSize: 13, fontWeight: '600', color: '#3F3F46', lineHeight: 17 },
  plate: { fontSize: 12, fontWeight: '700', color: '#3F3F46', fontFamily: 'monospace', backgroundColor: '#F4F4F5', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, overflow: 'hidden' },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 36 },
  emptyText: { fontSize: 13, fontWeight: '600', color: MUTED },
});

/**
 * The Fleet map's lane card ("Riyadh → Jeddah", laneModel.ts):
 *
 *   Header     both ends, road distance and drive time at truck speed, swap
 *              direction, close.
 *   Take it    free trucks near A, closest first, with the drive to A and the
 *              driver who goes with each; Book starts Create trip with the
 *              lane and that truck. None in range: the nearest anywhere, and
 *              "Search 100 km around".
 *   On the road  running trips A then B: how far along, ETA at B, late in red.
 *   Booked     scheduled and draft trips on the lane by start day (Scheduled
 *              list rows — Find truck when one has none).
 * Tapping a truck shows it on the map; the card comes back when it's closed.
 */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ArrowUpDown, Plus, X } from 'lucide-react-native';
import type { LiveUnit } from '../../lib/operator';
import type { makeTime } from '../trips/list/tripListModel';
import { niceName } from '../trips/create/components/ui';
import { SheetFrame } from './FleetSheet';
import { ScheduledRow, type ScheduledTrip } from './FleetLists';
import { LANE_A } from './FleetMap';
import { formatDuration, formatKm, type Place, type TruckCandidate } from './fleetModel';
import { LANE_WIDE_KM, type LaneRun } from './laneModel';

const INK = '#3E3C3D';
const MUTED = '#6B6B76';
const RED = '#D92D20';

type Time = ReturnType<typeof makeTime>;
type Tab = 'take' | 'road' | 'booked';

export interface LaneSheetProps {
  from: Place;
  to: Place;
  /** Road A→B; null while loading or when routing is down (then straight-line km). */
  road: { km: number; seconds: number | null; isRoad: boolean } | null;
  radiusKm: number;
  onWiden: () => void;
  free: { inRange: TruckCandidate[]; nearest: TruckCandidate[] };
  /** Drive time to A per truck key, when routed. */
  toStart: Map<string, number>;
  runs: LaneRun[];
  /** Arrival at B per truck key, when routed. */
  arrivals: Map<string, Date>;
  booked: ScheduledTrip[];
  /** The trips list sends only the newest 100 booked trips. */
  bookedCapped: boolean;
  f: Time;
  now: number;
  onSwap: () => void;
  onClose: () => void;
  onPickTruck: (key: string) => void;
  onCreateTrip: (vehicleId: string | null) => void;
  onOpenTrip: (tripId: string) => void;
  onFindTruck: (tripId: string) => void;
  onHeight: (h: number) => void;
}

export function LaneSheet(p: LaneSheetProps) {
  const [tab, setTab] = useState<Tab>('take');
  const { from, to } = p;
  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'take', label: 'Take it', count: p.free.inRange.length },
    { id: 'road', label: 'On the road', count: p.runs.length },
    { id: 'booked', label: 'Booked', count: p.booked.length },
  ];

  return (
    <SheetFrame onHeight={p.onHeight}>
      <View style={s.top}>
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={1}>{from.label} → {to.label}</Text>
          <Text style={s.sub}>
            {p.road
              ? `${p.road.isRoad ? '' : '~'}${formatKm(p.road.km)}${p.road.seconds != null ? ` · ~${formatDuration(p.road.seconds)} by truck` : ' straight line'}`
              : 'Finding the road…'}
          </Text>
        </View>
        <TouchableOpacity onPress={p.onSwap} hitSlop={8} style={s.round} accessibilityLabel={`Swap to ${to.label} to ${from.label}`}>
          <ArrowUpDown size={15} color={INK} />
        </TouchableOpacity>
        <TouchableOpacity onPress={p.onClose} hitSlop={8} style={s.round} accessibilityLabel="Close lane">
          <X size={16} color={MUTED} />
        </TouchableOpacity>
      </View>

      <View style={s.tabs} accessibilityRole="tablist">
        {tabs.map((t) => {
          const on = tab === t.id;
          return (
            <TouchableOpacity key={t.id} style={[s.tab, on && s.tabOn]} onPress={() => setTab(t.id)} accessibilityRole="tab" accessibilityState={{ selected: on }} activeOpacity={0.8}>
              <Text style={[s.tabText, on && { color: INK }]} numberOfLines={1}>{t.label}</Text>
              <Text style={s.tabCount}>{t.count}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled">
        {tab === 'take' ? <TakeIt {...p} /> : tab === 'road' ? <OnRoad {...p} /> : <Booked {...p} />}
      </ScrollView>

      <TouchableOpacity style={s.create} onPress={() => p.onCreateTrip(null)} activeOpacity={0.85} accessibilityLabel={`Create a trip ${from.label} to ${to.label}`}>
        <Plus size={16} color="#FFFFFF" strokeWidth={2.5} />
        <Text style={s.createText}>Create trip {from.label} → {to.label}</Text>
      </TouchableOpacity>
    </SheetFrame>
  );
}

function TakeIt(p: LaneSheetProps) {
  const { inRange, nearest } = p.free;
  if (inRange.length) {
    return <>{inRange.map((c, i) => <TruckRow key={c.unit.key} c={c} first={i === 0} {...p} />)}</>;
  }
  return (
    <View>
      <Text style={s.empty}>No free truck within {p.radiusKm} km of {p.from.label}.</Text>
      {p.radiusKm < LANE_WIDE_KM ? (
        <TouchableOpacity style={s.widen} onPress={p.onWiden} activeOpacity={0.8}>
          <Text style={s.widenText}>Search {LANE_WIDE_KM} km around</Text>
        </TouchableOpacity>
      ) : null}
      {nearest.length ? <Text style={s.group}>Nearest free trucks</Text> : null}
      {nearest.map((c, i) => <TruckRow key={c.unit.key} c={c} first={i === 0} {...p} />)}
    </View>
  );
}

function TruckRow({ c, first, from, toStart, onPickTruck, onCreateTrip }: LaneSheetProps & { c: TruckCandidate; first: boolean }) {
  const secs = toStart.get(c.unit.key);
  const away = c.km < 1 ? `At ${from.label}` : `${formatKm(c.km)}${secs != null ? ` · ${formatDuration(secs)}` : ''} to ${from.label}`;
  return (
    <TouchableOpacity style={[s.row, !first && s.rule]} onPress={() => onPickTruck(c.unit.key)} activeOpacity={0.6}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.plate} numberOfLines={1}>{c.unit.vehicle?.plate_number ?? 'Truck'}</Text>
        {c.blocker ? <Text style={s.blocker} numberOfLines={1}>{c.blocker}</Text> : <Text style={s.line} numberOfLines={1}>{niceName(c.driver?.name) || 'No driver'}</Text>}
        <Text style={s.line} numberOfLines={1}>{away}{c.notes.length ? ` · ${c.notes.join(' · ')}` : ''}</Text>
      </View>
      {c.unit.vehicle ? (
        <TouchableOpacity style={s.book} onPress={() => onCreateTrip(c.unit.vehicle!.id)} hitSlop={6} accessibilityLabel={`Create a trip with ${c.unit.vehicle.plate_number}`}>
          <Text style={s.bookText}>Book</Text>
        </TouchableOpacity>
      ) : null}
    </TouchableOpacity>
  );
}

function OnRoad({ runs, arrivals, from, to, f, onPickTruck }: LaneSheetProps) {
  if (!runs.length) return <Text style={s.empty}>Nothing running {from.label} → {to.label} right now.</Text>;
  return (
    <>
      {runs.map((r, i) => {
        const u: LiveUnit = r.unit;
        const at = arrivals.get(u.key) ?? null;
        const lateMin = at && r.stop.planned_arrival ? Math.round((at.getTime() - new Date(r.stop.planned_arrival).getTime()) / 60000) : null;
        const late = lateMin != null && lateMin > 5;
        return (
          <TouchableOpacity key={u.key} style={[s.row, i > 0 && s.rule]} onPress={() => onPickTruck(u.key)} activeOpacity={0.6}>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={s.between}>
                <Text style={s.plate} numberOfLines={1}>{u.vehicle?.plate_number ?? u.trip?.ref_id ?? 'Truck'}</Text>
                <Text style={[s.eta, late && { color: RED }]}>
                  {at ? `${to.label} ${f.time(at.toISOString())}` : u.trip?.phase === 'delayed' ? 'Delayed' : ''}
                  {late ? ` · ${formatDuration(lateMin! * 60)} late` : ''}
                </Text>
              </View>
              <Text style={s.line} numberOfLines={1}>{[u.trip?.ref_id, niceName(u.trip?.customer_name), niceName(u.driver?.name)].filter(Boolean).join(' · ')}</Text>
              {r.progress != null ? (
                <View style={s.progressRow}>
                  <View style={s.bar}><View style={[s.barFill, { width: `${Math.round(r.progress * 100)}%` }, (late || u.trip?.phase === 'delayed') && { backgroundColor: RED }]} /></View>
                  <Text style={s.pct}>{Math.round(r.progress * 100)}%</Text>
                </View>
              ) : <Text style={s.line}>No position</Text>}
            </View>
          </TouchableOpacity>
        );
      })}
    </>
  );
}

function Booked({ booked, bookedCapped, from, to, f, now, onOpenTrip, onFindTruck }: LaneSheetProps) {
  if (!booked.length) return <Text style={s.empty}>Nothing booked {from.label} → {to.label}.</Text>;
  const today = f.dayKey(now);
  const dayOf = (t: ScheduledTrip) => (t.planned_start ? f.dayKey(t.planned_start) : 'none');
  return (
    <>
      {booked.map((t, i) => {
        const key = dayOf(t);
        // A day heading over the first trip of each start day.
        const head = i === 0 || dayOf(booked[i - 1]) !== key
          ? key === 'none' ? 'No start time' : key === today ? 'Today' : key < today ? 'Should have started' : f.day(t.planned_start)
          : null;
        return (
          <View key={t.id}>
            {head ? <Text style={[s.group, key !== 'none' && key < today && { color: RED }]}>{head}</Text> : null}
            <ScheduledRow trip={t} f={f} now={now} onPress={() => onOpenTrip(t.id)} onFindTruck={() => onFindTruck(t.id)} />
          </View>
        );
      })}
      {bookedCapped ? <Text style={s.note}>Looked through the newest 100 booked trips.</Text> : null}
    </>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 18, fontWeight: '800', color: INK },
  sub: { fontSize: 13, color: MUTED, marginTop: 1 },
  round: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#F1F1F3', alignItems: 'center', justifyContent: 'center' },

  tabs: { flexDirection: 'row', gap: 4, backgroundColor: '#EFEFF1', borderRadius: 12, padding: 3 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, height: 32, borderRadius: 10 },
  tabOn: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  tabText: { fontSize: 13, fontWeight: '600', color: MUTED },
  tabCount: { fontSize: 12, color: MUTED, fontVariant: ['tabular-nums'] },

  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  rule: { borderTopWidth: 1, borderTopColor: '#F1F1F3' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  plate: { fontSize: 15, fontWeight: '700', color: INK, flexShrink: 1 },
  line: { fontSize: 13, color: MUTED },
  blocker: { fontSize: 13, fontWeight: '600', color: RED },
  eta: { fontSize: 13, fontWeight: '700', color: INK, fontVariant: ['tabular-nums'] },
  book: { height: 32, borderRadius: 9, backgroundColor: LANE_A, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  bookText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: '#EFEFF1', overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: INK },
  pct: { fontSize: 12, color: MUTED, fontVariant: ['tabular-nums'], width: 34, textAlign: 'right' },

  empty: { fontSize: 14, color: MUTED, paddingVertical: 14, textAlign: 'center' },
  widen: { alignSelf: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#E4E4E7', paddingHorizontal: 14, paddingVertical: 8, marginBottom: 6 },
  widenText: { fontSize: 13, fontWeight: '700', color: INK },
  group: { fontSize: 12, fontWeight: '700', color: INK, textTransform: 'uppercase', letterSpacing: 0.5, paddingTop: 10, paddingBottom: 2 },
  note: { fontSize: 12, color: MUTED, paddingTop: 8 },

  create: { height: 46, borderRadius: 14, backgroundColor: INK, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  createText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});

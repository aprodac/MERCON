/**
 * Route: /fleet-map — every truck on the road on one map.
 * Filter pills on top (All · Delayed · No GPS); tap a truck for its card
 * (plate, driver, trip, next stop, last seen) with Call and Open trip.
 * Refreshes every 30 s, the same live feed as Home.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Phone } from 'lucide-react-native';
import { operatorService, type LiveUnit } from '../../lib/operator';
import { AppTopBar } from '@/components/AppTopBar';
import { niceName } from '../trips/create/components/ui';
import { FleetMap, STATE_STYLE, isDelayed, isSilent, unitState } from './FleetMap';

const INK = '#18181B';
const MUTED = '#6B6B76';

type Filter = 'all' | 'delayed' | 'silent';

function seenText(iso: string | null | undefined, now: number): string {
  if (!iso) return 'No GPS yet';
  const min = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'Seen just now';
  if (min < 60) return `Seen ${min} min ago`;
  const h = Math.floor(min / 60);
  return h < 48 ? `Seen ${h} h ago` : `Seen ${Math.floor(h / 24)} days ago`;
}

export default function FleetMapScreen() {
  const router = useRouter();
  const live = useQuery({ queryKey: ['dashboard', 'actions', 'live-map'], queryFn: () => operatorService.liveMap(), refetchInterval: 30_000 });
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const now = Date.now();

  // Only trucks out on a trip — the question is "where is my fleet working".
  const onRoad = useMemo(() => (live.data ?? []).filter((u) => u.trip && u.trip.phase !== 'upcoming'), [live.data]);
  // Independent counts: a delayed truck with no GPS is in both.
  const counts = useMemo(() => ({
    delayed: onRoad.filter(isDelayed).length,
    silent: onRoad.filter((u) => isSilent(u, now)).length,
  }), [onRoad, now]);
  const shown = filter === 'all' ? onRoad : filter === 'delayed' ? onRoad.filter(isDelayed) : onRoad.filter((u) => isSilent(u, now));
  const unit = onRoad.find((u) => u.key === selected) ?? null;
  const noLocation = shown.filter((u) => !u.position).length;

  const pills: { id: Filter; label: string; n: number }[] = [
    { id: 'all', label: 'All', n: onRoad.length },
    { id: 'delayed', label: 'Delayed', n: counts.delayed },
    { id: 'silent', label: 'No GPS', n: counts.silent },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F6F6F7' }} edges={['top']}>
      <AppTopBar title="Fleet map" onBack={() => router.back()} />
      <View style={{ flex: 1 }}>
        <FleetMap units={shown} selected={selected} onSelect={setSelected} interactive padding={{ top: 70, bottom: unit ? 230 : 90 }} />

        <View style={s.pills} pointerEvents="box-none">
          {pills.map((p) => {
            const on = filter === p.id;
            return (
              <TouchableOpacity key={p.id} style={[s.pill, on && s.pillOn]} onPress={() => { setFilter(p.id); setSelected(null); }} activeOpacity={0.8}>
                {p.id !== 'all' ? <View style={[s.dot, { backgroundColor: STATE_STYLE[p.id].color }]} /> : null}
                <Text style={[s.pillText, on && { color: '#FFFFFF' }]}>{p.label}</Text>
                <Text style={[s.pillCount, on && { color: 'rgba(255,255,255,0.7)' }]}>{p.n}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {unit ? (
          <UnitCard unit={unit} now={now} onOpen={(id) => router.push({ pathname: '/trip-details', params: { id } })} />
        ) : (
          <View style={s.hint}>
            <Text style={s.hintText}>
              {live.isLoading ? 'Loading trucks…' : `${shown.length} ${shown.length === 1 ? 'truck' : 'trucks'} · tap one for details`}
              {noLocation ? ` · ${noLocation} without a location` : ''}
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

function UnitCard({ unit: u, now, onOpen }: { unit: LiveUnit; now: number; onOpen: (tripId: string) => void }) {
  const state = unitState(u, now);
  const t = u.trip;
  const next = t && t.next_stop_index != null ? t.stops[t.next_stop_index] : null;
  const phone = u.driver?.phone ?? null;
  return (
    <View style={s.card}>
      <View style={s.cardTop}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.plate}>{u.vehicle?.plate_number ?? 'No truck'}</Text>
          <Text style={s.driver}>{u.driver ? niceName(u.driver.name) : 'No driver'}</Text>
        </View>
        <View style={{ gap: 6, alignItems: 'flex-end' }}>
          <View style={[s.state, { backgroundColor: state === 'delayed' ? '#FEE4E2' : '#F1F1F3' }]}>
            <View style={[s.dot, { backgroundColor: STATE_STYLE[state].color }]} />
            <Text style={[s.stateText, state === 'delayed' && { color: '#B42318' }]}>{STATE_STYLE[state].label}</Text>
          </View>
          {state === 'delayed' && isSilent(u, now) ? (
            <View style={[s.state, { backgroundColor: '#F1F1F3' }]}>
              <View style={[s.dot, { backgroundColor: STATE_STYLE.silent.color }]} />
              <Text style={s.stateText}>No GPS</Text>
            </View>
          ) : null}
        </View>
      </View>
      {t ? (
        <Text style={s.line}>
          {[t.ref_id, niceName(t.customer_name)].filter(Boolean).join(' · ')}
          {next?.name ? `\nNext: ${niceName(next.name)}` : ''}
        </Text>
      ) : null}
      <Text style={s.seen}>{seenText(u.position?.recorded_at, now)}</Text>
      <View style={s.actions}>
        {phone ? (
          <TouchableOpacity style={s.call} onPress={() => Linking.openURL(`tel:${phone}`).catch(() => {})} accessibilityLabel="Call driver">
            <Phone size={17} color="#3F3F46" strokeWidth={2.2} />
          </TouchableOpacity>
        ) : null}
        {t ? (
          <TouchableOpacity style={s.open} onPress={() => onOpen(t.id)} activeOpacity={0.85}>
            <Text style={s.openText}>Open trip</Text>
            <ChevronRight size={16} color="#FFFFFF" />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  pills: { position: 'absolute', top: 12, left: 16, right: 16, flexDirection: 'row', gap: 8 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 13, borderRadius: 18, backgroundColor: '#FFFFFF',
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  pillOn: { backgroundColor: INK },
  pillText: { fontSize: 13, fontWeight: '600', color: '#3F3F46' },
  pillCount: { fontSize: 13, color: MUTED, fontVariant: ['tabular-nums'] },
  dot: { width: 8, height: 8, borderRadius: 4 },
  hint: {
    position: 'absolute', bottom: 24, alignSelf: 'center', backgroundColor: '#FFFFFF', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  hintText: { fontSize: 13, fontWeight: '500', color: '#3F3F46' },
  card: {
    position: 'absolute', left: 12, right: 12, bottom: 20, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, gap: 8,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  plate: { fontSize: 18, fontWeight: '700', color: INK, fontFamily: 'monospace' },
  driver: { fontSize: 14, fontWeight: '500', color: '#3F3F46' },
  state: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  stateText: { fontSize: 12, fontWeight: '600', color: '#3F3F46' },
  line: { fontSize: 13, color: MUTED, lineHeight: 19 },
  seen: { fontSize: 12, fontWeight: '600', color: MUTED },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  call: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F1F1F3', alignItems: 'center', justifyContent: 'center' },
  open: { flex: 1, height: 44, borderRadius: 12, backgroundColor: INK, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  openText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
});

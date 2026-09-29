/**
 * Route: /fleet-map — the phone version of the web live map.
 *
 *   Search    plate, driver, trip no. or customer; or a city ("near Dammam",
 *             "jeddah") to see trucks within 50 km of it, closest first.
 *   Filters   All · On trip · Delayed · Free · No GPS (same as the web).
 *   Map/List  toggle; the list is sorted delayed → running → planned → free.
 *   Truck     ETA to the next stop (road drive time when routing is up), on
 *             time / late, GPS feed health, stop progress, the trip drawn on
 *             the map, and Call · Share ETA (WhatsApp) · Open trip.
 * Live feed refreshes every 30 s, the same one as Home.
 * Not ported from the web: assigning trucks and changing trip status —
 * those stay on the trip's own page.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, TextInput, ScrollView, FlatList, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, List, Map as MapIcon, MessageCircle, Phone, Search, Smartphone, Truck, X } from 'lucide-react-native';
import { operatorService, type LiveUnit } from '../../lib/operator';
import { AppTopBar } from '@/components/AppTopBar';
import { niceName } from '../trips/create/components/ui';
import { makeTime } from '../trips/list/tripListModel';
import { FleetMap, STATE_STYLE, unitState } from './FleetMap';
import {
  NEAR_KM, agoText, buildEtaShareText, computeEta, formatDuration, formatKm, haversineKm, isDelayed, isFree, isSilent,
  matchesFilter, matchesQuery, nextStop, onTrip, placeFromQuery, punctuality, unitPriority, type FleetFilter,
} from './fleetModel';

const INK = '#18181B';
const MUTED = '#6B6B76';
const LINE = '#E9E9EC';

const FILTERS: { id: FleetFilter; label: string; dot?: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'on_trip', label: 'On trip', dot: INK },
  { id: 'delayed', label: 'Delayed', dot: '#D92D20' },
  { id: 'free', label: 'Free', dot: '#FFFFFF' },
  { id: 'silent', label: 'No GPS', dot: '#9898A4' },
];

export default function FleetMapScreen() {
  const router = useRouter();
  const live = useQuery({ queryKey: ['dashboard', 'actions', 'live-map'], queryFn: () => operatorService.liveMap(), refetchInterval: 30_000 });
  const tzQ = useQuery({ queryKey: ['dashboard', 'tz'], queryFn: () => operatorService.deploymentTimezone(), staleTime: Infinity });
  const f = useMemo(() => makeTime(tzQ.data ?? 'Asia/Riyadh'), [tzQ.data]);

  const [filter, setFilter] = useState<FleetFilter>('all');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'map' | 'list'>('map');
  const [selected, setSelected] = useState<string | null>(null);
  const now = Date.now();
  const all = useMemo(() => live.data ?? [], [live.data]);

  const counts = useMemo(() => {
    const c = {} as Record<FleetFilter, number>;
    for (const x of FILTERS) c[x.id] = all.filter((u) => matchesFilter(u, x.id, now)).length;
    return c;
  }, [all, now]);

  // A city in the search box means "trucks near there"; anything else is a text match.
  const place = useMemo(() => placeFromQuery(query), [query]);
  const shown = useMemo(() => {
    const byFilter = all.filter((u) => matchesFilter(u, filter, now));
    if (place) {
      return byFilter
        .filter((u) => u.position)
        .map((u) => ({ u, km: haversineKm(u.position!, place) }))
        .filter((x) => x.km <= NEAR_KM)
        .sort((a, b) => a.km - b.km)
        .map((x) => x.u);
    }
    return byFilter.filter((u) => matchesQuery(u, query)).sort((a, b) => unitPriority(b) - unitPriority(a));
  }, [all, filter, place, query, now]);

  const unit = all.find((u) => u.key === selected) ?? null;
  const pick = (key: string | null) => { setSelected(key); if (key) setView('map'); };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F6F6F7' }} edges={['top']}>
      <AppTopBar
        title="Fleet map"
        onBack={() => router.back()}
        actions={[{ icon: view === 'map' ? List : MapIcon, label: view === 'map' ? 'Show list' : 'Show map', onPress: () => setView(view === 'map' ? 'list' : 'map') }]}
      />

      <View style={s.controls}>
        <View style={s.search}>
          <Search size={17} color={MUTED} />
          <TextInput
            value={query}
            onChangeText={(v) => { setQuery(v); setSelected(null); }}
            placeholder="Plate, driver, trip, customer or city"
            placeholderTextColor="#9898A4"
            style={s.searchInput}
            autoCorrect={false}
            returnKeyType="search"
          />
          {query ? <TouchableOpacity onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Clear search"><X size={17} color={MUTED} /></TouchableOpacity> : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pills} style={{ marginHorizontal: -16 }}>
          {FILTERS.map((p) => {
            const on = filter === p.id;
            return (
              <TouchableOpacity key={p.id} style={[s.pill, on && s.pillOn]} onPress={() => { setFilter(p.id); setSelected(null); }} activeOpacity={0.8}>
                {p.dot ? <View style={[s.dot, { backgroundColor: p.dot }, p.id === 'free' && { borderWidth: 1.5, borderColor: on ? '#FFFFFF' : INK }]} /> : null}
                <Text style={[s.pillText, on && { color: '#FFFFFF' }]}>{p.label}</Text>
                <Text style={[s.pillCount, on && { color: 'rgba(255,255,255,0.7)' }]}>{counts[p.id]}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        {place ? <Text style={s.near}>{shown.length} {shown.length === 1 ? 'truck' : 'trucks'} within {NEAR_KM} km of {place.label}</Text> : null}
      </View>

      {view === 'list' ? (
        <FlatList
          data={shown}
          keyExtractor={(u) => u.key}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#F1F1F3' }} />}
          style={s.listBox}
          renderItem={({ item }) => <UnitRow unit={item} now={now} km={place && item.position ? haversineKm(item.position, place) : null} onPress={() => pick(item.key)} />}
          ListEmptyComponent={<Text style={s.empty}>{live.isLoading ? 'Loading trucks…' : 'No trucks match.'}</Text>}
        />
      ) : (
        <View style={{ flex: 1 }}>
          <FleetMap
            units={shown}
            selected={selected}
            onSelect={setSelected}
            interactive
            focus={place ? { lat: place.lat, lng: place.lng, km: NEAR_KM } : null}
            padding={{ top: 70, bottom: unit ? 360 : 70 }}
          />
          {unit ? (
            <UnitCard unit={unit} now={now} f={f} onClose={() => setSelected(null)} onOpen={(id) => router.push({ pathname: '/trip-details', params: { id } })} />
          ) : (
            <View style={s.hint} pointerEvents="none">
              <Text style={s.hintText}>
                {live.isLoading ? 'Loading trucks…' : `${shown.length} ${shown.length === 1 ? 'truck' : 'trucks'} · tap one for details`}
                {shown.filter((u) => !u.position).length ? ` · ${shown.filter((u) => !u.position).length} not on the map` : ''}
              </Text>
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

function stateChip(u: LiveUnit, now: number) {
  const st = unitState(u, now);
  const bg = st === 'delayed' ? '#FEE4E2' : '#F1F1F3';
  const fg = st === 'delayed' ? '#B42318' : '#3F3F46';
  return (
    <View style={[s.state, { backgroundColor: bg }]}>
      <View style={[s.dot, { backgroundColor: STATE_STYLE[st].color }, st === 'free' && { borderWidth: 1.5, borderColor: INK }]} />
      <Text style={[s.stateText, { color: fg }]}>{STATE_STYLE[st].label}</Text>
    </View>
  );
}

function UnitRow({ unit: u, now, km, onPress }: { unit: LiveUnit; now: number; km: number | null; onPress: () => void }) {
  const next = nextStop(u);
  return (
    <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={0.6}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.rowPlate}>{u.vehicle?.plate_number ?? 'No truck'}<Text style={s.rowDriver}>{u.driver ? `  ·  ${niceName(u.driver.name)}` : ''}</Text></Text>
        <Text style={s.rowSub} numberOfLines={2}>
          {u.trip ? [u.trip.ref_id, niceName(u.trip.customer_name), next?.name ? `→ ${niceName(next.name)}` : null].filter(Boolean).join(' · ') : 'No trip'}
        </Text>
        <Text style={s.rowSeen}>
          {km != null ? `${formatKm(km)} away · ` : ''}{u.position ? `Seen ${agoText(u.position.recorded_at, now)}` : 'No location'}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        {stateChip(u, now)}
        <ChevronRight size={16} color="#A1A1AA" />
      </View>
    </TouchableOpacity>
  );
}

function UnitCard({ unit: u, now, f, onClose, onOpen }: {
  unit: LiveUnit; now: number; f: ReturnType<typeof makeTime>; onClose: () => void; onOpen: (tripId: string) => void;
}) {
  const t = u.trip;
  const next = nextStop(u);
  const phone = u.driver?.phone ?? null;

  // Road drive time to the next stop, when the routing service is up.
  const target = next && next.lat != null && next.lng != null ? { lat: next.lat, lng: next.lng } : null;
  const routeQ = useQuery({
    queryKey: ['fleet', 'eta', u.key, u.position?.recorded_at, target?.lat, target?.lng],
    queryFn: () => operatorService.routeEstimate(u.position!, target!),
    enabled: !!u.position && !!target && onTrip(u),
    staleTime: 60_000,
  });
  const eta = onTrip(u) ? computeEta(u, routeQ.data ?? null, now) : null;
  const p = punctuality(eta?.lateByMin ?? null);
  const done = t ? t.stops.filter((x) => x.actual_arrival).length : 0;

  const shareEta = () => {
    const text = buildEtaShareText(u, eta, (d) => f.time(d.toISOString()));
    Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`).catch(() => Alert.alert("Couldn't open WhatsApp"));
  };

  return (
    <View style={s.card}>
      <View style={s.cardTop}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.plate}>{u.vehicle?.plate_number ?? 'No truck'}</Text>
          <Text style={s.driver}>{u.driver ? niceName(u.driver.name) : 'No driver'}</Text>
        </View>
        {stateChip(u, now)}
        <TouchableOpacity onPress={onClose} hitSlop={8} style={s.close} accessibilityLabel="Close"><X size={16} color={MUTED} /></TouchableOpacity>
      </View>

      {t ? (
        <Text style={s.line}>
          {[t.ref_id, niceName(t.customer_name)].filter(Boolean).join(' · ')}
          {t.stops.length ? `  ·  ${done} of ${t.stops.length} stops done` : ''}
        </Text>
      ) : <Text style={s.line}>Free — no trip right now</Text>}

      {eta ? (
        <>
          <Text style={s.nextLine}>
            Next: <Text style={s.nextName}>{niceName(next?.name) || `Stop ${next?.sequence ?? ''}`}</Text>
            {p ? <Text style={{ color: p.good ? '#15803D' : '#B42318', fontWeight: '600' }}>{`  ·  ${p.label}`}</Text> : null}
          </Text>
          <View style={s.eta}>
            <Metric value={eta.arrival ? f.time(eta.arrival.toISOString()) : '—'} label="arrives" />
            <Metric value={eta.durationSeconds != null ? formatDuration(eta.durationSeconds) : '—'} label="drive time" />
            {eta.distanceKm != null ? <Metric value={formatKm(eta.distanceKm)} label={eta.distanceIsRoad ? 'by road' : 'direct'} /> : null}
          </View>
        </>
      ) : null}
      {eta && !eta.distanceIsRoad && !routeQ.isLoading ? <Text style={s.note}>Road routing unavailable — distance is a straight line.</Text> : null}

      <View style={s.feeds}>
        <Feed icon={Truck} label="Tracker" iso={u.vehicle_gps?.recorded_at} missing={!u.vehicle ? 'No truck' : !u.vehicle.has_tracker ? 'None fitted' : 'No fix yet'} now={now} />
        <Feed icon={Smartphone} label="Phone" iso={u.driver_gps?.recorded_at} missing={!u.driver ? 'No driver' : isFree(u) ? 'Off trip' : 'Silent'} now={now} />
      </View>
      {u.feeds_gap_m != null && u.feeds_gap_m > 1000 ? <Text style={[s.note, { color: '#B54708' }]}>Tracker and phone are {formatKm(u.feeds_gap_m / 1000)} apart</Text> : null}

      <View style={s.actions}>
        {phone ? (
          <TouchableOpacity style={s.iconBtn} onPress={() => Linking.openURL(`tel:${phone}`).catch(() => {})} accessibilityLabel="Call driver">
            <Phone size={17} color="#3F3F46" strokeWidth={2.2} />
          </TouchableOpacity>
        ) : null}
        {t && onTrip(u) ? (
          <TouchableOpacity style={s.iconBtn} onPress={shareEta} accessibilityLabel="Share ETA on WhatsApp">
            <MessageCircle size={17} color="#3F3F46" strokeWidth={2.2} />
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

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <View style={s.metric}>
      <Text style={s.metricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{value}</Text>
      <Text style={s.metricLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function Feed({ icon: Icon, label, iso, missing, now }: { icon: typeof Truck; label: string; iso?: string | null; missing: string; now: number }) {
  const fresh = iso ? now - new Date(iso).getTime() < 30 * 60_000 : false;
  return (
    <View style={s.feed}>
      <Icon size={14} color={MUTED} />
      <Text style={s.feedLabel}>{label}</Text>
      <View style={[s.feedDot, { backgroundColor: iso ? (fresh ? '#16A34A' : '#F79009') : '#D4D4D8' }]} />
      <Text style={s.feedVal} numberOfLines={1}>{iso ? agoText(iso, now) : missing}</Text>
    </View>
  );
}

const shadow = { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 4 };

const s = StyleSheet.create({
  controls: { paddingHorizontal: 16, paddingBottom: 10, gap: 10 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, borderRadius: 12, backgroundColor: '#FFFFFF', paddingHorizontal: 12, borderWidth: 1, borderColor: LINE },
  searchInput: { flex: 1, fontSize: 15, color: INK, paddingVertical: 0 },
  pills: { paddingHorizontal: 16, gap: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: LINE },
  pillOn: { backgroundColor: INK, borderColor: INK },
  pillText: { fontSize: 13, fontWeight: '600', color: '#3F3F46' },
  pillCount: { fontSize: 13, color: MUTED, fontVariant: ['tabular-nums'] },
  dot: { width: 8, height: 8, borderRadius: 4 },
  near: { fontSize: 13, fontWeight: '600', color: '#3F3F46' },

  listBox: { flex: 1, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: LINE },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13 },
  rowPlate: { fontSize: 15, fontWeight: '700', color: INK },
  rowDriver: { fontSize: 14, fontWeight: '500', color: '#3F3F46' },
  rowSub: { fontSize: 13, color: MUTED },
  rowSeen: { fontSize: 12, color: '#9898A4' },
  empty: { textAlign: 'center', color: MUTED, paddingTop: 40, fontSize: 14 },

  hint: { position: 'absolute', bottom: 24, alignSelf: 'center', backgroundColor: '#FFFFFF', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9, ...shadow },
  hintText: { fontSize: 13, fontWeight: '500', color: '#3F3F46' },

  card: { position: 'absolute', left: 12, right: 12, bottom: 20, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, gap: 10, ...shadow },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  plate: { fontSize: 18, fontWeight: '700', color: INK, fontFamily: 'monospace' },
  driver: { fontSize: 14, fontWeight: '500', color: '#3F3F46' },
  close: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F1F1F3', alignItems: 'center', justifyContent: 'center' },
  state: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  stateText: { fontSize: 12, fontWeight: '600' },
  line: { fontSize: 13, color: MUTED, lineHeight: 19 },
  eta: { flexDirection: 'row', gap: 8 },
  nextLine: { fontSize: 13, color: MUTED },
  nextName: { fontWeight: '600', color: INK },
  metric: { flex: 1, backgroundColor: '#F6F6F7', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  metricValue: { fontSize: 16, fontWeight: '700', color: INK, fontVariant: ['tabular-nums'] },
  metricLabel: { fontSize: 11, color: MUTED, marginTop: 1 },
  note: { fontSize: 11, color: MUTED },
  feeds: { flexDirection: 'row', gap: 8 },
  feed: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: LINE, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 7 },
  feedLabel: { fontSize: 12, fontWeight: '600', color: '#3F3F46' },
  feedDot: { width: 7, height: 7, borderRadius: 4 },
  feedVal: { flex: 1, fontSize: 12, color: MUTED },
  actions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  iconBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F1F1F3', alignItems: 'center', justifyContent: 'center' },
  open: { flex: 1, height: 44, borderRadius: 12, backgroundColor: INK, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  openText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
});

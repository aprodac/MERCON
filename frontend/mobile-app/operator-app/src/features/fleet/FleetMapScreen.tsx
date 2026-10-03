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
import React, { useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, TextInput, ScrollView, FlatList, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronRight, Compass, Focus, List, Map as MapIcon, MessageCircle, Minus, Moon, Navigation, Phone, Plus, Search, Smartphone, Sun, Truck, X,
  type LucideIcon,
} from 'lucide-react-native';
import { operatorService, type LiveUnit } from '../../lib/operator';
import { AppTopBar } from '@/components/AppTopBar';
import { niceName } from '../trips/create/components/ui';
import { makeTime } from '../trips/list/tripListModel';
import { FleetMap, STATE_STYLE, unitState, type FleetMapHandle, type FocusMode, type MapTheme, type MapView } from './FleetMap';
import {
  NEAR_KM, agoText, buildEtaShareText, computeEta, formatDuration, formatKm, haversineKm, isDelayed, isFree, isSilent,
  matchesFilter, matchesQuery, nextStop, onTrip, placeFromQuery, punctuality, unitPriority, type FleetFilter,
} from './fleetModel';

const INK = '#3E3C3D';
const MUTED = '#6B6B76';
const LINE = '#E9E9EC';
const BRAND = '#FA634E';
const BRAND_LIGHT = '#FFF0EB';

const FILTERS: { id: FleetFilter; label: string; dot?: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'on_trip', label: 'On trip', dot: INK },
  { id: 'delayed', label: 'Delayed', dot: BRAND },
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
  const pick = (key: string | null) => { setSelected(key); setFocusMode('none'); if (key) setView('map'); };

  // Map view state (the web map's controls): theme, 2D/3D, driver view / trip overview.
  const mapRef = useRef<FleetMapHandle>(null);
  const [theme, setTheme] = useState<MapTheme>('light');
  const [is3D, setIs3D] = useState(false);
  const [focusMode, setFocusMode] = useState<FocusMode>('none');
  const [camera, setCamera] = useState<MapView>({ zoom: 5, pitch: 0, bearing: 0 });
  const turned = Math.abs(camera.bearing) > 1 || camera.pitch > 1;

  // One road route for the selected truck: drawn on the map and used for its ETA.
  const next = unit ? nextStop(unit) : null;
  const target = next && next.lat != null && next.lng != null ? { lat: next.lat, lng: next.lng } : null;
  // Rounded so a few metres of GPS drift don't refetch.
  const from = unit?.position ? { lat: +unit.position.lat.toFixed(3), lng: +unit.position.lng.toFixed(3) } : null;
  const routeQ = useQuery({
    queryKey: ['fleet', 'route', unit?.key, from?.lat, from?.lng, target?.lat, target?.lng],
    queryFn: () => operatorService.liveRoute([from!, target!]),
    enabled: !!from && !!target && !!unit && onTrip(unit),
    staleTime: 60_000,
  });
  const eta = unit && onTrip(unit) && (routeQ.isFetched || !target) ? computeEta(unit, routeQ.data ?? null, live.dataUpdatedAt || now) : null;

  const lastUpdate = live.dataUpdatedAt ? agoText(new Date(live.dataUpdatedAt).toISOString(), now) : null;

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
            ref={mapRef}
            units={shown}
            selected={selected}
            onSelect={pick}
            interactive
            theme={theme}
            tilted={is3D}
            focusMode={focusMode}
            routeLine={routeQ.data?.geometry ?? null}
            focus={place ? { lat: place.lat, lng: place.lng, km: NEAR_KM } : null}
            padding={{ top: 70, bottom: unit && focusMode === 'none' ? 380 : 70 }}
            onViewChange={setCamera}
          />

          {/* Top-left: live status (and speed while a picked truck is moving) */}
          <View style={s.topLeft} pointerEvents="none">
            <View style={s.live}>
              <View style={[s.liveDot, { backgroundColor: live.isError ? '#9898A4' : BRAND }]} />
              <Text style={s.liveText}>{live.isError ? 'Connection lost' : 'Live'}</Text>
              {lastUpdate && !live.isError ? <Text style={s.liveAgo}>· {lastUpdate}</Text> : null}
            </View>
            {unit?.motion === 'moving' && unit.position?.speed_kph != null ? (
              <View style={s.speed}>
                <Text style={s.speedNum}>{Math.round(unit.position.speed_kph)}</Text>
                <Text style={s.speedUnit}>km/h</Text>
              </View>
            ) : null}
          </View>

          {/* The picked truck's views, like the web's focus bar — just above its card, or at the bottom in a focus view */}
          {unit?.position ? (
            <View style={[s.viewBar, { bottom: focusMode === 'none' ? 404 : 28 }]}>
              <Text style={s.viewPlate} numberOfLines={1}>{unit.vehicle?.plate_number ?? 'Truck'}</Text>
              <ViewChip icon={Navigation} label="Driver view" on={focusMode === 'driver'} onPress={() => { setFocusMode('driver'); mapRef.current?.driverView(); }} />
              {unit.trip ? <ViewChip icon={MapIcon} label="Trip" on={focusMode === 'overview'} onPress={() => { setFocusMode('overview'); mapRef.current?.tripOverview(); }} /> : null}
              {focusMode !== 'none' ? (
                <TouchableOpacity style={s.exit} onPress={() => { setFocusMode('none'); mapRef.current?.set3D(is3D); }}>
                  <Text style={s.exitText}>Exit</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {/* Right: map controls, one compact column */}
          <View style={[s.ctlCol, unit && focusMode === 'none' ? { top: 12 } : { bottom: 84 }]}>
            <View style={s.ctlGroup}>
              <Ctl icon={Plus} label="Zoom in" onPress={() => mapRef.current?.zoomBy(1)} />
              <View style={s.ctlRule} />
              <Ctl icon={Minus} label="Zoom out" onPress={() => mapRef.current?.zoomBy(-1)} />
            </View>
            <View style={s.ctlGroup}>
              <Ctl icon={Focus} label="Show all trucks" onPress={() => { pick(null); mapRef.current?.fitAll(); }} />
              <View style={s.ctlRule} />
              <TouchableOpacity
                style={[s.ctl, is3D && s.ctlOn]}
                onPress={() => { const v = !is3D; setIs3D(v); mapRef.current?.set3D(v); }}
                accessibilityLabel={is3D ? 'Switch to 2D' : 'Switch to 3D'}
              >
                <Text style={[s.ctl3dText, is3D && { color: '#FFFFFF' }]}>{is3D ? '3D' : '2D'}</Text>
              </TouchableOpacity>
              {turned ? (
                <>
                  <View style={s.ctlRule} />
                  <Ctl icon={Compass} label="Face north and flatten" onPress={() => { setIs3D(false); setFocusMode('none'); mapRef.current?.faceNorth(); }} rotate={-camera.bearing - 45} />
                </>
              ) : null}
              <View style={s.ctlRule} />
              <Ctl icon={theme === 'light' ? Moon : Sun} label={theme === 'light' ? 'Dark map' : 'Light map'} onPress={() => setTheme(theme === 'light' ? 'dark' : 'light')} />
            </View>
          </View>

          {unit && focusMode === 'none' ? (
            <UnitCard unit={unit} eta={eta} routeLoading={routeQ.isLoading} now={now} f={f} onClose={() => pick(null)} onOpen={(id) => router.push({ pathname: '/trip-details', params: { id } })} />
          ) : unit ? null : (
            <View style={s.hint} pointerEvents="none">
              <Truck size={15} color="#FFFFFF" strokeWidth={2.3} />
              <Text style={s.hintText}>
                {live.isLoading ? 'Loading trucks…' : `${shown.filter((u) => u.position).length} on the map`}
                {!live.isLoading && shown.filter((u) => !u.position).length ? `  ·  ${shown.filter((u) => !u.position).length} without location` : ''}
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
  const bg = st === 'delayed' ? BRAND_LIGHT : '#F1F1F3';
  const fg = st === 'delayed' ? BRAND : INK;
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

function ViewChip({ icon: Icon, label, on, onPress }: { icon: LucideIcon; label: string; on: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[s.vchip, on && s.vchipOn]} onPress={onPress} activeOpacity={0.8}>
      <Icon size={12} color={on ? INK : '#FFFFFF'} strokeWidth={2.4} />
      <Text style={[s.vchipText, on && { color: INK }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Ctl({ icon: Icon, label, onPress, rotate }: { icon: LucideIcon; label: string; onPress: () => void; rotate?: number }) {
  return (
    <TouchableOpacity style={s.ctl} onPress={onPress} accessibilityLabel={label} activeOpacity={0.7}>
      <View style={rotate != null ? { transform: [{ rotate: `${rotate}deg` }] } : undefined}>
        <Icon size={18} color={INK} strokeWidth={2.1} />
      </View>
    </TouchableOpacity>
  );
}

function UnitCard({ unit: u, eta, routeLoading, now, f, onClose, onOpen }: {
  unit: LiveUnit; eta: ReturnType<typeof computeEta>; routeLoading: boolean; now: number; f: ReturnType<typeof makeTime>;
  onClose: () => void; onOpen: (tripId: string) => void;
}) {
  const t = u.trip;
  const next = nextStop(u);
  const phone = u.driver?.phone ?? null;
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
            {p ? <Text style={{ color: p.good ? INK : BRAND, fontWeight: '600' }}>{`  ·  ${p.label}`}</Text> : null}
          </Text>
          <View style={s.eta}>
            <Metric value={eta.arrival ? f.time(eta.arrival.toISOString()) : '—'} label="arrives" />
            <Metric value={eta.durationSeconds != null ? formatDuration(eta.durationSeconds) : '—'} label="drive time" />
            {eta.distanceKm != null ? <Metric value={formatKm(eta.distanceKm)} label={eta.distanceIsRoad ? 'by road' : 'direct'} /> : null}
          </View>
        </>
      ) : null}
      {eta && !eta.distanceIsRoad && !routeLoading ? <Text style={s.note}>Road routing unavailable — distance is a straight line.</Text> : null}

      <View style={s.feeds}>
        <Feed icon={Truck} label="Tracker" iso={u.vehicle_gps?.recorded_at} missing={!u.vehicle ? 'No truck' : !u.vehicle.has_tracker ? 'None fitted' : 'No fix yet'} now={now} />
        <Feed icon={Smartphone} label="Phone" iso={u.driver_gps?.recorded_at} missing={!u.driver ? 'No driver' : isFree(u) ? 'Off trip' : 'Silent'} now={now} />
      </View>
      {u.feeds_gap_m != null && u.feeds_gap_m > 1000 ? <Text style={[s.note, { color: BRAND, fontWeight: '600' }]}>Tracker and phone are {formatKm(u.feeds_gap_m / 1000)} apart</Text> : null}

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
      <View style={[s.feedDot, { backgroundColor: iso ? (fresh ? INK : BRAND) : '#D4D4D8' }]} />
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

  hint: { position: 'absolute', bottom: 24, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: INK, borderRadius: 20, paddingHorizontal: 14, height: 40, ...shadow },
  hintText: { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },

  card: { position: 'absolute', left: 12, right: 12, bottom: 20, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, gap: 10, ...shadow },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  plate: { fontSize: 19, fontWeight: '800', color: INK, letterSpacing: 0.3 },
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

  // map overlays
  topLeft: { position: 'absolute', top: 12, left: 12, gap: 8, alignItems: 'flex-start' },
  live: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 10, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.95)', ...shadow },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveText: { fontSize: 12, fontWeight: '600', color: INK },
  liveAgo: { fontSize: 12, color: MUTED },
  speed: { width: 56, height: 56, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.95)', alignItems: 'center', justifyContent: 'center', ...shadow },
  speedNum: { fontSize: 20, fontWeight: '700', color: INK, fontVariant: ['tabular-nums'] },
  speedUnit: { fontSize: 10, color: MUTED },
  viewBar: {
    position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: INK, borderRadius: 20, padding: 4, paddingLeft: 12, ...shadow,
  },
  viewPlate: { fontSize: 12, fontWeight: '700', color: '#FFFFFF', fontFamily: 'monospace', marginRight: 4, maxWidth: 90 },
  vchip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.12)' },
  vchipOn: { backgroundColor: '#FFFFFF' },
  vchipText: { fontSize: 12, fontWeight: '600', color: '#FFFFFF' },
  exit: { borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.18)' },
  exitText: { fontSize: 12, fontWeight: '600', color: '#FFFFFF' },
  ctlCol: { position: 'absolute', right: 12, gap: 8 },
  ctlGroup: { backgroundColor: '#FFFFFF', borderRadius: 14, ...shadow },
  ctl: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  ctlRule: { height: 1, marginHorizontal: 9, backgroundColor: '#F1F1F3' },
  ctlOn: { backgroundColor: INK },
  ctl3dText: { fontSize: 13, fontWeight: '800', color: INK },
});

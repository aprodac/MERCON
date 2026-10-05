/**
 * Route: /fleet-map — the phone version of the web live map.
 *
 *   Search    plate, driver, trip no. or customer; or a city ("near Dammam",
 *             "jeddah") to see trucks within 50 km of it, closest first.
 *   Filters   All · On trip · Delayed · Free · No GPS (same as the web).
 *   Map/List  toggle. The list has three tabs (FleetLists.tsx): Trucks
 *             (delayed → running → planned → free), Needs attention (Home's
 *             trip action items) and Scheduled (by start day). A red chip on
 *             the map opens Needs attention; a row with a truck on the road
 *             shows it on the map, otherwise opens the trip.
 *   Truck     tap a pin: a bottom sheet with the ETA to the next stop (road
 *             drive time when routing is up), on time / late, the trip drawn
 *             on the map and Call · Share ETA (WhatsApp) · Open trip; drag it
 *             up for the stop timeline (with the driver's photos per stop)
 *             and GPS feeds, swipe it sideways for
 *             the next truck (FleetSheet.tsx).
 *   Groups    nearby trucks merge into a numbered bubble; tap to zoom in, or
 *             to list trucks parked on the same spot.
 *   Trail     a grey line of where the picked truck has driven on its trip
 *             (the driver phone's GPS — the truck tracker keeps no history).
 *   Deep link /fleet-map?trip=<id> (from a "Trip delayed" / "Driver app
 *             silent" notification) opens on that trip's truck, or on the
 *             trip page when the truck has no position.
 *   Camera    follows the picked truck as it moves; dragging the map stops
 *             that and shows Recenter. Zoomed in, trucks carry their plates.
 *             The ⓘ control explains colours, shapes and lines.
 * Live feed refreshes every 30 s, the same one as Home.
 *   Actions   the truck sheet moves its trip to the next step or cancels it;
 *             a trip without a truck (Scheduled row, or a "no truck"
 *             attention item) gets Find a truck — nearest free trucks and a
 *             one-tap assign (FleetActions.tsx). Each asks to confirm first.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, ScrollView, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import {
  AlertTriangle, Compass, Focus, Info, List, LocateFixed, Map as MapIcon, MessageCircle, Minus, Moon, Navigation, Plus, Search, Sun, Truck, X, type LucideIcon,
} from 'lucide-react-native';
import { Toast } from '@mercon/mobile-shared/components/Toast';
import { operatorService, type LiveUnit } from '../../lib/operator';
import { AppTopBar } from '@/components/AppTopBar';
import { makeTime } from '../trips/list/tripListModel';
import { FleetMap, type FleetMapHandle, type FocusMode, type MapTheme, type MapView } from './FleetMap';
import { GroupSheet, UnitRow, UnitSheet } from './FleetSheet';
import { FleetLegend } from './FleetLegend';
import { FindTruckSheet, useTripActions } from './FleetActions';
import { AttentionList, ListTabs, ScheduledList, attentionItems, matchesTripText, scheduledTrips, type ListTab } from './FleetLists';
import { useActionInbox } from '../dashboard/actions/useActionInbox';
import { useActionIntent } from '../dashboard/actions/useActionIntent';
import { MediaViewer, type ViewerItem } from '../trips/details/components/MediaViewer';
import { niceName } from '../trips/create/components/ui';
import type { QuickKind } from '../trips/details/tripDetailsModel';
import { BulkStatusSheet, ShareKindSheet, TripShareFromMap } from './FleetShare';
import {
  NEAR_KM, agoText, computeEta, haversineKm, isDelayed, located, matchesFilter, matchesQuery, nextStop, onTrip, placeFromQuery, unitPriority, type FleetFilter,
} from './fleetModel';

const INK = '#3E3C3D';
const MUTED = '#6B6B76';
const LINE = '#E9E9EC';
const BRAND = '#FA634E';

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
  const [listTab, setListTab] = useState<ListTab>('trucks');
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
  // Trucks parked on one spot, opened from their map group.
  const [group, setGroup] = useState<string[] | null>(null);
  const groupUnits = useMemo(() => (group ? all.filter((u) => group.includes(u.key)).sort((a, b) => unitPriority(b) - unitPriority(a)) : []), [all, group]);
  const [expanded, setExpanded] = useState(false);
  const [sheetH, setSheetH] = useState(0);
  // Driver view / trip overview, and whether the camera follows the picked truck (until the map is dragged by hand).
  const [focusMode, setFocusMode] = useState<FocusMode>('none');
  const [following, setFollowing] = useState(true);
  const pick = (key: string | null) => {
    if (key && key !== selected) Haptics.selectionAsync().catch(() => {});
    setSelected(key); setFocusMode('none'); setGroup(null); setFollowing(true);
    if (key) setView('map'); else setExpanded(false);
  };
  const openGroup = (keys: string[]) => {
    Haptics.selectionAsync().catch(() => {});
    setSelected(null); setFocusMode('none'); setGroup(keys);
  };

  // Swiping the sheet walks the trucks on the map in the list's order.
  const ring = useMemo(() => shown.filter(located), [shown]);
  const at = unit ? ring.findIndex((u) => u.key === unit.key) : -1;
  const prevKey = at > 0 ? ring[at - 1].key : null;
  const nextKey = at >= 0 && at < ring.length - 1 ? ring[at + 1].key : null;

  // The other lists: Home's trip action items and the not-started trips (same queries, same cache).
  const inbox = useActionInbox();
  const { onIntent, toast, setToast } = useActionIntent();
  // Trip-changing actions: next step / cancel from the sheet, Find a truck from the lists.
  const tripActions = useTripActions((message) => setToast({ message, type: 'success' }));
  const [findFor, setFindFor] = useState<string | null>(null);

  // WhatsApp (FleetShare.tsx): what to send about the picked truck, then the trip page's share sheet…
  const [shareChoose, setShareChoose] = useState(false);
  const [shareKind, setShareKind] = useState<QuickKind | null>(null);
  // …and trucks picked in the list (long-press) for one status message per customer.
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [bulk, setBulk] = useState<{ ids: string[]; positions: Record<string, { lat: number; lng: number } | null> } | null>(null);
  const togglePick = (u: LiveUnit) => {
    if (!u.trip) return; // a free truck has no trip to report on
    Haptics.selectionAsync().catch(() => {});
    setPicked((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(u.key)) next.delete(u.key); else next.add(u.key);
      return next.size ? next : null;
    });
  };
  const pickedUnits = useMemo(() => all.filter((u) => picked?.has(u.key) && u.trip), [all, picked]);
  const lastCustomer = pickedUnits[pickedUnits.length - 1]?.trip?.customer_name ?? null;
  const pickAllOf = (customer: string) =>
    setPicked((prev) => new Set([...(prev ?? []), ...shown.filter((u) => u.trip?.customer_name === customer).map((u) => u.key)]));
  const sendPicked = () => {
    if (!pickedUnits.length) return;
    setBulk({
      ids: pickedUnits.map((u) => u.trip!.id),
      positions: Object.fromEntries(pickedUnits.map((u) => [u.trip!.id, located(u) ? { lat: u.position!.lat, lng: u.position!.lng } : null])),
    });
  };
  // "Assign a truck" from an attention item opens Find a truck here instead of the trip page.
  const fleetIntent = (i: Parameters<typeof onIntent>[0]) => (i.type === 'trip' && i.assign === 'truck' ? setFindFor(i.tripId) : onIntent(i));
  const attention = useMemo(() => {
    const q = query.trim().toLowerCase();
    return attentionItems(inbox.items).filter((i) => !q || `${i.title} ${i.detail}`.toLowerCase().includes(q));
  }, [inbox.items, query]);
  const scheduled = useMemo(() => scheduledTrips(inbox.scheduled, now).filter((t) => matchesTripText(t, query)), [inbox.scheduled, now, query]);

  /** A trip's truck on the map when it has a fix there; otherwise the trip's own page. */
  const showTrip = (tripId: string) => {
    const u = all.find((x) => x.trip?.id === tripId && located(x));
    if (!u) { router.push({ pathname: '/trip-details', params: { id: tripId } }); return; }
    // Make sure the filter / search doesn't hide it.
    if (!shown.some((x) => x.key === u.key)) { setFilter('all'); setQuery(''); }
    pick(u.key);
  };

  // Opened from a notification: pick that trip's truck once the live data is in.
  const params = useLocalSearchParams<{ trip?: string }>();
  const handledTrip = useRef<string | null>(null);
  useEffect(() => {
    const id = typeof params.trip === 'string' ? params.trip : null;
    if (!id || handledTrip.current === id || !live.data) return;
    handledTrip.current = id;
    showTrip(id);
    // showTrip reads the latest data; only a new trip param or the first data should run it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.trip, live.data]);

  // Map view state (the web map's controls): theme, 2D/3D, driver view / trip overview.
  const mapRef = useRef<FleetMapHandle>(null);
  const [theme, setTheme] = useState<MapTheme>('light');
  const [is3D, setIs3D] = useState(false);
  const [camera, setCamera] = useState<MapView>({ zoom: 5, pitch: 0, bearing: 0 });
  const [legend, setLegend] = useState(false);
  const enterView = (mode: FocusMode) => {
    setFocusMode(mode); setFollowing(true);
    if (mode === 'driver') mapRef.current?.driverView(); else if (mode === 'overview') mapRef.current?.tripOverview();
  };
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
  // The rest of the trip, next stop onwards — drawn faintly, and only along real roads.
  const restStops = useMemo(() => {
    const t = unit?.trip;
    if (!t || t.next_stop_index == null) return [];
    return t.stops.slice(t.next_stop_index).filter((x) => x.lat != null && x.lng != null && !(x.lat === 0 && x.lng === 0)).map((x) => ({ lat: x.lat!, lng: x.lng! }));
  }, [unit?.trip]);
  const restQ = useQuery({
    queryKey: ['fleet', 'trip-rest', unit?.trip?.id, unit?.trip?.next_stop_index, restStops.length],
    queryFn: () => operatorService.liveRoute(restStops),
    enabled: restStops.length >= 2,
    staleTime: 10 * 60_000,
  });
  // Breadcrumb trail: the trip's driven path (same endpoint as the trip page's map), joined to where the truck is now.
  const trailQ = useQuery({
    queryKey: ['fleet', 'trail', unit?.trip?.id],
    queryFn: () => operatorService.tripOverview(unit!.trip!.id),
    enabled: !!unit && onTrip(unit),
    refetchInterval: 60_000,
    retry: false,
  });
  const here = unit?.position ?? null;
  const trail = useMemo(() => {
    const path = trailQ.data?.path ?? [];
    if (path.length < 2) return null;
    return here ? [...path, [here.lng, here.lat] as [number, number]] : path;
  }, [trailQ.data, here]);

  // What the driver sent from each stop — only while the sheet is open full.
  const mediaQ = useQuery({
    queryKey: ['fleet', 'trip-media', unit?.trip?.id],
    queryFn: () => operatorService.tripMedia(unit!.trip!.id),
    enabled: expanded && !!unit?.trip,
    refetchInterval: 60_000,
    retry: false,
  });
  const [viewer, setViewer] = useState<{ items: ViewerItem[]; index: number; title: string } | null>(null);

  const eta = unit && onTrip(unit) && (routeQ.isFetched || !target) ? computeEta(unit, routeQ.data ?? null, live.dataUpdatedAt || now) : null;

  const sheetOpen = (!!unit && focusMode === 'none') || (!unit && groupUnits.length > 0);
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
            onChangeText={(v) => { setQuery(v); if (selected || group) pick(null); }}
            placeholder="Plate, driver, trip, customer or city"
            placeholderTextColor="#9898A4"
            style={s.searchInput}
            autoCorrect={false}
            returnKeyType="search"
          />
          {query ? <TouchableOpacity onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Clear search"><X size={17} color={MUTED} /></TouchableOpacity> : null}
        </View>
        {view === 'list' ? (
          <ListTabs tab={listTab} counts={{ trucks: shown.length, attention: attention.length, scheduled: scheduled.length }} onChange={setListTab} />
        ) : null}
        {view === 'map' || listTab === 'trucks' ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pills} style={{ marginHorizontal: -16 }}>
          {FILTERS.map((p) => {
            const on = filter === p.id;
            return (
              <TouchableOpacity key={p.id} style={[s.pill, on && s.pillOn]} onPress={() => { setFilter(p.id); pick(null); }} activeOpacity={0.8}>
                {p.dot ? <View style={[s.dot, { backgroundColor: p.dot }, p.id === 'free' && { borderWidth: 1.5, borderColor: on ? '#FFFFFF' : INK }]} /> : null}
                <Text style={[s.pillText, on && { color: '#FFFFFF' }]}>{p.label}</Text>
                <Text style={[s.pillCount, on && { color: 'rgba(255,255,255,0.7)' }]}>{counts[p.id]}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        ) : null}
        {place && (view === 'map' || listTab === 'trucks') ? <Text style={s.near}>{shown.length} {shown.length === 1 ? 'truck' : 'trucks'} within {NEAR_KM} km of {place.label}</Text> : null}
      </View>

      {view === 'list' && listTab === 'attention' ? (
        <AttentionList items={attention} now={now} onIntent={fleetIntent} onOpenTrip={showTrip} />
      ) : view === 'list' && listTab === 'scheduled' ? (
        <ScheduledList trips={scheduled} f={f} now={now} onOpenTrip={showTrip} onFindTruck={setFindFor} />
      ) : view === 'list' ? (
        <View style={{ flex: 1 }}>
          {picked ? (
            <View style={s.pickBar}>
              <Text style={s.pickText}>{pickedUnits.length} picked</Text>
              {lastCustomer ? (
                <TouchableOpacity onPress={() => pickAllOf(lastCustomer)} style={s.pickChip} accessibilityLabel={`Pick every truck of ${lastCustomer}`}>
                  <Text style={s.pickChipText} numberOfLines={1}>All of {niceName(lastCustomer)}</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity onPress={() => setPicked(null)} hitSlop={8}><Text style={s.pickCancel}>Cancel</Text></TouchableOpacity>
            </View>
          ) : null}
          <FlatList
            data={shown}
            keyExtractor={(u) => u.key}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: picked ? 100 : 40 }}
            ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#F1F1F3' }} />}
            style={s.listBox}
            ListHeaderComponent={!picked && shown.some((u) => u.trip) ? <Text style={s.listHint}>Long-press trucks to send several statuses on WhatsApp</Text> : null}
            renderItem={({ item }) => (
              <UnitRow
                unit={item}
                now={now}
                km={place && item.position ? haversineKm(item.position, place) : null}
                onPress={() => (picked ? togglePick(item) : pick(item.key))}
                onLongPress={() => togglePick(item)}
                selected={picked ? picked.has(item.key) : undefined}
              />
            )}
            ListEmptyComponent={<Text style={s.empty}>{live.isLoading ? 'Loading trucks…' : 'No trucks match.'}</Text>}
          />
          {picked ? (
            <TouchableOpacity style={s.sendBar} onPress={sendPicked} activeOpacity={0.85} accessibilityLabel="Send status on WhatsApp">
              <MessageCircle size={18} color="#FFFFFF" />
              <Text style={s.sendBarText}>Send status · {pickedUnits.length} truck{pickedUnits.length === 1 ? '' : 's'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
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
            padding={{ top: 70, bottom: sheetOpen ? sheetH + 30 : 70 }}
            onViewChange={setCamera}
            onGroupPress={openGroup}
            restLine={restStops.length >= 2 ? restQ.data?.geometry ?? null : null}
            trail={trail}
            follow={following}
            onUserMove={() => { if (unit) setFollowing(false); }}
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
            <View style={[s.viewBar, { bottom: focusMode === 'none' ? sheetH + 28 : 28 }]}>
              <Text style={s.viewPlate} numberOfLines={1}>{unit.vehicle?.plate_number ?? 'Truck'}</Text>
              {!following ? (
                <ViewChip icon={LocateFixed} label="Recenter" on={false} onPress={() => { setFollowing(true); mapRef.current?.recenter(); }} />
              ) : null}
              <ViewChip icon={Navigation} label="Driver view" on={focusMode === 'driver'} onPress={() => enterView('driver')} />
              {unit.trip ? <ViewChip icon={MapIcon} label="Trip" on={focusMode === 'overview'} onPress={() => enterView('overview')} /> : null}
              {focusMode !== 'none' ? (
                <TouchableOpacity style={s.exit} onPress={() => { setFocusMode('none'); setFollowing(true); mapRef.current?.set3D(is3D); }}>
                  <Text style={s.exitText}>Exit</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {/* Right: map controls, one compact column */}
          <View style={[s.ctlCol, sheetOpen ? { top: 12 } : { bottom: 84 }]}>
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
              <View style={s.ctlRule} />
              <Ctl icon={Info} label="How to read the map" onPress={() => setLegend(!legend)} />
            </View>
          </View>

          {legend ? <FleetLegend style={sheetOpen ? { top: 12 } : { bottom: 84 }} onClose={() => setLegend(false)} /> : null}

          {unit && focusMode === 'none' ? (
            <UnitSheet
              unit={unit}
              eta={eta}
              routeLoading={routeQ.isLoading}
              now={now}
              f={f}
              expanded={expanded}
              onExpand={setExpanded}
              position={{ index: Math.max(at, 0), total: at >= 0 ? ring.length : 0 }}
              onPrev={prevKey ? () => pick(prevKey) : null}
              onNext={nextKey ? () => pick(nextKey) : null}
              onClose={() => pick(null)}
              onOpen={(id) => router.push({ pathname: '/trip-details', params: { id } })}
              onHeight={setSheetH}
              media={mediaQ.data ?? null}
              onOpenMedia={(items, index, title) => setViewer({ items, index, title })}
              nextStep={unit.trip && tripActions.nextLabel(unit.trip.status) ? {
                label: tripActions.nextLabel(unit.trip.status)!,
                onPress: () => tripActions.advance(unit.trip!.id, unit.trip!.status, unit.trip!.ref_id),
              } : null}
              onCancelTrip={unit.trip ? () => tripActions.cancel(unit.trip!.id, unit.trip!.ref_id) : null}
              busy={tripActions.busy}
              onShare={unit.trip ? () => setShareChoose(true) : null}
            />
          ) : unit ? null : groupUnits.length ? (
            <GroupSheet units={groupUnits} now={now} onPick={pick} onClose={() => setGroup(null)} onHeight={setSheetH} />
          ) : (
            <>
            {attention.length ? (
              <TouchableOpacity style={s.attn} onPress={() => { Haptics.selectionAsync().catch(() => {}); setView('list'); setListTab('attention'); }} activeOpacity={0.85} accessibilityLabel="Show what needs attention">
                <AlertTriangle size={14} color="#FFFFFF" strokeWidth={2.4} />
                <Text style={s.attnText}>{attention.length} need{attention.length === 1 ? 's' : ''} attention</Text>
              </TouchableOpacity>
            ) : null}
            <View style={s.hint} pointerEvents="none">
              <Truck size={15} color="#FFFFFF" strokeWidth={2.3} />
              <Text style={s.hintText}>
                {live.isLoading ? 'Loading trucks…' : `${shown.filter((u) => u.position).length} on the map`}
                {!live.isLoading && shown.filter((u) => !u.position).length ? `  ·  ${shown.filter((u) => !u.position).length} without location` : ''}
              </Text>
            </View>
            </>
          )}
        </View>
      )}

      {unit?.trip ? (
        <ShareKindSheet
          visible={shareChoose}
          title={`WhatsApp · ${unit.vehicle?.plate_number ?? unit.trip.ref_id ?? 'truck'}`}
          delayed={isDelayed(unit)}
          // One sheet closes before the next opens (two modals at once don't show on iOS).
          onPick={(k) => { setShareChoose(false); setTimeout(() => setShareKind(k), 300); }}
          onClose={() => setShareChoose(false)}
        />
      ) : null}
      {unit?.trip && shareKind ? <TripShareFromMap tripId={unit.trip.id} kind={shareKind} onClose={() => setShareKind(null)} /> : null}
      {bulk ? <BulkStatusSheet key={bulk.ids.join(',')} tripIds={bulk.ids} positions={bulk.positions} onClose={() => { setBulk(null); setPicked(null); }} /> : null}
      <FindTruckSheet tripId={findFor} units={all} onClose={() => setFindFor(null)} onAssigned={(message) => setToast({ message, type: 'success' })} />
      <MediaViewer items={viewer?.items ?? null} startIndex={viewer?.index ?? 0} title={viewer?.title ?? ''} onClose={() => setViewer(null)} />
      <Toast visible={!!toast} message={toast?.message ?? ''} type={toast?.type ?? 'success'} onDismiss={() => setToast(null)} />
    </SafeAreaView>
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

  pickBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: LINE },
  pickText: { fontSize: 14, fontWeight: '700', color: INK },
  pickChip: { flexShrink: 1, borderRadius: 14, borderWidth: 1, borderColor: LINE, paddingHorizontal: 10, paddingVertical: 5 },
  pickChipText: { fontSize: 12, fontWeight: '600', color: INK },
  pickCancel: { fontSize: 13, fontWeight: '600', color: MUTED, marginLeft: 'auto' },
  listHint: { fontSize: 12, color: MUTED, paddingTop: 10, paddingBottom: 2 },
  sendBar: { position: 'absolute', left: 16, right: 16, bottom: 24, height: 52, borderRadius: 16, backgroundColor: '#25D366', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...shadow },
  sendBarText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  listBox: { flex: 1, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: LINE },
  empty: { textAlign: 'center', color: MUTED, paddingTop: 40, fontSize: 14 },

  hint: { position: 'absolute', bottom: 24, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: INK, borderRadius: 20, paddingHorizontal: 14, height: 40, ...shadow },
  attn: { position: 'absolute', bottom: 74, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#D92D20', borderRadius: 18, paddingHorizontal: 12, height: 34, ...shadow },
  attnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  hintText: { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },


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

/**
 * One trip, full screen and live — opened from the trip's page.
 *
 * The Fleet map's engine (FleetMap, isolate) with only this trip's truck: the
 * road ahead, the rest of the trip, where it has driven, its stops and breaks
 * — and the same ETA as the Fleet map and the web (useTripRoute).
 *
 *   Views     2D (flat, truck and next stop), 3D (tilted, buildings rise
 *             close in), Drive (low behind the truck, facing the road ahead)
 *             and Route (the whole trip, flat). Light or dark map. Both are
 *             remembered for next time (useFleetPrefs). Dragging the map
 *             stops following the truck until Recenter.
 *   Card      the arrival at the next stop (≈ when there's no road route),
 *             on time or late, time and km left, the stops so far and the
 *             delivery time at the last stop; speed, driving time and breaks;
 *             the driver with a Call button. Tap the handle for every stop
 *             and every break.
 *
 * A trip whose truck isn't on the live map (not started, finished, no GPS)
 * says so — the trip page keeps its plain map for those.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, LayoutAnimation, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Box, ChevronDown, ChevronUp, Compass, LocateFixed, Map as MapIcon, Moon, Navigation, Phone, Route, Sun, type LucideIcon } from 'lucide-react-native';
import { operatorService } from '../../lib/operator';
import { initialsOf, niceName } from '../trips/create/components/ui';
import { makeTime } from '../trips/list/tripListModel';
import { FleetMap, type FleetMapHandle, type FocusMode, type MapView } from './FleetMap';
import { BreakList, StateChip, StopProgress, StopTimeline } from './FleetSheet';
import { agoText, formatDuration, formatKm, located, punctuality, stoppedMin } from './fleetModel';
import type { MapTheme } from './mapStyle';
import { useFleetPrefs, type FleetPrefs } from './useFleetMapState';
import { useTripRoute } from './useTripRoute';

type Mode = NonNullable<FleetPrefs['tripView']>;

const MODES: { id: Mode; label: string; icon: LucideIcon; a11y: string }[] = [
  { id: 'flat', label: '2D', icon: MapIcon, a11y: 'Flat map' },
  { id: 'tilted', label: '3D', icon: Box, a11y: 'Tilted 3D map' },
  { id: 'drive', label: 'Drive', icon: Navigation, a11y: 'Behind the truck' },
  { id: 'route', label: 'Route', icon: Route, a11y: 'Whole trip' },
];
const FOCUS: Record<Mode, FocusMode> = { flat: 'none', tilted: 'none', drive: 'driver', route: 'overview' };

const INK = '#1C1C1E';
const MUTED = '#6B6B76';
const BRAND = '#FA634E';
const GOOD = '#1F9D55';

/** Floating controls follow the map's colours; the card stays light, like Apple Maps' sheets over a dark map. */
const GLASS: Record<MapTheme, { bg: string; fg: string; on: string; onFg: string; rule: string }> = {
  light: { bg: 'rgba(255,255,255,0.94)', fg: INK, on: INK, onFg: '#FFFFFF', rule: 'rgba(60,60,67,0.12)' },
  dark: { bg: 'rgba(30,34,44,0.92)', fg: '#F2F2F7', on: '#F2F2F7', onFg: INK, rule: 'rgba(235,235,245,0.14)' },
};

export default function TripLiveScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  // Same queries as the Fleet map — opening one after the other reuses the data.
  const live = useQuery({ queryKey: ['dashboard', 'actions', 'live-map'], queryFn: () => operatorService.liveMap(), refetchInterval: 15_000 });
  const tzQ = useQuery({ queryKey: ['dashboard', 'tz'], queryFn: () => operatorService.deploymentTimezone(), staleTime: Infinity });
  const f = useMemo(() => makeTime(tzQ.data ?? 'Asia/Riyadh'), [tzQ.data]);

  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const now = Math.max(clock, live.dataUpdatedAt || 0);

  const unit = useMemo(() => live.data?.find((u) => u.trip?.id === id && located(u)) ?? null, [live.data, id]);
  const units = useMemo(() => (unit ? [unit] : []), [unit]);
  const route = useTripRoute(unit, live.dataUpdatedAt, now);

  const prefs = useFleetPrefs();
  const [theme, setTheme] = useState<MapTheme>('light');
  const [mode, setMode] = useState<Mode>('flat');
  const [prefsApplied, setPrefsApplied] = useState(false);
  if (prefs.ready && !prefsApplied) {
    setPrefsApplied(true);
    if (prefs.prefs.theme) setTheme(prefs.prefs.theme);
    if (prefs.prefs.tripView) setMode(prefs.prefs.tripView);
  }

  const mapRef = useRef<FleetMapHandle>(null);
  const [following, setFollowing] = useState(true);
  const [camera, setCamera] = useState<MapView>({ zoom: 5, pitch: 0, bearing: 0 });
  const [cardH, setCardH] = useState(260);
  const [expanded, setExpanded] = useState(false);

  const applyMode = (m: Mode) => {
    setMode(m);
    setFollowing(true);
    prefs.save({ tripView: m });
    if (m === 'drive') mapRef.current?.driverView();
    else if (m === 'route') mapRef.current?.tripOverview();
    else mapRef.current?.set3D(m === 'tilted');
  };
  // The camera can only move once the map is up: frame the saved view on its first report.
  const framed = useRef(false);
  const onViewChange = (v: MapView) => {
    setCamera(v);
    if (!framed.current) { framed.current = true; applyMode(mode); }
  };
  const toggleTheme = () => {
    const t = theme === 'light' ? 'dark' : 'light';
    setTheme(t);
    prefs.save({ theme: t });
  };

  const glass = GLASS[theme];
  const turned = Math.abs(camera.bearing) > 1;
  const closeBtn = (
    <TouchableOpacity style={[s.round, { top: insets.top + 8, backgroundColor: glass.bg }]} onPress={() => router.back()} accessibilityLabel="Close live map">
      <ChevronDown size={22} color={glass.fg} strokeWidth={2.4} />
    </TouchableOpacity>
  );

  if (!unit) {
    return (
      <View style={[s.page, s.center, { paddingTop: insets.top }]}>
        {closeBtn}
        {live.isLoading ? <ActivityIndicator color={MUTED} /> : (
          <>
            <Text style={s.emptyTitle}>Not on the live map</Text>
            <Text style={s.emptyText}>This trip&apos;s truck isn&apos;t sending its position right now — it may not have started, be finished, or have no GPS.</Text>
          </>
        )}
      </View>
    );
  }

  const t = unit.trip!;
  const eta = route.eta;
  const next = route.next;
  const p = punctuality(eta?.lateByMin ?? null);
  const speed = unit.motion === 'moving' && unit.position?.speed_kph != null ? Math.round(unit.position.speed_kph) : null;
  const lastHalt = route.halts?.[route.halts.length - 1];
  const stoodMin = stoppedMin(unit, now) ?? (lastHalt?.ongoing ? lastHalt.minutes : null);
  const split = route.timeSplit;
  const breaks = route.halts?.filter((h) => h.kind === 'break') ?? [];
  const phone = unit.driver?.phone ?? null;

  const toggleCard = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };

  return (
    <View style={s.page}>
      {/* Wait for the saved view, so the map opens straight in it. */}
      {prefs.ready ? (
      <FleetMap
        ref={mapRef}
        units={units}
        selected={unit.key}
        interactive
        isolate
        theme={theme}
        tilted={mode === 'tilted'}
        focusMode={FOCUS[mode]}
        routeLine={route.routeLine}
        restLine={route.restLine}
        trail={route.trail}
        halts={breaks.length ? breaks : null}
        follow={following}
        onUserMove={() => setFollowing(false)}
        onViewChange={onViewChange}
        // Clear of the title, the card and the view buttons (52 wide + 14 margin) with the truck's pin beside them.
        padding={{ top: insets.top + 70, bottom: cardH + 24, right: 100 }}
      />
      ) : null}

      {closeBtn}

      {/* Trip and its state, centred at the top */}
      <View style={[s.titleWrap, { top: insets.top + 10 }]} pointerEvents="none">
        <View style={[s.title, { backgroundColor: glass.bg }]}>
          <View style={[s.liveDot, { backgroundColor: live.isError ? '#E11D48' : '#10B981' }]} />
          <Text style={[s.titleText, { color: glass.fg }]} numberOfLines={1}>{t.ref_id ?? 'Trip'}</Text>
          <StateChip unit={unit} now={now} />
        </View>
      </View>

      {/* Right: the view, then light / dark */}
      <View style={[s.ctlCol, { top: insets.top + 64 }]}>
        <View style={[s.ctlGroup, { backgroundColor: glass.bg }]}>
          {MODES.map((m, i) => {
            const on = mode === m.id;
            return (
              <React.Fragment key={m.id}>
                {i > 0 ? <View style={[s.rule, { backgroundColor: glass.rule }]} /> : null}
                <TouchableOpacity style={[s.ctl, on && { backgroundColor: glass.on }]} onPress={() => applyMode(m.id)} accessibilityLabel={m.a11y} accessibilityState={{ selected: on }} activeOpacity={0.7}>
                  <m.icon size={18} color={on ? glass.onFg : glass.fg} strokeWidth={2.1} />
                  <Text style={[s.ctlCaption, { color: on ? glass.onFg : glass.fg }]}>{m.label}</Text>
                </TouchableOpacity>
              </React.Fragment>
            );
          })}
        </View>
        <TouchableOpacity style={[s.ctlSolo, { backgroundColor: glass.bg }]} onPress={toggleTheme} accessibilityLabel={theme === 'light' ? 'Dark map' : 'Light map'}>
          {theme === 'light' ? <Moon size={18} color={glass.fg} /> : <Sun size={18} color={glass.fg} />}
        </TouchableOpacity>
        {turned ? (
          <TouchableOpacity style={[s.ctlSolo, { backgroundColor: glass.bg }]} onPress={() => mapRef.current?.faceNorth()} accessibilityLabel="Face north">
            <View style={{ transform: [{ rotate: `${-camera.bearing - 45}deg` }] }}><Compass size={18} color={glass.fg} /></View>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Drive view: the speed, as in a car's navigation */}
      {mode === 'drive' && speed != null ? (
        <View style={[s.speed, { bottom: cardH + 22 }]} pointerEvents="none">
          <Text style={s.speedNum}>{speed}</Text>
          <Text style={s.speedUnit}>km/h</Text>
        </View>
      ) : null}

      {!following ? (
        <TouchableOpacity style={[s.recenter, { bottom: cardH + 22, backgroundColor: glass.bg }]} onPress={() => { setFollowing(true); mapRef.current?.recenter(); }} accessibilityLabel="Back to the truck" activeOpacity={0.85}>
          <LocateFixed size={15} color={glass.fg} />
          <Text style={[s.recenterText, { color: glass.fg }]}>Recenter</Text>
        </TouchableOpacity>
      ) : null}

      {/* The card */}
      <View style={[s.card, { paddingBottom: insets.bottom + 14 }]} onLayout={(e) => setCardH(e.nativeEvent.layout.height)}>
        <TouchableOpacity onPress={toggleCard} style={s.handleHit} hitSlop={8} accessibilityLabel={expanded ? 'Show less' : 'Show every stop and break'}>
          <View style={s.handle} />
        </TouchableOpacity>

        <ScrollView style={{ maxHeight: expanded ? 520 : undefined }} scrollEnabled={expanded} showsVerticalScrollIndicator={false}>
          {eta ? (
            <>
              <Text style={s.kicker} numberOfLines={1}>
                {eta.stopLooksWrong ? 'Next stop' : 'Arriving at'} {niceName(next?.name) || niceName(next?.address) || `stop ${next?.sequence ?? ''}`}
              </Text>
              {eta.stopLooksWrong ? (
                <Text style={s.wrong}>The stop&apos;s location looks wrong — fix it on the trip</Text>
              ) : (
                <View style={s.etaRow}>
                  <Text style={s.eta}>{eta.arrival ? `${eta.approx ? '≈ ' : ''}${f.time(eta.arrival.toISOString())}` : '—'}</Text>
                  {p ? (
                    <View style={[s.pill, { backgroundColor: p.good ? '#E8F5EE' : '#FFF0EB' }]}>
                      <Text style={[s.pillText, { color: p.good ? GOOD : BRAND }]}>{p.label}</Text>
                    </View>
                  ) : null}
                </View>
              )}
              {!eta.stopLooksWrong ? (
                <Text style={s.etaSub}>
                  {[
                    eta.durationSeconds != null ? `${eta.approx ? 'about ' : ''}${formatDuration(eta.durationSeconds)}` : null,
                    eta.distanceKm != null ? `${eta.approx ? '≈ ' : ''}${formatKm(eta.distanceKm)}${eta.distanceIsRoad ? ' by road' : ''}` : null,
                  ].filter(Boolean).join('  ·  ')}
                  {eta.approx && !route.routeQ.isLoading ? '  ·  estimate' : ''}
                </Text>
              ) : null}
            </>
          ) : (
            <>
              <Text style={s.kicker}>{t.phase === 'upcoming' ? 'Not started yet' : 'Working out the arrival…'}</Text>
              {t.planned_start && t.phase === 'upcoming' ? <Text style={s.eta}>{f.time(t.planned_start)}</Text> : null}
            </>
          )}

          {t.stops.length > 1 ? <View style={{ marginTop: 14 }}><StopProgress stops={t.stops} nextId={next?.id ?? null} /></View> : null}
          {route.final ? (
            <Text style={s.final}>Delivery at {niceName(route.final.place) || 'the last stop'} around <Text style={{ fontWeight: '800', color: INK }}>{f.time(route.final.at.toISOString())}</Text></Text>
          ) : null}

          <View style={s.stats}>
            <Stat
              label={speed != null ? 'Speed' : unit.motion === 'idle' ? 'Stopped' : 'Status'}
              value={speed != null ? `${speed}` : unit.motion === 'idle' ? (stoodMin != null && stoodMin >= 1 ? formatDuration(stoodMin * 60) : 'Now') : unit.motion === 'stale' ? 'Offline' : unit.motion === 'no_signal' ? 'No signal' : '—'}
              unit={speed != null ? 'km/h' : undefined}
              tone={unit.motion === 'idle' && stoodMin != null && stoodMin >= 30 ? 'warn' : undefined}
            />
            <Stat label="Driving" value={split && split.total_min >= 1 ? formatDuration(split.driving_min * 60) : '—'} />
            <Stat label={split?.breaks === 1 ? 'Break' : 'Breaks'} value={split ? (split.breaks ? formatDuration(split.breaks_min * 60) : 'None') : '—'} unit={split?.breaks ? `×${split.breaks}` : undefined} />
          </View>

          <View style={s.who}>
            <View style={s.avatar}><Text style={s.avatarText}>{initialsOf(unit.driver?.name ?? unit.vehicle?.plate_number ?? '?')}</Text></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.whoName} numberOfLines={1}>{unit.driver ? niceName(unit.driver.name) : 'No driver'}</Text>
              <Text style={s.whoSub} numberOfLines={1}>{[unit.vehicle?.plate_number, niceName(t.customer_name)].filter(Boolean).join('  ·  ')}</Text>
            </View>
            {phone ? (
              <TouchableOpacity style={s.call} onPress={() => Linking.openURL(`tel:${phone}`).catch(() => {})} accessibilityLabel="Call driver" activeOpacity={0.85}>
                <Phone size={18} color="#FFFFFF" strokeWidth={2.3} />
              </TouchableOpacity>
            ) : null}
          </View>

          {expanded ? (
            <View style={{ marginTop: 14, gap: 10 }}>
              <StopTimeline stops={t.stops} nextId={next?.id ?? null} f={f} media={null} />
              {breaks.length ? <BreakList halts={breaks} f={f} /> : null}
            </View>
          ) : null}

          <TouchableOpacity onPress={toggleCard} style={s.more} accessibilityLabel={expanded ? 'Show less' : 'Show every stop and break'}>
            {expanded ? <ChevronDown size={15} color={MUTED} /> : <ChevronUp size={15} color={MUTED} />}
            <Text style={s.moreText}>
              {expanded ? 'Less' : 'Stops & breaks'}
              {unit.position ? `  ·  GPS ${agoText(unit.position.recorded_at, now)}` : ''}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </View>
  );
}

function Stat({ label, value, unit, tone }: { label: string; value: string; unit?: string; tone?: 'warn' }) {
  return (
    <View style={s.stat}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, tone === 'warn' && { color: '#D97706' }]} numberOfLines={1}>
        {value}{unit ? <Text style={s.statUnit}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

const shadow = { shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 6 };

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f6f4ef' },
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: INK },
  emptyText: { fontSize: 14, color: MUTED, textAlign: 'center', lineHeight: 20 },
  round: { position: 'absolute', left: 14, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', ...shadow },
  titleWrap: { position: 'absolute', left: 70, right: 70, alignItems: 'center' },
  title: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, borderRadius: 20, paddingLeft: 12, paddingRight: 5, maxWidth: '100%', ...shadow },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  titleText: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  ctlCol: { position: 'absolute', right: 14, gap: 10, alignItems: 'center' },
  ctlGroup: { borderRadius: 16, overflow: 'hidden', ...shadow },
  ctl: { width: 52, height: 54, alignItems: 'center', justifyContent: 'center', gap: 3 },
  ctlCaption: { fontSize: 10, fontWeight: '700' },
  rule: { height: StyleSheet.hairlineWidth, marginHorizontal: 8 },
  ctlSolo: { width: 52, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', ...shadow },
  speed: { position: 'absolute', left: 16, width: 64, height: 64, borderRadius: 32, backgroundColor: '#FFFFFF', borderWidth: 4, borderColor: INK, alignItems: 'center', justifyContent: 'center', ...shadow },
  speedNum: { fontSize: 22, fontWeight: '800', color: INK, fontVariant: ['tabular-nums'], lineHeight: 24 },
  speedUnit: { fontSize: 9, fontWeight: '700', color: MUTED },
  recenter: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, borderRadius: 19, paddingHorizontal: 14, ...shadow },
  recenterText: { fontSize: 13, fontWeight: '700' },
  card: {
    position: 'absolute', left: 8, right: 8, bottom: 8, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.98)',
    paddingHorizontal: 20, ...shadow, shadowOpacity: 0.2, shadowRadius: 24,
  },
  handleHit: { alignItems: 'center', paddingTop: 8, paddingBottom: 10 },
  handle: { width: 38, height: 5, borderRadius: 3, backgroundColor: '#D1D1D6' },
  kicker: { fontSize: 13, fontWeight: '600', color: MUTED },
  etaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  eta: { fontSize: 40, fontWeight: '800', color: INK, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  pillText: { fontSize: 13, fontWeight: '700' },
  etaSub: { fontSize: 15, fontWeight: '600', color: '#3A3A3C', marginTop: 2 },
  wrong: { fontSize: 15, fontWeight: '700', color: BRAND, marginTop: 4 },
  final: { fontSize: 13, color: MUTED, marginTop: 10 },
  stats: { flexDirection: 'row', gap: 8, marginTop: 16 },
  stat: { flex: 1, backgroundColor: '#F2F2F7', borderRadius: 16, paddingVertical: 10, paddingHorizontal: 12, gap: 2 },
  statLabel: { fontSize: 11, fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 },
  statValue: { fontSize: 17, fontWeight: '800', color: INK, fontVariant: ['tabular-nums'] },
  statUnit: { fontSize: 12, fontWeight: '700', color: MUTED },
  who: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#E5E5EA', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontWeight: '800', color: INK },
  whoName: { fontSize: 16, fontWeight: '700', color: INK },
  whoSub: { fontSize: 13, color: MUTED, marginTop: 1 },
  call: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#34C759', alignItems: 'center', justifyContent: 'center' },
  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: 14 },
  moreText: { fontSize: 12, fontWeight: '600', color: MUTED },
});

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
 *   Cards     the web live map's (TripLivePanels.tsx): top, km by road to
 *             the next stop and the stop after; above the panel, arrival ·
 *             drive time or on time / late · km; the panel, the truck, the
 *             driver with Call and Share ETA, expanded both GPS feeds, every
 *             stop and every break.
 *
 * A trip whose truck isn't on the live map (not started, finished, no GPS)
 * says so — the trip page keeps its plain map for those.
 */
import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, LayoutAnimation, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box, ChevronDown, Compass, LocateFixed, Map as MapIcon, Moon, Navigation, Route, Sun, type LucideIcon } from 'lucide-react-native';
import { FleetMap, type FleetMapHandle, type FocusMode, type MapView } from './FleetMap';
import { TripShareFlow } from './FleetShare';
import { EtaStrip, GLASS as PANEL, NextStopCard, UnitPanel } from './TripLivePanels';
import { located, stoppedMin } from './fleetModel';
import type { MapTheme } from './mapStyle';
import { useFleetPrefs, type FleetPrefs } from './useFleetMapState';
import { useLiveFleet } from './useLiveFleet';
import { useTripRoute } from './useTripRoute';

type Mode = NonNullable<FleetPrefs['tripView']>;

const MODES: { id: Mode; label: string; icon: LucideIcon; a11y: string }[] = [
  { id: 'flat', label: '2D', icon: MapIcon, a11y: 'Flat map' },
  { id: 'tilted', label: '3D', icon: Box, a11y: 'Tilted 3D map' },
  { id: 'drive', label: 'Drive', icon: Navigation, a11y: 'Behind the truck' },
  { id: 'route', label: 'Route', icon: Route, a11y: 'Whole trip' },
];
const FOCUS: Record<Mode, FocusMode> = { flat: 'none', tilted: 'none', drive: 'driver', route: 'overview' };

/** The view buttons: the web's glass, the picked one filled. */
const SELECTED: Record<MapTheme, { on: string; onFg: string }> = {
  light: { on: '#18181B', onFg: '#FFFFFF' },
  dark: { on: '#F4F4F5', onFg: '#18181B' },
};

export default function TripLiveScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  // Same data as the Fleet map — opening one after the other reuses it.
  const { live, f, now } = useLiveFleet();

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
  const [cardH, setCardH] = useState(200);
  const [topH, setTopH] = useState(120);
  const [expanded, setExpanded] = useState(false);
  const [shareChoose, setShareChoose] = useState(false);

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

  const glass = { ...PANEL[theme], ...SELECTED[theme] };
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
        {live.isLoading ? <ActivityIndicator color={PANEL.light.muted} /> : (
          <>
            <Text style={s.emptyTitle}>Not on the live map</Text>
            <Text style={s.emptyText}>This trip&apos;s truck isn&apos;t sending its position right now — it may not have started, be finished, or have no GPS.</Text>
          </>
        )}
      </View>
    );
  }

  const eta = route.eta;
  const speed = unit.motion === 'moving' && unit.position?.speed_kph != null ? Math.round(unit.position.speed_kph) : null;
  const lastHalt = route.halts?.[route.halts.length - 1];
  const stoodMin = stoppedMin(unit, now) ?? (lastHalt?.ongoing ? lastHalt.minutes : null);
  const breaks = route.halts?.filter((h) => h.kind === 'break') ?? [];
  const hasNextCard = !!route.next;
  // Above the panel: the arrival strip, then Recenter / the speed.
  const stripBottom = cardH + 16;

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
        // Clear of the next-stop card, the panel and its strip, and the view buttons (52 wide + 14 margin).
        padding={{ top: insets.top + 8 + (hasNextCard ? topH : 44) + 16, bottom: cardH + 90, right: 100 }}
      />
      ) : null}

      {closeBtn}

      {/* Top: the next stop, as on the web live map */}
      {hasNextCard ? (
        <View style={[s.nextWrap, { top: insets.top + 8 }]} onLayout={(e) => setTopH(e.nativeEvent.layout.height)} pointerEvents="none">
          <NextStopCard unit={unit} eta={eta} final={route.final} f={f} theme={theme} />
        </View>
      ) : null}

      {/* Right: the view, then light / dark — out of the way while the panel is open over the map */}
      {!expanded ? (
      <View style={[s.ctlCol, { top: insets.top + 8 + (hasNextCard ? topH : 44) + 12 }]}>
        <View style={[s.ctlGroup, { backgroundColor: glass.bg, borderColor: glass.border }]}>
          {MODES.map((m, i) => {
            const on = mode === m.id;
            return (
              <React.Fragment key={m.id}>
                {i > 0 ? <View style={[s.rule, { backgroundColor: glass.border }]} /> : null}
                <TouchableOpacity style={[s.ctl, on && { backgroundColor: glass.on }]} onPress={() => applyMode(m.id)} accessibilityLabel={m.a11y} accessibilityState={{ selected: on }} activeOpacity={0.7}>
                  <m.icon size={18} color={on ? glass.onFg : glass.fg} strokeWidth={2.1} />
                  <Text style={[s.ctlCaption, { color: on ? glass.onFg : glass.fg }]}>{m.label}</Text>
                </TouchableOpacity>
              </React.Fragment>
            );
          })}
        </View>
        <TouchableOpacity style={[s.ctlSolo, { backgroundColor: glass.bg, borderColor: glass.border }]} onPress={toggleTheme} accessibilityLabel={theme === 'light' ? 'Dark map' : 'Light map'}>
          {theme === 'light' ? <Moon size={18} color={glass.fg} /> : <Sun size={18} color={glass.fg} />}
        </TouchableOpacity>
        {turned ? (
          <TouchableOpacity style={[s.ctlSolo, { backgroundColor: glass.bg, borderColor: glass.border }]} onPress={() => mapRef.current?.faceNorth()} accessibilityLabel="Face north">
            <View style={{ transform: [{ rotate: `${-camera.bearing - 45}deg` }] }}><Compass size={18} color={glass.fg} /></View>
          </TouchableOpacity>
        ) : null}
      </View>
      ) : null}

      {/* Above the panel: arrival strip (left), Recenter or the speed (right) */}
      <View style={[s.aboveRow, { bottom: stripBottom }]} pointerEvents="box-none">
        {eta ? <EtaStrip eta={eta} f={f} g={glass} /> : <View />}
        {!following ? (
          <TouchableOpacity style={[s.recenter, { backgroundColor: glass.bg, borderColor: glass.border }]} onPress={() => { setFollowing(true); mapRef.current?.recenter(); }} accessibilityLabel="Back to the truck" activeOpacity={0.85}>
            <LocateFixed size={18} color={glass.fg} />
          </TouchableOpacity>
        ) : mode === 'drive' && speed != null ? (
          <View style={s.speed} pointerEvents="none">
            <Text style={s.speedNum}>{speed}</Text>
            <Text style={s.speedUnit}>km/h</Text>
          </View>
        ) : null}
      </View>

      {/* The panel */}
      <View style={[s.card, { backgroundColor: glass.bg, borderColor: glass.border, paddingBottom: insets.bottom + 10 }]} onLayout={(e) => setCardH(e.nativeEvent.layout.height)}>
        <TouchableOpacity onPress={toggleCard} style={s.handleHit} hitSlop={8} accessibilityLabel={expanded ? 'Show less' : 'Show the trip, stops and GPS'}>
          <View style={[s.handle, { backgroundColor: glass.border }]} />
        </TouchableOpacity>
        <ScrollView style={expanded ? { maxHeight: 460 } : undefined} scrollEnabled={expanded} showsVerticalScrollIndicator={false}>
          <UnitPanel
            unit={unit}
            now={now}
            f={f}
            theme={theme}
            expanded={expanded}
            onToggle={toggleCard}
            onShare={() => setShareChoose(true)}
            halts={route.halts}
            stoppedFor={stoodMin}
          />
          {eta?.approx && !route.routeQ.isLoading ? (
            <Text style={[s.note, { color: glass.muted }]}>Estimate — the road route couldn&apos;t be loaded, so the ETA is worked out from the straight-line distance.</Text>
          ) : null}
        </ScrollView>
      </View>

      <TripShareFlow unit={unit} open={shareChoose} onClose={() => setShareChoose(false)} />
    </View>
  );
}

const shadow = { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 15, shadowOffset: { width: 0, height: 8 }, elevation: 6 };

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f6f4ef' },
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: PANEL.light.fg },
  emptyText: { fontSize: 14, color: PANEL.light.muted, textAlign: 'center', lineHeight: 20 },
  round: { position: 'absolute', left: 12, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', ...shadow },
  nextWrap: { position: 'absolute', left: 64, right: 12 },
  ctlCol: { position: 'absolute', right: 12, gap: 10, alignItems: 'center' },
  ctlGroup: { borderRadius: 14, borderWidth: 1, overflow: 'hidden', ...shadow },
  ctl: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', gap: 3 },
  ctlCaption: { fontSize: 10, fontWeight: '700' },
  rule: { height: StyleSheet.hairlineWidth, marginHorizontal: 8 },
  ctlSolo: { width: 52, height: 44, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', ...shadow },
  aboveRow: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  recenter: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, alignItems: 'center', justifyContent: 'center', ...shadow },
  speed: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#FFFFFF', borderWidth: 4, borderColor: '#18181B', alignItems: 'center', justifyContent: 'center', ...shadow },
  speedNum: { fontSize: 20, fontWeight: '800', color: '#18181B', fontVariant: ['tabular-nums'], lineHeight: 22 },
  speedUnit: { fontSize: 9, fontWeight: '700', color: '#71717A' },
  card: { position: 'absolute', left: 8, right: 8, bottom: 8, borderRadius: 24, borderWidth: 1, paddingHorizontal: 16, ...shadow, shadowOpacity: 0.16, shadowRadius: 24 },
  handleHit: { alignItems: 'center', paddingTop: 8, paddingBottom: 10 },
  handle: { width: 38, height: 5, borderRadius: 3 },
  note: { fontSize: 11, marginTop: 10 },
});

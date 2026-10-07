/**
 * The bottom sheet on the Fleet map, and the rows shared with its list view.
 *
 *   UnitSheet   the picked truck, in the web live map's look (LivePanels.tsx
 *               pieces, light or dark glass with the map): the truck photo
 *               and what it's doing, the driver with Call, the next stop
 *               with its arrival (≈ without a road route) and on time /
 *               late, the delivery time at the last stop and the trip so
 *               far (driving, breaks). Share ETA, Open trip, Route (frame
 *               the whole trip) and Full screen (the trip's live view).
 *               Drag up (or "Stops & GPS") for both GPS feeds, the trip
 *               with every stop and what the driver sent from it (photos,
 *               POD, delay videos and the reason; tap to view) and its
 *               breaks; the trip's next step (Arrived at pickup, Confirm
 *               delivery…) and Cancel trip sit there too, out of reach of a
 *               stray tap (FleetActions.tsx confirms both). Swipe sideways
 *               — or the ‹ › arrows — for the next / previous truck in the
 *               current filter; drag down to shrink, then to close.
 *   GroupSheet  trucks parked on the same spot (a map group that never parts);
 *               tap one to pick it.
 * Both report their height so the map can keep its trucks clear of them.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, LayoutAnimation, PanResponder, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions,
} from 'react-native';
import { Check, ChevronDown, Route, ChevronLeft, ChevronRight, ChevronUp, Maximize2, X, ZoomIn } from 'lucide-react-native';
import type { LiveTripMedia, LiveUnit, TripHalt, TripTimeSplit } from '../../lib/operator';
import { niceName } from '../trips/create/components/ui';
import type { makeTime } from '../trips/list/tripListModel';
import { SILENT_COLOR, STATE_STYLE, TONE, unitState, unitTone, type UnitTone } from './FleetMap';
import { ArrivalRow, DriverRow, GLASS, PanelIconButton, ShareEtaButton, UnitDetails, UnitHead, type Glass, type OpenMedia } from './LivePanels';
import type { MapTheme } from './mapStyle';
import { agoText, formatDuration, formatKm, isSilent, located, nextStop, type EtaInfo } from './fleetModel';

const INK = '#3E3C3D';
const MUTED = '#6B6B76';
const LINE = '#E9E9EC';
const BRAND = '#FA634E';


/** How far a finger has to travel before a swipe or drag counts. */
const SWIPE_PX = 70;
const DRAG_PX = 50;

type Time = ReturnType<typeof makeTime>;


export function StateChip({ unit, now }: { unit: LiveUnit; now: number }) {
  const st = unitState(unit, now);
  const bg = st === 'delayed' ? '#FFE4E8' : '#F1F1F3';
  const fg = st === 'delayed' ? STATE_STYLE.delayed.color : INK;
  return (
    <View style={[s.state, { backgroundColor: bg }]}>
      <View style={[s.dot, { backgroundColor: STATE_STYLE[st].color }]} />
      <Text style={[s.stateText, { color: fg }]}>{STATE_STYLE[st].label}</Text>
    </View>
  );
}

export function UnitRow({ unit: u, now, km, onPress, onLongPress, selected, time, note }: {
  unit: LiveUnit; now: number; km: number | null; onPress: () => void;
  /** One short highlight for the last line, e.g. "35 min drive" or "free ~14:20". */
  note?: { text: string; color?: string } | null;
  /** Formats a clock time in the deployment time zone — adds "due 14:20" for the next stop. */
  time?: (iso: string) => string;
  /** Long-press starts picking trucks for a bulk status message. */
  onLongPress?: () => void;
  /** Picking mode: true / false shows a check box; undefined hides it. */
  selected?: boolean;
}) {
  const next = nextStop(u);
  return (
    <TouchableOpacity style={[s.row, selected && s.rowPicked]} onPress={onPress} onLongPress={onLongPress} delayLongPress={350} activeOpacity={0.6}>
      {selected !== undefined ? (
        <View style={[s.check, selected && s.checkOn, !u.trip && { opacity: 0.3 }]}>{selected ? <Check size={13} color="#FFFFFF" strokeWidth={3} /> : null}</View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.rowPlate}>{u.vehicle?.plate_number ?? 'No truck'}<Text style={s.rowDriver}>{u.driver ? `  ·  ${niceName(u.driver.name)}` : ''}</Text></Text>
        <Text style={s.rowSub} numberOfLines={2}>
          {u.trip ? [u.trip.ref_id, niceName(u.trip.customer_name), next?.name ? `→ ${niceName(next.name)}` : null].filter(Boolean).join(' · ') : 'No trip'}
          {time && next?.planned_arrival && !next.actual_arrival ? (
            new Date(next.planned_arrival).getTime() < now
              ? <Text style={{ color: BRAND, fontWeight: '600' }}>{`  ·  was due ${time(next.planned_arrival)}`}</Text>
              : <Text style={{ color: INK, fontWeight: '600' }}>{`  ·  due ${time(next.planned_arrival)}`}</Text>
          ) : null}
        </Text>
        <Text style={s.rowSeen}>
          {note ? <Text style={{ color: note.color ?? INK, fontWeight: '700' }}>{`${note.text} · `}</Text> : null}
          {km != null ? `${formatKm(km)} away · ` : ''}{u.position ? `Seen ${agoText(u.position.recorded_at, now)}` : 'No location'}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <StateChip unit={u} now={now} />
        {selected === undefined ? <ChevronRight size={16} color="#A1A1AA" /> : null}
      </View>
    </TouchableOpacity>
  );
}

/** Sheet chrome: white card pinned to the bottom with a grab handle; reports its height. */
export function SheetFrame({ children, onHeight, panHandlers, style }: {
  children: React.ReactNode; onHeight: (h: number) => void; panHandlers?: object; style?: object;
}) {
  return (
    <Animated.View style={[s.sheet, style]} onLayout={(e) => onHeight(e.nativeEvent.layout.height)} {...panHandlers}>
      <View style={s.handle} />
      {children}
    </Animated.View>
  );
}

export function UnitSheet({
  unit: u, eta, routeLoading, now, f, theme, expanded, onExpand, position, onPrev, onNext, onClose, onOpen, onHeight, media, onOpenMedia,
  nextStep, onCancelTrip, busy, onShare, finalEta, onShowRoute, routeShown, onFullScreen, halts, timeSplit, stoppedFor,
}: {
  unit: LiveUnit; eta: EtaInfo | null; routeLoading: boolean; now: number; f: Time;
  /** The map's light / dark — the sheet's glass follows it, as on the web. */
  theme: MapTheme;
  expanded: boolean; onExpand: (v: boolean) => void;
  /** Where this truck sits in the swipe order, e.g. 4 of 26. */
  position: { index: number; total: number };
  onPrev: (() => void) | null; onNext: (() => void) | null;
  onClose: () => void; onOpen: (tripId: string) => void; onHeight: (h: number) => void;
  /** What the driver sent per stop — loaded only while the sheet is expanded. */
  media?: LiveTripMedia | null;
  onOpenMedia?: OpenMedia;
  /** The trip's next step from here, e.g. "Confirm delivery"; null when there is none. */
  nextStep?: { label: string; onPress: () => void } | null;
  onCancelTrip?: (() => void) | null;
  /** A status change is on its way — the buttons wait. */
  busy?: boolean;
  /** WhatsApp: status, location or delay notice for this truck's trip (FleetShare.tsx). */
  onShare?: (() => void) | null;
  /** Arrival at the trip's last stop (next-stop ETA + road time for the rest), when it isn't the next one. */
  finalEta?: { time: string; place: string | null } | null;
  /** Where the truck stood still on this trip, and the time so far split into driving and breaks. */
  halts?: TripHalt[] | null;
  timeSplit?: TripTimeSplit | null;
  /** Minutes it has stood still (shown with "Stopped"). */
  stoppedFor?: number | null;
  /** Frame the whole trip on the map (a toggle — routeShown says it's on). */
  onShowRoute?: (() => void) | null;
  routeShown?: boolean;
  /** The trip full screen: its live view (2D / 3D / Drive / Route). */
  onFullScreen?: (() => void) | null;
}) {
  const { width } = useWindowDimensions();
  const g = GLASS[theme];
  const t = u.trip;

  // Follows the finger: sideways to change truck, up/down to resize or close.
  const [tx] = useState(() => new Animated.Value(0));
  const [ty] = useState(() => new Animated.Value(0));
  const axis = useRef<'x' | 'y' | null>(null);
  // The responder is made once; it reads the latest props through a ref.
  const latest = useRef({ onPrev, onNext, onClose, onExpand, expanded, width });
  useEffect(() => { latest.current = { onPrev, onNext, onClose, onExpand, expanded, width }; });

  const toggle = (v: boolean) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    latest.current.onExpand(v);
  };

  const slide = (dir: 1 | -1, go: () => void) => {
    const w = latest.current.width;
    Animated.timing(tx, { toValue: -dir * w, duration: 140, useNativeDriver: true }).start(() => {
      go();
      tx.setValue(dir * w * 0.6);
      Animated.spring(tx, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
    });
  };

  // The handlers only touch the refs when a gesture fires, never while rendering.
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => {
      const ax = Math.abs(g.dx);
      const ay = Math.abs(g.dy);
      if (ax > 12 && ax > ay * 1.3) { axis.current = 'x'; return true; }
      if (ay > 12 && ay > ax * 1.3) { axis.current = 'y'; return true; }
      return false;
    },
    onPanResponderMove: (_, g) => {
      if (axis.current === 'x') tx.setValue(g.dx);
      // Upward drags only stretch a little; downward follows the finger.
      else ty.setValue(g.dy < 0 ? g.dy / 4 : g.dy);
    },
    onPanResponderRelease: (_, g) => {
      const { onPrev: prev, onNext: nxt, onClose: close, expanded: open } = latest.current;
      if (axis.current === 'x') {
        if ((g.dx < -SWIPE_PX || g.vx < -0.6) && nxt) slide(1, nxt);
        else if ((g.dx > SWIPE_PX || g.vx > 0.6) && prev) slide(-1, prev);
        else Animated.spring(tx, { toValue: 0, useNativeDriver: true }).start();
      } else {
        if (g.dy < -DRAG_PX && !open) toggle(true);
        else if (g.dy > DRAG_PX && open) toggle(false);
        else if (g.dy > DRAG_PX * 1.6 && !open) close();
        Animated.spring(ty, { toValue: 0, useNativeDriver: true }).start();
      }
      axis.current = null;
    },
    onPanResponderTerminate: () => {
      Animated.spring(tx, { toValue: 0, useNativeDriver: true }).start();
      Animated.spring(ty, { toValue: 0, useNativeDriver: true }).start();
      axis.current = null;
    },
  }));

  return (
    <SheetFrame onHeight={onHeight} panHandlers={pan.panHandlers} style={{ backgroundColor: g.bg, borderColor: g.border, transform: [{ translateX: tx }, { translateY: ty }] }}>
      <UnitHead
        unit={u}
        now={now}
        theme={theme}
        stoppedFor={stoppedFor ?? null}
        right={
          <TouchableOpacity onPress={onClose} hitSlop={8} style={[s.close, { backgroundColor: g.subtle }]} accessibilityLabel="Close">
            <X size={16} color={g.muted} />
          </TouchableOpacity>
        }
      />
      <DriverRow unit={u} theme={theme} />

      {!t ? (
        <Text style={[s.line, { color: g.muted }]}>Free — no trip right now</Text>
      ) : eta ? (
        <ArrivalRow unit={u} eta={eta} f={f} theme={theme} final={finalEta} estimateNote={eta.approx && !routeLoading} />
      ) : t.phase === 'upcoming' ? (
        <StartCard plannedStart={t.planned_start} now={now} f={f} g={g} />
      ) : null}
      {t && timeSplit && timeSplit.total_min >= 1 ? <TimeSplitLine split={timeSplit} g={g} /> : null}

      {expanded ? (
        <UnitDetails unit={u} now={now} f={f} theme={theme} halts={halts ?? null} media={media} onOpenMedia={onOpenMedia} onOpenTrip={t ? () => onOpen(t.id) : null} />
      ) : null}

      <View style={s.actions}>
        {t && onShare ? <ShareEtaButton onPress={onShare} /> : null}
        {t ? (
          <TouchableOpacity style={[s.open, { backgroundColor: theme === 'dark' ? '#F4F4F5' : '#18181B' }]} onPress={() => onOpen(t.id)} activeOpacity={0.85} accessibilityLabel="Open trip">
            <Text style={[s.openText, { color: theme === 'dark' ? '#18181B' : '#FFFFFF' }]}>Open trip</Text>
            <ChevronRight size={15} color={theme === 'dark' ? '#18181B' : '#FFFFFF'} />
          </TouchableOpacity>
        ) : <View style={{ flex: 1 }} />}
        {t && onShowRoute ? <PanelIconButton icon={Route} label={routeShown ? 'Back to the truck' : 'Show the whole route'} onPress={onShowRoute} theme={theme} on={routeShown} /> : null}
        {t && onFullScreen ? <PanelIconButton icon={Maximize2} label="Full screen" onPress={onFullScreen} theme={theme} /> : null}
      </View>
      {expanded && t && nextStep ? (
        <TouchableOpacity style={[s.step, { borderColor: g.border }, busy && { opacity: 0.6 }]} onPress={nextStep.onPress} disabled={busy} activeOpacity={0.85} accessibilityLabel={nextStep.label}>
          {busy ? <ActivityIndicator size="small" color={g.fg} /> : <Text style={[s.stepText, { color: g.fg }]} numberOfLines={1}>Update status: {nextStep.label}</Text>}
        </TouchableOpacity>
      ) : null}
      {expanded && t && onCancelTrip ? (
        <TouchableOpacity onPress={onCancelTrip} disabled={busy} style={s.cancel} accessibilityLabel="Cancel trip">
          <Text style={s.cancelText}>Cancel trip</Text>
        </TouchableOpacity>
      ) : null}

      <View style={s.footer}>
        <TouchableOpacity style={s.more} onPress={() => toggle(!expanded)} hitSlop={6} accessibilityLabel={expanded ? 'Show less' : 'Show stops and GPS'}>
          {expanded ? <ChevronDown size={15} color={g.muted} /> : <ChevronUp size={15} color={g.muted} />}
          <Text style={[s.moreText, { color: g.muted }]}>{expanded ? 'Less' : t ? 'Stops & GPS' : 'GPS'}</Text>
        </TouchableOpacity>
        {position.total > 1 ? (
          <View style={s.pager}>
            <TouchableOpacity onPress={() => onPrev && slide(-1, onPrev)} disabled={!onPrev} hitSlop={8} style={s.pageBtn} accessibilityLabel="Previous truck">
              <ChevronLeft size={17} color={onPrev ? g.fg : g.border} />
            </TouchableOpacity>
            <Text style={[s.pageText, { color: g.muted }]}>{position.index + 1} of {position.total}</Text>
            <TouchableOpacity onPress={() => onNext && slide(1, onNext)} disabled={!onNext} hitSlop={8} style={s.pageBtn} accessibilityLabel="Next truck">
              <ChevronRight size={17} color={onNext ? g.fg : g.border} />
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </SheetFrame>
  );
}

/** "Driving 9 h 12 min · 2 breaks 1 h 44 min" — the trip so far (API tripHalts.ts). */
function TimeSplitLine({ split, g }: { split: TripTimeSplit; g: Glass }) {
  const parts = [
    `Driving ${formatDuration(split.driving_min * 60)}`,
    split.breaks ? `${split.breaks} ${split.breaks === 1 ? 'break' : 'breaks'} ${formatDuration(split.breaks_min * 60)}` : 'no breaks',
    split.at_stops_min ? `at stops ${formatDuration(split.at_stops_min * 60)}` : null,
  ].filter(Boolean);
  return <Text style={[s.line, { color: g.muted }]} numberOfLines={2}>{parts.join('  ·  ')}</Text>;
}

/** A trip that hasn't started: when it's due, or how late it is. */
function StartCard({ plannedStart, now, f, g }: { plannedStart: string | null; now: number; f: Time; g: Glass }) {
  if (!plannedStart) return <Text style={[s.line, { color: g.muted }]}>Scheduled — no start time set</Text>;
  const min = Math.round((new Date(plannedStart).getTime() - now) / 60000);
  const late = min < -5;
  const sameDay = f.dayKey(plannedStart) === f.dayKey(now);
  return (
    <View style={[s.startCard, { backgroundColor: late ? 'rgba(225,29,72,0.08)' : g.subtle }]}>
      <Text style={[s.startLabel, { color: g.muted }]}>{late ? 'Should have started' : 'Starts'}</Text>
      <Text style={[s.startTime, { color: late ? g.bad : g.fg }]}>{sameDay ? f.time(plannedStart) : `${f.day(plannedStart)} ${f.time(plannedStart)}`}</Text>
      <Text style={[s.startSub, { color: late ? g.bad : g.muted }]}>
        {late ? `${formatDuration(-min * 60)} ago` : min <= 1 ? 'due now' : `in ${formatDuration(min * 60)}`}
      </Text>
    </View>
  );
}

const MIX_TONES: UnitTone[] = ['delayed', 'active', 'upcoming', 'free'];

/**
 * The trucks of a tapped map group, most urgent first (the web's cluster list):
 * how they split by status, "Zoom to these", and a row per truck to pick it.
 */
export function GroupSheet({ units, now, onPick, onZoom, onClose, onHeight }: {
  units: LiveUnit[]; now: number; onPick: (key: string) => void; onZoom?: () => void; onClose: () => void; onHeight: (h: number) => void;
}) {
  const mix = MIX_TONES.map((t) => ({ t, n: units.filter((u) => unitTone(u) === t).length })).filter((m) => m.n > 0);
  const quiet = units.filter((u) => isSilent(u, now)).length;
  return (
    <SheetFrame onHeight={onHeight}>
      <View style={s.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={[s.plate, { fontSize: 17 }]}>{units.length} trucks here</Text>
          <View style={s.mixRow}>
            {mix.map(({ t, n }) => (
              <View key={t} style={s.mixItem}>
                <View style={[s.dot, { backgroundColor: TONE[t].color }]} />
                <Text style={s.mixText}>{n} {TONE[t].label.toLowerCase()}</Text>
              </View>
            ))}
            {quiet ? (
              <View style={s.mixItem}>
                <View style={[s.dot, { backgroundColor: SILENT_COLOR }]} />
                <Text style={s.mixText}>{quiet} not live</Text>
              </View>
            ) : null}
          </View>
        </View>
        {onZoom ? (
          <TouchableOpacity onPress={onZoom} hitSlop={6} style={s.zoomBtn} accessibilityLabel="Zoom to these trucks">
            <ZoomIn size={14} color={INK} />
            <Text style={s.zoomText}>Zoom</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity onPress={onClose} hitSlop={8} style={s.close} accessibilityLabel="Close"><X size={16} color={MUTED} /></TouchableOpacity>
      </View>
      <ScrollView style={{ maxHeight: 320 }}>
        {units.map((u, i) => (
          <View key={u.key}>
            {i > 0 ? <View style={{ height: 1, backgroundColor: '#F1F1F3' }} /> : null}
            <UnitRow unit={u} now={now} km={null} onPress={() => onPick(u.key)} />
          </View>
        ))}
      </ScrollView>
    </SheetFrame>
  );
}

/**
 * Trucks that aren't live (the web's "N not live" list): those with only an
 * old position — tap to see it on the map — and those that never reported.
 */
export function NotLiveSheet({ units, now, onPick, onClose, onHeight }: {
  units: LiveUnit[]; now: number; onPick: (key: string) => void; onClose: () => void; onHeight: (h: number) => void;
}) {
  const stale = units.filter(located).sort((a, b) => (b.position?.recorded_at ?? '').localeCompare(a.position?.recorded_at ?? ''));
  const never = units.filter((u) => !located(u));
  return (
    <SheetFrame onHeight={onHeight}>
      <View style={s.cardTop}>
        <Text style={[s.plate, { flex: 1, fontSize: 17 }]}>{units.length} not live</Text>
        <TouchableOpacity onPress={onClose} hitSlop={8} style={s.close} accessibilityLabel="Close"><X size={16} color={MUTED} /></TouchableOpacity>
      </View>
      <ScrollView style={{ maxHeight: 340 }}>
        {stale.length ? <Text style={s.listHead}>Last known position</Text> : null}
        {stale.map((u) => (
          <TouchableOpacity key={u.key} style={s.quietRow} onPress={() => onPick(u.key)} activeOpacity={0.7}>
            <View style={[s.dot, { backgroundColor: '#F59E0B' }]} />
            <Text style={s.quietPlate} numberOfLines={1}>{u.vehicle?.plate_number ?? u.driver?.name ?? 'Unknown'}</Text>
            <Text style={s.quietMeta}>{agoText(u.position?.recorded_at, now)}</Text>
          </TouchableOpacity>
        ))}
        {never.length ? <Text style={s.listHead}>Never reported</Text> : null}
        {never.map((u) => (
          <View key={u.key} style={s.quietRow}>
            <View style={[s.dot, { backgroundColor: '#D4D4D8' }]} />
            <Text style={s.quietPlate} numberOfLines={1}>{u.vehicle?.plate_number ?? u.driver?.name ?? 'Unknown'}</Text>
            <Text style={s.quietMeta}>{u.vehicle && !u.vehicle.has_tracker ? 'No tracker' : 'No fix'}</Text>
          </View>
        ))}
      </ScrollView>
    </SheetFrame>
  );
}

const shadow = { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 4 };

const s = StyleSheet.create({
  startCard: { borderRadius: 12, padding: 10, marginTop: 10, gap: 2 },
  startLabel: { fontSize: 12, fontWeight: '600' },
  startTime: { fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  startSub: { fontSize: 12 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  state: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  stateText: { fontSize: 12, fontWeight: '600' },

  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13 },
  rowPicked: { backgroundColor: '#F6F6F7', marginHorizontal: -16, paddingHorizontal: 16 },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#C4C4CC', alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: INK, borderColor: INK },
  rowPlate: { fontSize: 15, fontWeight: '700', color: INK },
  rowDriver: { fontSize: 14, fontWeight: '500', color: '#3F3F46' },
  rowSub: { fontSize: 13, color: MUTED },
  rowSeen: { fontSize: 12, color: '#9898A4' },

  sheet: { position: 'absolute', left: 12, right: 12, bottom: 20, backgroundColor: '#FFFFFF', borderRadius: 20, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, gap: 10, ...shadow },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: '#DCDCE0' },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  mixRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, rowGap: 2, marginTop: 4 },
  mixItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  mixText: { fontSize: 12, color: MUTED },
  zoomBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 28, paddingHorizontal: 10, borderRadius: 14, backgroundColor: '#F1F1F3' },
  zoomText: { fontSize: 12, fontWeight: '600', color: INK },
  listHead: { fontSize: 11, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5, paddingTop: 10, paddingBottom: 4 },
  quietRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  quietPlate: { flex: 1, fontSize: 14, fontWeight: '600', color: INK, fontFamily: 'monospace' },
  quietMeta: { fontSize: 12, color: MUTED },
  plate: { fontSize: 19, fontWeight: '800', color: INK, letterSpacing: 0.3 },
  close: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F1F1F3', alignItems: 'center', justifyContent: 'center' },
  line: { fontSize: 13, color: MUTED, lineHeight: 19 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  open: { flex: 1, height: 44, borderRadius: 12, backgroundColor: INK, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  openText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
  step: { height: 42, marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: LINE, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  stepText: { fontSize: 14, fontWeight: '600', color: INK },
  cancel: { alignSelf: 'flex-start', paddingVertical: 4 },
  cancelText: { fontSize: 13, fontWeight: '600', color: '#D92D20' },

  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: -2 },
  more: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  moreText: { fontSize: 12, fontWeight: '600', color: MUTED },
  pager: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  pageBtn: { width: 30, height: 28, alignItems: 'center', justifyContent: 'center' },
  pageText: { fontSize: 12, fontWeight: '600', color: MUTED, fontVariant: ['tabular-nums'] },

});

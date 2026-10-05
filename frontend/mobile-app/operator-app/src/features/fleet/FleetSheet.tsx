/**
 * The bottom sheet on the Fleet map, and the rows shared with its list view.
 *
 *   UnitSheet   the picked truck. Peek shows who, where to, the ETA and the
 *               actions; drag up (or "Stops & GPS") for the stop timeline and
 *               both GPS feeds, with what the driver sent from each stop
 *               (photos, POD, delay videos and the delay reason; tap to view).
 *               The trip's next step (Arrived at pickup, Loaded · depart,
 *               Confirm delivery…) is the main button; Cancel trip sits in the
 *               expanded part (FleetActions.tsx confirms both).
 *               Swipe sideways — or the ‹ › arrows — for the
 *               next / previous truck in the current filter; drag down to
 *               shrink, then to close.
 *   GroupSheet  trucks parked on the same spot (a map group that never parts);
 *               tap one to pick it.
 * Both report their height so the map can keep its trucks clear of them.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Image, LayoutAnimation, Linking, PanResponder, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions,
} from 'react-native';
import { resolveMediaUrl } from '@mercon/mobile-shared/lib/media';
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, MessageCircle, Phone, Play, Smartphone, Truck, X } from 'lucide-react-native';
import type { LiveTripMedia, LiveUnit, TripMediaItem } from '../../lib/operator';
import type { ViewerItem } from '../trips/details/components/MediaViewer';
import { niceName } from '../trips/create/components/ui';
import type { makeTime } from '../trips/list/tripListModel';
import { STATE_STYLE, unitState } from './FleetMap';
import { agoText, formatDuration, formatKm, isFree, nextStop, punctuality, type EtaInfo } from './fleetModel';

const INK = '#3E3C3D';
const MUTED = '#6B6B76';
const LINE = '#E9E9EC';
const BRAND = '#FA634E';
const BRAND_LIGHT = '#FFF0EB';

/** What the truck is doing right now — same words as the web live map. */
const MOTION: Record<NonNullable<LiveUnit['motion']>, { label: string; color: string }> = {
  moving: { label: 'Moving', color: '#16A34A' },
  idle: { label: 'Stopped', color: INK },
  stale: { label: 'Offline', color: '#9898A4' },
  no_signal: { label: 'No signal', color: '#9898A4' },
};

/** How far a finger has to travel before a swipe or drag counts. */
const SWIPE_PX = 70;
const DRAG_PX = 50;

type Time = ReturnType<typeof makeTime>;

/** Opens the full-screen viewer on one stop's uploads. */
export type OpenMedia = (items: ViewerItem[], index: number, title: string) => void;

/** Order under a stop: the sequence a driver works through. */
const STAGE_ORDER: TripMediaItem['stage'][] = ['arrived', 'loaded', 'stop', 'delivered', 'delay', 'other'];
const STAGE_LABEL: Record<TripMediaItem['stage'], string> = {
  arrived: 'Arrived', loaded: 'Loaded', stop: 'At stop', delivered: 'Delivered', delay: 'Delay', other: 'Photo',
};
/** "VehicleBreakdown" → "Vehicle breakdown". */
const humanize = (v: string) => v.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/^./, (c) => c.toUpperCase());

export function StateChip({ unit, now }: { unit: LiveUnit; now: number }) {
  const st = unitState(unit, now);
  const bg = st === 'delayed' ? BRAND_LIGHT : '#F1F1F3';
  const fg = st === 'delayed' ? BRAND : INK;
  return (
    <View style={[s.state, { backgroundColor: bg }]}>
      <View style={[s.dot, { backgroundColor: STATE_STYLE[st].color }, st === 'free' && { borderWidth: 1.5, borderColor: INK }]} />
      <Text style={[s.stateText, { color: fg }]}>{STATE_STYLE[st].label}</Text>
    </View>
  );
}

export function UnitRow({ unit: u, now, km, onPress, onLongPress, selected, time }: {
  unit: LiveUnit; now: number; km: number | null; onPress: () => void;
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
function SheetFrame({ children, onHeight, panHandlers, style }: {
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
  unit: u, eta, routeLoading, now, f, expanded, onExpand, position, onPrev, onNext, onClose, onOpen, onHeight, media, onOpenMedia,
  nextStep, onCancelTrip, busy, onShare, finalEta,
}: {
  unit: LiveUnit; eta: EtaInfo | null; routeLoading: boolean; now: number; f: Time;
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
}) {
  const { width } = useWindowDimensions();
  const t = u.trip;
  const next = nextStop(u);
  const phone = u.driver?.phone ?? null;
  const p = punctuality(eta?.lateByMin ?? null);
  const done = t ? t.stops.filter((x) => x.actual_arrival).length : 0;

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
    <SheetFrame onHeight={onHeight} panHandlers={pan.panHandlers} style={{ transform: [{ translateX: tx }, { translateY: ty }] }}>
      <View style={s.cardTop}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.plate}>{u.vehicle?.plate_number ?? 'No truck'}</Text>
          <Text style={s.driver}>{u.driver ? niceName(u.driver.name) : 'No driver'}</Text>
          <MotionLine unit={u} now={now} />
        </View>
        <StateChip unit={u} now={now} />
        <TouchableOpacity onPress={onClose} hitSlop={8} style={s.close} accessibilityLabel="Close"><X size={16} color={MUTED} /></TouchableOpacity>
      </View>

      {t ? (
        <Text style={s.line}>
          {[t.ref_id, niceName(t.customer_name)].filter(Boolean).join(' · ')}
          {t.stops.length ? `  ·  ${done} of ${t.stops.length} stops done` : ''}
        </Text>
      ) : <Text style={s.line}>Free — no trip right now</Text>}

      {eta ? (
        <View style={s.etaCard}>
          <View style={s.etaHead}>
            <View style={{ flex: 1 }}>
              <Text style={s.etaLabel} numberOfLines={1}>Arrives {niceName(next?.name) || `stop ${next?.sequence ?? ''}`}</Text>
              <Text style={s.etaTime}>{eta.arrival ? f.time(eta.arrival.toISOString()) : '—'}</Text>
            </View>
            {p ? (
              <View style={[s.pill, { backgroundColor: p.good ? '#E8F5EE' : BRAND_LIGHT }]}>
                <Text style={[s.pillText, { color: p.good ? '#1F7A45' : BRAND }]}>{p.label}</Text>
              </View>
            ) : null}
          </View>
          <Text style={s.etaSub}>
            {[eta.durationSeconds != null ? `in ${formatDuration(eta.durationSeconds)}` : null, eta.distanceKm != null ? `${formatKm(eta.distanceKm)} ${eta.distanceIsRoad ? 'by road' : 'straight line'}` : null].filter(Boolean).join('  ·  ')}
          </Text>
          {t && t.stops.length > 1 ? <StopProgress stops={t.stops} nextId={next?.id ?? null} /> : null}
          {finalEta ? <Text style={s.etaFinal}>Delivery at {niceName(finalEta.place)} around <Text style={{ fontWeight: '700', color: INK }}>{finalEta.time}</Text></Text> : null}
        </View>
      ) : t && t.phase === 'upcoming' ? (
        <StartCard plannedStart={t.planned_start} now={now} f={f} />
      ) : null}
      {eta && !eta.distanceIsRoad && !routeLoading ? <Text style={s.note}>Road routing unavailable — distance is a straight line.</Text> : null}

      {expanded ? (
        <>
          <View style={s.feeds}>
            <Feed icon={Truck} label="Tracker" iso={u.vehicle_gps?.recorded_at} missing={!u.vehicle ? 'No truck' : !u.vehicle.has_tracker ? 'None fitted' : 'No fix yet'} now={now} />
            <Feed icon={Smartphone} label="Phone" iso={u.driver_gps?.recorded_at} missing={!u.driver ? 'No driver' : isFree(u) ? 'Off trip' : 'Silent'} now={now} />
          </View>
          {u.feeds_gap_m != null && u.feeds_gap_m > 1000 ? <Text style={[s.note, { color: BRAND, fontWeight: '600' }]}>Tracker and phone are {formatKm(u.feeds_gap_m / 1000)} apart</Text> : null}
          {t && t.stops.length ? <StopTimeline stops={t.stops} nextId={next?.id ?? null} f={f} media={media ?? null} onOpenMedia={onOpenMedia} /> : null}
        </>
      ) : null}

      <View style={s.actions}>
        {phone ? (
          <TouchableOpacity style={s.iconBtn} onPress={() => Linking.openURL(`tel:${phone}`).catch(() => {})} accessibilityLabel="Call driver">
            <Phone size={17} color="#3F3F46" strokeWidth={2.2} />
          </TouchableOpacity>
        ) : null}
        {t && onShare ? (
          <TouchableOpacity style={s.iconBtn} onPress={onShare} accessibilityLabel="Send on WhatsApp">
            <MessageCircle size={17} color="#3F3F46" strokeWidth={2.2} />
          </TouchableOpacity>
        ) : null}
        {t && nextStep ? (
          <>
            <TouchableOpacity style={[s.open, busy && { opacity: 0.6 }]} onPress={nextStep.onPress} disabled={busy} activeOpacity={0.85}>
              {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={s.openText} numberOfLines={1}>{nextStep.label}</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={s.tripBtn} onPress={() => onOpen(t.id)} accessibilityLabel="Open trip">
              <Text style={s.tripBtnText}>Trip</Text>
              <ChevronRight size={15} color={INK} />
            </TouchableOpacity>
          </>
        ) : t ? (
          <TouchableOpacity style={s.open} onPress={() => onOpen(t.id)} activeOpacity={0.85}>
            <Text style={s.openText}>Open trip</Text>
            <ChevronRight size={16} color="#FFFFFF" />
          </TouchableOpacity>
        ) : <View style={{ flex: 1 }} />}
      </View>
      {expanded && t && onCancelTrip ? (
        <TouchableOpacity onPress={onCancelTrip} disabled={busy} style={s.cancel} accessibilityLabel="Cancel trip">
          <Text style={s.cancelText}>Cancel trip</Text>
        </TouchableOpacity>
      ) : null}

      <View style={s.footer}>
        <TouchableOpacity style={s.more} onPress={() => toggle(!expanded)} hitSlop={6} accessibilityLabel={expanded ? 'Show less' : 'Show stops and GPS'}>
          {expanded ? <ChevronDown size={15} color={MUTED} /> : <ChevronUp size={15} color={MUTED} />}
          <Text style={s.moreText}>{expanded ? 'Less' : t ? 'Stops & GPS' : 'GPS'}</Text>
        </TouchableOpacity>
        {position.total > 1 ? (
          <View style={s.pager}>
            <TouchableOpacity onPress={() => onPrev && slide(-1, onPrev)} disabled={!onPrev} hitSlop={8} style={s.pageBtn} accessibilityLabel="Previous truck">
              <ChevronLeft size={17} color={onPrev ? INK : '#C4C4CC'} />
            </TouchableOpacity>
            <Text style={s.pageText}>{position.index + 1} of {position.total}</Text>
            <TouchableOpacity onPress={() => onNext && slide(1, onNext)} disabled={!onNext} hitSlop={8} style={s.pageBtn} accessibilityLabel="Next truck">
              <ChevronRight size={17} color={onNext ? INK : '#C4C4CC'} />
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </SheetFrame>
  );
}

/** "● Moving · 72 km/h · GPS 1 min ago" */
function MotionLine({ unit: u, now }: { unit: LiveUnit; now: number }) {
  const m = u.motion ? MOTION[u.motion] : null;
  const parts = [
    m?.label,
    u.motion === 'moving' && u.position?.speed_kph != null ? `${Math.round(u.position.speed_kph)} km/h` : null,
    u.position ? `GPS ${agoText(u.position.recorded_at, now)}` : 'No GPS yet',
  ].filter(Boolean);
  return (
    <View style={s.motion}>
      {m ? <View style={[s.motionDot, { backgroundColor: m.color }]} /> : null}
      <Text style={s.motionText} numberOfLines={1}>{parts.join(' · ')}</Text>
    </View>
  );
}

/** Stops as a progress bar: done (ink), next (red), still to come (grey), and "1 of 3 done". */
function StopProgress({ stops, nextId }: { stops: NonNullable<LiveUnit['trip']>['stops']; nextId: string | null }) {
  const done = stops.filter((x) => x.actual_arrival).length;
  return (
    <View style={{ gap: 4 }}>
      <View style={s.progress}>
        {stops.map((x, i) => {
          const isDone = !!x.actual_arrival;
          const isNext = x.id === nextId;
          return (
            <React.Fragment key={x.id}>
              {i > 0 ? <View style={[s.progressLine, isDone || isNext ? { backgroundColor: INK } : null]} /> : null}
              <View style={[s.progressDot, isDone && { backgroundColor: INK, borderColor: INK }, isNext && { backgroundColor: BRAND, borderColor: BRAND }]} />
            </React.Fragment>
          );
        })}
      </View>
      <Text style={s.progressText}>{done} of {stops.length} stops done</Text>
    </View>
  );
}

/** A trip that hasn't started: when it's due, or how late it is. */
function StartCard({ plannedStart, now, f }: { plannedStart: string | null; now: number; f: Time }) {
  if (!plannedStart) return <Text style={s.line}>Scheduled — no start time set</Text>;
  const min = Math.round((new Date(plannedStart).getTime() - now) / 60000);
  const late = min < -5;
  const sameDay = f.dayKey(plannedStart) === f.dayKey(now);
  return (
    <View style={[s.etaCard, late && { backgroundColor: BRAND_LIGHT }]}>
      <Text style={s.etaLabel}>{late ? 'Should have started' : 'Starts'}</Text>
      <Text style={[s.etaTime, late && { color: BRAND }]}>{sameDay ? f.time(plannedStart) : `${f.day(plannedStart)} ${f.time(plannedStart)}`}</Text>
      <Text style={[s.etaSub, late && { color: BRAND, fontWeight: '600' }]}>
        {late ? `${formatDuration(-min * 60)} ago` : min <= 1 ? 'due now' : `in ${formatDuration(min * 60)}`}
      </Text>
    </View>
  );
}

/** Every stop in order: done (ink), next (red), still to come (outline) — planned vs actual arrival. */
function StopTimeline({ stops, nextId, f, media, onOpenMedia }: {
  stops: NonNullable<LiveUnit['trip']>['stops']; nextId: string | null; f: Time; media: LiveTripMedia | null; onOpenMedia?: OpenMedia;
}) {
  const byStop = new Map((media?.stops ?? []).map((m) => [m.stop_id, m]));
  const unplaced = media?.unplaced ?? [];
  return (
    <ScrollView style={{ maxHeight: 260 }} nestedScrollEnabled>
      {stops.map((st, i) => {
        const done = !!st.actual_arrival;
        const isNext = st.id === nextId;
        const late = done && st.planned_arrival
          ? Math.round((new Date(st.actual_arrival!).getTime() - new Date(st.planned_arrival).getTime()) / 60000)
          : null;
        return (
          <View key={st.id} style={s.stopRow}>
            <View style={{ alignItems: 'center' }}>
              <View style={[s.stopDot, done && s.stopDotDone, isNext && s.stopDotNext]}>
                <Text style={[s.stopNum, (done || isNext) && { color: '#FFFFFF' }]}>{i + 1}</Text>
              </View>
              {i < stops.length - 1 ? <View style={[s.stopRail, done && { backgroundColor: INK }]} /> : null}
            </View>
            <View style={{ flex: 1, paddingBottom: 10 }}>
              <Text style={[s.stopName, isNext && { color: BRAND }]} numberOfLines={1}>{niceName(st.name) || st.address || `Stop ${st.sequence}`}</Text>
              <Text style={s.stopMeta}>
                {niceName(st.type)}
                {st.planned_arrival ? `  ·  plan ${f.time(st.planned_arrival)}` : ''}
                {done ? `  ·  arrived ${f.time(st.actual_arrival)}` : ''}
                {late != null && late > 5 ? <Text style={{ color: BRAND, fontWeight: '600' }}>{`  (${formatDuration(late * 60)} late)`}</Text> : null}
              </Text>
              <StopMedia
                stop={byStop.get(st.id) ?? null}
                title={niceName(st.name) || `Stop ${i + 1}`}
                f={f}
                onOpenMedia={onOpenMedia}
              />
            </View>
          </View>
        );
      })}
      {unplaced.length ? (
        <View style={{ paddingLeft: 32, paddingBottom: 6 }}>
          <Text style={s.stopMeta}>Other uploads</Text>
          <Thumbs items={unplaced} title="Other uploads" f={f} onOpenMedia={onOpenMedia} />
        </View>
      ) : null}
    </ScrollView>
  );
}

/** The delay the driver reported, then thumbnails in the order the driver works through a stop. */
function StopMedia({ stop, title, f, onOpenMedia }: { stop: LiveTripMedia['stops'][number] | null; title: string; f: Time; onOpenMedia?: OpenMedia }) {
  if (!stop || (!stop.delay && !stop.media.length)) return null;
  const items = [...stop.media].sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) || a.captured_at.localeCompare(b.captured_at));
  return (
    <View style={{ gap: 4, marginTop: 4 }}>
      {stop.delay?.reason || stop.delay?.note ? (
        <Text style={s.delayText} numberOfLines={2}>
          Delay: {[stop.delay.reason ? humanize(stop.delay.reason) : null, stop.delay.note].filter(Boolean).join(' — ')}
          {stop.delay.logged_at ? `  ·  ${f.time(stop.delay.logged_at)}` : ''}
        </Text>
      ) : null}
      {items.length ? <Thumbs items={items} title={title} f={f} onOpenMedia={onOpenMedia} /> : null}
    </View>
  );
}

function Thumbs({ items, title, f, onOpenMedia }: { items: TripMediaItem[]; title: string; f: Time; onOpenMedia?: OpenMedia }) {
  const viewer: ViewerItem[] = items.map((m) => ({
    id: m.id,
    url: m.url,
    kind: m.kind === 'video' ? 'video' : 'photo',
    caption: `${m.kind === 'pod' ? 'POD' : STAGE_LABEL[m.stage]} · ${f.time(m.captured_at)}`,
  }));
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
      {items.map((m, i) => {
        const uri = resolveMediaUrl(m.url);
        return (
          <TouchableOpacity key={m.id} onPress={() => onOpenMedia?.(viewer, i, title)} activeOpacity={0.8} accessibilityLabel={`Open ${viewer[i].caption}`}>
            <View style={s.thumb}>
              {m.kind === 'video' || !uri ? (
                <View style={[s.thumbFill, s.thumbVideo]}><Play size={13} color="#FFFFFF" fill="#FFFFFF" /></View>
              ) : <Image source={{ uri }} style={s.thumbFill} />}
            </View>
            <Text style={s.thumbLabel} numberOfLines={1}>{m.kind === 'pod' ? 'POD' : STAGE_LABEL[m.stage]}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

export function GroupSheet({ units, now, onPick, onClose, onHeight }: {
  units: LiveUnit[]; now: number; onPick: (key: string) => void; onClose: () => void; onHeight: (h: number) => void;
}) {
  return (
    <SheetFrame onHeight={onHeight}>
      <View style={s.cardTop}>
        <Text style={[s.plate, { flex: 1, fontSize: 17 }]}>{units.length} trucks here</Text>
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
  plate: { fontSize: 19, fontWeight: '800', color: INK, letterSpacing: 0.3 },
  driver: { fontSize: 14, fontWeight: '500', color: '#3F3F46' },
  motion: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 },
  motionDot: { width: 7, height: 7, borderRadius: 4 },
  motionText: { fontSize: 12, color: MUTED },
  close: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F1F1F3', alignItems: 'center', justifyContent: 'center' },
  line: { fontSize: 13, color: MUTED, lineHeight: 19 },
  eta: { flexDirection: 'row', gap: 8 },
  etaCard: { backgroundColor: '#F6F6F7', borderRadius: 14, padding: 12, gap: 6 },
  etaHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  etaLabel: { fontSize: 12, fontWeight: '600', color: MUTED },
  etaTime: { fontSize: 28, fontWeight: '800', color: INK, fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
  etaSub: { fontSize: 13, color: '#3F3F46' },
  etaFinal: { fontSize: 12, color: MUTED },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  pillText: { fontSize: 12, fontWeight: '700' },
  progress: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  progressDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: '#C4C4CC', backgroundColor: '#FFFFFF' },
  progressLine: { flex: 1, height: 2, backgroundColor: '#DCDCE0' },
  progressText: { fontSize: 11, color: MUTED },
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
  tripBtn: { height: 44, borderRadius: 12, borderWidth: 1, borderColor: LINE, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 12 },
  tripBtnText: { fontSize: 14, fontWeight: '600', color: INK },
  cancel: { alignSelf: 'flex-start', paddingVertical: 4 },
  cancelText: { fontSize: 13, fontWeight: '600', color: '#D92D20' },

  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: -2 },
  more: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  moreText: { fontSize: 12, fontWeight: '600', color: MUTED },
  pager: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  pageBtn: { width: 30, height: 28, alignItems: 'center', justifyContent: 'center' },
  pageText: { fontSize: 12, fontWeight: '600', color: MUTED, fontVariant: ['tabular-nums'] },

  stopRow: { flexDirection: 'row', gap: 10 },
  stopDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#A1A1AA', alignItems: 'center', justifyContent: 'center' },
  stopDotDone: { backgroundColor: INK, borderColor: INK },
  stopDotNext: { backgroundColor: BRAND, borderColor: BRAND },
  stopNum: { fontSize: 10, fontWeight: '800', color: '#3F3F46' },
  stopRail: { width: 2, flex: 1, minHeight: 10, backgroundColor: '#E4E4E7', marginVertical: 2 },
  stopName: { fontSize: 13, fontWeight: '600', color: INK },
  stopMeta: { fontSize: 12, color: MUTED, marginTop: 1 },
  delayText: { fontSize: 12, color: BRAND, fontWeight: '600' },
  thumb: { width: 52, height: 52, borderRadius: 10, overflow: 'hidden', backgroundColor: '#F1F1F3' },
  thumbFill: { width: '100%', height: '100%' },
  thumbVideo: { backgroundColor: INK, alignItems: 'center', justifyContent: 'center' },
  thumbLabel: { fontSize: 10, color: MUTED, textAlign: 'center', marginTop: 2, width: 52 },
});

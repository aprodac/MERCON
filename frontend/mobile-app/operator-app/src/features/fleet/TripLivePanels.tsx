/**
 * The trip live view's cards — the web live map's, on the phone
 * (web-dashboard components/maps/live/LiveUnitPanel.tsx): keep the two in step.
 *
 *   NextStopCard  CarPlay's top-left card: km by road to the next stop, its
 *                 name, then the stop after (with the delivery time there).
 *   EtaStrip      CarPlay's arrival strip: arrival · drive time (or on time /
 *                 late) · km by road.
 *   UnitPanel     the web's details panel: the truck and what it's doing, the
 *                 driver with Call, Share ETA; expanded, both GPS feeds, the
 *                 trip with every stop (arrived / due) and its breaks.
 *
 * Glass light or dark with the map, like the web's GLASS.
 */
import React from 'react';
import { Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Check, ChevronDown, ChevronUp, MessageCircle, Navigation, Phone, Smartphone, TriangleAlert, Truck } from 'lucide-react-native';
import type { LiveGpsFix, LiveUnit, TripHalt } from '../../lib/operator';
import { niceName } from '../trips/create/components/ui';
import type { makeTime } from '../trips/list/tripListModel';
import { TONE, unitTone } from './FleetMap';
import { agoText, formatDuration, formatKm, nextStop, punctuality, type EtaInfo } from './fleetModel';
import type { MapTheme } from './mapStyle';

type Time = ReturnType<typeof makeTime>;
type Stop = NonNullable<LiveUnit['trip']>['stops'][number];

export interface Glass { bg: string; border: string; fg: string; muted: string; subtle: string; good: string; bad: string }
export const GLASS: Record<MapTheme, Glass> = {
  light: { bg: 'rgba(255,255,255,0.92)', border: 'rgba(0,0,0,0.06)', fg: '#18181B', muted: '#71717A', subtle: 'rgba(45,43,44,0.04)', good: '#059669', bad: '#E11D48' },
  dark: { bg: 'rgba(2,6,23,0.86)', border: 'rgba(255,255,255,0.10)', fg: '#F4F4F5', muted: '#A1A1AA', subtle: 'rgba(255,255,255,0.06)', good: '#34D399', bad: '#FB7185' },
};

/** The web's font-mono for plates and trip numbers. */
const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

const stopLabel = (s: Stop) => niceName(s.name) || niceName(s.address) || `Stop ${s.sequence}`;

export function NextStopCard({ unit, eta, final, f, theme }: {
  unit: LiveUnit; eta: EtaInfo | null; final: { at: Date; place: string | null } | null; f: Time; theme: MapTheme;
}) {
  const stop = nextStop(unit);
  if (!stop || !unit.trip) return null;
  const after = unit.trip.stops[(unit.trip.next_stop_index ?? 0) + 1];
  return (
    <View style={[n.card, { backgroundColor: theme === 'dark' ? 'rgba(15,61,52,0.94)' : 'rgba(62,60,61,0.94)' }]}>
      <View style={n.top}>
        <Navigation size={26} color="#7DD3FC" fill="rgba(255,255,255,0.1)" strokeWidth={2} />
        <View style={{ flex: 1 }}>
          <Text style={n.km}>{eta?.distanceKm != null ? `${eta.approx ? '≈ ' : ''}${formatKm(eta.distanceKm)}` : '—'}</Text>
          <Text style={n.kmLabel}>{eta?.stopLooksWrong ? 'stop location looks wrong' : 'by road to next stop'}</Text>
        </View>
      </View>
      <Text style={n.stop} numberOfLines={1}>{stopLabel(stop)}</Text>
      {after ? (
        <View style={n.then}>
          <Text style={n.thenLabel}>Then</Text>
          <Text style={n.thenText} numberOfLines={1}>{stopLabel(after)}</Text>
          {final && !unit.trip.stops[(unit.trip.next_stop_index ?? 0) + 2] ? <Text style={n.thenTime}>~{f.time(final.at.toISOString())}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

export function EtaStrip({ eta, f, g }: { eta: EtaInfo; f: Time; g: Glass }) {
  const p = punctuality(eta.lateByMin);
  return (
    <View style={[x.strip, { backgroundColor: g.bg, borderColor: g.border }]}>
      <Metric g={g} value={eta.arrival ? `${eta.approx ? '≈ ' : ''}${f.time(eta.arrival.toISOString())}` : '—'} label={eta.approx ? 'arrival (estimate)' : 'arrival'} />
      <Metric
        g={g}
        value={eta.durationSeconds != null ? formatDuration(eta.durationSeconds) : '—'}
        label={p?.label ?? (eta.stopLooksWrong ? 'stop location looks wrong' : 'drive time')}
        tone={p ? (p.good ? g.good : g.bad) : undefined}
      />
      {eta.distanceKm != null ? <Metric g={g} value={`${eta.approx ? '≈ ' : ''}${formatKm(eta.distanceKm)}`} label="by road" /> : null}
    </View>
  );
}

function Metric({ value, label, tone, g }: { value: string; label: string; tone?: string; g: Glass }) {
  return (
    <View>
      <Text style={[x.metricValue, { color: tone ?? g.fg }]}>{value}</Text>
      <Text style={[x.metricLabel, { color: g.muted }]}>{label}</Text>
    </View>
  );
}

const MOTION: Record<NonNullable<LiveUnit['motion']>, string> = { moving: 'Moving', idle: 'Stopped', stale: 'Offline', no_signal: 'No signal' };

export function MotionChip({ unit, theme }: { unit: LiveUnit; theme: MapTheme }) {
  const dark = theme === 'dark';
  const c = unit.motion === 'moving'
    ? { bg: 'rgba(16,185,129,0.12)', fg: dark ? '#6EE7B7' : '#047857', dot: '#10B981' }
    : unit.motion === 'idle'
      ? { bg: 'rgba(245,158,11,0.12)', fg: dark ? '#FCD34D' : '#B45309', dot: '#F59E0B' }
      : { bg: 'rgba(100,116,139,0.12)', fg: dark ? '#CBD5E1' : '#475569', dot: '#94A3B8' };
  return (
    <View style={[x.chip, { backgroundColor: c.bg }]}>
      <View style={[x.chipDot, { backgroundColor: c.dot }]} />
      <Text style={[x.chipText, { color: c.fg }]}>{unit.motion ? MOTION[unit.motion] : 'No GPS'}</Text>
    </View>
  );
}

export function UnitPanel({ unit, now, f, theme, expanded, onToggle, onShare, halts, stoppedFor }: {
  unit: LiveUnit; now: number; f: Time; theme: MapTheme; expanded: boolean; onToggle: () => void;
  onShare: (() => void) | null; halts: TripHalt[] | null;
  /** Minutes the truck has stood still, shown with "Stopped". */
  stoppedFor: number | null;
}) {
  const g = GLASS[theme];
  const tone = TONE[unitTone(unit)];
  const t = unit.trip;
  const speed = unit.motion === 'moving' && unit.position?.speed_kph != null ? Math.round(unit.position.speed_kph) : null;
  const breaks = halts?.filter((h) => h.kind === 'break') ?? [];
  return (
    <View>
      {/* Truck and what it's doing */}
      <View style={x.head}>
        <View style={[x.toneTile, { backgroundColor: tone.color + '1A' }]}>
          {unit.vehicle ? <Truck size={20} color={tone.color} /> : <Smartphone size={20} color={tone.color} />}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={x.titleRow}>
            <Text style={[x.plate, { color: g.fg }]} numberOfLines={1}>{unit.vehicle?.plate_number ?? unit.driver?.name ?? 'Truck'}</Text>
            <MotionChip unit={unit} theme={theme} />
          </View>
          <Text style={[x.sub, { color: g.muted }]} numberOfLines={1}>
            {[
              unit.vehicle?.asset_type ?? 'Driver phone',
              unit.position ? `GPS ${agoText(unit.position.recorded_at, now)}` : 'no GPS yet',
              speed != null ? `${speed} km/h` : unit.motion === 'idle' && stoppedFor != null && stoppedFor >= 1 ? `stopped ${formatDuration(stoppedFor * 60)}` : null,
            ].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>

      {/* Driver */}
      {unit.driver ? (
        <View style={[x.driver, { backgroundColor: g.subtle }]}>
          <View style={[x.initials, { backgroundColor: 'rgba(124,58,237,0.12)' }]}>
            <Text style={[x.initialsText, { color: theme === 'dark' ? '#C4B5FD' : '#6D28D9' }]}>
              {unit.driver.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?'}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[x.driverName, { color: g.fg }]} numberOfLines={1}>{niceName(unit.driver.name)}</Text>
            <Text style={[x.driverPhone, { color: g.muted }]} numberOfLines={1}>{unit.driver.phone ?? 'No phone on file'}</Text>
          </View>
          {unit.driver.phone ? (
            <TouchableOpacity style={x.call} onPress={() => Linking.openURL(`tel:${unit.driver!.phone}`).catch(() => {})} accessibilityLabel={`Call ${unit.driver.name}`}>
              <Phone size={17} color={g.good} />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {expanded ? (
        <View style={{ gap: 10, marginTop: 10 }}>
          <View style={x.feeds}>
            <FeedTile g={g} icon={Truck} label="Truck tracker" fix={unit.vehicle_gps} missing={!unit.vehicle ? 'No truck' : !unit.vehicle.has_tracker ? 'No tracker' : 'No fix yet'} now={now} />
            <FeedTile g={g} icon={Smartphone} label="Driver app" fix={unit.driver_gps} missing={!unit.driver ? 'No driver' : !t || t.phase === 'upcoming' ? 'Off trip' : 'Not sending'} now={now} />
          </View>
          {unit.feeds_gap_m != null && unit.feeds_gap_m > 1000 ? (
            <View style={x.apart}>
              <TriangleAlert size={14} color="#B45309" />
              <Text style={x.apartText}>Tracker and phone are {formatKm(unit.feeds_gap_m / 1000)} apart</Text>
            </View>
          ) : null}

          {t ? (
            <View style={[x.trip, { borderColor: g.border }]}>
              <View style={x.tripHead}>
                <Text style={[x.tripRef, { color: g.fg }]}>{t.ref_id ?? 'Trip'}</Text>
                <View style={[x.tonePill, { backgroundColor: tone.color + '1A' }]}>
                  <View style={[x.chipDot, { backgroundColor: tone.color }]} />
                  <Text style={[x.chipText, { color: tone.color }]}>{tone.label}</Text>
                </View>
              </View>
              {t.customer_name ? <Text style={[x.sub, { color: g.muted, marginTop: 2 }]} numberOfLines={1}>{niceName(t.customer_name)}</Text> : null}
              <View style={{ marginTop: 12 }}>
                {t.stops.map((s, i) => (
                  <StopRow key={s.id} s={s} index={i} isNext={i === t.next_stop_index} last={i === t.stops.length - 1} f={f} g={g} theme={theme} />
                ))}
              </View>
              {breaks.length ? (
                <View style={[x.breaks, { borderTopColor: g.border }]}>
                  <Text style={[x.breaksHead, { color: g.muted }]}>Breaks on the way</Text>
                  {breaks.map((h) => (
                    <View key={h.from} style={x.breakRow}>
                      <View style={[x.breakDot, { backgroundColor: h.ongoing ? '#F59E0B' : g.muted }]} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[x.stopText, { color: g.fg }]}>{f.time(h.from)} – {h.ongoing ? 'now' : f.time(h.to)}</Text>
                        {h.place ? <Text style={[x.stopSub, { color: g.muted }]} numberOfLines={1}>{h.place}</Text> : null}
                      </View>
                      <Text style={[x.breakMin, { color: h.ongoing ? '#D97706' : g.fg }]}>{formatDuration(h.minutes * 60)}{h.ongoing ? ' so far' : ''}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Actions */}
      <View style={x.actions}>
        {onShare ? (
          <TouchableOpacity style={x.share} onPress={onShare} activeOpacity={0.85} accessibilityLabel="Share the ETA on WhatsApp">
            <MessageCircle size={16} color="#FFFFFF" strokeWidth={2.4} />
            <Text style={x.shareText}>Share ETA</Text>
          </TouchableOpacity>
        ) : <View style={{ flex: 1 }} />}
        <TouchableOpacity style={[x.iconBtn, { borderColor: g.border }]} onPress={onToggle} accessibilityLabel={expanded ? 'Show less' : 'Show the trip, stops and GPS'}>
          {expanded ? <ChevronDown size={17} color={g.fg} /> : <ChevronUp size={17} color={g.fg} />}
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** Web's stop timeline: done (grey tick), next (blue), still to come (outline) — arrived / due time. */
function StopRow({ s, index, isNext, last, f, g, theme }: { s: Stop; index: number; isNext: boolean; last: boolean; f: Time; g: Glass; theme: MapTheme }) {
  const done = s.actual_arrival != null;
  const dark = theme === 'dark';
  const rail = dark ? '#475569' : '#CBD5E1';
  return (
    <View style={[x.stopRow, last && { paddingBottom: 0 }]}>
      {!last ? <View style={[x.rail, done ? { backgroundColor: rail } : { borderLeftWidth: 1, borderStyle: 'dashed', borderColor: rail }]} /> : null}
      <View
        style={[
          x.marker,
          done && { backgroundColor: dark ? '#334155' : '#E2E8F0' },
          isNext && { backgroundColor: '#2563EB', borderWidth: 3, borderColor: 'rgba(37,99,235,0.18)' },
          !done && !isNext && { borderWidth: 1, borderColor: rail, backgroundColor: dark ? '#0F172A' : '#FFFFFF' },
        ]}
      >
        {done ? <Check size={11} color={dark ? '#CBD5E1' : '#64748B'} strokeWidth={3} /> : <Text style={[x.markerText, { color: isNext ? '#FFFFFF' : '#64748B' }]}>{index + 1}</Text>}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[x.stopText, { color: done ? g.muted : g.fg }, isNext && { fontWeight: '700' }]} numberOfLines={1}>{stopLabel(s)}</Text>
        <Text style={[x.stopSub, { color: g.muted }]} numberOfLines={1}>
          {s.type}
          {done && s.actual_arrival ? ` · arrived ${f.time(s.actual_arrival)}` : ''}
          {!done && s.planned_arrival ? ` · due ${f.time(s.planned_arrival)}` : ''}
        </Text>
      </View>
    </View>
  );
}

function FeedTile({ icon: Icon, label, fix, missing, now, g }: { icon: typeof Truck; label: string; fix: LiveGpsFix | null; missing: string; now: number; g: Glass }) {
  const state = !fix ? 'none' : fix.fresh ? 'live' : 'stale';
  return (
    <View style={[x.feed, { borderColor: g.border }]}>
      <View style={x.feedHead}>
        <Icon size={13} color={g.muted} />
        <Text style={[x.feedLabel, { color: g.muted }]}>{label}</Text>
      </View>
      <View style={x.feedHead}>
        <View style={[x.chipDot, { backgroundColor: state === 'live' ? '#10B981' : state === 'stale' ? '#F59E0B' : '#CBD5E1' }]} />
        <Text style={[x.feedValue, { color: state === 'none' ? g.muted : g.fg }]}>{state === 'live' ? 'Live' : state === 'stale' ? agoText(fix!.recorded_at, now) : missing}</Text>
      </View>
    </View>
  );
}

const n = StyleSheet.create({
  card: { borderRadius: 18, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 15, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 14 },
  km: { fontSize: 26, lineHeight: 28, fontWeight: '600', color: '#FFFFFF', letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  kmLabel: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  stop: { fontSize: 15, fontWeight: '600', color: '#FFFFFF', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  then: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(45,43,44,0.18)' },
  thenLabel: { fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  thenText: { flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.78)' },
  thenTime: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.78)', fontVariant: ['tabular-nums'] },
});

const x = StyleSheet.create({
  strip: { flexDirection: 'row', alignItems: 'flex-end', gap: 20, borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 10, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 15, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  metricValue: { fontSize: 18, lineHeight: 22, fontWeight: '600', fontVariant: ['tabular-nums'] },
  metricLabel: { fontSize: 11 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  chipText: { fontSize: 11, fontWeight: '600' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toneTile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  plate: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2, fontFamily: MONO, flexShrink: 1 },
  sub: { fontSize: 12, marginTop: 1 },
  driver: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, padding: 10, marginTop: 12 },
  initials: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  initialsText: { fontSize: 12, fontWeight: '700' },
  driverName: { fontSize: 14, fontWeight: '600' },
  driverPhone: { fontSize: 12, marginTop: 1 },
  call: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(5,150,105,0.1)' },
  feeds: { flexDirection: 'row', gap: 8 },
  feed: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, gap: 3 },
  feedHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  feedLabel: { fontSize: 11 },
  feedValue: { fontSize: 12, fontWeight: '600' },
  apart: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, backgroundColor: 'rgba(245,158,11,0.1)', paddingHorizontal: 10, paddingVertical: 6 },
  apartText: { fontSize: 12, color: '#B45309' },
  trip: { borderWidth: 1, borderRadius: 12, padding: 12 },
  tripHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  tripRef: { fontSize: 12, fontWeight: '700', fontFamily: MONO },
  tonePill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  stopRow: { flexDirection: 'row', gap: 10, paddingBottom: 10 },
  rail: { position: 'absolute', left: 9, top: 21, bottom: 0, width: 1 },
  marker: { width: 19, height: 19, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  markerText: { fontSize: 10, fontWeight: '700' },
  stopText: { fontSize: 13 },
  stopSub: { fontSize: 11, marginTop: 1 },
  breaks: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, gap: 8 },
  breaksHead: { fontSize: 11, fontWeight: '600' },
  breakRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  breakDot: { width: 8, height: 8, borderRadius: 4 },
  breakMin: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  share: { flex: 1, height: 42, borderRadius: 12, backgroundColor: '#25D366', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  shareText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  iconBtn: { width: 42, height: 42, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});

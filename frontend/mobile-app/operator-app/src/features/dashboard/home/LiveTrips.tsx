/**
 * "Live trips": the trips on the road as a sideways strip of cards, each with
 * its own small map (the truck, the line to its next stop, the numbered stops)
 * under a status pill (on time / late / no GPS / all stops done) and which GPS
 * is live. Below: truck and customer, the route with one segment per step, the
 * next stop with its planned time, the driver with a call button, and Open
 * trip + Track (the Fleet map on that truck). Every stop reached but the trip
 * not closed → "Confirm delivery", which opens the trip. Late trips first,
 * then no GPS, then the rest; chips narrow it to one of those.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, StyleSheet, Linking } from 'react-native';
import { ChevronRight, MapPin, Maximize2, Navigation, Phone, UserX } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { resolveMediaUrl } from '@mercon/mobile-shared/lib/media';
import { isOnRoad, type LiveUnit } from '../../../lib/operator';
import { FleetMap } from '../../fleet/FleetMap';
import { isDelayed, isSilent } from '../../fleet/fleetModel';
import { initialsOf, niceName, shortName } from '../../trips/create/components/ui';
import { durationText } from '../actions/actionModel';
import { INK, LINE, MUTED, tap } from '../../notifications/components/parts';
import { TripStepBar, routeLine } from '@/components/TripStepBar';

const RED = '#D92D20';
const AMBER = '#B54708';
const GREEN = '#15803D';
const CARD_W = 268;
/** Each card is a live map; past this many the "All on the road" link takes over. */
const SHOWN = 10;

const short = (min: number) => durationText(min).replace(' days', 'd').replace(' h', 'h').replace(' min', 'm');

type Trip = NonNullable<LiveUnit['trip']>;
type Kind = 'late' | 'silent' | 'confirm' | 'ok';
type Row = { unit: LiveUnit; trip: Trip; kind: Kind };

/** Every stop reached but the trip not closed — the office still has to confirm the delivery. */
const allStopsDone = (t: Trip) => t.next_stop_index == null && t.stops.length > 0;

const kindOf = (u: LiveUnit, t: Trip, now: number): Kind =>
  allStopsDone(t) ? 'confirm' : isDelayed(u) ? 'late' : isSilent(u, now) ? 'silent' : 'ok';

const RANK: Record<Kind, number> = { late: 0, silent: 1, confirm: 2, ok: 3 };
const CHIPS: { kind: Kind; label: string; color: string }[] = [
  { kind: 'late', label: 'Late', color: RED },
  { kind: 'silent', label: 'No GPS', color: AMBER },
  { kind: 'ok', label: 'On time', color: GREEN },
  { kind: 'confirm', label: 'To confirm', color: AMBER },
];

function statusOf(row: Row, now: number): { text: string; color: string; dot: string } {
  const { unit: u, trip: t, kind } = row;
  const next = t.next_stop_index != null ? t.stops[t.next_stop_index] : null;
  if (kind === 'confirm') return { text: 'All stops done', color: AMBER, dot: '#F59E0B' };
  if (kind === 'late') {
    const due = next?.planned_arrival ? new Date(next.planned_arrival).getTime() : null;
    return { text: due && due < now ? `${short((now - due) / 60000)} late` : 'Delayed', color: RED, dot: RED };
  }
  if (kind === 'silent') {
    const seen = u.position?.recorded_at ? new Date(u.position.recorded_at).getTime() : null;
    return { text: seen ? `No GPS ${short((now - seen) / 60000)}` : 'No GPS', color: AMBER, dot: '#F59E0B' };
  }
  return { text: 'On time', color: GREEN, dot: '#16A34A' };
}

const FEED: Record<string, string> = { both: 'Truck + phone', vehicle: 'Truck GPS', driver: 'Phone GPS', none: 'No GPS' };

/** What the driver's doing, from the live position: "Moving · 64 km/h" / "Stopped 20m" / "No signal". */
function motionOf(u: LiveUnit, now: number): string | null {
  if (u.motion === 'moving') {
    const kph = u.position?.speed_kph;
    return kph != null && kph > 0 ? `Moving · ${Math.round(kph)} km/h` : 'Moving';
  }
  if (u.stopped_since) return `Stopped ${short((now - new Date(u.stopped_since).getTime()) / 60000)}`;
  if (u.motion === 'idle') return 'Stopped';
  if (u.motion === 'stale' || u.motion === 'no_signal') return 'No signal';
  return null;
}

export function LiveTrips({ units, tz, now, onOpenTrip, onTrack, onAll }: {
  units: LiveUnit[];
  tz: string;
  now: number;
  onOpenTrip: (id: string) => void;
  /** The Fleet map, on this trip's truck. */
  onTrack: (tripId: string) => void;
  onAll: () => void;
}) {
  const rows = useMemo<Row[]>(
    () => units
      .filter(isOnRoad)
      .map((u) => ({ unit: u, trip: u.trip!, kind: kindOf(u, u.trip!, now) }))
      .sort((a, b) => RANK[a.kind] - RANK[b.kind]),
    [units, now],
  );
  const [kind, setKind] = useState<Kind | null>(null);
  const counts = useMemo(() => {
    const c: Record<Kind, number> = { late: 0, silent: 0, confirm: 0, ok: 0 };
    for (const r of rows) c[r.kind] += 1;
    return c;
  }, [rows]);
  const active = kind && counts[kind] > 0 ? kind : null;
  const shown = (active ? rows.filter((r) => r.kind === active) : rows).slice(0, SHOWN);

  const time = (iso: string | null) => {
    if (!iso) return null;
    try {
      return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
    } catch {
      return null;
    }
  };

  return (
    <View style={{ gap: 10 }}>
      <View style={s.head}>
        <Text style={s.h2}>Live trips</Text>
        {rows.length ? (
          <TouchableOpacity onPress={() => { tap(); onAll(); }} hitSlop={8} style={s.link}>
            <Text style={s.linkText}>All {rows.length} on the road</Text>
            <ChevronRight size={15} color={MUTED} />
          </TouchableOpacity>
        ) : null}
      </View>

      {rows.length === 0 ? (
        <View style={s.empty}>
          <Navigation size={20} color="#A1A1AA" strokeWidth={2} />
          <Text style={s.emptyText}>No trucks on the road right now</Text>
        </View>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.bleed} contentContainerStyle={s.chips}>
            <Chip label="All" count={rows.length} color={GREEN} on={!active} onPress={() => setKind(null)} />
            {CHIPS.filter((c) => counts[c.kind] > 0).map((c) => (
              <Chip key={c.kind} label={c.label} count={counts[c.kind]} color={c.color} on={active === c.kind} onPress={() => setKind(c.kind)} />
            ))}
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.bleed} contentContainerStyle={s.strip}
            decelerationRate="fast" snapToInterval={CARD_W + 10}>
            {shown.map((r) => (
              <TripCard key={r.trip.id} row={r} now={now} time={time}
                onOpen={() => onOpenTrip(r.trip.id)} onTrack={() => onTrack(r.trip.id)} />
            ))}
          </ScrollView>
        </>
      )}
    </View>
  );
}

function Chip({ label, count, color, on, onPress }: { label: string; count: number; color: string; on: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[s.chip, on && s.chipOn]} onPress={() => { tap(); onPress(); }} activeOpacity={0.7} accessibilityRole="button" accessibilityState={{ selected: on }}>
      <Text style={[s.chipText, on && { color: Colors.white }]}>{label}</Text>
      <Text style={[s.chipCount, { color: on ? Colors.white : color }]}>{count}</Text>
    </TouchableOpacity>
  );
}

function TripCard({ row, now, time, onOpen, onTrack }: {
  row: Row;
  now: number;
  time: (iso: string | null) => string | null;
  onOpen: () => void;
  onTrack: () => void;
}) {
  const { unit: u, trip: t, kind } = row;
  const st = statusOf(row, now);
  const driver = u.driver;
  const driverPhoto = driver?.avatar_url ? resolveMediaUrl(driver.avatar_url) : null;
  const plate = u.vehicle?.plate_number ?? t.ref_id ?? 'Trip';
  const route = routeLine(t.stops);
  const next = t.next_stop_index != null ? t.stops[t.next_stop_index] : null;
  // A next stop without a saved name still says which stop it is.
  const nextName = next ? niceName(next.name) || `Stop ${t.next_stop_index! + 1}` : null;
  const last = t.stops[t.stops.length - 1];
  const motion = motionOf(u, now);
  const feed = u.feed ? FEED[u.feed] : u.position ? (u.position.source === 'vehicle' ? FEED.vehicle : FEED.driver) : FEED.none;
  const feedLive = u.feed ? u.feed !== 'none' : !!u.position?.fresh;

  return (
    <TouchableOpacity style={s.card} onPress={() => { tap(); onOpen(); }} activeOpacity={0.85}
      accessibilityRole="button" accessibilityLabel={`${plate}, ${niceName(t.customer_name) || t.ref_id}, ${st.text}`}>
      <View style={s.map}>
        {u.position ? (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <FleetMap units={[u]} selected={u.key} isolate padding={{ top: 44, bottom: 24 }} />
          </View>
        ) : (
          <View style={[StyleSheet.absoluteFill, s.noMap]}>
            <MapPin size={22} color="#A1A1AA" strokeWidth={2} />
            <Text style={s.noMapText}>No location yet</Text>
          </View>
        )}
        <View style={s.pill} pointerEvents="none">
          <View style={[s.dot, { backgroundColor: st.dot }]} />
          <Text style={[s.pillText, { color: st.color }]} numberOfLines={1}>{st.text}</Text>
        </View>
        <View style={s.feed} pointerEvents="none">
          <View style={[s.dot, { backgroundColor: feedLive ? '#4ADE80' : '#A1A1AA' }]} />
          <Text style={s.feedText} numberOfLines={1}>{feed}</Text>
        </View>
        <View style={s.expand} pointerEvents="none"><Maximize2 size={14} color={INK} strokeWidth={2.2} /></View>
      </View>

      <View style={s.body}>
        <View style={s.top}>
          <Text style={s.plate} numberOfLines={1}>{plate}</Text>
          <Text style={s.customer} numberOfLines={1}>· {niceName(t.customer_name) || t.ref_id}</Text>
        </View>
        {route ? <Text style={s.route} numberOfLines={1}>{route}</Text> : null}
        <TripStepBar stops={t.stops} late={kind === 'late'} showRoute={false} caption={false} />
        <View style={s.next}>
          {nextName ? (
            <>
              <Text style={s.meta} numberOfLines={1}>Next <Text style={s.metaStrong}>{nextName}</Text></Text>
              {time(next!.planned_arrival) ? <Text style={s.meta}>{kind === 'late' ? 'Due' : 'ETA'} {time(next!.planned_arrival)}</Text> : null}
            </>
          ) : kind === 'confirm' ? (
            <>
              <Text style={s.meta} numberOfLines={1}>Arrived <Text style={s.metaStrong}>{niceName(last?.name) || 'last stop'}</Text></Text>
              {time(last?.actual_arrival ?? null) ? <Text style={s.meta}>{time(last!.actual_arrival)}</Text> : null}
            </>
          ) : null}
        </View>

        <View style={s.driver}>
          {driver ? (
            <>
              {driverPhoto ? <Image source={{ uri: driverPhoto }} style={s.avatar} /> : (
                <View style={[s.avatar, s.initials]}><Text style={s.initialsText}>{initialsOf(driver.name)}</Text></View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={s.driverName} numberOfLines={1}>{shortName(driver.name)}</Text>
                {motion ? <Text style={s.meta} numberOfLines={1}>{motion}</Text> : null}
              </View>
              {driver.phone ? (
                <TouchableOpacity style={s.call} onPress={() => { tap(); Linking.openURL(`tel:${driver.phone}`).catch(() => {}); }} hitSlop={6} accessibilityLabel={`Call ${driver.name}`}>
                  <Phone size={15} color="#16A34A" strokeWidth={2.4} />
                </TouchableOpacity>
              ) : null}
            </>
          ) : (
            <>
              <View style={[s.avatar, s.initials, { backgroundColor: '#F4F4F5' }]}><UserX size={14} color="#A1A1AA" /></View>
              <Text style={[s.driverName, { color: RED, flex: 1 }]}>No driver</Text>
            </>
          )}
        </View>

        {kind === 'confirm' ? (
          <TouchableOpacity style={[s.btn, s.btnAmber]} onPress={() => { tap(); onOpen(); }} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={`Confirm delivery for ${plate}`}>
            <Text style={[s.btnText, { color: AMBER }]}>Confirm delivery</Text>
          </TouchableOpacity>
        ) : (
          <View style={s.btns}>
            <TouchableOpacity style={[s.btn, s.btnDark]} onPress={() => { tap(); onOpen(); }} activeOpacity={0.8} accessibilityRole="button">
              <Text style={[s.btnText, { color: Colors.white }]}>Open trip</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={() => { tap(); onTrack(); }} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={`Track ${plate} on the map`}>
              <Navigation size={14} color={INK} strokeWidth={2.4} />
              <Text style={[s.btnText, { color: INK }]}>Track</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  h2: { fontSize: 17, fontWeight: '700', color: INK, letterSpacing: -0.2 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  linkText: { fontSize: 14, fontWeight: '500', color: MUTED },

  // Bleed to the screen edges so the strips scroll under the page padding.
  bleed: { marginHorizontal: -16, flexGrow: 0 },
  chips: { gap: 6, paddingHorizontal: 16 },
  chip: { flexDirection: 'row', alignItems: 'baseline', gap: 5, height: 34, paddingHorizontal: 13, paddingTop: 8, borderRadius: 17, backgroundColor: Colors.white, borderWidth: 1, borderColor: LINE },
  chipOn: { backgroundColor: INK, borderColor: INK },
  chipText: { fontSize: 13, fontWeight: '600', color: '#3F3F46' },
  chipCount: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },

  empty: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, backgroundColor: Colors.white, borderRadius: 20, borderWidth: 1, borderColor: LINE },
  emptyText: { fontSize: 14, color: MUTED },

  strip: { gap: 10, paddingHorizontal: 16 },
  card: { width: CARD_W, backgroundColor: Colors.white, borderRadius: 20, borderWidth: 1, borderColor: LINE, overflow: 'hidden' },
  map: { height: 164, backgroundColor: '#EFEFF1' },
  noMap: { alignItems: 'center', justifyContent: 'center', gap: 6 },
  noMapText: { fontSize: 12, fontWeight: '600', color: '#A1A1AA' },
  pill: {
    position: 'absolute', top: 10, left: 10, maxWidth: '55%', flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5,
    backgroundColor: 'rgba(255,255,255,0.96)', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  pillText: { fontSize: 12, fontWeight: '700' },
  feed: { position: 'absolute', top: 10, right: 10, maxWidth: '42%', flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: 'rgba(62,60,61,0.86)' },
  feedText: { fontSize: 11, fontWeight: '600', color: Colors.white },
  dot: { width: 7, height: 7, borderRadius: 4 },
  expand: {
    position: 'absolute', right: 10, bottom: 10, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },

  body: { padding: 12, gap: 6 },
  top: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  plate: { fontSize: 16, fontWeight: '800', color: INK },
  customer: { flex: 1, fontSize: 13, color: MUTED },
  route: { fontSize: 13, fontWeight: '600', color: INK, marginBottom: 2 },
  next: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, minHeight: 16 },
  meta: { fontSize: 12, color: MUTED, flexShrink: 1 },
  metaStrong: { color: INK, fontWeight: '600' },

  driver: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F1F3' },
  avatar: { width: 28, height: 28, borderRadius: 14 },
  initials: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF0EB' },
  initialsText: { fontSize: 11, fontWeight: '700', color: '#E8450F' },
  driverName: { fontSize: 13, fontWeight: '600', color: INK },
  call: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0FDF4' },

  btns: { flexDirection: 'row', gap: 8, marginTop: 4 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 36, borderRadius: 11, marginTop: 4 },
  btnDark: { flex: 1, backgroundColor: INK, marginTop: 0 },
  btnGhost: { paddingHorizontal: 14, backgroundColor: '#F4F4F5', marginTop: 0 },
  btnAmber: { backgroundColor: '#FFFAEB' },
  btnText: { fontSize: 13, fontWeight: '700' },
});

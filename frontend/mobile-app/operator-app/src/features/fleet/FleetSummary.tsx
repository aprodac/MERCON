/**
 * The Fleet map's bottom sheets when no truck is picked.
 *
 *   SummarySheet       the fleet at a glance: how many trucks are working, then
 *                      late · free soon · stopped long · not live (tap one to
 *                      filter the map). Swipe up for who is late, who frees up
 *                      next, who has stood still too long, and the customers on
 *                      the road — each with a one-tap link to their live page.
 *   NearSheet          a place search ("near Riyadh", an address, a dropped pin,
 *                      my location): trucks inside the radius, closest first,
 *                      with the road drive time for the closest three; radius
 *                      chips and Free only; when none are inside, the nearest
 *                      ones outside and a one-tap wider radius.
 *   CustomerPageSheet  one customer's all-trucks tracking page (the link the
 *                      customer screen shares): send on WhatsApp, copy, open.
 */
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Linking, PanResponder, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useQueries, useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { ChevronDown, ChevronUp, Copy, ExternalLink, MapPin, MessageCircle, Share2, X } from 'lucide-react-native';
import { AppModal } from '@mercon/mobile-shared/components/common/AppModal';
import { operatorService, type LiveUnit } from '../../lib/operator';
import { setStringAsync } from '../../lib/clipboard';
import { customerDetailApi } from '../customers/details/customerDetailApi';
import { shareTextToWhatsApp } from '../dashboard/components/ActiveTripsSection';
import { niceName } from '../trips/create/components/ui';
import type { makeTime } from '../trips/list/tripListModel';
import { SILENT_COLOR, TONE } from './FleetMap';
import { SheetFrame, UnitRow } from './FleetSheet';
import {
  formatDuration, freeAt, haversineKm, isDelayed, isFree, isFreeSoon, isLongStop, isSilent, lateMin, lateText, located, minText, nextStop, onTrip,
  stoppedMin, truckDriveSeconds, type FleetFilter,
} from './fleetModel';

type Time = ReturnType<typeof makeTime>;

const INK = '#3E3C3D';
const MUTED = '#6B6B76';
const SKY = '#0284C7';
const AMBER = '#D97706';

/** A place the map is searching around. */
export interface PlaceSearch {
  label: string;
  lat: number;
  lng: number;
  /** A city gets a wider default catchment than an address, a pin or where I am. */
  kind: 'city' | 'address' | 'pin' | 'me';
}

export const RADIUS_OPTIONS = [10, 25, 50, 100, 200];
export const defaultRadiusKm = (p: PlaceSearch) => (p.kind === 'city' ? 50 : 25);

const tap = () => Haptics.selectionAsync().catch(() => {});

/* ── Summary ─────────────────────────────────────────────────────────────── */

export function SummarySheet({ units, now, f, onFilter, onPick, onNotLive, onCustomerPage, onHeight }: {
  units: LiveUnit[];
  now: number;
  f: Time;
  onFilter: (f: FleetFilter) => void;
  onPick: (key: string) => void;
  onNotLive: () => void;
  onCustomerPage: (c: { id: string; name: string }) => void;
  onHeight: (h: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (v: boolean) => { if (v !== open) { tap(); setOpen(v); } };
  // Swipe up to open, down to close.
  const [pan] = useState(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 12 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderRelease: (_, g) => { if (g.dy < -30) setOpen(true); else if (g.dy > 30) setOpen(false); },
  }));

  const s = useMemo(() => {
    const trucks = units.filter((u) => u.vehicle);
    const working = trucks.filter(onTrip);
    const scheduled = trucks.filter((u) => u.trip?.phase === 'upcoming');
    const late = units.filter(isDelayed).map((u) => ({ u, min: lateMin(u, now) })).sort((a, b) => (b.min ?? 0) - (a.min ?? 0));
    const freeSoon = units.filter((u) => isFreeSoon(u, now)).map((u) => ({ u, at: freeAt(u)! })).sort((a, b) => a.at - b.at);
    const stopped = units.filter((u) => isLongStop(u, now)).map((u) => ({ u, min: stoppedMin(u, now) ?? 0 })).sort((a, b) => b.min - a.min);
    const quiet = units.filter((u) => isSilent(u, now)).length;
    const byCustomer = new Map<string, { id: string; name: string; trucks: number; late: number }>();
    for (const u of units) {
      const t = u.trip;
      if (!t?.customer_id || !onTrip(u)) continue;
      const c = byCustomer.get(t.customer_id) ?? { id: t.customer_id, name: t.customer_name ?? 'Customer', trucks: 0, late: 0 };
      c.trucks += 1;
      if (isDelayed(u)) c.late += 1;
      byCustomer.set(t.customer_id, c);
    }
    const customers = [...byCustomer.values()].sort((a, b) => b.trucks - a.trucks || a.name.localeCompare(b.name));
    return { trucks: trucks.length, working: working.length, scheduled: scheduled.length, free: trucks.length - working.length - scheduled.length, late, freeSoon, stopped, quiet, customers };
  }, [units, now]);
  const pct = s.trucks ? Math.round((s.working / s.trucks) * 100) : 0;

  return (
    <SheetFrame onHeight={onHeight} panHandlers={pan.panHandlers}>
      <TouchableOpacity activeOpacity={0.8} onPress={() => toggle(!open)} accessibilityLabel={open ? 'Show less' : 'Show the fleet summary'}>
        <View style={st.headRow}>
          <View style={{ flex: 1 }}>
            <Text style={st.title}>{s.working} of {s.trucks} trucks working</Text>
            <Text style={st.sub}>{pct}% on the road · {s.scheduled} scheduled · {Math.max(0, s.free)} free</Text>
          </View>
          {open ? <ChevronDown size={18} color={MUTED} /> : <ChevronUp size={18} color={MUTED} />}
        </View>
        {/* How the trucks split: working · scheduled · free */}
        <View style={st.bar}>
          {s.working ? <View style={{ flex: s.working, backgroundColor: TONE.active.color }} /> : null}
          {s.scheduled ? <View style={{ flex: s.scheduled, backgroundColor: TONE.upcoming.color }} /> : null}
          {s.free > 0 ? <View style={{ flex: s.free, backgroundColor: TONE.free.color }} /> : null}
        </View>
      </TouchableOpacity>

      <View style={st.tiles}>
        <Tile n={s.late.length} label="Late" color={TONE.delayed.color} onPress={() => onFilter('delayed')} />
        <Tile n={s.freeSoon.length} label="Free soon" color={SKY} onPress={() => onFilter('free_soon')} />
        <Tile n={s.stopped.length} label="Stopped" color={AMBER} onPress={() => onFilter('long_stop')} />
        <Tile n={s.quiet} label="Not live" color={SILENT_COLOR} onPress={onNotLive} />
      </View>

      {open ? (
        <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
          <Section title="Late now" empty="Nobody is running late.">
            {s.late.slice(0, 5).map(({ u, min }) => (
              <MiniRow key={u.key} u={u} detail={whereTo(u)} badge={min != null ? lateText(min) : 'Delayed'} color={TONE.delayed.color} onPress={() => onPick(u.key)} />
            ))}
          </Section>
          <Section title="Free in the next hour" empty="No trip ends in the next hour.">
            {s.freeSoon.slice(0, 5).map(({ u, at }) => (
              <MiniRow key={u.key} u={u} detail={whereTo(u)} badge={`free ~${f.time(new Date(at).toISOString())}`} color={SKY} onPress={() => onPick(u.key)} />
            ))}
          </Section>
          <Section title="Stopped 30 min+ away from its stops" empty="No unplanned stops.">
            {s.stopped.slice(0, 5).map(({ u, min }) => (
              <MiniRow key={u.key} u={u} detail={whereTo(u)} badge={minText(min)} color={AMBER} onPress={() => onPick(u.key)} />
            ))}
          </Section>
          <Section title="Customers on the road" empty="No customer trucks on the road.">
            {s.customers.map((c) => (
              <View key={c.id} style={st.mini}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.miniTitle} numberOfLines={1}>{niceName(c.name)}</Text>
                  <Text style={st.miniSub}>
                    {c.trucks} truck{c.trucks === 1 ? '' : 's'} on the road
                    {c.late ? <Text style={{ color: TONE.delayed.color, fontWeight: '700' }}>{`  ·  ${c.late} late`}</Text> : null}
                  </Text>
                </View>
                <TouchableOpacity style={st.linkBtn} onPress={() => { tap(); onCustomerPage({ id: c.id, name: c.name }); }} accessibilityLabel={`Share ${c.name}'s live page`}>
                  <Share2 size={14} color={INK} />
                  <Text style={st.linkBtnText}>Live page</Text>
                </TouchableOpacity>
              </View>
            ))}
          </Section>
        </ScrollView>
      ) : null}
    </SheetFrame>
  );
}

const whereTo = (u: LiveUnit) => {
  const next = nextStop(u);
  return [niceName(u.trip?.customer_name), next?.name ? `→ ${niceName(next.name)}` : null].filter(Boolean).join(' ');
};

function Tile({ n, label, color, onPress }: { n: number; label: string; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={[st.tile, !n && { opacity: 0.55 }]} onPress={() => { tap(); onPress(); }} disabled={!n} activeOpacity={0.7} accessibilityLabel={`${n} ${label}`}>
      <Text style={[st.tileN, n ? { color } : null]}>{n}</Text>
      <Text style={st.tileLabel} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={st.section}>{title}</Text>
      {children.length ? children : <Text style={st.emptyLine}>{empty}</Text>}
    </View>
  );
}

function MiniRow({ u, detail, badge, color, onPress }: { u: LiveUnit; detail: string; badge: string; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={st.mini} onPress={onPress} activeOpacity={0.6}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={st.miniTitle} numberOfLines={1}>{u.vehicle?.plate_number ?? niceName(u.driver?.name) ?? 'Truck'}</Text>
        {detail ? <Text style={st.miniSub} numberOfLines={1}>{detail}</Text> : null}
      </View>
      <Text style={[st.badge, { backgroundColor: color }]}>{badge}</Text>
    </TouchableOpacity>
  );
}

/* ── Near a place ────────────────────────────────────────────────────────── */

export function NearSheet({ place, radius, onRadius, freeOnly, onFreeOnly, units, now, onPick, onClose, onHeight }: {
  place: PlaceSearch;
  radius: number;
  onRadius: (km: number) => void;
  freeOnly: boolean;
  onFreeOnly: (v: boolean) => void;
  /** The trucks the filter chips allow; this sheet measures them from the place. */
  units: LiveUnit[];
  now: number;
  onPick: (key: string) => void;
  onClose: () => void;
  onHeight: (h: number) => void;
}) {
  const ranked = useMemo(
    () => units
      .filter(located)
      .filter((u) => !freeOnly || isFree(u))
      .map((u) => ({ u, km: haversineKm(u.position!, place) }))
      .sort((a, b) => a.km - b.km),
    [units, place, freeOnly],
  );
  const inside = ranked.filter((x) => x.km <= radius);
  const outside = inside.length ? [] : ranked.slice(0, 3);
  const freeInside = inside.filter((x) => isFree(x.u)).length;
  const wider = RADIUS_OPTIONS.find((r) => r > radius) ?? null;

  // Road drive time for the closest three — straight-line km undersells a mountain road.
  const closest = (inside.length ? inside : outside).slice(0, 3);
  const drives = useQueries({
    queries: closest.map(({ u }) => ({
      queryKey: ['fleet', 'near-drive', u.key, +u.position!.lat.toFixed(3), +u.position!.lng.toFixed(3), place.lat, place.lng],
      queryFn: () => operatorService.liveRoute([{ lat: u.position!.lat, lng: u.position!.lng }, { lat: place.lat, lng: place.lng }]),
      staleTime: 5 * 60_000,
    })),
  });
  const driveOf = (key: string) => {
    const i = closest.findIndex((x) => x.u.key === key);
    const r = i >= 0 ? drives[i]?.data : null;
    // The router times a car; a loaded truck averages at most ~80 km/h.
    return r ? `${formatDuration(truckDriveSeconds(r.distanceMeters, r.durationSeconds))} drive` : null;
  };

  return (
    <SheetFrame onHeight={onHeight}>
      <View style={st.headRow}>
        <View style={st.placeIcon}><MapPin size={16} color="#FFFFFF" /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={st.title} numberOfLines={1}>{place.kind === 'me' ? 'Near you' : place.label}</Text>
          <Text style={st.sub}>
            {inside.length
              ? `${inside.length} ${freeOnly ? 'free ' : ''}truck${inside.length === 1 ? '' : 's'} within ${radius} km${!freeOnly && freeInside ? ` · ${freeInside} free` : ''}`
              : `No ${freeOnly ? 'free ' : ''}trucks within ${radius} km`}
          </Text>
        </View>
        <TouchableOpacity onPress={onClose} hitSlop={8} style={st.close} accessibilityLabel="Clear the place search"><X size={16} color={MUTED} /></TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {RADIUS_OPTIONS.map((r) => (
          <TouchableOpacity key={r} style={[st.chip, r === radius && st.chipOn]} onPress={() => { tap(); onRadius(r); }} activeOpacity={0.8}>
            <Text style={[st.chipText, r === radius && { color: '#FFFFFF' }]}>{r} km</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={[st.chip, freeOnly && st.chipFree]} onPress={() => { tap(); onFreeOnly(!freeOnly); }} activeOpacity={0.8}>
          <View style={[st.dot, { backgroundColor: freeOnly ? '#FFFFFF' : TONE.free.color }]} />
          <Text style={[st.chipText, freeOnly && { color: '#FFFFFF' }]}>Free only</Text>
        </TouchableOpacity>
      </ScrollView>

      <ScrollView style={{ maxHeight: 300 }}>
        {inside.map(({ u, km }, i) => (
          <View key={u.key}>
            {i > 0 ? <View style={st.rule} /> : null}
            <UnitRow unit={u} now={now} km={km} note={driveOf(u.key) ? { text: driveOf(u.key)!, color: SKY } : null} onPress={() => onPick(u.key)} />
          </View>
        ))}
        {!inside.length && outside.length ? (
          <>
            <Text style={st.section}>Nearest outside {radius} km</Text>
            {outside.map(({ u, km }, i) => (
              <View key={u.key}>
                {i > 0 ? <View style={st.rule} /> : null}
                <UnitRow unit={u} now={now} km={km} note={driveOf(u.key) ? { text: driveOf(u.key)!, color: SKY } : null} onPress={() => onPick(u.key)} />
              </View>
            ))}
          </>
        ) : null}
        {!inside.length && wider ? (
          <TouchableOpacity style={st.widen} onPress={() => { tap(); onRadius(wider); }} activeOpacity={0.85}>
            <Text style={st.widenText}>Search {wider} km around</Text>
          </TouchableOpacity>
        ) : null}
        {!ranked.length ? <Text style={st.emptyLine}>No trucks with a location match the filter.</Text> : null}
      </ScrollView>
    </SheetFrame>
  );
}

/* ── A customer's all-trucks page ─────────────────────────────────────────── */

export function CustomerPageSheet({ customer, onClose, onToast }: {
  customer: { id: string; name: string } | null;
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const linkQ = useQuery({
    queryKey: ['customers', 'detail', customer?.id, 'tracking-link'],
    queryFn: () => customerDetailApi.trackingLink(customer!.id),
    enabled: !!customer,
  });
  const link = linkQ.data;
  const name = niceName(customer?.name) || 'Customer';
  const send = (url: string) => shareTextToWhatsApp(`*${name} · live trucks*\nAll your trucks on the road, live: ${url}`, `${name} · live trucks`);
  const copy = async (url: string) => onToast((await setStringAsync(url)) ? 'Link copied' : 'Couldn’t copy the link');

  return (
    <AppModal visible={!!customer} onClose={onClose} type="bottom-sheet" title={`${name} · live page`}>
      <View style={{ gap: 12, paddingBottom: 8 }}>
        <Text style={st.sub}>One link that shows the customer every truck of theirs on the road, live, plus recent deliveries.</Text>
        {linkQ.isLoading ? (
          <ActivityIndicator color={INK} style={{ paddingVertical: 16 }} />
        ) : linkQ.isError ? (
          <Text style={st.emptyLine}>Couldn’t get the link. Check the connection and try again.</Text>
        ) : !link?.enabled || !link.url ? (
          <Text style={st.emptyLine}>Live tracking is switched off for this customer. Turn it on from the web to share the page.</Text>
        ) : (
          <>
            <View style={st.urlBox}>
              <Text style={st.url} numberOfLines={1}>{link.url}</Text>
              <Text style={st.miniSub}>{link.open_count > 0 ? `Opened ${link.open_count}×` : 'Not opened yet'}</Text>
            </View>
            <TouchableOpacity style={st.wa} onPress={() => { tap(); send(link.url!); }} activeOpacity={0.85}>
              <MessageCircle size={18} color="#FFFFFF" />
              <Text style={st.waText}>Send on WhatsApp</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={st.secondary} onPress={() => copy(link.url!)} activeOpacity={0.8}>
                <Copy size={16} color={INK} /><Text style={st.secondaryText}>Copy link</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.secondary} onPress={() => Linking.openURL(link.url!).catch(() => {})} activeOpacity={0.8}>
                <ExternalLink size={16} color={INK} /><Text style={st.secondaryText}>Open</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </AppModal>
  );
}

const st = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 16, fontWeight: '800', color: INK },
  sub: { fontSize: 12, color: MUTED, marginTop: 1 },
  bar: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: '#EEF0F3', marginTop: 8 },
  tiles: { flexDirection: 'row', gap: 6 },
  tile: { flex: 1, borderRadius: 12, backgroundColor: '#F6F6F7', paddingVertical: 8, alignItems: 'center' },
  tileN: { fontSize: 18, fontWeight: '800', color: '#A1A1AA', fontVariant: ['tabular-nums'] },
  tileLabel: { fontSize: 11, fontWeight: '600', color: MUTED },
  section: { fontSize: 11, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5, paddingTop: 4, paddingBottom: 2 },
  emptyLine: { fontSize: 13, color: MUTED, paddingVertical: 8 },
  mini: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  miniTitle: { fontSize: 14, fontWeight: '700', color: INK, fontFamily: 'monospace' },
  miniSub: { fontSize: 12, color: MUTED },
  badge: { fontSize: 12, fontWeight: '800', color: '#FFFFFF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, paddingHorizontal: 10, borderRadius: 15, backgroundColor: '#F1F1F3' },
  linkBtnText: { fontSize: 12, fontWeight: '700', color: INK },
  placeIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: SKY, alignItems: 'center', justifyContent: 'center' },
  close: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F1F1F3', alignItems: 'center', justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: '#F1F1F3' },
  chipOn: { backgroundColor: SKY },
  chipFree: { backgroundColor: TONE.free.color },
  chipText: { fontSize: 12, fontWeight: '700', color: INK },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rule: { height: 1, backgroundColor: '#F1F1F3' },
  widen: { marginTop: 8, height: 44, borderRadius: 12, backgroundColor: SKY, alignItems: 'center', justifyContent: 'center' },
  widenText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  urlBox: { borderRadius: 12, backgroundColor: '#F6F6F7', padding: 12, gap: 2 },
  url: { fontSize: 13, fontWeight: '600', color: INK },
  wa: { height: 50, borderRadius: 14, backgroundColor: '#25D366', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  waText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  secondary: { flex: 1, height: 44, borderRadius: 12, backgroundColor: '#F1F1F3', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  secondaryText: { fontSize: 14, fontWeight: '700', color: INK },
});

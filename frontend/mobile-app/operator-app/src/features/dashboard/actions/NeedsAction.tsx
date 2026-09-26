/**
 * Operator home: three numbers, then everything that needs someone to act —
 * compact rows grouped Act now / Today / Keep an eye on, each with its one
 * action as a pill; long runs of the same kind fold into "+N more" — then
 * today's trips.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ActivityIndicator } from 'react-native';
import {
  AlarmClock, ChevronDown, ChevronRight, CircleCheckBig, Clock3, FileClock, Images, Phone, Play, Receipt, SignalLow, Siren, Split, Truck, UserX,
  type LucideIcon,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { resolveMediaUrl } from '@mercon/mobile-shared/lib/media';
import type { LiveUnit } from '../../../lib/operator';
import { whenLabel, type ActionIntent, type ActionItem, type ActionKind, type Urgency } from './actionModel';

const INK = '#18181B';
const MUTED = '#71717A';
const LINE = '#E4E4E7';

const KIND: Record<ActionKind, { icon: LucideIcon; bg: string; fg: string; noun: string }> = {
  emergency: { icon: Siren, bg: '#FDE3E0', fg: '#B42318', noun: 'emergencies' },
  delayed: { icon: Clock3, bg: '#FDEDEB', fg: '#912018', noun: 'delayed trips' },
  'late-start': { icon: AlarmClock, bg: '#FFF1E0', fg: '#8A4B00', noun: 'trips not started' },
  unassigned: { icon: UserX, bg: '#FDEDEB', fg: '#912018', noun: 'trips without driver or truck' },
  'gps-quiet': { icon: SignalLow, bg: '#FFF4D6', fg: '#7A4F00', noun: 'silent trucks' },
  'gps-mismatch': { icon: Split, bg: '#FFF4D6', fg: '#7A4F00', noun: 'GPS mismatches' },
  photos: { icon: Images, bg: '#E3F7EA', fg: '#0F6B37', noun: 'photo updates' },
  'time-check': { icon: Clock3, bg: '#FFF4D6', fg: '#7A4F00', noun: 'screenshot checks' },
  expiry: { icon: FileClock, bg: '#F0EBFC', fg: '#4A2A93', noun: 'documents' },
  'overdue-invoice': { icon: Receipt, bg: '#EEF0F4', fg: '#3E3C3D', noun: 'invoices' },
};


/** Rows of one kind shown before folding the rest into "+N more". */
const PER_KIND = 2;

const tap = () => Haptics.selectionAsync().catch(() => {});

// ── Summary ───────────────────────────────────────────────────────────────────

export function ActionSummary({ running, delayed, today, onRunning, onDelayed, onToday }: {
  running: number; delayed: number; today: number; onRunning: () => void; onDelayed: () => void; onToday: () => void;
}) {
  const cells = [
    { key: 'run', label: 'On the road', value: running, color: '#2449A8', onPress: onRunning },
    { key: 'late', label: 'Delayed', value: delayed, color: delayed ? '#B42318' : INK, onPress: onDelayed },
    { key: 'today', label: 'Trips today', value: today, color: INK, onPress: onToday },
  ];
  return (
    <View style={s.summary}>
      {cells.map((c, i) => (
        <TouchableOpacity key={c.key} style={[s.cell, i > 0 && s.cellBorder]} onPress={() => { tap(); c.onPress(); }} activeOpacity={0.7}>
          <Text style={[s.cellValue, { color: c.color }]}>{c.value}</Text>
          <Text style={s.cellLabel} numberOfLines={1}>{c.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── The list ──────────────────────────────────────────────────────────────────

const TABS: { id: Urgency; label: string }[] = [
  { id: 'now', label: 'Act now' },
  { id: 'today', label: 'Today' },
  { id: 'watch', label: 'Later' },
];

const EMPTY: Record<Urgency, string> = {
  now: 'Nothing urgent right now.',
  today: 'Nothing else to do today.',
  watch: 'Nothing to keep an eye on.',
};

export function NeedsActionList({ items, loading, onIntent, onOpenTrip, now }: {
  items: ActionItem[];
  loading: boolean;
  onIntent: (intent: ActionIntent) => void;
  onOpenTrip: (tripId: string) => void;
  now: number;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Urgency | null>(null);
  const counts = useMemo(() => {
    const c: Record<Urgency, number> = { now: 0, today: 0, watch: 0 };
    for (const i of items) c[i.urgency] += 1;
    return c;
  }, [items]);
  // Until the operator picks a tab, show the most urgent one that has something in it.
  const tab: Urgency = picked ?? (counts.now ? 'now' : counts.today ? 'today' : counts.watch ? 'watch' : 'now');

  // Each kind shows a couple of rows and folds the rest into "+N more".
  const rows = useMemo(() => {
    const list = items.filter((i) => i.urgency === tab);
    const out: ({ type: 'item'; item: ActionItem } | { type: 'more'; kind: ActionKind; key: string; hidden: number })[] = [];
    for (const k of [...new Set(list.map((i) => i.kind))]) {
      const ofKind = list.filter((i) => i.kind === k);
      const key = `${tab}:${k}`;
      const expanded = open.has(key);
      (expanded ? ofKind : ofKind.slice(0, PER_KIND)).forEach((item) => out.push({ type: 'item', item }));
      if (ofKind.length > PER_KIND) out.push({ type: 'more', kind: k, key, hidden: expanded ? 0 : ofKind.length - PER_KIND });
    }
    return out;
  }, [items, tab, open]);

  const toggle = (key: string) => {
    tap();
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  return (
    <View style={{ gap: 10 }}>
      <View style={s.headRow}>
        <Text style={s.h2}>Needs action</Text>
        {loading ? <ActivityIndicator size="small" color={Colors.primary} /> : null}
      </View>

      {/* One switch instead of filter chips: Act now · Today · Later */}
      <View style={s.segment} accessibilityRole="tablist">
        {TABS.map((t) => {
          const on = t.id === tab;
          return (
            <TouchableOpacity
              key={t.id}
              style={[s.segItem, on && s.segOn]}
              onPress={() => { if (!on) tap(); setPicked(t.id); }}
              activeOpacity={0.8}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
            >
              {t.id === 'now' && counts.now ? <View style={s.segDot} /> : null}
              <Text style={[s.segText, on && s.segTextOn]} numberOfLines={1}>{t.label}</Text>
              <Text style={[s.segCount, on && s.segCountOn]}>{counts[t.id]}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {!loading && rows.length === 0 ? (
        <View style={s.clear}>
          <CircleCheckBig size={22} color="#16A34A" />
          <Text style={s.clearText}>{EMPTY[tab]}</Text>
        </View>
      ) : null}

      {rows.length ? (
        <View style={s.card}>
          {rows.map((row, i) =>
            row.type === 'item' ? (
              <ActionRow key={row.item.key} item={row.item} first={i === 0} now={now} onIntent={onIntent} onOpenTrip={onOpenTrip} />
            ) : (
              <TouchableOpacity key={`more-${row.key}`} style={[s.moreRow, i > 0 && s.rowBorder]} onPress={() => toggle(row.key)} activeOpacity={0.7}>
                <Text style={s.moreText}>{row.hidden ? `+${row.hidden} more ${KIND[row.kind].noun}` : `Show fewer ${KIND[row.kind].noun}`}</Text>
                <ChevronDown size={16} color={MUTED} style={row.hidden ? undefined : { transform: [{ rotate: '180deg' }] }} />
              </TouchableOpacity>
            ),
          )}
        </View>
      ) : null}
    </View>
  );
}

function ActionRow({ item, first, now, onIntent, onOpenTrip }: { item: ActionItem; first: boolean; now: number; onIntent: (i: ActionIntent) => void; onOpenTrip: (id: string) => void }) {
  const k = KIND[item.kind];
  const Icon = k.icon;
  const when = whenLabel(item, now);
  const call = item.secondary?.intent.type === 'call' ? item.secondary : null;
  const other = item.secondary && !call ? item.secondary : null;
  const openRow = () => {
    if (item.tripId) onOpenTrip(item.tripId);
    else onIntent(item.primary.intent);
  };
  return (
    <TouchableOpacity style={[s.row, !first && s.rowBorder]} onPress={openRow} activeOpacity={0.7}>
      <View style={[s.icon, { backgroundColor: k.bg }]}>
        <Icon size={17} color={k.fg} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={s.titleRow}>
          <Text style={s.title} numberOfLines={1}>{item.title}</Text>
          {when ? <Text style={[s.when, when.hot && s.whenHot]} numberOfLines={1}>{when.text}</Text> : null}
        </View>
        {item.detail ? <Text style={s.detail} numberOfLines={1}>{item.detail}</Text> : null}
        {item.media?.length ? (
          <View style={s.thumbs}>
            {item.media.map((m) => {
              const uri = resolveMediaUrl(m.url);
              return (
                <View key={m.id} style={s.thumb}>
                  {m.kind === 'video' || !uri ? (
                    <View style={[s.thumbFill, { backgroundColor: INK, alignItems: 'center', justifyContent: 'center' }]}><Play size={10} color={Colors.white} fill={Colors.white} /></View>
                  ) : <Image source={{ uri }} style={s.thumbFill} />}
                </View>
              );
            })}
          </View>
        ) : null}
      </View>
      <View style={s.actions}>
        {call ? (
          <TouchableOpacity style={s.callBtn} onPress={() => { tap(); onIntent(call.intent); }} hitSlop={6} accessibilityLabel="Call driver">
            <Phone size={14} color="#16A34A" strokeWidth={2.2} />
          </TouchableOpacity>
        ) : null}
        {other ? (
          <TouchableOpacity style={s.ghost} onPress={() => { tap(); onIntent(other.intent); }} hitSlop={4}>
            <Text style={s.ghostText}>{other.label}</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={[s.pill, item.kind === 'photos' && s.pillGo]} onPress={() => { tap(); onIntent(item.primary.intent); }} hitSlop={4}>
          <Text style={[s.pillText, item.kind === 'photos' && { color: Colors.white }]}>{item.primary.label}</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

// ── Today's trips ─────────────────────────────────────────────────────────────

export function TodayTrips({ rows, tz, onOpenTrip, onAll }: {
  rows: { trip: NonNullable<LiveUnit['trip']>; unit: LiveUnit }[];
  tz: string;
  onOpenTrip: (id: string) => void;
  onAll: () => void;
}) {
  const time = (iso: string | null) => {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
    } catch {
      return '—';
    }
  };
  return (
    <View style={{ gap: 10 }}>
      <View style={s.headRow}>
        <Text style={s.h2}>Today’s trips</Text>
        <TouchableOpacity onPress={onAll} hitSlop={8} style={s.link}>
          <Text style={s.linkText}>All trips</Text>
          <ChevronRight size={15} color={MUTED} />
        </TouchableOpacity>
      </View>
      {rows.length === 0 ? (
        <View style={[s.card, s.emptyToday]}><Truck size={18} color={MUTED} /><Text style={s.detail}>Nothing running or starting today.</Text></View>
      ) : (
        <View style={s.card}>
          {rows.slice(0, 8).map(({ trip: t, unit }, i) => {
            const done = t.stops.filter((st) => st.actual_arrival).length;
            const next = t.next_stop_index != null ? t.stops[t.next_stop_index] : null;
            const state = t.phase === 'delayed' ? { label: 'Delayed', bg: '#FDEDEB', fg: '#912018', bar: '#D92D20' }
              : t.phase === 'active' ? { label: 'On the road', bg: '#E7EEFC', fg: '#2449A8', bar: '#2F5FD0' }
              : { label: 'Scheduled', bg: '#F0EBFC', fg: '#4A2A93', bar: '#7651D6' };
            const pct = t.stops.length ? done / t.stops.length : 0;
            return (
              <TouchableOpacity key={t.id} style={[s.todayRow, i > 0 && s.rowBorder]} onPress={() => onOpenTrip(t.id)} activeOpacity={0.7}>
                <View style={s.todayTimeBox}>
                  <Text style={s.todayTime}>{time(t.planned_start)}</Text>
                  <View style={[s.todayBar, { backgroundColor: LINE }]}>
                    <View style={{ width: `${Math.round(pct * 100)}%`, height: '100%', backgroundColor: state.bar, borderRadius: 2 }} />
                  </View>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.todayRef} numberOfLines={1}>{t.customer_name ?? '—'}</Text>
                  <Text style={s.detail} numberOfLines={1}>
                    {[t.ref_id, unit.vehicle?.plate_number, t.phase !== 'upcoming' && next?.name ? `→ ${next.name}` : null].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <View style={[s.state, { backgroundColor: state.bg }]}><Text style={[s.stateText, { color: state.fg }]}>{state.label}</Text></View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  summary: { flexDirection: 'row', backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1, borderColor: LINE, paddingVertical: 9 },
  cell: { flex: 1, paddingHorizontal: 12 },
  cellBorder: { borderLeftWidth: 1, borderLeftColor: '#F4F4F5' },
  cellValue: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3, fontVariant: ['tabular-nums'] },
  cellLabel: { fontSize: 11, fontWeight: '500', color: MUTED },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h2: { fontSize: 16, fontWeight: '700', color: INK },
  groupCount: { fontSize: 12, fontWeight: '700', color: '#9898A4' },
  card: { backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1, borderColor: LINE, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  rowBorder: { borderTopWidth: 1, borderTopColor: '#F4F4F5' },
  icon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flexShrink: 1, fontSize: 14, fontWeight: '600', color: INK },
  when: { fontSize: 11, fontWeight: '500', color: '#A1A1AA' },
  whenHot: { color: '#B42318', fontWeight: '600' },
  detail: { fontSize: 12, color: MUTED },
  thumbs: { flexDirection: 'row', gap: 4, marginTop: 4 },
  thumb: { width: 30, height: 30, borderRadius: 7, overflow: 'hidden', backgroundColor: '#E4E7EE' },
  thumbFill: { width: '100%', height: '100%' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pill: { height: 30, borderRadius: 8, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: LINE, backgroundColor: Colors.white },
  pillGo: { backgroundColor: '#16A34A', borderColor: '#16A34A' },
  pillText: { fontSize: 12, fontWeight: '600', color: INK },
  ghost: { height: 30, borderRadius: 8, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  ghostText: { fontSize: 12, fontWeight: '500', color: MUTED },
  callBtn: { width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: LINE, alignItems: 'center', justifyContent: 'center' },
  moreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11 },
  moreText: { fontSize: 12, fontWeight: '500', color: MUTED },
  segment: { flexDirection: 'row', gap: 4, backgroundColor: '#F4F4F5', borderRadius: 10, padding: 3 },
  segItem: { flex: 1, height: 34, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  segOn: { backgroundColor: Colors.white, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#F04438' },
  segText: { fontSize: 13, fontWeight: '500', color: MUTED },
  segTextOn: { color: INK, fontWeight: '600' },
  segCount: { fontSize: 12, fontWeight: '500', color: '#A1A1AA', fontVariant: ['tabular-nums'] },
  segCountOn: { color: MUTED },
  clear: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F0FDF4', borderRadius: 12, borderWidth: 1, borderColor: '#BBF7D0', padding: 14 },
  clearText: { flex: 1, fontSize: 13, fontWeight: '500', color: '#15803D' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  linkText: { fontSize: 13, fontWeight: '500', color: MUTED },
  emptyToday: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14 },
  todayRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 11 },
  todayTimeBox: { width: 46, gap: 5 },
  todayTime: { fontSize: 14, fontWeight: '600', color: INK, fontVariant: ['tabular-nums'] },
  todayBar: { height: 4, borderRadius: 2, overflow: 'hidden' },
  todayRef: { fontSize: 14, fontWeight: '600', color: INK },
  state: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  stateText: { fontSize: 11, fontWeight: '600' },
});

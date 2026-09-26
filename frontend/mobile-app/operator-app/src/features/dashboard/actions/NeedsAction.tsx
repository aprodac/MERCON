/**
 * Operator home: the three numbers that matter, then everything that needs
 * someone to act — grouped Act now / Today / Keep an eye on, filterable,
 * each card with its action right on it — then today's trips.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ActivityIndicator } from 'react-native';
import {
  AlarmClock, ChevronRight, CircleCheckBig, Clock3, FileClock, Images, Play, Receipt, SignalLow, Siren, Split, Truck, UserX,
  type LucideIcon,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { resolveMediaUrl } from '@mercon/mobile-shared/lib/media';
import type { LiveUnit } from '../../../lib/operator';
import { durationText, type ActionGroup, type ActionIntent, type ActionItem, type ActionKind, type Urgency } from './actionModel';

const INK = '#2B2A2B';
const MUTED = '#5F5F6E';

const KIND: Record<ActionKind, { icon: LucideIcon; bg: string; fg: string; button: string }> = {
  emergency: { icon: Siren, bg: '#FDE3E0', fg: '#B42318', button: '#C4302B' },
  delayed: { icon: Clock3, bg: '#FDEDEB', fg: '#912018', button: '#C4432F' },
  'late-start': { icon: AlarmClock, bg: '#FFF1E0', fg: '#8A4B00', button: '#B35C00' },
  unassigned: { icon: UserX, bg: '#FDEDEB', fg: '#912018', button: '#C4432F' },
  'gps-quiet': { icon: SignalLow, bg: '#FFF4D6', fg: '#7A4F00', button: '#946200' },
  'gps-mismatch': { icon: Split, bg: '#FFF4D6', fg: '#7A4F00', button: '#946200' },
  photos: { icon: Images, bg: '#E3F7EA', fg: '#0F6B37', button: '#1A9E55' },
  'time-check': { icon: Clock3, bg: '#FFF4D6', fg: '#7A4F00', button: '#946200' },
  expiry: { icon: FileClock, bg: '#F0EBFC', fg: '#4A2A93', button: '#6A45C8' },
  'overdue-invoice': { icon: Receipt, bg: '#EEF0F4', fg: '#3E3C3D', button: '#3E3C3D' },
};

const URGENCY_LABEL: Record<Urgency, string> = { now: 'Act now', today: 'Today', watch: 'Keep an eye on' };
const URGENCY_DOT: Record<Urgency, string> = { now: '#D92D20', today: '#E08A00', watch: '#9898A4' };

const FILTERS: { id: 'all' | ActionGroup; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'trips', label: 'Trips' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'documents', label: 'Documents' },
  { id: 'money', label: 'Money' },
];

const COLLAPSED = 6;

function ago(iso: string | null): string | null {
  if (!iso) return null;
  const min = (Date.now() - new Date(iso).getTime()) / 60000;
  if (!Number.isFinite(min)) return null;
  if (min < 0) return `in ${durationText(-min)}`;
  if (min < 1) return 'just now';
  return `${durationText(min)} ago`;
}

const tap = () => Haptics.selectionAsync().catch(() => {});

// ── Summary ───────────────────────────────────────────────────────────────────

export function ActionSummary({ running, delayed, action, onRunning, onDelayed, onAction }: {
  running: number; delayed: number; action: number; onRunning: () => void; onDelayed: () => void; onAction: () => void;
}) {
  const tiles = [
    { key: 'running', label: 'Running now', value: running, onPress: onRunning, bg: '#2B2A2B', fg: Colors.white, sub: '#C9C9D2' },
    { key: 'delayed', label: 'Delayed', value: delayed, onPress: onDelayed, bg: delayed ? '#FDEDEB' : Colors.white, fg: delayed ? '#912018' : INK, sub: delayed ? '#912018' : MUTED },
    { key: 'action', label: 'Need action', value: action, onPress: onAction, bg: action ? '#FFF1E0' : Colors.white, fg: action ? '#8A4B00' : INK, sub: action ? '#8A4B00' : MUTED },
  ];
  return (
    <View style={s.summary}>
      {tiles.map((t) => (
        <TouchableOpacity key={t.key} style={[s.tile, { backgroundColor: t.bg }]} onPress={() => { tap(); t.onPress(); }} activeOpacity={0.8}>
          <Text style={[s.tileValue, { color: t.fg }]}>{t.value}</Text>
          <Text style={[s.tileLabel, { color: t.sub }]} numberOfLines={1}>{t.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── The list ──────────────────────────────────────────────────────────────────

export function NeedsActionList({ items, loading, onIntent, onOpenTrip, filter, onFilter }: {
  items: ActionItem[];
  loading: boolean;
  onIntent: (intent: ActionIntent) => void;
  onOpenTrip: (tripId: string) => void;
  filter: 'all' | ActionGroup;
  onFilter: (f: 'all' | ActionGroup) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const i of items) c[i.group] = (c[i.group] ?? 0) + 1;
    return c;
  }, [items]);
  const shown = filter === 'all' ? items : items.filter((i) => i.group === filter);
  const visible = expanded ? shown : shown.slice(0, COLLAPSED);


  return (
    <View style={{ gap: 10 }}>
      <View style={s.headRow}>
        <Text style={s.h2}>Needs action</Text>
        {loading ? <ActivityIndicator size="small" color={Colors.primary} /> : null}
      </View>

      <View style={s.chips}>
        {FILTERS.filter((f) => f.id === 'all' || counts[f.id]).map((f) => {
          const on = filter === f.id;
          return (
            <TouchableOpacity key={f.id} style={[s.chip, on && s.chipOn]} onPress={() => { tap(); onFilter(f.id); setExpanded(false); }} activeOpacity={0.8}>
              <Text style={[s.chipText, on && s.chipTextOn]}>{f.label}</Text>
              {counts[f.id] ? <Text style={[s.chipCount, on && s.chipCountOn]}>{counts[f.id]}</Text> : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {!loading && shown.length === 0 ? (
        <View style={s.clear}>
          <View style={s.clearIcon}><CircleCheckBig size={26} color="#1F9D55" /></View>
          <Text style={s.clearTitle}>All clear</Text>
          <Text style={s.clearText}>No delays, silent trucks, unsent photos or expiring documents right now.</Text>
        </View>
      ) : null}

      {visible.map((item, i) => {
        // A section header where the urgency changes.
        const header = i === 0 || visible[i - 1].urgency !== item.urgency ? item.urgency : null;
        return (
          <React.Fragment key={item.key}>
            {header ? (
              <View style={s.groupHead}>
                <View style={[s.groupDot, { backgroundColor: URGENCY_DOT[header] }]} />
                <Text style={s.groupText}>{URGENCY_LABEL[header]}</Text>
              </View>
            ) : null}
            <ActionCard item={item} onIntent={onIntent} onOpenTrip={onOpenTrip} />
          </React.Fragment>
        );
      })}

      {shown.length > COLLAPSED ? (
        <TouchableOpacity style={s.more} onPress={() => { tap(); setExpanded((e) => !e); }}>
          <Text style={s.moreText}>{expanded ? 'Show less' : `Show all ${shown.length}`}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function ActionCard({ item, onIntent, onOpenTrip }: { item: ActionItem; onIntent: (i: ActionIntent) => void; onOpenTrip: (id: string) => void }) {
  const k = KIND[item.kind];
  const Icon = k.icon;
  const when = ago(item.at);
  return (
    <TouchableOpacity
      activeOpacity={item.tripId ? 0.85 : 1}
      disabled={!item.tripId}
      onPress={() => item.tripId && onOpenTrip(item.tripId)}
      style={[s.card, item.urgency === 'now' && s.cardNow]}
    >
      <View style={s.cardTop}>
        <View style={[s.icon, { backgroundColor: k.bg }]}>
          <Icon size={19} color={k.fg} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.title} numberOfLines={2}>{item.title}</Text>
          {item.detail ? <Text style={s.detail} numberOfLines={2}>{item.detail}</Text> : null}
        </View>
        {when ? <Text style={s.when}>{when}</Text> : null}
      </View>

      {item.media?.length ? (
        <View style={s.thumbs}>
          {item.media.map((m) => {
            const uri = resolveMediaUrl(m.url);
            return (
              <View key={m.id} style={s.thumb}>
                {m.kind === 'video' || !uri ? (
                  <View style={[s.thumbFill, { backgroundColor: INK, alignItems: 'center', justifyContent: 'center' }]}><Play size={14} color={Colors.white} fill={Colors.white} /></View>
                ) : <Image source={{ uri }} style={s.thumbFill} />}
              </View>
            );
          })}
        </View>
      ) : null}

      <View style={s.actions}>
        <TouchableOpacity style={[s.primary, { backgroundColor: k.button }]} onPress={() => { tap(); onIntent(item.primary.intent); }} activeOpacity={0.85}>
          <Text style={s.primaryText} numberOfLines={1}>{item.primary.label}</Text>
        </TouchableOpacity>
        {item.secondary ? (
          <TouchableOpacity style={s.secondary} onPress={() => { tap(); onIntent(item.secondary!.intent); }} activeOpacity={0.8}>
            <Text style={s.secondaryText} numberOfLines={1}>{item.secondary.label}</Text>
          </TouchableOpacity>
        ) : null}
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
          <ChevronRight size={15} color={Colors.primary} />
        </TouchableOpacity>
      </View>
      {rows.length === 0 ? (
        <View style={s.emptyToday}><Truck size={18} color={MUTED} /><Text style={s.detail}>Nothing running or starting today.</Text></View>
      ) : (
        <View style={s.todayCard}>
          {rows.slice(0, 8).map(({ trip: t, unit }, i) => {
            const done = t.stops.filter((st) => st.actual_arrival).length;
            const next = t.next_stop_index != null ? t.stops[t.next_stop_index] : null;
            const state = t.phase === 'delayed' ? { label: 'Delayed', bg: '#FDEDEB', fg: '#912018' }
              : t.phase === 'active' ? { label: 'Running', bg: '#E7EEFC', fg: '#2449A8' }
              : { label: `Starts ${time(t.planned_start)}`, bg: '#F0EBFC', fg: '#4A2A93' };
            return (
              <TouchableOpacity key={t.id} style={[s.todayRow, i > 0 && s.todayBorder]} onPress={() => onOpenTrip(t.id)} activeOpacity={0.75}>
                <Text style={s.todayTime}>{time(t.planned_start)}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.todayRef} numberOfLines={1}>{t.ref_id ?? 'Trip'} · {t.customer_name ?? '—'}</Text>
                  <Text style={s.detail} numberOfLines={1}>
                    {[unit.vehicle?.plate_number, t.phase !== 'upcoming' && t.stops.length ? `${done}/${t.stops.length} stops` : null, t.phase !== 'upcoming' && next?.name ? `→ ${next.name}` : null].filter(Boolean).join(' · ') || '—'}
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
  summary: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 12, borderWidth: 1, borderColor: '#EEF0F4' },
  tileValue: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  tileLabel: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h2: { fontSize: 18, fontWeight: '800', color: INK, letterSpacing: -0.2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, borderRadius: 17, paddingHorizontal: 13, backgroundColor: '#F1F3F7' },
  chipOn: { backgroundColor: INK },
  chipText: { fontSize: 13, fontWeight: '700', color: '#3B3B44' },
  chipTextOn: { color: Colors.white },
  chipCount: { fontSize: 11, fontWeight: '800', color: MUTED, backgroundColor: Colors.white, borderRadius: 9, minWidth: 18, paddingHorizontal: 5, textAlign: 'center', overflow: 'hidden', lineHeight: 18 },
  chipCountOn: { color: INK },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4, marginLeft: 2 },
  groupDot: { width: 8, height: 8, borderRadius: 4 },
  groupText: { fontSize: 12, fontWeight: '800', color: '#3B3B44', textTransform: 'uppercase', letterSpacing: 0.6 },
  card: { backgroundColor: Colors.white, borderRadius: 18, padding: 14, gap: 12, borderWidth: 1, borderColor: '#EEF0F4' },
  cardNow: { borderColor: '#F5C2BC', shadowColor: '#D92D20', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  cardTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  icon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '800', color: INK },
  detail: { fontSize: 12.5, color: MUTED, marginTop: 2, lineHeight: 17 },
  when: { fontSize: 11, color: MUTED, fontWeight: '600', marginTop: 2 },
  thumbs: { flexDirection: 'row', gap: 6, marginLeft: 52 },
  thumb: { width: 52, height: 52, borderRadius: 10, overflow: 'hidden', backgroundColor: '#E4E7EE' },
  thumbFill: { width: '100%', height: '100%' },
  actions: { flexDirection: 'row', gap: 8, marginLeft: 52 },
  primary: { flex: 1, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  primaryText: { color: Colors.white, fontSize: 13, fontWeight: '800' },
  secondary: { height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, backgroundColor: '#F1F3F7' },
  secondaryText: { color: INK, fontSize: 13, fontWeight: '700' },
  more: { height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F3F7' },
  moreText: { fontSize: 14, fontWeight: '800', color: INK },
  clear: { alignItems: 'center', gap: 6, backgroundColor: '#F2FBF5', borderRadius: 18, paddingVertical: 22, paddingHorizontal: 20 },
  clearIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center' },
  clearTitle: { fontSize: 16, fontWeight: '800', color: '#146C3C' },
  clearText: { fontSize: 13, color: '#146C3C', textAlign: 'center' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  linkText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  emptyToday: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F5F6F9', borderRadius: 14, padding: 14 },
  todayCard: { backgroundColor: Colors.white, borderRadius: 18, borderWidth: 1, borderColor: '#EEF0F4', paddingHorizontal: 14 },
  todayRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  todayBorder: { borderTopWidth: 1, borderTopColor: '#F1F3F7' },
  todayTime: { width: 44, fontSize: 14, fontWeight: '800', color: INK, fontVariant: ['tabular-nums'] },
  todayRef: { fontSize: 14, fontWeight: '700', color: INK },
  state: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  stateText: { fontSize: 11, fontWeight: '800' },
});

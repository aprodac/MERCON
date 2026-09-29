/**
 * Operator home, in three blocks:
 *   1. HomeStatus     — one card: how many things need you now, and the fleet
 *                       at a glance (on the road · delayed · today).
 *   2. NeedsActionList — filter chips by problem type, then the most urgent
 *                       items as one grouped list (title, context, when, and
 *                       the one action that handles it). Shows 5, "Show all".
 *   3. UpNext         — the next few trips today; the full list is on Trips.
 * Each fact appears once; nothing is folded behind tabs.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ScrollView, ActivityIndicator } from 'react-native';
import {
  AlarmClock, ChevronDown, ChevronRight, CircleCheckBig, Clock3, FileClock, Images, Phone, Play, Receipt, SignalLow, Siren, Split, UserX,
  type LucideIcon,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { resolveMediaUrl } from '@mercon/mobile-shared/lib/media';
import type { LiveUnit } from '../../../lib/operator';
import { niceName } from '../../trips/create/components/ui';
import { whenLabel, type ActionIntent, type ActionItem, type ActionKind } from './actionModel';

const INK = '#18181B';
const MUTED = '#6B6B76';
const LINE = '#E9E9EC';
const RED = '#D92D20';

const tap = () => Haptics.selectionAsync().catch(() => {});

const NEUTRAL = '#F4F4F5';
const SEV = { red: '#D92D20', amber: '#B54708', gray: '#52525B' };
const KIND: Record<ActionKind, { icon: LucideIcon; fg: string }> = {
  emergency: { icon: Siren, fg: SEV.red },
  delayed: { icon: Clock3, fg: SEV.red },
  'late-start': { icon: AlarmClock, fg: SEV.red },
  unassigned: { icon: UserX, fg: SEV.red },
  'gps-quiet': { icon: SignalLow, fg: SEV.amber },
  'gps-mismatch': { icon: Split, fg: SEV.amber },
  photos: { icon: Images, fg: SEV.gray },
  'time-check': { icon: Clock3, fg: SEV.amber },
  expiry: { icon: FileClock, fg: SEV.amber },
  'overdue-invoice': { icon: Receipt, fg: SEV.gray },
};

/** The problem types the operator filters by (several kinds share one chip). */
const GROUPS: { id: string; label: string; kinds: ActionKind[] }[] = [
  { id: 'late', label: 'Delayed', kinds: ['emergency', 'delayed', 'late-start'] },
  { id: 'gps', label: 'No GPS', kinds: ['gps-quiet', 'gps-mismatch'] },
  { id: 'assign', label: 'Unassigned', kinds: ['unassigned'] },
  { id: 'send', label: 'To send', kinds: ['photos', 'time-check'] },
  { id: 'docs', label: 'Documents', kinds: ['expiry'] },
  { id: 'money', label: 'Invoices', kinds: ['overdue-invoice'] },
];

/** Row context, tidied: ALL-CAPS words get normal case, and "heading to …" is dropped (the route is one tap away). */
function tidy(text: string): string {
  return text
    .split(' · ')
    .filter((part) => !/^heading to /i.test(part.trim()))
    .join(' · ')
    .replace(/\b[A-Z]{4,}\b/g, (w) => w[0] + w.slice(1).toLowerCase())
    .trim();
}

const SHOWN = 5;

// ── 1 · Status ────────────────────────────────────────────────────────────────

export function HomeStatus({ needNow, running, delayed, today, loading, onRunning, onDelayed, onToday }: {
  needNow: number; running: number; delayed: number; today: number; loading: boolean;
  onRunning: () => void; onDelayed: () => void; onToday: () => void;
}) {
  const clear = !loading && needNow === 0;
  const cells = [
    { key: 'run', label: 'On the road', value: running, onPress: onRunning },
    { key: 'late', label: 'Delayed', value: delayed, onPress: onDelayed, hot: delayed > 0 },
    { key: 'today', label: 'Trips today', value: today, onPress: onToday },
  ];
  return (
    <View style={s.hero}>
      <View style={s.heroTop}>
        {clear ? (
          <>
            <CircleCheckBig size={28} color="#16A34A" strokeWidth={2.2} />
            <View style={{ flex: 1 }}>
              <Text style={s.heroBig}>All clear</Text>
              <Text style={s.heroSub}>Nothing needs you right now</Text>
            </View>
          </>
        ) : (
          <>
            <Text style={s.heroNumber}>{loading ? '–' : needNow}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.heroBig}>{needNow === 1 ? 'thing needs' : 'things need'} your attention</Text>
              <Text style={s.heroSub}>Urgent first</Text>
            </View>
          </>
        )}
      </View>
      <View style={s.heroStats}>
        {cells.map((c, i) => (
          <TouchableOpacity key={c.key} style={[s.stat, i > 0 && s.statBorder]} onPress={() => { tap(); c.onPress(); }} activeOpacity={0.6}>
            <Text style={[s.statValue, c.hot && { color: RED }]}>{c.value}</Text>
            <Text style={s.statLabel}>{c.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ── 2 · Needs action ──────────────────────────────────────────────────────────

export function NeedsActionList({ items, loading, onIntent, onOpenTrip, now }: {
  items: ActionItem[];
  loading: boolean;
  onIntent: (intent: ActionIntent) => void;
  onOpenTrip: (tripId: string) => void;
  now: number;
}) {
  const [group, setGroup] = useState<string | null>(null);
  const [all, setAll] = useState(false);

  const chips = useMemo(
    () => GROUPS.map((g) => ({ ...g, count: items.filter((i) => g.kinds.includes(i.kind)).length })).filter((g) => g.count > 0),
    [items],
  );
  // A chip that has emptied since it was picked falls back to "All".
  const active = chips.find((c) => c.id === group) ?? null;
  const list = active ? items.filter((i) => active.kinds.includes(i.kind)) : items;
  const visible = all ? list : list.slice(0, SHOWN);

  if (!loading && items.length === 0) return null;

  return (
    <View style={{ gap: 12 }}>
      <View style={s.headRow}>
        <Text style={s.h2}>Needs action</Text>
        {loading ? <ActivityIndicator size="small" color={MUTED} /> : <Text style={s.headCount}>{list.length}</Text>}
      </View>

      {chips.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} style={{ marginHorizontal: -16 }}>
          <Chip label="All" count={items.length} on={!active} onPress={() => { tap(); setGroup(null); setAll(false); }} />
          {chips.map((c) => (
            <Chip key={c.id} label={c.label} count={c.count} on={active?.id === c.id} onPress={() => { tap(); setGroup(c.id); setAll(false); }} />
          ))}
        </ScrollView>
      ) : null}

      <View style={s.group}>
        {visible.map((item, i) => (
          <ActionRow key={item.key} item={item} first={i === 0} now={now} onIntent={onIntent} onOpenTrip={onOpenTrip} />
        ))}
      </View>

      {list.length > SHOWN ? (
        <TouchableOpacity style={s.showAll} onPress={() => { tap(); setAll((v) => !v); }} activeOpacity={0.7}>
          <Text style={s.showAllText}>{all ? 'Show less' : `Show all ${list.length}`}</Text>
          <ChevronDown size={16} color={INK} style={all ? { transform: [{ rotate: '180deg' }] } : undefined} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function Chip({ label, count, on, onPress }: { label: string; count: number; on: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[s.chip, on && s.chipOn]} onPress={onPress} activeOpacity={0.8}>
      <Text style={[s.chipText, on && s.chipTextOn]}>{label}</Text>
      <Text style={[s.chipCount, on && s.chipCountOn]}>{count}</Text>
    </TouchableOpacity>
  );
}

function ActionRow({ item, first, now, onIntent, onOpenTrip }: { item: ActionItem; first: boolean; now: number; onIntent: (i: ActionIntent) => void; onOpenTrip: (id: string) => void }) {
  const k = KIND[item.kind];
  const Icon = k.icon;
  const when = whenLabel(item, now);
  const call = item.secondary?.intent.type === 'call' ? item.secondary : null;
  const other = item.secondary && !call ? item.secondary : null;
  const openRow = () => (item.tripId ? onOpenTrip(item.tripId) : onIntent(item.primary.intent));

  return (
    <TouchableOpacity style={[s.row, !first && s.rowBorder]} onPress={openRow} activeOpacity={0.6}>
      <View style={s.icon}><Icon size={18} color={k.fg} strokeWidth={2.2} /></View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.title}>{item.title}</Text>
        {item.detail ? <Text style={s.detail}>{tidy(item.detail)}</Text> : null}
        {when ? <Text style={[s.when, when.hot && { color: RED }]}>{when.text}</Text> : null}
        {item.media?.length ? (
          <View style={s.thumbs}>
            {item.media.map((m) => {
              const uri = resolveMediaUrl(m.url);
              return (
                <View key={m.id} style={s.thumb}>
                  {m.kind === 'video' || !uri ? (
                    <View style={[s.thumbFill, { backgroundColor: INK, alignItems: 'center', justifyContent: 'center' }]}><Play size={11} color={Colors.white} fill={Colors.white} /></View>
                  ) : <Image source={{ uri }} style={s.thumbFill} />}
                </View>
              );
            })}
          </View>
        ) : null}
      </View>
      <View style={s.actions}>
        {other ? (
          <TouchableOpacity style={s.ghost} onPress={() => { tap(); onIntent(other.intent); }} hitSlop={4}>
            <Text style={s.ghostText}>{other.label}</Text>
          </TouchableOpacity>
        ) : null}
        {call ? (
          <TouchableOpacity style={s.callBtn} onPress={() => { tap(); onIntent(call.intent); }} hitSlop={6} accessibilityLabel="Call driver">
            <Phone size={16} color="#3F3F46" strokeWidth={2.2} />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={s.primary} onPress={() => { tap(); onIntent(item.primary.intent); }} hitSlop={4}>
          <Text style={s.primaryText}>{item.primary.label}</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

// ── 3 · Up next ───────────────────────────────────────────────────────────────

export function UpNext({ rows, tz, onOpenTrip, onAll }: {
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
  // Soonest first, not-yet-started before running ones already covered above.
  const next = rows.filter((r) => r.trip.phase === 'upcoming').slice(0, 3);
  return (
    <View style={{ gap: 10 }}>
      <View style={s.headRow}>
        <Text style={s.h2}>Up next today</Text>
        <TouchableOpacity onPress={onAll} hitSlop={8} style={s.link}>
          <Text style={s.linkText}>All trips</Text>
          <ChevronRight size={15} color={MUTED} />
        </TouchableOpacity>
      </View>
      {next.length === 0 ? (
        <View style={s.emptyNext}><Text style={s.detailSm}>No more trips starting today.</Text></View>
      ) : (
        <View style={s.nextCard}>
          {next.map(({ trip: t, unit }, i) => (
            <TouchableOpacity key={t.id} style={[s.nextRow, i > 0 && s.nextBorder]} onPress={() => onOpenTrip(t.id)} activeOpacity={0.7}>
              <Text style={s.nextTime}>{time(t.planned_start)}</Text>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.nextName} numberOfLines={2}>{niceName(t.customer_name) || '—'}</Text>
                <Text style={s.detailSm} numberOfLines={1}>{[t.ref_id, unit.vehicle?.plate_number ?? 'No truck'].filter(Boolean).join(' · ')}</Text>
              </View>
              <ChevronRight size={18} color="#C4C4CC" />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  // status card
  hero: { backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: LINE, paddingTop: 16 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingBottom: 14 },
  heroNumber: { fontSize: 44, fontWeight: '700', color: INK, letterSpacing: -1.5, fontVariant: ['tabular-nums'], minWidth: 46 },
  heroBig: { fontSize: 17, fontWeight: '600', color: INK, lineHeight: 22 },
  heroSub: { fontSize: 13, color: MUTED, marginTop: 1 },
  heroStats: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: LINE },
  stat: { flex: 1, paddingVertical: 12, alignItems: 'center', gap: 1 },
  statBorder: { borderLeftWidth: 1, borderLeftColor: LINE },
  statValue: { fontSize: 20, fontWeight: '700', color: INK, fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 12, color: MUTED },

  // section heads
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h2: { fontSize: 17, fontWeight: '700', color: INK, letterSpacing: -0.2 },
  headCount: { fontSize: 14, fontWeight: '600', color: MUTED, fontVariant: ['tabular-nums'] },
  link: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  linkText: { fontSize: 14, fontWeight: '500', color: MUTED },

  // filter chips
  chips: { paddingHorizontal: 16, gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 13, borderRadius: 17, backgroundColor: Colors.white, borderWidth: 1, borderColor: LINE },
  chipOn: { backgroundColor: INK, borderColor: INK },
  chipText: { fontSize: 13, fontWeight: '600', color: '#3F3F46' },
  chipTextOn: { color: Colors.white },
  chipCount: { fontSize: 13, fontWeight: '500', color: MUTED, fontVariant: ['tabular-nums'] },
  chipCountOn: { color: 'rgba(255,255,255,0.65)' },

  // grouped list
  group: { backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: LINE, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 14, paddingVertical: 14 },
  rowBorder: { borderTopWidth: 1, borderTopColor: '#F1F1F3' },
  icon: { width: 36, height: 36, borderRadius: 10, backgroundColor: NEUTRAL, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '600', color: INK, lineHeight: 20 },
  detail: { fontSize: 13, color: MUTED, lineHeight: 18 },
  when: { fontSize: 12, fontWeight: '600', color: MUTED, marginTop: 1 },
  thumbs: { flexDirection: 'row', gap: 6, marginTop: 6 },
  thumb: { width: 40, height: 40, borderRadius: 8, overflow: 'hidden', backgroundColor: '#E4E7EE' },
  thumbFill: { width: '100%', height: '100%' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center' },
  primary: { height: 34, borderRadius: 10, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: INK },
  primaryText: { fontSize: 13, fontWeight: '600', color: Colors.white },
  ghost: { height: 34, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  ghostText: { fontSize: 13, fontWeight: '500', color: MUTED },
  callBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: NEUTRAL, alignItems: 'center', justifyContent: 'center' },
  showAll: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44 },
  showAllText: { fontSize: 14, fontWeight: '600', color: INK },

  // up next
  nextCard: { backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: LINE, overflow: 'hidden' },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 14 },
  nextBorder: { borderTopWidth: 1, borderTopColor: '#F1F1F3' },
  nextTime: { width: 48, fontSize: 15, fontWeight: '700', color: INK, fontVariant: ['tabular-nums'] },
  nextName: { fontSize: 15, fontWeight: '600', color: INK, lineHeight: 20 },
  detailSm: { fontSize: 13, color: MUTED },
  emptyNext: { backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: LINE, padding: 16 },
});

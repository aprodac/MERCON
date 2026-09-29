/**
 * Operator home, in three blocks:
 *   1. HomeStatus     — one card: how many things need you now, and the fleet
 *                       at a glance (on the road · delayed · today).
 *   2. NeedsActionList — filter chips by problem type, then the most urgent
 *                       items as cards (title, one line of context, when, and
 *                       the one action that handles it). Shows 4, "Show all".
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
const MUTED = '#71717A';
const LINE = '#ECECEF';
const CORAL = '#FA634E';

const tap = () => Haptics.selectionAsync().catch(() => {});

const KIND: Record<ActionKind, { icon: LucideIcon; bg: string; fg: string }> = {
  emergency: { icon: Siren, bg: '#FDE3E0', fg: '#B42318' },
  delayed: { icon: Clock3, bg: '#FDEDEB', fg: '#912018' },
  'late-start': { icon: AlarmClock, bg: '#FFF1E0', fg: '#8A4B00' },
  unassigned: { icon: UserX, bg: '#FDEDEB', fg: '#912018' },
  'gps-quiet': { icon: SignalLow, bg: '#FFF4D6', fg: '#7A4F00' },
  'gps-mismatch': { icon: Split, bg: '#FFF4D6', fg: '#7A4F00' },
  photos: { icon: Images, bg: '#E3F7EA', fg: '#0F6B37' },
  'time-check': { icon: Clock3, bg: '#FFF4D6', fg: '#7A4F00' },
  expiry: { icon: FileClock, bg: '#F0EBFC', fg: '#4A2A93' },
  'overdue-invoice': { icon: Receipt, bg: '#EEF0F4', fg: '#3E3C3D' },
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

/** "IMILE DELIVERY SAUDI" → "Imile Delivery Saudi"; "heading to khamis mushayt" → "…Khamis Mushayt". */
function tidy(text: string): string {
  return text
    .replace(/\b[A-Z]{4,}\b/g, (w) => w[0] + w.slice(1).toLowerCase())
    .replace(/(heading to )([^·]+)/, (_m, a: string, b: string) => `${a}${niceName(b.trim())} `)
    .trim();
}

const SHOWN = 4;

// ── 1 · Status ────────────────────────────────────────────────────────────────

export function HomeStatus({ needNow, running, delayed, today, loading, onRunning, onDelayed, onToday }: {
  needNow: number; running: number; delayed: number; today: number; loading: boolean;
  onRunning: () => void; onDelayed: () => void; onToday: () => void;
}) {
  const clear = !loading && needNow === 0;
  const cells = [
    { key: 'run', label: 'On the road', value: running, onPress: onRunning },
    { key: 'late', label: 'Delayed', value: delayed, onPress: onDelayed, hot: delayed > 0 },
    { key: 'today', label: 'Today', value: today, onPress: onToday },
  ];
  return (
    <View style={[s.hero, clear && { backgroundColor: '#16A34A' }]}>
      <View style={s.ringA} pointerEvents="none" />
      <View style={s.ringB} pointerEvents="none" />
      <View style={s.heroTop}>
        {clear ? (
          <>
            <View style={[s.heroIcon, { backgroundColor: 'rgba(255,255,255,0.22)' }]}><CircleCheckBig size={24} color="#FFFFFF" strokeWidth={2.4} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.heroBig}>All clear</Text>
              <Text style={s.heroSub}>Nothing needs you right now</Text>
            </View>
          </>
        ) : (
          <>
            <Text style={s.heroNumber}>{loading ? '–' : needNow}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.heroBig}>{needNow === 1 ? 'thing needs' : 'things need'} you now</Text>
              <Text style={s.heroSub}>Most urgent first, below</Text>
            </View>
          </>
        )}
      </View>
      <View style={s.heroStats}>
        {cells.map((c, i) => (
          <TouchableOpacity key={c.key} style={[s.stat, i > 0 && s.statBorder]} onPress={() => { tap(); c.onPress(); }} activeOpacity={0.7}>
            <Text style={s.statValue}>{c.value}</Text>
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
        {loading ? <ActivityIndicator size="small" color={CORAL} /> : <Text style={s.headCount}>{list.length}</Text>}
      </View>

      {chips.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} style={{ marginHorizontal: -16 }}>
          <Chip label="All" count={items.length} on={!active} onPress={() => { tap(); setGroup(null); setAll(false); }} />
          {chips.map((c) => (
            <Chip key={c.id} label={c.label} count={c.count} on={active?.id === c.id} onPress={() => { tap(); setGroup(c.id); setAll(false); }} />
          ))}
        </ScrollView>
      ) : null}

      <View style={{ gap: 10 }}>
        {visible.map((item) => (
          <ActionCard key={item.key} item={item} now={now} onIntent={onIntent} onOpenTrip={onOpenTrip} />
        ))}
      </View>

      {list.length > SHOWN ? (
        <TouchableOpacity style={s.showAll} onPress={() => { tap(); setAll((v) => !v); }} activeOpacity={0.7}>
          <Text style={s.showAllText}>{all ? 'Show less' : `Show all ${list.length}`}</Text>
          <ChevronDown size={16} color="#D94E38" style={all ? { transform: [{ rotate: '180deg' }] } : undefined} />
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

function ActionCard({ item, now, onIntent, onOpenTrip }: { item: ActionItem; now: number; onIntent: (i: ActionIntent) => void; onOpenTrip: (id: string) => void }) {
  const k = KIND[item.kind];
  const Icon = k.icon;
  const when = whenLabel(item, now);
  const call = item.secondary?.intent.type === 'call' ? item.secondary : null;
  const other = item.secondary && !call ? item.secondary : null;
  const go = item.kind === 'photos';
  const openCard = () => (item.tripId ? onOpenTrip(item.tripId) : onIntent(item.primary.intent));

  return (
    <TouchableOpacity style={[s.card, { borderColor: k.bg }]} onPress={openCard} activeOpacity={0.88}>
      <View style={[s.edge, { backgroundColor: k.fg }]} />
      <View style={s.cardTop}>
        <View style={[s.icon, { backgroundColor: k.bg }]}><Icon size={21} color={k.fg} strokeWidth={2.3} /></View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={s.title}>{item.title}</Text>
          {item.detail ? <Text style={s.detail} numberOfLines={2}>{tidy(item.detail)}</Text> : null}
        </View>
      </View>

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

      <View style={s.cardFoot}>
        {when ? (
          <View style={[s.when, when.hot && s.whenHot]}>
            <Text style={[s.whenText, when.hot && { color: '#B42318' }]}>{when.text}</Text>
          </View>
        ) : <View />}
        <View style={s.actions}>
          {other ? (
            <TouchableOpacity style={s.ghost} onPress={() => { tap(); onIntent(other.intent); }} hitSlop={4}>
              <Text style={s.ghostText}>{other.label}</Text>
            </TouchableOpacity>
          ) : null}
          {call ? (
            <TouchableOpacity style={s.callBtn} onPress={() => { tap(); onIntent(call.intent); }} hitSlop={6} accessibilityLabel="Call driver">
              <Phone size={17} color="#15803D" strokeWidth={2.4} />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={[s.primary, go && { backgroundColor: '#16A34A' }]} onPress={() => { tap(); onIntent(item.primary.intent); }} hitSlop={4}>
            <Text style={s.primaryText}>{item.primary.label}</Text>
          </TouchableOpacity>
        </View>
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
          <ChevronRight size={15} color="#D94E38" />
        </TouchableOpacity>
      </View>
      {next.length === 0 ? (
        <View style={s.emptyNext}><Text style={s.detail}>No more trips starting today.</Text></View>
      ) : (
        <View style={s.nextCard}>
          {next.map(({ trip: t, unit }, i) => (
            <TouchableOpacity key={t.id} style={[s.nextRow, i > 0 && s.nextBorder]} onPress={() => onOpenTrip(t.id)} activeOpacity={0.7}>
              <Text style={s.nextTime}>{time(t.planned_start)}</Text>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.nextName} numberOfLines={2}>{niceName(t.customer_name) || '—'}</Text>
                <Text style={s.detail} numberOfLines={1}>{[t.ref_id, unit.vehicle?.plate_number ?? 'No truck'].filter(Boolean).join(' · ')}</Text>
              </View>
              <ChevronRight size={18} color="#FA634E" />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  // status card
  hero: { backgroundColor: CORAL, borderRadius: 24, padding: 18, gap: 16, overflow: 'hidden' },
  ringA: { position: 'absolute', top: -50, right: -30, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.13)' },
  ringB: { position: 'absolute', bottom: -60, left: -40, width: 130, height: 130, borderRadius: 65, backgroundColor: 'rgba(255,255,255,0.09)' },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroNumber: { fontSize: 46, fontWeight: '800', color: Colors.white, letterSpacing: -1.5, fontVariant: ['tabular-nums'], minWidth: 44 },
  heroIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  heroBig: { fontSize: 18, fontWeight: '700', color: Colors.white, lineHeight: 23 },
  heroSub: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.85)', marginTop: 1 },
  heroStats: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 16, paddingVertical: 12 },
  stat: { flex: 1, alignItems: 'center', gap: 1 },
  statBorder: { borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.3)' },
  statValue: { fontSize: 22, fontWeight: '800', color: Colors.white, fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.9)' },

  // section heads
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h2: { fontSize: 18, fontWeight: '800', color: INK, letterSpacing: -0.3 },
  headCount: { fontSize: 13, fontWeight: '800', color: '#D94E38', backgroundColor: '#FFF0EC', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, overflow: 'hidden' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  linkText: { fontSize: 13, fontWeight: '700', color: '#D94E38' },

  // chips
  chips: { paddingHorizontal: 16, gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: Colors.white, borderWidth: 1, borderColor: '#F3D9D3' },
  chipOn: { backgroundColor: CORAL, borderColor: CORAL },
  chipText: { fontSize: 13, fontWeight: '700', color: '#3F3F46' },
  chipTextOn: { color: Colors.white },
  chipCount: { fontSize: 12, fontWeight: '800', color: CORAL },
  chipCountOn: { color: 'rgba(255,255,255,0.85)' },

  // action card
  card: {
    backgroundColor: Colors.white, borderRadius: 20, padding: 14, paddingLeft: 18, gap: 12, borderWidth: 1.5, borderColor: LINE, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 },
  cardTop: { flexDirection: 'row', gap: 12 },
  icon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '700', color: INK, lineHeight: 20 },
  detail: { fontSize: 13, color: '#52525B', lineHeight: 18 },
  thumbs: { flexDirection: 'row', gap: 6, marginLeft: 54 },
  thumb: { width: 44, height: 44, borderRadius: 10, overflow: 'hidden', backgroundColor: '#E4E7EE' },
  thumbFill: { width: '100%', height: '100%' },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F4F4F5' },
  when: { borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6, backgroundColor: '#EEF2FF' },
  whenHot: { backgroundColor: '#FEE4E2' },
  whenText: { fontSize: 12, fontWeight: '800', color: '#3730A3' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  primary: { height: 38, borderRadius: 12, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: CORAL },
  primaryText: { fontSize: 13, fontWeight: '700', color: Colors.white },
  ghost: { height: 36, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  ghostText: { fontSize: 13, fontWeight: '600', color: MUTED },
  callBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' },
  showAll: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 46, borderRadius: 16, backgroundColor: '#FFF0EC', borderWidth: 1.5, borderColor: '#FBD3CB' },
  showAllText: { fontSize: 14, fontWeight: '800', color: '#D94E38' },

  // up next
  nextCard: { backgroundColor: Colors.white, borderRadius: 20, borderWidth: 1.5, borderColor: '#F3D9D3', overflow: 'hidden' },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 13 },
  nextBorder: { borderTopWidth: 1, borderTopColor: '#F4F4F5' },
  nextTime: { width: 60, textAlign: 'center', fontSize: 15, fontWeight: '800', color: '#D94E38', backgroundColor: '#FFF0EC', paddingVertical: 8, borderRadius: 12, overflow: 'hidden', fontVariant: ['tabular-nums'] },
  nextName: { fontSize: 14, fontWeight: '700', color: INK, lineHeight: 19 },
  emptyNext: { backgroundColor: Colors.white, borderRadius: 18, borderWidth: 1, borderColor: LINE, padding: 16 },
});

/**
 * Operator home, in three blocks:
 *   1. HomeStatus     — one card: how many things need you now, and the fleet
 *                       at a glance (on the road · delayed · today).
 *   2. NeedsActionList — urgent items only, one row per kind of problem:
 *                       a lone item shows its action; several of one kind
 *                       fold into "9 trips delayed · worst …" that opens a
 *                       sheet, worst first. Lower-priority items under Later.
 *   3. UpNext         — the next few trips today; the full list is on Trips.
 * Each fact appears once; nothing is folded behind tabs.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import { AppModal } from '@mercon/mobile-shared/components/common/AppModal';
import {
  AlarmClock, ChevronDown, ChevronRight, CircleCheckBig, Clock3, FileClock, Images, Phone, Play, Receipt, MapPinOff, Siren, Split, UserX,
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
  'gps-quiet': { icon: MapPinOff, fg: SEV.amber },
  'gps-mismatch': { icon: Split, fg: SEV.amber },
  photos: { icon: Images, fg: SEV.gray },
  'time-check': { icon: Clock3, fg: SEV.amber },
  expiry: { icon: FileClock, fg: SEV.amber },
  'overdue-invoice': { icon: Receipt, fg: SEV.gray },
};

/** How a group of one kind reads: "9 trips delayed". */
const GROUP_NOUN: Record<ActionKind, [string, string]> = {
  emergency: ['emergency', 'emergencies'],
  delayed: ['trip delayed', 'trips delayed'],
  'late-start': ['trip not started', 'trips not started'],
  unassigned: ['trip without driver or truck', 'trips without driver or truck'],
  'gps-quiet': ['truck with no GPS', 'trucks with no GPS'],
  'gps-mismatch': ['GPS mismatch', 'GPS mismatches'],
  photos: ['photo update to send', 'photo updates to send'],
  'time-check': ['screenshot to check', 'screenshots to check'],
  expiry: ['document expiring', 'documents expiring'],
  'overdue-invoice': ['overdue invoice', 'overdue invoices'],
};

/** Oldest first = the one that's been wrong longest ("most late"); undated last. */
const worstFirst = (a: ActionItem, b: ActionItem) =>
  (a.at ? new Date(a.at).getTime() : Infinity) - (b.at ? new Date(b.at).getTime() : Infinity);

/** One entry per kind, keeping the list's urgency order: a single item stays a row, several become a group. */
function groupByKind(items: ActionItem[]): ({ type: 'item'; item: ActionItem } | { type: 'group'; kind: ActionKind; items: ActionItem[] })[] {
  const order: ActionKind[] = [];
  const byKind = new Map<ActionKind, ActionItem[]>();
  for (const i of items) {
    if (!byKind.has(i.kind)) { byKind.set(i.kind, []); order.push(i.kind); }
    byKind.get(i.kind)!.push(i);
  }
  return order.map((k) => {
    const list = byKind.get(k)!;
    return list.length === 1 ? { type: 'item' as const, item: list[0] } : { type: 'group' as const, kind: k, items: [...list].sort(worstFirst) };
  });
}


/** Row context, tidied: ALL-CAPS words get normal case, and "heading to …" is dropped (the route is one tap away). */
function tidy(text: string): string {
  return text
    .split(' · ')
    .filter((part) => !/^heading to /i.test(part.trim()))
    .join(' · ')
    .replace(/\b[A-Z]{4,}\b/g, (w) => w[0] + w.slice(1).toLowerCase())
    .trim();
}


// ── 1 · Status ────────────────────────────────────────────────────────────────

export function HomeStatus({ needNow, running, delayed, today, day, loading, updatedAt, now, onRunning, onDelayed, onToday }: {
  needNow: number; running: number; delayed: number; today: number; loading: boolean; updatedAt: number | null; now: number;
  day: { total: number; done: number; running: number; toStart: number } | null;
  onRunning: () => void; onDelayed: () => void; onToday: () => void;
}) {
  const clear = !loading && needNow === 0;
  const cells = [
    { key: 'run', label: 'On the road', value: running, onPress: onRunning },
    { key: 'late', label: 'Delayed', value: delayed, onPress: onDelayed, hot: delayed > 0 },
    { key: 'today', label: 'Trips today', value: day?.total ?? today, onPress: onToday },
  ];
  return (
    <View style={s.hero}>
      <View style={s.heroTop}>
        {clear ? (
          <>
            <CircleCheckBig size={28} color="#16A34A" strokeWidth={2.2} />
            <View style={{ flex: 1 }}>
              <Text style={s.heroBig}>All clear</Text>
              <Text style={s.heroSub}>{updatedText(updatedAt, now)}</Text>
            </View>
          </>
        ) : (
          <>
            {loading ? <View style={[s.skel, { width: 46, height: 44 }]} /> : <Text style={s.heroNumber}>{needNow}</Text>}
            <View style={{ flex: 1, gap: loading ? 8 : 0 }}>
              {loading ? (
                <>
                  <View style={[s.skel, { width: '80%', height: 16 }]} />
                  <View style={[s.skel, { width: '45%', height: 12 }]} />
                </>
              ) : (
                <>
                  <Text style={s.heroBig}>{needNow === 1 ? 'thing needs' : 'things need'} your attention</Text>
                  <Text style={s.heroSub}>{updatedText(updatedAt, now)}</Text>
                </>
              )}
            </View>
          </>
        )}
      </View>
      <View style={s.heroStats}>
        {cells.map((c, i) => (
          <TouchableOpacity key={c.key} style={[s.stat, i > 0 && s.statBorder]} onPress={() => { tap(); c.onPress(); }} activeOpacity={0.6}>
            {loading ? <View style={[s.skel, { width: 28, height: 20, marginBottom: 3 }]} /> : <Text style={[s.statValue, c.hot && { color: RED }]}>{c.value}</Text>}
            <Text style={s.statLabel}>{c.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {day && day.total > 0 ? <DayBar day={day} /> : null}
    </View>
  );
}

/** How today is going: one bar split done / running / to start. */
function DayBar({ day }: { day: { total: number; done: number; running: number; toStart: number } }) {
  const parts = [
    { key: 'done', n: day.done, color: '#16A34A', label: 'done' },
    { key: 'run', n: day.running, color: '#18181B', label: 'running' },
    { key: 'next', n: day.toStart, color: '#D4D4D8', label: 'to start' },
  ];
  return (
    <View style={s.day}>
      <View style={s.dayTrack}>
        {parts.filter((p) => p.n > 0).map((p) => <View key={p.key} style={{ flex: p.n, backgroundColor: p.color }} />)}
      </View>
      <View style={s.dayLegend}>
        {parts.map((p) => (
          <View key={p.key} style={s.dayItem}>
            <View style={[s.dayDot, { backgroundColor: p.color }]} />
            <Text style={s.dayText}><Text style={s.dayNum}>{p.n}</Text> {p.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function updatedText(at: number | null, now: number): string {
  if (!at) return 'Live';
  const min = Math.floor((now - at) / 60000);
  return min < 1 ? 'Updated just now' : `Updated ${min} min ago`;
}

// ── 2 · Needs action ──────────────────────────────────────────────────────────

export function NeedsActionList({ items, loading, onIntent, onOpenTrip, now }: {
  items: ActionItem[];
  loading: boolean;
  onIntent: (intent: ActionIntent) => void;
  onOpenTrip: (tripId: string) => void;
  now: number;
}) {
  const [laterOpen, setLaterOpen] = useState(false);
  const [sheet, setSheet] = useState<ActionKind | null>(null);
  const { height } = useWindowDimensions();

  // Only urgent items make the list (the same count the status card shows);
  // everything lower-priority waits, folded, under "Later".
  const urgent = useMemo(() => items.filter((i) => i.urgency === 'now'), [items]);
  const later = useMemo(() => items.filter((i) => i.urgency !== 'now'), [items]);
  const urgentRows = useMemo(() => groupByKind(urgent), [urgent]);
  const laterRows = useMemo(() => groupByKind(later), [later]);

  const sheetItems = sheet ? items.filter((i) => i.kind === sheet).sort(worstFirst) : [];
  // Actions inside the sheet close it first, so the next screen isn't hidden behind it.
  const fromSheet = <T,>(fn: (x: T) => void) => (x: T) => { setSheet(null); setTimeout(() => fn(x), 250); };

  const render = (rows: ReturnType<typeof groupByKind>, firstBorder: boolean) =>
    rows.map((r, i) =>
      r.type === 'item' ? (
        <ActionRow key={r.item.key} item={r.item} first={!firstBorder && i === 0} now={now} onIntent={onIntent} onOpenTrip={onOpenTrip} />
      ) : (
        <GroupRow key={r.kind} kind={r.kind} items={r.items} first={!firstBorder && i === 0} now={now} onPress={() => { tap(); setSheet(r.kind); }} />
      ),
    );

  return (
    <View style={{ gap: 12 }}>
      <View style={s.headRow}>
        <Text style={s.h2}>Needs action</Text>
        {loading ? <ActivityIndicator size="small" color={MUTED} /> : <Text style={s.headCount}>{urgent.length}</Text>}
      </View>

      {urgentRows.length ? (
        <View style={s.group}>{render(urgentRows, false)}</View>
      ) : !loading ? (
        <View style={s.clearRow}>
          <CircleCheckBig size={18} color="#16A34A" strokeWidth={2.2} />
          <Text style={s.clearText}>Nothing urgent right now</Text>
        </View>
      ) : null}

      {later.length ? (
        <View style={s.group}>
          <TouchableOpacity style={s.laterHead} onPress={() => { tap(); setLaterOpen((v) => !v); }} activeOpacity={0.6}>
            <View style={{ flex: 1 }}>
              <Text style={s.laterTitle}>Later</Text>
              <Text style={s.laterSub}>Photos, documents and invoices that can wait</Text>
            </View>
            <Text style={s.laterCount}>{later.length}</Text>
            <ChevronDown size={18} color={MUTED} style={laterOpen ? { transform: [{ rotate: '180deg' }] } : undefined} />
          </TouchableOpacity>
          {laterOpen ? render(laterRows, true) : null}
        </View>
      ) : null}

      <AppModal
        visible={sheet != null}
        onClose={() => setSheet(null)}
        type="bottom-sheet"
        title={sheet ? `${sheetItems.length} ${GROUP_NOUN[sheet][1]}` : ''}
      >
        <ScrollView style={{ maxHeight: height * 0.65 }} showsVerticalScrollIndicator={false}>
          {sheetItems.map((item, i) => (
            <ActionRow key={item.key} item={item} first={i === 0} now={now} flat onIntent={fromSheet(onIntent)} onOpenTrip={fromSheet(onOpenTrip)} />
          ))}
        </ScrollView>
      </AppModal>
    </View>
  );
}

/** Several items of one kind as a single row: "9 trips delayed · worst TRP-0267, 3d late". */
function GroupRow({ kind, items, first, now, onPress }: { kind: ActionKind; items: ActionItem[]; first: boolean; now: number; onPress: () => void }) {
  const k = KIND[kind];
  const Icon = k.icon;
  const worst = items[0];
  const when = whenLabel(worst, now);
  const ref = worst.title.split(' ')[0];
  return (
    <TouchableOpacity style={[s.row, !first && s.rowBorder]} onPress={onPress} activeOpacity={0.6} accessibilityRole="button">
      <View style={s.icon}><Icon size={18} color={k.fg} strokeWidth={2.2} /></View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.title}>{items.length} {GROUP_NOUN[kind][1]}</Text>
        {when ? (
          <Text style={s.detail}>
            Worst: {ref} · <Text style={when.hot ? { color: RED, fontWeight: '600' } : undefined}>{when.text}</Text>
          </Text>
        ) : <Text style={s.detail}>Tap to see all</Text>}
      </View>
      <ChevronRight size={18} color="#A1A1AA" style={{ alignSelf: 'center' }} />
    </TouchableOpacity>
  );
}

function ActionRow({ item, first, now, flat, onIntent, onOpenTrip }: { item: ActionItem; first: boolean; now: number; flat?: boolean; onIntent: (i: ActionIntent) => void; onOpenTrip: (id: string) => void }) {
  const k = KIND[item.kind];
  const Icon = k.icon;
  const when = whenLabel(item, now);
  const call = item.secondary?.intent.type === 'call' ? item.secondary : null;
  const other = item.secondary && !call ? item.secondary : null;
  const openRow = () => (item.tripId ? onOpenTrip(item.tripId) : onIntent(item.primary.intent));

  return (
    <TouchableOpacity style={[s.row, !first && s.rowBorder, flat && { paddingHorizontal: 0 }]} onPress={openRow} activeOpacity={0.6}>
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
  const nowMs = Date.now();
  const startsIn = (iso: string | null) => {
    if (!iso) return null;
    const min = Math.round((new Date(iso).getTime() - nowMs) / 60000);
    if (min <= 0) return 'now';
    return min < 60 ? `in ${min} min` : `in ${Math.floor(min / 60)} h${min % 60 && min < 600 ? ` ${min % 60} min` : ''}`;
  };
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
              <View style={{ width: 58 }}>
                <Text style={s.nextTime}>{time(t.planned_start)}</Text>
                {startsIn(t.planned_start) ? <Text style={s.nextIn}>{startsIn(t.planned_start)}</Text> : null}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.nextName} numberOfLines={2}>{niceName(t.customer_name) || '—'}</Text>
                <Text style={s.detailSm} numberOfLines={1}>
                  {t.ref_id}
                  {' · '}
                  {unit.vehicle ? unit.vehicle.plate_number : <Text style={{ color: RED, fontWeight: '600' }}>No truck</Text>}
                  {' · '}
                  {unit.driver ? niceName(unit.driver.name) : <Text style={{ color: RED, fontWeight: '600' }}>No driver</Text>}
                </Text>
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

  skel: { backgroundColor: '#EDEDF0', borderRadius: 6 },
  clearRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: LINE, padding: 16 },
  clearText: { fontSize: 14, fontWeight: '600', color: '#15803D' },
  countPill: { minWidth: 26, height: 22, borderRadius: 11, backgroundColor: '#FEE4E2', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7, alignSelf: 'center' },
  countPillText: { fontSize: 12, fontWeight: '700', color: RED },
  laterHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 14 },
  laterTitle: { fontSize: 15, fontWeight: '600', color: INK },
  laterSub: { fontSize: 12, color: MUTED, marginTop: 1 },
  laterCount: { fontSize: 14, fontWeight: '600', color: MUTED, fontVariant: ['tabular-nums'] },

  day: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, gap: 8, borderTopWidth: 1, borderTopColor: LINE },
  dayTrack: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: '#F1F1F3', gap: 2 },
  dayLegend: { flexDirection: 'row', gap: 14 },
  dayItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dayDot: { width: 7, height: 7, borderRadius: 4 },
  dayText: { fontSize: 12, color: MUTED },
  dayNum: { fontWeight: '700', color: INK, fontVariant: ['tabular-nums'] },

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
  nextTime: { fontSize: 15, fontWeight: '700', color: INK, fontVariant: ['tabular-nums'] },
  nextIn: { fontSize: 11, fontWeight: '600', color: MUTED, marginTop: 1 },
  nextName: { fontSize: 15, fontWeight: '600', color: INK, lineHeight: 20 },
  detailSm: { fontSize: 13, color: MUTED },
  emptyNext: { backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: LINE, padding: 16 },
});

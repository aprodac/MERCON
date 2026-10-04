/**
 * Action-item rows shared by Notifications → To do and Home's emergency strip:
 * a row per item with its buttons and swipe shortcuts, a folded row for
 * several of one kind ("9 trips delayed · worst …"), and the sheet listing
 * them worst first.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ScrollView, useWindowDimensions } from 'react-native';
import { AppModal } from '@mercon/mobile-shared/components/common/AppModal';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import {
  AlarmClock, ChevronRight, Clock3, FileClock, Images, Phone, Play, Receipt, MapPinOff, Siren, Split, UserX,
  type LucideIcon,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { resolveMediaUrl } from '@mercon/mobile-shared/lib/media';
import { whenLabel, type ActionIntent, type ActionItem, type ActionKind } from './actionModel';

const INK = '#3E3C3D';
const MUTED = '#6B6B76';
const LINE = '#E9E9EC';
const RED = '#D92D20';

const tap = () => Haptics.selectionAsync().catch(() => {});

const NEUTRAL = '#F4F4F5';
const SEV = { red: '#D92D20', amber: '#B54708', gray: '#52525B' };
export const KIND: Record<ActionKind, { icon: LucideIcon; fg: string }> = {
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
export const GROUP_NOUN: Record<ActionKind, [string, string]> = {
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
export const worstFirst = (a: ActionItem, b: ActionItem) =>
  (a.at ? new Date(a.at).getTime() : Infinity) - (b.at ? new Date(b.at).getTime() : Infinity);

/** One entry per kind, keeping the list's urgency order: a single item stays a row, several become a group. */
export function groupByKind(items: ActionItem[]): ({ type: 'item'; item: ActionItem } | { type: 'group'; kind: ActionKind; items: ActionItem[] })[] {
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


// ── 2 · Needs action ──────────────────────────────────────────────────────────

/** Every item of one kind, worst first, in a bottom sheet. Actions close the sheet first so the next screen isn't hidden behind it. */
export function KindSheet({ kind, items, now, onClose, onIntent, onOpenTrip }: {
  kind: ActionKind | null;
  items: ActionItem[];
  now: number;
  onClose: () => void;
  onIntent: (intent: ActionIntent) => void;
  onOpenTrip: (tripId: string) => void;
}) {
  const { height } = useWindowDimensions();
  const sheetItems = kind ? items.filter((i) => i.kind === kind).sort(worstFirst) : [];
  const fromSheet = <T,>(fn: (x: T) => void) => (x: T) => { onClose(); setTimeout(() => fn(x), 250); };
  return (
    <AppModal
      visible={kind != null}
      onClose={onClose}
      type="bottom-sheet"
      title={kind ? `${sheetItems.length} ${GROUP_NOUN[kind][sheetItems.length === 1 ? 0 : 1]}` : ''}
    >
      {/* A modal is its own native window, so swipe gestures need their own root inside it. */}
      {/* flex: 0 — the root view defaults to flex: 1, which collapses to nothing in a sheet sized by its content. */}
      <GestureHandlerRootView style={{ flex: 0 }}>
        <ScrollView style={{ maxHeight: height * 0.65 }} showsVerticalScrollIndicator={false}>
          {sheetItems.map((item, i) => (
            <ActionRow key={item.key} item={item} first={i === 0} now={now} flat onIntent={fromSheet(onIntent)} onOpenTrip={fromSheet(onOpenTrip)} />
          ))}
        </ScrollView>
      </GestureHandlerRootView>
    </AppModal>
  );
}

/** Several items of one kind as a single row: "9 trips delayed · worst TRP-0267, 3d late". */
export function GroupRow({ kind, items, first, now, onPress }: { kind: ActionKind; items: ActionItem[]; first: boolean; now: number; onPress: () => void }) {
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

type RowProps = { item: ActionItem; first: boolean; now: number; flat?: boolean; onIntent: (i: ActionIntent) => void; onOpenTrip: (id: string) => void };

/**
 * A row with swipe shortcuts: swipe right to call the driver, left for the
 * row's main action (Notify, Assign, Send…). The same buttons stay on the row,
 * so swiping is only ever a shortcut.
 */
export function ActionRow(props: RowProps) {
  const { item, onIntent } = props;
  const call = item.secondary?.intent.type === 'call' ? item.secondary : null;
  const run = (intent: ActionIntent, m: SwipeableMethods) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    m.close();
    onIntent(intent);
  };
  return (
    <ReanimatedSwipeable
      friction={1.6}
      overshootLeft={false}
      overshootRight={false}
      leftThreshold={60}
      rightThreshold={60}
      renderLeftActions={call ? (_p, _t, m) => (
        <TouchableOpacity style={[s.swipe, { backgroundColor: '#16A34A' }]} onPress={() => run(call.intent, m)} accessibilityLabel="Call driver">
          <Phone size={18} color="#FFFFFF" strokeWidth={2.2} />
          <Text style={s.swipeText}>Call</Text>
        </TouchableOpacity>
      ) : undefined}
      renderRightActions={(_p, _t, m) => (
        <TouchableOpacity style={[s.swipe, { backgroundColor: INK }]} onPress={() => run(item.primary.intent, m)}>
          <Text style={s.swipeText}>{item.primary.label}</Text>
        </TouchableOpacity>
      )}
    >
      <View style={{ backgroundColor: Colors.white }}><ActionRowBody {...props} /></View>
    </ReanimatedSwipeable>
  );
}

function ActionRowBody({ item, first, now, flat, onIntent, onOpenTrip }: RowProps) {
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

  swipe: { width: 92, alignItems: 'center', justifyContent: 'center', gap: 4 },
  swipeText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },

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

/**
 * Home's top card: how today is going (a ring of done / on the road / to
 * start) and, below it in the same card, what needs you — one tile per kind
 * that has something in it (never a 0 tile), most important first, so the
 * order changes as things happen. Three show; "Show more" opens up to six.
 * A tile opens that kind's own page; the header opens Notifications → To do.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, LayoutAnimation } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { ChevronDown, ChevronRight, CircleCheckBig } from 'lucide-react-native';
import type { ActionKind, Urgency } from '../actions/actionModel';
import { KIND } from '../actions/NeedsAction';
import { tap } from '../../notifications/components/parts';
import { TILE_LABEL, type NeedTile } from './needsTiles';

const INK = '#3E3C3D';
const COLORS = { done: '#4ADE80', running: '#FA634E', toStart: 'rgba(255,255,255,0.28)' };
const SIZE = 104;
const STROKE = 12;
const FIRST = 3;
const MOST = 6;
const URGENCIES: Urgency[] = ['now', 'today', 'watch'];
/** A tile's colour comes from its most urgent item: red now, amber today, quiet for later. */
const TILE: Record<Urgency, { bg: string; fg: string }> = {
  now: { bg: 'rgba(217,45,32,0.30)', fg: '#FECACA' },
  today: { bg: 'rgba(245,158,11,0.20)', fg: '#FDE68A' },
  watch: { bg: 'rgba(255,255,255,0.08)', fg: 'rgba(255,255,255,0.72)' },
};
const BAR: Record<Urgency, string> = { now: '#F04438', today: '#F59E0B', watch: 'rgba(255,255,255,0.25)' };

function Ring({ done, running, toStart }: { done: number; running: number; toStart: number }) {
  const total = done + running + toStart;
  const r = (SIZE - STROKE) / 2;
  const c = 2 * Math.PI * r;
  const GAP = total > 1 ? 4 : 0;
  let offset = 0;
  const parts = [
    { key: 'done', n: done, color: COLORS.done },
    { key: 'running', n: running, color: COLORS.running },
    { key: 'toStart', n: toStart, color: COLORS.toStart },
  ].filter((p) => p.n > 0).map((p) => {
    const len = (p.n / total) * c;
    const seg = { ...p, dash: `${Math.max(len - GAP, 1)} ${c}`, offset: -offset };
    offset += len;
    return seg;
  });
  return (
    <View style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
      {/* Rotated so the ring starts at 12 o'clock (on a wrapper — react-native-svg's web build mishandles a transform style). */}
      <View style={[StyleSheet.absoluteFill, { transform: [{ rotate: '-90deg' }] }]}>
      <Svg width={SIZE} height={SIZE}>
        <Circle cx={SIZE / 2} cy={SIZE / 2} r={r} stroke="rgba(255,255,255,0.12)" strokeWidth={STROKE} fill="none" />
        {parts.map((p) => (
          <Circle
            key={p.key}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={r}
            stroke={p.color}
            strokeWidth={STROKE}
            fill="none"
            strokeDasharray={p.dash}
            strokeDashoffset={p.offset}
            strokeLinecap="butt"
          />
        ))}
      </Svg>
      </View>
      <Text style={s.ringNum}>{total}</Text>
      <Text style={s.ringSub}>{total === 1 ? 'trip today' : 'trips today'}</Text>
    </View>
  );
}

export function TodayCard({ done, running, toStart, needs, loading, onTrips, onTodo, onKind }: {
  done: number | null;
  running: number;
  toStart: number;
  /** From needTiles(): only kinds with items, most important first. */
  needs: NeedTile[];
  loading: boolean;
  onTrips: (view: 'now' | 'schedule' | 'history') => void;
  onTodo: () => void;
  onKind: (kind: ActionKind) => void;
}) {
  const [open, setOpen] = useState(false);
  const rows = [
    { key: 'done', label: 'Done', n: done, color: COLORS.done, onPress: () => onTrips('history') },
    { key: 'running', label: 'On the road', n: running, color: COLORS.running, onPress: () => onTrips('now') },
    { key: 'toStart', label: 'To start', n: toStart, color: COLORS.toStart, onPress: () => onTrips('schedule') },
  ];
  const total = needs.reduce((n, t) => n + t.count, 0);
  const split = URGENCIES.map((u) => ({ u, n: needs.reduce((n, t) => n + t.byUrgency[u], 0) })).filter((x) => x.n > 0);
  const urgent = split.find((x) => x.u === 'now')?.n ?? 0;
  const shown = needs.slice(0, open ? MOST : FIRST);
  const more = Math.min(needs.length, MOST) - FIRST;
  const toggle = () => {
    tap();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((o) => !o);
  };

  return (
    <View style={s.card}>
      <View style={s.top}>
        {loading ? <View style={[s.skel, { width: SIZE, height: SIZE, borderRadius: SIZE / 2 }]} /> : <Ring done={done ?? 0} running={running} toStart={toStart} />}
        <View style={{ flex: 1, gap: 4 }}>
          {rows.map((r) => (
            <TouchableOpacity key={r.key} style={s.legendRow} onPress={() => { tap(); r.onPress(); }} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel={`${r.n ?? 0} ${r.label}`}>
              <View style={[s.dot, { backgroundColor: r.color }]} />
              <Text style={s.legendLabel}>{r.label}</Text>
              <Text style={s.legendNum}>{loading || r.n == null ? '–' : r.n}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={s.needs}>
        <TouchableOpacity style={s.needsHead} onPress={() => { tap(); onTodo(); }} activeOpacity={0.6} accessibilityRole="button">
          {total === 0 ? <CircleCheckBig size={16} color={COLORS.done} strokeWidth={2.4} /> : null}
          <Text style={s.needsTitle}>
            {total === 0 ? 'Nothing needs you right now' : `${total} ${total === 1 ? 'thing needs' : 'things need'} you`}
          </Text>
          {urgent > 0 ? (
            <View style={s.urgent}>
              <View style={s.urgentDot} />
              <Text style={s.urgentText}>{urgent} urgent</Text>
            </View>
          ) : <Text style={s.needsLink}>To do</Text>}
          <ChevronRight size={16} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>

        {split.length > 1 ? (
          <View style={s.bar}>
            {split.map((x) => <View key={x.u} style={{ flex: x.n, backgroundColor: BAR[x.u] }} />)}
          </View>
        ) : null}

        {shown.length ? (
          <View style={s.tiles}>
            {shown.map((t) => {
              const tone = TILE[t.urgency];
              const Icon = KIND[t.kind].icon;
              return (
                <TouchableOpacity
                  key={t.kind}
                  style={[s.tile, { backgroundColor: tone.bg }]}
                  onPress={() => { tap(); onKind(t.kind); }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${t.count} ${TILE_LABEL[t.kind]}`}
                >
                  <View style={s.tileTop}>
                    <Text style={s.tileNum}>{t.count}</Text>
                    <Icon size={15} color={tone.fg} strokeWidth={2.3} />
                  </View>
                  <Text style={[s.tileLabel, { color: tone.fg }]} numberOfLines={2}>{TILE_LABEL[t.kind]}</Text>
                </TouchableOpacity>
              );
            })}
            {/* Keep a part-filled last row's tiles the same width as the rest. */}
            {Array.from({ length: (3 - (shown.length % 3)) % 3 }, (_, i) => <View key={`pad${i}`} style={s.tilePad} />)}
          </View>
        ) : null}

        {more > 0 ? (
          <TouchableOpacity style={s.more} onPress={toggle} activeOpacity={0.6} accessibilityRole="button" accessibilityState={{ expanded: open }}>
            <Text style={s.moreText}>{open ? 'Show less' : `Show ${more} more`}</Text>
            <View style={open ? { transform: [{ rotate: '180deg' }] } : undefined}>
              <ChevronDown size={15} color="rgba(255,255,255,0.7)" />
            </View>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: INK, borderRadius: 26, padding: 18, gap: 16 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  ringNum: { fontSize: 26, fontWeight: '800', color: '#FFFFFF', letterSpacing: -1, fontVariant: ['tabular-nums'] },
  ringSub: { fontSize: 11, color: 'rgba(255,255,255,0.7)' },
  skel: { backgroundColor: 'rgba(255,255,255,0.1)' },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { flex: 1, fontSize: 14, color: 'rgba(255,255,255,0.82)' },
  legendNum: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', fontVariant: ['tabular-nums'] },

  needs: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)', paddingTop: 14, gap: 10 },
  needsHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  needsTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  needsLink: { fontSize: 13, color: 'rgba(255,255,255,0.7)' },
  urgent: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  urgentDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#F04438' },
  urgentText: { fontSize: 13, fontWeight: '600', color: '#FECACA' },
  bar: { flexDirection: 'row', height: 5, borderRadius: 3, overflow: 'hidden', gap: 2 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { flexGrow: 1, flexBasis: '30%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, gap: 2 },
  tilePad: { flexGrow: 1, flexBasis: '30%' },
  tileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tileNum: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', fontVariant: ['tabular-nums'] },
  tileLabel: { fontSize: 12, fontWeight: '600', lineHeight: 16 },
  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, height: 28 },
  moreText: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.75)' },
});

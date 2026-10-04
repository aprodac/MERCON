/**
 * Home's top card: how today is going (a ring of done / on the road / to
 * start) and, below it in the same card, how many things need you — split
 * into delayed, without a driver or truck, and photos to send, each opening
 * Notifications → To do on the matching chip.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { ChevronRight } from 'lucide-react-native';
import { tap } from '../../notifications/components/parts';

const INK = '#3E3C3D';
const COLORS = { done: '#4ADE80', running: '#FA634E', toStart: 'rgba(255,255,255,0.28)' };
const SIZE = 104;
const STROKE = 12;

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

export function TodayCard({ done, running, toStart, needs, loading, onTrips, onTodo }: {
  done: number | null;
  running: number;
  toStart: number;
  needs: { total: number; delayed: number; unassigned: number; photos: number };
  loading: boolean;
  onTrips: (view: 'now' | 'schedule' | 'history') => void;
  onTodo: (filter?: 'trips' | 'whatsapp') => void;
}) {
  const rows = [
    { key: 'done', label: 'Done', n: done, color: COLORS.done, onPress: () => onTrips('history') },
    { key: 'running', label: 'On the road', n: running, color: COLORS.running, onPress: () => onTrips('now') },
    { key: 'toStart', label: 'To start', n: toStart, color: COLORS.toStart, onPress: () => onTrips('schedule') },
  ];
  const tiles = [
    { key: 'delayed', label: 'Delayed', n: needs.delayed, hot: true, filter: 'trips' as const },
    { key: 'unassigned', label: 'No driver or truck', n: needs.unassigned, hot: true, filter: 'trips' as const },
    { key: 'photos', label: 'Photos to send', n: needs.photos, hot: false, filter: 'whatsapp' as const },
  ];

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
          <Text style={s.needsTitle}>
            {needs.total === 0 ? 'Nothing needs you right now' : `${needs.total} ${needs.total === 1 ? 'thing needs' : 'things need'} you`}
          </Text>
          <Text style={s.needsLink}>To do</Text>
          <ChevronRight size={16} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
        <View style={s.tiles}>
          {tiles.map((t) => {
            const on = t.n > 0;
            return (
              <TouchableOpacity
                key={t.key}
                style={[s.tile, on && t.hot ? s.tileHot : null]}
                onPress={() => { tap(); onTodo(t.filter); }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${t.n} ${t.label}`}
              >
                <Text style={[s.tileNum, !on && { color: 'rgba(255,255,255,0.45)' }]}>{t.n}</Text>
                <Text style={[s.tileLabel, on && t.hot && { color: '#FECACA' }]} numberOfLines={2}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
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
  needsHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  needsTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  needsLink: { fontSize: 13, color: 'rgba(255,255,255,0.7)' },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: 'rgba(255,255,255,0.08)', gap: 2 },
  tileHot: { backgroundColor: 'rgba(217,45,32,0.28)' },
  tileNum: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', fontVariant: ['tabular-nums'] },
  tileLabel: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.72)', lineHeight: 16 },
});

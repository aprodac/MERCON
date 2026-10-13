/**
 * Home's header: a charcoal band across the top of the screen (under the top
 * bar, which sits on the same charcoal) with the greeting, how today is going
 * and what needs you.
 *   counts     done / on the road / to start; each opens that Trips view
 *   day strip  midnight → midnight in the deployment timezone, a bar per trip
 *              on the road (planned start → planned end), a dot per trip still
 *              to start, and a "now" line
 *   next up    one line on what happens next today
 *   needs you  one tile per kind that has something in it (never a 0 tile),
 *              most important first, so the order changes as things happen.
 *              Three show; "Show more" opens up to six. A tile opens that
 *              kind's own page; the header opens Notifications → To do.
 * Drawn in code only (no images): faint coral stripes echo the MERCON mark.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, LayoutAnimation } from 'react-native';
import { ChevronDown, ChevronRight, CircleCheckBig } from 'lucide-react-native';
import type { ActionKind, ActionSources, Urgency } from '../actions/actionModel';
import type { LiveUnit } from '../../../lib/operator';
import { KIND } from '../actions/NeedsAction';
import { tap } from '../../notifications/components/parts';
import { TILE_LABEL, type NeedTile } from './needsTiles';
import { dayStrip, nextUp } from './today';

const INK = '#3E3C3D';
const COLORS = { done: '#4ADE80', running: '#FA634E', late: '#F04438', toStart: 'rgba(255,255,255,0.45)' };
const CORAL = '#FA634E';
const TICKS = ['00', '06', '12', '18', '24'];
/** The MERCON mark's stripes, as fractions of the widest. */
const STRIPES = [1, 0.9, 0.8, 0.68, 0.54];
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

/** The MERCON mark's stripes, faint, in the top-right corner. */
function Backdrop() {
  return (
    <View style={s.stripes} pointerEvents="none">
      {STRIPES.map((w, i) => <View key={i} style={[s.stripe, { width: 120 * w }]} />)}
    </View>
  );
}

function DayStrip({ bars, dots, now }: ReturnType<typeof dayStrip>) {
  const pct = (min: number) => `${(Math.min(Math.max(min, 0), 1440) / 1440) * 100}%` as const;
  return (
    <View style={s.strip} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={s.track} />
      {bars.map((b) => (
        <View key={b.key} style={[s.tripBar, { left: pct(b.from), width: pct(b.to - b.from), backgroundColor: b.late ? COLORS.late : COLORS.running }]} />
      ))}
      {dots.map((d) => <View key={d.key} style={[s.startDot, { left: pct(d.at) }]} />)}
      <View style={[s.now, { left: pct(now) }]} />
      <View style={s.ticks}>{TICKS.map((t) => <Text key={t} style={s.tick}>{t}</Text>)}</View>
    </View>
  );
}

export function TodayCard({ hello, date, units, toStartTrips, tz, now, done, running, toStart, needs, loading, onTrips, onTodo, onKind }: {
  /** "Good morning, Ilan" */
  hello: string;
  /** "Sat, 10 Oct" */
  date: string;
  units: LiveUnit[];
  /** Today's trips still to start, soonest first (toStartToday()). */
  toStartTrips: ActionSources['unassigned'];
  tz: string;
  now: number;
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
  const strip = dayStrip(units, toStartTrips, tz, now);
  const next = nextUp(units, toStartTrips, done ?? 0, tz, now);
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
    <View style={s.header}>
      <Backdrop />
      <View style={s.greet}>
        <Text style={s.date}>{date}</Text>
        <Text style={s.hello} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit>{hello}</Text>
      </View>

      <View style={s.stats}>
        {rows.map((r) => {
          const live = r.key === 'running' && running > 0;
          return (
            <TouchableOpacity key={r.key} style={[s.stat, live && s.statLive]} onPress={() => { tap(); r.onPress(); }} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`${r.n ?? 0} ${r.label}`}>
              {loading ? <View style={s.skel} /> : <Text style={s.statNum}>{r.n == null ? '–' : r.n}</Text>}
              <View style={s.statFoot}>
                <View style={[s.dot, { backgroundColor: r.color }]} />
                <Text style={s.statLabel} numberOfLines={1}>{r.label}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={{ gap: 10 }}>
        <DayStrip {...strip} />
        {loading ? null : (
          <Text style={s.next} numberOfLines={2}>
            <Text style={s.nextLead}>{next.lead}</Text>{next.rest ? ` ${next.rest}` : ''}
          </Text>
        )}
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
  // Bleeds past the page padding to the screen edges; the screen paints the same charcoal behind the top bar.
  header: { backgroundColor: INK, marginHorizontal: -16, marginTop: -8, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 18, gap: 18, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, overflow: 'hidden' },
  stripes: { position: 'absolute', top: 14, right: -8, gap: 5, alignItems: 'flex-end', opacity: 0.16 },
  stripe: { height: 7, borderRadius: 4, backgroundColor: CORAL },
  greet: { gap: 2 },
  date: { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.62)' },
  hello: { fontSize: 27, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.6 },

  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10, gap: 4, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  statLive: { backgroundColor: 'rgba(250,99,78,0.20)', borderColor: 'rgba(250,99,78,0.45)' },
  statNum: { fontSize: 26, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.8, fontVariant: ['tabular-nums'] },
  statFoot: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statLabel: { flexShrink: 1, fontSize: 12, color: 'rgba(255,255,255,0.75)' },
  skel: { width: 28, height: 31, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.1)' },
  dot: { width: 8, height: 8, borderRadius: 4 },

  strip: { height: 30 },
  track: { position: 'absolute', left: 0, right: 0, top: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.12)' },
  tripBar: { position: 'absolute', top: 4, height: 10, borderRadius: 5 },
  startDot: { position: 'absolute', top: 3, width: 12, height: 12, marginLeft: -6, borderRadius: 6, borderWidth: 2, borderColor: '#FFFFFF', backgroundColor: INK },
  now: { position: 'absolute', top: 0, width: 2, height: 18, marginLeft: -1, borderRadius: 1, backgroundColor: '#FFFFFF' },
  ticks: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', justifyContent: 'space-between' },
  tick: { fontSize: 10, color: 'rgba(255,255,255,0.45)', fontVariant: ['tabular-nums'] },
  next: { fontSize: 13, lineHeight: 18, color: 'rgba(255,255,255,0.72)' },
  nextLead: { fontWeight: '700', color: '#FFFFFF' },

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

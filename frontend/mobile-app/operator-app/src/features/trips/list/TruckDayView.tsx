/**
 * Schedule → "By truck": one row per truck, its trips that day as bars on a
 * 24-hour line, so double bookings and tight gaps show at a glance (TestFlight
 * feedback kept reporting "Overlapped"). A bar in red overlaps another trip of
 * the same truck or driver; trips without a truck sit in their own row.
 */
import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import type { OperatorTrip } from '../../../lib/operator';
import { PHASE_STYLE, phaseOf, plateOf, type TimeFmt } from './tripListModel';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const LANE = 26;

export function TruckDayView({ trips, dayKey, f, clashes, onOpen }: {
  trips: OperatorTrip[];
  dayKey: string;
  f: TimeFmt;
  /** Trip id → "Overlaps TRP-x · same truck". */
  clashes: Map<string, string>;
  onOpen: (t: OperatorTrip) => void;
}) {
  const dayStart = useMemo(() => f.startOfDay(dayKey).getTime(), [f, dayKey]);
  const rows = useMemo(() => {
    const span = (t: OperatorTrip) => {
      const a = Date.parse(t.planned_start ?? '');
      return [a, t.planned_end ? Date.parse(t.planned_end) : a + 4 * HOUR] as const;
    };
    const m = new Map<string, OperatorTrip[]>();
    for (const t of trips) {
      if (!t.planned_start) continue;
      const [a, b] = span(t);
      if (a >= dayStart + DAY || b <= dayStart) continue; // not on this day
      const key = plateOf(t) ?? 'No truck yet';
      m.set(key, [...(m.get(key) ?? []), t]);
    }
    return [...m.entries()]
      .sort(([x], [y]) => (x === 'No truck yet' ? 1 : y === 'No truck yet' ? -1 : x.localeCompare(y)))
      .map(([plate, list]) => {
        // Overlapping trips of one truck go on separate lines, so neither hides the other.
        const laneEnds: number[] = [];
        const bars = [...list].sort((x, y) => span(x)[0] - span(y)[0]).map((t) => {
          const [a, b] = span(t);
          let lane = laneEnds.findIndex((end) => end <= a);
          if (lane < 0) { lane = laneEnds.length; laneEnds.push(b); } else laneEnds[lane] = b;
          const from = Math.max(0, (a - dayStart) / DAY);
          const to = Math.min(1, (b - dayStart) / DAY);
          return { t, lane, left: from, width: Math.max(0.03, to - from), startsBefore: a < dayStart, endsAfter: b > dayStart + DAY };
        });
        return { plate, bars, lanes: Math.max(1, laneEnds.length) };
      });
  }, [trips, dayStart]);

  if (rows.length === 0) return <Text style={s.empty}>No trucks booked this day.</Text>;
  return (
    <View style={s.card}>
      <View style={s.scale}>
        <View style={s.plateCol} />
        <View style={s.axis}>
          {[0, 6, 12, 18].map((h) => <Text key={h} style={[s.tick, { left: `${(h / 24) * 100}%` }]}>{String(h).padStart(2, '0')}</Text>)}
        </View>
      </View>
      {rows.map((r) => (
        <View key={r.plate} style={[s.row, { height: 8 + r.lanes * LANE }]}>
          <Text style={s.plate} numberOfLines={1}>{r.plate}</Text>
          <View style={[s.track, { height: 2 + r.lanes * LANE }]}>
            {[6, 12, 18].map((h) => <View key={h} style={[s.grid, { left: `${(h / 24) * 100}%` }]} />)}
            {r.bars.map(({ t, lane, left, width, startsBefore, endsAfter }) => {
              const clash = clashes.has(t.id);
              const ph = PHASE_STYLE[phaseOf(t.status)];
              return (
                <TouchableOpacity
                  key={t.id}
                  onPress={() => onOpen(t)}
                  activeOpacity={0.8}
                  accessibilityLabel={`${t.ref_id ?? 'Trip'} ${f.time(t.planned_start)}${clash ? `, ${clashes.get(t.id)}` : ''}`}
                  style={[s.bar, { top: 3 + lane * LANE, height: LANE - 4, left: `${left * 100}%`, width: `${width * 100}%`, backgroundColor: clash ? '#FDE2DF' : ph.bg, borderColor: clash ? '#D92D20' : ph.dot },
                    startsBefore && { borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }, endsAfter && { borderTopRightRadius: 0, borderBottomRightRadius: 0 }]}
                >
                  <Text style={[s.barText, { color: clash ? '#912018' : ph.fg }]} numberOfLines={1}>{t.ref_id?.replace('TRP-', '') ?? ''} {f.time(t.planned_start)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ))}
      {rows.some((r) => r.bars.some((b) => clashes.has(b.t.id))) ? (
        <Text style={s.legend}>Red = overlaps another trip of the same truck or driver. Tap a bar to open the trip.</Text>
      ) : <Text style={s.legend}>Tap a bar to open the trip.</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: Colors.white, borderRadius: 16, padding: 12, gap: 6 },
  scale: { flexDirection: 'row', alignItems: 'center', height: 16 },
  plateCol: { width: 76 },
  axis: { flex: 1, height: 16 },
  tick: { position: 'absolute', fontSize: 10, color: '#9898A4', fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', alignItems: 'center' },
  plate: { width: 76, fontSize: 12, fontWeight: '700', color: '#3E3C3D' },
  track: { flex: 1, backgroundColor: '#F4F5F8', borderRadius: 8, overflow: 'hidden' },
  grid: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: '#E4E7EE' },
  bar: { position: 'absolute', borderRadius: 6, borderWidth: 1, paddingHorizontal: 4, justifyContent: 'center' },
  barText: { fontSize: 10, fontWeight: '700' },
  legend: { fontSize: 11, color: '#6E6E80', marginTop: 4 },
  empty: { fontSize: 13, color: '#6E6E80', textAlign: 'center', paddingVertical: 20 },
});

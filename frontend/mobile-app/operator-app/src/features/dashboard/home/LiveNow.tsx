/**
 * "Live now": the fleet map and the trips on the road in one card. Late
 * trips first, then trucks with no GPS, then the rest; each row shows the
 * truck, customer, how far along its stops it is, the driver and the next
 * stop with its planned time. The map opens the full Fleet map; a row opens
 * the trip.
 */
import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronRight, Maximize2 } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import type { LiveUnit } from '../../../lib/operator';
import { FleetMap } from '../../fleet/FleetMap';
import { isDelayed, isSilent } from '../../fleet/fleetModel';
import { niceName } from '../../trips/create/components/ui';
import { durationText } from '../actions/actionModel';
import { INK, LINE, MUTED, tap } from '../../notifications/components/parts';

const RED = '#D92D20';
const AMBER = '#B54708';
const GREEN = '#15803D';
const SHOWN = 3;

const short = (min: number) => durationText(min).replace(' days', 'd').replace(' h', 'h').replace(' min', 'm');

type Row = { unit: LiveUnit; trip: NonNullable<LiveUnit['trip']>; rank: number };

function statusOf(u: LiveUnit, t: Row['trip'], now: number): { text: string; color: string } {
  const next = t.next_stop_index != null ? t.stops[t.next_stop_index] : null;
  if (isDelayed(u)) {
    const due = next?.planned_arrival ? new Date(next.planned_arrival).getTime() : null;
    return { text: due && due < now ? `${short((now - due) / 60000)} late` : 'Delayed', color: RED };
  }
  if (isSilent(u, now)) {
    const seen = u.position?.recorded_at ? new Date(u.position.recorded_at).getTime() : null;
    return { text: seen ? `No GPS ${short((now - seen) / 60000)}` : 'No GPS', color: AMBER };
  }
  return { text: 'On time', color: GREEN };
}

export function LiveNow({ units, tz, now, onOpenMap, onOpenTrip, onAll }: {
  units: LiveUnit[];
  tz: string;
  now: number;
  onOpenMap: () => void;
  onOpenTrip: (id: string) => void;
  onAll: () => void;
}) {
  const onRoad = useMemo(() => units.filter((u) => u.trip && u.trip.phase !== 'upcoming'), [units]);
  const rows = useMemo<Row[]>(
    () => onRoad
      .map((u) => ({ unit: u, trip: u.trip!, rank: isDelayed(u) ? 0 : isSilent(u, now) ? 1 : 2 }))
      .sort((a, b) => a.rank - b.rank),
    [onRoad, now],
  );
  const time = (iso: string | null) => {
    if (!iso) return null;
    try {
      return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
    } catch {
      return null;
    }
  };

  return (
    <View style={{ gap: 10 }}>
      <View style={s.head}>
        <Text style={s.h2}>Live now</Text>
        {onRoad.length ? (
          <TouchableOpacity onPress={() => { tap(); onAll(); }} hitSlop={8} style={s.link}>
            <Text style={s.linkText}>All {onRoad.length} on the road</Text>
            <ChevronRight size={15} color={MUTED} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={s.card}>
        <TouchableOpacity style={s.map} onPress={() => { tap(); onOpenMap(); }} activeOpacity={0.9} accessibilityRole="button" accessibilityLabel="Open fleet map">
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <FleetMap units={onRoad} padding={{ top: 24, bottom: 24 }} />
          </View>
          <View style={s.expand} pointerEvents="none"><Maximize2 size={15} color={INK} strokeWidth={2.2} /></View>
        </TouchableOpacity>

        {rows.length === 0 ? (
          <View style={s.empty}><Text style={s.emptyText}>No trucks on the road right now</Text></View>
        ) : (
          rows.slice(0, SHOWN).map(({ unit: u, trip: t }) => {
            const st = statusOf(u, t, now);
            const total = t.stops.length;
            const passed = t.stops.filter((x) => x.actual_departure || x.actual_arrival).length;
            const pct = total ? Math.max(6, Math.round((passed / total) * 100)) : 6;
            const next = t.next_stop_index != null ? t.stops[t.next_stop_index] : null;
            const nextText = next?.name ? `Next: ${niceName(next.name)}${time(next.planned_arrival) ? ` · ${time(next.planned_arrival)}` : ''}` : '';
            return (
              <TouchableOpacity key={t.id} style={s.row} onPress={() => { tap(); onOpenTrip(t.id); }} activeOpacity={0.7}
                accessibilityRole="button" accessibilityLabel={`${u.vehicle?.plate_number ?? t.ref_id}, ${niceName(t.customer_name)}, ${st.text}`}>
                <View style={s.rowTop}>
                  <Text style={s.plate} numberOfLines={1}>{u.vehicle?.plate_number ?? t.ref_id ?? 'Trip'}</Text>
                  <Text style={s.customer} numberOfLines={1}>· {niceName(t.customer_name) || t.ref_id}</Text>
                  <Text style={[s.status, { color: st.color }]}>{st.text}</Text>
                </View>
                <View style={s.track}><View style={[s.fill, { width: `${pct}%`, backgroundColor: st.color === RED ? RED : INK }]} /></View>
                <View style={s.rowBottom}>
                  <Text style={s.meta} numberOfLines={1}>{u.driver ? niceName(u.driver.name) : 'No driver'}</Text>
                  <Text style={s.meta} numberOfLines={1}>{nextText}</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  h2: { fontSize: 17, fontWeight: '700', color: INK, letterSpacing: -0.2 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  linkText: { fontSize: 14, fontWeight: '500', color: MUTED },

  card: { backgroundColor: Colors.white, borderRadius: 22, borderWidth: 1, borderColor: LINE, overflow: 'hidden' },
  map: { height: 160, backgroundColor: '#EFEFF1' },
  expand: {
    position: 'absolute', right: 10, bottom: 10, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  empty: { padding: 16 },
  emptyText: { fontSize: 14, color: MUTED },

  row: { paddingHorizontal: 16, paddingVertical: 13, gap: 7, borderTopWidth: 1, borderTopColor: '#F1F1F3' },
  rowTop: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  plate: { fontSize: 15, fontWeight: '700', color: INK },
  customer: { flex: 1, fontSize: 13, color: MUTED },
  status: { fontSize: 12, fontWeight: '700' },
  track: { height: 5, borderRadius: 3, backgroundColor: '#F1F1F3', overflow: 'hidden' },
  fill: { height: 5, borderRadius: 3 },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  meta: { fontSize: 12, color: MUTED, flexShrink: 1 },
});

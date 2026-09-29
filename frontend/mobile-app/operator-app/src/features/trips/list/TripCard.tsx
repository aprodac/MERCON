/**
 * One trip as a compact list row (no card box — rows are separated by hairlines).
 * The four lines follow the web dashboard's Trips table, in the same order:
 *   Trip ID · Planned start · Status
 *   Customer
 *   Route
 *   Driver / Vehicle
 * The status color runs down the left edge. Nothing is truncated; long names
 * wrap. Long-press for quick actions (call, WhatsApp, change driver, …).
 */
import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import type { OperatorTrip } from '../../../lib/operator';
import { niceName } from '../create/components/ui';
import {
  PHASE_STYLE, delayReasonOf, driverNameOf, phaseOf, plateOf, routeOf, statusText,
  type TimeFmt,
} from './tripListModel';

const INK = '#18181B';
const MUTED = '#71717A';
const RED = '#B42318';

interface Props {
  trip: OperatorTrip;
  f: TimeFmt;
  now: number;
  /** Show the day as well as the time (search results, the Now board). */
  showDay?: boolean;
  onPress: (t: OperatorTrip) => void;
  onLongPress: (t: OperatorTrip) => void;
}

function TripCardBase({ trip: t, f, now, showDay, onPress, onLongPress }: Props) {
  const phase = phaseOf(t.status);
  const ps = PHASE_STYLE[phase];
  const route = routeOf(t);
  const driver = driverNameOf(t);
  const plate = plateOf(t);
  const done = phase === 'done';
  const muted = phase === 'cancelled';
  const open = phase === 'draft' || phase === 'planned' || phase === 'running' || phase === 'delayed';
  const reason = phase === 'delayed' ? delayReasonOf(t) : null;

  const when = done && t.actual_end ? t.actual_end : t.planned_start ?? t.createdAt ?? null;
  const sameDay = when ? f.dayKey(when) === f.dayKey(now) : true;
  const timeLabel = when ? (showDay && !sameDay ? `${f.day(when)} · ${f.time(when)}` : f.time(when)) : '';

  const who = driver ? niceName(driver) : open ? 'No driver yet' : '—';
  const truck = plate ?? (open && !t.is_third_party ? 'No truck' : null);

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onPress(t)}
      onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); onLongPress(t); }}
      delayLongPress={300}
      style={[s.row, muted && { opacity: 0.6 }]}
    >
      <View style={[s.bar, { backgroundColor: ps.dot }]} />
      <View style={s.body}>
        {/* Trip ID · Status */}
        <View style={s.line}>
          <Text style={s.ref}>
            {t.ref_id ?? t.id.slice(0, 8)}
            {timeLabel ? <Text style={s.time}>{`   ·   ${timeLabel}`}</Text> : null}
          </Text>
          <View style={[s.status, { backgroundColor: ps.bg }]}>
            <Text style={[s.statusText, { color: ps.fg }]}>{statusText(t)}</Text>
          </View>
        </View>

        {/* Customer */}
        <Text style={s.customer}>{niceName(t.customer?.name) || 'No customer'}</Text>

        {/* Route */}
        <Text style={s.route}>
          {niceName(route.from)}
          <Text style={s.arrow}>{'  →  '}</Text>
          {niceName(route.to)}
          {route.via > 0 ? <Text style={s.arrow}>{`   +${route.via}`}</Text> : null}
        </Text>
        {reason ? <Text style={s.reason}>{reason}</Text> : null}

        {/* Driver / Vehicle */}
        <View style={s.line}>
          <Text style={s.who}>
            <Text style={!driver && open ? { color: RED } : undefined}>{who}</Text>
            {truck ? <Text style={s.dim}>{'   ·   '}</Text> : null}
            {truck ? <Text style={[s.plate, !plate && { color: RED, fontFamily: undefined }]}>{truck}</Text> : null}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export const TripCard = memo(TripCardBase);

const s = StyleSheet.create({
  row: { flexDirection: 'row', backgroundColor: Colors.white },
  bar: { width: 4 },
  body: { flex: 1, paddingVertical: 12, paddingHorizontal: 14, gap: 4 },
  line: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  ref: { flex: 1, fontSize: 12, fontWeight: '700', color: MUTED },
  status: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  statusText: { fontSize: 11, fontWeight: '700' },
  customer: { fontSize: 16, fontWeight: '700', color: INK, lineHeight: 21 },
  route: { fontSize: 14, fontWeight: '500', color: '#3F3F46', lineHeight: 19 },
  arrow: { color: '#A1A1AA', fontWeight: '400' },
  reason: { fontSize: 12, fontWeight: '600', color: RED },
  who: { flex: 1, fontSize: 13, fontWeight: '500', color: MUTED, lineHeight: 18 },
  dim: { color: '#D4D4D8' },
  plate: { fontWeight: '700', color: '#3F3F46', fontFamily: 'monospace' },
  time: { fontSize: 12, fontWeight: '600', color: MUTED, fontFamily: undefined },
});

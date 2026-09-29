/**
 * One trip in the list. Three simple rows, nothing truncated:
 *   1. customer + status
 *   2. route (full), with trip no. · time · stops beneath it
 *   3. driver · truck · call
 * A trip that has gone wrong shows the driver's reason in red; everything else
 * the operator needs is on the trip's own page. Long-press for quick actions.
 */
import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { Phone, Truck } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import type { OperatorTrip } from '../../../lib/operator';
import { CompanyAvatar, initialsOf, niceName } from '../create/components/ui';
import { DriverAvatar } from '../../drivers/components/DriverAvatar';
import {
  PHASE_STYLE, delayReasonOf, driverNameOf, driverPhoneOf, phaseOf, plateOf, progressOf, routeOf, statusText,
  type TimeFmt,
} from './tripListModel';

const INK = '#18181B';
const MUTED = '#71717A';
const LINE = '#E4E4E7';
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
  const prog = progressOf(t);
  const driver = driverNameOf(t);
  const phone = driverPhoneOf(t);
  const plate = plateOf(t);
  const live = phase === 'running' || phase === 'delayed';
  const done = phase === 'done';
  const muted = phase === 'cancelled';
  const reason = phase === 'delayed' ? delayReasonOf(t) : null;
  const open = phase === 'draft' || phase === 'planned' || live;

  const when = done && t.actual_end ? t.actual_end : t.planned_start ?? t.createdAt ?? null;
  const sameDay = when ? f.dayKey(when) === f.dayKey(now) : true;
  const timeLabel = when ? (showDay && !sameDay ? `${f.day(when)} · ${f.time(when)}` : f.time(when)) : '';

  const meta = [
    t.ref_id ?? t.id.slice(0, 8),
    timeLabel,
    live && prog.total > 0 ? `${prog.done}/${prog.total} stops` : route.via > 0 ? `${route.via + 2} stops` : '',
  ].filter(Boolean).join('  ·  ');

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => onPress(t)}
      onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); onLongPress(t); }}
      delayLongPress={300}
      style={[s.card, phase === 'delayed' && s.cardUrgent, muted && { opacity: 0.65 }]}
    >
      {/* 1 · customer + status */}
      <View style={s.top}>
        <CompanyAvatar name={t.customer?.name} url={t.customer?.logo_url} size={32} />
        <Text style={s.customer} numberOfLines={2}>{niceName(t.customer?.name) || 'No customer'}</Text>
        <View style={[s.status, { backgroundColor: ps.bg }]}>
          <View style={[s.dot, { backgroundColor: ps.dot }]} />
          <Text style={[s.statusText, { color: ps.fg }]}>{statusText(t)}</Text>
        </View>
      </View>

      {/* 2 · route */}
      <View style={s.routeBlock}>
        <Text style={s.route} numberOfLines={2}>
          {niceName(route.from)}
          <Text style={s.arrow}>{'  →  '}</Text>
          {niceName(route.to)}
        </Text>
        <Text style={s.meta} numberOfLines={1}>{meta}</Text>
        {reason ? <Text style={s.reason} numberOfLines={1}>{reason}</Text> : null}
      </View>

      {/* 3 · driver · truck · call */}
      <View style={s.foot}>
        {driver ? (
          <DriverAvatar initials={initialsOf(driver)} avatarUrl={t.is_third_party ? null : t.driver?.avatar_url} size={24} />
        ) : <View style={s.noDriver} />}
        <Text style={[s.driver, !driver && open && { color: RED }]} numberOfLines={2}>
          {driver ? niceName(driver) : open ? 'No driver yet' : '—'}
        </Text>
        {plate ? (
          <View style={s.plate}>
            <Truck size={12} color={MUTED} />
            <Text style={s.plateText} numberOfLines={1}>{plate}</Text>
          </View>
        ) : open && !t.is_third_party ? (
          <Text style={s.noTruck}>No truck</Text>
        ) : null}
        {phone && open ? (
          <TouchableOpacity
            style={s.call}
            hitSlop={8}
            accessibilityLabel={`Call ${driver ?? 'driver'}`}
            onPress={() => Linking.openURL(`tel:${phone}`).catch(() => {})}
          >
            <Phone size={15} color="#16A34A" strokeWidth={2.2} />
          </TouchableOpacity>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export const TripCard = memo(TripCardBase);

const s = StyleSheet.create({
  card: { backgroundColor: Colors.white, borderRadius: 14, padding: 14, gap: 12, borderWidth: 1, borderColor: LINE },
  cardUrgent: { borderColor: '#FECDCA' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  customer: { flex: 1, fontSize: 15, fontWeight: '700', color: INK, lineHeight: 20 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontWeight: '700' },
  routeBlock: { gap: 3 },
  route: { fontSize: 15, fontWeight: '600', color: '#3F3F46', lineHeight: 21 },
  arrow: { color: '#A1A1AA', fontWeight: '400' },
  meta: { fontSize: 12, color: MUTED, fontVariant: ['tabular-nums'] },
  reason: { fontSize: 12, fontWeight: '600', color: RED },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F4F4F5' },
  noDriver: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#FDA29B' },
  driver: { flex: 1, fontSize: 13, fontWeight: '600', color: '#3F3F46', lineHeight: 17 },
  plate: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 6, backgroundColor: '#F4F4F5', paddingHorizontal: 7, paddingVertical: 3 },
  plateText: { fontSize: 12, fontWeight: '700', color: '#3F3F46', fontFamily: 'monospace' },
  noTruck: { fontSize: 12, fontWeight: '600', color: RED },
  call: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#F0FDF4', alignItems: 'center', justifyContent: 'center' },
});

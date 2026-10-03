/**
 * One trip as a card, top to bottom:
 *   customer (logo, name, trip no. · time)                    status
 *   route panel   ○ from
 *                 ● to                                     +N stops
 *   delay reason bar (only when the driver gave one)
 *   driver · plate · call
 * Names wrap instead of truncating. Long-press for quick actions.
 */
import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { Phone, Truck, AlertCircle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import type { OperatorTrip } from '../../../lib/operator';
import { CompanyAvatar, initialsOf, niceName } from '../create/components/ui';
import { DriverAvatar } from '../../drivers/components/DriverAvatar';
import {
  PHASE_STYLE, delayReasonOf, driverNameOf, driverPhoneOf, phaseOf, plateOf, routeOf, statusText,
  type TimeFmt,
} from './tripListModel';

const INK = '#3E3C3D';
const MUTED = '#71717A';
const RED = '#B42318';

interface Props {
  trip: OperatorTrip;
  f: TimeFmt;
  now: number;
  /** Show the day as well as the time (search results, the Now list). */
  showDay?: boolean;
  onPress: (t: OperatorTrip) => void;
  onLongPress: (t: OperatorTrip) => void;
}

function TripCardBase({ trip: t, f, now, showDay, onPress, onLongPress }: Props) {
  const phase = phaseOf(t.status);
  const ps = PHASE_STYLE[phase];
  const route = routeOf(t);
  const driver = driverNameOf(t);
  const phone = driverPhoneOf(t);
  const plate = plateOf(t);
  const done = phase === 'done';
  const muted = phase === 'cancelled';
  const open = phase === 'draft' || phase === 'planned' || phase === 'running' || phase === 'delayed';
  const reason = phase === 'delayed' ? delayReasonOf(t) : null;

  const when = done && t.actual_end ? t.actual_end : t.planned_start ?? t.createdAt ?? null;
  const sameDay = when ? f.dayKey(when) === f.dayKey(now) : true;
  const timeLabel = when ? (showDay && !sameDay ? `${f.day(when)} · ${f.time(when)}` : f.time(when)) : '';
  const sub = [t.ref_id ?? t.id.slice(0, 8), timeLabel].filter(Boolean).join('  ·  ');

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={() => onPress(t)}
      onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); onLongPress(t); }}
      delayLongPress={300}
      style={[s.card, phase === 'delayed' && s.cardUrgent, muted && { opacity: 0.65 }]}
    >
      {/* Customer · status */}
      <View style={s.top}>
        <CompanyAvatar name={t.customer?.name} url={t.customer?.logo_url} size={38} />
        <View style={{ flex: 1 }}>
          <Text style={s.customer} numberOfLines={2}>{niceName(t.customer?.name) || 'No customer'}</Text>
          <Text style={s.sub} numberOfLines={1}>{sub}</Text>
        </View>
        <View style={[s.status, { backgroundColor: ps.bg }]}>
          <View style={[s.dot, { backgroundColor: ps.dot }]} />
          <Text style={[s.statusText, { color: ps.fg }]}>{statusText(t)}</Text>
        </View>
      </View>

      {/* Route panel */}
      <View style={s.route}>
        <View style={s.rail}>
          <View style={[s.ring, { borderColor: '#16A34A' }]} />
          <View style={s.railLine} />
          <View style={[s.pin, { backgroundColor: ps.dot }]} />
        </View>
        <View style={s.places}>
          <Text style={s.place} numberOfLines={2}>{niceName(route.from)}</Text>
          <Text style={s.place} numberOfLines={2}>{niceName(route.to)}</Text>
        </View>
        {route.via > 0 ? (
          <View style={s.via}><Text style={s.viaText}>{`+${route.via} ${route.via === 1 ? 'stop' : 'stops'}`}</Text></View>
        ) : null}
      </View>

      {reason ? (
        <View style={s.reason}>
          <AlertCircle size={14} color={RED} strokeWidth={2.4} />
          <Text style={s.reasonText} numberOfLines={2}>{reason}</Text>
        </View>
      ) : null}

      {/* Driver · plate · call */}
      <View style={s.foot}>
        {driver ? (
          <DriverAvatar initials={initialsOf(driver)} avatarUrl={t.is_third_party ? null : t.driver?.avatar_url} size={28} />
        ) : <View style={s.noDriver} />}
        <Text style={[s.driver, !driver && open && { color: RED }]} numberOfLines={2}>
          {driver ? niceName(driver) : open ? 'No driver yet' : '—'}
        </Text>
        {plate ? (
          <View style={s.plate}>
            <Truck size={12} color={MUTED} strokeWidth={2.2} />
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
            <Phone size={16} color="#15803D" strokeWidth={2.2} />
          </TouchableOpacity>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export const TripCard = memo(TripCardBase);

const s = StyleSheet.create({
  card: {
    backgroundColor: Colors.white, borderRadius: 18, padding: 14, gap: 12,
    borderWidth: 1, borderColor: '#ECECEF',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  cardUrgent: { borderColor: '#FDD5D1' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  customer: { fontSize: 15, fontWeight: '700', color: INK, lineHeight: 20 },
  sub: { fontSize: 12, fontWeight: '500', color: MUTED, marginTop: 1, fontVariant: ['tabular-nums'] },
  status: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, alignSelf: 'flex-start' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontWeight: '700' },

  route: { flexDirection: 'row', alignItems: 'stretch', gap: 12, backgroundColor: '#F6F6F8', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 12 },
  rail: { alignItems: 'center', paddingVertical: 5 },
  ring: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, backgroundColor: Colors.white },
  railLine: { flex: 1, width: 2, backgroundColor: '#D4D4D8', marginVertical: 3, minHeight: 12 },
  pin: { width: 10, height: 10, borderRadius: 5 },
  places: { flex: 1, justifyContent: 'space-between', gap: 10 },
  place: { fontSize: 15, fontWeight: '600', color: '#3E3C3D', lineHeight: 20 },
  via: { alignSelf: 'center', backgroundColor: Colors.white, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: '#E4E4E7' },
  viaText: { fontSize: 11, fontWeight: '700', color: MUTED },

  reason: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF3F2', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  reasonText: { flex: 1, fontSize: 12, fontWeight: '600', color: RED },

  foot: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  noDriver: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#FDA29B' },
  driver: { flex: 1, fontSize: 13, fontWeight: '600', color: '#3F3F46', lineHeight: 17 },
  plate: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, backgroundColor: '#F4F4F5', paddingHorizontal: 8, paddingVertical: 5 },
  plateText: { fontSize: 12, fontWeight: '700', color: '#3F3F46', fontFamily: 'monospace' },
  noTruck: { fontSize: 12, fontWeight: '700', color: RED },
  call: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#ECFDF3', alignItems: 'center', justifyContent: 'center' },
});

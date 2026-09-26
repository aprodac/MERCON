/**
 * One trip in the list. Read top to bottom: state and time, customer, route,
 * progress, what's wrong, who's driving. Long-press for quick actions; the
 * phone button calls the driver without opening the trip.
 */
import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { ArrowRight, Phone, Truck } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import type { OperatorTrip } from '../../../lib/operator';
import { CompanyAvatar, initialsOf, niceName } from '../create/components/ui';
import { DriverAvatar } from '../../drivers/components/DriverAvatar';
import {
  PHASE_STYLE, driverNameOf, driverPhoneOf, flagsOf, phaseOf, plateOf, progressOf, routeOf, shortDuration, statusText,
  type FlagTone, type TimeFmt,
} from './tripListModel';

const INK = '#2B2A2B';
const MUTED = '#5F5F6E';

const FLAG: Record<FlagTone, { bg: string; fg: string }> = {
  red: { bg: '#FDEDEB', fg: '#912018' },
  amber: { bg: '#FFF4D6', fg: '#7A4F00' },
  violet: { bg: '#F0EBFC', fg: '#4A2A93' },
  gray: { bg: '#F1F1F3', fg: '#52525B' },
};

interface Props {
  trip: OperatorTrip;
  f: TimeFmt;
  now: number;
  /** Show the day as well as the time (search results, history). */
  showDay?: boolean;
  onPress: (t: OperatorTrip) => void;
  onLongPress: (t: OperatorTrip) => void;
}

function TripCardBase({ trip: t, f, now, showDay, onPress, onLongPress }: Props) {
  const phase = phaseOf(t.status);
  const ps = PHASE_STYLE[phase];
  const route = routeOf(t);
  const prog = progressOf(t);
  const flags = flagsOf(t, now);
  const urgent = flags.some((x) => x.tone === 'red');
  const driver = driverNameOf(t);
  const phone = driverPhoneOf(t);
  const plate = plateOf(t);
  const live = phase === 'running' || phase === 'delayed';
  const done = phase === 'done';
  const muted = phase === 'cancelled';

  const when = done && t.actual_end ? t.actual_end : t.planned_start ?? t.createdAt ?? null;
  const timeLabel = when ? (showDay ? `${f.day(when)} · ${f.time(when)}` : f.time(when)) : '—';
  const startsIn = phase === 'planned' && t.planned_start ? new Date(t.planned_start).getTime() - now : null;
  const sub =
    live && prog.next ? `Next: ${prog.next}`
    : done ? `Delivered${t.actual_end ? ` ${f.time(t.actual_end)}` : ''}`
    : startsIn != null && startsIn > 0 && startsIn < 24 * 3600_000 ? `Starts in ${shortDuration(startsIn / 60000)}`
    : null;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => onPress(t)}
      onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); onLongPress(t); }}
      delayLongPress={300}
      style={[s.card, urgent && s.cardUrgent, muted && { opacity: 0.7 }]}
    >
      {/* State · time */}
      <View style={s.top}>
        <View style={[s.status, { backgroundColor: ps.bg }]}>
          <View style={[s.dot, { backgroundColor: ps.dot }]} />
          <Text style={[s.statusText, { color: ps.fg }]}>{statusText(t)}</Text>
        </View>
        {sub ? <Text style={s.sub} numberOfLines={1}>{sub}</Text> : <View style={{ flex: 1 }} />}
        <Text style={[s.time, done && { color: MUTED }]}>{timeLabel}</Text>
      </View>

      {/* Customer + ref */}
      <View style={s.customerRow}>
        <CompanyAvatar name={t.customer?.name} url={t.customer?.logo_url} size={30} />
        <Text style={s.customer} numberOfLines={1}>{niceName(t.customer?.name) || 'No customer'}</Text>
        <Text style={s.ref} numberOfLines={1}>{t.ref_id ?? t.id.slice(0, 8)}</Text>
      </View>

      {/* Route */}
      <View style={s.route}>
        <View style={[s.routeDot, { backgroundColor: '#1F9D55' }]} />
        <Text style={s.place} numberOfLines={1}>{route.from}</Text>
        <ArrowRight size={13} color="#9898A4" strokeWidth={2.4} />
        {route.via > 0 ? <View style={s.via}><Text style={s.viaText}>+{route.via}</Text></View> : null}
        {route.via > 0 ? <ArrowRight size={13} color="#9898A4" strokeWidth={2.4} /> : null}
        <View style={[s.routeDot, { backgroundColor: Colors.primary }]} />
        <Text style={s.place} numberOfLines={1}>{route.to}</Text>
      </View>

      {/* Stop progress while it's on the road (and a full bar once done) */}
      {(live || done) && prog.total > 0 ? (
        <View style={s.progress}>
          {Array.from({ length: prog.total }, (_, i) => (
            <View
              key={i}
              style={[
                s.seg,
                { backgroundColor: done || i < prog.done ? '#1F9D55' : i === prog.nextIdx ? (phase === 'delayed' ? '#D92D20' : '#2F5FD0') : '#E1E4EC' },
              ]}
            />
          ))}
          <Text style={s.progText}>{prog.done}/{prog.total}</Text>
        </View>
      ) : null}

      {/* What's wrong */}
      {flags.length ? (
        <View style={s.flags}>
          {flags.slice(0, 3).map((fl) => (
            <View key={fl.key} style={[s.flag, { backgroundColor: FLAG[fl.tone].bg }]}>
              <Text style={[s.flagText, { color: FLAG[fl.tone].fg }]} numberOfLines={1}>{fl.label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Who */}
      <View style={s.foot}>
        {driver ? (
          <DriverAvatar initials={initialsOf(driver)} avatarUrl={t.is_third_party ? null : t.driver?.avatar_url} size={26} />
        ) : <View style={s.noDriver} />}
        <Text style={[s.driver, !driver && { color: '#912018' }]} numberOfLines={1}>{driver ? niceName(driver) : 'No driver yet'}</Text>
        {plate ? (
          <View style={s.plate}>
            <Truck size={12} color={MUTED} />
            <Text style={s.plateText} numberOfLines={1}>{plate}</Text>
          </View>
        ) : null}
        {phone && !muted && !done ? (
          <TouchableOpacity
            style={s.call}
            hitSlop={8}
            accessibilityLabel={`Call ${driver ?? 'driver'}`}
            onPress={() => Linking.openURL(`tel:${phone}`).catch(() => {})}
          >
            <Phone size={15} color="#146C3C" strokeWidth={2.3} />
          </TouchableOpacity>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export const TripCard = memo(TripCardBase);

const s = StyleSheet.create({
  card: { backgroundColor: Colors.white, borderRadius: 18, padding: 14, gap: 10, borderWidth: 1, borderColor: '#EEF0F4' },
  cardUrgent: { borderColor: '#F5C2BC' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '800' },
  sub: { flex: 1, fontSize: 12, fontWeight: '600', color: MUTED },
  time: { fontSize: 15, fontWeight: '800', color: INK, fontVariant: ['tabular-nums'] },
  customerRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  customer: { flex: 1, fontSize: 15, fontWeight: '800', color: INK },
  ref: { fontSize: 12, fontWeight: '600', color: MUTED, fontFamily: 'monospace', maxWidth: 110 },
  route: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F7F8FA', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 9 },
  routeDot: { width: 7, height: 7, borderRadius: 4 },
  place: { flexShrink: 1, fontSize: 13, fontWeight: '700', color: INK },
  via: { backgroundColor: '#E1E4EC', borderRadius: 7, paddingHorizontal: 5, paddingVertical: 1 },
  viaText: { fontSize: 11, fontWeight: '800', color: '#3B3B44' },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  seg: { flex: 1, height: 5, borderRadius: 3 },
  progText: { marginLeft: 6, fontSize: 11, fontWeight: '800', color: MUTED, fontVariant: ['tabular-nums'] },
  flags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  flag: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, maxWidth: '100%' },
  flagText: { fontSize: 12, fontWeight: '700' },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  noDriver: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#E0A39B' },
  driver: { flex: 1, fontSize: 13, fontWeight: '700', color: INK },
  plate: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F1F3F7', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, maxWidth: 120 },
  plateText: { fontSize: 12, fontWeight: '700', color: '#3B3B44', fontFamily: 'monospace' },
  call: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#E8F5EE', alignItems: 'center', justifyContent: 'center' },
});

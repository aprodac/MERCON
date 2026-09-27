/**
 * One trip in the list, compact: customer and time; route and trip number;
 * status with what's happening and stop progress; anything wrong; who's
 * driving (with a call button). Each fact appears once. Long-press for quick
 * actions.
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
  PHASE_STYLE, delayReasonOf, driverNameOf, driverPhoneOf, flagsOf, phaseOf, plateOf, progressOf, routeOf, shortDuration, statusText,
  type FlagTone, type TimeFmt,
} from './tripListModel';

const INK = '#18181B';
const MUTED = '#71717A';
const LINE = '#E4E4E7';

const FLAG: Record<FlagTone, { bg: string; fg: string }> = {
  red: { bg: '#FEF3F2', fg: '#B42318' },
  amber: { bg: '#FFFAEB', fg: '#93370D' },
  violet: { bg: '#F4F3FF', fg: '#5925DC' },
  gray: { bg: '#F4F4F5', fg: '#52525B' },
};

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
  // The status pill already says "Delayed"; the flags only add what it doesn't.
  const flags = flagsOf(t, now).filter((x) => x.key !== 'delayed');
  const urgent = phase === 'delayed' || flags.some((x) => x.tone === 'red');
  const driver = driverNameOf(t);
  const phone = driverPhoneOf(t);
  const plate = plateOf(t);
  const live = phase === 'running' || phase === 'delayed';
  const done = phase === 'done';
  const muted = phase === 'cancelled';

  const when = done && t.actual_end ? t.actual_end : t.planned_start ?? t.createdAt ?? null;
  const sameDay = when ? f.dayKey(when) === f.dayKey(now) : true;
  const timeLabel = when ? (showDay && !sameDay ? `${f.day(when)} · ${f.time(when)}` : f.time(when)) : '—';
  const startsIn = phase === 'planned' && t.planned_start ? new Date(t.planned_start).getTime() - now : null;
  const reason = phase === 'delayed' ? delayReasonOf(t) : null;
  const note =
    reason ? reason
    : live && prog.next ? `Next: ${prog.next}`
    : startsIn != null && startsIn > 0 && startsIn < 24 * 3600_000 ? `Starts in ${shortDuration(startsIn / 60000)}`
    : null;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => onPress(t)}
      onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); onLongPress(t); }}
      delayLongPress={300}
      style={[s.card, urgent && s.cardUrgent, muted && { opacity: 0.65 }]}
    >
      {/* Customer · time */}
      <View style={s.row}>
        <CompanyAvatar name={t.customer?.name} url={t.customer?.logo_url} size={28} />
        <Text style={s.customer} numberOfLines={1}>{niceName(t.customer?.name) || 'No customer'}</Text>
        <Text style={[s.time, done && { color: MUTED }]}>{timeLabel}</Text>
      </View>

      {/* Route · trip no. */}
      <View style={s.routeRow}>
        <Text style={s.route} numberOfLines={1}>
          {niceName(route.from)}
          <Text style={s.arrow}>{'  →  '}</Text>
          {route.via > 0 ? <Text style={s.via}>{`+${route.via} stops`}<Text style={s.arrow}>{'  →  '}</Text></Text> : null}
          {niceName(route.to)}
        </Text>
        <Text style={s.ref} numberOfLines={1}>{t.ref_id ?? t.id.slice(0, 8)}</Text>
      </View>

      {/* Status · what's happening · progress */}
      <View style={s.row}>
        <View style={[s.status, { backgroundColor: ps.bg }]}>
          <View style={[s.dot, { backgroundColor: ps.dot }]} />
          <Text style={[s.statusText, { color: ps.fg }]}>{statusText(t)}</Text>
        </View>
        <Text style={[s.note, reason && { color: '#B42318' }]} numberOfLines={1}>{note ?? ''}</Text>
        {(live || done) && prog.total > 0 ? (
          <View style={s.progress}>
            <View style={s.segs}>
              {Array.from({ length: prog.total }, (_, i) => (
                <View
                  key={i}
                  style={[
                    s.seg,
                    { backgroundColor: i < prog.done ? '#16A34A' : live && i === prog.nextIdx ? (phase === 'delayed' ? '#F04438' : '#2563EB') : '#E4E4E7' },
                  ]}
                />
              ))}
            </View>
            <Text style={s.progText}>{prog.done}/{prog.total}</Text>
          </View>
        ) : null}
      </View>

      {/* Anything wrong (beyond the status) */}
      {flags.length ? (
        <View style={s.flags}>
          {flags.slice(0, 3).map((fl) => (
            <View key={fl.key} style={[s.flag, { backgroundColor: FLAG[fl.tone].bg }]}>
              <Text style={[s.flagText, { color: FLAG[fl.tone].fg }]} numberOfLines={1}>{fl.label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Driver · truck · call */}
      <View style={[s.row, s.foot]}>
        {driver ? (
          <DriverAvatar initials={initialsOf(driver)} avatarUrl={t.is_third_party ? null : t.driver?.avatar_url} size={22} />
        ) : <View style={s.noDriver} />}
        <Text style={[s.driver, !driver && { color: '#B42318' }]} numberOfLines={1}>{driver ? niceName(driver) : 'No driver yet'}</Text>
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
            <Phone size={14} color="#16A34A" strokeWidth={2.2} />
          </TouchableOpacity>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export const TripCard = memo(TripCardBase);

const s = StyleSheet.create({
  card: { backgroundColor: Colors.white, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, gap: 8, borderWidth: 1, borderColor: LINE },
  cardUrgent: { borderColor: '#FECDCA' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  customer: { flex: 1, fontSize: 15, fontWeight: '600', color: INK },
  time: { fontSize: 14, fontWeight: '600', color: INK, fontVariant: ['tabular-nums'] },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 36 },
  route: { flex: 1, fontSize: 13, fontWeight: '500', color: '#3F3F46' },
  arrow: { color: '#A1A1AA' },
  via: { color: MUTED },
  ref: { fontSize: 12, color: '#A1A1AA', fontFamily: 'monospace' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontWeight: '600' },
  note: { flex: 1, fontSize: 12, color: MUTED },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  segs: { flexDirection: 'row', gap: 2, width: 64 },
  seg: { flex: 1, height: 4, borderRadius: 2 },
  progText: { fontSize: 11, fontWeight: '600', color: MUTED, fontVariant: ['tabular-nums'] },
  flags: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  flag: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, maxWidth: '100%' },
  flagText: { fontSize: 11, fontWeight: '600' },
  foot: { borderTopWidth: 1, borderTopColor: '#F4F4F5', paddingTop: 8 },
  noDriver: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#FDA29B' },
  driver: { flex: 1, fontSize: 13, fontWeight: '500', color: '#3F3F46' },
  plate: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 6, borderWidth: 1, borderColor: LINE, paddingHorizontal: 6, paddingVertical: 2, maxWidth: 120 },
  plateText: { fontSize: 11, fontWeight: '600', color: '#3F3F46', fontFamily: 'monospace' },
  call: { width: 28, height: 28, borderRadius: 8, borderWidth: 1, borderColor: LINE, alignItems: 'center', justifyContent: 'center' },
});

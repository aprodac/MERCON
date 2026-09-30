/**
 * One driver in the list, on a simple grid:
 *
 *   (photo)  Full name (wraps)
 *            [status]  DRV-106
 *            +966 54 612 6286
 *   ─────────────────────────────────────────────────────────────
 *   Truck          This month        Documents
 *   DRA-6484       SAR 0             Not on file
 *
 * The whole card opens the driver's details; the only button is the round
 * call (or, on a trip, track) button top-right.
 * Every value sits under a short label in the same three columns, so rows
 * line up card to card. Problems (expired licence or document, no truck)
 * are coloured; everything else stays neutral. On a trip, the truck column
 * shows the trip and Call becomes Track.
 */
import React from 'react';
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Navigation, Phone } from 'lucide-react-native';
import { DriverAvatar } from './DriverAvatar';
import { EXPIRY_SOON_DAYS } from '../services/driverDetailsService';
import { driverFullName, driverInitials } from '../services/driversService';
import { niceName } from '../../trips/create/components/ui';
import type { DriverDisplayStatus, DriverListItem } from '../types';

const INK = '#18181B';
const MUTED = '#6B6B76';
const LINE = '#EDEDF0';
const RED = '#B42318';
const AMBER = '#B54708';

const STATUS: Record<DriverDisplayStatus, { label: string; bg: string; fg: string; dot: string }> = {
  Available: { label: 'Available', bg: '#ECFDF3', fg: '#067647', dot: '#16A34A' },
  OnTrip: { label: 'On trip', bg: '#EEF4FF', fg: '#1D4ED8', dot: '#2563EB' },
  OffDuty: { label: 'Off duty', bg: '#F4F4F5', fg: '#52525B', dot: '#A1A1AA' },
  Inactive: { label: 'Inactive', bg: '#F4F4F5', fg: '#52525B', dot: '#A1A1AA' },
  Suspended: { label: 'Suspended', bg: '#FEF3F2', fg: RED, dot: '#D92D20' },
  OnLeave: { label: 'On leave', bg: '#F5F3FF', fg: '#5B21B6', dot: '#7C3AED' },
};

/** "+966546126286" → "+966 54 612 6286"; anything else is shown as given. */
function formatPhone(p: string): string {
  const m = /^\+?966(5\d)(\d{3})(\d{4})$/.exec(p.replace(/\s+/g, ''));
  return m ? `+966 ${m[1]} ${m[2]} ${m[3]}` : p;
}

function expiryText(days: number | null): { text: string; color: string } | null {
  if (days === null) return null;
  if (days < 0) return { text: `Expired ${Math.abs(days)}d ago`, color: RED };
  if (days === 0) return { text: 'Expires today', color: RED };
  if (days <= EXPIRY_SOON_DAYS) return { text: `${days} days left`, color: AMBER };
  return { text: `${days} days left`, color: INK };
}

interface DriverCardProps {
  driver: DriverListItem;
  onCall?: (driver: DriverListItem) => void;
  onTrack?: (driver: DriverListItem) => void;
  onView?: (driver: DriverListItem) => void;
  className?: string;
}

export function DriverCard({ driver, onCall, onTrack, onView }: DriverCardProps) {
  // Names arrive in ALL CAPS; normal case is shorter and easier to read, and it wraps instead of truncating.
  const name = niceName(driverFullName(driver));
  const onTrip = driver.status === 'OnTrip' && !!driver.activeTrip;
  const st = STATUS[driver.status as DriverDisplayStatus] ?? STATUS.Inactive;
  const plate = driver.activeTrip?.vehiclePlate ?? driver.assignedVehicle?.plateNumber ?? null;

  // Documents column: an expired or expiring licence outranks other documents.
  const licence = expiryText(driver.licenseDaysLeft);
  const doc = expiryText(driver.docDaysLeft);
  const docs =
    licence && licence.color !== INK ? { text: `Licence ${licence.text.toLowerCase()}`, color: licence.color }
    : doc ?? { text: 'Not on file', color: MUTED };

  return (
    <TouchableOpacity activeOpacity={onView ? 0.85 : 1} onPress={onView ? () => onView(driver) : undefined} style={s.card}>
      {/* Header */}
      <View style={s.head}>
        <DriverAvatar initials={driverInitials(driver)} avatarUrl={driver.avatarUrl} status={driver.status} size={48} />
        <View style={s.headText}>
          <Text style={s.name} numberOfLines={2}>{name}</Text>
          <View style={s.metaRow}>
            <View style={[s.pill, { backgroundColor: st.bg }]}>
              <View style={[s.dot, { backgroundColor: st.dot }]} />
              <Text style={[s.pillText, { color: st.fg }]}>{st.label}</Text>
            </View>
            {driver.ref_id ? <Text style={s.sub}>{driver.ref_id}</Text> : null}
          </View>
          {driver.phone ? <Text style={s.sub}>{formatPhone(driver.phone)}</Text> : null}
        </View>
        {/* One quick action, top-right: call the driver — or, on a trip, track it. */}
        {onTrip ? (
          <TouchableOpacity style={s.quick} onPress={onTrack ? () => onTrack(driver) : undefined} hitSlop={8} accessibilityLabel={`Track trip for ${name}`}>
            <Navigation size={18} color="#1D4ED8" strokeWidth={2.2} />
          </TouchableOpacity>
        ) : driver.phone ? (
          <TouchableOpacity style={[s.quick, s.quickCall]} onPress={onCall ? () => onCall(driver) : undefined} hitSlop={8} accessibilityLabel={`Call ${name}`}>
            <Phone size={18} color="#067647" strokeWidth={2.2} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Facts — three aligned columns; tapping anywhere on the card opens the driver */}
      <View style={s.facts}>
        <Fact label={onTrip ? 'On trip' : 'Truck'} value={plate ?? 'None'} color={plate ? INK : MUTED} mono={!!plate} />
        <Fact label="This month" value={`SAR ${(driver.monthlyPayout ?? 0).toLocaleString('en-US')}`} color={INK} />
        <Fact label="Documents" value={docs.text} color={docs.color} />
      </View>
    </TouchableOpacity>
  );
}

function Fact({ label, value, color, mono }: { label: string; value: string; color: string; mono?: boolean }) {
  return (
    <View style={s.fact}>
      <Text style={s.factLabel} numberOfLines={1}>{label}</Text>
      <Text style={[s.factValue, { color }, mono && s.mono]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#E9E9EC', padding: 16, gap: 14 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headText: { flex: 1, gap: 5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 16, fontWeight: '700', color: INK, lineHeight: 21 },
  sub: { fontSize: 13, color: MUTED, fontVariant: ['tabular-nums'] },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 12, fontWeight: '600' },

  facts: { flexDirection: 'row', borderTopWidth: 1, borderColor: LINE, paddingTop: 12 },
  fact: { flex: 1, gap: 3, paddingRight: 8 },
  factLabel: { fontSize: 12, color: MUTED },
  factValue: { fontSize: 14, fontWeight: '600', lineHeight: 18 },
  mono: { fontFamily: 'monospace', fontWeight: '700' },

  quick: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EEF4FF', alignItems: 'center', justifyContent: 'center' },
  quickCall: { backgroundColor: '#ECFDF3' },
});

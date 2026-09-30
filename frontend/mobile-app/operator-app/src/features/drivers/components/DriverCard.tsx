/**
 * One driver in the list — same language as Home and the Fleet map:
 *   (photo)  Full name (wraps)                      (● call)
 *            ● Available
 *            DRV-129 · +966 54 612 6286
 *   [🚚 DRA-6484] [💳 SAR 0] [📄 Not on file]
 * Tap the card to open the driver; the round button calls (or, on a trip,
 * tracks). Chips are neutral unless something is wrong (red / amber).
 */
import React from 'react';
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { FileText, Navigation, Phone, Truck, Wallet, type LucideIcon } from 'lucide-react-native';
import { DriverAvatar } from './DriverAvatar';
import { EXPIRY_SOON_DAYS } from '../services/driverDetailsService';
import { driverFullName, driverInitials } from '../services/driversService';
import { niceName } from '../../trips/create/components/ui';
import type { DriverDisplayStatus, DriverListItem } from '../types';

const INK = '#18181B';
const MUTED = '#6B6B76';
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

  const payout = `SAR ${(driver.monthlyPayout ?? 0).toLocaleString('en-US')}`;
  const sub = [driver.ref_id, driver.phone ? formatPhone(driver.phone) : null].filter(Boolean).join('  ·  ');

  return (
    <TouchableOpacity activeOpacity={onView ? 0.85 : 1} onPress={onView ? () => onView(driver) : undefined} style={s.card} accessibilityRole="button" accessibilityLabel={`Open ${name}`}>
      <View style={s.head}>
        <DriverAvatar initials={driverInitials(driver)} avatarUrl={driver.avatarUrl} status={driver.status} size={50} />
        <View style={s.headText}>
          <Text style={s.name} numberOfLines={2}>{name}</Text>
          <View style={s.statusRow}>
            <View style={[s.dot, { backgroundColor: st.dot }]} />
            <Text style={[s.status, { color: st.fg }]}>{st.label}</Text>
          </View>
          {sub ? <Text style={s.sub} numberOfLines={1}>{sub}</Text> : null}
        </View>
        {onTrip ? (
          <TouchableOpacity style={s.quick} onPress={onTrack ? () => onTrack(driver) : undefined} hitSlop={8} accessibilityLabel={`Track trip for ${name}`}>
            <Navigation size={18} color="#FFFFFF" strokeWidth={2.2} />
          </TouchableOpacity>
        ) : driver.phone ? (
          <TouchableOpacity style={s.quick} onPress={onCall ? () => onCall(driver) : undefined} hitSlop={8} accessibilityLabel={`Call ${name}`}>
            <Phone size={17} color="#FFFFFF" strokeWidth={2.2} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Soft chips: truck, this month's pay, documents — colour only when something's wrong */}
      <View style={s.chips}>
        <Chip icon={Truck} text={plate ?? 'No truck'} color={plate ? INK : MUTED} mono={!!plate} />
        <Chip icon={Wallet} text={payout} color={INK} />
        <Chip icon={FileText} text={docs.text} color={docs.color} tint={docs.color === RED ? '#FEF3F2' : docs.color === AMBER ? '#FFFAEB' : undefined} />
      </View>
    </TouchableOpacity>
  );
}

function Chip({ icon: Icon, text, color, mono, tint }: { icon: LucideIcon; text: string; color: string; mono?: boolean; tint?: string }) {
  return (
    <View style={[s.chip, tint ? { backgroundColor: tint } : null]}>
      <Icon size={13} color={color === INK ? MUTED : color} strokeWidth={2.2} />
      <Text style={[s.chipText, { color }, mono && s.mono]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 20, borderWidth: 1, borderColor: '#EEEEF1', padding: 14, gap: 12,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headText: { flex: 1, gap: 3 },
  name: { fontSize: 16, fontWeight: '700', color: INK, lineHeight: 21, letterSpacing: -0.2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  status: { fontSize: 13, fontWeight: '600' },
  sub: { fontSize: 12.5, color: MUTED, fontVariant: ['tabular-nums'] },
  quick: { width: 42, height: 42, borderRadius: 21, backgroundColor: INK, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F5F5F7', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, maxWidth: '100%' },
  chipText: { fontSize: 13, fontWeight: '600' },
  mono: { fontFamily: 'monospace', fontWeight: '700' },
});

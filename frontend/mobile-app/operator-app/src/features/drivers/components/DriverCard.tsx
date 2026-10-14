/**
 * One driver in the list — a compact row:
 *   (photo)  Full name                                   (call)
 *            ● Available · DRV-129 · DRA-6484
 *            ▢ Phone ready · seen 3 min ago — the driver app on their phone
 *            ⚠ Licence 5 days left        — only when something is wrong
 * Tap the row to open the driver; the round button calls (or, on a trip,
 * opens the trip). Status is said once, in words, with its dot.
 */
import React from 'react';
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { FileWarning, Navigation, Phone, Smartphone } from 'lucide-react-native';
import { DriverAvatar } from './DriverAvatar';
import { EXPIRY_SOON_DAYS } from '../services/driverDetailsService';
import { driverFullName, driverInitials } from '../services/driversService';
import { niceName } from '../../trips/create/components/ui';
import type { DriverListItem, DriverStatus } from '../types';
import { LEVEL_LABEL, timeAgo, type FleetPhoneRow, type PhoneLevel } from '../phone/driverPhone';

const INK = '#3E3C3D';
const MUTED = '#6B6B76';
const RED = '#B42318';
const AMBER = '#B54708';


const STATUS: Record<DriverStatus, { label: string; fg: string; dot: string }> = {
  Available: { label: 'Available', fg: '#146C3C', dot: '#1F9D55' },
  OnTrip: { label: 'On trip', fg: '#2449A8', dot: '#2F5FD0' },
  OffDuty: { label: 'Offline', fg: MUTED, dot: '#9898A4' },
  Inactive: { label: 'Inactive', fg: MUTED, dot: '#9898A4' },
};

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
  /** The driver app's phone, from GET /drivers/phone-status (undefined while loading). */
  phone?: FleetPhoneRow | null;
}

const PHONE_FG: Record<PhoneLevel, string> = { green: '#146C3C', amber: AMBER, red: RED };

/** "Phone ready · seen 3 min ago", "Check phone · Notifications not allowed yet", "Not ready · no app login". */
function phoneLine(p: FleetPhoneRow): string {
  if (!p.lastSeenAt) return `${LEVEL_LABEL[p.level]} · not logged in to the app`;
  if (p.level === 'green') return `Phone ready · seen ${timeAgo(p.lastSeenAt)}`;
  const why = (p.reasons[0] ?? '').replace(/^App not seen for /, 'not seen for ');
  return `${LEVEL_LABEL[p.level]} · ${why.charAt(0).toLowerCase()}${why.slice(1)}`;
}

export function DriverCard({ driver, onCall, onTrack, onView, phone }: DriverCardProps) {
  // Names arrive in ALL CAPS; normal case is shorter and easier to read, and it wraps instead of truncating.
  const name = niceName(driverFullName(driver));
  const onTrip = driver.status === 'OnTrip' && !!driver.activeTrip;
  const plate = driver.activeTrip?.vehiclePlate ?? driver.assignedVehicle?.plateNumber ?? null;

  // Documents column: an expired or expiring licence outranks other documents.
  const licence = expiryText(driver.licenseDaysLeft);
  const doc = expiryText(driver.docDaysLeft);
  const docs =
    licence && licence.color !== INK ? { text: `Licence ${licence.text.toLowerCase()}`, color: licence.color }
    : doc && doc.color !== INK ? { text: `Document ${doc.text.toLowerCase()}`, color: doc.color }
    : null; // nothing wrong → no line

  const st = STATUS[driver.status];
  const meta = [driver.ref_id, plate ?? 'No truck'].filter(Boolean).join('  ·  ');
  const pay = driver.monthlyPayout ? `SAR ${driver.monthlyPayout.toLocaleString('en-US')} this month` : null;

  return (
    <TouchableOpacity activeOpacity={onView ? 0.8 : 1} onPress={onView ? () => onView(driver) : undefined} style={s.card} accessibilityRole="button" accessibilityLabel={`Open ${name}`}>
      <DriverAvatar initials={driverInitials(driver)} avatarUrl={driver.avatarUrl} size={48} />
      <View style={s.text}>
        <Text style={s.name} numberOfLines={2}>{name}</Text>
        <View style={s.metaRow}>
          <View style={[s.dot, { backgroundColor: st.dot }]} />
          <Text style={s.meta} numberOfLines={1}>
            <Text style={{ color: st.fg, fontWeight: '600' }}>{st.label}</Text>
            {meta ? `  ·  ${meta}` : ''}
          </Text>
        </View>
        {phone ? (
          <View style={s.metaRow}>
            <Smartphone size={13} color={PHONE_FG[phone.level]} strokeWidth={2.2} />
            <Text style={[s.meta, { color: PHONE_FG[phone.level], fontWeight: phone.level === 'green' ? '500' : '600' }]} numberOfLines={1}>{phoneLine(phone)}</Text>
          </View>
        ) : null}
        {docs ? (
          <View style={s.metaRow}>
            <FileWarning size={13} color={docs.color} strokeWidth={2.2} />
            <Text style={[s.meta, { color: docs.color, fontWeight: '600' }]} numberOfLines={1}>{docs.text}</Text>
          </View>
        ) : pay ? <Text style={s.meta} numberOfLines={1}>{pay}</Text> : null}
      </View>
      {onTrip ? (
        <TouchableOpacity style={s.quick} onPress={onTrack ? () => onTrack(driver) : undefined} hitSlop={8} accessibilityLabel={`Open trip for ${name}`}>
          <Navigation size={18} color={INK} strokeWidth={2.2} />
        </TouchableOpacity>
      ) : driver.phone ? (
        <TouchableOpacity style={s.quick} onPress={onCall ? () => onCall(driver) : undefined} hitSlop={8} accessibilityLabel={`Call ${name}`}>
          <Phone size={17} color={INK} strokeWidth={2.2} />
        </TouchableOpacity>
      ) : null}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E9E9EC', paddingVertical: 12, paddingHorizontal: 14 },
  text: { flex: 1, minWidth: 0, gap: 3 },
  name: { fontSize: 16, fontWeight: '600', color: INK, letterSpacing: -0.2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  meta: { fontSize: 13, color: MUTED, flexShrink: 1, fontVariant: ['tabular-nums'] },
  quick: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center' },
});

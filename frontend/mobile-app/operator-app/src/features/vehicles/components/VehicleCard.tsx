import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { ChevronRight, Navigation, Truck, TriangleAlert } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { resolveMediaUrl } from '@mercon/mobile-shared/lib/media';
import { Chip, INK, MUTED } from '../../trips/details/components/parts';
import { TONE, type Tone } from '../../trips/details/tripDetailsModel';
import { formatCapacityKg, formatOdometer } from '../services/vehiclesService';
import type { AssetStatus, VehicleListItem } from '../types';

interface VehicleCardProps {
  vehicle: VehicleListItem;
  onView?: (vehicle: VehicleListItem) => void;
  onTrackTrip?: (tripId: string) => void;
}

const STATUS: Record<AssetStatus, { label: string; tone: Tone }> = {
  Available: { label: 'Available', tone: 'green' },
  OnTrip: { label: 'On trip', tone: 'blue' },
  Maintenance: { label: 'Maintenance', tone: 'amber' },
  Inactive: { label: 'Inactive', tone: 'gray' },
};

/** "MUHAMMAD YASIN KHAIR DIN" -> "Muhammad Yasin Khair Din" (driver names arrive upper-cased). */
function titleCase(name: string): string {
  return name.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** One truck in the list: photo, plate and status, its two numbers on one line, then who drives it. */
export function VehicleCard({ vehicle, onView, onTrackTrip }: VehicleCardProps) {
  const status = STATUS[vehicle.status] ?? STATUS.Inactive;
  const onTrip = vehicle.status === 'OnTrip' && !!vehicle.activeTrip;
  const maintenance = vehicle.activeMaintenance;
  const driver = vehicle.assignedDriver;
  const photo = resolveMediaUrl(vehicle.imageUrl);
  const avatar = resolveMediaUrl(driver?.avatarUrl);

  return (
    <TouchableOpacity style={s.card} activeOpacity={onView ? 0.8 : 1} onPress={onView ? () => onView(vehicle) : undefined}>
      <View style={s.top}>
        {photo ? (
          <Image source={{ uri: photo }} style={s.photo} contentFit="cover" />
        ) : (
          <View style={[s.photo, s.photoEmpty]}>
            <Truck size={24} color={MUTED} strokeWidth={1.9} />
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <View style={s.titleRow}>
            <Text style={s.plate} numberOfLines={1}>{vehicle.plateNumber}</Text>
            <Chip label={status.label} tone={status.tone} dot />
          </View>
          <Text style={s.meta} numberOfLines={1}>
            {formatCapacityKg(vehicle.capacityKg)}  ·  {formatOdometer(vehicle.currentOdometer)}
            {vehicle.trailerNumber ? `  ·  Trailer ${vehicle.trailerNumber}` : ''}
          </Text>
        </View>
      </View>

      <View style={s.foot}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={s.avatar} contentFit="cover" />
        ) : (
          <View style={[s.avatar, s.avatarEmpty]}>
            <Text style={s.avatarText}>{driver ? initials(driver.name) : '–'}</Text>
          </View>
        )}
        <Text style={[s.driver, !driver && { color: MUTED }]} numberOfLines={1}>
          {driver ? titleCase(driver.name) : 'No driver assigned'}
        </Text>
        <ChevronRight size={18} color="#A1A1AA" />
      </View>

      {onTrip && vehicle.activeTrip ? (
        <TouchableOpacity
          style={[s.note, { backgroundColor: TONE.blue.bg }]}
          activeOpacity={onTrackTrip ? 0.7 : 1}
          onPress={onTrackTrip ? () => onTrackTrip(vehicle.activeTrip!.id) : undefined}
        >
          <Navigation size={14} color={TONE.blue.fg} strokeWidth={2.3} />
          <Text style={[s.noteText, { color: TONE.blue.fg }]} numberOfLines={1}>
            {vehicle.activeTrip.customerName ?? 'On an active trip'}
          </Text>
        </TouchableOpacity>
      ) : null}

      {maintenance ? (
        <View style={[s.note, { backgroundColor: TONE.amber.bg }]}>
          <TriangleAlert size={14} color={TONE.amber.fg} strokeWidth={2.3} />
          <Text style={[s.noteText, { color: TONE.amber.fg }]} numberOfLines={1}>
            {maintenance.maintenanceType}
            {maintenance.workshopName ? ` · ${maintenance.workshopName}` : ''}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: '#E9E9EC', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 4 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  photo: { width: 60, height: 60, borderRadius: 14, backgroundColor: '#F4F4F5', borderWidth: 1, borderColor: '#E9E9EC' },
  photoEmpty: { alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  plate: { flex: 1, fontSize: 18, fontWeight: '800', color: INK, letterSpacing: 0.3 },
  meta: { fontSize: 13, color: MUTED, fontVariant: ['tabular-nums'] },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F1F1F3' },
  avatar: { width: 26, height: 26, borderRadius: 13 },
  avatarEmpty: { backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 10, fontWeight: '700', color: MUTED },
  driver: { flex: 1, fontSize: 14, fontWeight: '600', color: INK },
  note: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 10 },
  noteText: { flex: 1, fontSize: 13, fontWeight: '600' },
});

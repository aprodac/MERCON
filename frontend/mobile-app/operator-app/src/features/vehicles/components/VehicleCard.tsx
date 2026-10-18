import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { ChevronRight, History, MapPin, Truck, TriangleAlert } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { resolveMediaUrl } from '@mercon/mobile-shared/lib/media';
import { Chip, INK, MUTED } from '../../trips/details/components/parts';
import { TONE, type Tone } from '../../trips/details/tripDetailsModel';
import { formatCapacityKg, formatOdometer } from '../services/vehiclesService';
import type { AssetStatus, VehicleListItem } from '../types';
import { placeText } from '../services/place';
import { TripStepBar } from '@/components/TripStepBar';

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

/** "3 h ago", "2 days ago". */
function agoText(iso: string): string {
  const min = Math.max(0, (Date.now() - Date.parse(iso)) / 60_000);
  if (min < 60) return `${Math.round(min)} min ago`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h ago`;
  return `${Math.round(min / 1440)} days ago`;
}

/**
 * One truck in the list: photo, plate and status, its two numbers on one line, then who drives it.
 * On a trip: the route with one segment per step, green when done. Free: where it is now and
 * when its last trip ended (TestFlight: "available vehicles current location and last trip time").
 */
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
          style={s.tripBox}
          activeOpacity={onTrackTrip ? 0.7 : 1}
          onPress={onTrackTrip ? () => onTrackTrip(vehicle.activeTrip!.id) : undefined}
          accessibilityRole="button"
          accessibilityLabel="Open the trip"
        >
          <Text style={s.tripWho} numberOfLines={1}>
            {[vehicle.activeTrip.refId, vehicle.activeTrip.customerName ? titleCase(vehicle.activeTrip.customerName) : null].filter(Boolean).join(' · ') || 'On an active trip'}
          </Text>
          <TripStepBar stops={vehicle.activeTrip.stops} late={vehicle.activeTrip.status === 'Delayed'} />
        </TouchableOpacity>
      ) : null}

      {!onTrip && !maintenance && (vehicle.location || vehicle.lastTrip) ? (
        <View style={s.facts}>
          <View style={s.fact}>
            <MapPin size={13} color={MUTED} />
            <Text style={s.factText} numberOfLines={1}>
              {vehicle.location ? `${placeText(vehicle.location.lat, vehicle.location.lng)}${vehicle.location.ago ? ` · seen ${vehicle.location.ago}` : ''}` : 'No location yet'}
            </Text>
          </View>
          <View style={s.fact}>
            <History size={13} color={MUTED} />
            <Text style={s.factText} numberOfLines={1}>
              {vehicle.lastTrip
                ? `Last trip ${vehicle.lastTrip.endedAt ? `ended ${agoText(vehicle.lastTrip.endedAt)}` : ''}${vehicle.lastTrip.route ? ` · ${vehicle.lastTrip.route}` : ''}`
                : 'No trips yet'}
            </Text>
          </View>
        </View>
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
  tripBox: { backgroundColor: '#F6F8FD', borderRadius: 12, padding: 10, gap: 6, marginBottom: 10 },
  tripWho: { fontSize: 12, fontWeight: '700', color: TONE.blue.fg },
  facts: { gap: 5, marginBottom: 10, backgroundColor: '#F8F8F9', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  factText: { flex: 1, fontSize: 12.5, color: '#52525B' },
});

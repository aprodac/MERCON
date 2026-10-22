/**
 * One tappable line about a driver's phone — "Ready · 82% battery · seen 3 min
 * ago" with a coloured dot — that opens the full Driver activity screen.
 * Used on the driver page and under the driver on a trip (which opens it on
 * that trip's trail).
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Smartphone } from 'lucide-react-native';
import { Tile } from '@/components/pageCues';
import { INK, MUTED, tap } from '../../trips/details/components/parts';
import { TONE } from '../../trips/details/tripDetailsModel';
import { LEVEL_LABEL, LEVEL_TONE, batteryText, currentDevice, driverPhoneApi, driverPhoneKey, timeAgo } from './driverPhone';

export function PhoneActivityRow({
  driverId, driverName, tripId, tripRef, compact, style,
}: { driverId: string; driverName: string; tripId?: string; tripRef?: string | null; compact?: boolean; style?: StyleProp<ViewStyle> }) {
  const router = useRouter();
  const { data, isError } = useQuery({ queryKey: driverPhoneKey(driverId), queryFn: () => driverPhoneApi.details(driverId), staleTime: 30_000 });
  const device = currentDevice(data);
  const tone = data ? TONE[LEVEL_TONE[data.status.level]] : null;
  const battery = batteryText(device);
  const line = data
    ? [LEVEL_LABEL[data.status.level], battery && `${battery} battery`, `seen ${timeAgo(data.status.lastSeenAt)}`].filter(Boolean).join(' · ')
    : isError ? 'Phone status unavailable' : 'Checking phone…';
  const why = data?.status.reasons[0];
  // Which app build the driver runs (TestFlight 20 Oct: "show the driver's app version").
  const os = device?.os_name ? [device.os_name, device.os_version].filter(Boolean).join(' ') : null;
  const version = device?.app_version
    ? [`App ${device.app_version}${device.build_number ? ` (${device.build_number})` : ''}`, os].filter(Boolean).join(' · ')
    : data ? 'App version not reported yet' : null;

  const open = () => {
    tap();
    router.push({ pathname: '/driver-activity', params: { id: driverId, name: driverName, ...(tripId ? { tripId, tripRef: tripRef ?? '' } : {}) } });
  };

  return (
    <TouchableOpacity style={[s.row, style]} onPress={open} activeOpacity={0.6} accessibilityLabel="Driver phone and activity">
      {compact ? <Smartphone size={15} color={MUTED} /> : <Tile icon={Smartphone} />}
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        {compact ? null : <Text style={s.label}>Phone & activity</Text>}
        <View style={s.lineRow}>
          <View style={[s.dot, { backgroundColor: tone?.dot ?? '#C9CCD6' }]} />
          <Text style={[s.value, compact && s.compactValue, tone && data?.status.level !== 'green' && { color: tone.fg }]} numberOfLines={1}>{line}</Text>
        </View>
        {why ? <Text style={[s.why, tone && { color: tone.fg }]} numberOfLines={1}>{why}</Text> : null}
        {version ? <Text style={s.why} numberOfLines={1}>{version}</Text> : null}
      </View>
      <Text style={s.link}>{tripId ? 'Trail' : 'Activity'}</Text>
      <ChevronRight size={16} color="#A1A1AA" />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  label: { fontSize: 12, color: MUTED },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  value: { flex: 1, fontSize: 15, fontWeight: '600', color: INK },
  compactValue: { fontSize: 13 },
  why: { fontSize: 12, color: MUTED },
  link: { fontSize: 12, fontWeight: '700', color: MUTED },
});

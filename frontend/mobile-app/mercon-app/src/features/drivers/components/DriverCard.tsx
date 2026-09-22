import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Truck, Navigation, TriangleAlert } from 'lucide-react-native';
import { Colors, Radius, Shadows, Spacing } from '@/theme/tokens';
import { DriverAvatar } from './DriverAvatar';
import { DriverStatusBadge } from './DriverStatusBadge';
import { DriverTrips } from './DriverTrips';
import { DriverActionGroup } from './DriverActionGroup';
import { EXPIRY_SOON_DAYS, formatDaysLeft } from '../services/driverDetailsService';
import { driverFullName, driverInitials } from '../services/driversService';
import type { DriverListItem } from '../types';

interface DriverCardProps {
  driver: DriverListItem;
  onCall?: (driver: DriverListItem) => void;
  onTrack?: (driver: DriverListItem) => void;
  onView?: (driver: DriverListItem) => void;
  className?: string;
}

export function DriverCard({ driver, onCall, onTrack, onView, className }: DriverCardProps) {
  const onTrip = driver.status === 'OnTrip' && !!driver.activeTrip;
  const licenseExpired = driver.licenseDaysLeft !== null && driver.licenseDaysLeft < 0;
  const licenseExpiringSoon = driver.licenseDaysLeft !== null && !licenseExpired && driver.licenseDaysLeft <= EXPIRY_SOON_DAYS;
  const vehiclePlate = driver.activeTrip?.vehiclePlate ?? driver.assignedVehicle?.plateNumber ?? null;

  return (
    <View
      className={`bg-white p-4 ${className ?? ''}`}
      style={{ borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.coolGray, ...Shadows.sm }}
    >
      {/* Header — avatar, name + status/phone, total trips */}
      <TouchableOpacity
        activeOpacity={onView ? 0.7 : 1}
        onPress={onView ? () => onView(driver) : undefined}
        className="flex-row items-center"
        style={{ gap: Spacing.md }}
      >
        <DriverAvatar
          initials={driverInitials(driver)}
          avatarUrl={driver.avatarUrl}
          status={driver.status}
          size={52}
        />

        <View className="flex-1" style={{ gap: 4 }}>
          <Text numberOfLines={1} style={{ color: Colors.charcoal }} className="text-[16px] font-bold">
            {driverFullName(driver)}
          </Text>
          <View className="flex-row items-center" style={{ gap: Spacing.sm }}>
            <DriverStatusBadge status={driver.status} />
            {driver.phone && (
              <Text numberOfLines={1} style={{ color: Colors.gray400 }} className="flex-1 text-[12px] font-medium">
                {driver.phone}
              </Text>
            )}
          </View>
        </View>

        {driver.totalTrips !== null && <DriverTrips totalTrips={driver.totalTrips} />}
      </TouchableOpacity>

      {/* Operational details — vehicle assignment + (only when it matters) license expiry */}
      <View style={{ marginTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.coolGray, paddingTop: Spacing.sm, gap: Spacing.xs }}>
        {onTrip && driver.activeTrip ? (
          <TouchableOpacity
            activeOpacity={onTrack ? 0.7 : 1}
            onPress={onTrack ? () => onTrack(driver) : undefined}
            className="flex-row items-center justify-between"
            style={{ borderRadius: Radius.md, backgroundColor: Colors.accentLight, borderWidth: 1, borderColor: '#FDE3DF', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm }}
          >
            <View className="flex-row items-center flex-1" style={{ gap: Spacing.sm }}>
              <View className="items-center justify-center" style={{ width: 28, height: 28, borderRadius: Radius.sm, backgroundColor: Colors.primary }}>
                <Truck size={14} color={Colors.white} strokeWidth={2.2} />
              </View>
              <View className="flex-1">
                <Text style={{ color: Colors.primary }} className="text-[11px] font-bold uppercase tracking-wider">
                  On Trip · {driver.activeTrip.status}
                </Text>
                <Text numberOfLines={1} style={{ color: Colors.charcoal }} className="text-[13px] font-semibold">
                  {vehiclePlate ?? 'Assigned vehicle'}
                </Text>
              </View>
            </View>
            <Navigation size={16} color={Colors.primary} strokeWidth={2} />
          </TouchableOpacity>
        ) : (
          <View className="flex-row items-center" style={{ gap: Spacing.sm }}>
            <Truck size={14} color={Colors.gray500} strokeWidth={2} />
            <Text numberOfLines={1} style={{ color: Colors.gray600 }} className="flex-1 text-[13px] font-medium">
              {vehiclePlate ?? 'No vehicle assigned'}
            </Text>
          </View>
        )}

        {(licenseExpired || licenseExpiringSoon) && (
          <View className="flex-row items-center" style={{ gap: Spacing.sm }}>
            <TriangleAlert size={13} color={licenseExpired ? Colors.danger : Colors.warning} strokeWidth={2} />
            <Text
              numberOfLines={1}
              style={{ color: licenseExpired ? Colors.danger : Colors.warning }}
              className="flex-1 text-[12px] font-semibold"
            >
              License {formatDaysLeft(driver.licenseDaysLeft)}
            </Text>
          </View>
        )}
      </View>

      {/* Actions */}
      <View style={{ marginTop: Spacing.sm }}>
        <DriverActionGroup
          onTrip={onTrip}
          canCall={!!driver.phone}
          onCall={onCall ? () => onCall(driver) : undefined}
          onTrack={onTrack ? () => onTrack(driver) : undefined}
          onView={onView ? () => onView(driver) : undefined}
        />
      </View>
    </View>
  );
}

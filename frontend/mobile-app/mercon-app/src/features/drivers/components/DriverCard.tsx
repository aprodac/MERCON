import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { ShieldCheck, Truck, Navigation, FileText } from 'lucide-react-native';
import { DriverAvatar } from './DriverAvatar';
import { DriverStatusBadge } from './DriverStatusBadge';
import { DriverTrips } from './DriverTrips';
import { DriverActionGroup } from './DriverActionGroup';
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

  return (
    <View
      className={`rounded-2xl border border-[#EEF1F6] bg-white p-4.5 ${className ?? ''}`}
      style={{
        shadowColor: '#3E3C3D',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.04,
        shadowRadius: 10,
        elevation: 2,
      }}
    >
      {/* Header — avatar, name + status, total trips badge */}
      <TouchableOpacity
        activeOpacity={onView ? 0.7 : 1}
        onPress={onView ? () => onView(driver) : undefined}
        className="flex-row items-center gap-3.5"
      >
        <DriverAvatar
          initials={driverInitials(driver)}
          avatarUrl={driver.avatarUrl}
          status={driver.status}
          size={52}
        />

        <View className="flex-1 gap-1">
          <Text numberOfLines={1} className="text-[16px] font-bold text-[#3E3C3D]">
            {driverFullName(driver)}
          </Text>
          <View className="flex-row items-center gap-2">
            <DriverStatusBadge status={driver.status} />
            {driver.phone && (
              <Text numberOfLines={1} className="text-[12px] font-medium text-gray-400">
                • {driver.phone}
              </Text>
            )}
          </View>
        </View>

        {driver.totalTrips !== null && (
          <View className="items-end">
            <DriverTrips totalTrips={driver.totalTrips} />
          </View>
        )}
      </TouchableOpacity>

      {/* Operational Details Container */}
      <View className="mt-3.5 border-t border-[#EEF1F6] pt-3">
        {onTrip && driver.activeTrip ? (
          /* Active Trip Live Banner */
          <TouchableOpacity
            activeOpacity={onTrack ? 0.7 : 1}
            onPress={onTrack ? () => onTrack(driver) : undefined}
            className="flex-row items-center justify-between rounded-xl bg-[#FFF5F3] px-3.5 py-2.5 border border-[#FDE3DF]"
          >
            <View className="flex-row items-center gap-2.5">
              <View className="h-7 w-7 items-center justify-center rounded-lg bg-[#FA634E]">
                <Truck size={14} color="#FFFFFF" strokeWidth={2.2} />
              </View>
              <View>
                <Text className="text-[11px] font-bold uppercase tracking-wider text-[#FA634E]">
                  Active Trip ({driver.activeTrip.status})
                </Text>
                <Text numberOfLines={1} className="text-[13px] font-semibold text-[#3E3C3D]">
                  Vehicle: {driver.activeTrip.vehiclePlate ?? 'Assigned Vehicle'}
                </Text>
              </View>
            </View>
            <Navigation size={16} color="#FA634E" strokeWidth={2} />
          </TouchableOpacity>
        ) : (
          /* Idle / Available Status Summary */
          <View className="flex-row items-center justify-between px-1 py-1">
            <View className="flex-row items-center gap-2">
              <Truck size={14} color="#71717A" strokeWidth={2} />
              <Text numberOfLines={1} className="text-[13px] font-medium text-gray-600">
                Vehicle: {driver.activeTrip?.vehiclePlate ?? 'Default Unassigned'}
              </Text>
            </View>

            <View className="flex-row items-center gap-1.5">
              <FileText size={13} color="#71717A" strokeWidth={2} />
              <Text numberOfLines={1} className="text-[12px] font-medium text-gray-500">
                Lic: {driver.licenseNumber ? driver.licenseNumber.slice(0, 10) : 'Recorded'}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Actions */}
      <View className="mt-3">
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

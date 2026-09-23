import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Truck, Gauge, Weight, TriangleAlert, Navigation, User, Wrench } from 'lucide-react-native';
import { Colors, Radius, Shadows, Spacing } from '@/theme/tokens';
import { VehicleStatusBadge } from './VehicleStatusBadge';
import { formatCapacityKg, formatOdometer } from '../services/vehiclesService';
import type { VehicleListItem } from '../types';

interface VehicleCardProps {
  vehicle: VehicleListItem;
  onView?: (vehicle: VehicleListItem) => void;
  onTrackTrip?: (tripId: string) => void;
  className?: string;
}

export function VehicleCard({ vehicle, onView, onTrackTrip, className }: VehicleCardProps) {
  const onTrip = vehicle.status === 'OnTrip' && !!vehicle.activeTrip;
  const inMaintenance = vehicle.status === 'Maintenance' || !!vehicle.activeMaintenance;

  const trailerText = vehicle.trailerNumber
    ? `Trailer ${vehicle.trailerNumber}${vehicle.trailerType ? ` (${vehicle.trailerType})` : ''}`
    : null;

  return (
    <TouchableOpacity
      activeOpacity={onView ? 0.9 : 1}
      onPress={onView ? () => onView(vehicle) : undefined}
      className={`bg-white p-4 ${className ?? ''}`}
      style={{ borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.coolGray, ...Shadows.sm }}
    >
      {/* Header — Icon, Plate Number + Asset Type / Trailer, Status Badge */}
      <View className="flex-row items-center" style={{ gap: Spacing.md }}>
        <View
          className="items-center justify-center"
          style={{
            width: 44,
            height: 44,
            borderRadius: Radius.md,
            backgroundColor: onTrip ? Colors.accentLight : Colors.gray100,
          }}
        >
          <Truck size={22} color={onTrip ? Colors.primary : Colors.charcoal} strokeWidth={2} />
        </View>

        <View className="flex-1" style={{ gap: 2 }}>
          <Text numberOfLines={1} style={{ color: Colors.charcoal }} className="text-[16px] font-extrabold">
            {vehicle.plateNumber}
          </Text>
          <Text numberOfLines={1} style={{ color: Colors.gray500 }} className="text-[12px] font-medium">
            {vehicle.assetType}
            {trailerText ? ` · ${trailerText}` : ''}
          </Text>
        </View>

        <VehicleStatusBadge status={vehicle.status} />
      </View>

      {/* Details & Context Rows */}
      <View style={{ marginTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.coolGray, paddingTop: Spacing.sm, gap: Spacing.xs }}>
        {/* Specs: Capacity & Odometer */}
        <View className="flex-row items-center justify-between" style={{ gap: Spacing.sm }}>
          <View className="flex-row items-center" style={{ gap: 6 }}>
            <Weight size={13} color={Colors.gray500} strokeWidth={2} />
            <Text numberOfLines={1} style={{ color: Colors.gray600 }} className="text-[12px] font-medium">
              Capacity: <Text style={{ color: Colors.charcoal, fontWeight: '600' }}>{formatCapacityKg(vehicle.capacityKg)}</Text>
            </Text>
          </View>

          <View className="flex-row items-center" style={{ gap: 6 }}>
            <Gauge size={13} color={Colors.gray500} strokeWidth={2} />
            <Text numberOfLines={1} style={{ color: Colors.gray600 }} className="text-[12px] font-medium">
              Odo: <Text style={{ color: Colors.charcoal, fontWeight: '600' }}>{formatOdometer(vehicle.currentOdometer)}</Text>
            </Text>
          </View>
        </View>

        {/* Assigned Driver Row */}
        <View className="flex-row items-center" style={{ gap: Spacing.sm }}>
          <User size={14} color={Colors.gray500} strokeWidth={2} />
          <Text numberOfLines={1} style={{ color: Colors.gray600 }} className="flex-1 text-[13px] font-medium">
            {vehicle.assignedDriver ? (
              <>
                Assigned Driver:{' '}
                <Text style={{ color: Colors.charcoal, fontWeight: '600' }}>
                  {vehicle.assignedDriver.name}
                </Text>
              </>
            ) : (
              'No driver assigned'
            )}
          </Text>
        </View>

        {/* Active Trip Banner */}
        {onTrip && vehicle.activeTrip && (
          <TouchableOpacity
            activeOpacity={onTrackTrip ? 0.7 : 1}
            onPress={onTrackTrip ? () => onTrackTrip(vehicle.activeTrip!.id) : undefined}
            className="flex-row items-center justify-between mt-1"
            style={{
              borderRadius: Radius.md,
              backgroundColor: Colors.accentLight,
              borderWidth: 1,
              borderColor: '#FDE3DF',
              paddingHorizontal: Spacing.md,
              paddingVertical: Spacing.sm,
            }}
          >
            <View className="flex-row items-center flex-1" style={{ gap: Spacing.sm }}>
              <View className="items-center justify-center" style={{ width: 28, height: 28, borderRadius: Radius.sm, backgroundColor: Colors.primary }}>
                <Truck size={14} color={Colors.white} strokeWidth={2.2} />
              </View>
              <View className="flex-1">
                <Text style={{ color: Colors.primary }} className="text-[11px] font-bold uppercase tracking-wider">
                  On Trip · {vehicle.activeTrip.status}
                </Text>
                <Text numberOfLines={1} style={{ color: Colors.charcoal }} className="text-[13px] font-semibold">
                  {vehicle.activeTrip.customerName ?? 'Active Trip'}
                  {vehicle.activeTrip.driverName ? ` (${vehicle.activeTrip.driverName})` : ''}
                </Text>
              </View>
            </View>
            <Navigation size={16} color={Colors.primary} strokeWidth={2} />
          </TouchableOpacity>
        )}

        {/* Maintenance Warning Chip */}
        {inMaintenance && vehicle.activeMaintenance && (
          <View
            className="flex-row items-center mt-1"
            style={{
              borderRadius: Radius.md,
              backgroundColor: Colors.warningLight,
              borderWidth: 1,
              borderColor: '#FEF3C7',
              paddingHorizontal: Spacing.md,
              paddingVertical: Spacing.sm,
              gap: Spacing.sm,
            }}
          >
            <TriangleAlert size={14} color={Colors.warning} strokeWidth={2.2} />
            <View className="flex-1">
              <Text style={{ color: Colors.warning }} className="text-[11px] font-bold uppercase tracking-wider">
                Maintenance · {vehicle.activeMaintenance.status}
              </Text>
              <Text numberOfLines={1} style={{ color: Colors.charcoal }} className="text-[12px] font-medium">
                {vehicle.activeMaintenance.maintenanceType}
                {vehicle.activeMaintenance.workshopName ? ` at ${vehicle.activeMaintenance.workshopName}` : ''}
              </Text>
            </View>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

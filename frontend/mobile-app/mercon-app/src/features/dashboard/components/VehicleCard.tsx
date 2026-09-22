import React from 'react';
import { Text, TouchableOpacity, View, Linking, type ImageSourcePropType } from 'react-native';
import { Share2 } from 'lucide-react-native';
import { DriverAvatar } from './DriverAvatar';
import { DriverStatus } from './DriverStatus';
import { RoutePreview } from './RoutePreview';
import { StatusBadge } from './StatusBadge';
import type { VehicleCardStatus, TripStatus } from '../types';

export interface VehicleCardDriver {
  initials: string;
  name: string;
  online: boolean;
  imageUri?: ImageSourcePropType;
}

export interface VehicleCardVehicle {
  truckId: string;
  model: string;
  capacityKg: number;
}

export interface VehicleCardRoute {
  originLabel: string;
  destinationLabel: string;
  progress?: number;
}

interface VehicleCardProps {
  driver: VehicleCardDriver;
  vehicle: VehicleCardVehicle;
  route: VehicleCardRoute;
  status: VehicleCardStatus;
  lastLocation?: { lat: number; lng: number } | null;
  currentTrip?: { id: string; status: TripStatus };
  onPress?: () => void;
  onSharePress?: () => void;
  width?: number;
  className?: string;
}

export function VehicleCard({
  driver,
  vehicle,
  route,
  status,
  onPress,
  onSharePress,
  width,
  className,
}: VehicleCardProps) {
  const openMaps = () => {
    const origin = encodeURIComponent(route.originLabel || 'Riyadh');
    const dest = encodeURIComponent(route.destinationLabel || 'Dammam');
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}`;
    Linking.openURL(mapsUrl).catch(() => {});
  };

  const formattedCapacity = vehicle.capacityKg > 0
    ? `${(vehicle.capacityKg / 1000).toFixed(1).replace(/\.0$/, '')} Ton`
    : '—';

  return (
    <View
      style={width ? { width } : undefined}
      className={`gap-3.5 rounded-3xl border border-gray-100 bg-white p-4 shadow-sm ${className ?? ''}`}
    >
      {/* Top Bar: Driver Avatar + Name + Online Dot + Share Button (Top Right) */}
      <View className="flex-row items-center justify-between">
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onPress}
          className="flex-row items-center gap-2.5 flex-1 pr-1"
        >
          <DriverAvatar initials={driver.initials} imageUri={driver.imageUri} size={44} />
          <View className="flex-1">
            <Text numberOfLines={1} className="text-sm font-bold text-gray-900">
              {driver.name}
            </Text>
            <DriverStatus online={driver.online} className="mt-0.5" />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onSharePress || onPress}
          className="h-8 w-8 rounded-xl bg-gray-50 border border-gray-200/80 items-center justify-center"
        >
          <Share2 size={15} color="#3E3C3D" strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {/* Middle Block: Interactive Map Route Preview (Opens Google Maps on tap) */}
      <TouchableOpacity activeOpacity={0.9} onPress={openMaps}>
        <RoutePreview
          originLabel={route.originLabel}
          destinationLabel={route.destinationLabel}
          progress={route.progress ?? 0.5}
          height={125}
        />
      </TouchableOpacity>

      {/* Bottom Block: Info Rows (Truck ID, Model, Capacity, Status Badge) */}
      <TouchableOpacity activeOpacity={0.85} onPress={onPress} className="gap-2 pt-0.5">
        <View className="flex-row items-center justify-between">
          <Text className="text-xs font-semibold text-blue-600">Truck ID</Text>
          <Text className="text-xs font-black text-gray-900">{vehicle.truckId}</Text>
        </View>

        <View className="flex-row items-center justify-between">
          <Text className="text-xs font-semibold text-blue-600">Model</Text>
          <Text className="text-xs font-bold text-gray-800" numberOfLines={1}>
            {vehicle.model}
          </Text>
        </View>

        <View className="flex-row items-center justify-between">
          <Text className="text-xs font-semibold text-blue-600">Capacity</Text>
          <Text className="text-xs font-bold text-gray-800">{formattedCapacity}</Text>
        </View>

        <View className="flex-row items-center justify-between pt-0.5">
          <Text className="text-xs font-semibold text-blue-600">Status</Text>
          <StatusBadge status={status} />
        </View>
      </TouchableOpacity>
    </View>
  );
}

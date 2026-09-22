import React from 'react';
import { Text, TouchableOpacity, View, Linking, type ImageSourcePropType } from 'react-native';
import { Share2, Building2, MapPin, ArrowRight, Clock } from 'lucide-react-native';
import { DriverAvatar } from './DriverAvatar';
import { DriverStatus } from './DriverStatus';
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
  distanceStr?: string;
  etaStr?: string;
  stopsCount?: number;
}

interface VehicleCardProps {
  driver: VehicleCardDriver;
  vehicle: VehicleCardVehicle;
  route: VehicleCardRoute;
  customerName?: string | null;
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
  customerName,
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
      className={`gap-3 rounded-3xl border border-gray-100 bg-white p-4 shadow-sm ${className ?? ''}`}
    >
      {/* 1. Top Bar: Driver Profile Avatar + Driver Name + Online Status + WhatsApp Share Button */}
      <View className="flex-row items-center justify-between">
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onPress}
          className="flex-row items-center gap-2.5 flex-1 pr-1"
        >
          <DriverAvatar
            initials={driver.initials}
            imageUri={driver.imageUri}
            size={44}
            online={driver.online}
          />
          <View className="flex-1">
            <Text numberOfLines={1} className="text-sm font-black text-gray-900">
              {driver.name}
            </Text>
            <DriverStatus online={driver.online} className="mt-0.5" />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onSharePress || onPress}
          className="h-8 w-8 rounded-xl bg-[#25D366]/10 border border-[#25D366]/30 items-center justify-center"
        >
          <Share2 size={15} color="#128C7E" strokeWidth={2.2} />
        </TouchableOpacity>
      </View>

      {/* 2. Customer / Client Profile Banner */}
      {customerName ? (
        <View className="flex-row items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-200/70">
          <Building2 size={12} color="#FA634E" strokeWidth={2.2} />
          <Text className="text-[10px] font-extrabold text-slate-700 uppercase tracking-wider flex-1" numberOfLines={1}>
            {customerName}
          </Text>
        </View>
      ) : null}

      {/* 3. Colorful, Compact Route & Stops UI Container (Replaces Heavy Map Box) */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={openMaps}
        className="bg-orange-50/50 rounded-2xl p-3 border border-orange-100/80 gap-2"
      >
        <View className="flex-row items-center justify-between">
          {/* Origin */}
          <View className="flex-row items-center gap-1.5 flex-1 pr-1">
            <View className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <Text className="text-xs font-black text-gray-900 truncate">
              {route.originLabel}
            </Text>
          </View>

          <ArrowRight size={13} color="#FA634E" strokeWidth={2.5} />

          {/* Destination */}
          <View className="flex-row items-center gap-1.5 flex-1 pl-1 justify-end">
            <Text className="text-xs font-black text-gray-900 truncate text-right">
              {route.destinationLabel}
            </Text>
            <View className="h-2.5 w-2.5 rounded-full bg-orange-500" />
          </View>
        </View>

        {/* Intermediate Stops Pill (If any) */}
        {route.stopsCount && route.stopsCount > 2 ? (
          <View className="flex-row items-center gap-1 self-center bg-white px-2 py-0.5 rounded-full border border-orange-200">
            <MapPin size={10} color="#FA634E" />
            <Text className="text-[10px] font-extrabold text-orange-600">
              +{route.stopsCount - 2} Intermediate Stops
            </Text>
          </View>
        ) : null}

        {/* Distance & ETA Row */}
        <View className="flex-row items-center justify-between pt-1.5 border-t border-orange-100/90">
          <Text className="text-[11px] font-medium text-gray-500">
            Dist: <Text className="font-bold text-gray-900">{route.distanceStr || '—'}</Text>
          </Text>
          <View className="flex-row items-center gap-1">
            <Clock size={11} color="#6E6E80" />
            <Text className="text-[11px] font-medium text-gray-500">
              ETA: <Text className="font-bold text-gray-900">{route.etaStr || '—'}</Text>
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* 4. Vehicle & Trip Details Rows (Truck ID, Model/Type, Capacity, Status) */}
      <TouchableOpacity activeOpacity={0.85} onPress={onPress} className="gap-1.5 pt-0.5">
        <View className="flex-row items-center justify-between">
          <Text className="text-xs font-bold text-blue-600">Truck ID</Text>
          <Text className="text-xs font-black text-gray-900">{vehicle.truckId}</Text>
        </View>

        <View className="flex-row items-center justify-between">
          <Text className="text-xs font-bold text-blue-600">Model / Type</Text>
          <Text className="text-xs font-bold text-gray-800" numberOfLines={1}>
            {vehicle.model}
          </Text>
        </View>

        <View className="flex-row items-center justify-between">
          <Text className="text-xs font-bold text-blue-600">Capacity</Text>
          <Text className="text-xs font-bold text-gray-800">{formattedCapacity}</Text>
        </View>

        <View className="flex-row items-center justify-between pt-0.5">
          <Text className="text-xs font-bold text-blue-600">Status</Text>
          <StatusBadge status={status} />
        </View>
      </TouchableOpacity>
    </View>
  );
}

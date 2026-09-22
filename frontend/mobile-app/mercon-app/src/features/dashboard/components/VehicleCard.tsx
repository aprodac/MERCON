import React, { useState } from 'react';
import { Text, TouchableOpacity, View, Linking, Image, type ImageSourcePropType } from 'react-native';
import { Share2, MapPin, ArrowRight, Clock, Truck } from 'lucide-react-native';
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

export interface VehicleCardCustomer {
  id?: string;
  name: string;
  logoUrl?: string | null;
}

interface VehicleCardProps {
  driver: VehicleCardDriver;
  vehicle: VehicleCardVehicle;
  route: VehicleCardRoute;
  customer?: VehicleCardCustomer | string | null;
  customerName?: string | null;
  status: VehicleCardStatus;
  lastLocation?: { lat: number; lng: number } | null;
  currentTrip?: { id: string; status: TripStatus };
  onPress?: () => void;
  onSharePress?: () => void;
  width?: number;
  className?: string;
}

export function CustomerProfileBadge({ customer }: { customer: VehicleCardCustomer }) {
  const [hasLogoError, setHasLogoError] = useState(false);

  const showLogo = Boolean(customer.logoUrl && !hasLogoError);

  const initials = customer.name
    ? customer.name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase()
    : 'C';

  return (
    <View className="flex-row items-center gap-2.5 bg-slate-50 px-3 py-1.5 rounded-2xl border border-slate-200/80">
      {showLogo ? (
        <Image
          source={{ uri: customer.logoUrl! }}
          style={{ width: 22, height: 22, borderRadius: 6 }}
          onError={() => setHasLogoError(true)}
          resizeMode="cover"
        />
      ) : (
        <View className="h-5 w-5 rounded-md bg-[#FA634E]/10 border border-[#FA634E]/30 items-center justify-center">
          <Text className="text-[10px] font-black text-[#FA634E]">{initials}</Text>
        </View>
      )}
      <View className="flex-1 pr-1">
        <Text className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest leading-none mb-0.5">
          CUSTOMER
        </Text>
        <Text numberOfLines={1} className="text-xs font-black text-slate-800">
          {customer.name}
        </Text>
      </View>
    </View>
  );
}

export function VehicleCard({
  driver,
  vehicle,
  route,
  customer,
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

  const resolvedCustomer: VehicleCardCustomer | null = typeof customer === 'object' && customer !== null
    ? customer
    : (customerName || typeof customer === 'string')
    ? { name: typeof customer === 'string' ? customer : customerName! }
    : null;

  return (
    <View
      style={width ? { width } : undefined}
      className={`gap-3 rounded-3xl border border-slate-200/90 bg-white p-4 shadow-sm ${className ?? ''}`}
    >
      {/* 1. Header: Driver Profile + Driver Name + Status + Share Action */}
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
            <Text numberOfLines={1} className="text-sm font-black text-slate-900">
              {driver.name}
            </Text>
            <DriverStatus online={driver.online} className="mt-0.5" />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onSharePress || onPress}
          className="h-9 w-9 rounded-2xl bg-[#25D366]/10 border border-[#25D366]/30 items-center justify-center"
        >
          <Share2 size={16} color="#128C7E" strokeWidth={2.2} />
        </TouchableOpacity>
      </View>

      {/* 2. Customer Profile Badge (Avatar / Initials + Customer Name) */}
      {resolvedCustomer ? <CustomerProfileBadge customer={resolvedCustomer} /> : null}

      {/* 3. Sleek Colorful Logistics Route & Stops Container */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={openMaps}
        className="bg-orange-50/60 rounded-2xl p-3 border border-orange-100/90 gap-2.5"
      >
        <View className="flex-row items-center justify-between gap-1.5">
          {/* Origin */}
          <View className="flex-1 pr-1">
            <View className="flex-row items-center gap-1 mb-0.5">
              <View className="h-2 w-2 rounded-full bg-emerald-500" />
              <Text className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">ORIGIN</Text>
            </View>
            <Text numberOfLines={1} className="text-xs font-black text-slate-900">
              {route.originLabel}
            </Text>
          </View>

          <View className="bg-white/80 p-1.5 rounded-full border border-orange-200/60">
            <ArrowRight size={12} color="#FA634E" strokeWidth={2.5} />
          </View>

          {/* Destination */}
          <View className="flex-1 pl-1 items-end">
            <View className="flex-row items-center gap-1 mb-0.5">
              <Text className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">DESTINATION</Text>
              <View className="h-2 w-2 rounded-full bg-orange-500" />
            </View>
            <Text numberOfLines={1} className="text-xs font-black text-slate-900 text-right">
              {route.destinationLabel}
            </Text>
          </View>
        </View>

        {/* Intermediate Stops Pill */}
        {route.stopsCount && route.stopsCount > 2 ? (
          <View className="flex-row items-center justify-center gap-1 self-center bg-white px-2.5 py-0.5 rounded-full border border-orange-200">
            <MapPin size={10} color="#FA634E" />
            <Text className="text-[10px] font-extrabold text-orange-600">
              +{route.stopsCount - 2} Intermediate Stops
            </Text>
          </View>
        ) : null}

        {/* Distance & ETA Row */}
        <View className="flex-row items-center justify-between pt-2 border-t border-orange-100">
          <View className="flex-row items-center gap-1">
            <MapPin size={11} color="#64748B" />
            <Text className="text-[11px] font-medium text-slate-500">
              Dist: <Text className="font-extrabold text-slate-900">{route.distanceStr || '—'}</Text>
            </Text>
          </View>
          <View className="flex-row items-center gap-1">
            <Clock size={11} color="#64748B" />
            <Text className="text-[11px] font-medium text-slate-500">
              ETA: <Text className="font-extrabold text-slate-900">{route.etaStr || '—'}</Text>
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* 4. Compact Specs Grid Container */}
      <TouchableOpacity activeOpacity={0.85} onPress={onPress} className="bg-slate-50 p-2.5 rounded-2xl border border-slate-200/60 gap-2">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-1.5">
            <Truck size={13} color="#3E3C3D" />
            <Text className="text-xs font-black text-slate-900">{vehicle.truckId}</Text>
          </View>
          <StatusBadge status={status} />
        </View>

        <View className="flex-row items-center justify-between pt-1 border-t border-slate-200/60">
          <Text className="text-[11px] font-bold text-slate-500">
            Type: <Text className="font-extrabold text-slate-800">{vehicle.model}</Text>
          </Text>
          <Text className="text-[11px] font-bold text-slate-500">
            Cap: <Text className="font-extrabold text-slate-800">{formattedCapacity}</Text>
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

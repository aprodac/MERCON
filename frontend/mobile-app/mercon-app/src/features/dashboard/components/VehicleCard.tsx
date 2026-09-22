import React, { useState } from 'react';
import { Text, TouchableOpacity, View, Linking, Image, type ImageSourcePropType } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { MapPin, ArrowRight, Clock, Truck } from 'lucide-react-native';
import { DriverAvatar } from './DriverAvatar';
import { DriverStatus } from './DriverStatus';
import { StatusBadge } from './StatusBadge';
import type { VehicleCardStatus, TripStatus } from '../types';
import { API_URL } from '@/lib/api';

export function resolveMediaUrl(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  const origin = API_URL ? API_URL.replace(/\/api(\/v\d+)?\/?$/, '') : 'https://dev.mercon.tech';
  const cleanPath = url.startsWith('/') ? url : `/${url}`;
  return `${origin}${cleanPath}`;
}

export function WhatsAppIcon({ size = 16, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414-.074-.124-.272-.198-.57-.347z"
        fill={color}
      />
      <Path
        d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.975-1.402A9.954 9.954 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a7.96 7.96 0 01-4.074-1.116l-.292-.173-2.96.835.836-2.905-.187-.298A7.954 7.954 0 014 12c0-4.411 3.589-8 8-8s8 3.589 8 8-3.589 8-8 8z"
        fill={color}
      />
    </Svg>
  );
}

export interface VehicleCardDriver {
  initials: string;
  name: string;
  online: boolean;
  imageUri?: ImageSourcePropType;
}

export interface VehicleCardVehicle {
  truckId: string;
  model: string;
  typeLabel?: string;
  capacityKg: number;
}

export interface VehicleCardRoute {
  originLabel: string;
  originSublabel?: string;
  destinationLabel: string;
  destinationSublabel?: string;
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
  onCustomerPress?: () => void;
  width?: number;
  className?: string;
}

export function CustomerProfileRow({
  customer,
  onPress,
  onSharePress,
}: {
  customer: VehicleCardCustomer;
  onPress?: () => void;
  onSharePress?: () => void;
}) {
  const [hasLogoError, setHasLogoError] = useState(false);

  const resolvedLogoUrl = resolveMediaUrl(customer.logoUrl);
  const showLogo = Boolean(resolvedLogoUrl && !hasLogoError);

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
    <View className="flex-row items-center justify-between py-1">
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onPress}
        className="flex-row items-center gap-2 flex-1 pr-2"
      >
        {showLogo ? (
          <Image
            source={{ uri: resolvedLogoUrl! }}
            style={{ width: 24, height: 24, borderRadius: 6 }}
            onError={() => setHasLogoError(true)}
            resizeMode="cover"
          />
        ) : (
          <View
            className="h-6 w-6 rounded-md bg-slate-100 items-center justify-center"
            style={{ borderWidth: 1, borderColor: '#E2E8F0' }}
          >
            <Text className="text-[10px] font-bold text-slate-600">{initials}</Text>
          </View>
        )}

        <Text numberOfLines={1} className="text-xs font-bold text-slate-800 flex-1">
          {customer.name}
        </Text>
      </TouchableOpacity>

      {/* WhatsApp Share Button alongside Customer */}
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onSharePress || onPress}
        className="h-8 px-2.5 rounded-xl bg-[#25D366] flex-row items-center gap-1.5 shadow-2xs"
      >
        <WhatsAppIcon size={14} color="#FFFFFF" />
        <Text className="text-[10px] font-black text-white uppercase">Share</Text>
      </TouchableOpacity>
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
  onCustomerPress,
  width,
  className,
}: VehicleCardProps) {
  const openMaps = () => {
    const origin = encodeURIComponent(route.originLabel || 'Riyadh');
    const dest = encodeURIComponent(route.destinationLabel || 'Dammam');
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}`;
    Linking.openURL(mapsUrl).catch(() => {});
  };

  const formattedCapacity = vehicle.typeLabel || (vehicle.capacityKg > 0
    ? `${(vehicle.capacityKg / 1000).toFixed(1).replace(/\.0$/, '')} Ton`
    : 'Standard');

  const vehicleSummary = `${vehicle.truckId} • ${vehicle.model} (${formattedCapacity})`;

  const resolvedCustomer: VehicleCardCustomer | null = typeof customer === 'object' && customer !== null
    ? customer
    : (customerName || typeof customer === 'string')
    ? { name: typeof customer === 'string' ? customer : customerName! }
    : null;

  return (
    <View
      style={[{ borderWidth: 1, borderColor: '#EEF1F6' }, width ? { width } : undefined]}
      className={`rounded-3xl bg-white p-3.5 gap-3 shadow-md shadow-slate-200/50 ${className ?? ''}`}
    >
      {/* 1. Header: Driver Avatar + Driver Name + Vehicle Specs + Status Badge */}
      <View className="flex-row items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onPress}
          className="flex-row items-center gap-2.5 flex-1 pr-1"
        >
          <DriverAvatar
            initials={driver.initials}
            imageUri={driver.imageUri}
            size={42}
            online={driver.online}
          />
          <View className="flex-1">
            <Text numberOfLines={1} className="text-sm font-black text-slate-900 tracking-tight">
              {driver.name}
            </Text>
            <Text numberOfLines={1} className="text-[11px] font-bold text-slate-500 mt-0.5">
              {vehicleSummary}
            </Text>
          </View>
        </TouchableOpacity>

        <StatusBadge status={status} />
      </View>

      {/* 2. Customer Profile Row with WhatsApp Share Button */}
      {resolvedCustomer ? (
        <CustomerProfileRow
          customer={resolvedCustomer}
          onPress={onCustomerPress || onPress}
          onSharePress={onSharePress || onPress}
        />
      ) : null}

      {/* 3. Operational Route Container */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={openMaps}
        className="bg-orange-50/50 rounded-2xl p-3 gap-2.5"
        style={{ borderWidth: 1, borderColor: '#EEF1F6' }}
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
            {route.originSublabel ? (
              <Text numberOfLines={1} className="text-[10px] font-bold text-slate-500 mt-0.5">
                {route.originSublabel}
              </Text>
            ) : null}
          </View>

          <View className="bg-[#FA634E] p-1.5 rounded-full shadow-2xs">
            <ArrowRight size={12} color="#FFFFFF" strokeWidth={2.8} />
          </View>

          {/* Destination */}
          <View className="flex-1 pl-1 items-end">
            <View className="flex-row items-center gap-1 mb-0.5">
              <Text className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">DESTINATION</Text>
              <View className="h-2 w-2 rounded-full bg-[#FA634E]" />
            </View>
            <Text numberOfLines={1} className="text-xs font-black text-slate-900 text-right">
              {route.destinationLabel}
            </Text>
            {route.destinationSublabel ? (
              <Text numberOfLines={1} className="text-[10px] font-bold text-slate-500 text-right mt-0.5">
                {route.destinationSublabel}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Intermediate Stops Pill */}
        {route.stopsCount && route.stopsCount > 2 ? (
          <View className="flex-row items-center justify-center gap-1 self-center bg-white px-2.5 py-0.5 rounded-full" style={{ borderWidth: 1, borderColor: '#EEF1F6' }}>
            <MapPin size={10} color="#FA634E" />
            <Text className="text-[10px] font-extrabold text-[#FA634E]">
              +{route.stopsCount - 2} Intermediate Stops
            </Text>
          </View>
        ) : null}

        {/* Distance & ETA Row */}
        <View className="flex-row items-center justify-between pt-2" style={{ borderTopWidth: 1, borderTopColor: 'rgba(62, 60, 61, 0.08)' }}>
          <View className="flex-row items-center gap-1">
            <MapPin size={11} color="#64748B" />
            <Text className="text-[11px] font-medium text-slate-500">
              Distance: <Text className="font-extrabold text-slate-900">{route.distanceStr || '—'}</Text>
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
    </View>
  );
}

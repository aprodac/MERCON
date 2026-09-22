import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ScrollView,
  useWindowDimensions,
  ActivityIndicator,
  Linking,
  Share,
  Alert,
  Image,
} from 'react-native';
import {
  AlertTriangle,
  FileText,
  UserX,
  MapPin,
  CheckCircle2,
  ChevronRight,
  Truck,
  ArrowRight,
  Clock,
  Camera,
  Film,
} from 'lucide-react-native';
import { useOperatorCommandQueue } from '../hooks/useOperatorCommandQueue';
import type { CommandActionItem, CommandActionItemCategory, VehicleCardStatus } from '../types';
import { OperatorCommandInspectorModal } from './OperatorCommandInspectorModal';
import { DriverAvatar } from './DriverAvatar';
import { StatusBadge } from './StatusBadge';
import { WhatsAppIcon, resolveMediaUrl } from './VehicleCard';
import { CarouselPagination } from './CarouselPagination';
import { deriveVehicleCardStatus } from '../services/dashboardService';

interface OperatorCommandCenterSectionProps {
  onTripPress?: (tripId: string) => void;
  className?: string;
}

export function formatWhatsAppUpdate(item: CommandActionItem): string {
  const trip = item.trip;
  const truck = (
    trip?.vehicle?.ref_id ||
    trip?.vehicle?.plate_number ||
    (item.entityType === 'vehicle' ? item.entityName : 'N/A')
  ).toUpperCase();

  const driverName = item.driver
    ? `${item.driver.first_name} ${item.driver.last_name}`
    : trip?.driver
    ? `${trip.driver.first_name} ${trip.driver.last_name}`
    : 'UNASSIGNED';

  const stops = trip?.stops || [];
  const pickupStop = stops.find((s: any) => s.stop_type === 'Pickup') || stops[0];
  const dropoffStop = [...stops].reverse().find((s: any) => s.stop_type === 'Dropoff') || stops[stops.length - 1];

  const origin = pickupStop?.location_name ? pickupStop.location_name.split(',')[0].trim().toUpperCase() : 'ORIGIN';
  const destination = dropoffStop?.location_name ? dropoffStop.location_name.split(',')[0].trim().toUpperCase() : 'DESTINATION';

  let alertNote = '';
  if (item.category === 'delay') {
    alertNote = `\n\n⚠️ DELAY REPORT: ${item.delayReason || 'Operational traffic delay'}`;
  } else if (item.category === 'pod') {
    alertNote = `\n\n📄 POD STATUS: Proof of Delivery uploaded by driver.`;
  } else if (item.category === 'unassigned') {
    alertNote = `\n\n⚠️ ACTION NEEDED: Driver or vehicle allocation pending.`;
  } else if (item.category === 'doc') {
    alertNote = `\n\n📅 COMPLIANCE NOTICE: ${item.subtitle}`;
  }

  const statusStr = trip?.status || item.badgeLabel;

  return `🚛 MERCON Operational Update\n\nTruck: ${truck}\nDriver: ${driverName}\nRoute: ${origin} → ${destination}\nStatus: ${statusStr}${alertNote}\n\nThank you for shipping with MERCON Logistics!`;
}

export async function shareItemToWhatsApp(item: CommandActionItem) {
  const text = formatWhatsAppUpdate(item);
  const encodedText = encodeURIComponent(text);
  const whatsappAppUrl = `whatsapp://send?text=${encodedText}`;
  const whatsappUniversalUrl = `https://wa.me/?text=${encodedText}`;

  try {
    const canOpenScheme = await Linking.canOpenURL(whatsappAppUrl).catch(() => false);
    if (canOpenScheme) {
      await Linking.openURL(whatsappAppUrl);
      return;
    }
  } catch {}

  try {
    await Linking.openURL(whatsappAppUrl);
    return;
  } catch {}

  try {
    await Linking.openURL(whatsappUniversalUrl);
    return;
  } catch {}

  try {
    await Share.share({ message: text, title: 'MERCON Status Update' });
  } catch {
    Alert.alert('Unable to Share', 'Could not open WhatsApp.');
  }
}

const GAP = 14;
const MIN_CARD_WIDTH = 275;
const MAX_CARD_WIDTH = 320;

export function OperatorCommandCenterSection({ onTripPress, className }: OperatorCommandCenterSectionProps) {
  const { width: windowWidth } = useWindowDimensions();
  const {
    actionItems,
    filteredItems,
    counts,
    isLoading,
    activeCategoryFilter,
    setActiveCategoryFilter,
    drivers,
    vehicles,
    refetchAll,
  } = useOperatorCommandQueue();

  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedItem, setSelectedItem] = useState<CommandActionItem | null>(null);

  const cardWidth = Math.max(MIN_CARD_WIDTH, Math.min(MAX_CARD_WIDTH, windowWidth * 0.82));

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0 && viewableItems[0].index !== null) {
      setActiveIndex(viewableItems[0].index);
    }
  }).current;

  const categories: { id: CommandActionItemCategory; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: counts.all },
    { id: 'delay', label: 'Delays', count: counts.delay },
    { id: 'unassigned', label: 'Unassigned', count: counts.unassigned },
    { id: 'pod', label: 'POD Ready', count: counts.pod },
    { id: 'doc', label: 'Documents', count: counts.doc },
  ];

  const renderCardItem = useCallback(
    ({ item }: { item: CommandActionItem }) => {
      const trip = item.trip;
      const isDelay = item.category === 'delay';
      const isUnassigned = item.category === 'unassigned';
      const isPod = item.category === 'pod';
      const isDoc = item.category === 'doc';

      const driverName = item.driver
        ? `${item.driver.first_name} ${item.driver.last_name}`
        : trip?.driver
        ? `${trip.driver.first_name} ${trip.driver.last_name}`
        : 'Unassigned Driver';

      const driverInitials = item.initials || 'MC';

      const truckId =
        trip?.vehicle?.ref_id ||
        trip?.vehicle?.plate_number ||
        (item.entityType === 'vehicle' ? item.entityName : 'Truck');

      const vehicleModel = trip?.vehicle?.asset_type ?? 'Flatbed';

      const cardStatus: VehicleCardStatus = trip
        ? deriveVehicleCardStatus(trip.status, trip.vehicle?.status ?? 'Available', isDelay)
        : isDelay
        ? 'Delayed'
        : 'Idle';

      const stops = trip?.stops || [];
      const pickupStop = stops.find((s: any) => s.stop_type === 'Pickup') || stops[0];
      const dropoffStop = [...stops].reverse().find((s: any) => s.stop_type === 'Dropoff') || stops[stops.length - 1];

      const originLabel = pickupStop?.location_name
        ? pickupStop.location_name.split(',')[0].replace(/\]+$/, '').trim()
        : 'Origin';

      const destinationLabel = dropoffStop?.location_name
        ? dropoffStop.location_name.split(',')[0].replace(/\]+$/, '').trim()
        : 'Destination';

      const distanceStr = trip?.planned_distance ? `${Math.round(trip.planned_distance)} KM` : undefined;

      let etaStr: string | undefined = undefined;
      if (trip?.planned_end) {
        const diffMs = new Date(trip.planned_end).getTime() - Date.now();
        if (diffMs > 0) {
          const hours = (diffMs / (1000 * 60 * 60)).toFixed(1);
          etaStr = `${hours} HRS`;
        } else {
          etaStr = 'ARRIVING SOON';
        }
      }

      const rawAvatar = item.avatarUrl || (trip?.driver as any)?.avatar_url || (trip?.driver as any)?.profile_picture;
      const resolvedAvatar = resolveMediaUrl(rawAvatar);

      return (
        <View
          style={{ width: cardWidth, borderWidth: 1, borderColor: '#EEF1F6' }}
          className="rounded-3xl bg-white p-3.5 gap-3 shadow-md shadow-slate-200/50"
        >
          {/* 1. Header: Driver / Entity Avatar + Specs + Status Badge */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setSelectedItem(item)}
            className="flex-row items-center justify-between gap-2 border-b border-slate-100 pb-2.5"
          >
            <View className="flex-row items-center gap-2.5 flex-1 pr-1">
              <DriverAvatar
                initials={driverInitials}
                imageUri={resolvedAvatar ? { uri: resolvedAvatar } : undefined}
                size={40}
                online={item.driver?.status === 'OnTrip' || (trip?.driver as any)?.status === 'OnTrip'}
              />
              <View className="flex-1">
                <Text numberOfLines={1} className="text-sm font-black text-slate-900 tracking-tight">
                  {driverName}
                </Text>
                <Text numberOfLines={1} className="text-[11px] font-bold text-slate-500 mt-0.5">
                  {truckId} • {vehicleModel}
                </Text>
              </View>
            </View>

            <StatusBadge status={cardStatus} />
          </TouchableOpacity>

          {/* 2. Customer & Evidence Indicator Row with Instant WhatsApp Share Button */}
          <View
            className="flex-row items-center justify-between bg-slate-50/90 p-2.5 rounded-2xl"
            style={{ borderWidth: 1, borderColor: '#EEF1F6' }}
          >
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setSelectedItem(item)}
              className="flex-row items-center gap-2 flex-1 pr-2"
            >
              {/* Evidence / Alert Tag Indicator */}
              <View
                className={`px-2 py-1 rounded-lg flex-row items-center gap-1 ${
                  isDelay
                    ? 'bg-rose-100 border border-rose-200'
                    : isUnassigned
                    ? 'bg-purple-100 border border-purple-200'
                    : isPod
                    ? 'bg-blue-100 border border-blue-200'
                    : 'bg-amber-100 border border-amber-200'
                }`}
              >
                {isDelay ? (
                  <AlertTriangle size={12} color="#FA634E" />
                ) : isUnassigned ? (
                  <UserX size={12} color="#7E22CE" />
                ) : isPod ? (
                  <FileText size={12} color="#1D4ED8" />
                ) : (
                  <Camera size={12} color="#D97706" />
                )}
                <Text
                  className={`text-[10px] font-black uppercase ${
                    isDelay
                      ? 'text-[#FA634E]'
                      : isUnassigned
                      ? 'text-purple-700'
                      : isPod
                      ? 'text-blue-700'
                      : 'text-amber-800'
                  }`}
                >
                  {item.badgeLabel}
                </Text>
              </View>

              <Text numberOfLines={1} className="text-xs font-black text-slate-900 flex-1">
                {item.entityName}
              </Text>
            </TouchableOpacity>

            {/* Instant WhatsApp Share Button */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => shareItemToWhatsApp(item)}
              className="h-8 px-2.5 rounded-xl bg-[#25D366] flex-row items-center gap-1.5 shadow-2xs"
            >
              <WhatsAppIcon size={14} color="#FFFFFF" />
              <Text className="text-[10px] font-black text-white uppercase">WhatsApp</Text>
            </TouchableOpacity>
          </View>

          {/* 3. Operational Route Container */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setSelectedItem(item)}
            className="bg-orange-50/50 rounded-2xl p-3 gap-2"
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
                  {originLabel}
                </Text>
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
                  {destinationLabel}
                </Text>
              </View>
            </View>

            {/* Subtitle / Evidence Context */}
            <Text numberOfLines={1} className="text-[10.5px] font-bold text-slate-500 mt-1">
              {item.subtitle}
            </Text>

            {/* Distance & ETA Row */}
            <View
              className="flex-row items-center justify-between pt-2 mt-1"
              style={{ borderTopWidth: 1, borderTopColor: 'rgba(62, 60, 61, 0.08)' }}
            >
              <View className="flex-row items-center gap-1">
                <MapPin size={11} color="#64748B" />
                <Text className="text-[11px] font-medium text-slate-500">
                  Distance: <Text className="font-extrabold text-slate-900">{distanceStr || '—'}</Text>
                </Text>
              </View>
              <View className="flex-row items-center gap-1">
                <Clock size={11} color="#64748B" />
                <Text className="text-[11px] font-medium text-slate-500">
                  ETA: <Text className="font-extrabold text-slate-900">{etaStr || '—'}</Text>
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>
      );
    },
    [cardWidth]
  );

  return (
    <View className={`gap-3 ${className ?? ''}`}>
      {/* ── 1. UNIFIED HEADER ────────────────────────────────────────────────── */}
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <View className="w-2.5 h-2.5 rounded-full bg-[#FA634E]" />
          <Text className="text-xs font-black uppercase tracking-wider text-[#3E3C3D]">
            OPERATOR COMMAND
          </Text>
        </View>

        <View className="px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200/80">
          <Text className="text-[10px] font-black uppercase tracking-wider text-[#FA634E]">
            {actionItems.length} ALERTS
          </Text>
        </View>
      </View>

      {/* ── 2. CATEGORY FILTER PILLS ─────────────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="py-1 flex-row gap-1.5"
      >
        {categories.map((cat) => {
          const isActive = activeCategoryFilter === cat.id;
          return (
            <TouchableOpacity
              key={cat.id}
              onPress={() => setActiveCategoryFilter(cat.id)}
              className={`px-3 py-1.5 rounded-xl border flex-row items-center gap-1.5 ${
                isActive
                  ? 'bg-[#FA634E] border-[#FA634E]'
                  : 'bg-[#EEF1F6]/80 border-slate-200/80'
              }`}
            >
              <Text
                className={`text-[11px] font-extrabold ${
                  isActive ? 'text-white' : 'text-[#3E3C3D]'
                }`}
              >
                {cat.label}
              </Text>
              <View
                className={`px-1.5 py-0.2 rounded-md ${
                  isActive ? 'bg-white/20' : 'bg-slate-200/80'
                }`}
              >
                <Text
                  className={`text-[10px] font-black ${
                    isActive ? 'text-white' : 'text-[#3E3C3D]'
                  }`}
                >
                  {cat.count}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── 3. RICH ACTION CARDS CAROUSEL ──────────────────────────────────── */}
      {isLoading ? (
        <View className="p-8 items-center justify-center bg-white rounded-3xl border border-slate-100">
          <ActivityIndicator size="small" color="#FA634E" />
          <Text className="text-xs font-semibold text-slate-400 mt-2">
            Loading operational cards...
          </Text>
        </View>
      ) : filteredItems.length === 0 ? (
        <View className="p-4 bg-emerald-50/60 rounded-2xl border border-emerald-100 items-center justify-center gap-1">
          <CheckCircle2 size={20} color="#059669" />
          <Text className="text-xs font-bold text-[#3E3C3D]">Queue Clear</Text>
          <Text className="text-[10.5px] font-medium text-slate-500">
            All active dispatches and operational tasks are running smoothly.
          </Text>
        </View>
      ) : (
        <View className="gap-3">
          <FlatList
            data={filteredItems}
            horizontal
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            snapToInterval={cardWidth + GAP}
            decelerationRate="fast"
            contentContainerStyle={{ gap: GAP, paddingRight: 16 }}
            renderItem={renderCardItem}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
          />
          <CarouselPagination count={filteredItems.length} activeIndex={activeIndex} className="mt-1" />
        </View>
      )}

      {/* Modal Inspector Sheet */}
      <OperatorCommandInspectorModal
        visible={!!selectedItem}
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        drivers={drivers}
        vehicles={vehicles}
        onRefresh={refetchAll}
      />
    </View>
  );
}

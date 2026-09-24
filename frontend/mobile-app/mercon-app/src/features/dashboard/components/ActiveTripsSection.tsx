import React, { useCallback, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, useWindowDimensions, Linking, Alert, Share, Modal, ScrollView, type ViewToken } from 'react-native';
import { Share2, ArrowRight, Truck, Clock, MapPin, Check, Layers, X, Send, CheckCircle2 } from 'lucide-react-native';
import { EmptyState, ErrorState, SkeletonVehicleCard } from '@mercon/mobile-shared/ui';
import { SectionHeader } from './SectionHeader';
import { VehicleCard, resolveMediaUrl } from './VehicleCard';
import { CarouselPagination } from './CarouselPagination';
import { useActiveTrips } from '../hooks';
import type { Trip } from '../types';
import { deriveVehicleCardStatus } from '../services/dashboardService';

interface ActiveTripsSectionProps {
  onViewAll?: () => void;
  onTripPress?: (trip: Trip) => void;
  className?: string;
}

export function formatWhatsAppMessage(trip: Trip): string {
  const truck = (trip.vehicle?.ref_id || trip.vehicle?.plate_number || 'N/A').toUpperCase();
  const driverName = trip.driver
    ? `${trip.driver.first_name} ${trip.driver.last_name}`.toUpperCase()
    : 'UNASSIGNED';

  const stops = trip.stops || [];
  const pickupStop = stops.find((s) => s.stop_type === 'Pickup') || stops[0];
  const dropoffStop = [...stops].reverse().find((s) => s.stop_type === 'Dropoff') || stops[stops.length - 1];

  const origin = pickupStop?.location_name
    ? pickupStop.location_name.split(',')[0].replace(/\]+$/, '').trim().toUpperCase()
    : 'ORIGIN';
  const destination = dropoffStop?.location_name
    ? dropoffStop.location_name.split(',')[0].replace(/\]+$/, '').trim().toUpperCase()
    : 'DESTINATION';

  const routeStr = `${origin} → ${destination}`;

  const distanceStr = trip.planned_distance
    ? `${Math.round(trip.planned_distance)} KM`
    : '—';

  let etaStr = '—';
  if (trip.planned_end) {
    const diffMs = new Date(trip.planned_end).getTime() - Date.now();
    if (diffMs > 0) {
      const hours = (diffMs / (1000 * 60 * 60)).toFixed(1);
      etaStr = `${hours} HRS`;
    } else {
      etaStr = 'ARRIVING SOON';
    }
  }

  const statusLabel =
    trip.status === 'InTransit' ? 'In Transit' :
    trip.status === 'Loading' ? 'Loading' :
    trip.status === 'Scheduled' ? 'Scheduled' :
    trip.status === 'AtPickup' ? 'At Pickup' :
    trip.status === 'AtDelivery' ? 'At Delivery' :
    trip.status;

  return `🚛 Vehicle Status Update\n\nTruck: ${truck}\nDriver: ${driverName}\nRoute: ${routeStr}\nDistance left: ${distanceStr}  TO ${destination}\nETA: ${etaStr}\nStatus: ${statusLabel}`;
}

export async function shareTextToWhatsApp(text: string, title = 'Vehicle Status Update') {
  const encodedText = encodeURIComponent(text);

  const whatsappAppUrl = `whatsapp://send?text=${encodedText}`;
  const whatsappUniversalUrl = `https://wa.me/?text=${encodedText}`;

  // 1. Attempt opening WhatsApp directly via scheme
  try {
    const canOpenScheme = await Linking.canOpenURL(whatsappAppUrl).catch(() => false);
    if (canOpenScheme) {
      await Linking.openURL(whatsappAppUrl);
      return;
    }
  } catch {
    // ignore & fall through
  }

  // 2. Direct attempt (bypasses iOS canOpenURL scheme restrictions)
  try {
    await Linking.openURL(whatsappAppUrl);
    return;
  } catch {
    // ignore & fall through
  }

  // 3. Try Universal Link (https://wa.me/?text=...) which opens WhatsApp directly on iOS & Android
  try {
    await Linking.openURL(whatsappUniversalUrl);
    return;
  } catch {
    // ignore & fall through
  }

  // 4. Native iOS/Android Share Sheet fallback so status updates can ALWAYS be sent
  try {
    await Share.share({
      message: text,
      title,
    });
  } catch {
    Alert.alert('Unable to Share', 'Could not open WhatsApp or share menu.');
  }
}

export async function shareTripToWhatsApp(trip: Trip) {
  const singleText = formatWhatsAppMessage(trip);
  await shareTextToWhatsApp(singleText);
}

export async function shareMultipleCombinedToWhatsApp(trips: Trip[]) {
  if (trips.length === 0) return;
  const itemsFormatted = trips
    .map((t, idx) => `[TRIP ${idx + 1}/${trips.length}]\n` + formatWhatsAppMessage(t))
    .join('\n\n───────────────────\n\n');

  const bulkText = `🚛 Vehicle Status Updates (${trips.length} Trips)\n\n${itemsFormatted}`;
  await shareTextToWhatsApp(bulkText, `${trips.length} Vehicle Status Updates`);
}

const GAP = 14;
const MIN_CARD_WIDTH = 245;
const MAX_CARD_WIDTH = 275;

export function ActiveTripsSection({ onViewAll, onTripPress, className }: ActiveTripsSectionProps) {
  const { width: windowWidth } = useWindowDimensions();
  const { data, isLoading, isError, refetch } = useActiveTrips();
  const trips = data ?? [];

  const [activeIndex, setActiveIndex] = useState(0);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Batch Share Modal state
  const [queueModalVisible, setQueueModalVisible] = useState(false);
  const [currentQueueIndex, setCurrentQueueIndex] = useState(0);
  const [sentIndices, setSentIndices] = useState<Set<number>>(new Set());

  const visibleTrips = trips.slice(0, 15);
  const cardWidth = Math.max(MIN_CARD_WIDTH, Math.min(MAX_CARD_WIDTH, windowWidth * 0.72));

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index !== null) {
      setActiveIndex(viewableItems[0].index);
    }
  }).current;

  const toggleSelectTrip = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === visibleTrips.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleTrips.map((t) => t.id)));
    }
  };

  const selectedTrips = visibleTrips.filter((t) => selectedIds.has(t.id));

  const startBatchShare = () => {
    if (selectedTrips.length === 0) return;
    if (selectedTrips.length === 1) {
      shareTripToWhatsApp(selectedTrips[0]);
      return;
    }
    setCurrentQueueIndex(0);
    setSentIndices(new Set());
    setQueueModalVisible(true);
  };

  const sendCurrentTripInQueue = async () => {
    const trip = selectedTrips[currentQueueIndex];
    if (!trip) return;

    await shareTripToWhatsApp(trip);

    setSentIndices((prev) => new Set(prev).add(currentQueueIndex));

    if (currentQueueIndex < selectedTrips.length - 1) {
      setCurrentQueueIndex((prev) => prev + 1);
    }
  };

  const renderItem = useCallback(({ item }: { item: Trip }) => {
    const truck = item.vehicle?.ref_id || item.vehicle?.plate_number || item.ref_id || 'N/A';
    const driverName = item.driver
      ? `${item.driver.first_name} ${item.driver.last_name}`
      : 'Unassigned';
    const driverInitials = item.driver
      ? `${item.driver.first_name[0] ?? ''}${item.driver.last_name[0] ?? ''}`.toUpperCase()
      : '?';

    const stops = item.stops || [];
    const pickupStop = stops.find((s) => s.stop_type === 'Pickup') || stops[0];
    const dropoffStop = [...stops].reverse().find((s) => s.stop_type === 'Dropoff') || stops[stops.length - 1];

    const originLabel = pickupStop?.location_name
      ? pickupStop.location_name.split(',')[0].replace(/\]+$/, '').trim()
      : 'Origin';

    const destinationLabel = dropoffStop?.location_name
      ? dropoffStop.location_name.split(',')[0].replace(/\]+$/, '').trim()
      : 'Destination';

    const originSublabel = pickupStop?.location_address
      ? pickupStop.location_address.split(',')[0]
      : pickupStop?.location_name?.includes(',')
      ? pickupStop.location_name.split(',').slice(1).join(',').trim()
      : undefined;

    const destinationSublabel = dropoffStop?.location_address
      ? dropoffStop.location_address.split(',')[0]
      : dropoffStop?.location_name?.includes(',')
      ? dropoffStop.location_name.split(',').slice(1).join(',').trim()
      : undefined;

    const distanceStr = item.planned_distance
      ? `${Math.round(item.planned_distance)} KM`
      : undefined;

    let etaStr: string | undefined = undefined;
    if (item.planned_end) {
      const diffMs = new Date(item.planned_end).getTime() - Date.now();
      if (diffMs > 0) {
        const hours = (diffMs / (1000 * 60 * 60)).toFixed(1);
        etaStr = `${hours} HRS`;
      } else {
        etaStr = 'ARRIVING SOON';
      }
    }

    const cardStatus = deriveVehicleCardStatus(
      item.status,
      item.vehicle?.status ?? 'Available',
      false
    );

    const rawDriverPicture = item.driver?.avatar_url || item.driver?.profile_picture;
    const resolvedDriverPicture = resolveMediaUrl(rawDriverPicture);

    return (
      <VehicleCard
        width={cardWidth}
        driver={{
          initials: driverInitials,
          name: driverName,
          online: item.driver?.status === 'Available' || item.driver?.status === 'OnTrip',
          imageUri: resolvedDriverPicture ? { uri: resolvedDriverPicture } : undefined,
        }}
        vehicle={{
          truckId: truck,
          model: item.vehicle?.asset_type ?? 'Truck',
          capacityKg: item.vehicle?.capacity_kg ?? 10000,
        }}
        route={{
          originLabel,
          originSublabel,
          destinationLabel,
          destinationSublabel,
          distanceStr,
          etaStr,
          stopsCount: stops.length,
        }}
        customer={item.customer ? { name: item.customer.name, logoUrl: item.customer.logo_url } : null}
        status={cardStatus}
        onPress={() => onTripPress?.(item)}
        onSharePress={() => shareTripToWhatsApp(item)}
      />
    );
  }, [cardWidth, onTripPress]);

  return (
    <View className={`gap-3 ${className ?? ''}`}>
      {/* Header: Clean Title on Left, View all → on Right */}
      <SectionHeader
        title="Active Trips"
        actionLabel="View all →"
        onActionPress={onViewAll}
      />

      {/* Multi-Select Bar */}
      {isSelectionMode && visibleTrips.length > 0 && (
        <View className="flex-row items-center justify-between bg-gray-100 p-2.5 rounded-xl border border-gray-200/80">
          <TouchableOpacity activeOpacity={0.7} onPress={toggleSelectAll} className="flex-row items-center gap-2 px-2 py-1">
            <View className={`h-4 w-4 rounded items-center justify-center border ${selectedIds.size === visibleTrips.length ? 'bg-gray-900 border-gray-900' : 'bg-white border-gray-300'}`}>
              {selectedIds.size === visibleTrips.length && <Check size={11} color="#FFFFFF" strokeWidth={3} />}
            </View>
            <Text className="text-xs font-bold text-gray-800">
              {selectedIds.size === visibleTrips.length ? 'Deselect All' : 'Select All'}
            </Text>
          </TouchableOpacity>
          <Text className="text-xs font-semibold text-gray-500 pr-2">
            {selectedIds.size} / {visibleTrips.length} selected
          </Text>
        </View>
      )}

      {isLoading ? (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[0, 1]}
          keyExtractor={(i) => String(i)}
          contentContainerStyle={{ gap: GAP }}
          renderItem={() => <SkeletonVehicleCard />}
        />
      ) : isError ? (
        <ErrorState message="Couldn't load active trips." onRetry={() => refetch()} />
      ) : visibleTrips.length === 0 ? (
        <EmptyState title="No active trips right now" subtitle="Active trips will show up here." Icon={Truck} />
      ) : (
        <View className="gap-3">
          <FlatList
            data={visibleTrips}
            horizontal
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            snapToInterval={cardWidth + GAP}
            decelerationRate="fast"
            contentContainerStyle={{ gap: GAP, paddingRight: 16 }}
            renderItem={renderItem}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
          />
          <CarouselPagination count={visibleTrips.length} activeIndex={activeIndex} className="mt-1" />
        </View>
      )}

      {/* Floating / Sticky Bulk Action Pill when 1+ trips selected */}
      {selectedIds.size > 0 && (
        <View className="mt-2 p-3 bg-gray-900 rounded-2xl flex-row items-center justify-between shadow-lg">
          <View>
            <Text className="text-xs font-black text-white">
              {selectedIds.size} {selectedIds.size === 1 ? 'Trip' : 'Trips'} Selected
            </Text>
            <Text className="text-[10px] font-medium text-gray-400">
              Ready for separate WhatsApp status updates
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={startBatchShare}
            className="flex-row items-center gap-2 bg-[#25D366] px-4 py-2.5 rounded-xl"
          >
            <Share2 size={14} color="#FFFFFF" strokeWidth={2.5} />
            <Text className="text-xs font-black text-white">
              Share ({selectedIds.size}) to WhatsApp
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Interactive Bulk Share Modal Sheet */}
      <Modal
        visible={queueModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setQueueModalVisible(false)}
      >
        <View className="flex-1 bg-black/60 justify-end">
          <View className="bg-white rounded-t-3xl p-5 gap-4 max-h-[85%]">
            {/* Header */}
            <View className="flex-row items-center justify-between pb-3 border-b border-gray-200">
              <View>
                <Text className="text-base font-black text-gray-900">
                  Send Separate WhatsApp Updates
                </Text>
                <Text className="text-xs text-gray-500 font-medium">
                  Trip {currentQueueIndex + 1} of {selectedTrips.length}
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => setQueueModalVisible(false)}
                className="h-8 w-8 rounded-full bg-gray-100 items-center justify-center"
              >
                <X size={16} color="#3E3C3D" />
              </TouchableOpacity>
            </View>

            {/* Current Active Trip Card Preview */}
            {selectedTrips[currentQueueIndex] && (
              <View className="bg-gray-50 rounded-2xl p-4 border border-gray-200 gap-2">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <Truck size={16} color="#FA634E" />
                    <Text className="text-sm font-black text-gray-900">
                      {(selectedTrips[currentQueueIndex].vehicle?.ref_id || selectedTrips[currentQueueIndex].vehicle?.plate_number || 'N/A').toUpperCase()}
                    </Text>
                  </View>
                  <Text className="text-xs font-bold text-gray-500">
                    {selectedTrips[currentQueueIndex].driver
                      ? `${selectedTrips[currentQueueIndex].driver?.first_name} ${selectedTrips[currentQueueIndex].driver?.last_name}`
                      : 'Unassigned'}
                  </Text>
                </View>
                <Text className="text-xs font-medium text-gray-600">
                  Status: <Text className="font-bold text-gray-900">{selectedTrips[currentQueueIndex].status}</Text>
                </Text>
              </View>
            )}

            {/* Actions */}
            <View className="gap-2.5">
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={sendCurrentTripInQueue}
                className="bg-[#25D366] py-3.5 px-4 rounded-xl flex-row items-center justify-center gap-2"
              >
                <Send size={16} color="#FFFFFF" />
                <Text className="text-sm font-black text-white">
                  Send Trip {currentQueueIndex + 1} of {selectedTrips.length} Message
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  shareMultipleCombinedToWhatsApp(selectedTrips);
                  setQueueModalVisible(false);
                }}
                className="bg-gray-100 py-3 px-4 rounded-xl items-center"
              >
                <Text className="text-xs font-bold text-gray-700">
                  Send All Combined in 1 Single Message Instead
                </Text>
              </TouchableOpacity>
            </View>

            {/* List Queue */}
            <Text className="text-xs font-bold text-gray-500 pt-2">
              Batch Progress ({sentIndices.size} / {selectedTrips.length} Sent)
            </Text>
            <ScrollView className="max-h-40 gap-2">
              {selectedTrips.map((t, idx) => {
                const isSent = sentIndices.has(idx);
                const isCurrent = idx === currentQueueIndex;
                const truck = (t.vehicle?.ref_id || t.vehicle?.plate_number || 'N/A').toUpperCase();

                return (
                  <TouchableOpacity
                    key={t.id}
                    onPress={() => setCurrentQueueIndex(idx)}
                    className={`flex-row items-center justify-between p-2.5 rounded-xl border ${
                      isCurrent
                        ? 'border-gray-900 bg-gray-100'
                        : isSent
                        ? 'border-emerald-200 bg-emerald-50/60'
                        : 'border-gray-200 bg-white'
                    }`}
                  >
                    <View className="flex-row items-center gap-2">
                      <Text className="text-xs font-bold text-gray-400">#{idx + 1}</Text>
                      <Text className="text-xs font-black text-gray-900">{truck}</Text>
                    </View>

                    {isSent ? (
                      <View className="flex-row items-center gap-1">
                        <CheckCircle2 size={14} color="#10B981" />
                        <Text className="text-[11px] font-bold text-emerald-700">Sent</Text>
                      </View>
                    ) : isCurrent ? (
                      <Text className="text-[11px] font-bold text-gray-900">Next →</Text>
                    ) : (
                      <Text className="text-[11px] font-medium text-gray-400">Pending</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}



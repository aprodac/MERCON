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
  ArrowRight,
  Clock,
  Camera,
} from 'lucide-react-native';
import { useOperatorCommandQueue } from '../hooks/useOperatorCommandQueue';
import type { CommandActionItem, CommandActionItemCategory, VehicleCardStatus } from '../types';
import { OperatorCommandInspectorModal } from './OperatorCommandInspectorModal';
import { DriverAvatar } from './DriverAvatar';
import { StatusBadge } from './StatusBadge';
import { WhatsAppIcon, resolveMediaUrl } from './VehicleCard';
import { CarouselPagination } from './CarouselPagination';
import { deriveVehicleCardStatus } from '../services/dashboardService';

/* ─── WhatsApp sharing utils ─────────────────────────────────────────────── */

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

/* ─── Priority stripe colors ────────────────────────────────────────────── */

const STRIPE_COLORS: Record<string, string> = {
  delay: '#FA634E',
  unassigned: '#7C3AED',
  pod: '#2563EB',
  doc: '#D97706',
  location: '#D97706',
};

const CATEGORY_ICON_CONFIG: Record<string, { bg: string; color: string }> = {
  delay: { bg: '#FEF2F2', color: '#FA634E' },
  unassigned: { bg: '#F5F3FF', color: '#7C3AED' },
  pod: { bg: '#EFF6FF', color: '#2563EB' },
  doc: { bg: '#FFFBEB', color: '#D97706' },
  location: { bg: '#FFFBEB', color: '#D97706' },
};

/* ─── Constants ──────────────────────────────────────────────────────────── */

const GAP = 14;
const MIN_CARD_WIDTH = 280;
const MAX_CARD_WIDTH = 320;

/* ─── Main Component ─────────────────────────────────────────────────────── */

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
    { id: 'pod', label: 'POD', count: counts.pod },
    { id: 'doc', label: 'Docs', count: counts.doc },
  ];

  /* ─── Card Renderer ────────────────────────────────────────────────────── */

  const renderCardItem = useCallback(
    ({ item }: { item: CommandActionItem }) => {
      const trip = item.trip;
      const isDelay = item.category === 'delay';
      const isUnassigned = item.category === 'unassigned';
      const isPod = item.category === 'pod';

      const driverName = item.driver
        ? `${item.driver.first_name} ${item.driver.last_name}`
        : trip?.driver
        ? `${trip.driver.first_name} ${trip.driver.last_name}`
        : 'Unassigned';

      const driverInitials = (() => {
        const dn = item.driver
          ? `${item.driver.first_name} ${item.driver.last_name}`
          : trip?.driver
          ? `${trip.driver.first_name} ${trip.driver.last_name}`
          : '';
        if (!dn) return 'DR';
        const parts = dn.trim().split(/\s+/);
        return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : dn.slice(0, 2).toUpperCase();
      })();

      const customerName = trip?.customer?.name
        || (item.entityType === 'company' ? item.entityName : '')
        || '';
      const customerInitials = (() => {
        if (!customerName) return 'CO';
        const parts = customerName.trim().split(/\s+/);
        return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : customerName.slice(0, 2).toUpperCase();
      })();
      const customerLogoUrl = resolveMediaUrl((trip?.customer as any)?.logo_url || null);

      const truckId =
        trip?.vehicle?.ref_id ||
        trip?.vehicle?.plate_number ||
        (item.entityType === 'vehicle' ? item.entityName : '—');

      const vehicleModel = trip?.vehicle?.asset_type ?? '';

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

      const distanceStr = trip?.planned_distance ? `${Math.round(trip.planned_distance)} km` : '—';

      let etaStr = '—';
      if (trip?.planned_end) {
        const diffMs = new Date(trip.planned_end).getTime() - Date.now();
        if (diffMs > 0) {
          const hours = (diffMs / (1000 * 60 * 60)).toFixed(1);
          etaStr = `${hours}h`;
        } else {
          etaStr = 'Now';
        }
      }

      const rawDriverAvatar = (item.driver as any)?.avatar_url
        || (trip?.driver as any)?.avatar_url
        || (trip?.driver as any)?.profile_picture;
      const resolvedDriverAvatar = resolveMediaUrl(rawDriverAvatar);

      const stripeColor = STRIPE_COLORS[item.category] || '#D1D5DB';
      const iconConfig = CATEGORY_ICON_CONFIG[item.category] || { bg: '#F5F5F7', color: '#6E6E80' };

      const truckSuffix = vehicleModel ? ` · ${vehicleModel}` : '';

      return (
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={() => setSelectedItem(item)}
          style={{
            width: '100%',
            borderWidth: 1,
            borderColor: '#EBEBED',
            borderRadius: 16,
            backgroundColor: '#FFFFFF',
            padding: 12,
            gap: 10,
          }}
        >
          {/* ── Row 1: Driver + Customer Info + Status ─────────────── */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <DriverAvatar
              initials={driverInitials}
              imageUri={resolvedDriverAvatar ? { uri: resolvedDriverAvatar } : undefined}
              size={36}
              online={item.driver?.status === 'OnTrip' || (trip?.driver as any)?.status === 'OnTrip'}
            />

            {/* Driver name + truck & customer info */}
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '700', color: '#3E3C3D' }}>
                {driverName}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 }}>
                <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '500', color: '#9898A4', flexShrink: 1 }}>
                  {truckId}{truckSuffix}
                </Text>
                {customerName ? (
                  <>
                    <Text style={{ fontSize: 11, fontWeight: '500', color: '#D1D5DB' }}>•</Text>
                    {customerLogoUrl ? (
                      <Image
                        source={{ uri: customerLogoUrl }}
                        style={{ width: 14, height: 14, borderRadius: 3 }}
                        resizeMode="cover"
                      />
                    ) : null}
                    <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '600', color: '#6E6E80', flexShrink: 1 }}>
                      {customerName}
                    </Text>
                  </>
                ) : null}
              </View>
            </View>
            <StatusBadge status={cardStatus} />
          </View>

          {/* ── Row 2: Route ──────────────────────────────────────────── */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingTop: 8,
              borderTopWidth: 1,
              borderTopColor: '#F5F5F7',
            }}
          >
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#16A34A' }} />
            <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '600', color: '#3E3C3D', flex: 1 }}>
              {originLabel}
            </Text>
            <ArrowRight size={12} color="#9898A4" strokeWidth={2} />
            <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '600', color: '#3E3C3D', flex: 1, textAlign: 'right' }}>
              {destinationLabel}
            </Text>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#FA634E' }} />
          </View>

          {/* ── Row 3: Context subtitle (delay reason, POD info, etc.) ── */}
          <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '500', color: '#6E6E80' }}>
            {item.subtitle}
          </Text>

          {/* ── Row 4: Footer — Category + Meta + WhatsApp ───────────── */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingTop: 8,
              borderTopWidth: 1,
              borderTopColor: '#F5F5F7',
              gap: 8,
            }}
          >
            {/* Category pill */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: iconConfig.bg,
                paddingHorizontal: 6,
                paddingVertical: 3,
                borderRadius: 6,
                gap: 3,
              }}
            >
              {isDelay ? (
                <AlertTriangle size={10} color={iconConfig.color} />
              ) : isUnassigned ? (
                <UserX size={10} color={iconConfig.color} />
              ) : isPod ? (
                <FileText size={10} color={iconConfig.color} />
              ) : (
                <Camera size={10} color={iconConfig.color} />
              )}
              <Text style={{ fontSize: 9, fontWeight: '700', color: iconConfig.color, textTransform: 'uppercase' }}>
                {item.badgeLabel}
              </Text>
            </View>

            {/* Distance */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <MapPin size={10} color="#9898A4" />
              <Text style={{ fontSize: 10, fontWeight: '500', color: '#6E6E80' }}>{distanceStr}</Text>
            </View>

            {/* ETA */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Clock size={10} color="#9898A4" />
              <Text style={{ fontSize: 10, fontWeight: '500', color: '#6E6E80' }}>{etaStr}</Text>
            </View>

            {/* Spacer */}
            <View style={{ flex: 1 }} />

            {/* WhatsApp icon button */}
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={(e) => {
                e.stopPropagation?.();
                shareItemToWhatsApp(item);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                backgroundColor: '#25D366',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <WhatsAppIcon size={14} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      );
    },
    [cardWidth]
  );

  /* ─── Render ───────────────────────────────────────────────────────────── */

  return (
    <View className={className} style={{ gap: 12 }}>
      {/* ── Section Header ────────────────────────────────────────────────── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: '#3E3C3D' }}>
          Action Queue
        </Text>
        {actionItems.length > 0 && (
          <View
            style={{
              backgroundColor: '#FEF2F2',
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 10,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#FA634E' }}>
              {actionItems.length}
            </Text>
          </View>
        )}
      </View>

      {/* ── Category Filter Pills ─────────────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6 }}
      >
        {categories.map((cat) => {
          const isActive = activeCategoryFilter === cat.id;
          return (
            <TouchableOpacity
              key={cat.id}
              onPress={() => setActiveCategoryFilter(cat.id)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 10,
                backgroundColor: isActive ? '#FA634E' : '#F5F5F7',
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '600',
                  color: isActive ? '#FFFFFF' : '#3E3C3D',
                }}
              >
                {cat.label}{cat.count > 0 ? ` (${cat.count})` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Cards Carousel ────────────────────────────────────────────────── */}
      {isLoading ? (
        <View
          style={{
            padding: 32,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#FFFFFF',
            borderRadius: 16,
            borderWidth: 1,
            borderColor: '#EBEBED',
          }}
        >
          <ActivityIndicator size="small" color="#FA634E" />
          <Text style={{ fontSize: 12, fontWeight: '500', color: '#9898A4', marginTop: 8 }}>
            Loading…
          </Text>
        </View>
      ) : filteredItems.length === 0 ? (
        <View
          style={{
            padding: 20,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#F0FDF4',
            borderRadius: 12,
            borderWidth: 1,
            borderColor: '#BBF7D0',
            gap: 4,
          }}
        >
          <CheckCircle2 size={18} color="#16A34A" />
          <Text style={{ fontSize: 12, fontWeight: '600', color: '#3E3C3D' }}>All clear</Text>
          <Text style={{ fontSize: 11, fontWeight: '400', color: '#6E6E80' }}>
            No pending actions right now.
          </Text>
        </View>
      ) : (
        <View style={{ gap: 10, paddingBottom: 16 }}>
          {filteredItems.map((item) => (
            <View key={item.id}>
              {renderCardItem({ item })}
            </View>
          ))}
        </View>
      )}

      {/* ── Inspector Modal ───────────────────────────────────────────────── */}
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

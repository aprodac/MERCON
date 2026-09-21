import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Modal, FlatList,
  StyleSheet, StatusBar, Linking, Alert, ActivityIndicator, Share, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeft, ArrowRight, Check, Phone, Truck, MapPin, X,
  Share2, Film, Image as ImageIcon, Play, FileText, AlertCircle, ExternalLink, Plus, Camera,
} from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography } from '../../theme/tokens';
import { StatusBadge, Avatar, Card, Button } from '../../components';
import { getApiErrorMessage } from '../../lib/api';
import {
  operatorService, useOperatorTripById, type OperatorTripDetail, type OperatorDriver,
} from '../../lib/operator';
import { statusLabel, type TripStatus } from '../../lib/trips';
import { chooseMedia } from '../../lib/camera';

export async function shareMediaToWhatsApp(trip: OperatorTripDetail, doc: any) {
  const truck = (trip.vehicle?.ref_id || trip.vehicle?.plate_number || 'N/A').toUpperCase();
  const driverName = trip.driver ? `${trip.driver.first_name} ${trip.driver.last_name}`.toUpperCase() : 'UNASSIGNED';

  const categoryLabel = doc.doc_type === 'POD' ? 'PROOF OF DELIVERY (POD)' :
    doc.doc_type === 'Waybill' ? 'WAYBILL / CARGO PICKUP' :
    (doc.doc_type === 'Emergency' || doc.doc_type === 'Delay') ? 'DELAY & INCIDENT EVIDENCE' :
    doc.doc_type || 'TRIP ATTACHMENT';

  const mediaUrl = doc.file_url.startsWith('http')
    ? doc.file_url
    : `https://dev.mercon.tech${doc.file_url.startsWith('/') ? '' : '/'}${doc.file_url}`;

  let sharedViaNativeFile = false;

  // 1. Safely attempt expo-file-system download + expo-sharing native file asset share
  try {
    const FileSystem = require('expo-file-system/legacy');
    const expoSharing = require('expo-sharing');

    if (expoSharing && typeof expoSharing.isAvailableAsync === 'function') {
      const isAvailable = await expoSharing.isAvailableAsync().catch(() => false);
      if (isAvailable && typeof expoSharing.shareAsync === 'function') {
        let localUri = mediaUrl;

        if (!mediaUrl.startsWith('file://') && FileSystem) {
          let ext = 'jpg';
          const cleanUrl = mediaUrl.split('?')[0];
          const urlExt = cleanUrl.substring(cleanUrl.lastIndexOf('.') + 1).toLowerCase();
          if (['jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov', 'pdf'].includes(urlExt)) {
            ext = urlExt;
          } else if (doc.mime_type?.includes('png')) {
            ext = 'png';
          } else if (doc.mime_type?.includes('video') || doc.mime_type?.includes('mp4')) {
            ext = 'mp4';
          }

          const fileId = doc.id || `media_${Date.now()}`;
          const targetPath = `${FileSystem.cacheDirectory}trip_evidence_${fileId}.${ext}`;

          const info = await FileSystem.getInfoAsync(targetPath).catch(() => null);
          if (info && info.exists) {
            localUri = targetPath;
          } else {
            const downloadRes = await FileSystem.downloadAsync(mediaUrl, targetPath).catch(() => null);
            if (downloadRes?.uri) {
              localUri = downloadRes.uri;
            }
          }
        }

        const mimeType = doc.mime_type || (localUri.endsWith('.mp4') ? 'video/mp4' : localUri.endsWith('.png') ? 'image/png' : 'image/jpeg');
        await expoSharing.shareAsync(localUri, {
          mimeType,
          dialogTitle: `Share MERCON ${categoryLabel} - Truck #${truck}`,
          UTI: localUri.endsWith('.mp4') ? 'public.mpeg-4' : 'public.jpeg',
        });
        sharedViaNativeFile = true;
        return;
      }
    }
  } catch (err) {
    console.warn('Native file sharing unavailable or dev client mismatch:', err);
  }

  if (sharedViaNativeFile) return;

  // 2. Fallback to WhatsApp text link if native sharing module is missing or fails
  const notesStr = doc.ocr_raw_text ? `\nNotes: ${doc.ocr_raw_text}` : '';
  const message = `📸 MERCON Trip Evidence Update\n\nTruck: ${truck}\nDriver: ${driverName}\nCategory: ${categoryLabel}${notesStr}\n\nMedia Link:\n${mediaUrl}`;

  const encodedText = encodeURIComponent(message);
  const whatsappAppUrl = `whatsapp://send?text=${encodedText}`;
  const whatsappUniversalUrl = `https://wa.me/?text=${encodedText}`;

  try {
    const canOpen = await Linking.canOpenURL(whatsappAppUrl).catch(() => false);
    if (canOpen) {
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
    await Share.share({ message, title: 'Trip Evidence Update' });
  } catch {
    Alert.alert('Unable to Share', 'Could not open WhatsApp.');
  }
}

const mockMediaDocs = [
  {
    id: 'mock-pod-1',
    doc_type: 'POD',
    title: 'Signed Proof of Delivery (POD)',
    file_url: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=800&q=80',
    mime_type: 'image/jpeg',
    ocr_raw_text: '📍 [GPS: 24.713, 46.675] Consignment verified & signed at yard.',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'mock-delay-1',
    doc_type: 'Delay',
    title: 'Traffic & Route Delay Inspection Video',
    file_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    mime_type: 'video/mp4',
    ocr_raw_text: '⚠️ Highway maintenance blockage. 45 min delay logged.',
    createdAt: new Date().toISOString(),
  },
];

function getCategoryBadge(docType?: string | null) {
  switch (docType) {
    case 'POD':
      return { bg: '#ECFDF5', border: '#A7F3D0', text: '#047857', label: 'Proof of Delivery (POD)' };
    case 'Delay':
    case 'Emergency':
      return { bg: '#FEF2F2', border: '#FECACA', text: '#B91C1C', label: 'Delay / Incident' };
    case 'Waybill':
      return { bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8', label: 'Cargo Waybill' };
    default:
      return { bg: '#F3F4F6', border: '#E5E7EB', text: '#374151', label: docType || 'Attachment' };
  }
}

const NEXT_STEP: Partial<Record<TripStatus, { label: string; action: (id: string) => Promise<unknown>; confirm?: string }>> = {
  Scheduled: { label: 'Mark Arrived at Pickup', action: (id) => operatorService.pickupArrive(id) },
  Loading: { label: 'Verify Pickup & Depart', action: (id) => operatorService.updateTripStatus(id, 'InTransit') },
  InTransit: { label: 'Confirm Delivery', action: (id) => operatorService.updateTripStatus(id, 'Completed') },
  AtPickup: { label: 'Verify Pickup & Depart', action: (id) => operatorService.updateTripStatus(id, 'InTransit') },
  AtDelivery: {
    label: 'Confirm Delivery',
    action: (id) => operatorService.updateTripStatus(id, 'Completed'),
    confirm: 'This confirms the delivery, completes the trip, and generates the invoice. Continue?',
  },
};

const ACTIVE_STATUSES: TripStatus[] = ['Scheduled', 'Loading', 'InTransit', 'Delayed', 'Emergency'];

const STATUS_STEPS: { status: TripStatus; label: string }[] = [
  { status: 'Scheduled', label: 'Trip Scheduled' },
  { status: 'Loading', label: 'Loading at Pickup' },
  { status: 'InTransit', label: 'In Transit' },
  { status: 'Completed', label: 'Delivery Confirmed' },
];

function stepIndex(status: TripStatus): number {
  const i = STATUS_STEPS.findIndex((s) => s.status === status);
  return i === -1 ? STATUS_STEPS.length - 1 : i; // Invoiced/Cancelled treated as terminal
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return 'Pending';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Pending';
  return d.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function buildTimeline(trip: OperatorTripDetail) {
  const currentIndex = trip.status === 'Cancelled' ? -1 : stepIndex(trip.status);
  const stops = trip.stops ?? [];
  const pickupStop = stops.find((s) => s.stop_type === 'Pickup');
  const dropoffStop = stops.find((s) => s.stop_type === 'Dropoff');

  const timeFor = (i: number): string | null => {
    switch (STATUS_STEPS[i].status) {
      case 'Draft': return trip.createdAt;
      case 'Dispatched': return trip.planned_start ?? null;
      case 'AtPickup': return pickupStop?.actual_arrival ?? null;
      case 'InTransit': return trip.actual_start ?? null;
      case 'AtDelivery': return dropoffStop?.actual_arrival ?? null;
      case 'Completed': return trip.actual_end ?? null;
      default: return null;
    }
  };

  return STATUS_STEPS.map((step, i) => ({
    id: step.status,
    label: step.label,
    time: i <= currentIndex ? formatDateTime(timeFor(i)) : 'Pending',
    done: i < currentIndex || (i === currentIndex && trip.status === 'Completed'),
    active: i === currentIndex && trip.status !== 'Completed',
  }));
}

const driverName = (trip: OperatorTripDetail) =>
  trip.driver ? `${trip.driver.first_name} ${trip.driver.last_name}` : 'Unassigned';

const TripDetailsScreen = () => {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { trip, loading, error, refetch } = useOperatorTripById(id);
  const [advancing, setAdvancing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showReplaceDriver, setShowReplaceDriver] = useState(false);
  const [availableDrivers, setAvailableDrivers] = useState<OperatorDriver[]>([]);
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [previewMediaDoc, setPreviewMediaDoc] = useState<any>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  const handleUploadMedia = async () => {
    if (!id || !trip) return;
    try {
      const media = await chooseMedia();
      if (!media) return;
      setUploadingMedia(true);
      await operatorService.uploadTripPhoto(id, media.uri, 'pod');
      await refetch();
      Alert.alert('Success', 'Media uploaded successfully!');
    } catch (e) {
      Alert.alert('Upload Failed', getApiErrorMessage(e));
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleAdvance = () => {
    if (!trip || !id) return;
    const next = NEXT_STEP[trip.status];
    if (!next) return;
    const run = async () => {
      setAdvancing(true);
      try {
        await next.action(id);
        await refetch();
      } catch (e) {
        Alert.alert('Could not update trip', getApiErrorMessage(e));
      } finally {
        setAdvancing(false);
      }
    };
    if (next.confirm) {
      Alert.alert('Confirm', next.confirm, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: run },
      ]);
    } else {
      run();
    }
  };

  const handleCancelTrip = () => {
    if (!id) return;
    Alert.alert('Cancel Trip', 'This releases the driver and vehicle and cannot be undone. Cancel this trip?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Cancel Trip',
        style: 'destructive',
        onPress: async () => {
          setCancelling(true);
          try {
            await operatorService.updateTripStatus(id, 'Cancelled');
            await refetch();
          } catch (e) {
            Alert.alert('Could not cancel trip', getApiErrorMessage(e));
          } finally {
            setCancelling(false);
          }
        },
      },
    ]);
  };

  const openReplaceDriver = async () => {
    setShowReplaceDriver(true);
    setLoadingDrivers(true);
    try {
      const drivers = await operatorService.availableDrivers();
      setAvailableDrivers(drivers);
    } catch (e) {
      Alert.alert('Could not load drivers', getApiErrorMessage(e));
    } finally {
      setLoadingDrivers(false);
    }
  };

  const handleReplaceDriver = (newDriverId: string) => {
    if (!id) return;
    setReplacingId(newDriverId);
    operatorService.replaceDriver(id, newDriverId)
      .then(async () => {
        setShowReplaceDriver(false);
        await refetch();
      })
      .catch((e) => Alert.alert('Could not replace driver', getApiErrorMessage(e)))
      .finally(() => setReplacingId(null));
  };

  if (loading && !trip) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.gray100, justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.primary} />
      </SafeAreaView>
    );
  }

  if (!trip) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.gray100, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={styles.emptyText}>{error ?? 'Trip not found'}</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: Spacing.lg }}>
          <Text style={{ color: Colors.primary, fontWeight: '700' }}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const stops = trip.stops ?? [];
  const pickupStop = stops.find((s) => s.stop_type === 'Pickup');
  const dropoffStop = stops.find((s) => s.stop_type === 'Dropoff');
  const timeline = buildTimeline(trip);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.gray100 }}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.darkCard} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Dark Header Card */}
        <View style={styles.darkHeader}>
          <TouchableOpacity style={styles.backBtn} activeOpacity={0.8} onPress={() => router.back()}>
            <ArrowLeft size={22} color={Colors.white} strokeWidth={2.2} />
          </TouchableOpacity>
          <View style={styles.headerBody}>
            <View style={styles.headerTop}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Image
                  source={require('../../../assets/images/mercon-logo.png')}
                  style={{ width: 30, height: 30, borderRadius: 8 }}
                  resizeMode="contain"
                />
                <Text style={styles.tripId}>#{trip.ref_id ?? trip.id.slice(0, 8)}</Text>
              </View>
              <StatusBadge status={statusLabel(trip.status)} />
            </View>
            <View style={styles.routeRow}>
              <View style={styles.routePoint}>
                <View style={styles.routeDotGreen} />
                <Text style={styles.routeCity} numberOfLines={2}>
                  {pickupStop ? (pickupStop.location_name || `${pickupStop.location_lat.toFixed(2)}, ${pickupStop.location_lng.toFixed(2)}`) : 'Origin'}
                </Text>
              </View>
              <View style={styles.routeArrow}>
                <View style={styles.dashedLine} />
                <ArrowRight size={16} color={Colors.gray400} strokeWidth={2.2} />
              </View>
              <View style={styles.routePoint}>
                <View style={styles.routeDotOrange} />
                <Text style={styles.routeCity} numberOfLines={2}>
                  {dropoffStop ? (dropoffStop.location_name || `${dropoffStop.location_lat.toFixed(2)}, ${dropoffStop.location_lng.toFixed(2)}`) : 'Destination'}
                </Text>
              </View>
            </View>
            <View style={styles.headerStats}>
              <View style={styles.headerStat}>
                <Text style={styles.headerStatLabel}>Distance</Text>
                <Text style={styles.headerStatValue}>
                  {trip.planned_distance ? `${Math.round(trip.planned_distance)} km` : '—'}
                </Text>
              </View>
              <View style={styles.headerStat}>
                <Text style={styles.headerStatLabel}>Customer</Text>
                <Text style={styles.headerStatValue} numberOfLines={1}>
                  {trip.customer?.name || '—'}
                </Text>
              </View>
              <View style={styles.headerStat}>
                <Text style={styles.headerStatLabel}>Planned End</Text>
                <Text style={styles.headerStatValue}>{formatDateTime(trip.planned_end)}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Timeline */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trip Timeline</Text>
          <Card style={styles.timeline}>
            {timeline.map((step, i) => (
              <View key={step.id} style={styles.timelineItem}>
                <View style={styles.timelineLeft}>
                  <View style={[
                    styles.timelineCircle,
                    step.done ? styles.timelineCircleDone : null,
                    step.active ? styles.timelineCircleActive : null,
                  ]}>
                    {step.done && !step.active && <Check size={14} color={Colors.white} strokeWidth={3} />}
                    {step.active && <View style={styles.timelinePulse} />}
                  </View>
                  {i < timeline.length - 1 && (
                    <View style={[styles.timelineLine, step.done ? styles.timelineLineDone : null]} />
                  )}
                </View>
                <View style={styles.timelineContent}>
                  <Text style={[styles.timelineLabel, step.active ? styles.timelineLabelActive : null]}>
                    {step.label}
                  </Text>
                  <Text style={styles.timelineTime}>{step.time}</Text>
                </View>
              </View>
            ))}
          </Card>
        </View>

        {/* Trip Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trip Details</Text>
          <Card style={styles.detailCard}>
            {[
              { label: 'Customer', value: trip.customer?.name ?? '—' },
              { label: 'Planned Start', value: formatDateTime(trip.planned_start) },
            ].map((row, i, arr) => (
              <View
                key={row.label}
                style={[styles.detailRow, i < arr.length - 1 ? styles.detailRowBorder : null]}
              >
                <Text style={styles.detailLabel}>{row.label}</Text>
                <Text style={styles.detailValue}>{row.value}</Text>
              </View>
            ))}
          </Card>
        </View>

        {/* Assignment Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Assignment</Text>
          <Card style={styles.assignCard}>
            <View style={styles.assignRow}>
              <Avatar
                initials={trip.driver ? `${trip.driver.first_name[0]}${trip.driver.last_name[0]}` : '?'}
                size={48}
              />
              <View style={styles.assignInfo}>
                <Text style={styles.assignName}>{driverName(trip)}</Text>
                <Text style={styles.assignRole}>
                  Driver{trip.driver?.ref_id ? ` · ${trip.driver.ref_id}` : ''}
                </Text>
              </View>
              {trip.driver?.phone_primary ? (
                <TouchableOpacity
                  style={styles.callBtn}
                  activeOpacity={0.8}
                  onPress={() => Linking.openURL(`tel:${trip.driver!.phone_primary}`).catch(() => {})}
                >
                  <Phone size={20} color={Colors.white} strokeWidth={2.2} />
                </TouchableOpacity>
              ) : null}
            </View>
            {trip.vehicle ? (
              <>
                <View style={styles.assignDivider} />
                <View style={styles.vehicleRow}>
                  <Truck size={22} color={Colors.gray600} strokeWidth={2} />
                  <View>
                    <Text style={styles.vehicleName}>
                      {trip.vehicle.plate_number} · {trip.vehicle.asset_type}
                    </Text>
                    {trip.vehicle.ref_id ? <Text style={styles.vehiclePlate}>{trip.vehicle.ref_id}</Text> : null}
                  </View>
                </View>
              </>
            ) : null}
          </Card>
        </View>

        {/* Uploaded Media & Documents (POD, Delays, Cargo, Videos) */}
        <View style={styles.section}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md }}>
            <Text style={styles.sectionTitle}>
              Trip Media & Documents {trip.documents && trip.documents.length > 0 ? `(${trip.documents.length})` : ''}
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TouchableOpacity
                activeOpacity={0.7}
                disabled={uploadingMedia}
                onPress={handleUploadMedia}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.darkCard, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}
              >
                {uploadingMedia ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <>
                    <Plus size={12} color={Colors.white} strokeWidth={2.5} />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.white }}>Add Evidence</Text>
                  </>
                )}
              </TouchableOpacity>

              {trip.documents && trip.documents.length > 0 && (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => shareMediaToWhatsApp(trip, trip.documents![0])}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#25D3661A', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#25D36640' }}
                >
                  <Share2 size={12} color="#25D366" strokeWidth={2.5} />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#128C7E' }}>Share Media</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {(!trip.documents || trip.documents.length === 0) ? (
            <Card style={{ borderRadius: Radius.xl, padding: Spacing.lg, alignItems: 'center', gap: 8 }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.gray100, alignItems: 'center', justifyContent: 'center' }}>
                <ImageIcon size={20} color={Colors.gray400} />
              </View>
              <Text style={{ fontSize: Typography.xs, fontWeight: '700', color: Colors.gray700 }}>
                No Media or POD Uploaded Yet
              </Text>
              <Text style={{ fontSize: 11, color: Colors.gray500, textAlign: 'center' }}>
                Photos & videos uploaded by the driver during pickup/delivery or delay reports will appear here.
              </Text>
              <TouchableOpacity
                activeOpacity={0.8}
                disabled={uploadingMedia}
                onPress={handleUploadMedia}
                style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.lg }}
              >
                {uploadingMedia ? (
                  <ActivityIndicator color={Colors.white} size="small" />
                ) : (
                  <>
                    <Camera size={14} color={Colors.white} />
                    <Text style={{ fontSize: 11, fontWeight: '800', color: Colors.white }}>Upload Photo / Video Evidence</Text>
                  </>
                )}
              </TouchableOpacity>
            </Card>
          ) : (
            <Card style={{ borderRadius: Radius.xl, padding: Spacing.md, gap: Spacing.sm }}>
              {trip.documents.map((doc) => {
                const isVideo = doc.mime_type?.startsWith('video') || /\.(mp4|mov|webm|avi|mkv|3gp)$/i.test(doc.file_url);
                const isImage = doc.mime_type?.startsWith('image') || /\.(jpg|jpeg|png|webp)$/i.test(doc.file_url);
                const categoryBadge = getCategoryBadge(doc.doc_type);

                const fullUrl = doc.file_url.startsWith('http')
                  ? doc.file_url
                  : `https://dev.mercon.tech${doc.file_url.startsWith('/') ? '' : '/'}${doc.file_url}`;

                return (
                  <View key={doc.id} style={{ backgroundColor: Colors.gray100, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.gray200, gap: 10 }}>
                    {/* Header */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, paddingRight: 8 }}>
                        {isVideo ? <Film size={16} color={Colors.primary} /> : <ImageIcon size={16} color={Colors.success} />}
                        <Text style={{ fontSize: Typography.xs, fontWeight: '800', color: Colors.gray900 }} numberOfLines={1}>
                          {doc.doc_type === 'POD' ? 'Proof of Delivery (POD)' :
                           doc.doc_type === 'Waybill' ? 'Waybill Cargo Photo' :
                           doc.doc_type === 'Emergency' ? 'Incident / Delay Report' :
                           doc.doc_type || 'Attachment'}
                        </Text>
                      </View>
                      <View style={{ backgroundColor: categoryBadge.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: categoryBadge.border }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: categoryBadge.text, textTransform: 'uppercase' }}>
                          {categoryBadge.label}
                        </Text>
                      </View>
                    </View>

                    {/* Real Image Thumbnail Preview */}
                    {isImage && (
                      <TouchableOpacity activeOpacity={0.85} onPress={() => setPreviewMediaDoc(doc)}>
                        <Image
                          source={{ uri: fullUrl }}
                          style={{ width: '100%', height: 160, borderRadius: Radius.md, backgroundColor: Colors.gray200 }}
                        />
                      </TouchableOpacity>
                    )}

                    {/* Real Video Card Preview */}
                    {isVideo && (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => setPreviewMediaDoc(doc)}
                        style={{ width: '100%', height: 120, borderRadius: Radius.md, backgroundColor: Colors.darkCard, alignItems: 'center', justifyContent: 'center', gap: 6 }}
                      >
                        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                          <Play size={20} color={Colors.white} fill={Colors.white} style={{ marginLeft: 2 }} />
                        </View>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.white }}>Tap to Play Video Evidence</Text>
                      </TouchableOpacity>
                    )}

                    {doc.ocr_raw_text ? (
                      <Text style={{ fontSize: 11, color: Colors.gray600, fontWeight: '500' }}>
                        {doc.ocr_raw_text}
                      </Text>
                    ) : null}

                    {/* Action Bar */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, borderTopWidth: 1, borderTopColor: Colors.gray200 }}>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => setPreviewMediaDoc(doc)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                      >
                        {isVideo ? <Play size={12} color={Colors.primary} fill={Colors.primary} /> : <ImageIcon size={12} color={Colors.gray600} />}
                        <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.primary }}>
                          {isVideo ? 'Play Video' : 'View Full Image'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => shareMediaToWhatsApp(trip, doc)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#25D36620', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}
                      >
                        <Share2 size={12} color="#25D366" strokeWidth={2.5} />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#128C7E' }}>Share WhatsApp</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </Card>
          )}
        </View>

        {/* Actions */}
        {NEXT_STEP[trip.status] && (
          <View style={styles.actionsSection}>
            <Button
              variant="primary"
              label={advancing ? 'Updating…' : NEXT_STEP[trip.status]!.label}
              loading={advancing}
              onPress={handleAdvance}
            />
          </View>
        )}

        {ACTIVE_STATUSES.includes(trip.status) && (
          <View style={styles.actionsRow}>
            <Button
              variant="outline"
              label="Replace Driver"
              onPress={openReplaceDriver}
              style={styles.actionBtn}
            />
            <Button
              variant="danger"
              label={cancelling ? 'Cancelling…' : 'Cancel Trip'}
              loading={cancelling}
              onPress={handleCancelTrip}
              style={styles.actionBtn}
            />
          </View>
        )}

        <View style={styles.actionsSection}>
          <Button
            variant="outline"
            label="Track Live"
            iconLeft={<MapPin size={16} color={Colors.primary} strokeWidth={2.2} />}
            onPress={() => Alert.alert('Coming Soon', 'Live tracking will be available in a future update.')}
          />
        </View>
      </ScrollView>

      <Modal visible={showReplaceDriver} animationType="slide" transparent onRequestClose={() => setShowReplaceDriver(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Replace Driver</Text>
              <TouchableOpacity onPress={() => setShowReplaceDriver(false)} style={styles.modalClose}>
                <X size={20} color={Colors.gray900} strokeWidth={2.2} />
              </TouchableOpacity>
            </View>
            {loadingDrivers ? (
              <ActivityIndicator color={Colors.primary} style={{ marginVertical: Spacing.xl }} />
            ) : availableDrivers.length === 0 ? (
              <Text style={styles.emptyText}>No available drivers right now.</Text>
            ) : (
              <FlatList
                data={availableDrivers}
                keyExtractor={(d) => d.id}
                style={{ maxHeight: 360 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.driverRow}
                    activeOpacity={0.8}
                    disabled={replacingId !== null}
                    onPress={() => handleReplaceDriver(item.id)}
                  >
                    <Avatar initials={`${item.first_name[0] ?? ''}${item.last_name[0] ?? ''}`.toUpperCase()} size="md" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.driverRowName}>{item.first_name} {item.last_name}</Text>
                      <Text style={styles.driverRowId}>{item.ref_id ?? item.license_number}</Text>
                    </View>
                    {replacingId === item.id && <ActivityIndicator color={Colors.primary} />}
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Media & Evidence Full-Screen Viewer Modal */}
      <Modal
        visible={previewMediaDoc !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setPreviewMediaDoc(null)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'space-between', paddingVertical: Spacing.xl }}>
          {/* Top Bar */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingTop: Spacing.md }}>
            <View>
              <Text style={{ fontSize: Typography.sm, fontWeight: '800', color: Colors.white }}>
                {previewMediaDoc?.doc_type || previewMediaDoc?.title || 'Trip Evidence'}
              </Text>
              <Text style={{ fontSize: 11, color: Colors.gray400 }}>
                Uploaded for #{trip?.ref_id ?? trip?.id.slice(0, 8)}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => setPreviewMediaDoc(null)}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={20} color={Colors.white} />
            </TouchableOpacity>
          </View>

          {/* Media View */}
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.md }}>
            {previewMediaDoc && (
              (previewMediaDoc.mime_type?.startsWith('video') || previewMediaDoc.file_url?.endsWith('.mp4')) ? (
                <View style={{ width: '100%', height: 260, backgroundColor: Colors.darkCard, borderRadius: Radius.xl, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, borderWidth: 1, borderColor: Colors.gray800 }}>
                  <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                    <Play size={32} color={Colors.white} fill={Colors.white} style={{ marginLeft: 4 }} />
                  </View>
                  <Text style={{ fontSize: Typography.sm, fontWeight: '700', color: Colors.white }}>
                    Recorded Delay / Incident Video
                  </Text>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => Linking.openURL(previewMediaDoc.file_url).catch(() => {})}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.full }}
                  >
                    <ExternalLink size={14} color={Colors.white} />
                    <Text style={{ fontSize: Typography.xs, fontWeight: '700', color: Colors.white }}>Open Video Player</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Image
                  source={{ uri: previewMediaDoc.file_url.startsWith('http') ? previewMediaDoc.file_url : `https://dev.mercon.tech${previewMediaDoc.file_url}` }}
                  style={{ width: '100%', height: 320, borderRadius: Radius.xl, resizeMode: 'contain' }}
                />
              )
            )}
          </View>

          {/* Footer Controls */}
          {previewMediaDoc && (
            <View style={{ paddingHorizontal: Spacing.lg, gap: Spacing.sm }}>
              {previewMediaDoc.ocr_raw_text ? (
                <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: Spacing.sm, borderRadius: Radius.lg }}>
                  <Text style={{ fontSize: 11, color: Colors.gray300 }}>{previewMediaDoc.ocr_raw_text}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  shareMediaToWhatsApp(trip, previewMediaDoc);
                  setPreviewMediaDoc(null);
                }}
                style={{ backgroundColor: '#25D366', paddingVertical: 14, borderRadius: Radius.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                <Share2 size={16} color={Colors.white} strokeWidth={2.5} />
                <Text style={{ fontSize: Typography.sm, fontWeight: '800', color: Colors.white }}>
                  Share Attachment to WhatsApp
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  scroll: {
    paddingBottom: Spacing['3xl'],
  },
  darkHeader: {
    backgroundColor: Colors.darkCard,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing['2xl'],
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  headerBody: {
    gap: Spacing.md,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tripId: {
    fontSize: Typography.xl,
    fontWeight: '800',
    color: Colors.white,
    letterSpacing: 1,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  routePoint: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  routeDotGreen: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.success,
  },
  routeDotOrange: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  routeCity: {
    fontSize: Typography.xs,
    color: Colors.gray300,
    textAlign: 'center',
  },
  routeArrow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 0.5,
  },
  dashedLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.gray600,
  },
  headerStats: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: Colors.gray800,
    paddingTop: Spacing.md,
  },
  headerStat: {
    flex: 1,
    alignItems: 'center',
  },
  headerStatLabel: {
    fontSize: Typography.xs,
    color: Colors.gray500,
    marginBottom: 2,
  },
  headerStatValue: {
    fontSize: Typography.sm,
    fontWeight: '700',
    color: Colors.white,
  },
  section: {
    padding: Spacing.lg,
    paddingBottom: 0,
  },
  sectionTitle: {
    fontSize: Typography.base,
    fontWeight: '700',
    color: Colors.gray900,
    marginBottom: Spacing.md,
  },
  timeline: {
    borderRadius: Radius.xl,
    padding: Spacing.lg,
  },
  timelineItem: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  timelineLeft: {
    alignItems: 'center',
    width: 24,
  },
  timelineCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.gray300,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
  },
  timelineCircleDone: {
    backgroundColor: Colors.success,
    borderColor: Colors.success,
  },
  timelineCircleActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.white,
  },
  timelinePulse: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    minHeight: 24,
    backgroundColor: Colors.gray200,
    marginVertical: 2,
  },
  timelineLineDone: {
    backgroundColor: Colors.success,
  },
  timelineContent: {
    flex: 1,
    paddingBottom: Spacing.md,
  },
  timelineLabel: {
    fontSize: Typography.sm,
    fontWeight: '600',
    color: Colors.gray700,
  },
  timelineLabelActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  timelineTime: {
    fontSize: Typography.xs,
    color: Colors.gray400,
    marginTop: 2,
  },
  detailCard: {
    borderRadius: Radius.xl,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  detailRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  detailLabel: {
    fontSize: Typography.sm,
    color: Colors.gray500,
  },
  detailValue: {
    fontSize: Typography.sm,
    fontWeight: '700',
    color: Colors.gray900,
  },
  assignCard: {
    borderRadius: Radius.xl,
    padding: Spacing.lg,
  },
  assignRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  assignInfo: {
    flex: 1,
  },
  assignName: {
    fontSize: Typography.base,
    fontWeight: '700',
    color: Colors.gray900,
  },
  assignRole: {
    fontSize: Typography.xs,
    color: Colors.gray500,
    marginBottom: 3,
  },
  callBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignDivider: {
    height: 1,
    backgroundColor: Colors.gray100,
    marginBottom: Spacing.md,
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  vehicleName: {
    fontSize: Typography.sm,
    fontWeight: '700',
    color: Colors.gray900,
  },
  vehiclePlate: {
    fontSize: Typography.xs,
    color: Colors.gray500,
    marginTop: 2,
  },
  actionsRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.md,
  },
  actionsSection: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  actionBtn: {
    flex: 1,
  },
  emptyText: {
    fontSize: Typography.base,
    color: Colors.gray500,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: Typography.lg,
    fontWeight: '700',
    color: Colors.gray900,
  },
  modalClose: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    backgroundColor: Colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  driverRowName: {
    fontSize: Typography.sm,
    fontWeight: '700',
    color: Colors.gray900,
  },
  driverRowId: {
    fontSize: Typography.xs,
    color: Colors.gray500,
  },
});

export default TripDetailsScreen;

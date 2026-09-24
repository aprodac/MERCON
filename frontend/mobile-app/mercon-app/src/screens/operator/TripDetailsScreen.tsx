import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Modal, FlatList,
  StyleSheet, StatusBar, Linking, Alert, ActivityIndicator, Share, Image, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeft, ArrowRight, Check, Phone, Truck, MapPin, X, Building2,
  Share2, Film, Image as ImageIcon, Play, FileText, AlertCircle, ExternalLink, Plus, Camera,
} from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography } from '@mercon/mobile-shared/theme/tokens';
import { StatusBadge, Avatar, Card, Button } from '../../components';
import { getApiErrorMessage, API_URL } from '@mercon/mobile-shared/lib/api';
import {
  operatorService, useOperatorTripById, type OperatorTripDetail, type OperatorDriver, type OperatorVehicle,
} from '../../lib/operator';
import { statusLabel, type TripStatus } from '@mercon/mobile-shared/lib/trips';
import { chooseMedia } from '../../lib/camera';

function resolveMediaUrl(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  const base = API_URL.replace(/\/api(\/v\d+)?\/?$/, '');
  const cleanPath = url.startsWith('/') ? url : `/${url}`;
  return `${base}${cleanPath}`;
}

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
    console.warn('Native file sharing unavailable:', err);
  }

  if (sharedViaNativeFile) return;

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

function getCategoryBadge(docType?: string | null) {
  switch (docType) {
    case 'POD':
      return { bg: '#ECFDF5', border: '#A7F3D0', text: '#047857', label: 'Proof of Delivery (POD)' };
    case 'Delay':
    case 'Emergency':
      return { bg: '#FEF2F2', border: '#FECACA', text: '#FA634E', label: 'Delay / Incident' };
    case 'Waybill':
      return { bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8', label: 'Cargo Waybill' };
    default:
      return { bg: '#EEF1F6', border: '#E5E7EB', text: '#3E3C3D', label: docType || 'Attachment' };
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
  return i === -1 ? STATUS_STEPS.length - 1 : i;
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

const driverName = (trip: OperatorTripDetail) => {
  if (trip.is_third_party) return trip.third_party_driver_name || 'Subcontracted Driver';
  return trip.driver ? `${trip.driver.first_name} ${trip.driver.last_name}` : 'Unassigned';
};

function deriveTripType(trip: OperatorTripDetail): string {
  const raw = trip.quotation_line_type || trip.rateCard?.rate_category;
  if (raw) {
    const s = String(raw).trim();
    if (/round/i.test(s)) return 'Round Trip';
    if (/single/i.test(s) || /one.?way/i.test(s)) return 'Single Trip';
    return s;
  }
  const stops = trip.stops ?? [];
  if (stops.some((s) => (s.leg_index ?? 0) === 1)) return 'Round Trip';
  if (stops.length >= 3) {
    const first = (stops[0].location_name || '').toLowerCase().trim();
    const last = (stops[stops.length - 1].location_name || '').toLowerCase().trim();
    if (first && last && first === last) return 'Round Trip';
  }
  return 'Single Trip';
}

function formatSAR(val?: number | null): string {
  const n = Number(val ?? 0);
  return `SAR ${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

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
  const [showReplaceVehicle, setShowReplaceVehicle] = useState(false);
  const [availableVehicles, setAvailableVehicles] = useState<OperatorVehicle[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [replacingVehicleId, setReplacingVehicleId] = useState<string | null>(null);
  const [previewMediaDoc, setPreviewMediaDoc] = useState<any>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [timeConfirmDoc, setTimeConfirmDoc] = useState<any>(null);
  const [arrivalInput, setArrivalInput] = useState('');
  const [departureInput, setDepartureInput] = useState('');
  const [confirmingTime, setConfirmingTime] = useState(false);

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

  const openReplaceVehicle = async () => {
    setShowReplaceVehicle(true);
    setLoadingVehicles(true);
    try {
      const vehicles = await operatorService.availableVehicles();
      setAvailableVehicles(vehicles);
    } catch (e) {
      Alert.alert('Could not load trucks', getApiErrorMessage(e));
    } finally {
      setLoadingVehicles(false);
    }
  };

  const handleReplaceVehicle = (newVehicleId: string) => {
    if (!id) return;
    setReplacingVehicleId(newVehicleId);
    operatorService.replaceVehicle(id, newVehicleId)
      .then(async () => {
        setShowReplaceVehicle(false);
        await refetch();
      })
      .catch((e) => Alert.alert('Could not replace truck', getApiErrorMessage(e)))
      .finally(() => setReplacingVehicleId(null));
  };

  const openTimeConfirm = (doc: any, stop: OperatorTripDetail['stops'][number] | undefined) => {
    setTimeConfirmDoc(doc);
    setArrivalInput(stop?.actual_arrival ? formatDateTime(stop.actual_arrival) : '');
    setDepartureInput(stop?.actual_departure ? formatDateTime(stop.actual_departure) : '');
  };

  const handleConfirmTime = async () => {
    if (!trip || !timeConfirmDoc) return;
    const stopId = timeConfirmDoc.ai_extracted_json?.stop_id;
    if (!stopId) {
      Alert.alert('Cannot confirm', 'This evidence is not linked to a specific stop.');
      return;
    }
    setConfirmingTime(true);
    try {
      const payload: { document_id: string; actual_arrival?: string; actual_departure?: string } = {
        document_id: timeConfirmDoc.id,
      };
      const parsedArrival = arrivalInput.trim() ? new Date(arrivalInput.trim()) : null;
      const parsedDeparture = departureInput.trim() ? new Date(departureInput.trim()) : null;
      if (parsedArrival && !Number.isNaN(parsedArrival.getTime())) payload.actual_arrival = parsedArrival.toISOString();
      if (parsedDeparture && !Number.isNaN(parsedDeparture.getTime())) payload.actual_departure = parsedDeparture.toISOString();

      await operatorService.confirmEvidenceTime(trip.id, stopId, payload);
      setTimeConfirmDoc(null);
      await refetch();
      Alert.alert('Confirmed', 'Evidence time confirmed.');
    } catch (e) {
      Alert.alert('Could not confirm time', getApiErrorMessage(e));
    } finally {
      setConfirmingTime(false);
    }
  };

  const handleShareTripStatus = (trip: OperatorTripDetail, pickupStop?: OperatorTripDetail['stops'][number], dropoffStop?: OperatorTripDetail['stops'][number]) => {
    const driverLabel = trip.is_third_party
      ? (trip.third_party_driver_name || 'Assigned Driver')
      : driverName(trip);
    const vehicleLabel = trip.is_third_party
      ? (trip.third_party_vehicle_plate || 'Assigned Vehicle')
      : (trip.vehicle?.plate_number || 'Assigned Vehicle');

    const text = [
      `*MERCON Logistics - Trip Status Update*`,
      ``,
      `*Trip ID:* ${trip.ref_id || trip.id}`,
      `*Customer:* ${trip.customer?.name || 'Customer'}`,
      `*Status:* ${statusLabel(trip.status)}`,
      `*Planned Start:* ${formatDateTime(trip.planned_start)}`,
      `*Planned End:* ${formatDateTime(trip.planned_end)}`,
      ``,
      `*Pickup:* ${pickupStop?.location_name || 'Origin'}`,
      `*Drop-off:* ${dropoffStop?.location_name || 'Destination'}`,
      ``,
      `*Driver:* ${driverLabel}`,
      `*Vehicle:* ${vehicleLabel}`,
      ``,
      `Thank you for shipping with MERCON Logistics!`,
    ].join('\n');

    const encodedText = encodeURIComponent(text);
    Linking.openURL(`whatsapp://send?text=${encodedText}`).catch(() => {
      Linking.openURL(`https://wa.me/?text=${encodedText}`).catch(() => {
        Share.share({ message: text, title: 'Trip Status Update' }).catch(() => {});
      });
    });
  };

  if (loading && !trip) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#EEF1F6', justifyContent: 'center' }}>
        <ActivityIndicator color="#FA634E" size="large" />
      </SafeAreaView>
    );
  }

  if (!trip) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#EEF1F6', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={styles.emptyText}>{error ?? 'Trip not found'}</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: Spacing.lg }}>
          <Text style={{ color: '#FA634E', fontWeight: '800' }}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const stops = trip.stops ?? [];
  const pickupStop = stops.find((s) => s.stop_type === 'Pickup');
  const dropoffStop = stops.find((s) => s.stop_type === 'Dropoff');
  const timeline = buildTimeline(trip);

  const tripType = deriveTripType(trip);
  const quotationName = trip.quotation?.name || trip.rateCard?.name || null;
  const hasCoDriver = !trip.is_third_party && !!trip.coDriver && Number(trip.co_driver_payout ?? 0) > 0;
  const driverPayoutVal = Number(trip.driver_payout ?? trip.driver_charge ?? trip.trip_charges ?? 0);
  const billingVal = Number(trip.billing_amount ?? trip.applied_rate ?? 0);
  const chargesList = trip.charges ?? [];
  const chargesTotal = chargesList.reduce((sum, c) => sum + Number(c.amount || 0), 0);
  const totalInvoice = billingVal + chargesTotal;
  const paidAmount = Number(trip.paid_amount ?? 0);
  const balanceDue = Number(trip.balance_due ?? (totalInvoice - paidAmount));
  const vehicleTonClass = trip.vehicle?.capacity_kg ? `${Math.round(trip.vehicle.capacity_kg / 1000)} TON` : (trip.rateCard?.vehicle_type ?? null);
  const sortedStops = [...stops].sort((a, b) => a.stop_sequence - b.stop_sequence);
  const delayedStops = sortedStops.filter((s) => !!s.delay_reason);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#EEF1F6' }}>
      <StatusBar barStyle="light-content" backgroundColor="#3E3C3D" />
      <ScrollView contentContainerStyle={styles.scroll}>
        
        {/* MERCON Dark Charcoal Hero Header */}
        <View style={styles.darkHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md }}>
            <TouchableOpacity style={styles.backBtn} activeOpacity={0.8} onPress={() => router.back()}>
              <ArrowLeft size={20} color="#FFFFFF" strokeWidth={2.5} />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => handleShareTripStatus(trip, pickupStop, dropoffStop)}
              style={styles.shareHeaderBtn}
            >
              <Share2 size={15} color="#FFFFFF" strokeWidth={2.2} />
              <Text style={styles.shareHeaderBtnText}>Share Status</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.headerBody}>
            <View style={styles.headerTop}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {resolveMediaUrl(trip.customer?.logo_url) ? (
                  <Image
                    source={{ uri: resolveMediaUrl(trip.customer?.logo_url)! }}
                    style={styles.customerLogoHeader}
                    resizeMode="cover"
                  />
                ) : (
                  <Image
                    source={require('../../../assets/images/mercon-logo.png')}
                    style={styles.customerLogoHeader}
                    resizeMode="contain"
                  />
                )}
                <Text style={styles.tripId}>#{trip.ref_id ?? trip.id.slice(0, 8)}</Text>
              </View>
              <StatusBadge status={statusLabel(trip.status)} />
            </View>

            {trip.driver_workflow === 'EXTERNAL_APP' && (
              <View style={styles.workflowChip}>
                <ExternalLink size={11} color="#FA634E" strokeWidth={2.4} />
                <Text style={styles.workflowChipText}>External App Workflow</Text>
              </View>
            )}

            {/* Route Bar */}
            <View style={styles.routeRow}>
              <View style={styles.routePoint}>
                <View style={styles.routeDotGreen} />
                <Text style={styles.routeCity} numberOfLines={2}>
                  {pickupStop ? (pickupStop.location_name || `${pickupStop.location_lat.toFixed(2)}, ${pickupStop.location_lng.toFixed(2)}`) : 'Origin'}
                </Text>
              </View>
              <View style={styles.routeArrow}>
                <View style={styles.dashedLine} />
                <View style={styles.arrowCapsule}>
                  <ArrowRight size={13} color="#FFFFFF" strokeWidth={2.5} />
                </View>
                <View style={styles.dashedLine} />
              </View>
              <View style={styles.routePoint}>
                <View style={styles.routeDotOrange} />
                <Text style={styles.routeCity} numberOfLines={2}>
                  {dropoffStop ? (dropoffStop.location_name || `${dropoffStop.location_lat.toFixed(2)}, ${dropoffStop.location_lng.toFixed(2)}`) : 'Destination'}
                </Text>
              </View>
            </View>

            {/* Header Metrics Row */}
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

        {/* Lifecycle Stepper */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trip Progress</Text>
          <Card style={styles.timeline}>
            {timeline.map((step, i) => (
              <View key={step.id} style={styles.timelineItem}>
                <View style={styles.timelineLeft}>
                  <View style={[
                    styles.timelineCircle,
                    step.done ? styles.timelineCircleDone : null,
                    step.active ? styles.timelineCircleActive : null,
                  ]}>
                    {step.done && !step.active && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
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

        {/* Delay Alerts Banner */}
        {delayedStops.length > 0 && (
          <View style={styles.section}>
            <Card style={styles.delayCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={18} color="#FA634E" strokeWidth={2.2} />
                <Text style={styles.delayTitle}>
                  {delayedStops.length} Delay {delayedStops.length === 1 ? 'Alert' : 'Alerts'}
                </Text>
              </View>
              {delayedStops.map((s) => (
                <Text key={s.id} style={styles.delayText}>
                  {s.location_name || 'Stop'}: {s.delay_note || s.delay_reason}
                </Text>
              ))}
            </Card>
          </View>
        )}

        {/* Trip Metadata Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trip Details</Text>
          <Card style={styles.detailCard}>
            {[
              { label: 'Customer', value: trip.customer?.name ?? '—' },
              { label: 'Trip Type', value: tripType },
              ...(quotationName ? [{ label: 'Quotation', value: quotationName }] : []),
              { label: 'Planned Start', value: formatDateTime(trip.planned_start) },
              { label: 'Created', value: formatDateTime(trip.createdAt) },
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

        {/* Route & Stops Ledger */}
        {sortedStops.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Route & Stops</Text>
            <Card style={styles.detailCard}>
              {sortedStops.map((s, i) => (
                <View
                  key={s.id}
                  style={[styles.stopRow, i < sortedStops.length - 1 ? styles.detailRowBorder : null]}
                >
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={styles.stopName} numberOfLines={1}>
                      {i + 1}. {s.location_name || `${s.stop_type} Stop`}
                      {(s.leg_index ?? 0) === 1 ? ' (Return)' : ''}
                    </Text>
                    <Text style={styles.stopType}>{s.stop_type}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.stopTime}>Arr: {formatDateTime(s.actual_arrival ?? s.planned_arrival)}</Text>
                    <Text style={styles.stopTime}>Dep: {formatDateTime(s.actual_departure)}</Text>
                  </View>
                </View>
              ))}
            </Card>
          </View>
        )}

        {/* Financial Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Financial Summary</Text>
          <Card style={styles.detailCard}>
            {[
              { label: 'Customer Billing', value: formatSAR(billingVal) },
              { label: trip.is_third_party ? '3PL Payout' : 'Driver Payout', value: `- ${formatSAR(driverPayoutVal)}` },
              ...(hasCoDriver ? [{ label: 'Co-Driver Payout', value: `- ${formatSAR(trip.co_driver_payout)}` }] : []),
              ...(trip.is_third_party && trip.third_party_cost ? [{ label: 'Subcontractor Cost', value: `- ${formatSAR(trip.third_party_cost)}` }] : []),
              { label: `Additional Charges${chargesList.length ? ` (${chargesList.length})` : ''}`, value: chargesTotal > 0 ? `+ ${formatSAR(chargesTotal)}` : formatSAR(0) },
              { label: 'Total Invoice', value: formatSAR(totalInvoice) },
              { label: 'Paid', value: formatSAR(paidAmount) },
              { label: 'Balance Due', value: formatSAR(balanceDue) },
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

        {/* Resource Assignment Info */}
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
              {!trip.is_third_party && trip.driver?.phone_primary ? (
                <TouchableOpacity
                  style={styles.callBtn}
                  activeOpacity={0.8}
                  onPress={() => Linking.openURL(`tel:${trip.driver!.phone_primary}`).catch(() => {})}
                >
                  <Phone size={18} color="#FFFFFF" strokeWidth={2.2} />
                </TouchableOpacity>
              ) : null}
              {trip.is_third_party && trip.third_party_driver_phone ? (
                <TouchableOpacity
                  style={styles.callBtn}
                  activeOpacity={0.8}
                  onPress={() => Linking.openURL(`tel:${trip.third_party_driver_phone}`).catch(() => {})}
                >
                  <Phone size={18} color="#FFFFFF" strokeWidth={2.2} />
                </TouchableOpacity>
              ) : null}
            </View>

            {trip.coDriver ? (
              <>
                <View style={styles.assignDivider} />
                <View style={styles.assignRow}>
                  <Avatar initials={`${trip.coDriver.first_name[0] ?? ''}${trip.coDriver.last_name[0] ?? ''}`} size={40} />
                  <View style={styles.assignInfo}>
                    <Text style={styles.assignName}>{trip.coDriver.first_name} {trip.coDriver.last_name}</Text>
                    <Text style={styles.assignRole}>
                      Co-Driver{trip.coDriver.ref_id ? ` · ${trip.coDriver.ref_id}` : ''}
                    </Text>
                  </View>
                  {trip.coDriver.phone_primary ? (
                    <TouchableOpacity
                      style={styles.callBtn}
                      activeOpacity={0.8}
                      onPress={() => Linking.openURL(`tel:${trip.coDriver!.phone_primary}`).catch(() => {})}
                    >
                      <Phone size={18} color="#FFFFFF" strokeWidth={2.2} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </>
            ) : null}

            {trip.is_third_party ? (
              <>
                <View style={styles.assignDivider} />
                <View style={styles.vehicleRow}>
                  <Truck size={22} color="#6E6E80" strokeWidth={2} />
                  <View>
                    <Text style={styles.vehicleName}>
                      3PL: {trip.third_party_vehicle_plate || 'Subcontractor'}
                    </Text>
                    {trip.third_party_vehicle_type ? <Text style={styles.vehiclePlate}>{trip.third_party_vehicle_type}</Text> : null}
                  </View>
                </View>
              </>
            ) : trip.vehicle ? (
              <>
                <View style={styles.assignDivider} />
                <View style={styles.vehicleRow}>
                  <Truck size={22} color="#6E6E80" strokeWidth={2} />
                  <View>
                    <Text style={styles.vehicleName}>
                      {trip.vehicle.plate_number} · {trip.vehicle.asset_type}
                      {vehicleTonClass ? ` (${vehicleTonClass})` : ''}
                    </Text>
                    {trip.vehicle.ref_id ? <Text style={styles.vehiclePlate}>{trip.vehicle.ref_id}</Text> : null}
                  </View>
                </View>
              </>
            ) : null}
          </Card>
        </View>

        {/* Uploaded Media & Proof Attachments */}
        <View style={styles.section}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md }}>
            <Text style={styles.sectionTitle}>
              Trip Media & Evidence {trip.documents && trip.documents.length > 0 ? `(${trip.documents.length})` : ''}
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TouchableOpacity
                activeOpacity={0.7}
                disabled={uploadingMedia}
                onPress={handleUploadMedia}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FA634E', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 }}
              >
                {uploadingMedia ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Plus size={12} color="#FFFFFF" strokeWidth={2.5} />
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#FFFFFF' }}>Add Evidence</Text>
                  </>
                )}
              </TouchableOpacity>

              {trip.documents && trip.documents.length > 0 && (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => shareMediaToWhatsApp(trip, trip.documents![0])}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#25D3661F', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1, borderColor: '#25D36640' }}
                >
                  <Share2 size={12} color="#25D366" strokeWidth={2.5} />
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#128C7E' }}>Share Media</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {(!trip.documents || trip.documents.length === 0) ? (
            <Card style={{ borderRadius: Radius.xl, padding: Spacing.lg, alignItems: 'center', gap: 8, backgroundColor: '#FFFFFF', borderColor: '#EEF1F6' }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#EEF1F6', alignItems: 'center', justifyContent: 'center' }}>
                <ImageIcon size={20} color="#9898A4" />
              </View>
              <Text style={{ fontSize: Typography.xs, fontWeight: '700', color: '#3E3C3D' }}>
                No Media or POD Uploaded Yet
              </Text>
              <Text style={{ fontSize: 11, color: '#6E6E80', textAlign: 'center' }}>
                Photos & videos uploaded by driver or operator will appear here.
              </Text>
              <TouchableOpacity
                activeOpacity={0.8}
                disabled={uploadingMedia}
                onPress={handleUploadMedia}
                style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FA634E', paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.lg }}
              >
                {uploadingMedia ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Camera size={14} color="#FFFFFF" />
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#FFFFFF' }}>Upload Photo / Video Evidence</Text>
                  </>
                )}
              </TouchableOpacity>
            </Card>
          ) : (
            <Card style={{ borderRadius: Radius.xl, padding: Spacing.md, gap: Spacing.sm, backgroundColor: '#FFFFFF', borderColor: '#EEF1F6' }}>
              {trip.documents.map((doc) => {
                const isVideo = doc.mime_type?.startsWith('video') || /\.(mp4|mov|webm|avi|mkv|3gp)$/i.test(doc.file_url);
                const isImage = doc.mime_type?.startsWith('image') || /\.(jpg|jpeg|png|webp)$/i.test(doc.file_url);
                const categoryBadge = getCategoryBadge(doc.doc_type);
                const needsTimeReview = doc.ai_extracted_json?.source === 'external_app_screenshot' && doc.status === 'PendingReview';
                const relatedStop = needsTimeReview
                  ? stops.find((s) => s.id === doc.ai_extracted_json?.stop_id)
                  : undefined;

                const fullUrl = doc.file_url.startsWith('http')
                  ? doc.file_url
                  : `https://dev.mercon.tech${doc.file_url.startsWith('/') ? '' : '/'}${doc.file_url}`;

                return (
                  <View
                    key={doc.id}
                    style={[
                      { backgroundColor: '#EEF1F6', borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: '#D8D8DC', gap: 10 },
                      needsTimeReview ? styles.evidenceNeedsReview : null,
                    ]}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, paddingRight: 8 }}>
                        {isVideo ? <Film size={16} color="#FA634E" /> : <ImageIcon size={16} color="#16A34A" />}
                        <Text style={{ fontSize: Typography.xs, fontWeight: '800', color: '#3E3C3D' }} numberOfLines={1}>
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

                    {needsTimeReview && (
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => openTimeConfirm(doc, relatedStop)}
                        style={styles.needsTimeBanner}
                      >
                        <AlertCircle size={13} color="#B45309" strokeWidth={2.2} />
                        <Text style={styles.needsTimeText}>
                          Needs Time Confirmation — tap to confirm/correct
                        </Text>
                      </TouchableOpacity>
                    )}

                    {isImage && (
                      <TouchableOpacity activeOpacity={0.85} onPress={() => setPreviewMediaDoc(doc)}>
                        <Image
                          source={{ uri: fullUrl }}
                          style={{ width: '100%', height: 160, borderRadius: Radius.md, backgroundColor: '#D8D8DC' }}
                        />
                      </TouchableOpacity>
                    )}

                    {isVideo && (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => setPreviewMediaDoc(doc)}
                        style={{ width: '100%', height: 120, borderRadius: Radius.md, backgroundColor: '#3E3C3D', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                      >
                        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#FA634E', alignItems: 'center', justifyContent: 'center' }}>
                          <Play size={20} color="#FFFFFF" fill="#FFFFFF" style={{ marginLeft: 2 }} />
                        </View>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF' }}>Tap to Play Video Evidence</Text>
                      </TouchableOpacity>
                    )}

                    {doc.ocr_raw_text ? (
                      <Text style={{ fontSize: 11, color: '#52525B', fontWeight: '500' }}>
                        {doc.ocr_raw_text}
                      </Text>
                    ) : null}

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, borderTopWidth: 1, borderTopColor: '#D8D8DC' }}>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => setPreviewMediaDoc(doc)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                      >
                        {isVideo ? <Play size={12} color="#FA634E" fill="#FA634E" /> : <ImageIcon size={12} color="#52525B" />}
                        <Text style={{ fontSize: 11, fontWeight: '800', color: '#FA634E' }}>
                          {isVideo ? 'Play Video' : 'View Full Image'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => shareMediaToWhatsApp(trip, doc)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#25D36620', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}
                      >
                        <Share2 size={12} color="#25D366" strokeWidth={2.5} />
                        <Text style={{ fontSize: 11, fontWeight: '800', color: '#128C7E' }}>Share WhatsApp</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </Card>
          )}
        </View>

        {/* Primary Action Button */}
        {NEXT_STEP[trip.status] && (
          <View style={styles.actionsSection}>
            <TouchableOpacity
              onPress={handleAdvance}
              disabled={advancing}
              style={{ backgroundColor: '#FA634E', paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}
            >
              {advancing ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={{ fontSize: 14, fontWeight: '900', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {NEXT_STEP[trip.status]!.label}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Quick Replacements */}
        {ACTIVE_STATUSES.includes(trip.status) && !trip.is_third_party && (
          <View style={styles.actionsRow}>
            <TouchableOpacity
              onPress={openReplaceDriver}
              style={{ flex: 1, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D8D8DC', paddingVertical: 12, borderRadius: 12, alignItems: 'center' }}
            >
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#3E3C3D' }}>Replace Driver</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={openReplaceVehicle}
              style={{ flex: 1, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D8D8DC', paddingVertical: 12, borderRadius: 12, alignItems: 'center' }}
            >
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#3E3C3D' }}>Replace Truck</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Cancel Trip Button */}
        {ACTIVE_STATUSES.includes(trip.status) && (
          <View style={styles.actionsSection}>
            <TouchableOpacity
              onPress={handleCancelTrip}
              disabled={cancelling}
              style={{ backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', paddingVertical: 12, borderRadius: 12, alignItems: 'center' }}
            >
              {cancelling ? (
                <ActivityIndicator color="#DC2626" size="small" />
              ) : (
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#DC2626' }}>Cancel Trip</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Secondary Action Row */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            onPress={() => handleShareTripStatus(trip, pickupStop, dropoffStop)}
            style={{ flex: 1, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D8D8DC', paddingVertical: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <Share2 size={15} color="#FA634E" strokeWidth={2.2} />
            <Text style={{ fontSize: 12, fontWeight: '800', color: '#FA634E' }}>Share Trip Status</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            onPress={() => Alert.alert('Live Track', 'GPS real-time stream active.')}
            style={{ flex: 1, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D8D8DC', paddingVertical: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <MapPin size={15} color="#3E3C3D" strokeWidth={2.2} />
            <Text style={{ fontSize: 12, fontWeight: '800', color: '#3E3C3D' }}>Track Live</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Replace Driver Modal */}
      <Modal visible={showReplaceDriver} animationType="slide" transparent onRequestClose={() => setShowReplaceDriver(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Replace Driver</Text>
              <TouchableOpacity onPress={() => setShowReplaceDriver(false)} style={styles.modalClose}>
                <X size={20} color="#3E3C3D" strokeWidth={2.2} />
              </TouchableOpacity>
            </View>
            {loadingDrivers ? (
              <ActivityIndicator color="#FA634E" style={{ marginVertical: Spacing.xl }} />
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
                    {replacingId === item.id && <ActivityIndicator color="#FA634E" />}
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Replace Truck Modal */}
      <Modal visible={showReplaceVehicle} animationType="slide" transparent onRequestClose={() => setShowReplaceVehicle(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Replace Truck</Text>
              <TouchableOpacity onPress={() => setShowReplaceVehicle(false)} style={styles.modalClose}>
                <X size={20} color="#3E3C3D" strokeWidth={2.2} />
              </TouchableOpacity>
            </View>
            {loadingVehicles ? (
              <ActivityIndicator color="#FA634E" style={{ marginVertical: Spacing.xl }} />
            ) : availableVehicles.length === 0 ? (
              <Text style={styles.emptyText}>No available trucks right now.</Text>
            ) : (
              <FlatList
                data={availableVehicles}
                keyExtractor={(v) => v.id}
                style={{ maxHeight: 360 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.driverRow}
                    activeOpacity={0.8}
                    disabled={replacingVehicleId !== null}
                    onPress={() => handleReplaceVehicle(item.id)}
                  >
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#EEF1F6', alignItems: 'center', justifyContent: 'center' }}>
                      <Truck size={18} color="#3E3C3D" strokeWidth={2} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.driverRowName}>{item.plate_number} · {item.asset_type}</Text>
                      <Text style={styles.driverRowId}>{item.ref_id ?? `${Math.round(item.capacity_kg / 1000)} TON`}</Text>
                    </View>
                    {replacingVehicleId === item.id && <ActivityIndicator color="#FA634E" />}
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Confirm Evidence Time Modal */}
      <Modal visible={timeConfirmDoc !== null} animationType="slide" transparent onRequestClose={() => setTimeConfirmDoc(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Confirm Evidence Time</Text>
              <TouchableOpacity onPress={() => setTimeConfirmDoc(null)} style={styles.modalClose}>
                <X size={20} color="#3E3C3D" strokeWidth={2.2} />
              </TouchableOpacity>
            </View>
            <Text style={styles.timeModalHint}>
              Check the screenshot's real timestamp and confirm below (format: YYYY-MM-DD HH:mm).
            </Text>
            <Text style={styles.timeInputLabel}>Actual Arrival</Text>
            <TextInput
              value={arrivalInput}
              onChangeText={setArrivalInput}
              placeholder="YYYY-MM-DD HH:mm"
              placeholderTextColor="#9898A4"
              style={styles.timeInput}
            />
            <Text style={styles.timeInputLabel}>Actual Departure</Text>
            <TextInput
              value={departureInput}
              onChangeText={setDepartureInput}
              placeholder="YYYY-MM-DD HH:mm"
              placeholderTextColor="#9898A4"
              style={styles.timeInput}
            />
            <Button
              variant="primary"
              label={confirmingTime ? 'Saving…' : 'Confirm Time'}
              loading={confirmingTime}
              onPress={handleConfirmTime}
              style={{ marginTop: Spacing.md }}
            />
          </View>
        </View>
      </Modal>

      {/* Full Screen Viewer Modal */}
      <Modal
        visible={previewMediaDoc !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setPreviewMediaDoc(null)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'space-between', paddingVertical: Spacing.xl }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingTop: Spacing.md }}>
            <View>
              <Text style={{ fontSize: Typography.sm, fontWeight: '800', color: '#FFFFFF' }}>
                {previewMediaDoc?.doc_type || previewMediaDoc?.title || 'Trip Evidence'}
              </Text>
              <Text style={{ fontSize: 11, color: '#D8D8DC' }}>
                Uploaded for #{trip?.ref_id ?? trip?.id.slice(0, 8)}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => setPreviewMediaDoc(null)}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.md }}>
            {previewMediaDoc && (
              (previewMediaDoc.mime_type?.startsWith('video') || previewMediaDoc.file_url?.endsWith('.mp4')) ? (
                <View style={{ width: '100%', height: 260, backgroundColor: '#3E3C3D', borderRadius: Radius.xl, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, borderWidth: 1, borderColor: '#52525B' }}>
                  <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#FA634E', alignItems: 'center', justifyContent: 'center' }}>
                    <Play size={32} color="#FFFFFF" fill="#FFFFFF" style={{ marginLeft: 4 }} />
                  </View>
                  <Text style={{ fontSize: Typography.sm, fontWeight: '700', color: '#FFFFFF' }}>
                    Recorded Delay / Incident Video
                  </Text>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => Linking.openURL(previewMediaDoc.file_url).catch(() => {})}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.full }}
                  >
                    <ExternalLink size={14} color="#FFFFFF" />
                    <Text style={{ fontSize: Typography.xs, fontWeight: '700', color: '#FFFFFF' }}>Open Video Player</Text>
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

          {previewMediaDoc && (
            <View style={{ paddingHorizontal: Spacing.lg, gap: Spacing.sm }}>
              {previewMediaDoc.ocr_raw_text ? (
                <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: Spacing.sm, borderRadius: Radius.lg }}>
                  <Text style={{ fontSize: 11, color: '#D8D8DC' }}>{previewMediaDoc.ocr_raw_text}</Text>
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
                <Share2 size={16} color="#FFFFFF" strokeWidth={2.5} />
                <Text style={{ fontSize: Typography.sm, fontWeight: '800', color: '#FFFFFF' }}>
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
    backgroundColor: '#3E3C3D',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FA634E',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  shareHeaderBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
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
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  customerLogoHeader: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  workflowChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(250,99,78,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(250,99,78,0.35)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  workflowChipText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FA634E',
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.06)',
    padding: Spacing.md,
    borderRadius: 16,
  },
  routePoint: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  routeDotGreen: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#16A34A',
  },
  routeDotOrange: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FA634E',
  },
  routeCity: {
    fontSize: Typography.xs,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  routeArrow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 0.4,
  },
  dashedLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  arrowCapsule: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FA634E',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
  },
  headerStats: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
    paddingTop: Spacing.md,
  },
  headerStat: {
    flex: 1,
    alignItems: 'center',
  },
  headerStatLabel: {
    fontSize: Typography.xs,
    color: '#9898A4',
    marginBottom: 2,
  },
  headerStatValue: {
    fontSize: Typography.sm,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  section: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  sectionTitle: {
    fontSize: Typography.sm,
    fontWeight: '900',
    color: '#3E3C3D',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  timeline: {
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    backgroundColor: '#FFFFFF',
    borderColor: '#EEF1F6',
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
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#D8D8DC',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  timelineCircleDone: {
    backgroundColor: '#16A34A',
    borderColor: '#16A34A',
  },
  timelineCircleActive: {
    borderColor: '#FA634E',
    backgroundColor: '#FFFFFF',
  },
  timelinePulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FA634E',
  },
  timelineLine: {
    width: 2,
    flex: 1,
    minHeight: 24,
    backgroundColor: '#EEF1F6',
    marginVertical: 2,
  },
  timelineLineDone: {
    backgroundColor: '#16A34A',
  },
  timelineContent: {
    flex: 1,
    paddingBottom: Spacing.md,
  },
  timelineLabel: {
    fontSize: Typography.sm,
    fontWeight: '700',
    color: '#6E6E80',
  },
  timelineLabelActive: {
    color: '#FA634E',
    fontWeight: '800',
  },
  timelineTime: {
    fontSize: Typography.xs,
    color: '#9898A4',
    marginTop: 2,
  },
  detailCard: {
    borderRadius: Radius.xl,
    backgroundColor: '#FFFFFF',
    borderColor: '#EEF1F6',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  detailRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#EEF1F6',
  },
  detailLabel: {
    fontSize: Typography.sm,
    fontWeight: '600',
    color: '#6E6E80',
  },
  detailValue: {
    fontSize: Typography.sm,
    fontWeight: '800',
    color: '#3E3C3D',
  },
  delayCard: {
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    gap: 6,
  },
  delayTitle: {
    fontSize: Typography.sm,
    fontWeight: '900',
    color: '#FA634E',
  },
  delayText: {
    fontSize: Typography.xs,
    fontWeight: '700',
    color: '#991B1B',
  },
  evidenceNeedsReview: {
    borderColor: '#FBBF24',
    borderWidth: 1.5,
    backgroundColor: '#FFFBEB',
  },
  needsTimeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FBBF24',
    borderRadius: Radius.md,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  needsTimeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
    flex: 1,
  },
  stopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  stopName: {
    fontSize: Typography.sm,
    fontWeight: '800',
    color: '#3E3C3D',
  },
  stopType: {
    fontSize: Typography.xs,
    color: '#6E6E80',
    marginTop: 2,
  },
  stopTime: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3E3C3D',
  },
  assignCard: {
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    backgroundColor: '#FFFFFF',
    borderColor: '#EEF1F6',
  },
  assignRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  assignInfo: {
    flex: 1,
  },
  assignName: {
    fontSize: Typography.base,
    fontWeight: '800',
    color: '#3E3C3D',
  },
  assignRole: {
    fontSize: Typography.xs,
    color: '#6E6E80',
    marginTop: 2,
  },
  callBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FA634E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignDivider: {
    height: 1,
    backgroundColor: '#EEF1F6',
    marginVertical: Spacing.md,
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  vehicleName: {
    fontSize: Typography.sm,
    fontWeight: '800',
    color: '#3E3C3D',
  },
  vehiclePlate: {
    fontSize: Typography.xs,
    color: '#6E6E80',
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
  emptyText: {
    fontSize: Typography.base,
    color: '#6E6E80',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
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
    fontWeight: '800',
    color: '#3E3C3D',
  },
  modalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EEF1F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF1F6',
  },
  driverRowName: {
    fontSize: Typography.sm,
    fontWeight: '800',
    color: '#3E3C3D',
  },
  driverRowId: {
    fontSize: Typography.xs,
    color: '#6E6E80',
  },
  timeModalHint: {
    fontSize: Typography.xs,
    color: '#6E6E80',
    marginBottom: Spacing.md,
    lineHeight: 16,
  },
  timeInputLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#3E3C3D',
    marginBottom: 4,
    marginTop: Spacing.sm,
  },
  timeInput: {
    borderWidth: 1,
    borderColor: '#D8D8DC',
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: Typography.sm,
    color: '#3E3C3D',
    backgroundColor: '#FFFFFF',
  },
});

export default TripDetailsScreen;

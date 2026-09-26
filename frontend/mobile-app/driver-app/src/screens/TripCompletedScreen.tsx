import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, StatusBar, Image, TouchableOpacity, ScrollView, Share, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check, Share2, Clock, Calendar, User, FileText, MapPin, Home, PackageCheck, CheckCircle2, ArrowLeft, ChevronRight } from 'lucide-react-native';
import { GeotagPhotoModal } from '../components/GeotagPhotoModal';
import { API_URL } from '@mercon/mobile-shared/lib/api';
import { useCurrentTrip } from '../hooks/use-current-trip';
import { useCargoPodPhotos } from '@mercon/mobile-shared/lib/documents';
import { tripService, isRoundTrip, getTripChargeValue, stopLabel, type MobileTrip } from '@mercon/mobile-shared/lib/trips';
import { useScheduledTrips } from '../hooks/use-scheduled-trips';
import { safeSecureStore as SecureStore } from '@mercon/mobile-shared/lib/secure-store';
import { useLanguage } from '@mercon/mobile-shared/lib/language-context';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const logo = require('@mercon/mobile-shared/assets/images/mercon-logo.png');

const FILE_BASE = API_URL ? API_URL.replace(/\/api\/?$/, '') : '';

const getPhotoUri = (item: any): string | null => {
  if (!item) return null;
  if (typeof item === 'string') {
    return item.startsWith('http') || item.startsWith('file:') || item.startsWith('data:')
      ? item
      : `${FILE_BASE}${item.startsWith('/') ? '' : '/'}${item}`;
  }
  if (typeof item === 'object') {
    const url = item.file_url || item.uri;
    if (!url) return null;
    return url.startsWith('http') || url.startsWith('file:') || url.startsWith('data:')
      ? url
      : `${FILE_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
  }
  return null;
};

const TripCompletedScreen = () => {
  const router = useRouter();
  const { t, language } = useLanguage();
  const { trip, refetch } = useCurrentTrip();
  const { trips: scheduledTrips } = useScheduledTrips();
  const { tripId: paramTripId } = useLocalSearchParams<{ tripId?: string }>();
  const { photos: docs } = useCargoPodPhotos();
  const documents = docs || [];
  
  const [selectedPhoto, setSelectedPhoto] = useState<any>(null);
  const [showDetails, setShowDetails] = useState<boolean>(false);
  const [completedTrip, setCompletedTrip] = useState<MobileTrip | null>(null);
  const [localPickupPhotos, setLocalPickupPhotos] = useState<any[]>([]);
  const [localDeliveryPhotos, setLocalDeliveryPhotos] = useState<any[]>([]);
  const [localReturnPickupPhotos, setLocalReturnPickupPhotos] = useState<any[]>([]);
  const [localReturnDeliveryPhotos, setLocalReturnDeliveryPhotos] = useState<any[]>([]);

  useEffect(() => {
    refetch();
    const loadData = async () => {
      try {
        // The trip that was just finished: the id passed in (or saved by the
        // delivery screen), else the latest history entry. Never the "current"
        // trip — once a trip completes, that is the driver's NEXT trip, and this
        // screen used to show it as "Delivered".
        const lastTripId = await SecureStore.getItemAsync('last_completed_trip_id');
        const wantedId = paramTripId || lastTripId;
        let finished: MobileTrip | null = wantedId ? await tripService.getTripDetails(wantedId).catch(() => null) : null;
        if (!finished) {
          const history = await tripService.getHistory(1).catch(() => []);
          finished = history[0] ?? null;
        }
        if (finished) setCompletedTrip(finished);

        const targetId = finished?.id;
        const targetRefId = finished?.ref_id;

        const pickupKeys = [
          targetId ? `pickup_completed_photos_${targetId}` : null,
          targetId ? `pickup_draft_photos_${targetId}` : null,
          targetRefId ? `pickup_completed_photos_${targetRefId}` : null,
          lastTripId ? `pickup_completed_photos_${lastTripId}` : null,
          'last_pickup_photos',
        ].filter(Boolean) as string[];

        for (const key of pickupKeys) {
          const saved = await SecureStore.getItemAsync(key);
          if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setLocalPickupPhotos(parsed);
              break;
            }
          }
        }

        const deliveryKeys = [
          targetId ? `delivery_completed_photos_${targetId}` : null,
          targetId ? `delivery_draft_photos_${targetId}` : null,
          targetRefId ? `delivery_completed_photos_${targetRefId}` : null,
          lastTripId ? `delivery_completed_photos_${lastTripId}` : null,
          'last_delivery_photos',
        ].filter(Boolean) as string[];

        for (const key of deliveryKeys) {
          const saved = await SecureStore.getItemAsync(key);
          if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setLocalDeliveryPhotos(parsed);
              break;
            }
          }
        }

        const returnPickupKeys = [
          targetId ? `return_pickup_completed_photos_${targetId}` : null,
          targetRefId ? `return_pickup_completed_photos_${targetRefId}` : null,
          lastTripId ? `return_pickup_completed_photos_${lastTripId}` : null,
          'last_return_pickup_photos',
        ].filter(Boolean) as string[];

        for (const key of returnPickupKeys) {
          const saved = await SecureStore.getItemAsync(key);
          if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setLocalReturnPickupPhotos(parsed);
              break;
            }
          }
        }

        const returnDeliveryKeys = [
          targetId ? `return_delivery_completed_photos_${targetId}` : null,
          targetRefId ? `return_delivery_completed_photos_${targetRefId}` : null,
          lastTripId ? `return_delivery_completed_photos_${lastTripId}` : null,
          'last_return_delivery_photos',
        ].filter(Boolean) as string[];

        for (const key of returnDeliveryKeys) {
          const saved = await SecureStore.getItemAsync(key);
          if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setLocalReturnDeliveryPhotos(parsed);
              break;
            }
          }
        }
      } catch (e) {
        console.error('Error loading local photos:', e);
      }
    };
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramTripId]);

  const activeTrip = completedTrip;

  const tripDocs = activeTrip?.id
    ? documents.filter((d) => d.entity_id === activeTrip.id || d.trip_ref_id === activeTrip.ref_id)
    : [];

  const apiCargo = tripDocs.filter((d) => d.doc_type === 'Waybill' || d.doc_type === 'CARGO_PHOTO' || d.doc_type === 'CustomsClearance');
  const apiPod = tripDocs.filter((d) => d.doc_type === 'POD');
  const apiReturnCargo = tripDocs.filter((d) => d.doc_type === 'RETURN_CARGO_PHOTO' || d.doc_type === 'RETURN_POL');
  const apiReturnPod = tripDocs.filter((d) => d.doc_type === 'RETURN_POD');

  const polList = apiCargo.length > 0 ? apiCargo : localPickupPhotos;
  const podList = apiPod.length > 0 ? apiPod : localDeliveryPhotos;
  const returnPolList = apiReturnCargo.length > 0 ? apiReturnCargo : localReturnPickupPhotos;
  const returnPodList = apiReturnPod.length > 0 ? apiReturnPod : localReturnDeliveryPhotos;

  const isRound = isRoundTrip(activeTrip);

  const rawRef = activeTrip?.ref_id || (activeTrip?.id ? activeTrip.id.slice(0, 8) : '');
  const tripIdDisplay = rawRef ? (rawRef.startsWith('TRP-') ? rawRef : `TRP-${rawRef}`) : '—';
  const tripRefId = `#${tripIdDisplay}`;
  // Real data only: a missing value hides its row instead of showing a placeholder.
  const customerName = activeTrip?.customer?.name ? activeTrip.customer.name.toUpperCase() : '';

  const sortedStops = [...(activeTrip?.stops ?? [])].sort((x, y) => x.stop_sequence - y.stop_sequence);
  const firstStop = sortedStops[0];
  const lastStop = sortedStops[sortedStops.length - 1];
  const originName = stopLabel(firstStop) || activeTrip?.origin || null;
  const destinationName = stopLabel(lastStop) || activeTrip?.destination || null;
  const routeText = originName && destinationName ? `${originName} → ${destinationName}` : destinationName || originName;

  const fmtDateTime = (v?: string | null) =>
    v ? new Date(v).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
  const startIso = (activeTrip as any)?.actual_pickup || activeTrip?.actual_start || null;
  const endIso = activeTrip?.actual_end || null;
  const formattedLoadingDate = fmtDateTime(startIso);
  const formattedDeliveryDate = fmtDateTime(endIso);
  const formattedReturnLoadingDate = fmtDateTime((activeTrip as any)?.actual_return_pickup);
  const formattedReturnDeliveryDate = fmtDateTime((activeTrip as any)?.actual_return_delivery || endIso);

  const durationText = (() => {
    if (!startIso || !endIso) return null;
    const mins = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
    if (!Number.isFinite(mins) || mins <= 0) return null;
    return mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} m` : `${mins} m`;
  })();
  const distanceKm = activeTrip?.planned_distance ?? (activeTrip as any)?.distance_km ?? null;

  const endDate = endIso ? new Date(endIso) : null;
  const endTime = endDate ? endDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }) : null;
  const endIsToday = endDate ? endDate.toDateString() === new Date().toDateString() : false;
  const dayText = endDate ? endDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  const completedPill = endTime
    ? (endIsToday
      ? (language === 'ur' ? `آج ${endTime} پر مکمل` : `Completed today at ${endTime}`)
      : (language === 'ur' ? `${dayText} کو مکمل` : `Completed ${dayText} at ${endTime}`))
    : (language === 'ur' ? 'مکمل' : 'Completed');

  const photoCount = polList.length + podList.length + (isRound ? returnPolList.length + returnPodList.length : 0);
  const charge = activeTrip ? getTripChargeValue(activeTrip) : 0;

  // After a delivery, the "current" trip is the next one lined up (if any).
  const nextTrip = [trip, ...scheduledTrips].find(
    (x) => x && x.id !== activeTrip?.id && x.status !== 'Completed' && x.status !== 'Invoiced' && x.status !== 'Cancelled',
  ) ?? null;
  const nextTripText = (() => {
    if (!nextTrip) return null;
    const st = [...(nextTrip.stops ?? [])].sort((x, y) => x.stop_sequence - y.stop_sequence);
    const from = stopLabel(st[0]) || nextTrip.origin;
    const to = stopLabel(st[st.length - 1]) || nextTrip.destination;
    const when = nextTrip.planned_start
      ? new Date(nextTrip.planned_start).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
      : null;
    return [from && to ? `${from} → ${to}` : from || to, when].filter(Boolean).join(' · ');
  })();

  const handleShare = async () => {
    try {
      const lines = [
        `Trip ${tripIdDisplay} delivered${customerName ? ` to ${activeTrip?.customer?.name}` : ''}.`,
        routeText ? `Route: ${routeText}` : null,
        endIso ? `Completed: ${formattedDeliveryDate}` : null,
      ].filter(Boolean);
      await Share.share({ title: `MERCON Trip ${tripIdDisplay}`, message: lines.join('\n') });
    } catch {
      // silent
    }
  };

  const handleBackHome = () => {
    router.replace('/');
  };

  // ---------------------------------------------------------------------------
  // VIEW 1: LANDING — same look as before, details grouped for quick reading
  // ---------------------------------------------------------------------------
  if (!showDetails) {
    return (
      <SafeAreaView style={styles.cleanContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <ScrollView contentContainerStyle={styles.cleanScroll} showsVerticalScrollIndicator={false}>
          {/* Result */}
          <View style={styles.cleanCheckWrapper}>
            <View style={styles.checkRing}>
              <View style={styles.cleanCheckCircle}>
                <Check size={40} color="#FFFFFF" strokeWidth={3.8} />
              </View>
            </View>
          </View>
          <View style={styles.cleanHeaderGroup}>
            <Text style={styles.cleanSubtitle}>{t('title_delivered_to', 'Delivered to')}</Text>
            {customerName ? <Text style={styles.cleanCustomerName}>{customerName}</Text> : null}
            <View style={styles.completedPill}>
              <View style={styles.completedPillDot} />
              <Text style={styles.completedPillText}>{completedPill}</Text>
            </View>
          </View>

          {/* Trip details, grouped: label over value */}
          <View style={styles.detailCard}>
            {routeText ? (
              <View style={styles.detailRow}>
                <View style={styles.detailIcon}><MapPin size={17} color="#16A34A" strokeWidth={2.2} /></View>
                <View style={styles.detailCol}>
                  <Text style={styles.detailLabel}>{language === 'ur' ? 'راستہ' : 'Route'}</Text>
                  <Text style={styles.detailValue} numberOfLines={1}>{routeText}</Text>
                </View>
              </View>
            ) : null}
            <View style={styles.detailRow}>
              <View style={styles.detailIcon}><Calendar size={17} color="#16A34A" strokeWidth={2.2} /></View>
              <View style={styles.detailCol}>
                <Text style={styles.detailLabel}>{language === 'ur' ? 'تاریخ' : 'Date'}</Text>
                <Text style={styles.detailValue}>{dayText ?? '—'}</Text>
              </View>
              {durationText ? (
                <View style={styles.detailColRight}>
                  <Text style={styles.detailLabel}>{t('label_duration', 'Duration')}</Text>
                  <Text style={styles.detailValue}>{durationText}</Text>
                </View>
              ) : null}
            </View>
            <View style={[styles.detailRow, styles.detailRowLast]}>
              <View style={styles.detailIcon}><FileText size={17} color="#16A34A" strokeWidth={2.2} /></View>
              <View style={styles.detailCol}>
                <Text style={styles.detailLabel}>{t('label_trip_id', 'Trip ID')}</Text>
                <Text style={styles.detailValue}>{tripIdDisplay}</Text>
              </View>
              <View style={styles.detailColRight}>
                <Text style={styles.detailLabel}>{language === 'ur' ? 'تصاویر' : 'Photos'}</Text>
                <Text style={styles.detailValue}>{language === 'ur' ? `${photoCount} محفوظ` : `${photoCount} saved`}</Text>
              </View>
            </View>
          </View>

          {/* Earnings */}
          {charge > 0 ? (
            <View style={styles.chargeBox}>
              <View>
                <Text style={styles.chargeLabel}>{t('label_driver_charge', 'Driver charge')}</Text>
                <Text style={styles.chargeSub}>{language === 'ur' ? 'آپ کی آمدنی میں شامل' : 'Added to your earnings'}</Text>
              </View>
              <Text style={styles.chargeValue}>
                SAR {charge.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>
          ) : null}

          {/* What's next */}
          {nextTrip && nextTripText ? (
            <TouchableOpacity
              style={styles.nextTripRow}
              activeOpacity={0.7}
              onPress={() => router.replace({ pathname: '/trip/details', params: { tripId: nextTrip.id } } as any)}
            >
              <View style={styles.detailCol}>
                <Text style={styles.detailLabel}>{language === 'ur' ? 'اگلا ٹرپ' : 'Next trip'}</Text>
                <Text style={styles.nextTripText} numberOfLines={1}>{nextTripText}</Text>
              </View>
              <ChevronRight size={18} color="#64748B" strokeWidth={2.2} />
            </TouchableOpacity>
          ) : null}

          <View style={styles.cleanBrandingGroup}>
            <Image source={logo} style={styles.cleanLogoImage} resizeMode="contain" />
          </View>
        </ScrollView>

        {/* Actions: two secondary side by side, Done full width */}
        <View style={styles.cleanActionBar}>
          <View style={styles.secondaryActionRow}>
            <TouchableOpacity style={styles.cleanBtnShare} activeOpacity={0.8} onPress={handleShare}>
              <Share2 size={15} color="#16A34A" strokeWidth={2.2} />
              <Text style={styles.cleanBtnShareText} numberOfLines={1}>{t('action_share_screenshot', 'Share screenshot')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cleanBtnDetails} activeOpacity={0.8} onPress={() => setShowDetails(true)}>
              <FileText size={16} color="#2563EB" strokeWidth={2.2} />
              <Text style={styles.cleanBtnDetailsText} numberOfLines={1}>{t('action_more_details', 'More details')}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.cleanBtnDone} activeOpacity={0.85} onPress={handleBackHome}>
            <Text style={styles.cleanBtnDoneText}>{t('action_done', 'Done')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ---------------------------------------------------------------------------
  // VIEW 2: FULL DETAILED PAGE (WITH POL / POD PHOTOS AND DETAILED METRICS)
  // ---------------------------------------------------------------------------
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F0FDF4' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#F0FDF4" />
      
      {/* Top Header Bar for Detailed View */}
      <View style={styles.detailedHeader}>
        <TouchableOpacity style={styles.detailedBackBtn} activeOpacity={0.8} onPress={() => setShowDetails(false)}>
          <ArrowLeft size={20} color="#0F172A" strokeWidth={2.2} />
        </TouchableOpacity>
        <Text style={styles.detailedHeaderTitle}>{t('title_trip_summary', 'Trip Details Summary')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* 1. Trip Summary Card */}
        <View style={styles.summaryCard}>
          {/* Card Header Row */}
          <View style={styles.summaryCardHeader}>
            <Text style={styles.summaryTitle}>{t('title_trip_summary', 'Trip Summary')}</Text>
            <Text style={styles.tripIdBadge}>{tripRefId}</Text>
          </View>

          {/* 2-Column Grid Container */}
          <View style={styles.gridContainer}>
            {/* Grid Row 1: Customer (Left) | Duration (Right) */}
            <View style={styles.gridRow}>
              <View style={[styles.gridCell, styles.gridCellLeft]}>
                <View style={styles.cellIconRing}>
                  <User size={11} color="#10B981" strokeWidth={2.2} />
                </View>
                <View style={styles.cellTextWrapper}>
                  <Text style={styles.cellLabel}>{t('label_customer', 'Customer')}</Text>
                  <Text style={styles.cellValueBold} numberOfLines={2}>
                    {customerName || '—'}
                  </Text>
                </View>
              </View>

              <View style={styles.gridCell}>
                <View style={styles.cellIconRing}>
                  <Clock size={11} color="#10B981" strokeWidth={2.2} />
                </View>
                <View style={styles.cellTextWrapper}>
                  <Text style={styles.cellLabel}>{t('label_duration', 'Duration')}</Text>
                  <Text style={[styles.cellValueBold, { writingDirection: 'ltr' }]}>{durationText ?? '—'}</Text>
                </View>
              </View>
            </View>

            {/* Grid Row 2: Distance (Left) | Delivery Completed (Right) */}
            <View style={styles.gridRow}>
              <View style={[styles.gridCell, styles.gridCellLeft]}>
                <View style={styles.cellIconRing}>
                  <MapPin size={11} color="#10B981" strokeWidth={2.2} />
                </View>
                <View style={styles.cellTextWrapper}>
                  <Text style={styles.cellLabel}>{t('label_distance', 'Distance')}</Text>
                  <Text style={[styles.cellValueBold, { writingDirection: 'ltr' }]}>
                    {distanceKm != null ? `${distanceKm} ${t('unit_km', 'km')}` : '—'}
                  </Text>
                </View>
              </View>

              <View style={styles.gridCell}>
                <View style={styles.cellIconRing}>
                  <CheckCircle2 size={11} color="#10B981" strokeWidth={2.2} />
                </View>
                <View style={styles.cellTextWrapper}>
                  <Text style={styles.cellLabel}>{t('label_delivery_completed', 'Delivery Completed')}</Text>
                  <Text style={styles.cellValueBold}>{formattedDeliveryDate}</Text>
                </View>
              </View>
            </View>

            {/* Grid Row 3: Loading Completed (Left) | Return Loading Completed (Right) */}
            <View style={[styles.gridRow, !isRound && { borderBottomWidth: 0 }]}>
              <View style={[styles.gridCell, styles.gridCellLeft]}>
                <View style={styles.cellIconRing}>
                  <PackageCheck size={11} color="#10B981" strokeWidth={2.2} />
                </View>
                <View style={styles.cellTextWrapper}>
                  <Text style={styles.cellLabel}>{t('label_loading_completed', 'Loading Completed')}</Text>
                  <Text style={styles.cellValueBold}>{formattedLoadingDate}</Text>
                </View>
              </View>

              {isRound ? (
                <View style={styles.gridCell}>
                  <View style={styles.cellIconRing}>
                    <PackageCheck size={11} color="#FA634E" strokeWidth={2.2} />
                  </View>
                  <View style={styles.cellTextWrapper}>
                    <Text style={styles.cellLabel}>{t('label_return_loading_done', 'Return Loading Completed')}</Text>
                    <Text style={styles.cellValueBold}>{formattedReturnLoadingDate}</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.gridCell} />
              )}
            </View>

            {/* Grid Row 4 (Round Trip): Return Delivery Completed */}
            {isRound && (
              <View style={[styles.gridRow, { borderBottomWidth: 0 }]}>
                <View style={[styles.gridCell, styles.gridCellLeft]}>
                  <View style={styles.cellIconRing}>
                    <CheckCircle2 size={11} color="#FA634E" strokeWidth={2.2} />
                  </View>
                  <View style={styles.cellTextWrapper}>
                    <Text style={styles.cellLabel}>{t('label_return_delivery_done', 'Return Delivery Completed')}</Text>
                    <Text style={styles.cellValueBold}>{formattedReturnDeliveryDate}</Text>
                  </View>
                </View>
                <View style={styles.gridCell} />
              </View>
            )}
          </View>
        </View>

        {/* 2. Proof Media Card */}
        <View style={styles.mediaCard}>
          {/* Proof of Loading (POL) */}
          <View style={styles.mediaSectionHeader}>
            <View style={styles.mediaSectionTitleGroup}>
              <PackageCheck size={18} color="#10B981" strokeWidth={2.2} />
              <Text style={styles.mediaSectionTitle}>{t('title_proof_loading', 'Proof of Loading (POL)')}</Text>
            </View>
            {polList.length > 0 && (
              <TouchableOpacity style={styles.viewAllBtn} activeOpacity={0.7} onPress={() => router.push('/cargo-pod-photos')}>
                <Text style={styles.viewAllText}>{t('action_view_all', 'View all')} {language === 'ur' ? '‹' : '›'}</Text>
              </TouchableOpacity>
            )}
          </View>

          {polList.length === 0 ? (
            <View style={styles.emptyPhotoBox}>
              <PackageCheck size={18} color="#94A3B8" />
              <Text style={styles.emptyPhotoText}>{t('msg_no_loading_photo', 'No loading photo attached')}</Text>
            </View>
          ) : (
            <View style={styles.mediaGrid}>
              {polList.slice(0, 3).map((item, idx) => {
                const photoUri = getPhotoUri(item);
                if (!photoUri) return null;
                return (
                  <TouchableOpacity
                    key={idx}
                    style={styles.mediaThumbFrame}
                    activeOpacity={0.8}
                    onPress={() => setSelectedPhoto({ uri: photoUri, title: `${t('title_proof_loading', 'Proof of Loading (POL)')} #${idx + 1}` })}
                  >
                    <Image
                      source={{ uri: photoUri }}
                      style={styles.mediaThumbImg}
                      resizeMode="cover"
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <View style={styles.cardDivider} />

          {/* Proof of Delivery (POD) */}
          <View style={styles.mediaSectionHeader}>
            <View style={styles.mediaSectionTitleGroup}>
              <CheckCircle2 size={18} color="#10B981" strokeWidth={2.2} />
              <Text style={styles.mediaSectionTitle}>{t('title_proof_delivery', 'Proof of Delivery (POD)')}</Text>
            </View>
            {podList.length > 0 && (
              <TouchableOpacity style={styles.viewAllBtn} activeOpacity={0.7} onPress={() => router.push('/cargo-pod-photos')}>
                <Text style={styles.viewAllText}>{t('action_view_all', 'View all')} {language === 'ur' ? '‹' : '›'}</Text>
              </TouchableOpacity>
            )}
          </View>

          {podList.length === 0 ? (
            <View style={styles.emptyPhotoBox}>
              <CheckCircle2 size={18} color="#94A3B8" />
              <Text style={styles.emptyPhotoText}>{t('msg_no_delivery_photo', 'No delivery photo attached')}</Text>
            </View>
          ) : (
            <View style={styles.mediaGrid}>
              {podList.slice(0, 3).map((item, idx) => {
                const photoUri = getPhotoUri(item);
                if (!photoUri) return null;
                return (
                  <TouchableOpacity
                    key={idx}
                    style={styles.mediaThumbFrame}
                    activeOpacity={0.8}
                    onPress={() => setSelectedPhoto({ uri: photoUri, title: `${t('title_proof_delivery', 'Proof of Delivery (POD)')} #${idx + 1}` })}
                  >
                    <Image
                      source={{ uri: photoUri }}
                      style={styles.mediaThumbImg}
                      resizeMode="cover"
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Return Proof of Loading (Return POL) */}
          {isRound && (
            <>
              <View style={styles.cardDivider} />
              <View style={styles.mediaSectionHeader}>
                <View style={styles.mediaSectionTitleGroup}>
                  <PackageCheck size={18} color="#FA634E" strokeWidth={2.2} />
                  <Text style={styles.mediaSectionTitle}>{language === 'ur' ? 'واپسی لوڈنگ کا ثبوت (Return POL)' : 'Return Proof of Loading (Return POL)'}</Text>
                </View>
                {returnPolList.length > 0 && (
                  <TouchableOpacity style={styles.viewAllBtn} activeOpacity={0.7} onPress={() => router.push('/cargo-pod-photos')}>
                    <Text style={styles.viewAllText}>{t('action_view_all', 'View all')} {language === 'ur' ? '‹' : '›'}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {returnPolList.length === 0 ? (
                <View style={styles.emptyPhotoBox}>
                  <PackageCheck size={18} color="#94A3B8" />
                  <Text style={styles.emptyPhotoText}>{language === 'ur' ? 'واپسی لوڈنگ کی کوئی تصویر منسلک نہیں ہے' : 'No return loading photo attached'}</Text>
                </View>
              ) : (
                <View style={styles.mediaGrid}>
                  {returnPolList.slice(0, 3).map((item, idx) => {
                    const photoUri = getPhotoUri(item);
                    if (!photoUri) return null;
                    return (
                      <TouchableOpacity
                        key={idx}
                        style={styles.mediaThumbFrame}
                        activeOpacity={0.8}
                        onPress={() => setSelectedPhoto({ uri: photoUri, title: `${language === 'ur' ? 'واپسی لوڈنگ کا ثبوت' : 'Return Proof of Loading'} #${idx + 1}` })}
                      >
                        <Image
                          source={{ uri: photoUri }}
                          style={styles.mediaThumbImg}
                          resizeMode="cover"
                        />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </>
          )}

          {/* Return Proof of Delivery (Return POD) */}
          {isRound && (
            <>
              <View style={styles.cardDivider} />
              <View style={styles.mediaSectionHeader}>
                <View style={styles.mediaSectionTitleGroup}>
                  <CheckCircle2 size={18} color="#FA634E" strokeWidth={2.2} />
                  <Text style={styles.mediaSectionTitle}>{language === 'ur' ? 'واپسی ڈلیوری کا ثبوت (Return POD)' : 'Return Proof of Delivery (Return POD)'}</Text>
                </View>
                {returnPodList.length > 0 && (
                  <TouchableOpacity style={styles.viewAllBtn} activeOpacity={0.7} onPress={() => router.push('/cargo-pod-photos')}>
                    <Text style={styles.viewAllText}>{t('action_view_all', 'View all')} {language === 'ur' ? '‹' : '›'}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {returnPodList.length === 0 ? (
                <View style={styles.emptyPhotoBox}>
                  <CheckCircle2 size={18} color="#94A3B8" />
                  <Text style={styles.emptyPhotoText}>{language === 'ur' ? 'واپسی ڈلیوری کی کوئی تصویر منسلک نہیں ہے' : 'No return delivery photo attached'}</Text>
                </View>
              ) : (
                <View style={styles.mediaGrid}>
                  {returnPodList.slice(0, 3).map((item, idx) => {
                    const photoUri = getPhotoUri(item);
                    if (!photoUri) return null;
                    return (
                      <TouchableOpacity
                        key={idx}
                        style={styles.mediaThumbFrame}
                        activeOpacity={0.8}
                        onPress={() => setSelectedPhoto({ uri: photoUri, title: `${language === 'ur' ? 'واپسی ڈلیوری کا ثبوت' : 'Return Proof of Delivery'} #${idx + 1}` })}
                      >
                        <Image
                          source={{ uri: photoUri }}
                          style={styles.mediaThumbImg}
                          resizeMode="cover"
                        />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </>
          )}
        </View>

        {/* 3. Bottom Action Buttons in Detailed View */}
        <View style={styles.actionButtonsRow}>
          <TouchableOpacity style={styles.shareBtn} activeOpacity={0.8} onPress={() => setShowDetails(false)}>
            <ArrowLeft size={16} color="#10B981" strokeWidth={2.2} />
            <Text style={styles.shareBtnText}>{t('action_back', 'BACK TO SUMMARY')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.homeBtn} activeOpacity={0.85} onPress={handleBackHome}>
            <Home size={16} color="#FFFFFF" strokeWidth={2.2} />
            <Text style={styles.homeBtnText}>{language === 'ur' ? 'ہوم اسکرین پر جائیں' : 'BACK TO HOME'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <GeotagPhotoModal
        visible={!!selectedPhoto}
        photo={selectedPhoto}
        onClose={() => setSelectedPhoto(null)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  // ---------------------------------------------------------------------------
  // CLEAN LANDING STYLES (MATCHING USER SCREENSHOT EXACTLY)
  // ---------------------------------------------------------------------------
  cleanContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  cleanScroll: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 44,
    paddingBottom: 16,
    gap: 20,
  },
  cleanCheckWrapper: {
    alignItems: 'center',
  },
  checkRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cleanCheckCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  cleanHeaderGroup: {
    width: '100%',
    alignItems: 'center',
    gap: 6,
  },
  cleanSubtitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#64748B',
    textAlign: 'center',
  },
  cleanCustomerName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    lineHeight: 30,
    paddingHorizontal: 16,
  },
  completedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0FDF4',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 2,
  },
  completedPillDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#16A34A',
  },
  completedPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#166534',
  },
  detailCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#EEF2F6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F6',
  },
  detailRowLast: {
    borderBottomWidth: 0,
  },
  detailIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailCol: {
    flex: 1,
    gap: 1,
  },
  detailColRight: {
    alignItems: 'flex-end',
    gap: 1,
  },
  detailLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  detailValue: {
    fontSize: 15.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  chargeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  chargeLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#166534',
  },
  chargeSub: {
    fontSize: 12,
    color: '#15803D',
    marginTop: 2,
  },
  chargeValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#14532D',
  },
  nextTripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
  },
  nextTripText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  cleanBrandingGroup: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 'auto',
    marginBottom: 20,
  },
  cleanLogoImage: {
    width: 75,
    height: 26,
    alignSelf: 'center',
  },
  cleanActionBar: {
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  secondaryActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  cleanBtnShare: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#16A34A',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 2,
  },
  cleanBtnShareText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#16A34A',
  },
  cleanBtnDetails: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#2563EB',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 2,
  },
  cleanBtnDetailsText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#2563EB',
  },
  cleanBtnDone: {
    height: 54,
    borderRadius: 14,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  cleanBtnDoneText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // ---------------------------------------------------------------------------
  // DETAILED VIEW STYLES
  // ---------------------------------------------------------------------------
  detailedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  detailedBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailedHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  scroll: {
    flexGrow: 1,
    paddingTop: 16,
    paddingBottom: 16,
  },

  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginHorizontal: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 3,
  },
  summaryCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
  },
  tripIdBadge: {
    fontSize: 12,
    fontWeight: '800',
    color: '#10B981',
  },
  gridContainer: {
    borderWidth: 1,
    borderColor: '#F1F5F9',
    borderRadius: 10,
    overflow: 'hidden',
  },
  gridRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  gridCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 6,
    gap: 6,
  },
  gridCellLeft: {
    borderRightWidth: 1,
    borderRightColor: '#F1F5F9',
  },
  cellIconRing: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  cellTextWrapper: {
    flex: 1,
  },
  cellLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 1,
  },
  cellValueBold: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 14,
  },

  mediaCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginHorizontal: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 3,
  },
  mediaSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  mediaSectionTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mediaSectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  viewAllBtn: {
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#10B981',
  },
  mediaGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  mediaThumbFrame: {
    flex: 1,
    height: 72,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
  },
  mediaThumbImg: {
    width: '100%',
    height: '100%',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 14,
  },
  emptyPhotoBox: {
    height: 72,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  emptyPhotoText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748B',
  },

  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 14,
    marginTop: 4,
    marginBottom: 28,
  },
  shareBtn: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  shareBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#10B981',
    letterSpacing: 0.3,
  },
  homeBtn: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  homeBtnText: {
    fontSize: 11.5,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});

export default TripCompletedScreen;

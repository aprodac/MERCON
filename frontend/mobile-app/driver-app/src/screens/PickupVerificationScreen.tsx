import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  StatusBar, Image, Alert, Linking, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Svg, { Path, Rect, Circle, Line, G, Polygon, Ellipse } from 'react-native-svg';
import { Info, Camera, MapPin, Trash2, Package, ArrowRight, Clock, FileText, Check, Navigation, Send, RotateCcw } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { GoogleMapsGeotagPreview } from '../components/GoogleMapsGeotagPreview';
import { GeotagPhotoModal } from '../components/GeotagPhotoModal';
import { TripProgressStepper } from '../components/TripProgressStepper';
import { FadedBottomIllustration } from '../components/FadedBottomIllustration';
import { DelayReportModal } from '../components/DelayReportModal';
import { DelayButton } from '../components/DelayButton';
import { ReturnLoadingModal } from '../components/ReturnLoadingModal';
import { useCurrentTrip } from '../hooks/use-current-trip';
import { tripService, stopAddress, stopLabel, isRoundTrip, getEffectiveWorkflowState, getLegEndpoints, getEvidencePolicy } from '@mercon/mobile-shared/lib/trips';

import { takePhoto, pickFromGallery, type CapturedPhoto } from '@mercon/mobile-shared/lib/camera';
import { showToast } from '../components/AppToast';
import { isValidCoordinate } from '../utils/geo';
import { API_URL, getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { safeSecureStore as SecureStore } from '@mercon/mobile-shared/lib/secure-store';
import { triggerGPayHapticsAndSound } from '../services/sound';
import { getIntermediateStops, getOutboundIntermediateStops, getReturnIntermediateStops } from '../utils/routeParser';
import { useLanguage } from '@mercon/mobile-shared/lib/language-context';

const FILE_BASE = API_URL.replace(/\/api\/?$/, '');

// Blue Camera Icon with Plus Badge for Loading Photo Upload Slots
const BlueCameraPlusIcon = () => (
  <View style={{ width: 34, height: 30, justifyContent: 'center', alignItems: 'center' }}>
    <Svg width={30} height={28} viewBox="0 0 30 28">
      <Path
        d="M 4 8 C 2.9 8 2 8.9 2 10 L 2 23 C 2 24.1 2.9 25 4 25 L 21 25 C 22.1 25 23 24.1 23 23 L 23 10 C 23 8.9 22.1 8 21 8 Z"
        fill="none"
        stroke="#2563EB"
        strokeWidth={2.2}
      />
      <Path d="M 8 8 L 10 5 L 15 5 L 17 8 Z" fill="none" stroke="#2563EB" strokeWidth={2.2} />
      <Circle cx={12.5} cy={16.5} r={4.5} fill="none" stroke="#2563EB" strokeWidth={2.2} />

      {/* Plus Badge */}
      <Circle cx={22} cy={19} r={5.5} fill="#2563EB" />
      <Line x1={22} y1={16} x2={22} y2={22} stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" />
      <Line x1={19} y1={19} x2={25} y2={19} stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" />
    </Svg>
  </View>
);

// Side Map Tile Box Component (matching Screenshot 2 reference)
const SideMapTileBox = () => (
  <View style={styles.sideMapTileContainer}>
    <Svg width={92} height={92} viewBox="0 0 92 92">
      {/* Light Greenish Map Land Background */}
      <Rect width="92" height="92" fill="#E2F4E5" rx={18} />

      {/* Grid Lines & White Road Patterns */}
      <Path d="M 0 32 L 92 32" stroke="#FFFFFF" strokeWidth={6} />
      <Path d="M 0 64 L 92 64" stroke="#FFFFFF" strokeWidth={5} />
      <Path d="M 32 0 L 32 92" stroke="#FFFFFF" strokeWidth={6} />
      <Path d="M 68 0 L 68 92" stroke="#FFFFFF" strokeWidth={5} />
      <Path d="M 0 12 L 92 78" stroke="#FFFFFF" strokeWidth={4} />

      {/* Park & Lawn Green Blocks */}
      <Rect x={6} y={6} width={20} height={20} fill="#C6F6D5" rx={4} />
      <Rect x={38} y={6} width={24} height={20} fill="#BBF7D0" rx={4} />
      <Rect x={74} y={6} width={12} height={20} fill="#C6F6D5" rx={3} />
      <Rect x={6} y={38} width={20} height={20} fill="#BBF7D0" rx={4} />
      <Rect x={38} y={38} width={24} height={20} fill="#BBF7D0" rx={4} />
      <Rect x={74} y={38} width={12} height={20} fill="#C6F6D5" rx={3} />

      {/* Soft Pulse Ring Overlay around Location Pin */}
      <Circle cx={46} cy={44} r={16} fill="rgba(249, 115, 22, 0.12)" />
      <Circle cx={46} cy={44} r={10} fill="rgba(249, 115, 22, 0.20)" />

      {/* Red/Orange Location Pin Marker */}
      <G transform="translate(37, 27)">
        <Path d="M9 0C4.03 0 0 4.03 0 9C0 15.5 9 22 9 22C9 22 18 15.5 18 9C18 4.03 13.97 0 9 0Z" fill="#F95738" />
        <Circle cx={9} cy={9} r={3.5} fill="#FFFFFF" />
      </G>
    </Svg>

    {/* Bottom Left Navigation Arrow Circle Badge Overlay */}
    <View style={styles.mapTileArrowBadge}>
      <Svg width={12} height={12} viewBox="0 0 12 12" fill="none" style={{ transform: [{ rotate: '65deg' }] }}>
        <Path d="M6 1L10.5 10.5L6 8.4L1.5 10.5L6 1Z" fill="#0F172A" />
      </Svg>
    </View>
  </View>
);

const PickupVerificationScreen = () => {
  const router = useRouter();
  const { t, language } = useLanguage();
  const { trip, loading, refetch, setTrip } = useCurrentTrip();
  const ws = getEffectiveWorkflowState(trip);
  const isRound = isRoundTrip(trip);
  const isReturnLoading = isRound && (ws === 'RETURN_LOADING' || ws === 'FIRST_DELIVERY_COMPLETED');
  const isStarted = ws === 'LOADING' || ws === 'ARRIVED_AT_PICKUP' || isReturnLoading;

  const legIndex = isReturnLoading ? 1 : 0;
  const pickupStop = getLegEndpoints(trip, legIndex).loading;
  // 3 geotagged photos, or 1 customer-app screenshot on EXTERNAL_APP trips.
  const evidence = getEvidencePolicy(trip, 'loading');
  const need = evidence.count;
  const primarySource: 'camera' | 'gallery' = evidence.screenshot ? 'gallery' : 'camera';
  const otherSource: 'camera' | 'gallery' = evidence.screenshot ? 'camera' : 'gallery';
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  // URIs already uploaded in this session — a retry after a failed upload
  // must not send them again.
  const uploadedUrisRef = useRef<Set<string>>(new Set());
  // Uploads started right after each photo is taken, so "Loading complete"
  // does not have to upload all three at the end.
  const pendingUploadsRef = useRef<Map<string, Promise<boolean>>>(new Map());
  const photosRef = useRef<CapturedPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<CapturedPhoto | null>(null);
  const [showDelayModal, setShowDelayModal] = useState(false);

  // Return Loading Announcement Modal state
  const { showReturnPrompt } = useLocalSearchParams<{ showReturnPrompt?: string }>();
  const [showReturnModal, setShowReturnModal] = useState(showReturnPrompt === '1');

  useEffect(() => {
    if (showReturnPrompt === '1') {
      setShowReturnModal(true);
    }
  }, [showReturnPrompt]);

  const handleConfirmReturnLoading = () => {
    setShowReturnModal(false);
    triggerGPayHapticsAndSound();
  };

  // If this pickup stop is already completed and departed, navigate forward to the next stage
  useEffect(() => {
    if (loading || !trip || !pickupStop) return;
    // Defense in depth: if the trip is already fully completed, never show a
    // pickup screen for it — bounce straight to /trip/completed. Without
    // this, a stale nav stack entry or a leg-classification edge case could
    // land the driver back here post-completion and resolve `pickupStop` to
    // an already-departed stop from a leg that's no longer relevant,
    // producing the exact "back to a completed pickup" loop this guards.
    if (ws === 'COMPLETED') {
      router.replace({ pathname: '/trip/completed', params: { tripId: trip.id } } as any);
      return;
    }
    if (pickupStop.actual_departure) {
      const outStops = getOutboundIntermediateStops(trip);
      const retStops = getReturnIntermediateStops(trip);
      if (isReturnLoading) {
        if (retStops.length > 0) {
          router.replace({ pathname: '/trip/stop', params: { legIndex: '1', stopIndex: '0' } } as any);
        } else {
          router.replace('/trip/navigate');
        }
      } else {
        if (outStops.length > 0) {
          router.replace({ pathname: '/trip/stop', params: { legIndex: '0', stopIndex: '0' } } as any);
        } else {
          router.replace('/trip/navigate');
        }
      }
    }
  }, [loading, trip?.id, pickupStop?.id, pickupStop?.actual_departure, isReturnLoading]);

  const validPhotosCount = photos.filter((p) => !!p?.uri).length;
  const hasAllPhotos = validPhotosCount >= need;

  // Load draft photos or prefill with already uploaded server documents
  useEffect(() => {
    if (!trip?.id) return;
    const loadDraft = async () => {
      try {
        const stopSpecificKey = pickupStop?.id ? `pickup_draft_${trip.id}_${pickupStop.id}` : null;
        const legacyKey = isReturnLoading
          ? `return_pickup_draft_photos_${trip.id}`
          : `pickup_draft_photos_${trip.id}`;

        let saved = stopSpecificKey ? await SecureStore.getItemAsync(stopSpecificKey) : null;
        if (!saved) {
          saved = await SecureStore.getItemAsync(legacyKey);
        }

        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setPhotos(parsed);
            return;
          }
        }

        // Fallback: If photos were already uploaded to server for THIS specific stop/leg, display them
        if (trip.documents && trip.documents.length > 0 && pickupStop?.id) {
          const serverCargoDocs = trip.documents.filter((d: any) => {
            const op = d.ai_extracted_json?.operation;
            const leg = d.ai_extracted_json?.leg_index;
            const docStopId = d.ai_extracted_json?.stop_id;

            // 1. Must be a cargo/waybill document type, never arrival photos or POD
            const isCargoDoc = d.doc_type === 'Waybill' || d.doc_type === 'Cargo' || op === 'pickup' || op === 'return_loading';
            if (!isCargoDoc) return false;

            const isArrival = op?.includes('arrival') || d.doc_type === 'Arrival';
            if (isArrival) return false;

            // 2. Primary strict stop matching: If stop_id is stored, it MUST match this pickup stop
            if (docStopId) {
              return docStopId === pickupStop.id;
            }

            // 3. Fallback for legacy records without stop_id:
            // MUST strictly match the exact leg index and operation type!
            // CRITICAL: NEVER match leg === undefined or op === 'pickup' when isReturnLoading is true!
            if (isReturnLoading) {
              return leg === 1 && op === 'return_loading';
            } else {
              return (leg === 0 || (leg === undefined && op === 'pickup')) && op !== 'return_loading';
            }
          });

          if (serverCargoDocs.length > 0) {
            setPhotos(
              serverCargoDocs.slice(0, need).map((d: any) => {
                const fullUri = d.file_url?.startsWith('http') || d.file_url?.startsWith('file://')
                  ? d.file_url
                  : `${FILE_BASE}${d.file_url?.startsWith('/') ? '' : '/'}${d.file_url}`;
                return {
                  uri: fullUri,
                  mimeType: d.mime_type || 'image/jpeg',
                };
              })
            );
            return;
          }
        }

        setPhotos([]);
      } catch (e) {
        console.error('Error loading draft photos:', e);
        setPhotos([]);
      }
    };
    loadDraft();
  }, [trip?.id, isReturnLoading, pickupStop?.id, trip?.documents]);

  useEffect(() => { photosRef.current = photos; }, [photos]);

  const savePhotoDrafts = (valid: CapturedPhoto[]) => {
    if (!trip?.id) return;
    const stopKey = pickupStop?.id ? `pickup_draft_${trip.id}_${pickupStop.id}` : null;
    const draftKey = isReturnLoading ? `return_pickup_draft_photos_${trip.id}` : `pickup_draft_photos_${trip.id}`;
    const completedKey = isReturnLoading ? `return_pickup_completed_photos_${trip.id}` : `pickup_completed_photos_${trip.id}`;
    if (stopKey) SecureStore.setItemAsync(stopKey, JSON.stringify(valid));
    SecureStore.setItemAsync(draftKey, JSON.stringify(valid));
    SecureStore.setItemAsync(completedKey, JSON.stringify(valid));
  };

  /** Upload one photo (once); resolves true when it is on the server. */
  const uploadPhotoNow = (p: CapturedPhoto): Promise<boolean> => {
    if (!trip?.id || !p.uri) return Promise.resolve(false);
    if (uploadedUrisRef.current.has(p.uri)) return Promise.resolve(true);
    const pending = pendingUploadsRef.current.get(p.uri);
    if (pending) return pending;
    const job = tripService.uploadPhoto(
      trip.id,
      'cargo',
      {
        uri: p.uri,
        location: p.location ? { latitude: p.location.latitude, longitude: p.location.longitude, timestamp: p.location.timestamp } : null,
      },
      isReturnLoading ? 1 : 0,
      isReturnLoading ? 'return_loading' : 'pickup',
      pickupStop?.id,
    ).then(() => {
      uploadedUrisRef.current.add(p.uri);
      return true;
    }).catch((err) => {
      console.warn('Cargo photo upload warning:', err);
      return false;
    }).finally(() => {
      pendingUploadsRef.current.delete(p.uri);
    });
    pendingUploadsRef.current.set(p.uri, job);
    return job;
  };

  /**
   * Tap an empty box: the camera opens straight away, and keeps going to the
   * next box until all are taken (cancel stops). Long-press: gallery.
   * Screenshot trips swap the two: tap opens the gallery.
   */
  const addPhoto = async (slotIndex?: number, source: 'camera' | 'gallery' = primarySource) => {
    let slot = slotIndex;
    for (;;) {
      const photo = source === 'gallery' ? await pickFromGallery().catch(() => null) : await takePhoto();
      if (!photo) return;
      const next = [...photosRef.current];
      if (slot !== undefined && slot < need && !next[slot]) next[slot] = photo;
      else next.push(photo);
      const valid = next.filter(Boolean).slice(0, need);
      photosRef.current = valid;
      setPhotos(valid);
      savePhotoDrafts(valid);
      uploadPhotoNow(photo);
      if (source === 'gallery' || valid.length >= need) return;
      slot = undefined;
    }
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => {
      const next = prev.filter((_, idx) => idx !== index);
      if (trip?.id) {
        const stopKey = pickupStop?.id ? `pickup_draft_${trip.id}_${pickupStop.id}` : null;
        const draftKey = isReturnLoading ? `return_pickup_draft_photos_${trip.id}` : `pickup_draft_photos_${trip.id}`;
        const completedKey = isReturnLoading ? `return_pickup_completed_photos_${trip.id}` : `pickup_completed_photos_${trip.id}`;
        if (stopKey) SecureStore.setItemAsync(stopKey, JSON.stringify(next));
        SecureStore.setItemAsync(draftKey, JSON.stringify(next));
        SecureStore.setItemAsync(completedKey, JSON.stringify(next));
      }
      return next;
    });
  };

  const handleStartLoading = async () => {
    if (!trip || submitting) return;
    setSubmitting(true);
    try {
      const updated = await tripService.updateStatus(trip.id, 'Loading', 'LOADING');
      setTrip(updated);
      triggerGPayHapticsAndSound();
    } catch (err) {
      Alert.alert('Error', getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompletePickup = async () => {
    if (!trip || submitting) return;
    if (validPhotosCount < need) {
      Alert.alert(
        evidence.screenshot
          ? t('title_upload_screenshot', 'Upload Customer App Screenshot')
          : isReturnLoading
          ? t('title_upload_return_loading_photos', 'Upload Return Loading Photos')
          : t('title_upload_loading_photos', 'Upload Loading Photos'),
        `${isReturnLoading ? t('title_upload_return_loading_photos', 'Upload return loading photos') : t('title_upload_loading_photos', 'Upload loading photos')} (${validPhotosCount}/${need}).`
      );
      return;
    }
    const outboundStops = getOutboundIntermediateStops(trip);
    const returnStops = getReturnIntermediateStops(trip);
    const hasStopsForLeg = isReturnLoading ? returnStops.length > 0 : outboundStops.length > 0;

    setSubmitting(true);
    try {
      if (trip?.id) {
        const photoKey = isReturnLoading ? `return_pickup_completed_photos_${trip.id}` : `pickup_completed_photos_${trip.id}`;
        await SecureStore.setItemAsync(photoKey, JSON.stringify(photos));
        if (trip.ref_id) {
          const refKey = isReturnLoading ? `return_pickup_completed_photos_${trip.ref_id}` : `pickup_completed_photos_${trip.ref_id}`;
          await SecureStore.setItemAsync(refKey, JSON.stringify(photos));
        }
        if (isReturnLoading) {
          await SecureStore.setItemAsync('last_return_pickup_photos', JSON.stringify(photos));
        } else {
          await SecureStore.setItemAsync('last_pickup_photos', JSON.stringify(photos));
        }
      }
      // Most photos are already uploaded (started when taken); finish or retry the rest.
      const results = await Promise.all(photos.filter((p) => p.uri).map((p) => uploadPhotoNow(p)));
      const failedUploads = results.filter((ok) => !ok).length;
      // Don't advance the trip with evidence missing — the photos would be
      // lost for good once this screen is left.
      if (failedUploads > 0) {
        Alert.alert(
          t('err_upload_failed_title', 'Upload failed'),
          t('err_upload_failed_retry', `${failedUploads} photo(s) could not be uploaded. Check your connection and tap the button again.`),
        );
        return;
      }

      // ONLY delete draft photos AFTER all uploads succeeded
      if (trip?.id) {
        const stopKey = pickupStop?.id ? `pickup_draft_${trip.id}_${pickupStop.id}` : null;
        if (stopKey) await SecureStore.deleteItemAsync(stopKey).catch(() => {});
        const draftKey = isReturnLoading ? `return_pickup_draft_photos_${trip.id}` : `pickup_draft_photos_${trip.id}`;
        await SecureStore.deleteItemAsync(draftKey).catch(() => {});
      }
      const nextWorkflowState = isReturnLoading
        ? (hasStopsForLeg ? 'GOING_TO_RETURN_STOP' : 'IN_TRANSIT_RETURN')
        : (hasStopsForLeg ? 'GOING_TO_STOP' : 'IN_TRANSIT');

      try {
        const updated = await tripService.updateStatus(trip.id, 'InTransit', nextWorkflowState);
        setTrip(updated);
      } catch (statusErr) {
        // Don't pretend it worked: the trip would stay "loading" on the server
        // while the driver drives off. Stay here so they can tap again.
        console.warn('Status update failed:', statusErr);
        showToast(`${t('err_status_not_saved', 'Could not save loading complete. Check your connection and tap again.')} (${getApiErrorMessage(statusErr)})`, 'error');
        return;
      }
      triggerGPayHapticsAndSound();

      if (isReturnLoading) {
        if (returnStops.length > 0) {
          router.replace({ pathname: '/trip/stop', params: { legIndex: '1', stopIndex: '0' } } as any);
        } else {
          router.replace('/trip/navigate');
        }
      } else {
        if (outboundStops.length > 0) {
          router.replace({ pathname: '/trip/stop', params: { legIndex: '0', stopIndex: '0' } } as any);
        } else {
          router.replace('/trip/navigate');
        }
      }
    } catch (err) {
      console.error('Pickup completion error:', err);
      showToast(getApiErrorMessage(err), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const openNavigation = () => {
    // Real stop data only (a hard-coded city used to be the fallback, which
    // sent drivers to the wrong place when a stop had no address).
    const address = stopAddress(pickupStop) || stopLabel(pickupStop) || (pickupStop && isValidCoordinate(pickupStop.location_lat, pickupStop.location_lng) ? `${pickupStop.location_lat},${pickupStop.location_lng}` : null);
    if (!address) {
      showToast(t('err_no_stop_address', 'This stop has no address yet. Ask your operator.'), 'error');
      return;
    }
    const url = Platform.OS === 'ios'
      ? `maps://0,0?q=${encodeURIComponent(address)}`
      : `geo:0,0?q=${encodeURIComponent(address)}`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`);
    });
  };

  const pickupLocationName = stopLabel(pickupStop) || 'Pickup';
  const pickupLocationAddr = stopAddress(pickupStop) || '';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header Bar */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} activeOpacity={0.8} onPress={() => router.back()}>
            <Text style={styles.backIconText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isReturnLoading ? t('title_return_loading_header', 'Return Loading') : t('title_loading_header', 'Loading')}</Text>
          <DelayButton onPress={() => setShowDelayModal(true)} />
        </View>

        {/* 4-Step Progress Stepper: Pickup -> Loading -> Delivery -> Complete */}
        <TripProgressStepper
          trip={trip}
          target={{ kind: 'pickup', leg: isReturnLoading ? 1 : 0 }}
        />

        {/* Location Card (Horizontal Side-by-Side matching Screenshot 2) */}
        <View style={styles.locationCardHorizontal}>
          <SideMapTileBox />

          <View style={styles.locationRightColumn}>
            <View style={styles.locationTopRow}>
              <Text style={styles.locationSubLabel}>{isReturnLoading ? t('label_return_pickup_point', 'Return Loading Point') : t('label_pickup_point', 'Pickup Point')}</Text>
              <TouchableOpacity style={styles.navigateBlueBtn} activeOpacity={0.8} onPress={openNavigation}>
                <Send size={12} color="#2563EB" strokeWidth={2.2} />
                <Text style={styles.navigateBlueBtnText}>{t('action_navigate', 'Navigate')}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.locationTitle} numberOfLines={2}>
              {pickupLocationName}
            </Text>
            <Text style={styles.locationAddress} numberOfLines={3}>
              {pickupLocationAddr}
            </Text>
          </View>
        </View>

        {/* Upload Loading Photos Section */}
        <View style={styles.uploadSectionCard}>
          <View style={styles.uploadHeaderRow}>
            <Text style={styles.uploadTitle}>{evidence.screenshot ? t('title_upload_screenshot_caps', 'UPLOAD CUSTOMER APP SCREENSHOT') : isReturnLoading ? t('title_upload_return_loading_photos', 'UPLOAD RETURN LOADING PHOTOS') : t('title_upload_loading_photos', 'UPLOAD LOADING PHOTOS')}</Text>
            <View style={styles.cameraIconCircle}>
              <Camera size={16} color="#2563EB" strokeWidth={2.2} />
            </View>
          </View>

          {evidence.screenshot && (
            <Text style={styles.screenshotHint}>{t('hint_upload_screenshot', "Attach a screenshot of the customer's app showing this update. Hold to use the camera instead.")}</Text>
          )}

          {/* Photo slots: 3, or 1 wide slot for a screenshot */}
          <View style={styles.photosGrid}>
            {Array.from({ length: need }, (_, i) => i).map((i) => (
              <TouchableOpacity
                key={i}
                style={[styles.photoPreview, need === 1 && styles.photoPreviewWide, photos[i] ? styles.photoFilled : styles.photoEmpty]}
                activeOpacity={0.8}
                onPress={photos[i] ? () => setPreviewPhoto(photos[i]) : () => addPhoto(i)}
                onLongPress={photos[i] ? undefined : () => addPhoto(i, otherSource)}
              >
                {photos[i] ? (
                  <>
                    <Image source={{ uri: photos[i].uri }} style={styles.photoImage} resizeMode={evidence.screenshot ? 'contain' : 'cover'} />
                    {!evidence.screenshot && !!photos[i].location && (
                      <GoogleMapsGeotagPreview
                        latitude={photos[i].location!.latitude}
                        longitude={photos[i].location!.longitude}
                        timestamp={photos[i].location!.timestamp}
                        address={photos[i].location!.address}
                        compact
                      />
                    )}
                    <TouchableOpacity style={styles.deletePhotoBtn} activeOpacity={0.7} onPress={() => removePhoto(i)}>
                      <Trash2 size={12} color={Colors.white} />
                    </TouchableOpacity>
                  </>
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <BlueCameraPlusIcon />
                    <Text style={styles.photoPlaceholderText}>{evidence.screenshot ? t('label_screenshot', 'Screenshot') : language === 'ur' ? `تصویر ${i + 1}` : `Photo ${i + 1}`}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Primary Action Button: LOADING COMPLETE */}
          <TouchableOpacity
            style={[
              styles.mainActionBtn,
              !hasAllPhotos && styles.mainActionBtnDisabled,
            ]}
            activeOpacity={0.85}
            onPress={handleCompletePickup}
            disabled={!hasAllPhotos || submitting}
          >
            <Package size={22} color={hasAllPhotos ? "#FFFFFF" : "#94A3B8"} strokeWidth={2} />
            <Text style={[styles.mainActionBtnText, !hasAllPhotos && styles.mainActionBtnTextDisabled]}>
              {submitting
                ? t('msg_processing', 'PROCESSING…')
                : (isReturnLoading ? t('action_return_loading_complete', 'RETURN LOADING COMPLETE') : t('action_loading_complete', 'LOADING COMPLETE'))}
            </Text>
            <ArrowRight size={20} color={hasAllPhotos ? "#FFFFFF" : "#94A3B8"} strokeWidth={2.2} />
          </TouchableOpacity>
        </View>

        {/* Faded Bottom Truck Illustration */}
        <FadedBottomIllustration type="start_loading" height={240} imageOpacity={0.5} resizeMode="contain" />
      </ScrollView>

      <GeotagPhotoModal
        visible={!!previewPhoto}
        photo={previewPhoto ? { uri: previewPhoto.uri, title: t('title_loading_preview', 'Loading Photo Preview'), location: previewPhoto.location } : null}
        onClose={() => setPreviewPhoto(null)}
      />

      <DelayReportModal
        visible={showDelayModal}
        tripId={trip?.id ?? ''}
        onClose={() => setShowDelayModal(false)}
        onSuccess={() => setShowDelayModal(false)}
      />

      <ReturnLoadingModal
        visible={showReturnModal}
        destinationName={pickupLocationName}
        destinationAddress={pickupLocationAddr}
        onConfirm={handleConfirmReturnLoading}
        onClose={() => setShowReturnModal(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  backIconText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  returnBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    gap: 4,
    marginTop: 2,
  },
  returnBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#FA634E',
    letterSpacing: 0.3,
  },
  delayBadgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF7ED',
    borderRadius: 16,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  delayBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#E8450F',
  },
  locationCardHorizontal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  sideMapTileContainer: {
    position: 'relative',
    width: 92,
    height: 92,
    borderRadius: 18,
    overflow: 'hidden',
  },
  mapTileArrowBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 3,
  },
  locationRightColumn: {
    flex: 1,
    marginLeft: 12,
  },
  locationTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  locationSubLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  locationTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 20,
    marginBottom: 3,
  },
  locationAddress: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 15,
  },
  navigateBlueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EEF2FF',
    borderRadius: 16,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  navigateBlueBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#2563EB',
  },
  mapBoxContainer: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  uploadSectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  uploadHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  uploadTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  cameraIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  instructionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  instructionText: {
    fontSize: 11,
    color: '#2563EB',
    fontWeight: '600',
    flex: 1,
  },
  photosGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  photoPreview: {
    flex: 1,
    aspectRatio: 1.1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  photoPreviewWide: {
    aspectRatio: 1.8,
  },
  screenshotHint: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
    marginBottom: 10,
  },
  photoEmpty: {
    borderWidth: 1.5,
    borderColor: '#93C5FD',
    borderStyle: 'dashed',
    backgroundColor: '#F0F7FF',
  },
  photoFilled: {
    borderWidth: 0,
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPlaceholderText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#2563EB',
    marginTop: 4,
  },
  deletePhotoBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(220, 38, 38, 0.9)',
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainActionBtn: {
    height: 52,
    borderRadius: 16,
    backgroundColor: '#2563EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  mainActionBtnDisabled: {
    backgroundColor: '#E2E8F0',
    shadowOpacity: 0,
    elevation: 0,
  },
  mainActionBtnTextDisabled: {
    color: '#94A3B8',
  },
  mainActionBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});

export default PickupVerificationScreen;

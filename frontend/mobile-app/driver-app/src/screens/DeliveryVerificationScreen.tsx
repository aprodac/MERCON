import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  StatusBar, Image, Alert, Linking, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Path, Rect, Circle, Line, G, Polygon, Ellipse } from 'react-native-svg';
import { Info, Camera, MapPin, Trash2, Package, ArrowRight, Clock, Check, MessageSquare, ClipboardList, Send, Navigation, RotateCcw } from 'lucide-react-native';
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

import { pickFromGallery, type CapturedPhoto } from '@mercon/mobile-shared/lib/camera';
import { PhotoCaptureModal } from '../components/PhotoCaptureModal';
import { UploadProgressBar } from '../components/UploadProgressBar';
import { usePhotoUploads } from '../hooks/use-photo-uploads';
import { showToast } from '../components/AppToast';
import { isValidCoordinate } from '../utils/geo';
import { API_URL, getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { safeSecureStore as SecureStore } from '@mercon/mobile-shared/lib/secure-store';
import { triggerGPayHapticsAndSound } from '../services/sound';
import { useLanguage } from '@mercon/mobile-shared/lib/language-context';

const FILE_BASE = API_URL.replace(/\/api\/?$/, '');

// Green Camera Icon with Plus Badge for Delivery Photo Upload Slots
const GreenCameraPlusIcon = () => (
  <View style={{ width: 34, height: 30, justifyContent: 'center', alignItems: 'center' }}>
    <Svg width={30} height={28} viewBox="0 0 30 28">
      <Path
        d="M 4 8 C 2.9 8 2 8.9 2 10 L 2 23 C 2 24.1 2.9 25 4 25 L 21 25 C 22.1 25 23 24.1 23 23 L 23 10 C 23 8.9 22.1 8 21 8 Z"
        fill="none"
        stroke="#16A34A"
        strokeWidth={2.2}
      />
      <Path d="M 8 8 L 10 5 L 15 5 L 17 8 Z" fill="none" stroke="#16A34A" strokeWidth={2.2} />
      <Circle cx={12.5} cy={16.5} r={4.5} fill="none" stroke="#16A34A" strokeWidth={2.2} />

      {/* Plus Badge */}
      <Circle cx={22} cy={19} r={5.5} fill="#16A34A" />
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
      <Rect x={38} y={38} width={24} height={20} fill="#C6F6D5" rx={4} />
      <Rect x={74} y={38} width={12} height={20} fill="#BBF7D0" rx={3} />

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

const DeliveryVerificationScreen = () => {
  const router = useRouter();
  const { t, language } = useLanguage();
  const { trip, loading, refetch, setTrip } = useCurrentTrip();
  const ws = getEffectiveWorkflowState(trip);
  const isRound = isRoundTrip(trip);
  // Once the return-leg dropoff's actual_departure is stamped,
  // getEffectiveWorkflowState() immediately jumps to 'COMPLETED' — it never
  // lingers on ARRIVED_AT_FINAL_DELIVERY/FINAL_DELIVERY_VERIFICATION/
  // IN_TRANSIT_RETURN once that happens. Omitting 'COMPLETED' here used to
  // make this flag flip back to false at that exact moment (a round trip
  // can only reach COMPLETED via the return leg — the outbound delivery's
  // departure transitions to RETURN_LOADING, never COMPLETED), which made
  // the auto-redirect effect below treat a just-finished RETURN delivery as
  // an outbound delivery needing a return-loading prompt — racing the
  // explicit `/trip/completed` navigation in handleSubmit and sometimes
  // winning, sending the driver back to /trip/pickup (showing the King
  // Khalid Airport placeholder, since there's no real next pickup) in a
  // loop instead of landing on the completed screen.
  const isReturnDelivery = isRound && (ws === 'ARRIVED_AT_FINAL_DELIVERY' || ws === 'FINAL_DELIVERY_VERIFICATION' || ws === 'IN_TRANSIT_RETURN' || ws === 'COMPLETED');

  const legIndex = isReturnDelivery ? 1 : 0;
  const dropoffStop = getLegEndpoints(trip, legIndex).delivery;
  // 3 geotagged POD photos, or 1 customer-app screenshot on EXTERNAL_APP trips.
  const evidence = getEvidencePolicy(trip, 'delivery');
  const need = evidence.count;
  const primarySource: 'camera' | 'gallery' = evidence.screenshot ? 'gallery' : 'camera';
  const otherSource: 'camera' | 'gallery' = evidence.screenshot ? 'camera' : 'gallery';

  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  // Each photo uploads right after it is taken (so "Delivery complete" doesn't
  // upload all three at the end) and at most once; drives the upload bar.
  const uploads = usePhotoUploads();
  const { markUploaded, isKnown } = uploads;
  const photosRef = useRef<CapturedPhoto[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<CapturedPhoto | null>(null);
  const [showDelayModal, setShowDelayModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);

  // If this delivery stop is already completed and departed, navigate forward
  useEffect(() => {
    if (loading || !trip || !dropoffStop || showReturnModal) return;
    if (dropoffStop.actual_departure) {
      if (isReturnDelivery || !isRound) {
        router.replace({ pathname: '/trip/completed', params: { tripId: trip.id } } as any);
      } else {
        router.replace({ pathname: '/trip/pickup', params: { showReturnPrompt: '1' } } as any);
      }
    }
  }, [loading, trip?.id, dropoffStop?.id, dropoffStop?.actual_departure, isReturnDelivery, isRound, showReturnModal]);

  const validPhotosCount = photos.filter((p) => !!p?.uri).length;
  const hasAllPhotos = validPhotosCount >= need;

  // Load draft photos or prefill with already uploaded server documents
  useEffect(() => {
    if (!trip?.id) return;
    const loadDraft = async () => {
      try {
        const stopSpecificKey = dropoffStop?.id ? `delivery_draft_${trip.id}_${dropoffStop.id}` : null;
        const legacyKey = isReturnDelivery
          ? `return_delivery_draft_photos_${trip.id}`
          : `delivery_draft_photos_${trip.id}`;

        let saved = stopSpecificKey ? await SecureStore.getItemAsync(stopSpecificKey) : null;
        if (!saved) {
          saved = await SecureStore.getItemAsync(legacyKey);
        }

        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            markUploaded(parsed.filter((ph: CapturedPhoto) => ph?.uploaded).map((ph: CapturedPhoto) => ph.uri));
            setPhotos(parsed);
            return;
          }
        }

        // Fallback: If photos were already uploaded to server for THIS specific delivery stop/leg, display them
        if (trip.documents && trip.documents.length > 0 && dropoffStop?.id) {
          const serverPodDocs = trip.documents.filter((d: any) => {
            const op = d.ai_extracted_json?.operation;
            const leg = d.ai_extracted_json?.leg_index;
            const docStopId = d.ai_extracted_json?.stop_id;

            // 1. Must be a POD document type
            const isPodDoc = d.doc_type === 'POD' || op === 'delivery' || op === 'return_delivery' || op === 'pod';
            if (!isPodDoc) return false;

            // 2. Never match arrival photos
            const isArrival = op?.includes('arrival') || d.doc_type === 'Arrival';
            if (isArrival) return false;

            // 3. Primary strict check: Match exact stop ID
            if (docStopId) {
              return docStopId === dropoffStop.id;
            }

            // 4. Secondary fallback for legacy documents without stop_id:
            // MUST strictly match the exact leg index and operation type!
            if (isReturnDelivery) {
              return leg === 1 && (op === 'return_delivery' || op === 'pod');
            } else {
              return (leg === 0 || (leg === undefined && op === 'delivery')) && op !== 'return_delivery';
            }
          });

          if (serverPodDocs.length > 0) {
            const serverPhotos: CapturedPhoto[] = serverPodDocs.slice(0, need).map((d: any) => {
              const fullUri = d.file_url?.startsWith('http') || d.file_url?.startsWith('file://')
                ? d.file_url
                : `${FILE_BASE}${d.file_url?.startsWith('/') ? '' : '/'}${d.file_url}`;
              return {
                uri: fullUri,
                mimeType: d.mime_type || 'image/jpeg',
              };
            });
            // Already on the server — never upload these again.
            markUploaded(serverPhotos.map((ph) => ph.uri));
            setPhotos(serverPhotos);
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
  }, [trip?.id, isReturnDelivery, dropoffStop?.id, trip?.documents, markUploaded, need]);

  useEffect(() => { photosRef.current = photos; }, [photos]);

  const savePhotoDrafts = (list: CapturedPhoto[]) => {
    if (!trip?.id) return;
    // Remember which are already on the server, so reopening the screen
    // doesn't send them twice.
    const valid = list.map((ph) => ({ ...ph, uploaded: uploads.isUploaded(ph.uri) || undefined }));
    const stopKey = dropoffStop?.id ? `delivery_draft_${trip.id}_${dropoffStop.id}` : null;
    const draftKey = isReturnDelivery ? `return_delivery_draft_photos_${trip.id}` : `delivery_draft_photos_${trip.id}`;
    const completedKey = isReturnDelivery ? `return_delivery_completed_photos_${trip.id}` : `delivery_completed_photos_${trip.id}`;
    if (stopKey) SecureStore.setItemAsync(stopKey, JSON.stringify(valid));
    SecureStore.setItemAsync(draftKey, JSON.stringify(valid));
    SecureStore.setItemAsync(completedKey, JSON.stringify(valid));
  };

  /** Which leg/operation this delivery's photos belong to (final leg of a round trip = return delivery). */
  const podTarget = () => {
    const ws = trip?.driver_workflow_state || 'ASSIGNED';
    const isRound = isRoundTrip(trip);
    const isFinalLeg = !isRound || ws === 'IN_TRANSIT_RETURN' || ws === 'ARRIVED_AT_FINAL_DELIVERY' || ws === 'FINAL_DELIVERY_VERIFICATION';
    return { isFinalLeg, legIndex: isRound && isFinalLeg ? 1 : 0, op: isRound && isFinalLeg ? 'return_delivery' : 'delivery' };
  };

  /** Upload one photo (once); resolves true when it is on the server. */
  const uploadPhotoNow = (p: CapturedPhoto): Promise<boolean> => {
    if (!trip?.id || !p.uri) return Promise.resolve(false);
    const tripId = trip.id;
    const target = podTarget();
    return uploads.uploadNow(p, (onProgress) => tripService.uploadPhoto(
      tripId,
      'pod',
      {
        uri: p.uri,
        location: p.location ? { latitude: p.location.latitude, longitude: p.location.longitude, timestamp: p.location.timestamp } : null,
      },
      target.legIndex,
      target.op,
      dropoffStop?.id,
      onProgress,
    )).then((ok) => {
      if (ok) savePhotoDrafts(photosRef.current);
      return ok;
    });
  };

  // Photos restored from a saved draft that never reached the server: send
  // them now rather than waiting for the Complete button.
  useEffect(() => {
    photos.forEach((p) => { if (p?.uri && !isKnown(p.uri)) uploadPhotoNow(p); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos, isKnown]);

  /** Put a new photo in the next empty box, save the draft, start its upload. */
  const acceptPhoto = (photo: CapturedPhoto) => {
    const valid = [...photosRef.current, photo].filter(Boolean).slice(0, need);
    photosRef.current = valid;
    setPhotos(valid);
    savePhotoDrafts(valid);
    uploadPhotoNow(photo);
    if (valid.length >= need) setCameraOpen(false);
  };

  /**
   * Tap an empty box: the in-app camera opens and stays open until all three
   * are taken (it has its own Gallery tab). Long-press: straight to gallery.
   */
  const addPhoto = async (source: 'camera' | 'gallery' = primarySource) => {
    if (photosRef.current.length >= need) return;
    if (source === 'camera') {
      setCameraOpen(true);
      return;
    }
    const photo = await pickFromGallery().catch(() => null);
    if (photo) acceptPhoto(photo);
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => {
      const next = prev.filter((_, idx) => idx !== index);
      if (trip?.id) {
        const stopKey = dropoffStop?.id ? `delivery_draft_${trip.id}_${dropoffStop.id}` : null;
        const draftKey = isReturnDelivery ? `return_delivery_draft_photos_${trip.id}` : `delivery_draft_photos_${trip.id}`;
        const completedKey = isReturnDelivery ? `return_delivery_completed_photos_${trip.id}` : `delivery_completed_photos_${trip.id}`;
        if (stopKey) SecureStore.setItemAsync(stopKey, JSON.stringify(next));
        SecureStore.setItemAsync(draftKey, JSON.stringify(next));
        SecureStore.setItemAsync(completedKey, JSON.stringify(next));
      }
      return next;
    });
  };

  const handleCompleteDelivery = async () => {
    if (!trip || submitting) return;
    if (validPhotosCount < need) {
      Alert.alert(
        evidence.screenshot
          ? t('title_upload_screenshot', 'Upload Customer App Screenshot')
          : isReturnDelivery
          ? t('title_upload_return_delivery_photos', 'Upload Return Delivery Photos')
          : t('title_upload_delivery_photos', 'Upload Delivery Photos'),
        `${isReturnDelivery ? t('title_upload_return_delivery_photos', 'Upload return delivery photos') : t('title_upload_delivery_photos', 'Upload delivery photos')} (${validPhotosCount}/${need}).`
      );
      return;
    }
    setSubmitting(true);
    try {
      if (trip?.id) {
        const photoKey = isReturnDelivery ? `return_delivery_completed_photos_${trip.id}` : `delivery_completed_photos_${trip.id}`;
        await SecureStore.setItemAsync(photoKey, JSON.stringify(photos));
        if (trip.ref_id) {
          const refKey = isReturnDelivery ? `return_delivery_completed_photos_${trip.ref_id}` : `delivery_completed_photos_${trip.ref_id}`;
          await SecureStore.setItemAsync(refKey, JSON.stringify(photos));
        }
        if (isReturnDelivery) {
          await SecureStore.setItemAsync('last_return_delivery_photos', JSON.stringify(photos));
        } else {
          await SecureStore.setItemAsync('last_delivery_photos', JSON.stringify(photos));
        }
        await SecureStore.setItemAsync('last_completed_trip_id', trip.id);
      }
      const { isFinalLeg } = podTarget();

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

      if (!isFinalLeg) {
        // Round trip outbound delivery completed! Transition to Return Loading
        try {
          const updated = await tripService.updateStatus(trip.id, 'Loading', 'RETURN_LOADING');
          setTrip(updated);
        } catch (statusErr) {
          // Don't pretend it worked — stay here so the driver can tap again.
          console.warn('Status update failed:', statusErr);
          showToast(`${t('err_status_not_saved_delivery', 'Could not save the delivery. Check your connection and tap again.')} (${getApiErrorMessage(statusErr)})`, 'error');
          return;
        }
        triggerGPayHapticsAndSound();
        await SecureStore.deleteItemAsync(`pickup_draft_photos_${trip.id}`).catch(() => {});
        if (dropoffStop?.id) {
          await SecureStore.deleteItemAsync(`delivery_draft_${trip.id}_${dropoffStop.id}`).catch(() => {});
        }
        router.replace({ pathname: '/trip/pickup', params: { showReturnPrompt: '1' } } as any);
      } else {
        // Final leg delivery completed! Transition to COMPLETED
        if (dropoffStop?.id) {
          await SecureStore.deleteItemAsync(`delivery_draft_${trip.id}_${dropoffStop.id}`).catch(() => {});
        }
        await SecureStore.deleteItemAsync(`return_delivery_draft_photos_${trip.id}`).catch(() => {});
        try {
          const updated = await tripService.updateStatus(trip.id, 'Completed', 'COMPLETED');
          setTrip(updated);
        } catch (statusErr) {
          // Without this the trip stayed open on the server while the app
          // showed "Delivered". Stay here so the driver can tap again.
          console.warn('Status update failed:', statusErr);
          showToast(`${t('err_status_not_saved_delivery', 'Could not save the delivery. Check your connection and tap again.')} (${getApiErrorMessage(statusErr)})`, 'error');
          return;
        }
        triggerGPayHapticsAndSound();
        router.replace({ pathname: '/trip/completed', params: { tripId: trip.id } } as any);
      }
    } catch (err) {
      console.error('Delivery completion error:', err);
      showToast(getApiErrorMessage(err), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const openNavigation = () => {
    // Real stop data only (a hard-coded city used to be the fallback, which
    // sent drivers to the wrong place when a stop had no address).
    const address = stopAddress(dropoffStop) || stopLabel(dropoffStop) || (dropoffStop && isValidCoordinate(dropoffStop.location_lat, dropoffStop.location_lng) ? `${dropoffStop.location_lat},${dropoffStop.location_lng}` : null);
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

  const deliveryLocationName = stopLabel(dropoffStop) || 'Delivery';
  const deliveryLocationAddr = stopAddress(dropoffStop) || '';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header Bar */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} activeOpacity={0.8} onPress={() => router.back()}>
            <Text style={styles.backIconText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isReturnDelivery ? t('title_return_delivery_header', 'Return Delivery') : t('title_delivery_header', 'Delivery')}</Text>
          <DelayButton onPress={() => setShowDelayModal(true)} />
        </View>

        {/* 4-Step Progress Stepper: Pickup ✓ -> Loading ✓ -> Delivery ● -> Complete */}
        <TripProgressStepper
          trip={trip}
          target={{ kind: 'delivery', leg: isReturnDelivery ? 1 : 0 }}
        />

        {/* Location Card (Horizontal Side-by-Side matching Screenshot 2) */}
        <View style={styles.locationCardHorizontal}>
          <SideMapTileBox />

          <View style={styles.locationRightColumn}>
            <View style={styles.locationTopRow}>
              <Text style={styles.locationSubLabel}>{isReturnDelivery ? t('label_return_delivery_point', 'Return Delivery Point') : t('label_delivery_point', 'Delivery Point')}</Text>
              <TouchableOpacity style={styles.navigateBlueBtn} activeOpacity={0.8} onPress={openNavigation}>
                <Send size={12} color="#2563EB" strokeWidth={2.2} />
                <Text style={styles.navigateBlueBtnText}>{t('action_navigate', 'Navigate')}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.locationTitle} numberOfLines={2}>
              {deliveryLocationName}
            </Text>
            <Text style={styles.locationAddress} numberOfLines={3}>
              {deliveryLocationAddr}
            </Text>
          </View>
        </View>

        {/* Upload Delivery Photos Section */}
        <View style={styles.uploadSectionCard}>
          <View style={styles.uploadHeaderRow}>
            <Text style={styles.uploadTitle}>{evidence.screenshot ? t('title_upload_screenshot_caps', 'UPLOAD CUSTOMER APP SCREENSHOT') : isReturnDelivery ? t('title_upload_return_delivery_photos', 'UPLOAD RETURN DELIVERY PHOTOS') : t('title_upload_delivery_photos', 'UPLOAD DELIVERY PHOTOS')}</Text>
            <View style={styles.chatIconCircle}>
              <MessageSquare size={16} color="#16A34A" strokeWidth={2.2} />
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
                onPress={photos[i] ? () => setPreviewPhoto(photos[i]) : () => addPhoto()}
                onLongPress={photos[i] ? undefined : () => addPhoto(otherSource)}
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
                    <GreenCameraPlusIcon />
                    <Text style={styles.photoPlaceholderText}>{evidence.screenshot ? t('label_screenshot', 'Screenshot') : language === 'ur' ? `تصویر ${i + 1}` : `Photo ${i + 1}`}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>

          <UploadProgressBar items={uploads.itemsFor(photos)} total={need} accent="#16A34A" />
          {!hasAllPhotos ? (
            <TouchableOpacity style={styles.galleryLink} activeOpacity={0.7} onPress={() => addPhoto(otherSource)}>
              <Text style={styles.galleryLinkText}>
                {evidence.screenshot
                  ? t('action_take_photo_instead', 'Take a photo instead')
                  : language === 'ur' ? 'گیلری سے منتخب کریں' : 'Choose from gallery'}
              </Text>
            </TouchableOpacity>
          ) : null}

          {/* Primary Action Button: DELIVERY COMPLETE */}
          <TouchableOpacity
            style={[
              styles.mainActionBtn,
              !hasAllPhotos && styles.mainActionBtnDisabled,
            ]}
            activeOpacity={0.85}
            onPress={handleCompleteDelivery}
            disabled={!hasAllPhotos || submitting}
          >
            <Package size={22} color={hasAllPhotos ? "#FFFFFF" : "#94A3B8"} strokeWidth={2} />
            <Text style={[styles.mainActionBtnText, !hasAllPhotos && styles.mainActionBtnTextDisabled]}>
              {submitting
                ? t('msg_completing', 'COMPLETING…')
                : (isReturnDelivery ? t('action_return_delivery_complete', 'RETURN DELIVERY COMPLETE') : t('action_delivery_complete', 'DELIVERY COMPLETE'))}
            </Text>
            <ArrowRight size={20} color={hasAllPhotos ? "#FFFFFF" : "#94A3B8"} strokeWidth={2.2} />
          </TouchableOpacity>
        </View>

        {/* Faded Bottom Truck Illustration */}
        <FadedBottomIllustration type="delivery" height={240} imageOpacity={0.5} resizeMode="contain" />
      </ScrollView>

      <PhotoCaptureModal
        visible={cameraOpen}
        photos={photos}
        uploads={uploads.itemsFor(photos)}
        total={need}
        accent="#16A34A"
        onPhoto={acceptPhoto}
        onClose={() => setCameraOpen(false)}
      />

      <GeotagPhotoModal
        visible={!!previewPhoto}
        photo={previewPhoto ? { uri: previewPhoto.uri, title: t('title_pod_preview', 'POD Photo Preview'), location: previewPhoto.location } : null}
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
        destinationName={stopLabel(dropoffStop) || 'Return Pickup Depot'}
        destinationAddress={stopAddress(dropoffStop) || undefined}
        onConfirm={() => {
          setShowReturnModal(false);
          router.replace({ pathname: '/trip/pickup', params: { showReturnPrompt: '1' } } as any);
        }}
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
  chatIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F0FDF4',
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
    color: '#16A34A',
    fontWeight: '600',
    flex: 1,
  },
  photosGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
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
    borderColor: '#86EFAC',
    borderStyle: 'dashed',
    backgroundColor: '#F0FDF4',
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
    color: '#16A34A',
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
  checklistCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFF7ED',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  checklistIconSquare: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FFEDD5',
  },
  checklistTextWrapper: {
    flex: 1,
  },
  checklistTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#9A3412',
  },
  checklistSub: {
    fontSize: 10.5,
    color: '#C2410C',
    marginTop: 1,
  },
  readyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#DCFCE7',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  readyBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#15803D',
  },
  galleryLink: {
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  galleryLinkText: {
    color: '#16A34A',
    fontSize: 14,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  mainActionBtn: {
    height: 52,
    borderRadius: 16,
    backgroundColor: '#16A34A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    shadowColor: '#16A34A',
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

export default DeliveryVerificationScreen;

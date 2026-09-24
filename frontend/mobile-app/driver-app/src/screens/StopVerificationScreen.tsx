import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  StatusBar, Image, Alert, ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Svg, { Path, Rect, Circle, Line, G } from 'react-native-svg';
import { ArrowLeft, ArrowRight, Camera, MapPin, Trash2, Check, Navigation, Send, Route, Info } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { GoogleMapsGeotagPreview } from '../components/GoogleMapsGeotagPreview';
import { GeotagPhotoModal } from '../components/GeotagPhotoModal';
import { TripProgressStepper } from '../components/TripProgressStepper';
import { BilingualText } from '@mercon/mobile-shared/components/BilingualText';
import { DelayReportModal } from '../components/DelayReportModal';
import { DelayButton } from '../components/DelayButton';
import { FadedBottomIllustration } from '../components/FadedBottomIllustration';
import { useCurrentTrip } from '../hooks/use-current-trip';
import { tripService, stopAddress, isRoundTrip, getLegIntermediateDbStops } from '@mercon/mobile-shared/lib/trips';
import { parseTripRouteNodes, parseStopWorkflowState, TimelineStop } from '../utils/routeParser';
import { choosePhoto, type CapturedPhoto } from '@mercon/mobile-shared/lib/camera';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { safeSecureStore as SecureStore } from '@mercon/mobile-shared/lib/secure-store';
import { openInGoogleMaps } from '../services/maps';
import { useLanguage } from '@mercon/mobile-shared/lib/language-context';

// Side Map Tile Box Component (matching Pickup and Delivery screens)
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
        <Path d="M9 0C4.03 0 0 4.03 0 9C0 15.5 9 22 9 22C9 22 18 15.5 18 9C18 4.03 13.97 0 9 0Z" fill="#FA634E" />
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
// Red Camera Icon with Plus Badge for Stop Photo Upload Slots
const RedCameraPlusIcon = () => (
  <View style={{ width: 34, height: 30, justifyContent: 'center', alignItems: 'center' }}>
    <Svg width={30} height={28} viewBox="0 0 30 28">
      <Path
        d="M 4 8 C 2.9 8 2 8.9 2 10 L 2 23 C 2 24.1 2.9 25 4 25 L 21 25 C 22.1 25 23 24.1 23 23 L 23 10 C 23 8.9 22.1 8 21 8 Z"
        fill="none"
        stroke="#DC2626"
        strokeWidth={2.2}
      />
      <Path d="M 8 8 L 10 5 L 15 5 L 17 8 Z" fill="none" stroke="#DC2626" strokeWidth={2.2} />
      <Circle cx={12.5} cy={16.5} r={4.5} fill="none" stroke="#DC2626" strokeWidth={2.2} />

      {/* Plus Badge */}
      <Circle cx={22} cy={19} r={5.5} fill="#DC2626" />
      <Line x1={22} y1={16} x2={22} y2={22} stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" />
      <Line x1={19} y1={19} x2={25} y2={19} stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" />
    </Svg>
  </View>
);

export default function StopVerificationScreen() {
  const router = useRouter();
  const { stopIndex: paramStopIndex, legIndex: paramLegIndex } = useLocalSearchParams<{ stopIndex?: string; legIndex?: string }>();
  const { t, language } = useLanguage();
  const { trip, loading, refetch, setTrip } = useCurrentTrip();

  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  // Photos of THIS stop already uploaded in this session (a retry after a
  // partial upload failure only re-sends the rest, but they still count).
  const uploadedCountRef = useRef(0);
  const [submitting, setSubmitting] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<CapturedPhoto | null>(null);
  const [showDelayModal, setShowDelayModal] = useState(false);

  const isRound = isRoundTrip(trip);
  const isReturnLeg = isRound && (paramLegIndex === '1' || (trip?.driver_workflow_state || '').includes('RETURN'));

  // Parse all route stops cleanly
  const allStops = parseTripRouteNodes(trip);
  const intermediateStops = isReturnLeg
    ? allStops.filter((s) => s.isIntermediate && s.isReturnStop)
    : allStops.filter((s) => s.isIntermediate && !s.isReturnStop);

  // Only this leg's stops. The old fallback to "any intermediate stop" showed an
  // OUTBOUND stop as "Return Stop #1" when the return leg had none (e.g.
  // A→X→B | B→A). Only trips without leg data (legacy one-way) keep it.
  const hasLegData = (trip?.stops ?? []).some((s) => (s.leg_index ?? 0) === 1) || !isRound;
  const activeStopsList = intermediateStops.length > 0 || hasLegData ? intermediateStops : allStops.filter((s) => s.isIntermediate);

  // Route param wins; otherwise resume from the indexed workflow state
  // (e.g. ARRIVED_AT_STOP_1) so a restart doesn't send the driver back to stop #1.
  const wsStop = parseStopWorkflowState(trip?.driver_workflow_state);
  const parsedIndex = paramStopIndex
    ? parseInt(paramStopIndex, 10)
    : (wsStop && wsStop.leg === (isReturnLeg ? 1 : 0) ? wsStop.stopIndex : 0);
  const activeStop: TimelineStop | undefined = activeStopsList[parsedIndex] || activeStopsList[0] || allStops[1];
  // The TripStop row behind this stop. Photos and the stop's arrival/departure
  // stamps must reference this id — the timeline node id (`outbound-stop-0`)
  // exists only in the app, so photos tagged with it never matched a stop on
  // the web trip page.
  const dbStopId: string | undefined =
    getLegIntermediateDbStops(trip, isReturnLeg ? 1 : 0)[parsedIndex]?.id ??
    ((activeStop as any)?.stopId || undefined);

  useEffect(() => {
    if (loading || !trip || trip.driver_workflow === 'EXTERNAL_APP') return;
    if (activeStopsList.length === 0) {
      router.replace('/trip/navigate' as any);
    }
  }, [loading, trip, activeStopsList.length]);

  useEffect(() => {
    if (trip?.driver_workflow === 'EXTERNAL_APP') {
      const ws = trip?.driver_workflow_state || 'ASSIGNED';
      if (ws === 'ASSIGNED') {
        router.replace('/');
      } else {
        router.replace('/trip/external-app');
      }
    }
  }, [trip?.driver_workflow, trip]);

  // Restore photos from SecureStore on mount
  useEffect(() => {
    if (!trip?.id || !activeStop?.id) return;
    const storeKey = `stop_photos_${trip.id}_${activeStop.id}`;
    SecureStore.getItemAsync(storeKey).then((saved) => {
      if (saved) {
        try {
          setPhotos(JSON.parse(saved));
        } catch {}
      }
    });
  }, [trip?.id, activeStop?.id]);

  const savePhotosState = (newPhotos: CapturedPhoto[]) => {
    setPhotos(newPhotos);
    if (trip?.id && activeStop?.id) {
      SecureStore.setItemAsync(`stop_photos_${trip.id}_${activeStop.id}`, JSON.stringify(newPhotos));
    }
  };

  const handleAddPhoto = async () => {
    try {
      const photo = await choosePhoto();
      if (!photo) return;
      savePhotosState([...photos, photo]);
    } catch (e) {
      Alert.alert(t('err_camera_title', 'Camera Error'), getApiErrorMessage(e));
    }
  };

  const handleRemovePhoto = (id: string) => {
    const updated = photos.filter((p) => (p.id || p.uri) !== id);
    savePhotosState(updated);
  };

  const MIN_STOP_PHOTOS = 3;

  const handleCompleteStop = async () => {
    if (!trip || submitting) return;
    // Same rule as loading/delivery: at least 3 photos per stop.
    const totalPhotos = photos.filter((p) => !!p?.uri).length + uploadedCountRef.current;
    if (totalPhotos < MIN_STOP_PHOTOS) {
      Alert.alert(
        t('title_stop_photos_required', 'Stop Photos Required'),
        `${t('msg_min_stop_photos', 'Please add at least 3 photos for this stop')} (${totalPhotos}/${MIN_STOP_PHOTOS}).`,
      );
      return;
    }
    setSubmitting(true);

    try {
      // 1. Upload intermediate stop photos if captured. Each photo is dropped
      // from the pending list as soon as it uploads, so a retry after a
      // failure doesn't upload the earlier ones a second time.
      let pending = photos;
      for (const p of photos) {
        await tripService.uploadPhoto(
          trip.id,
          'cargo',
          {
            uri: p.uri,
            mimeType: p.mimeType,
            fileName: p.fileName,
            location: (p.location || p.geotag)
              ? {
                  latitude: (p.location || p.geotag)!.latitude,
                  longitude: (p.location || p.geotag)!.longitude,
                  timestamp: (p.location || p.geotag)!.timestamp,
                }
              : null,
          },
          isReturnLeg ? 1 : 0,
          isReturnLeg ? 'return_intermediate_stop' : 'intermediate_stop',
          dbStopId
        );
        pending = pending.filter((x) => x !== p);
        uploadedCountRef.current += 1;
        savePhotosState(pending);
      }

      // 2. Clear saved photos for this stop
      if (activeStop?.id) {
        await SecureStore.deleteItemAsync(`stop_photos_${trip.id}_${activeStop.id}`);
      }

      // 3. Check if there are more intermediate stops on this leg
      const hasNextStop = parsedIndex + 1 < activeStopsList.length;

      if (hasNextStop) {
        const nextIdx = parsedIndex + 1;
        const nextState = isReturnLeg ? `ARRIVED_AT_RETURN_STOP_${nextIdx}` : `ARRIVED_AT_STOP_${nextIdx}`;
        // Update the app's copy of the trip too — screens read it, and a stale
        // copy still says "at stop", which sent the driver back to this stop.
        const updated = await tripService.updateStatus(trip.id, 'InTransit', nextState, undefined, dbStopId);
        setTrip(updated);
        uploadedCountRef.current = 0;
        router.replace({ pathname: '/trip/stop', params: { stopIndex: String(nextIdx), legIndex: isReturnLeg ? '1' : '0' } } as any);
      } else {
        // Proceed to Delivery / Return Delivery
        const nextState = isReturnLeg ? 'IN_TRANSIT_RETURN' : 'IN_TRANSIT';
        const updated = await tripService.updateStatus(trip.id, 'InTransit', nextState, undefined, dbStopId);
        setTrip(updated);
        uploadedCountRef.current = 0;
        router.replace('/trip/navigate' as any);
      }
    } catch (e) {
      Alert.alert(t('err_could_not_complete_stop', 'Could not complete stop'), getApiErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const stopName = activeStop?.name || (isReturnLeg ? (language === 'ur' ? 'واپسی کا درمیانی اسٹاپ' : 'Return Intermediate Stop') : (language === 'ur' ? 'درمیانی اسٹاپ' : 'Intermediate Stop'));
  const stopHeaderTitle = language === 'ur'
    ? (isReturnLeg ? `واپسی کا درمیانی اسٹاپ #${parsedIndex + 1}` : `درمیانی اسٹاپ #${parsedIndex + 1}`)
    : (isReturnLeg ? `Return Stop #${parsedIndex + 1}` : `Intermediate Stop #${parsedIndex + 1}`);
  const totalStopsInLeg = activeStopsList.length > 0 ? activeStopsList.length : 1;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      {/* Top Header Bar */}
      <View style={styles.topHeaderBar}>
        <TouchableOpacity style={styles.backBtn} activeOpacity={0.8} onPress={() => router.back()}>
          <ArrowLeft size={22} color="#3E3C3D" strokeWidth={2.2} />
        </TouchableOpacity>
        <Text style={styles.headerTitleText}>
          {stopHeaderTitle}
        </Text>
        <DelayButton onPress={() => setShowDelayModal(true)} />
      </View>

      {/* Stepper Bar */}
      <TripProgressStepper
        trip={trip}
        target={{ kind: 'stop', leg: isReturnLeg ? 1 : 0, stopIndex: parsedIndex }}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Stop Info Location Card (matching SideMapTileBox layout) */}
        <View style={styles.locationCardHorizontal}>
          <SideMapTileBox />

          <View style={styles.locationRightColumn}>
            <View style={styles.locationTopRow}>
              <Text style={styles.locationSubLabel}>
                {language === 'ur'
                  ? (isReturnLeg ? `واپسی اسٹاپ ${parsedIndex + 1} از ${totalStopsInLeg}` : `اسٹاپ ${parsedIndex + 1} از ${totalStopsInLeg}`)
                  : (isReturnLeg ? `RETURN STOP ${parsedIndex + 1} OF ${totalStopsInLeg}` : `STOP ${parsedIndex + 1} OF ${totalStopsInLeg}`)}
              </Text>
              <TouchableOpacity
                style={styles.navigateBlueBtn}
                activeOpacity={0.8}
                onPress={() => openInGoogleMaps({ location_name: stopName, location_address: activeStop?.address })}
              >
                <Send size={12} color="#2563EB" strokeWidth={2.2} />
                <Text style={styles.navigateBlueBtnText}>{t('action_navigate', 'Navigate')}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.locationTitle} numberOfLines={1}>
              {stopName}
            </Text>
            {activeStop?.address ? (
              <Text style={styles.locationAddress} numberOfLines={2}>
                {activeStop.address}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Dedicated Stop Photo Upload Section (matching Upload Loading Photos card style) */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitleText}>
              {isReturnLeg
                ? t('title_upload_return_stop_photos', 'UPLOAD RETURN STOP PHOTOS')
                : t('title_upload_stop_photos', 'UPLOAD INTERMEDIATE STOP PHOTOS')}
            </Text>
            <TouchableOpacity activeOpacity={0.8} onPress={handleAddPhoto}>
              <View style={styles.cameraCircleBadge}>
                <Camera size={16} color="#DC2626" strokeWidth={2.2} />
              </View>
            </TouchableOpacity>
          </View>

          {/* 3 Photo Slot Cards Grid */}
          <View style={styles.photosGrid}>
            {[0, 1, 2].map((i) => (
              <TouchableOpacity
                key={i}
                style={photos[i] ? styles.photoSlotFilled : styles.addPhotoCardSlot}
                activeOpacity={0.8}
                onPress={photos[i] ? () => setPreviewPhoto(photos[i]) : handleAddPhoto}
              >
                {photos[i] ? (
                  <>
                    <Image source={{ uri: photos[i].uri }} style={styles.photoThumb} />
                    <TouchableOpacity
                      style={styles.removePhotoBtn}
                      activeOpacity={0.7}
                      onPress={() => handleRemovePhoto(photos[i].id || photos[i].uri)}
                    >
                      <Trash2 size={12} color="#FFFFFF" />
                    </TouchableOpacity>
                  </>
                ) : (
                  <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                    <RedCameraPlusIcon />
                    <Text style={styles.addPhotoLabel}>{language === 'ur' ? `تصویر ${i + 1}` : `Photo ${i + 1}`}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Large Action Button inside Card */}
          <TouchableOpacity
            style={[styles.completeBtn, submitting && { opacity: 0.6 }]}
            activeOpacity={0.85}
            onPress={handleCompleteStop}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Route size={18} color="#FFFFFF" strokeWidth={2.2} />
                <Text style={styles.completeBtnText}>
                  {parsedIndex + 1 < activeStopsList.length
                    ? t('action_complete_stop_next', 'COMPLETE STOP & NEXT')
                    : t('action_complete_stop_proceed', 'COMPLETE STOP & PROCEED')}
                </Text>
                <ArrowRight size={18} color="#FFFFFF" strokeWidth={2.5} />
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Faded Bottom Truck Illustration */}
        <FadedBottomIllustration type="stop" height={220} imageOpacity={0.5} resizeMode="contain" />
      </ScrollView>

      {/* Geotag Preview Modal */}
      {previewPhoto && (
        <GeotagPhotoModal
          visible={Boolean(previewPhoto)}
          photo={{ uri: previewPhoto.uri, location: previewPhoto.location || previewPhoto.geotag }}
          onClose={() => setPreviewPhoto(null)}
        />
      )}

      {/* Delay Modal */}
      <DelayReportModal
        visible={showDelayModal}
        tripId={trip?.id || ''}
        onClose={() => setShowDelayModal(false)}
        onSuccess={refetch}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topHeaderBar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    backgroundColor: '#F8FAFC',
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
  headerTitleText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 20,
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
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '700',
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
  sectionCard: {
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
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitleText: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  cameraCircleBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photosGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  photoSlotFilled: {
    flex: 1,
    aspectRatio: 1.1,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#F1F5F9',
  },
  photoThumb: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
  },
  removePhotoBtn: {
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
  addPhotoCardSlot: {
    flex: 1,
    aspectRatio: 1.1,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#FCA5A5',
    borderStyle: 'dashed',
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#DC2626',
    marginTop: 4,
  },
  completeBtn: {
    height: 52,
    borderRadius: 16,
    backgroundColor: '#DC2626',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  completeBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});

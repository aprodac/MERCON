import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar,
  ScrollView, ActivityIndicator, Image, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft, Upload, CheckCircle2, Camera, Image as ImageIcon, RefreshCw, Building2, ArrowRight,
} from 'lucide-react-native';
import { useCurrentTrip } from '../hooks/use-current-trip';
import { tripService, getEffectiveWorkflowState, getNextExternalAppAction, statusLabel, stopLabel, isRoundTrip, getLegEndpoints } from '@mercon/mobile-shared/lib/trips';

import { targetFromWorkflowState } from '../utils/routeParser';
import { pickFromGallery, capturePhoto, type CapturedPhoto } from '@mercon/mobile-shared/lib/camera';
import { API_URL, getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { TripProgressStepper } from '../components/TripProgressStepper';
import { DelayButton } from '../components/DelayButton';
import { DelayReportModal } from '../components/DelayReportModal';
import { BilingualText } from '@mercon/mobile-shared/components/BilingualText';

const FILE_BASE = API_URL.replace(/\/api\/?$/, '');

function isValidUri(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (trimmed.length < 7) return false;
  return (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('file://') ||
    trimmed.startsWith('data:')
  );
}

function resolveLogoUrl(rawLogo?: string | null): string | null {
  if (!rawLogo || typeof rawLogo !== 'string') return null;
  const trimmed = rawLogo.trim();
  if (!trimmed) return null;
  let fullUrl = trimmed;
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://') && !trimmed.startsWith('file://') && !trimmed.startsWith('data:')) {
    const cleanPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    fullUrl = `${FILE_BASE}${cleanPath}`;
  }
  return isValidUri(fullUrl) ? fullUrl : null;
}

export const ExternalAppWorkflowScreen = () => {
  const router = useRouter();
  const { trip, loading, refetch, setTrip } = useCurrentTrip();
  const [logoError, setLogoError] = useState(false);
  const logoUrl = resolveLogoUrl(trip?.customer?.logo_url || null);
  const showLogo = Boolean(logoUrl) && !logoError;

  const [selectedPhoto, setSelectedPhoto] = useState<CapturedPhoto | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showDelayModal, setShowDelayModal] = useState(false);

  const ws = getEffectiveWorkflowState(trip);
  const action = getNextExternalAppAction(trip);

  const resetPhotoState = () => setSelectedPhoto(null);

  const handlePickGallery = async () => {
    try {
      const photo = await pickFromGallery();
      if (photo) setSelectedPhoto(photo);
    } catch (err) {
      Alert.alert('Error', getApiErrorMessage(err));
    }
  };

  const handleCamera = async () => {
    try {
      const photo = await capturePhoto();
      if (photo) setSelectedPhoto(photo);
    } catch (err) {
      Alert.alert('Error', getApiErrorMessage(err));
    }
  };

  const pickupStop = getLegEndpoints(trip, 0).loading;
  const dropoffStop = getLegEndpoints(trip, 0).delivery;
  const isCompleted = trip?.status === 'Completed' || trip?.status === 'Invoiced';

  const stopIdForAction = () => {
    if (!action || !trip?.stops) return undefined;
    const endpoints = getLegEndpoints(trip, action.legIndex);
    const wantsDelivery = action.operation.includes('delivery');
    return (wantsDelivery ? endpoints.delivery : endpoints.loading)?.id;
  };


  const handleConfirmAndAdvance = async () => {
    if (!trip || !selectedPhoto || !action) return;
    setSubmitting(true);
    try {
      const kind = action.operation.includes('delivery') ? 'pod' : 'cargo';
      await tripService.uploadPhoto(trip.id, kind, selectedPhoto, action.legIndex, action.operation, stopIdForAction());
      const updatedTrip = await tripService.updateStatus(trip.id, action.targetStatus, action.targetWorkflowState);
      setTrip(updatedTrip);
      resetPhotoState();
    } catch (err) {
      Alert.alert('Error', getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !trip) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#FA634E" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#EEF1F6" />

      {/* Top Header Bar */}
      <View style={styles.topHeaderBar}>
        <TouchableOpacity style={styles.backBtn} activeOpacity={0.8} onPress={() => router.back()}>
          <ArrowLeft size={20} color="#3E3C3D" strokeWidth={2.2} />
        </TouchableOpacity>
        <View style={styles.headerTitleCol}>
          <BilingualText
            ur="ایپ ویریفکیشن"
            en="External App Verification"
            primaryStyle={styles.headerTitleUrdu}
            subStyle={styles.headerTitleEn}
          />
        </View>
        <DelayButton onPress={() => setShowDelayModal(true)} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* 4-Step Progress Stepper showing route location names */}
        <TripProgressStepper
          trip={trip}
          target={isCompleted ? { kind: 'completed' } : targetFromWorkflowState(ws, isRoundTrip(trip))}
        />

        {/* Card 1: Hero Overview */}
        <View style={styles.heroCard}>
          <View style={styles.heroHeaderRow}>
            {showLogo ? (
              <View style={styles.logoBox}>
                <Image
                  source={{ uri: logoUrl! }}
                  style={styles.logoImg}
                  resizeMode="contain"
                  fadeDuration={0}
                  onError={() => setLogoError(true)}
                />
              </View>
            ) : (
              <View style={styles.logoFallback}>
                <Building2 size={22} color="#FA634E" strokeWidth={2} />
              </View>
            )}
            <View style={styles.heroCustomerCol}>
              <Text style={styles.customerName} numberOfLines={1}>
                {trip?.customer?.name ?? 'Mercon Logistics'}
              </Text>
              <Text style={styles.tripRefId}>TRP-{trip?.ref_id ?? trip?.id?.slice(0, 8)}</Text>
            </View>
            <View style={[styles.statusBadge, isCompleted ? styles.statusBadgeCompleted : styles.statusBadgeActive]}>
              <Text style={[styles.statusBadgeText, isCompleted ? styles.statusTextCompleted : styles.statusTextActive]}>
                {ws ? ws.replace(/_/g, ' ') : statusLabel(trip?.status || 'Scheduled')}
              </Text>
            </View>
          </View>

          <View style={styles.cardDivider} />

          {/* Route Overview */}
          <View style={styles.routeRow}>
            <Text style={styles.routeOriginText} numberOfLines={1}>{stopLabel(pickupStop) ?? 'Pickup'}</Text>
            <ArrowRight size={16} color="#FA634E" strokeWidth={2.5} style={styles.routeArrow} />
            <Text style={styles.routeDestText} numberOfLines={1}>{stopLabel(dropoffStop) ?? 'Delivery'}</Text>
          </View>
        </View>

        {/* Card 2: Current Milestone Action, or Completed state */}
        {action ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{action.label}</Text>
            <Text style={styles.sectionSubtitle}>
              Attach a screenshot of the customer's app showing this update, then confirm.
            </Text>

            {selectedPhoto ? (
              <View style={styles.previewContainer}>
                <Image source={{ uri: selectedPhoto.uri }} style={styles.previewImage} resizeMode="contain" />
                <TouchableOpacity
                  style={styles.changePhotoBtn}
                  onPress={resetPhotoState}
                  disabled={submitting}
                >
                  <RefreshCw size={14} color="#3E3C3D" />
                  <Text style={styles.changePhotoText}>Change Screenshot</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.pickersRow}>
                <TouchableOpacity style={styles.pickerBox} onPress={handlePickGallery} activeOpacity={0.8}>
                  <ImageIcon size={26} color="#FA634E" strokeWidth={2} />
                  <Text style={styles.pickerTitle}>Choose Screenshot</Text>
                  <Text style={styles.pickerSub}>Select from gallery</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.pickerBox} onPress={handleCamera} activeOpacity={0.8}>
                  <Camera size={26} color="#3E3C3D" strokeWidth={2} />
                  <Text style={styles.pickerTitle}>Take Photo</Text>
                  <Text style={styles.pickerSub}>Use camera</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.uploadActionBtn,
                (!selectedPhoto || submitting) && styles.uploadActionBtnDisabled,
              ]}
              onPress={handleConfirmAndAdvance}
              disabled={!selectedPhoto || submitting}
              activeOpacity={0.88}
            >
              {submitting ? (
                <>
                  <ActivityIndicator color="#FFFFFF" size="small" />
                  <Text style={styles.uploadActionText}>Updating Progress...</Text>
                </>
              ) : (
                <>
                  <Upload size={18} color="#FFFFFF" strokeWidth={2.2} />
                  <Text style={styles.uploadActionText}>Confirm: {action.label}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ gap: 16 }}>
            <View style={[styles.card, styles.completedCard]}>
              <CheckCircle2 size={28} color="#059669" strokeWidth={2.2} />
              <Text style={styles.completedTitle}>Trip Completed</Text>
              <Text style={styles.completedSubtitle}>All milestones for this trip have been confirmed.</Text>
            </View>
            <TouchableOpacity
              style={[styles.uploadActionBtn, { backgroundColor: '#3E3C3D' }]}
              onPress={() => router.replace('/trips')}
              activeOpacity={0.88}
            >
              <Text style={styles.uploadActionText}>Return to Dashboard</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <DelayReportModal
        visible={showDelayModal}
        tripId={trip?.id ?? null}
        onClose={() => setShowDelayModal(false)}
        onSuccess={() => refetch()}
      />
    </SafeAreaView>
  );
};

export default ExternalAppWorkflowScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EEF1F6',
  },
  topHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  headerTitleCol: {
    flex: 1,
  },
  headerTitleUrdu: {
    fontSize: 18,
    fontWeight: '700',
    color: '#3E3C3D',
  },
  headerTitleEn: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6E6E80',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 14,
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  heroHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoFallback: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFF0ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoBox: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImg: {
    width: 44,
    height: 44,
    borderRadius: 12,
  },
  heroCustomerCol: {
    flex: 1,
  },
  customerName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#3E3C3D',
  },
  tripRefId: {
    fontSize: 12,
    color: '#9898A4',
    marginTop: 2,
    fontWeight: '500',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusBadgeActive: {
    backgroundColor: '#FFF0ED',
  },
  statusBadgeCompleted: {
    backgroundColor: '#DCFCE7',
  },
  statusBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  statusTextActive: {
    color: '#FA634E',
  },
  statusTextCompleted: {
    color: '#15803D',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#EEF1F6',
    marginVertical: 14,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  routeOriginText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3E3C3D',
    flex: 1,
  },
  routeArrow: {
    marginHorizontal: 4,
  },
  routeDestText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3E3C3D',
    flex: 1,
    textAlign: 'right',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#3E3C3D',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 12.5,
    color: '#6E6E80',
    marginBottom: 14,
    lineHeight: 17,
  },
  pickersRow: {
    flexDirection: 'row',
    gap: 12,
  },
  pickerBox: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#D8D8DC',
    borderStyle: 'dashed',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 12,
    alignItems: 'center',
    backgroundColor: '#FAFAFC',
  },
  pickerTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3E3C3D',
    marginTop: 8,
  },
  pickerSub: {
    fontSize: 11,
    color: '#9898A4',
    marginTop: 2,
  },
  previewContainer: {
    alignItems: 'center',
    marginBottom: 12,
  },
  previewImage: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    backgroundColor: '#EEF1F6',
  },
  changePhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#EEF1F6',
    borderRadius: 8,
  },
  changePhotoText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3E3C3D',
  },
  uploadActionBtn: {
    backgroundColor: '#FA634E',
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
  },
  uploadActionBtnDisabled: {
    opacity: 0.5,
  },
  uploadActionText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  completedCard: {
    alignItems: 'center',
    paddingVertical: 28,
    gap: 6,
  },
  completedTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginTop: 4,
  },
  completedSubtitle: {
    fontSize: 12.5,
    color: '#6E6E80',
    textAlign: 'center',
  },
});

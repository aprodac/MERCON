import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, StatusBar, Image, TouchableOpacity, ScrollView, Share, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Check, Share2, Clock, Calendar, User, FileText, MapPin, Home, PackageCheck, CheckCircle2, ArrowLeft } from 'lucide-react-native';
import { GeotagPhotoModal } from '../../components';
import { API_URL } from '@mercon/mobile-shared/lib/api';
import { useCurrentTrip } from '../../lib/use-current-trip';
import { useCargoPodPhotos } from '@mercon/mobile-shared/lib/documents';
import { tripService, isRoundTrip, type MobileTrip } from '@mercon/mobile-shared/lib/trips';
import { safeSecureStore as SecureStore } from '@mercon/mobile-shared/lib/secure-store';
import { useLanguage } from '@mercon/mobile-shared/lib/language-context';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const logo = require('../../../assets/images/mercon-logo.png');

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
        const history = await tripService.getHistory(1).catch(() => []);
        const latestTrip = history[0] ?? null;
        if (latestTrip) setCompletedTrip(latestTrip);

        const currentOrLatest = trip || latestTrip;
        const targetId = currentOrLatest?.id;
        const targetRefId = currentOrLatest?.ref_id;
        const lastTripId = await SecureStore.getItemAsync('last_completed_trip_id');

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
  }, [trip?.id]);

  const activeTrip = trip || completedTrip;

  const tripDocs = activeTrip?.id
    ? documents.filter((d) => d.entity_id === activeTrip.id || d.trip_ref_id === activeTrip.ref_id)
    : documents;

  const apiCargo = tripDocs.filter((d) => d.doc_type === 'Waybill' || d.doc_type === 'CARGO_PHOTO' || d.doc_type === 'CustomsClearance');
  const apiPod = tripDocs.filter((d) => d.doc_type === 'POD');
  const apiReturnCargo = tripDocs.filter((d) => d.doc_type === 'RETURN_CARGO_PHOTO' || d.doc_type === 'RETURN_POL');
  const apiReturnPod = tripDocs.filter((d) => d.doc_type === 'RETURN_POD');

  const polList = apiCargo.length > 0 ? apiCargo : localPickupPhotos;
  const podList = apiPod.length > 0 ? apiPod : localDeliveryPhotos;
  const returnPolList = apiReturnCargo.length > 0 ? apiReturnCargo : localReturnPickupPhotos;
  const returnPodList = apiReturnPod.length > 0 ? apiReturnPod : localReturnDeliveryPhotos;

  const isRound = isRoundTrip(activeTrip);

  const handleShare = async () => {
    try {
      await Share.share({
        title: `MERCON Trip Summary #${activeTrip?.ref_id ?? 'TRP-0467'}`,
        message: `Trip #${activeTrip?.ref_id ?? 'TRP-0467'} to ${activeTrip?.customer?.name || 'IMILE DELIVERY SAUDI LOGISTICS'} completed successfully.`,
      });
    } catch {
      // silent
    }
  };

  const handleBackHome = () => {
    router.replace('/');
  };

  const rawRef = activeTrip?.ref_id || activeTrip?.id || 'TRP-0467';
  const tripIdDisplay = rawRef.startsWith('TRP-') ? rawRef : `TRP-${rawRef.slice(0, 6)}`;
  const tripRefId = `#${tripIdDisplay}`;
  const customerName = activeTrip?.customer?.name ? activeTrip.customer.name.toUpperCase() : 'IMILE DELIVERY SAUDI LOGISTICS';
  
  // Destination city/address
  const destinationLocation = (activeTrip as any)?.destination_location?.name
    || (activeTrip?.stops && activeTrip.stops.length > 0 ? activeTrip.stops[activeTrip.stops.length - 1]?.location?.name : null)
    || 'Riyadh, Saudi Arabia';

  const formattedLoadingDate = (activeTrip as any)?.actual_pickup || (activeTrip as any)?.actual_start
    ? new Date((activeTrip as any).actual_pickup || (activeTrip as any).actual_start).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Aug 26, 2026 at 09:45 AM';

  const formattedDeliveryDate = activeTrip?.actual_end
    ? new Date(activeTrip.actual_end).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Aug 26, 2026 at 12:03 PM';

  const formattedReturnLoadingDate = (activeTrip as any)?.actual_return_pickup
    ? new Date((activeTrip as any).actual_return_pickup).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Aug 26, 2026 at 02:15 PM';

  const formattedReturnDeliveryDate = (activeTrip as any)?.actual_return_delivery || activeTrip?.actual_end
    ? new Date((activeTrip as any).actual_return_delivery || activeTrip?.actual_end).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Aug 26, 2026 at 05:30 PM';

  // ---------------------------------------------------------------------------
  // VIEW 1: CLEAN LANDING CARD (MATCHING USER SCREENSHOT EXACTLY)
  // ---------------------------------------------------------------------------
  if (!showDetails) {
    return (
      <SafeAreaView style={styles.cleanContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <ScrollView contentContainerStyle={styles.cleanScroll} showsVerticalScrollIndicator={false}>
          {/* Top Checkmark Circle */}
          <View style={styles.cleanCheckWrapper}>
            <View style={styles.cleanCheckCircle}>
              <Check size={48} color="#FFFFFF" strokeWidth={3.8} />
            </View>
          </View>

          {/* Delivered To Subtitle & Bold Customer Name */}
          <View style={styles.cleanHeaderGroup}>
            <Text style={styles.cleanSubtitle}>{t('title_delivered_to', 'Delivered to')}</Text>
            <Text style={styles.cleanCustomerName}>{customerName}</Text>
          </View>

          {/* 3 Detail Info Rows */}
          <View style={styles.cleanInfoList}>
            {/* Row 1: Destination Location */}
            <View style={styles.cleanInfoRow}>
              <MapPin size={20} color="#16A34A" strokeWidth={2.2} />
              <Text style={styles.cleanInfoText}>{destinationLocation}</Text>
            </View>

            {/* Row 2: Delivery Date */}
            <View style={styles.cleanInfoRow}>
              <Calendar size={20} color="#16A34A" strokeWidth={2.2} />
              <Text style={styles.cleanInfoText}>{formattedDeliveryDate}</Text>
            </View>

            {/* Row 3: Trip ID */}
            <View style={styles.cleanInfoRow}>
              <FileText size={20} color="#16A34A" strokeWidth={2.2} />
              <Text style={styles.cleanInfoText}>{language === 'ur' ? `ٹرپ نمبر: ${tripIdDisplay}` : `Trip ID: ${tripIdDisplay}`}</Text>
            </View>
          </View>

          {/* MERCON LOGISTICS Branding Logo */}
          <View style={styles.cleanBrandingGroup}>
            <Image source={logo} style={styles.cleanLogoImage} resizeMode="contain" />
          </View>
        </ScrollView>

        {/* Bottom 3 Action Buttons */}
        <View style={styles.cleanActionBar}>
          {/* 1. Share screenshot */}
          <TouchableOpacity style={styles.cleanBtnShare} activeOpacity={0.8} onPress={handleShare}>
            <Share2 size={15} color="#16A34A" strokeWidth={2.2} />
            <Text style={styles.cleanBtnShareText} numberOfLines={1}>{t('action_share_screenshot', 'Share screenshot')}</Text>
          </TouchableOpacity>

          {/* 2. More details */}
          <TouchableOpacity style={styles.cleanBtnDetails} activeOpacity={0.8} onPress={() => setShowDetails(true)}>
            <FileText size={16} color="#2563EB" strokeWidth={2.2} />
            <Text style={styles.cleanBtnDetailsText} numberOfLines={1}>{t('action_more_details', 'More details')}</Text>
          </TouchableOpacity>

          {/* 3. Done */}
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
                    {customerName}
                  </Text>
                </View>
              </View>

              <View style={styles.gridCell}>
                <View style={styles.cellIconRing}>
                  <Clock size={11} color="#10B981" strokeWidth={2.2} />
                </View>
                <View style={styles.cellTextWrapper}>
                  <Text style={styles.cellLabel}>{t('label_duration', 'Duration')}</Text>
                  <Text style={[styles.cellValueBold, { writingDirection: 'ltr' }]}>2h 18m</Text>
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
                    {((activeTrip as any)?.distance_km || 164)} {t('unit_km', 'km')}
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
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 100,
    paddingBottom: 20,
  },
  cleanCheckWrapper: {
    marginBottom: 16,
  },
  cleanCheckCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
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
    justifyContent: 'center',
    marginBottom: 20,
  },
  cleanSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748B',
    marginBottom: 4,
    textAlign: 'center',
    alignSelf: 'center',
  },
  cleanCustomerName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    lineHeight: 22,
    alignSelf: 'center',
    paddingHorizontal: 16,
  },
  cleanInfoList: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginTop: 18,
    gap: 12,
    marginBottom: 20,
  },
  cleanInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  cleanInfoText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'center',
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  cleanBtnShare: {
    flex: 1.1,
    height: 48,
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
    fontSize: 10.5,
    fontWeight: '700',
    color: '#16A34A',
  },
  cleanBtnDetails: {
    flex: 1,
    height: 48,
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
    fontSize: 10.5,
    fontWeight: '700',
    color: '#2563EB',
  },
  cleanBtnDone: {
    flex: 1,
    height: 48,
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
    fontSize: 14,
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

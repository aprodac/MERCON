import React, { useRef, useState } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet, StatusBar, Share, ActivityIndicator, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { X, Share2, Image as ImageIcon, FileText } from 'lucide-react-native';
import { GoogleMapsGeotagPreview } from '../components/GoogleMapsGeotagPreview';
import { generateGeotaggedEvidenceImage } from '../utils/geotagImageGenerator';
import { useLanguage } from '@mercon/mobile-shared/lib/language-context';

export interface CargoPhotoPreviewScreenProps {
  photoUri?: string;
  locationName?: string;
  fullAddress?: string;
  companyName?: string;
  latitude?: number;
  longitude?: number;
  timestamp?: string;
  onClose?: () => void;
}

export const CargoPhotoPreviewScreen: React.FC<CargoPhotoPreviewScreenProps> = ({
  photoUri: propsUri,
  locationName: propsLoc,
  fullAddress: propsAddr,
  companyName: propsComp,
  latitude: propsLat,
  longitude: propsLng,
  timestamp: propsTime,
  onClose,
}) => {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const previewRef = useRef<View>(null);
  const { t } = useLanguage();

  const [sharing, setSharing] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  // Handle passed props or router params or fallback demo photo
  const photoUri = (params.photoUri as string) || propsUri || 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1200&q=80';
  const locationName = (params.locationName as string) || propsLoc || 'Up Hill, Malappuram, India';
  const fullAddress = (params.fullAddress as string) || propsAddr || 'Up Hill, Malappuram,\nKerala 676519, India';
  const companyName = (params.companyName as string) || propsComp || 'Horizon Distributors Co.';
  const latitude = params.latitude ? parseFloat(params.latitude as string) : (propsLat ?? 11.0467);
  const longitude = params.longitude ? parseFloat(params.longitude as string) : (propsLng ?? 76.0747);
  const timestamp = (params.timestamp as string) || propsTime || '2026-08-28T09:23:00.000Z';

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      router.back();
    }
  };

  const getSnapshotUri = async (): Promise<string> => {
    let snapshotUri: string | null = null;
    try {
      const viewShot = require('react-native-view-shot');
      if (viewShot && typeof viewShot.captureRef === 'function' && previewRef.current) {
        snapshotUri = await viewShot.captureRef(previewRef, {
          format: 'png',
          quality: 0.95,
          result: 'tmpfile',
        });
      }
    } catch (e) {
      // captureRef fallback
    }

    if (!snapshotUri) {
      try {
        snapshotUri = await generateGeotaggedEvidenceImage({
          photoUri,
          locationName,
          fullAddress,
          companyName,
          latitude,
          longitude,
          timestamp,
        });
      } catch (e) {
        snapshotUri = photoUri;
      }
    }
    return snapshotUri || photoUri;
  };

  // Option 1: Share Geotagged Evidence Image File (Creates real local file & attaches to native share sheet)
  const shareGeotaggedImage = async () => {
    setShowShareModal(false);
    if (sharing) return;
    try {
      setSharing(true);
      let targetUri = await getSnapshotUri();

      // Convert SVG data URI into a real local disk file for native sharing
      if (targetUri && targetUri.startsWith('data:image/svg+xml')) {
        try {
          const FileSystem = require('expo-file-system');
          const fileName = `cargo_geotag_evidence_${Date.now()}.svg`;
          const cacheFilePath = `${FileSystem.cacheDirectory}${fileName}`;
          const rawSvg = decodeURIComponent(targetUri.replace('data:image/svg+xml;utf8,', ''));
          await FileSystem.writeAsStringAsync(cacheFilePath, rawSvg, {
            encoding: FileSystem.EncodingType.UTF8,
          });
          targetUri = cacheFilePath;
        } catch (e) {
          console.warn('FileSystem write SVG error:', e);
        }
      }

      let sharedViaExpo = false;

      // 1. Try expo-sharing first
      try {
        const expoSharing = require('expo-sharing');
        if (expoSharing && typeof expoSharing.isAvailableAsync === 'function') {
          const available = await expoSharing.isAvailableAsync();
          if (available && typeof expoSharing.shareAsync === 'function') {
            await expoSharing.shareAsync(targetUri, {
              mimeType: targetUri.endsWith('.svg') ? 'image/svg+xml' : 'image/png',
              dialogTitle: 'Share MERCON Cargo Geotagged Evidence',
              UTI: targetUri.endsWith('.svg') ? 'public.svg-image' : 'public.png',
            });
            sharedViaExpo = true;
          }
        }
      } catch (e) {
        console.warn('expoSharing error:', e);
      }

      // 2. Fallback to native Share.share
      if (!sharedViaExpo) {
        await Share.share(
          {
            title: 'MERCON Geotagged Cargo Evidence',
            url: targetUri,
          },
          {
            dialogTitle: 'Share Geotagged Evidence Image',
            subject: 'MERCON Geotagged Cargo Evidence',
          }
        );
      }
    } catch (error) {
      console.warn('Share image error:', error);
    } finally {
      setSharing(false);
    }
  };

  // Option 2: Share Text Report with Google Maps Location Link
  const shareTextDetails = async () => {
    setShowShareModal(false);
    if (sharing) return;
    try {
      setSharing(true);
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
      const dateStr = new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
      const timeStr = new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

      const shareMessage = 
        `📷 MERCON CARGO PROOF OF EVIDENCE\n\n` +
        `🏢 Customer: ${companyName}\n` +
        `📍 Location: ${locationName}\n` +
        `📮 Address: ${fullAddress.replace(/\n/g, ' ')}\n` +
        `📅 Captured: ${dateStr} · ${timeStr}\n` +
        `🌐 GPS Coordinates: ${latitude.toFixed(4)}°N, ${longitude.toFixed(4)}°E\n\n` +
        `🗺️ Google Maps Location:\n${mapsUrl}`;

      await Share.share({
        title: 'MERCON Cargo Proof Evidence',
        message: shareMessage,
      });
    } catch (error) {
      console.warn('Share text error:', error);
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#3E3C3D" translucent />

      {/* DARK CHARCOAL TOP NAVIGATION BAR */}
      <View style={[styles.headerBar, { paddingTop: Math.max(insets.top + 8, 16) }]}>
        <TouchableOpacity
          style={styles.iconCircleBtn}
          activeOpacity={0.8}
          onPress={handleClose}
        >
          <X size={18} color="#FFFFFF" strokeWidth={2.4} />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>{t('title_cargo_photo_preview', 'Cargo Photo Preview')}</Text>

        <TouchableOpacity
          style={styles.iconCircleBtn}
          activeOpacity={0.8}
          onPress={() => setShowShareModal(true)}
          disabled={sharing}
        >
          {sharing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Share2 size={18} color="#FFFFFF" strokeWidth={2.4} />
          )}
        </TouchableOpacity>
      </View>

      {/* PHOTO & GEOTAG EVIDENCE VIEWPORT (Uncropped photo on top + geotag panel directly below) */}
      <View
        ref={previewRef}
        style={styles.photoViewport}
        collapsable={false}
      >
        {/* Top: Full Uncropped Photo Container */}
        <View style={styles.photoFrame}>
          <Image
            source={{ uri: photoUri }}
            style={styles.dominantPhoto}
            resizeMode="cover"
          />
        </View>

        {/* Bottom: Solid White Edge-to-Edge Geotag Metadata Panel */}
        <View style={styles.edgeToEdgePanelWrapper}>
          <GoogleMapsGeotagPreview
            latitude={latitude}
            longitude={longitude}
            timestamp={timestamp}
            locationName={locationName}
            fullAddress={fullAddress}
            companyName={companyName}
            bottomPadding={Math.max(insets.bottom + 10, 16)}
          />
        </View>
      </View>

      {/* SHARE OPTIONS ACTION SHEET MODAL */}
      <Modal
        visible={showShareModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowShareModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowShareModal(false)}
        >
          <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom + 16, 24) }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('title_share_evidence', 'Share Evidence')}</Text>
              <TouchableOpacity onPress={() => setShowShareModal(false)} style={styles.modalCloseBtn}>
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.optionBtnPrimary}
              activeOpacity={0.85}
              onPress={shareGeotaggedImage}
            >
              <View style={styles.optionIconContainer}>
                <ImageIcon size={22} color="#FFFFFF" />
              </View>
              <View style={styles.optionTextWrapper}>
                <Text style={styles.optionTitlePrimary}>{t('action_share_geotagged', 'Share Geotagged Image')}</Text>
                <Text style={styles.optionSubPrimary}>{t('desc_share_geotagged', 'Sends the photo + geotag card image directly to WhatsApp/Messages')}</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.optionBtnSecondary}
              activeOpacity={0.85}
              onPress={shareTextDetails}
            >
              <View style={styles.optionIconContainerSec}>
                <FileText size={22} color="#FA634E" />
              </View>
              <View style={styles.optionTextWrapper}>
                <Text style={styles.optionTitleSec}>{t('action_share_text_link', 'Share Text & Location Link')}</Text>
                <Text style={styles.optionSubSec}>{t('desc_share_text_link', 'Sends formatted text report with live Google Maps GPS link')}</Text>
              </View>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

export default CargoPhotoPreviewScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#3E3C3D',
  },
  headerBar: {
    backgroundColor: '#3E3C3D',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    zIndex: 30,
  },
  iconCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  photoViewport: {
    flex: 1,
    flexDirection: 'column',
    backgroundColor: '#3E3C3D',
  },
  photoFrame: {
    flex: 1,
    width: '100%',
    backgroundColor: '#1E293B',
    overflow: 'hidden',
  },
  dominantPhoto: {
    width: '100%',
    height: '100%',
    opacity: 1,
  },
  edgeToEdgePanelWrapper: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalCloseBtn: {
    padding: 4,
  },
  optionBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FA634E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    gap: 14,
  },
  optionIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTextWrapper: {
    flex: 1,
  },
  optionTitlePrimary: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  optionSubPrimary: {
    fontSize: 11.5,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 2,
    fontWeight: '500',
  },
  optionBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF5F3',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FED7AA',
    gap: 14,
  },
  optionIconContainerSec: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFE4E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTitleSec: {
    fontSize: 15,
    fontWeight: '800',
    color: '#3E3C3D',
  },
  optionSubSec: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
});

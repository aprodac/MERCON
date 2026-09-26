/**
 * In-app camera for the three Loading / Delivery photos. Unlike the phone's
 * own camera it stays open between shots, shows "Photo 2 of 3", the upload
 * bar, the photos taken so far, and a small Gallery tab next to the shutter.
 * Closes itself once all photos are in (the parent sets `visible`).
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Images, X } from 'lucide-react-native';
import {
  getDeviceLocationTag,
  pickFromGallery,
  preparePhoto,
  type CapturedPhoto,
} from '@mercon/mobile-shared/lib/camera';
import { useLanguage } from '@mercon/mobile-shared/lib/language-context';
import { UploadProgressBar, type UploadItem } from './UploadProgressBar';

interface Props {
  visible: boolean;
  photos: CapturedPhoto[];
  uploads: UploadItem[];
  total?: number;
  accent: string;
  onPhoto: (photo: CapturedPhoto) => void;
  onClose: () => void;
}

export function PhotoCaptureModal({ visible, photos, uploads, total = 3, accent, onPhoto, onClose }: Props) {
  const { language } = useLanguage();
  const ur = language === 'ur';
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cameraFailed, setCameraFailed] = useState(false);

  useEffect(() => {
    if (visible && permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [visible, permission, requestPermission]);

  const handleClose = () => {
    setReady(false);
    onClose();
  };

  const shoot = async () => {
    if (!cameraRef.current || !ready || busy) return;
    setBusy(true);
    try {
      const location = getDeviceLocationTag();
      const pic = await cameraRef.current.takePictureAsync({ quality: 1, exif: false, shutterSound: true });
      if (pic?.uri) onPhoto(await preparePhoto(pic.uri, location));
    } catch (err) {
      console.warn('Camera capture failed:', err);
    } finally {
      setBusy(false);
    }
  };

  const fromGallery = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const photo = await pickFromGallery();
      if (photo) onPhoto(photo);
    } catch (err) {
      console.warn('Gallery pick failed:', err);
    } finally {
      setBusy(false);
    }
  };

  const shotNumber = Math.min(photos.length + 1, total);
  const canUseCamera = !!permission?.granted && !cameraFailed;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose} statusBarTranslucent>
      <View style={styles.root}>
        {canUseCamera && visible ? (
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing="back"
            onCameraReady={() => setReady(true)}
            onMountError={() => setCameraFailed(true)}
          />
        ) : (
          <View style={styles.noCamera}>
            <Text style={styles.noCameraText}>
              {permission && !permission.granted
                ? (ur ? 'تصاویر لینے کے لیے کیمرے کی اجازت دیں' : 'Allow camera access to take trip photos')
                : cameraFailed
                  ? (ur ? 'کیمرہ نہیں کھل سکا — گیلری سے تصویر لیں' : "Camera couldn't start — use the gallery")
                  : ''}
            </Text>
            {permission && !permission.granted && permission.canAskAgain ? (
              <TouchableOpacity style={[styles.permBtn, { backgroundColor: accent }]} onPress={requestPermission}>
                <Text style={styles.permBtnText}>{ur ? 'اجازت دیں' : 'Allow camera'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        <SafeAreaView style={styles.overlay} edges={['top', 'bottom']} pointerEvents="box-none">
          {/* Top: close + counter */}
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.roundBtn} onPress={handleClose} accessibilityLabel={ur ? 'بند کریں' : 'Close camera'}>
              <X size={22} color="#FFFFFF" strokeWidth={2.4} />
            </TouchableOpacity>
            <View style={styles.counterPill}>
              <Text style={styles.counterText}>
                {ur ? `تصویر ${shotNumber} از ${total}` : `Photo ${shotNumber} of ${total}`}
              </Text>
            </View>
            <View style={styles.roundBtnSpacer} />
          </View>

          <View style={styles.bottom}>
            {/* Upload bar */}
            {uploads.length > 0 ? (
              <View style={styles.barCard}>
                <UploadProgressBar items={uploads} total={total} accent={accent} />
              </View>
            ) : null}

            {/* Photos taken so far */}
            <View style={styles.thumbRow}>
              {Array.from({ length: total }).map((_, i) => (
                <View key={i} style={[styles.thumb, i === photos.length && { borderColor: '#FFFFFF' }]}>
                  {photos[i] ? (
                    <Image source={{ uri: photos[i].uri }} style={styles.thumbImg} />
                  ) : (
                    <Text style={styles.thumbNum}>{i + 1}</Text>
                  )}
                </View>
              ))}
            </View>

            {/* Gallery tab · shutter · spacer */}
            <View style={styles.controls}>
              <TouchableOpacity
                style={styles.galleryTab}
                onPress={fromGallery}
                disabled={busy}
                accessibilityLabel={ur ? 'گیلری سے منتخب کریں' : 'Choose from gallery'}
              >
                <Images size={22} color="#FFFFFF" strokeWidth={2} />
                <Text style={styles.galleryText}>{ur ? 'گیلری' : 'Gallery'}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.shutter, (!canUseCamera || !ready) && styles.shutterDisabled]}
                onPress={shoot}
                disabled={!canUseCamera || !ready || busy}
                accessibilityLabel={ur ? 'تصویر لیں' : 'Take photo'}
              >
                <View style={styles.shutterInner}>
                  {busy ? <ActivityIndicator color={accent} /> : null}
                </View>
              </TouchableOpacity>

              <View style={styles.controlSpacer} />
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  overlay: { ...StyleSheet.absoluteFill, justifyContent: 'space-between' },
  noCamera: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  noCameraText: { color: '#E2E8F0', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  permBtn: { paddingHorizontal: 22, paddingVertical: 12, borderRadius: 12 },
  permBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },

  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  roundBtn: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  roundBtnSpacer: { width: 44 },
  counterPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.55)' },
  counterText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },

  bottom: { paddingHorizontal: 16, paddingBottom: 16, gap: 14 },
  barCard: { backgroundColor: '#FFFFFF', borderRadius: 14, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 0 },
  thumbRow: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  thumb: {
    width: 56, height: 56, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)',
  },
  thumbImg: { width: '100%', height: '100%' },
  thumbNum: { color: 'rgba(255,255,255,0.8)', fontSize: 16, fontWeight: '800' },

  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  galleryTab: {
    width: 64, height: 64, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 2,
    backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
  },
  galleryText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  shutter: {
    width: 80, height: 80, borderRadius: 40, borderWidth: 5, borderColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  shutterDisabled: { opacity: 0.4 },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  controlSpacer: { width: 64 },
});

import React, { useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { X, Video, Film, AlertTriangle, CheckCircle2, Trash2, MapPin } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography, Shadows } from '@mercon/mobile-shared/theme/tokens';
import { Button } from '@mercon/mobile-shared/components/Button';
import { captureVideo, pickVideoFromGallery, type CapturedMedia } from '@mercon/mobile-shared/lib/camera';
import { tripService } from '@mercon/mobile-shared/lib/trips';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { GoogleMapsGeotagPreview } from './GoogleMapsGeotagPreview';
import { useLanguage } from '@mercon/mobile-shared/lib/language-context';

const REASON_PRESETS = [
  { id: 'traffic', labelKey: 'delay_heavy_traffic', defaultLabel: 'Heavy Traffic / Jam', icon: '🚦' },
  { id: 'road_closure', labelKey: 'delay_road_closure', defaultLabel: 'Road Closure / Construction', icon: '🚧' },
  { id: 'dock_wait', labelKey: 'delay_dock_wait', defaultLabel: 'Loading Dock Queue / Wait', icon: '🚛' },
  { id: 'vehicle_breakdown', labelKey: 'delay_vehicle_breakdown', defaultLabel: 'Vehicle Technical Issue', icon: '🛠️' },
  { id: 'customs', labelKey: 'delay_customs', defaultLabel: 'Customs / Border Clearance', icon: '📑' },
  { id: 'weather', labelKey: 'delay_weather', defaultLabel: 'Bad Weather Conditions', icon: '🌧️' },
];

interface DelayReportModalProps {
  visible: boolean;
  tripId: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function DelayReportModal({ visible, tripId, onClose, onSuccess }: DelayReportModalProps) {
  const { t } = useLanguage();
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [customNotes, setCustomNotes] = useState('');
  const [media, setMedia] = useState<CapturedMedia | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'media' | 'details'>('media');

  const handlePickMedia = async (kind: 'video' | 'gallery') => {
    try {
      let res: CapturedMedia | null = null;
      if (kind === 'video') {
        res = await captureVideo();
      } else {
        res = await pickVideoFromGallery();
      }
      if (res) {
        setMedia(res);
        setStep('details');
      }
    } catch (e) {
      Alert.alert(t('err_camera_title', 'Video Capture Error'), getApiErrorMessage(e));
    }
  };

  const handleReset = () => {
    setSelectedReason(null);
    setCustomNotes('');
    setMedia(null);
    setLoading(false);
    setStep('media');
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!tripId) return;
    setLoading(true);
    try {
      // Build final delay reason text
      const finalReason = [
        selectedReason ? REASON_PRESETS.find((r) => r.id === selectedReason)?.defaultLabel : null,
        customNotes.trim() ? customNotes.trim() : null,
      ].filter(Boolean).join(' - ') || 'Driver reported delay';

      // 1. Upload video evidence if attached
      if (media) {
        await tripService.uploadPhoto(
          tripId,
          'cargo',
          {
            uri: media.uri,
            mimeType: media.mimeType ?? 'video/mp4',
            fileName: media.fileName ?? 'delay-video.mp4',
            location: media.location,
          },
          undefined,
          'delay'
        );
      }

      // 2. Update trip status to Delayed with reason
      // Reason goes in the reason slot — the third argument is the workflow state.
      await tripService.updateStatus(tripId, 'Delayed', undefined, finalReason);

      Alert.alert(t('status_delayed', 'Delay Reported'), t('msg_delay_submitted', 'Your delay report has been submitted to dispatch.'));
      handleClose();
      onSuccess();
    } catch (e) {
      Alert.alert(t('err_something_went_wrong', 'Could Not Report Delay'), getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <AlertTriangle size={20} color="#D97706" strokeWidth={2.2} />
              <Text style={styles.title}>{t('title_report_delay', 'Report Trip Delay')}</Text>
            </View>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn} hitSlop={10}>
              <X size={20} color={Colors.gray500} strokeWidth={2.2} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
            {/* STEP 1: CAPTURE MEDIA EVIDENCE (VIDEO ONLY) */}
            {step === 'media' && (
              <View style={styles.stepBlock}>
                <Text style={styles.stepTitle}>{t('step_record_video', '1. Record Delay Video')}</Text>
                <Text style={styles.stepSub}>{t('step_record_video_desc', 'Record a video of the delay (e.g. traffic, breakdown, wait time).')}</Text>

                <View style={styles.mediaActionGrid}>
                  <TouchableOpacity style={styles.mediaBtn} activeOpacity={0.8} onPress={() => handlePickMedia('video')}>
                    <Video size={28} color="#7C3AED" strokeWidth={2.2} />
                    <Text style={styles.mediaBtnText}>{t('action_record_video', 'Record Video')}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.mediaBtn} activeOpacity={0.8} onPress={() => handlePickMedia('gallery')}>
                    <Film size={28} color="#0284C7" strokeWidth={2.2} />
                    <Text style={styles.mediaBtnText}>{t('action_video_gallery', 'Video Gallery')}</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity style={styles.skipBtn} onPress={() => setStep('details')}>
                  <Text style={styles.skipBtnText}>{t('action_skip_video', 'Skip Video (Proceed to Reason) →')}</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* STEP 2: REASON SELECTION & OPTIONAL CUSTOM TYPING */}
            {step === 'details' && (
              <View style={styles.stepBlock}>
                {media && (
                  <View style={styles.mediaPreviewCard}>
                    <View style={styles.mediaPreviewLeft}>
                      <View style={styles.videoIconBox}>
                        <Video size={22} color="#7C3AED" strokeWidth={2.2} />
                      </View>
                      <View>
                        <Text style={styles.mediaPreviewTitle}>{t('title_video_recorded', 'Delay Video Recorded')}</Text>
                        {!!media.location && (
                          <GoogleMapsGeotagPreview
                            latitude={media.location.latitude}
                            longitude={media.location.longitude}
                            timestamp={media.location.timestamp}
                            address={media.location.address}
                          />
                        )}
                        <Text style={styles.mediaPreviewSub}>{t('action_remove_video', 'Tap trash to remove')}</Text>
                      </View>
                    </View>
                    <TouchableOpacity onPress={() => setMedia(null)} hitSlop={8}>
                      <Trash2 size={18} color={Colors.danger} />
                    </TouchableOpacity>
                  </View>
                )}

                <Text style={styles.stepTitle}>{t('step_select_reason', '2. Select Delay Reason')}</Text>
                <View style={styles.presetsGrid}>
                  {REASON_PRESETS.map((preset) => {
                    const selected = selectedReason === preset.id;
                    return (
                      <TouchableOpacity
                        key={preset.id}
                        style={[styles.presetChip, selected && styles.presetChipSelected]}
                        activeOpacity={0.8}
                        onPress={() => setSelectedReason(selected ? null : preset.id)}
                      >
                        <Text style={styles.presetIcon}>{preset.icon}</Text>
                        <Text style={[styles.presetLabel, selected && styles.presetLabelSelected]}>
                          {t(preset.labelKey, preset.defaultLabel)}
                        </Text>
                        {selected && <CheckCircle2 size={14} color={Colors.primary} style={styles.checkIcon} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={styles.inputLabel}>{t('label_custom_delay_notes', 'Additional Notes / Custom Reason (Optional)')}</Text>
                <TextInput
                  style={styles.textInput}
                  value={customNotes}
                  onChangeText={setCustomNotes}
                  placeholder={t('placeholder_delay_notes', 'Type extra notes or custom reason (optional)...')}
                  placeholderTextColor={Colors.gray400}
                  multiline
                  numberOfLines={3}
                />
              </View>
            )}
          </ScrollView>

          {/* Footer Actions */}
          {step === 'details' && (
            <View style={styles.footer}>
              <Button
                title={loading ? (media ? t('msg_uploading_video', 'Uploading Video…') : t('msg_submitting_delay', 'Submitting…')) : t('action_submit_delay', 'Submit Delay Report')}
                onPress={handleSubmit}
                disabled={loading}
                size="lg"
                style={styles.submitBtn}
              />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
    maxHeight: '88%',
    paddingBottom: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md + 2,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs + 2,
  },
  title: {
    fontSize: Typography.base,
    fontWeight: '700',
    color: Colors.gray900,
  },
  closeBtn: {
    padding: Spacing.xs,
  },
  body: {
    maxHeight: 460,
  },
  bodyContent: {
    padding: Spacing.lg,
  },
  stepBlock: {
    gap: Spacing.md,
  },
  stepTitle: {
    fontSize: Typography.sm,
    fontWeight: '700',
    color: Colors.gray900,
  },
  stepSub: {
    fontSize: Typography.xs,
    color: Colors.gray500,
    marginTop: -Spacing.xs,
  },
  mediaActionGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  mediaBtn: {
    flex: 1,
    backgroundColor: Colors.gray100,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  mediaBtnText: {
    fontSize: Typography.xs,
    fontWeight: '700',
    color: Colors.gray900,
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    marginTop: Spacing.xs,
  },
  skipBtnText: {
    fontSize: Typography.xs,
    fontWeight: '600',
    color: Colors.gray500,
  },
  mediaPreviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.xs,
  },
  mediaPreviewLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  videoIconBox: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    backgroundColor: '#F3E8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaPreviewTitle: {
    fontSize: Typography.xs,
    fontWeight: '700',
    color: '#166534',
  },
  mediaPreviewSub: {
    fontSize: 10,
    color: '#15803D',
  },
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs + 2,
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray100,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderWidth: 1,
    borderColor: Colors.gray200,
    gap: 6,
  },
  presetChipSelected: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  presetIcon: {
    fontSize: 14,
  },
  presetLabel: {
    fontSize: Typography.xs,
    fontWeight: '600',
    color: Colors.gray700,
  },
  presetLabelSelected: {
    color: Colors.primaryDark,
    fontWeight: '700',
  },
  checkIcon: {
    marginLeft: 2,
  },
  inputLabel: {
    fontSize: Typography.xs,
    fontWeight: '700',
    color: Colors.gray700,
    marginTop: Spacing.xs,
  },
  textInput: {
    backgroundColor: Colors.gray100,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    fontSize: Typography.xs,
    color: Colors.gray900,
    minHeight: 70,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
  },
  submitBtn: {
    borderRadius: Radius.xl,
  },
  geoTagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: Radius.xs ?? 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginTop: 2,
    alignSelf: 'flex-start',
  },
  geoTagBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#047857',
  },
});

import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, StatusBar, Image, Alert, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import {
  ArrowLeft, Phone, Camera, MapPin, Zap, Wrench, Hospital, Shield, PenLine,
  type LucideIcon,
} from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography, Shadows } from '@mercon/mobile-shared/theme/tokens';
import { Button } from '@mercon/mobile-shared/components/Button';
import { emergencyService, type EmergencyContact } from '../services/emergency';
import { showToast } from '../components/AppToast';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { takePhoto, pickFromGallery, type CapturedPhoto } from '@mercon/mobile-shared/lib/camera';

import { useLanguage } from '@mercon/mobile-shared/lib/language-context';

/** `p`, or null if it has not settled within `ms`. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    p.then((v) => { clearTimeout(timer); resolve(v); }, () => { clearTimeout(timer); resolve(null); });
  });
}

const EmergencyScreen = () => {
  const router = useRouter();
  const { t } = useLanguage();
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<(CapturedPhoto | undefined)[]>([]);
  const [incidentType, setIncidentType] = useState('');
  const [sending, setSending] = useState(false);
  const [sentAt, setSentAt] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  // Real operator number from the server (this used to dial a made-up
  // +966 11 234 5678). undefined = still loading, null = nobody on file.
  const [contact, setContact] = useState<EmergencyContact | null | undefined>(undefined);

  useEffect(() => {
    emergencyService.getContact().then(setContact).catch(() => setContact(null));
  }, []);

  const incidentTypes: { id: string; labelKey: string; defaultLabel: string; Icon: LucideIcon }[] = [
    { id: 'accident', labelKey: 'incident_accident', defaultLabel: 'Road Accident', Icon: Zap },
    { id: 'breakdown', labelKey: 'incident_breakdown', defaultLabel: 'Vehicle Breakdown', Icon: Wrench },
    { id: 'medical', labelKey: 'incident_medical', defaultLabel: 'Medical Emergency', Icon: Hospital },
    { id: 'security', labelKey: 'incident_security', defaultLabel: 'Security Threat', Icon: Shield },
  ];

  const callOperator = () => {
    if (!contact) {
      showToast(
        contact === undefined
          ? t('msg_loading_operator_number', 'Getting your operator\'s number…')
          : t('msg_no_operator_number', 'No operator phone on file. Send the report below — every operator is alerted.'),
        'info',
      );
      return;
    }
    Linking.openURL(`tel:${contact.phone.replace(/\s+/g, '')}`).catch(() => {
      Alert.alert(t('title_emergency_call_failed', 'Could not place call'), t('msg_call_operator_manual', 'Please dial the operator manually.'));
    });
  };

  const addPhoto = async (index: number, source: 'camera' | 'gallery' = 'camera') => {
    try {
      // Camera opens straight away; long-press a box for the gallery.
      const photo = source === 'gallery' ? await pickFromGallery() : await takePhoto();
      if (!photo) return;
      setPhotos((prev) => {
        const next = [...prev];
        next[index] = photo;
        return next;
      });
    } catch (e) {
      Alert.alert(t('title_emergency_call_failed', 'Could not add photo'), getApiErrorMessage(e));
    }
  };

  const send = async () => {
    if (sending || sentAt) return;
    const selected = incidentTypes.find((t) => t.id === incidentType);
    if (!selected) {
      showToast(t('msg_select_incident_desc', 'Please choose what kind of emergency this is.'), 'info');
      return;
    }
    setSending(true);
    try {
      // Best-effort GPS attach — never block sending the alert on location.
      let lat: number | undefined;
      let lng: number | undefined;
      // Never hold an emergency up for GPS: last known position first, a fresh
      // fix only if it arrives within 4 s (a high-accuracy fix used to be
      // awaited with no limit, which could take 10+ s indoors).
      const pos = await withTimeout(
        (async () => {
          const perm = await Location.requestForegroundPermissionsAsync();
          if (!perm.granted) return null;
          return (
            (await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 })) ??
            (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }))
          );
        })().catch(() => null),
        4000,
      );
      if (pos) {
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      }

      const { notified } = await emergencyService.raise({
        incident_type: selected.defaultLabel,
        notes: notes.trim() || undefined,
        lat,
        lng,
        photos: photos.filter((p): p is CapturedPhoto => !!p),
      });
      // Stay on the screen: the confirmation replaces the pop-up, and the
      // driver can still call the operator.
      setSentAt(new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }));
      showToast(
        notified > 0
          ? t('msg_emergency_notified', 'Your operator has been alerted.')
          : t('msg_emergency_recorded', 'Your report was recorded.'),
      );
    } catch (e) {
      Alert.alert(t('title_emergency_call_failed', 'Could not send'), getApiErrorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.error} />

      {/* Header — kept short so the call button is right there */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} activeOpacity={0.8} onPress={() => router.back()}>
          <ArrowLeft size={22} color={Colors.white} strokeWidth={2.2} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>{t('title_emergency', 'Emergency')}</Text>
          <Text style={styles.headerSub}>{t('msg_operator_alerted_sub', 'Your operator will be alerted immediately')}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {sentAt ? (
          <View style={styles.sentBanner}>
            <Text style={styles.sentTitle}>{t('title_emergency_sent_at', 'Report sent at')} {sentAt}</Text>
            <Text style={styles.sentSub}>{t('msg_emergency_sent_sub', 'Your operator has been alerted. Keep your phone with you.')}</Text>
          </View>
        ) : null}

        {/* 1. Call */}
        <TouchableOpacity style={styles.callBtn} activeOpacity={0.85} onPress={callOperator}>
          <Phone size={24} color={Colors.white} strokeWidth={2.4} />
          <View style={styles.callTextCol}>
            <Text style={styles.callText}>{t('action_call_operator', 'Call operator')}</Text>
            <Text style={[styles.callSub, { writingDirection: 'ltr' }]} numberOfLines={1}>
              {contact
                ? `${contact.name ? `${contact.name} · ` : ''}${contact.phone}`
                : contact === null
                ? t('msg_no_operator_number_short', 'No operator phone on file')
                : '…'}
            </Text>
          </View>
        </TouchableOpacity>

        {/* 2. What happened — one tap */}
        <Text style={styles.sectionTitle}>{t('title_what_happened', 'What happened?')}</Text>
        <View style={styles.typeList}>
          {incidentTypes.map((type) => {
            const on = incidentType === type.id;
            return (
              <TouchableOpacity
                key={type.id}
                style={[styles.typeRow, on && styles.typeRowOn]}
                activeOpacity={0.8}
                onPress={() => setIncidentType(type.id)}
              >
                <type.Icon size={22} color={on ? Colors.error : Colors.gray600} strokeWidth={2} />
                <Text style={[styles.typeLabel, on && styles.typeLabelOn]}>{t(type.labelKey, type.defaultLabel)}</Text>
                <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* 3. Optional extras, kept small */}
        <View style={styles.extrasRow}>
          <TouchableOpacity
            style={styles.extraBtn}
            activeOpacity={0.8}
            onPress={() => addPhoto(photos.filter(Boolean).length)}
            onLongPress={() => addPhoto(photos.filter(Boolean).length, 'gallery')}
            disabled={photos.filter(Boolean).length >= 4}
          >
            <Camera size={18} color={Colors.gray600} strokeWidth={2} />
            <Text style={styles.extraText}>
              {photos.filter(Boolean).length > 0
                ? `${t('action_add_photo', 'Add photo')} (${photos.filter(Boolean).length}/4)`
                : t('action_add_photo', 'Add photo')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.extraBtn} activeOpacity={0.8} onPress={() => setShowNotes(true)}>
            <PenLine size={18} color={Colors.gray600} strokeWidth={2} />
            <Text style={styles.extraText}>{t('action_add_note', 'Add note')}</Text>
          </TouchableOpacity>
        </View>

        {photos.some(Boolean) ? (
          <View style={styles.thumbRow}>
            {photos.filter((p): p is CapturedPhoto => !!p).map((p, i) => (
              <Image key={`${p.uri}-${i}`} source={{ uri: p.uri }} style={styles.thumb} />
            ))}
          </View>
        ) : null}

        {showNotes || notes ? (
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder={t('placeholder_incident_notes_short', 'Where are you? Is anyone hurt?')}
            placeholderTextColor={Colors.gray400}
            multiline
            autoFocus={showNotes && !notes}
            textAlignVertical="top"
          />
        ) : null}
      </ScrollView>

      {/* Always visible */}
      <View style={styles.sendBar}>
        <Button
          title={
            sentAt
              ? t('action_report_sent', 'Report sent')
              : sending
              ? t('action_sending', 'Sending…')
              : t('action_send_emergency', 'Send Emergency Report')
          }
          onPress={send}
          disabled={!!sentAt || sending}
          style={styles.sendBtn}
        />
        <View style={styles.locationLine}>
          <MapPin size={13} color={Colors.gray500} strokeWidth={2} />
          <Text style={styles.locationLineText}>{t('msg_location_sent_auto', 'Your location is sent automatically')}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.error,
  },
  header: {
    backgroundColor: Colors.error,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: Typography.xl,
    fontWeight: '800',
    color: Colors.white,
  },
  headerSub: {
    fontSize: Typography.xs,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  scroll: {
    flexGrow: 1,
    backgroundColor: Colors.gray100,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  sentBanner: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#16A34A',
    borderRadius: Radius.xl,
    padding: Spacing.md,
    gap: 2,
  },
  sentTitle: {
    fontSize: Typography.base,
    fontWeight: '800',
    color: '#14532D',
  },
  sentSub: {
    fontSize: Typography.xs,
    color: '#166534',
  },
  callBtn: {
    backgroundColor: Colors.error,
    borderRadius: Radius.xl,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    ...Shadows.md,
  },
  callTextCol: {
    flex: 1,
  },
  callText: {
    fontSize: Typography.lg,
    fontWeight: '800',
    color: Colors.white,
  },
  callSub: {
    fontSize: Typography.sm,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: Typography.base,
    fontWeight: '800',
    color: Colors.gray900,
    marginTop: Spacing.xs,
  },
  typeList: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  typeRowOn: {
    backgroundColor: '#FEF2F2',
  },
  typeLabel: {
    flex: 1,
    fontSize: Typography.base,
    fontWeight: '600',
    color: Colors.gray900,
  },
  typeLabelOn: {
    color: Colors.error,
    fontWeight: '800',
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.gray400,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: {
    borderColor: Colors.error,
  },
  radioDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: Colors.error,
  },
  extrasRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  extraBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    minHeight: 46,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.gray200,
    backgroundColor: Colors.white,
  },
  extraText: {
    fontSize: Typography.sm,
    fontWeight: '700',
    color: Colors.gray600,
  },
  thumbRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray200,
  },
  notesInput: {
    minHeight: 84,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.gray200,
    padding: Spacing.md,
    fontSize: Typography.sm,
    color: Colors.gray900,
  },
  sendBar: {
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.gray200,
    gap: Spacing.xs,
  },
  sendBtn: {
    backgroundColor: Colors.error,
  },
  locationLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  locationLineText: {
    fontSize: Typography.xs,
    color: Colors.gray500,
  },
});

export default EmergencyScreen;

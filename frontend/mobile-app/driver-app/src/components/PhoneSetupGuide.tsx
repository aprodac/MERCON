/**
 * First-run phone setup — shown right after sign-in (and on every app open
 * until done) so a driver's phone can actually receive trips and share trip
 * location:
 *   1. Notifications allowed
 *   2. Location allowed (while using the app — enough for the trip service)
 *   3. Android battery optimisation off for MERCON (detected)
 *   4. The phone maker's own background / auto-launch switch (cannot be
 *      detected — the driver confirms it once on this install)
 *
 * Why 3 and 4: on a Realme phone the battery manager froze the swiped-away app;
 * a "Trip Assigned" push then arrived ~6 minutes late and Google Play services
 * was killed mid-trip, stopping trip GPS. Pushes sent while the phone was on
 * the USB cable (charging, never asleep) all arrived instantly.
 *
 * Permission prompts are only shown when the driver taps a button: on Android
 * a permission request pauses and resumes the app, so asking on its own would
 * loop with the "check again when the app comes back" logic.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Battery from 'expo-battery';
import * as Device from 'expo-device';
import * as Location from 'expo-location';
import { BatteryCharging, Bell, CheckCircle2, MapPin, Smartphone } from 'lucide-react-native';
import { useLanguage } from '@mercon/mobile-shared/lib/language-context';
import { safeSecureStore as SecureStore } from '@mercon/mobile-shared/lib/secure-store';
import { Colors, Radius, Shadows, Spacing, Typography } from '@mercon/mobile-shared/theme/tokens';
import { reportPhoneHealth } from '@/services/phoneHealth';

let Notifications: typeof import('expo-notifications') | null = null;
try {
  Notifications = require('expo-notifications');
} catch {
  // Native module unavailable — the notification step is skipped.
}

/** Set once the driver confirms the phone maker's background setting on this install. */
const MAKER_SETUP_KEY = 'phone_setup_maker_confirmed_v1';

type MakerFamily = 'oppo' | 'xiaomi' | 'vivo' | 'huawei' | 'samsung' | 'other';

function makerFamily(): MakerFamily {
  const m = `${Device.manufacturer ?? ''} ${Device.brand ?? ''}`.toLowerCase();
  if (/realme|oppo|oneplus/.test(m)) return 'oppo';
  if (/xiaomi|redmi|poco/.test(m)) return 'xiaomi';
  if (/vivo|iqoo/.test(m)) return 'vivo';
  if (/huawei|honor/.test(m)) return 'huawei';
  if (/samsung/.test(m)) return 'samsung';
  return 'other';
}

const MAKER_STEPS: Record<MakerFamily, { key: string; en: string }> = {
  oppo: {
    key: 'setup_maker_oppo',
    en: 'Tap "Open app settings" → Battery usage → turn ON "Allow background activity" and "Allow auto startup" (may be called "Allow auto launch").',
  },
  xiaomi: {
    key: 'setup_maker_xiaomi',
    en: 'Tap "Open app settings" → turn ON "Autostart", then Battery saver → choose "No restrictions".',
  },
  vivo: {
    key: 'setup_maker_vivo',
    en: 'Tap "Open app settings" → Battery → allow "High background power consumption", and turn ON Auto-start.',
  },
  huawei: {
    key: 'setup_maker_huawei',
    en: 'Tap "Open app settings" → App launch → turn OFF "Manage automatically", then allow Auto-launch and Run in background.',
  },
  samsung: {
    key: 'setup_maker_samsung',
    en: 'Tap "Open app settings" → Battery → choose "Unrestricted".',
  },
  other: {
    key: 'setup_maker_other',
    en: 'Tap "Open app settings" → Battery → allow background activity (or choose "Unrestricted").',
  },
};

interface SetupState {
  notif: boolean;
  location: boolean;
  /** true = Android is still optimising (restricting) MERCON's battery use. */
  batteryOptimized: boolean;
  makerConfirmed: boolean;
}

async function readState(): Promise<SetupState> {
  const [notif, location, batteryOptimized, maker] = await Promise.all([
    Notifications ? Notifications.getPermissionsAsync().then((p) => p.granted).catch(() => true) : Promise.resolve(true),
    Location.getForegroundPermissionsAsync().then((p) => p.granted).catch(() => false),
    Platform.OS === 'android' ? Battery.isBatteryOptimizationEnabledAsync().catch(() => false) : Promise.resolve(false),
    SecureStore.getItemAsync(MAKER_SETUP_KEY).catch(() => null),
  ]);
  return { notif, location, batteryOptimized, makerConfirmed: Platform.OS !== 'android' || maker === '1' };
}

const isComplete = (s: SetupState) => s.notif && s.location && !s.batteryOptimized && s.makerConfirmed;

export function PhoneSetupGuide() {
  const { t } = useLanguage();
  const [state, setState] = useState<SetupState | null>(null);
  /** "Later" hides the guide until the app is opened again. */
  const [snoozed, setSnoozed] = useState(false);
  const family = makerFamily();

  const refresh = useCallback(async () => {
    const next = await readState();
    setState((prev) => {
      // Tell the office as soon as a permission changes here.
      if (prev && (prev.notif !== next.notif || prev.location !== next.location)) void reportPhoneHealth();
      return next;
    });
  }, []);

  useEffect(() => {
    void refresh();
    // Coming back from the Settings app is how most steps get done.
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  if (!state || isComplete(state) || snoozed) return null;

  const openAppSettings = () => void Linking.openSettings().catch(() => {});

  const allowNotifications = async () => {
    if (!Notifications) return;
    const res = await Notifications.requestPermissionsAsync().catch(() => null);
    if (!res?.granted) openAppSettings(); // already refused once → only Settings can turn it on
    void refresh();
  };

  const allowLocation = async () => {
    const res = await Location.requestForegroundPermissionsAsync().catch(() => null);
    if (!res?.granted) openAppSettings();
    void refresh();
  };

  const openBatterySettings = () => {
    Linking.sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS').catch(openAppSettings);
  };

  const confirmMaker = async () => {
    await SecureStore.setItemAsync(MAKER_SETUP_KEY, '1').catch(() => {});
    void refresh();
  };

  const maker = MAKER_STEPS[family];

  return (
    <Modal visible animationType="slide" onRequestClose={() => setSnoozed(true)}>
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>{t('setup_title', 'Set up your phone for trips')}</Text>
          <Text style={styles.subtitle}>
            {t('setup_subtitle', 'Do these steps once so you get new trips instantly and the office can follow your trip, even when MERCON is closed.')}
          </Text>

          <Step
            icon={<Bell size={20} color={Colors.primary} />}
            title={t('setup_notif_title', 'Allow notifications')}
            body={t('setup_notif_body', 'New trips, changes and cancellations arrive as notifications.')}
            done={state.notif}
            action={t('setup_allow', 'Allow')}
            onPress={allowNotifications}
            doneLabel={t('setup_done', 'Done')}
          />
          <Step
            icon={<MapPin size={20} color={Colors.primary} />}
            title={t('setup_location_title', 'Allow location')}
            body={t('setup_location_body', 'Choose "While using the app". Location is only shared during a trip.')}
            done={state.location}
            action={t('setup_allow', 'Allow')}
            onPress={allowLocation}
            doneLabel={t('setup_done', 'Done')}
          />
          {Platform.OS === 'android' && (
            <Step
              icon={<BatteryCharging size={20} color={Colors.primary} />}
              title={t('setup_battery_title', 'Turn off battery optimisation')}
              body={t('setup_battery_body', 'In the list choose "All apps", find MERCON Driver and select "Don\'t optimise" (or "Allow").')}
              done={!state.batteryOptimized}
              action={t('setup_open_settings', 'Open settings')}
              onPress={openBatterySettings}
              doneLabel={t('setup_done', 'Done')}
            />
          )}
          {Platform.OS === 'android' && (
            <Step
              icon={<Smartphone size={20} color={Colors.primary} />}
              title={t('setup_maker_title', 'Let MERCON run in the background')}
              body={t(maker.key, maker.en)}
              done={state.makerConfirmed}
              action={t('setup_open_app_settings', 'Open app settings')}
              onPress={openAppSettings}
              secondaryAction={t('setup_maker_confirm', "I've done this")}
              onSecondaryPress={confirmMaker}
              doneLabel={t('setup_done', 'Done')}
            />
          )}
        </ScrollView>

        <TouchableOpacity style={styles.laterBtn} onPress={() => setSnoozed(true)} activeOpacity={0.7}>
          <Text style={styles.laterText}>{t('setup_later', 'Later — remind me next time')}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

function Step(props: {
  icon: React.ReactNode;
  title: string;
  body: string;
  done: boolean;
  action: string;
  onPress: () => void;
  doneLabel: string;
  secondaryAction?: string;
  onSecondaryPress?: () => void;
}) {
  return (
    <View style={[styles.step, props.done && styles.stepDone]}>
      <View style={styles.stepHead}>
        <View style={styles.stepIcon}>{props.done ? <CheckCircle2 size={20} color={Colors.success} /> : props.icon}</View>
        <Text style={styles.stepTitle}>{props.title}</Text>
        {props.done && <Text style={styles.doneText}>{props.doneLabel}</Text>}
      </View>
      {!props.done && (
        <>
          <Text style={styles.stepBody}>{props.body}</Text>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.primaryBtn} onPress={props.onPress} activeOpacity={0.85}>
              <Text style={styles.primaryBtnText}>{props.action}</Text>
            </TouchableOpacity>
            {props.secondaryAction && (
              <TouchableOpacity style={styles.secondaryBtn} onPress={props.onSecondaryPress} activeOpacity={0.85}>
                <Text style={styles.secondaryBtnText}>{props.secondaryAction}</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.gray100 },
  content: { padding: Spacing.xl, paddingTop: Spacing['2xl'], gap: Spacing.md },
  title: { ...Typography.headingL, color: Colors.gray900 },
  subtitle: { ...Typography.bodyMedium, color: Colors.gray700, marginBottom: Spacing.sm },
  step: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
    ...Shadows.md,
  },
  stepDone: { opacity: 0.75 },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  stepIcon: { width: 28, alignItems: 'center' },
  stepTitle: { ...Typography.bodyMedium, color: Colors.gray900, fontWeight: '700', flex: 1 },
  doneText: { ...Typography.caption, color: Colors.success, fontWeight: '700' },
  stepBody: { ...Typography.bodySmall, color: Colors.gray700 },
  actions: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 10,
    paddingHorizontal: Spacing.lg,
  },
  primaryBtnText: { ...Typography.buttonMedium, color: Colors.white },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 10,
    paddingHorizontal: Spacing.lg,
  },
  secondaryBtnText: { ...Typography.buttonMedium, color: Colors.primary },
  laterBtn: { padding: Spacing.lg, alignItems: 'center' },
  laterText: { ...Typography.buttonMedium, color: Colors.gray500 },
});

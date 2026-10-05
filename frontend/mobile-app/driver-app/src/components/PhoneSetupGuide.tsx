/**
 * Phone setup — so a driver's phone can actually receive trips and share trip
 * location:
 *   1. Notifications allowed
 *   2. Location allowed (while using the app — enough for the trip service)
 *   3. Android: MERCON allowed to run in the background — one tap opens
 *      Android's own "Let app always run in background?" dialog
 *      (REQUEST_IGNORE_BATTERY_OPTIMIZATIONS); detected with expo-battery.
 *   +  Realme/Oppo, Xiaomi, Vivo, Huawei: an optional extra card for the
 *      maker's own auto-start switch (not required, cannot be detected).
 *
 * Why 3: on a Realme phone the battery manager froze the swiped-away app; a
 * "Trip Assigned" push then arrived ~6 minutes late and Google Play services
 * was killed mid-trip, stopping trip GPS. The old "find MERCON in the battery
 * optimisation list" step could not be done (MERCON never showed in that list
 * on Realme or Nothing phones), hence the direct dialog.
 *
 * The full guide opens by itself only once per install. After "Later" it
 * stays closed and PhoneSetupReminder (above the bottom bar) offers a
 * highlighted "Finish phone setup" button until every step is done.
 *
 * Permission prompts are only shown when the driver taps a button: on Android
 * a permission request pauses and resumes the app, so asking on its own would
 * loop with the "check again when the app comes back" logic.
 */
import React, { useCallback, useEffect, useSyncExternalStore } from 'react';
import { AppState, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Battery from 'expo-battery';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Location from 'expo-location';
import { Bell, CheckCircle2, ChevronRight, MapPin, ShieldCheck, Smartphone } from 'lucide-react-native';
import { useLanguage } from '@mercon/mobile-shared/lib/language-context';
import { safeSecureStore as SecureStore } from '@mercon/mobile-shared/lib/secure-store';
import { Colors, Radius, Shadows, Spacing, Typography } from '@mercon/mobile-shared/theme/tokens';
import { reportPhoneHealth } from '@/services/phoneHealth';
import { usePhoneHealthState } from '@/components/PhoneHealthManager';

let Notifications: typeof import('expo-notifications') | null = null;
try {
  Notifications = require('expo-notifications');
} catch {
  // Native module unavailable — the notification step is skipped.
}

/** Set once the full guide has opened by itself; after that only the reminder button opens it. */
const AUTO_OPENED_KEY = 'phone_setup_auto_opened_v1';

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

const ANDROID_PACKAGE = Constants.expoConfig?.android?.package ?? 'tech.mercon.driver';

/** Makers whose own battery manager also needs its auto-start switch (optional extra card). */
const STRICT_MAKERS: MakerFamily[] = ['oppo', 'xiaomi', 'vivo', 'huawei'];

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
    en: 'Tap "Open app settings" → "App battery usage" (or Battery) → choose "Unrestricted" or turn ON "Allow background usage".',
  },
};

interface SetupState {
  notif: boolean;
  location: boolean;
  /** Android lets MERCON run in the background (battery optimisation off). Always true on iOS. */
  background: boolean;
}

async function readState(): Promise<SetupState> {
  const [notif, location, optimized] = await Promise.all([
    Notifications ? Notifications.getPermissionsAsync().then((p) => p.granted).catch(() => true) : Promise.resolve(true),
    Location.getForegroundPermissionsAsync().then((p) => p.granted).catch(() => false),
    Platform.OS === 'android' ? Battery.isBatteryOptimizationEnabledAsync().catch(() => false) : Promise.resolve(false),
  ]);
  return { notif, location, background: !optimized };
}

const stepsDone = (s: SetupState) => [s.notif, s.location, s.background].filter(Boolean).length;
const STEP_COUNT = 3;
const isComplete = (s: SetupState) => stepsDone(s) === STEP_COUNT;

// Shared between the guide (mounted once at the root) and the reminder button
// (mounted above the bottom bar).
type GuideStore = { state: SetupState | null; open: boolean };
let store: GuideStore = { state: null, open: false };
const listeners = new Set<() => void>();
function setStore(patch: Partial<GuideStore>) {
  store = { ...store, ...patch };
  listeners.forEach((l) => l());
}
function subscribeStore(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
function useGuideStore(): GuideStore {
  return useSyncExternalStore(subscribeStore, () => store);
}

export function PhoneSetupGuide() {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { state, open } = useGuideStore();
  const family = makerFamily();

  const refresh = useCallback(async () => {
    const next = await readState();
    const prev = store.state;
    // Tell the office as soon as a permission changes here.
    if (prev && (prev.notif !== next.notif || prev.location !== next.location)) void reportPhoneHealth();
    setStore({ state: next, ...(isComplete(next) ? { open: false } : null) });
    return next;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const first = await refresh();
      if (cancelled || isComplete(first)) return;
      // Open by itself only the first time on this install.
      const autoOpened = await SecureStore.getItemAsync(AUTO_OPENED_KEY).catch(() => null);
      if (cancelled || autoOpened === '1') return;
      await SecureStore.setItemAsync(AUTO_OPENED_KEY, '1').catch(() => {});
      setStore({ open: true });
    })();
    // Coming back from the Settings app is how most steps get done.
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refresh();
    });
    return () => {
      cancelled = true;
      sub.remove();
      setStore({ open: false });
    };
  }, [refresh]);

  if (!state || isComplete(state) || !open) return null;

  const close = () => setStore({ open: false });
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

  // Android's own one-tap "Let app always run in background?" dialog.
  const allowBackground = async () => {
    await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, {
      data: `package:${ANDROID_PACKAGE}`,
    }).catch(openAppSettings);
    void refresh();
  };

  const maker = MAKER_STEPS[family];
  const done = stepsDone(state);
  const total = Platform.OS === 'android' ? STEP_COUNT : STEP_COUNT - 1;
  const doneShown = Platform.OS === 'android' ? done : done - 1; // iOS has no maker step

  return (
    <Modal visible animationType="slide" onRequestClose={close} statusBarTranslucent>
      <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.headerIcon}>
            <ShieldCheck size={28} color={Colors.primary} />
          </View>
          <Text style={styles.title}>{t('setup_title', 'Set up your phone for trips')}</Text>
          <Text style={styles.subtitle}>
            {t('setup_subtitle', 'Do these steps once so you get new trips instantly and the office can follow your trip, even when MERCON is closed.')}
          </Text>

          <View style={styles.progressRow}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round((doneShown / total) * 100)}%` as `${number}%` }]} />
            </View>
            <Text style={styles.progressText}>
              {doneShown} / {total}
            </Text>
          </View>

          <Step
            number={1}
            icon={<Bell size={20} color={Colors.primary} />}
            title={t('setup_notif_title', 'Allow notifications')}
            body={t('setup_notif_body', 'New trips, changes and cancellations arrive as notifications.')}
            done={state.notif}
            action={t('setup_allow', 'Allow')}
            onPress={allowNotifications}
            doneLabel={t('setup_done', 'Done')}
          />
          <Step
            number={2}
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
              number={3}
              icon={<Smartphone size={20} color={Colors.primary} />}
              title={t('setup_maker_title', 'Let MERCON run in the background')}
              body={t('setup_background_body', 'Tap Allow, then choose "Allow" in the pop-up. New trips then arrive even when the phone is asleep.')}
              done={state.background}
              action={t('setup_allow', 'Allow')}
              onPress={allowBackground}
              doneLabel={t('setup_done', 'Done')}
            />
          )}
          {Platform.OS === 'android' && STRICT_MAKERS.includes(family) && (
            <View style={styles.extra}>
              <Text style={styles.extraTitle}>{t('setup_extra_title', 'Optional — if new trips still arrive late')}</Text>
              <Text style={styles.stepBody}>{t(maker.key, maker.en)}</Text>
              <TouchableOpacity onPress={openAppSettings} activeOpacity={0.7}>
                <Text style={styles.extraLink}>{t('setup_open_app_settings', 'Open app settings')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        <TouchableOpacity style={styles.laterBtn} onPress={close} activeOpacity={0.7}>
          <Text style={styles.laterText}>{t('setup_later', 'Later')}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

/**
 * Highlighted "Finish phone setup" button above the bottom bar, shown while a
 * step is still open and the guide is closed. Hidden while the red phone
 * banner already asks for notifications/location (that banner has its own Fix).
 */
export function PhoneSetupReminder() {
  const { t } = useLanguage();
  const { state, open } = useGuideStore();
  const { health } = usePhoneHealthState();
  if (!state || open || isComplete(state)) return null;
  if (health?.notif_permission === 'denied' || health?.location_permission === 'denied') return null;

  const total = Platform.OS === 'android' ? STEP_COUNT : STEP_COUNT - 1;
  const doneShown = Platform.OS === 'android' ? stepsDone(state) : stepsDone(state) - 1;

  return (
    <TouchableOpacity style={styles.reminder} onPress={() => setStore({ open: true })} activeOpacity={0.85}>
      <ShieldCheck size={18} color={Colors.white} />
      <Text style={styles.reminderText} numberOfLines={2}>
        {t('setup_reminder', 'Finish phone setup to get trips instantly')}
      </Text>
      <View style={styles.reminderCount}>
        <Text style={styles.reminderCountText}>
          {doneShown}/{total}
        </Text>
      </View>
      <ChevronRight size={18} color={Colors.white} />
    </TouchableOpacity>
  );
}

function Step(props: {
  number: number;
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
    <View style={[styles.step, props.done ? styles.stepDone : styles.stepTodo]}>
      <View style={styles.stepHead}>
        <View style={[styles.stepIcon, props.done && styles.stepIconDone]}>
          {props.done ? <CheckCircle2 size={20} color={Colors.success} /> : props.icon}
        </View>
        <Text style={styles.stepTitle}>
          {props.number}. {props.title}
        </Text>
        {props.done && <Text style={styles.doneText}>{props.doneLabel}</Text>}
      </View>
      {!props.done && (
        <>
          <Text style={styles.stepBody}>{props.body}</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={props.onPress} activeOpacity={0.85}>
            <Text style={styles.primaryBtnText}>{props.action}</Text>
          </TouchableOpacity>
          {props.secondaryAction && (
            <TouchableOpacity style={styles.secondaryBtn} onPress={props.onSecondaryPress} activeOpacity={0.85}>
              <Text style={styles.secondaryBtnText}>{props.secondaryAction}</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.gray100 },
  content: { padding: Spacing.xl, gap: Spacing.md },
  headerIcon: {
    width: 52,
    height: 52,
    borderRadius: Radius.full,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.md,
  },
  title: { ...Typography.headingL, color: Colors.gray900 },
  subtitle: { ...Typography.bodyMedium, color: Colors.gray700 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xs },
  progressTrack: { flex: 1, height: 8, borderRadius: Radius.full, backgroundColor: Colors.gray200, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: Radius.full, backgroundColor: Colors.success },
  progressText: { ...Typography.caption, color: Colors.gray700, fontWeight: '700' },
  step: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
    borderWidth: 1,
    ...Shadows.md,
  },
  stepTodo: { borderColor: Colors.primary },
  stepDone: { borderColor: 'transparent', opacity: 0.8 },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  stepIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepIconDone: { backgroundColor: Colors.successLight },
  stepTitle: { ...Typography.bodyMedium, color: Colors.gray900, fontWeight: '700', flex: 1 },
  doneText: { ...Typography.caption, color: Colors.success, fontWeight: '700' },
  stepBody: { ...Typography.bodySmall, color: Colors.gray700 },
  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 12,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
  },
  primaryBtnText: { ...Typography.buttonMedium, lineHeight: 20, color: Colors.white },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 12,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
  },
  secondaryBtnText: { ...Typography.buttonMedium, lineHeight: 20, color: Colors.primary },
  extra: {
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.xs,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  extraTitle: { ...Typography.bodySmall, color: Colors.gray900, fontWeight: '700' },
  extraLink: { ...Typography.buttonMedium, lineHeight: 20, color: Colors.primary, marginTop: Spacing.xs },
  laterBtn: { padding: Spacing.lg, alignItems: 'center' },
  laterText: { ...Typography.buttonMedium, lineHeight: 20, color: Colors.gray500 },
  reminder: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primary,
    ...Shadows.md,
  },
  reminderText: { ...Typography.bodySmall, color: Colors.white, flex: 1, fontWeight: '700' },
  reminderCount: {
    backgroundColor: Colors.white,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  reminderCountText: { ...Typography.caption, color: Colors.primary, fontWeight: '700' },
});

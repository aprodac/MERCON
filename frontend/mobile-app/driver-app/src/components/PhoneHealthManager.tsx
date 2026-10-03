/**
 * Keeps the office's view of this phone current and tells the driver when
 * something on the phone will stop work from reaching them:
 *  - PhoneHealthWatcher: re-reports health when the app returns to the
 *    foreground and every 5 minutes while it is open.
 *  - PhoneSetupBanner: notifications / location / GPS / battery-saver warning
 *    with a button straight to the right settings.
 *  - UpdateRequiredScreen: blocks the app when the office's minimum version
 *    is newer than this install.
 */
import React, { useEffect, useState } from 'react';
import { AppState, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Location from 'expo-location';
import { AlertTriangle, BellOff, MapPinOff, BatteryWarning, Download } from 'lucide-react-native';
import Constants from 'expo-constants';
import { useLanguage } from '@mercon/mobile-shared/lib/language-context';
import { Colors, Radius, Spacing, Typography, Shadows } from '@mercon/mobile-shared/theme/tokens';
import { getPhoneHealthState, reportPhoneHealth, subscribePhoneHealth, type PhoneHealthState } from '@/services/phoneHealth';

const HEARTBEAT_MS = 5 * 60_000;

export function usePhoneHealthState(): PhoneHealthState {
  const [s, setS] = useState(getPhoneHealthState());
  useEffect(() => subscribePhoneHealth(setS), []);
  return s;
}

export function PhoneHealthWatcher() {
  useEffect(() => {
    // The first report is sent by the session start (services/auth.ts → syncPushToken).
    let wasBackground = false;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && wasBackground) void reportPhoneHealth('AppOpened');
      wasBackground = next !== 'active';
    });
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void reportPhoneHealth();
    }, HEARTBEAT_MS);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, []);
  return null;
}

type Problem = { key: string; icon: React.ReactNode; text: string; fix: () => void };

export function PhoneSetupBanner() {
  const { health } = usePhoneHealthState();
  const { t } = useLanguage();
  if (!health) return null;

  const openSettings = () => void Linking.openSettings().catch(() => {});
  const problems: Problem[] = [];
  if (health.notif_permission === 'denied') {
    problems.push({ key: 'notif', icon: <BellOff size={18} color={Colors.white} />, text: t('phone_banner_notif_off', 'Notifications are off — you will miss new trips.'), fix: openSettings });
  }
  if (health.location_permission === 'denied') {
    problems.push({ key: 'loc', icon: <MapPinOff size={18} color={Colors.white} />, text: t('phone_banner_location_off', 'Location access is off — the office cannot see your arrivals.'), fix: openSettings });
  } else if (health.location_services_on === false) {
    problems.push({
      key: 'gps',
      icon: <MapPinOff size={18} color={Colors.white} />,
      text: t('phone_banner_gps_off', "Your phone's GPS is switched off."),
      fix: () => {
        if (Platform.OS === 'android') {
          Location.enableNetworkProviderAsync().then(() => reportPhoneHealth()).catch(() => {});
        } else {
          openSettings();
        }
      },
    });
  }
  if (health.low_power_mode) {
    problems.push({ key: 'battery', icon: <BatteryWarning size={18} color={Colors.white} />, text: t('phone_banner_battery_saver', 'Battery saver is on — the app may stop updating.'), fix: openSettings });
  }

  const p = problems[0];
  if (!p) return null;
  const serious = p.key === 'notif' || p.key === 'loc';

  return (
    <View style={[styles.banner, { backgroundColor: serious ? Colors.danger : Colors.warning }]}>
      {p.icon}
      <Text style={styles.bannerText} numberOfLines={2}>{p.text}</Text>
      <TouchableOpacity onPress={p.fix} style={styles.bannerBtn} activeOpacity={0.8}>
        <Text style={[styles.bannerBtnText, { color: serious ? Colors.danger : Colors.warning }]}>{t('phone_banner_fix', 'Fix')}</Text>
      </TouchableOpacity>
    </View>
  );
}

export function UpdateRequiredScreen() {
  const { updateRequired, minVersion } = usePhoneHealthState();
  const { t } = useLanguage();
  const [checking, setChecking] = useState(false);
  if (!updateRequired) return null;

  const androidPackage = Constants.expoConfig?.android?.package;
  const openStore = () => {
    if (Platform.OS === 'android' && androidPackage) {
      Linking.openURL(`market://details?id=${androidPackage}`).catch(() =>
        Linking.openURL(`https://play.google.com/store/apps/details?id=${androidPackage}`).catch(() => {}),
      );
    } else {
      // iOS builds ship through TestFlight / the App Store — both update from TestFlight or the App Store app.
      Linking.openURL('itms-beta://').catch(() => Linking.openURL('itms-apps://').catch(() => {}));
    }
  };

  return (
    <View style={styles.updateOverlay}>
      <View style={styles.updateCard}>
        <View style={styles.updateIcon}><AlertTriangle size={30} color={Colors.warning} /></View>
        <Text style={styles.updateTitle}>{t('update_required_title', 'Update required')}</Text>
        <Text style={styles.updateBody}>{t('update_required_body', 'This version of the app is too old. Install the latest version to keep receiving trips.')}</Text>
        <Text style={styles.updateMeta}>
          {Constants.expoConfig?.version ?? ''}{minVersion ? `  →  ${minVersion}+` : ''}
        </Text>
        <TouchableOpacity style={styles.updateBtn} onPress={openStore} activeOpacity={0.85}>
          <Download size={18} color={Colors.white} />
          <Text style={styles.updateBtnText}>{t('update_required_store', 'Open store')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.checkBtn}
          disabled={checking}
          onPress={async () => {
            setChecking(true);
            await reportPhoneHealth();
            setChecking(false);
          }}
        >
          <Text style={styles.checkText}>{t('update_required_check', 'Check again')}</Text>
        </TouchableOpacity>
        <Text style={styles.updateHelp}>{t('update_required_help', 'Ask the office if you need help.')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.lg,
    ...Shadows.md,
  },
  bannerText: { ...Typography.bodySmall, color: Colors.white, flex: 1, fontWeight: '600' },
  bannerBtn: {
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  bannerBtnText: { ...Typography.buttonSmall },
  updateOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: Colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    zIndex: 10000,
    elevation: 10000,
  },
  updateCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: Colors.white,
    borderRadius: Radius['2xl'],
    padding: Spacing.xl,
    alignItems: 'center',
    ...Shadows.md,
  },
  updateIcon: {
    width: 60,
    height: 60,
    borderRadius: Radius.full,
    backgroundColor: Colors.warningLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  updateTitle: { ...Typography.headingL, color: Colors.gray900, textAlign: 'center' },
  updateBody: { ...Typography.bodyMedium, color: Colors.gray700, textAlign: 'center', marginTop: Spacing.sm },
  updateMeta: { ...Typography.caption, color: Colors.gray500, marginTop: Spacing.sm },
  updateBtn: {
    marginTop: Spacing.lg,
    height: 50,
    alignSelf: 'stretch',
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateBtnText: { ...Typography.buttonLarge, color: Colors.white },
  checkBtn: { marginTop: Spacing.sm, height: 44, justifyContent: 'center' },
  checkText: { ...Typography.buttonMedium, color: Colors.charcoal },
  updateHelp: { ...Typography.caption, color: Colors.gray500, marginTop: Spacing.xs },
});

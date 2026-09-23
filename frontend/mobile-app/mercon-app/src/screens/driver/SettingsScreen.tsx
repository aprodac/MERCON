import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Bell,
  ScanFace,
  MapPin,
  Volume2,
  Moon,
  Globe,
  Info,
  ShieldCheck,
  ScrollText,
  Bug,
  KeyRound,
  Trash2,
  LogOut,
  ArrowLeft,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react-native';
import { useAuth } from '../../lib/auth-context';
import { useLanguage } from '../../lib/language-context';
import { useTheme } from '../../lib/theme-context';

const SettingsScreen = () => {
  const router = useRouter();
  const { signOut } = useAuth();
  const { language, openLanguageModal, t } = useLanguage();
  const { isDark, toggleDark, colors } = useTheme();

  // Local toggles — these would persist via AsyncStorage in a full implementation
  const [pushNotifications, setPushNotifications] = React.useState(true);
  const [biometric, setBiometric] = React.useState(false);
  const [locationSharing, setLocationSharing] = React.useState(true);
  const [soundAlerts, setSoundAlerts] = React.useState(true);

  const getLanguageLabel = () => {
    if (language === 'en') return 'English';
    if (language === 'ur') return 'اردو (Urdu)';
    return 'اردو / English';
  };

  interface ToggleRow {
    Icon: LucideIcon;
    labelKey: string;
    defaultLabel: string;
    descKey: string;
    defaultDesc: string;
    value: boolean;
    onChange: (v: boolean) => void;
  }

  interface ChevronRow {
    Icon: LucideIcon;
    labelKey: string;
    defaultLabel: string;
    value?: string;
    onPress?: () => void;
  }

  const TOGGLE_ROWS: ToggleRow[] = [
    {
      Icon: Bell,
      labelKey: 'setting_push_notifications',
      defaultLabel: 'Push Notifications',
      descKey: 'setting_push_desc',
      defaultDesc: 'Trip updates, reminders and alerts',
      value: pushNotifications,
      onChange: setPushNotifications,
    },
    {
      Icon: ScanFace,
      labelKey: 'setting_biometric',
      defaultLabel: 'Biometric Login',
      descKey: 'setting_biometric_desc',
      defaultDesc: 'Use fingerprint or face to sign in',
      value: biometric,
      onChange: setBiometric,
    },
    {
      Icon: MapPin,
      labelKey: 'setting_location_sharing',
      defaultLabel: 'Location Sharing',
      descKey: 'setting_location_desc',
      defaultDesc: 'Share location during active trips',
      value: locationSharing,
      onChange: setLocationSharing,
    },
    {
      Icon: Volume2,
      labelKey: 'setting_sound_alerts',
      defaultLabel: 'Sound Alerts',
      descKey: 'setting_sound_desc',
      defaultDesc: 'Play audio for navigation & alerts',
      value: soundAlerts,
      onChange: setSoundAlerts,
    },
    {
      Icon: Moon,
      labelKey: 'setting_dark_mode',
      defaultLabel: 'Dark Mode',
      descKey: 'setting_dark_desc',
      defaultDesc: 'Switch to dark theme',
      value: isDark,
      onChange: toggleDark,
    },
  ];

  const CHEVRON_ROWS: ChevronRow[] = [
    {
      Icon: Globe,
      labelKey: 'title_language',
      defaultLabel: 'Language',
      value: getLanguageLabel(),
      onPress: openLanguageModal,
    },
    {
      Icon: Info,
      labelKey: 'setting_about',
      defaultLabel: 'About MERCON',
      onPress: () =>
        Alert.alert('MERCON', 'MERCON Logistics Platform\nVersion 1.0.0\nSaudi Arabia'),
    },
    {
      Icon: ShieldCheck,
      labelKey: 'setting_privacy',
      defaultLabel: 'Privacy Policy',
      onPress: () => Alert.alert('Privacy Policy', 'Contact your administrator for details.'),
    },
    {
      Icon: ScrollText,
      labelKey: 'setting_terms',
      defaultLabel: 'Terms of Service',
      onPress: () => Alert.alert('Terms of Service', 'Contact your administrator for details.'),
    },
    {
      Icon: Bug,
      labelKey: 'setting_report_issue',
      defaultLabel: 'Report an Issue',
      onPress: () => Alert.alert('Report Issue', 'Contact your operator or administrator to report issues.'),
    },
  ];

  const s = makeStyles(colors);

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.surface} />

      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <ArrowLeft size={20} color={colors.textPrimary} strokeWidth={2.2} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t('nav_settings', 'Settings')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Preferences */}
        <Text style={s.groupLabel}>{t('title_preferences', 'PREFERENCES')}</Text>
        <View style={s.groupCard}>
          {TOGGLE_ROWS.map((row, i) => (
            <View
              key={row.labelKey}
              style={[s.row, i < TOGGLE_ROWS.length - 1 ? s.rowBorder : null]}
            >
              <View style={s.rowIconBox}>
                <row.Icon size={18} color={colors.textSecondary} strokeWidth={2} />
              </View>
              <View style={s.rowContent}>
                <Text style={s.rowLabel}>{t(row.labelKey, row.defaultLabel)}</Text>
                <Text style={s.rowDesc}>{t(row.descKey, row.defaultDesc)}</Text>
              </View>
              <Switch
                value={row.value}
                onValueChange={row.onChange}
                trackColor={{ false: colors.border, true: '#FA634E' }}
                thumbColor={colors.switchThumb}
                ios_backgroundColor={colors.border}
              />
            </View>
          ))}
        </View>

        {/* General */}
        <Text style={s.groupLabel}>{t('title_general', 'GENERAL')}</Text>
        <View style={s.groupCard}>
          {CHEVRON_ROWS.map((row, i) => (
            <TouchableOpacity
              key={row.labelKey}
              style={[s.row, i < CHEVRON_ROWS.length - 1 ? s.rowBorder : null]}
              activeOpacity={0.8}
              onPress={row.onPress}
            >
              <View style={s.rowIconBox}>
                <row.Icon size={18} color={colors.textSecondary} strokeWidth={2} />
              </View>
              <Text style={s.rowLabelSingle}>{t(row.labelKey, row.defaultLabel)}</Text>
              <View style={s.rowRight}>
                {row.value ? <Text style={s.rowValue}>{row.value}</Text> : null}
                <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} />
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Account */}
        <Text style={s.groupLabel}>{t('title_account', 'ACCOUNT')}</Text>
        <View style={s.groupCard}>
          <TouchableOpacity
            style={[s.row, s.rowBorder]}
            activeOpacity={0.8}
            onPress={() => router.push('/change-password' as any)}
          >
            <View style={s.rowIconBox}>
              <KeyRound size={18} color={colors.textSecondary} strokeWidth={2} />
            </View>
            <Text style={s.rowLabelSingle}>{t('setting_change_password', 'Change Password')}</Text>
            <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} />
          </TouchableOpacity>
          <TouchableOpacity
            style={s.row}
            activeOpacity={0.8}
            onPress={() =>
              Alert.alert(
                'Delete Account',
                'To delete your account, contact your fleet operator.',
                [{ text: 'OK' }],
              )
            }
          >
            <View style={s.rowIconBox}>
              <Trash2 size={18} color={colors.dangerText} strokeWidth={2} />
            </View>
            <Text style={[s.rowLabelSingle, { color: colors.dangerText }]}>
              {t('setting_delete_account', 'Delete Account')}
            </Text>
            <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {/* Logout */}
        <TouchableOpacity
          style={s.logoutBtn}
          activeOpacity={0.8}
          onPress={() =>
            Alert.alert(
              'Logout',
              'Are you sure you want to logout?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Logout',
                  style: 'destructive',
                  onPress: async () => {
                    await signOut();
                    router.replace('/login');
                  },
                },
              ],
            )
          }
        >
          <LogOut size={20} color="#DC2626" strokeWidth={2.2} />
          <Text style={s.logoutText}>{t('action_logout', 'Logout')}</Text>
        </TouchableOpacity>

        <Text style={s.footer}>
          {'MERCON Logistics Platform · Saudi Arabia\nsupport@mercon.sa'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

function makeStyles(colors: ReturnType<typeof import('../../lib/theme-context').useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    header: {
      backgroundColor: colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.iconBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    scroll: {
      padding: 16,
      paddingBottom: 60,
    },
    groupLabel: {
      fontSize: 11,
      color: colors.groupLabel,
      fontWeight: '700',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      marginTop: 20,
      marginBottom: 8,
      paddingHorizontal: 4,
    },
    groupCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 12,
    },
    rowBorder: {
      borderBottomWidth: 1,
      borderBottomColor: colors.separator,
    },
    rowIconBox: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: colors.iconBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowContent: {
      flex: 1,
    },
    rowLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    rowDesc: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 1,
    },
    rowLabelSingle: {
      flex: 1,
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    rowRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    rowValue: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    logoutBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1.5,
      borderColor: '#DC2626',
      marginTop: 20,
    },
    logoutText: {
      fontSize: 15,
      fontWeight: '700',
      color: '#DC2626',
    },
    footer: {
      textAlign: 'center',
      fontSize: 12,
      color: colors.textMuted,
      lineHeight: 18,
      marginTop: 20,
    },
  });
}

export default SettingsScreen;

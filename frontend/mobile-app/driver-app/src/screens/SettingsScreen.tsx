import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Application from 'expo-application';
import {
  Globe,
  Info,
  Bug,
  ArrowLeft,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react-native';
import { useLanguage } from '@mercon/mobile-shared/lib/language-context';
import { useTheme } from '@mercon/mobile-shared/lib/theme-context';
import { SUPPORT_EMAIL } from '@mercon/mobile-shared/lib/support';
import { HelpSupportSheet } from '../components/HelpSupportSheet';

/**
 * Removed after the Phase 3 phone test (2026-10-04):
 * - "Location Sharing" and "Sound Alerts" switches: kept only while the page
 *   was open and nothing read them. Location sharing follows the trip; a switch
 *   that looks like it turns it off must not be offered.
 * - "Dark Mode": only this page turned dark. Hidden until every screen
 *   supports it; anyone who had it on is put back to light.
 */
const SettingsScreen = () => {
  const router = useRouter();
  const { language, openLanguageModal, t } = useLanguage();
  const { isDark, toggleDark, colors } = useTheme();
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    if (isDark) toggleDark();
  }, [isDark, toggleDark]);

  const getLanguageLabel = () => {
    if (language === 'en') return 'English';
    if (language === 'ur') return 'اردو (Urdu)';
    return 'اردو / English';
  };

  // The installed app's real version and build (was a fixed "Version 1.0.0").
  const version = Application.nativeApplicationVersion ?? '—';
  const build = Application.nativeBuildVersion;

  interface ChevronRow {
    Icon: LucideIcon;
    labelKey: string;
    defaultLabel: string;
    value?: string;
    onPress?: () => void;
  }

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
      value: version,
      onPress: () =>
        Alert.alert(
          'MERCON Driver',
          `${t('label_version', 'Version')} ${version}${build ? ` (${t('label_build', 'build')} ${build})` : ''}\nMERCON Logistics Platform · Saudi Arabia`,
        ),
    },
    {
      Icon: Bug,
      labelKey: 'setting_report_issue',
      defaultLabel: 'Report an Issue',
      onPress: () => setHelpOpen(true),
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

        <Text style={s.footer}>MERCON Logistics Platform · Saudi Arabia</Text>
        <TouchableOpacity
          onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {})}
          accessibilityRole="link"
          hitSlop={8}
        >
          <Text style={[s.footer, s.footerLink]}>{SUPPORT_EMAIL}</Text>
        </TouchableOpacity>
      </ScrollView>

      <HelpSupportSheet visible={helpOpen} onClose={() => setHelpOpen(false)} />
    </SafeAreaView>
  );
};

function makeStyles(colors: ReturnType<typeof import('@mercon/mobile-shared/lib/theme-context').useTheme>['colors']) {
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
      paddingBottom: 140, // clears the floating bottom nav
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
    
    footer: {
      textAlign: 'center',
      fontSize: 12,
      color: colors.textMuted,
      lineHeight: 18,
      marginTop: 20,
    },
    footerLink: {
      marginTop: 2,
      fontSize: 13,
      fontWeight: '600',
      color: '#FA634E',
      textDecorationLine: 'underline',
    },
  });
}

export default SettingsScreen;

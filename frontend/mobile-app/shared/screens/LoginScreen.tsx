/**
 * MERCON login screen, used by both mobile apps.
 * The form is the same everywhere; what `signIn` does comes from the app's
 * <AuthProvider signIn={...}> (lib/auth-context): the driver app logs in with
 * phone + license, the operator app with username/phone + password.
 * After sign-in the app's auth guard (app/_layout.tsx) shows its home screen.
 */
import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image, ImageBackground,
  StyleSheet, StatusBar, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { User, Lock, Eye, EyeOff, ArrowRight, Headset, Globe, ChevronDown, Check } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography, Shadows } from '../theme/tokens';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useAuth } from '../lib/auth-context';
import { api, getApiErrorMessage } from '../lib/api';
import { useLanguage } from '../lib/language-context';

import { useRouter } from 'expo-router';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const logo = require('../assets/images/mercon-logo.png');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const heroBg = require('../assets/images/login-hero.webp');

interface CountryOption {
  code: string;
  flag: string;
  name: string;
}

const COUNTRIES: CountryOption[] = [
  { code: '+966', flag: '🇸🇦', name: 'Saudi Arabia (+966)' },
  { code: '+91', flag: '🇮🇳', name: 'India (+91)' },
];

const formatPhoneForAuth = (raw: string, defaultCode: string = '+966'): string => {
  let cleaned = raw.trim().replace(/\s+/g, '');
  if (!cleaned) return '';
  // If non-numeric (e.g. username login fallback), return as is
  if (/^[a-zA-Z]/.test(cleaned)) return cleaned;
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.startsWith('00')) return '+' + cleaned.slice(2);
  if (cleaned.startsWith('966')) return '+' + cleaned;
  if (cleaned.startsWith('91')) return '+' + cleaned;
  if (cleaned.startsWith('0')) cleaned = cleaned.slice(1);
  return `${defaultCode}${cleaned}`;
};

const LoginScreen = () => {
  const router = useRouter();
  const { signIn } = useAuth();
  const { language, openLanguageModal, t } = useLanguage();

  const [selectedCountry, setSelectedCountry] = useState<CountryOption>(COUNTRIES[0]);
  const [showCountryModal, setShowCountryModal] = useState(false);

  const [identifier, setIdentifier] = useState('');
  const [secret, setSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleForgot = async () => {
    setError(null);
    setNotice(null);
    if (!identifier.trim()) {
      setError(t('err_enter_phone_first', 'Enter your phone number first, then tap "Can\'t log in?" again.'));
      return;
    }
    const formattedPhone = formatPhoneForAuth(identifier, selectedCountry.code);
    try {
      // Notifies all operators/admins that this user needs a reset.
      await api.post('/auth/request-reset', { identifier: formattedPhone });
      setNotice(t('msg_operator_notified', 'Your operator has been notified. They will help you log in.'));
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  };

  const handleSignIn = async () => {
    if (!identifier.trim() || !secret.trim()) {
      setError(t('err_missing_credentials', 'Please enter your phone number and password or license number.'));
      return;
    }
    setError(null);
    setNotice(null);
    setLoading(true);
    const formattedPhone = formatPhoneForAuth(identifier, selectedCountry.code);
    try {
      await signIn(formattedPhone, secret);
      // Navigate explicitly to authenticated root
      router.replace('/');
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const langTag = language === 'en' ? 'EN' : language === 'ur' ? 'اردو' : 'اردو / EN';

  return (
    <ImageBackground source={heroBg} style={styles.container} resizeMode="cover">
      <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.gray50} />

      {/* Top Language Switcher Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.langPill} activeOpacity={0.8} onPress={openLanguageModal}>
          <Globe size={16} color={Colors.primary} strokeWidth={2.2} />
          <Text style={styles.langPillText}>{langTag}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollFlex} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Logo — centered, visual anchor */}
        <Image source={logo} style={styles.logo} resizeMode="contain" />

        {/* Card */}
        <View style={styles.card}>
          <View style={styles.form}>
            <Input
              label={t('label_phone', 'Phone Number')}
              value={identifier}
              onChangeText={setIdentifier}
              placeholder={selectedCountry.code === '+91' ? '98765 43210' : t('placeholder_phone', '50 000 0001')}
              keyboardType="phone-pad"
              autoCapitalize="none"
              iconLeft={
                <TouchableOpacity
                  style={styles.countryCodeBadge}
                  activeOpacity={0.7}
                  onPress={() => setShowCountryModal(true)}
                >
                  <Text style={styles.flag}>{selectedCountry.flag}</Text>
                  <Text style={styles.countryCodeText}>{selectedCountry.code}</Text>
                  <ChevronDown size={14} color={Colors.gray500} />
                  <View style={styles.badgeDivider} />
                </TouchableOpacity>
              }
            />
            <Input
              label={t('label_password', 'Password or License Number')}
              value={secret}
              onChangeText={setSecret}
              placeholder={t('placeholder_password', 'Enter password or license number')}
              autoCapitalize="none"
              secureTextEntry={!showSecret}
              iconLeft={<Lock size={20} color={Colors.gray400} />}
              iconRight={
                <TouchableOpacity onPress={() => setShowSecret((v) => !v)} hitSlop={8} activeOpacity={0.7}>
                  {showSecret
                    ? <EyeOff size={20} color={Colors.gray400} />
                    : <Eye size={20} color={Colors.gray400} />}
                </TouchableOpacity>
              }
            />

            {error && <Text style={styles.errorText}>{error}</Text>}
            {notice && <Text style={styles.noticeText}>{notice}</Text>}

            <Button
              title={loading ? t('action_signing_in', 'Signing In...') : t('action_login', 'Sign In')}
              onPress={handleSignIn}
              disabled={loading}
              size="lg"
              iconRight={!loading ? <ArrowRight size={20} color={Colors.white} /> : undefined}
            />
          </View>
        </View>

        {/* Notify my operator — outside the card */}
        <TouchableOpacity onPress={handleForgot} activeOpacity={0.7} style={styles.notifyBtn}>
          <Headset size={20} color={Colors.primary} />
          <Text style={styles.notifyText}>{t('action_cant_login', "Can't log in? Notify my operator")}</Text>
        </TouchableOpacity>

        <Text style={styles.footer}>
          {t('label_help_support', 'Having trouble? Contact support@mercon.sa')}
        </Text>
      </ScrollView>

      {/* Country Code Picker Modal */}
      <Modal
        visible={showCountryModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCountryModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowCountryModal(false)}
        >
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Select Country Code</Text>
            {COUNTRIES.map((item) => {
              const isSelected = item.code === selectedCountry.code;
              return (
                <TouchableOpacity
                  key={item.code}
                  style={[styles.modalOption, isSelected && styles.modalOptionSelected]}
                  activeOpacity={0.8}
                  onPress={() => {
                    setSelectedCountry(item);
                    setShowCountryModal(false);
                  }}
                >
                  <View style={styles.modalOptionLeft}>
                    <Text style={styles.modalFlag}>{item.flag}</Text>
                    <Text style={styles.modalOptionText}>{item.name}</Text>
                  </View>
                  {isSelected && <Check size={18} color={Colors.primary} strokeWidth={2.5} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
      </SafeAreaView>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gray50,
  },
  safe: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  langPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.gray200,
    ...Shadows.sm,
  },
  langPillText: {
    fontSize: Typography.xs,
    fontWeight: '700',
    color: Colors.primary,
  },
  scrollFlex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    justifyContent: 'center',   // center the login composition on the page
  },
  logo: {
    alignSelf: 'center',
    width: 200,
    height: 106,
  },
  card: {
    marginTop: Spacing['3xl'],   // 40 — breathing room under the logo
    marginHorizontal: Spacing.sm, // slightly narrower than full width
    backgroundColor: Colors.white,
    borderRadius: Radius['2xl'],
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
    ...Shadows.lg,
  },
  form: {
    gap: Spacing.sm + 2,       // ~10, tighter
  },
  errorText: {
    fontSize: Typography.sm,
    color: Colors.danger,
    marginTop: -Spacing.xs,
  },
  noticeText: {
    fontSize: Typography.sm,
    color: Colors.success,
    marginTop: -Spacing.xs,
  },
  // Secondary action — lighter than the solid Sign In button (no fill/border)
  notifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xl,     // 24
    paddingVertical: Spacing.sm,
  },
  notifyText: {
    fontSize: Typography.sm,
    color: Colors.primary,
    fontWeight: '600',
  },
  footer: {
    textAlign: 'center',
    fontSize: Typography.xs,
    color: Colors.gray500,
    marginTop: 28,
  },
  footerLink: {
    color: Colors.primary,
    fontWeight: '600',
  },
  countryCodeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 6,
    gap: 4,
  },
  flag: {
    fontSize: 16,
  },
  countryCodeText: {
    fontSize: Typography.sm,
    fontWeight: '700',
    color: Colors.gray900,
  },
  badgeDivider: {
    width: 1,
    height: 18,
    backgroundColor: Colors.gray300,
    marginLeft: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  modalContent: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    gap: Spacing.sm,
    ...Shadows.lg,
  },
  modalTitle: {
    fontSize: Typography.md,
    fontWeight: '700',
    color: Colors.gray900,
    marginBottom: Spacing.xs,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.gray50,
  },
  modalOptionSelected: {
    backgroundColor: '#FEF2F2',
    borderColor: Colors.primary,
    borderWidth: 1,
  },
  modalOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  modalFlag: {
    fontSize: 20,
  },
  modalOptionText: {
    fontSize: Typography.sm,
    fontWeight: '600',
    color: Colors.gray900,
  },
});

export default LoginScreen;

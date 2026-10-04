/**
 * MERCON login screen, used by both mobile apps. Each app renders it with its
 * own `variant`:
 *   driver   → phone number + licence number (POST /mobile/auth/login)
 *   operator → username, email or phone + password (POST /auth/login)
 * What `signIn` does comes from the app's <AuthProvider signIn={...}>
 * (lib/auth-context). After sign-in the app's auth guard (app/_layout.tsx)
 * shows its home screen.
 *
 * Built for a first sign-in on a phone: the form moves above the keyboard
 * (the logo shrinks while typing), Next/Go on the keyboard move between the
 * fields and sign in, errors sit under the field they are about, and the
 * last identifier is remembered so a returning user only types the secret.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image, ImageBackground,
  StyleSheet, StatusBar, Modal, KeyboardAvoidingView, Platform, Keyboard,
  Linking, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import axios from 'axios';
import {
  User, Lock, Eye, EyeOff, ArrowRight, Headset, Globe, ChevronDown, Check,
  WifiOff, AlertCircle, Mail, X,
} from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography, Shadows } from '../theme/tokens';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useAuth } from '../lib/auth-context';
import { api, getApiErrorMessage } from '../lib/api';
import { useLanguage } from '../lib/language-context';
import { safeSecureStore } from '../lib/secure-store';
import { SUPPORT_EMAIL } from '../lib/support';

import { useRouter } from 'expo-router';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const logo = require('../assets/images/mercon-logo.png');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const heroBg = require('../assets/images/login-hero.webp');

export type LoginVariant = 'driver' | 'operator';

interface CountryOption {
  code: string;
  flag: string;
  name: string;
}

const COUNTRIES: CountryOption[] = [
  { code: '+966', flag: '🇸🇦', name: 'Saudi Arabia (+966)' },
  { code: '+91', flag: '🇮🇳', name: 'India (+91)' },
];

/** Remembered between launches so a returning user only types the secret. */
const lastIdentifierKey = (variant: LoginVariant) => `mercon.login.last.${variant}`;

/** Digits, spaces, dashes, brackets and an optional leading + — i.e. a phone number. */
export const looksLikePhone = (raw: string): boolean => /^\+?[\d\s\-()]+$/.test(raw.trim());

export const formatPhoneForAuth = (raw: string, defaultCode: string = '+966'): string => {
  let cleaned = raw.trim().replace(/[\s\-()]/g, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.startsWith('00')) return '+' + cleaned.slice(2);
  if (cleaned.startsWith('966')) return '+' + cleaned;
  if (cleaned.startsWith('91') && cleaned.length > 10) return '+' + cleaned;
  if (cleaned.startsWith('0')) cleaned = cleaned.slice(1);
  return `${defaultCode}${cleaned}`;
};

type FieldErrors = { identifier?: string; secret?: string };

interface LoginScreenProps {
  variant: LoginVariant;
}

const LoginScreen = ({ variant }: LoginScreenProps) => {
  const router = useRouter();
  const { signIn } = useAuth();
  const { language, openLanguageModal, t } = useLanguage();
  const isDriver = variant === 'driver';

  const [selectedCountry, setSelectedCountry] = useState<CountryOption>(COUNTRIES[0]);
  const [showCountryModal, setShowCountryModal] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const [identifier, setIdentifier] = useState('');
  const [secret, setSecret] = useState('');
  // Drivers start with the box shown so they can spot typos (a licence number is
  // not secret); the eye button hides it when they type a password.
  const [showSecret, setShowSecret] = useState(isDriver);

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<{ text: string; offline: boolean } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  const secretRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Operators can type a username or email; the country chip only matters for phone numbers.
  const identifierIsPhone = isDriver || (identifier.length > 0 && looksLikePhone(identifier) && !identifier.trim().startsWith('+'));

  useEffect(() => {
    safeSecureStore.getItemAsync(lastIdentifierKey(variant)).then((saved) => {
      if (!saved) return;
      try {
        const { value, country } = JSON.parse(saved);
        if (typeof value === 'string') setIdentifier(value);
        const match = COUNTRIES.find((c) => c.code === country);
        if (match) setSelectedCountry(match);
      } catch {
        // ignore a corrupt value
      }
    }).catch(() => {});
  }, [variant]);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s = Keyboard.addListener(showEvt, () => {
      setKeyboardOpen(true);
      // Keep the Sign In button in view above the keyboard.
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    });
    const h = Keyboard.addListener(hideEvt, () => setKeyboardOpen(false));
    return () => { s.remove(); h.remove(); };
  }, []);

  // Anything that looks like a phone number (with or without +) is normalised;
  // usernames and emails are sent as typed.
  const authIdentifier = () =>
    isDriver || looksLikePhone(identifier) ? formatPhoneForAuth(identifier, selectedCountry.code) : identifier.trim();

  const clearMessages = () => {
    setFormError(null);
    setNotice(null);
  };

  const handleSignIn = async () => {
    clearMessages();
    const errors: FieldErrors = {};
    if (!identifier.trim()) {
      errors.identifier = isDriver
        ? t('err_enter_phone', 'Enter your phone number')
        : t('err_enter_identifier', 'Enter your username, email or phone number');
    }
    if (!secret.trim()) {
      errors.secret = isDriver
        ? t('err_enter_licence', 'Enter your password or licence number')
        : t('err_enter_password', 'Enter your password');
    }
    setFieldErrors(errors);
    if (errors.identifier || errors.secret) {
      if (!errors.identifier) secretRef.current?.focus();
      return;
    }

    Keyboard.dismiss();
    setLoading(true);
    try {
      await signIn(authIdentifier(), secret);
      safeSecureStore
        .setItemAsync(lastIdentifierKey(variant), JSON.stringify({ value: identifier.trim(), country: selectedCountry.code }))
        .catch(() => {});
      router.replace('/');
    } catch (err) {
      if (axios.isAxiosError(err) && !err.response) {
        setFormError({
          text: t('err_offline_login', "Can't reach Mercon. Check your internet connection and try again."),
          offline: true,
        });
      } else if (axios.isAxiosError(err) && err.response?.status === 401) {
        setFormError({
          text: isDriver
            ? t('err_driver_credentials', "Phone number and password or licence number don't match. Check both and try again.")
            : t('err_operator_credentials', 'Username or password is incorrect. Check both and try again.'),
          offline: false,
        });
      } else if (axios.isAxiosError(err) && err.response?.status === 429) {
        setFormError({
          text: t('err_too_many_attempts', 'Too many attempts. Wait a minute, then try again.'),
          offline: false,
        });
      } else {
        setFormError({ text: getApiErrorMessage(err), offline: false });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleNotifyOperator = async () => {
    clearMessages();
    if (!identifier.trim()) {
      setShowHelp(false);
      setFieldErrors({
        identifier: isDriver
          ? t('err_enter_phone_first', 'Enter your phone number first, then tap "Can\'t sign in?" again.')
          : t('err_enter_identifier_first', 'Enter your username, email or phone first, then tap "Can\'t sign in?" again.'),
      });
      return;
    }
    try {
      // Notifies all operators/admins that this user needs a reset.
      await api.post('/auth/request-reset', { identifier: authIdentifier() });
      setShowHelp(false);
      setNotice(t('msg_operator_notified', 'Your operator has been notified. They will help you log in.'));
    } catch (err) {
      setShowHelp(false);
      setFormError({ text: getApiErrorMessage(err), offline: axios.isAxiosError(err) && !err.response });
    }
  };

  const langTag = language === 'en' ? 'EN' : language === 'ur' ? 'اردو' : 'اردو / EN';

  const countryChip = (
    <TouchableOpacity
      style={styles.countryCodeBadge}
      activeOpacity={0.7}
      onPress={() => setShowCountryModal(true)}
      accessibilityRole="button"
      accessibilityLabel={`Country code ${selectedCountry.code}`}
      hitSlop={8}
    >
      <Text style={styles.flag}>{selectedCountry.flag}</Text>
      <Text style={styles.countryCodeText}>{selectedCountry.code}</Text>
      <ChevronDown size={14} color={Colors.gray500} />
      <View style={styles.badgeDivider} />
    </TouchableOpacity>
  );

  return (
    <ImageBackground source={heroBg} style={styles.container} resizeMode="cover">
      <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
        <StatusBar barStyle="dark-content" backgroundColor={Colors.gray50} />

        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.langPill}
            activeOpacity={0.8}
            onPress={openLanguageModal}
            accessibilityRole="button"
            accessibilityLabel="Change language"
          >
            <Globe size={16} color={Colors.primary} strokeWidth={2.2} />
            <Text style={styles.langPillText}>{langTag}</Text>
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            ref={scrollRef}
            style={styles.flex}
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
          >
            {/* Logo + which app this is — compact while the keyboard is up */}
            <View style={styles.header}>
              <Image
                source={logo}
                style={keyboardOpen ? styles.logoSmall : styles.logo}
                resizeMode="contain"
              />
              <Text style={styles.title}>
                {isDriver ? t('title_driver_login', 'Driver sign in') : t('title_operator_login', 'Operator sign in')}
              </Text>
              {!keyboardOpen && (
                <Text style={styles.subtitle}>
                  {isDriver
                    ? t('subtitle_driver_login', 'Use the phone number your company registered and your password or licence number.')
                    : t('subtitle_operator_login', 'Use the same account you use on the Mercon dashboard.')}
                </Text>
              )}
            </View>

            <View style={styles.card}>
              <View style={styles.form}>
                <Input
                  label={isDriver ? t('label_phone', 'Phone Number') : t('label_identifier', 'Username, email or phone')}
                  value={identifier}
                  onChangeText={(v) => {
                    setIdentifier(v);
                    if (fieldErrors.identifier) setFieldErrors((e) => ({ ...e, identifier: undefined }));
                  }}
                  placeholder={
                    isDriver
                      ? (selectedCountry.code === '+91' ? '98765 43210' : t('placeholder_phone', '50 000 0001'))
                      : t('placeholder_identifier', 'e.g. ahmed or ahmed@company.com')
                  }
                  keyboardType={isDriver ? 'phone-pad' : 'email-address'}
                  autoCapitalize="none"
                  autoCorrect={false}
                  state={fieldErrors.identifier ? 'error' : 'default'}
                  errorText={fieldErrors.identifier}
                  helperText={
                    !isDriver && identifierIsPhone
                      ? t('hint_signing_in_with_phone', 'Signing in with your phone number')
                      : undefined
                  }
                  iconLeft={identifierIsPhone ? countryChip : <User size={20} color={Colors.gray400} />}
                  inputProps={{
                    returnKeyType: 'next',
                    submitBehavior: 'submit',
                    onSubmitEditing: () => secretRef.current?.focus(),
                    textContentType: isDriver ? 'telephoneNumber' : 'username',
                    autoComplete: isDriver ? 'tel' : 'username',
                    importantForAutofill: 'yes',
                    accessibilityLabel: isDriver ? 'Phone number' : 'Username, email or phone',
                  }}
                />

                <Input
                  ref={secretRef}
                  label={isDriver ? t('label_licence', 'Password or licence number') : t('label_password_only', 'Password')}
                  value={secret}
                  onChangeText={(v) => {
                    setSecret(v);
                    if (fieldErrors.secret) setFieldErrors((e) => ({ ...e, secret: undefined }));
                  }}
                  placeholder={
                    isDriver
                      ? t('placeholder_licence', 'Password or licence number')
                      : t('placeholder_password_only', 'Your password')
                  }
                  // Never change what is typed: a password must reach the server exactly. The
                  // server ignores case, spaces and dashes only when it compares a licence number.
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry={!showSecret}
                  state={fieldErrors.secret ? 'error' : 'default'}
                  errorText={fieldErrors.secret}
                  helperText={isDriver ? t('hint_licence', "Type a password exactly. For a licence number, spaces and dashes don't matter.") : undefined}
                  iconLeft={<Lock size={20} color={Colors.gray400} />}
                  iconRight={
                    <TouchableOpacity
                      onPress={() => setShowSecret((v) => !v)}
                      hitSlop={10}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={showSecret ? 'Hide' : 'Show'}
                    >
                      {showSecret
                        ? <EyeOff size={20} color={Colors.gray400} />
                        : <Eye size={20} color={Colors.gray400} />}
                    </TouchableOpacity>
                  }
                  inputProps={{
                    returnKeyType: 'go',
                    onSubmitEditing: handleSignIn,
                    textContentType: isDriver ? 'none' : 'password',
                    autoComplete: isDriver ? 'off' : 'current-password',
                    importantForAutofill: isDriver ? 'no' : 'yes',
                    accessibilityLabel: isDriver ? 'Password or licence number' : 'Password',
                  }}
                />

                {formError && (
                  <View style={styles.banner} accessibilityLiveRegion="polite">
                    {formError.offline
                      ? <WifiOff size={18} color={Colors.danger} />
                      : <AlertCircle size={18} color={Colors.danger} />}
                    <Text style={styles.bannerText}>{formError.text}</Text>
                  </View>
                )}
                {notice && (
                  <View style={[styles.banner, styles.bannerSuccess]} accessibilityLiveRegion="polite">
                    <Check size={18} color={Colors.success} />
                    <Text style={[styles.bannerText, { color: Colors.success }]}>{notice}</Text>
                  </View>
                )}

                <Button
                  title={loading ? t('action_signing_in', 'Signing In...') : t('action_login', 'Sign In')}
                  onPress={handleSignIn}
                  loading={loading}
                  size="lg"
                  fullWidth
                  iconRight={!loading ? <ArrowRight size={20} color={Colors.white} /> : undefined}
                />
              </View>
            </View>

            <TouchableOpacity
              onPress={() => { clearMessages(); setShowHelp(true); }}
              activeOpacity={0.7}
              style={styles.helpBtn}
              accessibilityRole="button"
            >
              <Headset size={20} color={Colors.primary} />
              <Text style={styles.helpText}>{t('action_cant_sign_in', "Can't sign in?")}</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* "Can't sign in?" sheet */}
        <Modal visible={showHelp} transparent animationType="slide" onRequestClose={() => setShowHelp(false)}>
          <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setShowHelp(false)}>
            <View style={styles.sheet} onStartShouldSetResponder={() => true}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>{t('action_cant_sign_in', "Can't sign in?")}</Text>
                <TouchableOpacity onPress={() => setShowHelp(false)} hitSlop={10} accessibilityLabel="Close">
                  <X size={22} color={Colors.gray500} />
                </TouchableOpacity>
              </View>

              <Text style={styles.sheetBody}>
                {isDriver
                  ? t('help_driver_login', 'Sign in with the phone number your company registered and your password, or the licence number on your driving licence. If it still does not work, ask your operator to check your details.')
                  : t('help_operator_login', 'Use the username, email or phone number and password of your Mercon dashboard account. If you forgot your password, an admin can reset it.')}
              </Text>

              <Button
                title={t('action_notify_operator', 'Notify my operator')}
                onPress={handleNotifyOperator}
                size="lg"
                fullWidth
                iconLeft={<Headset size={20} color={Colors.white} />}
              />
              <Text style={styles.sheetHint}>
                {t('hint_notify_operator', 'We send your operator a message that you need help signing in.')}
              </Text>

              <Button
                title={SUPPORT_EMAIL}
                variant="outline"
                onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {})}
                size="lg"
                fullWidth
                iconLeft={<Mail size={20} color={Colors.primary} />}
              />
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Country code picker */}
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
              <Text style={styles.modalTitle}>{t('title_country_code', 'Select Country Code')}</Text>
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
  flex: {
    flex: 1,
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
    minHeight: 36,
    ...Shadows.sm,
  },
  langPillText: {
    fontSize: Typography.xs,
    fontWeight: '700',
    color: Colors.primary,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  logo: {
    width: 180,
    height: 96,
  },
  logoSmall: {
    width: 110,
    height: 52,
  },
  title: {
    ...Typography.headingXL,
    color: Colors.gray900,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    ...Typography.bodyMedium,
    color: Colors.gray500,
    textAlign: 'center',
    paddingHorizontal: Spacing.md,
  },
  card: {
    marginTop: Spacing.xl,
    backgroundColor: Colors.white,
    borderRadius: Radius['2xl'],
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
    ...Shadows.lg,
  },
  form: {
    gap: Spacing.md,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.dangerLight,
  },
  bannerSuccess: {
    backgroundColor: Colors.successLight,
  },
  bannerText: {
    flex: 1,
    ...Typography.bodySmall,
    color: Colors.danger,
    fontWeight: '600',
  },
  // White pill so it stays readable over the hero picture.
  helpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    minHeight: 48,
    borderRadius: Radius.full,
    backgroundColor: Colors.white,
    ...Shadows.sm,
  },
  helpText: {
    fontSize: Typography.md,
    color: Colors.primary,
    fontWeight: '700',
  },
  countryCodeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 6,
    gap: 4,
    minHeight: 40,
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
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
    padding: Spacing.lg,
    paddingBottom: Spacing['3xl'],
    gap: Spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    ...Typography.headingL,
    color: Colors.gray900,
  },
  sheetBody: {
    ...Typography.bodyMedium,
    color: Colors.gray700,
  },
  sheetHint: {
    ...Typography.caption,
    color: Colors.gray500,
    textAlign: 'center',
    marginTop: -Spacing.xs,
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
    minHeight: 48,
  },
  modalOptionSelected: {
    backgroundColor: Colors.primaryLight,
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

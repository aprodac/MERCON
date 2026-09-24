import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  User,
  Phone,
  BadgeCheck,
  Calendar,
  ShieldCheck,
} from 'lucide-react-native';
import { useLanguage } from '@mercon/mobile-shared/lib/language-context';
import { useProfile } from '../../lib/use-profile';
import { Avatar } from '@mercon/mobile-shared/components/Avatar';
import { initialsOf } from '../../lib/profile';
import { API_URL } from '@mercon/mobile-shared/lib/api';

const FILE_BASE = API_URL.replace(/\/api\/?$/, '');

function resolveAvatarUrl(rawUrl?: string | null): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return `${FILE_BASE}${trimmed.startsWith('/') ? trimmed : '/' + trimmed}`;
  }
  return trimmed;
}

function formatDate(isoStr?: string | null): string {
  if (!isoStr) return '—';
  try {
    return new Date(isoStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

export default function PersonalInfoScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const { profile } = useProfile();

  const avatarUrl = useMemo(
    () => resolveAvatarUrl(profile?.avatar_url),
    [profile?.avatar_url],
  );
  const name = profile
    ? `${profile.first_name} ${profile.last_name}`.trim()
    : '—';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          activeOpacity={0.8}
          onPress={() => router.back()}
        >
          <ArrowLeft size={22} color="#3E3C3D" strokeWidth={2.2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {t('nav_personal_info', 'Personal Information')}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.avatarSection}>
          <View style={styles.avatarWrapper}>
            <Avatar initials={initialsOf(name)} imageUri={avatarUrl} size={100} />
          </View>
          <Text style={styles.nameText}>{name}</Text>
          <Text style={styles.refIdText}>
            {profile?.ref_id ? `ID: ${profile.ref_id}` : '—'}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{'Contact Details'}</Text>
          <View style={styles.row}>
            <View style={styles.iconBox}>
              <Phone size={18} color="#65A30D" />
            </View>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowLabel}>{'Phone Number'}</Text>
              <Text style={styles.rowValue}>{profile?.phone_primary || '—'}</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <View style={styles.iconBox}>
              <User size={18} color="#2563EB" />
            </View>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowLabel}>{'Full Name'}</Text>
              <Text style={styles.rowValue}>{name}</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{'Identity & Licensing'}</Text>
          <View style={styles.row}>
            <View style={styles.iconBox}>
              <BadgeCheck size={18} color="#EA580C" />
            </View>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowLabel}>{'License Number'}</Text>
              <Text style={styles.rowValue}>{profile?.license_number || '—'}</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <View style={styles.iconBox}>
              <Calendar size={18} color="#DC2626" />
            </View>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowLabel}>{'License Expiry'}</Text>
              <Text style={styles.rowValue}>{formatDate(profile?.license_expiry)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{'Account Info'}</Text>
          <View style={styles.row}>
            <View style={styles.iconBox}>
              <ShieldCheck size={18} color="#059669" />
            </View>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowLabel}>{'Status'}</Text>
              <View style={styles.statusPill}>
                <Text style={styles.statusText}>{profile?.status || 'Active'}</Text>
              </View>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <View style={styles.iconBox}>
              <Calendar size={18} color="#4B5563" />
            </View>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowLabel}>{'Joined Date'}</Text>
              <Text style={styles.rowValue}>{formatDate(profile?.createdAt)}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.footerText}>
          {'To edit your personal information, please contact your fleet administrator.'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F4F5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E4E4E7',
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F4F4F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#18181B',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 8,
  },
  avatarWrapper: {
    borderRadius: 999,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 16,
  },
  nameText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#18181B',
    marginBottom: 4,
  },
  refIdText: {
    fontSize: 15,
    color: '#71717A',
    fontWeight: '500',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#A1A1AA',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#F4F4F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  rowTextCol: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 13,
    color: '#71717A',
    marginBottom: 4,
  },
  rowValue: {
    fontSize: 16,
    fontWeight: '500',
    color: '#18181B',
  },
  divider: {
    height: 1,
    backgroundColor: '#F4F4F5',
    marginVertical: 12,
    marginLeft: 56,
  },
  statusPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#059669',
  },
  footerText: {
    textAlign: 'center',
    fontSize: 13,
    color: '#A1A1AA',
    marginTop: 8,
    paddingHorizontal: 20,
    lineHeight: 18,
  },
});

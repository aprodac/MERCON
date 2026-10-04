import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar,
  FlatList, ActivityIndicator, Linking, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, TriangleAlert } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography, Shadows } from '@mercon/mobile-shared/theme/tokens';
import { Badge } from '@mercon/mobile-shared/components/Badge';
import { formatCalendarDate } from '@mercon/mobile-shared/lib/dates';
import { API_URL } from '@mercon/mobile-shared/lib/api';
import { useDocuments, docNameKey, docIcon, docStatus, type DriverDocument, type DocKind } from '@mercon/mobile-shared/lib/documents';

import { useLanguage } from '@mercon/mobile-shared/lib/language-context';
import { flipInRTL } from '@mercon/mobile-shared/lib/rtl';

const FILE_BASE = API_URL.replace(/\/api\/?$/, '');

const BADGE_COLORS: Record<DocKind, { color: string; bg: string }> = {
  expired: { color: '#B91C1C', bg: '#FEE2E2' },
  expiring: { color: '#B45309', bg: '#FEF3C7' },
  pending: { color: '#52525B', bg: '#F4F4F5' },
  valid: { color: '#15803D', bg: '#DCFCE7' },
};

function openFile(fileUrl: string) {
  const url = fileUrl.startsWith('http') ? fileUrl : `${FILE_BASE}${fileUrl}`;
  Linking.openURL(url).catch(() => {});
}

const DocumentCard = ({ doc }: { doc: DriverDocument }) => {
  const st = docStatus(doc);
  const { t } = useLanguage();
  const nameKey = docNameKey(doc);
  return (
    <View style={[styles.card, st.kind === 'expired' ? styles.cardExpired : null]}>
      <View style={styles.cardHeader}>
        <View style={styles.iconBox}>
          {(() => { const Icon = docIcon(doc.doc_type); return <Icon size={22} color={Colors.primary} strokeWidth={2} />; })()}
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.docTitle}>{nameKey.key ? t(nameKey.key, nameKey.name) : nameKey.name}</Text>
          {doc.issue_date ? <Text style={styles.docNumber}>{`${t('label_issued', 'Issued')} ${formatCalendarDate(doc.issue_date)}`}</Text> : null}
        </View>
        <Badge label={t(st.labelKey, st.label)} color={BADGE_COLORS[st.kind].color} bg={BADGE_COLORS[st.kind].bg} />
      </View>

      <View style={styles.expiryRow}>
        <Text style={styles.expiryLabel}>{t('label_expiry', 'Expires')}</Text>
        <Text
          style={[
            styles.expiryValue,
            st.kind === 'expired' ? styles.expiredText : st.kind === 'expiring' ? styles.expiringText : null,
          ]}
        >
          {formatCalendarDate(doc.expiry_date, t('label_no_expiry', 'No expiry'))}
        </Text>
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.viewBtn} activeOpacity={0.8} onPress={() => openFile(doc.file_url)}>
          <Text style={styles.viewBtnText}>{t('action_view', 'View')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const DocumentsScreen = () => {
  const router = useRouter();
  const { documents, loading, error, refetch } = useDocuments();
  const { t } = useLanguage();

  const expiredCount = documents.filter((d) => docStatus(d).kind === 'expired').length;
  const expiringCount = documents.filter((d) => docStatus(d).kind === 'expiring').length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.gray100 }}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} activeOpacity={0.8} onPress={() => router.back()}>
          <ArrowLeft size={22} color={Colors.gray900} strokeWidth={2.2} style={flipInRTL} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('title_my_documents', 'My Documents')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Alert Banner */}
      {(expiredCount > 0 || expiringCount > 0) && (
        <View style={styles.alertBanner}>
          <TriangleAlert size={18} color="#D97706" strokeWidth={2} />
          <Text style={styles.alertText}>
            {expiredCount > 0 && `${t('msg_docs_expired', '{count} document(s) expired.').replace('{count}', String(expiredCount))} `}
            {expiringCount > 0 && t('msg_docs_expiring', '{count} document(s) expire within 30 days.').replace('{count}', String(expiringCount))}
          </Text>
        </View>
      )}

      <FlatList
        data={documents}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading && documents.length > 0} onRefresh={refetch} />}
        renderItem={({ item }) => <DocumentCard doc={item} />}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={Colors.primary} style={{ marginTop: Spacing['3xl'] }} />
          ) : (
            <Text style={styles.emptyText}>{error ?? t('msg_no_documents', 'No documents on file')}</Text>
          )
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  header: {
    backgroundColor: Colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: Colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    fontSize: 20,
    color: Colors.gray900,
  },
  headerTitle: {
    fontSize: Typography.lg,
    fontWeight: '700',
    color: Colors.gray900,
  },
  alertBanner: {
    backgroundColor: '#FFF7ED',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#FED7AA',
  },
  alertIcon: {
    fontSize: 18,
  },
  alertText: {
    fontSize: Typography.sm,
    color: '#92400E',
    fontWeight: '600',
    flex: 1,
  },
  list: {
    padding: Spacing.lg,
    paddingBottom: 140, // clears the floating bottom nav
    gap: Spacing.md,
    flexGrow: 1,
  },
  emptyText: {
    textAlign: 'center',
    color: Colors.gray500,
    fontSize: Typography.sm,
    marginTop: Spacing['3xl'],
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    ...Shadows.sm,
    gap: Spacing.md,
  },
  cardExpired: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.error,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: Radius.lg,
    backgroundColor: Colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  docIcon: {
    fontSize: 24,
  },
  cardInfo: {
    flex: 1,
  },
  docTitle: {
    fontSize: Typography.sm,
    fontWeight: '700',
    color: Colors.gray900,
  },
  docNumber: {
    fontSize: Typography.xs,
    color: Colors.gray500,
    marginTop: 2,
  },
  expiryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.gray50,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  expiryLabel: {
    fontSize: Typography.xs,
    color: Colors.gray500,
  },
  expiryValue: {
    fontSize: Typography.sm,
    fontWeight: '700',
    color: Colors.gray900,
  },
  expiredText: {
    color: Colors.error,
  },
  expiringText: {
    color: '#D97706',
  },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  viewBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.gray300,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  viewBtnText: {
    fontSize: Typography.sm,
    color: Colors.gray700,
    fontWeight: '600',
  },
});

export default DocumentsScreen;

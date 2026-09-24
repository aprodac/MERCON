import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar,
  FlatList, ActivityIndicator, Image, Linking, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Camera, Image as ImageIcon, Package, FileCheck, MapPin } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography, Shadows } from '@mercon/mobile-shared/theme/tokens';
import { API_URL } from '@mercon/mobile-shared/lib/api';
import { useCargoPodPhotos, docTypeLabel, type DriverDocument } from '@mercon/mobile-shared/lib/documents';
import { useLanguage } from '@mercon/mobile-shared/lib/language-context';
import { GoogleMapsGeotagPreview } from '../../components';

const FILE_BASE = API_URL.replace(/\/api\/?$/, '');

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function openFile(fileUrl: string) {
  const url = fileUrl.startsWith('http') ? fileUrl : `${FILE_BASE}${fileUrl}`;
  Linking.openURL(url).catch(() => {});
}

const PhotoCard = ({ photo }: { photo: DriverDocument & { customer_name?: string } }) => {
  const { t } = useLanguage();
  const fullUrl = photo.file_url.startsWith('http') ? photo.file_url : `${FILE_BASE}${photo.file_url}`;
  const isPod = photo.doc_type === 'POD';

  return (
    <View style={styles.card}>
      <TouchableOpacity activeOpacity={0.85} onPress={() => openFile(photo.file_url)}>
        <Image source={{ uri: fullUrl }} style={styles.image} resizeMode="cover" />
      </TouchableOpacity>

      <View style={styles.cardBody}>
        <View style={styles.cardHeader}>
          <View style={[styles.typeBadge, isPod ? styles.podBadge : styles.cargoBadge]}>
            {isPod ? <FileCheck size={12} color="#0369A1" /> : <Package size={12} color="#C7380A" />}
            <Text style={[styles.typeBadgeText, isPod ? styles.podBadgeText : styles.cargoBadgeText]}>
              {isPod ? t('title_pod_details', 'Proof of Delivery (POD)') : t('title_cargo_pickup_photo', 'Cargo Pickup Photo')}
            </Text>
          </View>
          <Text style={styles.dateText}>{formatDate(photo.createdAt)}</Text>
        </View>

        <View style={styles.tripInfoRow}>
          <Text style={[styles.tripRef, { writingDirection: 'ltr' }]}>
            {photo.trip_ref_id ? `${t('label_trip', 'Trip')} #${photo.trip_ref_id}` : t('label_general_attachment', 'General Attachment')}
          </Text>
          {photo.customer_name && photo.customer_name !== '—' && (
            <Text style={styles.customerName} numberOfLines={1}>
              {photo.customer_name}
            </Text>
          )}
        </View>

        {(() => {
          const text = (photo as any).ocr_raw_text || (photo as any).notes;
          if (!text || !text.includes('[GPS:')) return null;

          // Format: 📍 [GPS: 24.7136, 46.6753 • Riyadh] Captured: 2026-08-23...
          const gpsMatch = text.match(/\[GPS:\s*([-\d.]+),\s*([-\d.]+)(?:\s*•\s*([^\]]+))?\]/);
          if (!gpsMatch) return null;

          const lat = parseFloat(gpsMatch[1]);
          const lng = parseFloat(gpsMatch[2]);
          const addr = gpsMatch[3]?.trim();

          return (
            <GoogleMapsGeotagPreview
              latitude={lat}
              longitude={lng}
              address={addr}
            />
          );
        })()}

        <TouchableOpacity style={styles.viewBtn} activeOpacity={0.8} onPress={() => openFile(photo.file_url)}>
          <ImageIcon size={14} color={Colors.primary} />
          <Text style={styles.viewBtnText}>{t('action_view_full_photo', 'View Full Photo')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export function CargoPodPhotosScreen() {
  const router = useRouter();
  const { photos, loading, error, refetch } = useCargoPodPhotos();
  const { t } = useLanguage();
  const [filter, setFilter] = useState<'all' | 'cargo' | 'pod'>('all');

  const filteredPhotos = photos.filter((p) => {
    if (filter === 'cargo') return p.doc_type === 'Waybill';
    if (filter === 'pod') return p.doc_type === 'POD';
    return true;
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.gray100 }}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} activeOpacity={0.8} onPress={() => router.back()}>
          <ArrowLeft size={22} color={Colors.gray900} strokeWidth={2.2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('title_cargo_pod_photos', 'Cargo & POD Photos')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Category Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabBtn, filter === 'all' && styles.tabBtnActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.tabText, filter === 'all' && styles.tabTextActive]}>
            {t('filter_all', 'All')} ({photos.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, filter === 'cargo' && styles.tabBtnActive]}
          onPress={() => setFilter('cargo')}
        >
          <Text style={[styles.tabText, filter === 'cargo' && styles.tabTextActive]}>
            {t('filter_cargo', 'Cargo')} ({photos.filter((p) => p.doc_type === 'Waybill').length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, filter === 'pod' && styles.tabBtnActive]}
          onPress={() => setFilter('pod')}
        >
          <Text style={[styles.tabText, filter === 'pod' && styles.tabTextActive]}>
            {t('filter_pod', 'POD')} ({photos.filter((p) => p.doc_type === 'POD').length})
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredPhotos}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading && photos.length > 0} onRefresh={refetch} />}
        renderItem={({ item }) => <PhotoCard photo={item} />}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={Colors.primary} style={{ marginTop: Spacing['3xl'] }} />
          ) : (
            <Text style={styles.emptyText}>{error ?? t('msg_no_photos_uploaded', 'No photos uploaded yet.')}</Text>
          )
        }
      />
    </SafeAreaView>
  );
}

export default CargoPodPhotosScreen;

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
  headerTitle: {
    fontSize: Typography.lg,
    fontWeight: '700',
    color: Colors.gray900,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs + 2,
    gap: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.lg,
    alignItems: 'center',
  },
  tabBtnActive: {
    backgroundColor: Colors.primaryLight,
  },
  tabText: {
    fontSize: Typography.xs,
    fontWeight: '600',
    color: Colors.gray600,
  },
  tabTextActive: {
    color: Colors.primaryDark,
    fontWeight: '700',
  },
  list: {
    padding: Spacing.lg,
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
    overflow: 'hidden',
    ...Shadows.sm,
  },
  image: {
    width: '100%',
    height: 180,
    backgroundColor: Colors.gray200,
  },
  cardBody: {
    padding: Spacing.md,
    gap: Spacing.xs + 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  cargoBadge: {
    backgroundColor: Colors.primaryLight,
  },
  podBadge: {
    backgroundColor: '#F0F9FF',
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  cargoBadgeText: {
    color: Colors.primaryDark,
  },
  podBadgeText: {
    color: '#0369A1',
  },
  dateText: {
    fontSize: Typography.xs,
    color: Colors.gray400,
  },
  tripInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  tripRef: {
    fontSize: Typography.sm,
    fontWeight: '700',
    color: Colors.gray900,
  },
  customerName: {
    fontSize: Typography.xs,
    color: Colors.gray500,
    flexShrink: 1,
  },
  geoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: Radius.md,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 4,
  },
  geoText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#047857',
  },
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.gray300,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.sm - 2,
    marginTop: Spacing.xs,
  },
  viewBtnText: {
    fontSize: Typography.xs,
    color: Colors.primary,
    fontWeight: '600',
  },
});

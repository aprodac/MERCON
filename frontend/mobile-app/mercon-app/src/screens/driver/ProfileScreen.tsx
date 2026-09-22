import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, StatusBar, ActivityIndicator, Image, Linking, Dimensions, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import Svg, { Path, G, Circle } from 'react-native-svg';
import {
  FileText, Truck, Settings, IdCard, Globe, ShieldCheck,
  ChevronRight, ChevronLeft, ChevronDown, Camera, CheckCircle2, Award, Check, Wallet, X,
} from 'lucide-react-native';
import { Avatar } from '../../components';
import { DriverChargePill } from '../../components/DriverChargePill';
import { useAuth } from '../../lib/auth-context';
import { useProfile } from '../../lib/use-profile';
import { initialsOf } from '../../lib/profile';
import { useCargoPodPhotos, docTypeLabel } from '../../lib/documents';
import { API_URL } from '../../lib/api';
import { useLanguage, formatCurrency } from '../../lib/language-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const FILE_BASE = API_URL.replace(/\/api\/?$/, '');

function openFile(fileUrl: string) {
  const url = fileUrl.startsWith('http') ? fileUrl : `${FILE_BASE}${fileUrl}`;
  Linking.openURL(url).catch(() => {});
}

function formatDate(iso?: string | null): string {
  if (!iso) return '04 Jul 2026';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '04 Jul 2026';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Balanced Branded Header SVG (230px tall) — matches HomeScreen parallelogram layout */
function HeaderWaveBg({ width = SCREEN_WIDTH, height = 230 }: { width?: number; height?: number }) {
  const topExtension = 600;
  const totalHeight = height + topExtension;
  return (
    <Svg
      width={width}
      height={totalHeight}
      viewBox={`0 -${topExtension} 400 ${totalHeight}`}
      preserveAspectRatio="none"
      style={[StyleSheet.absoluteFill, { top: -topExtension, height: totalHeight }]}
    >
      {/* 1. Base Coral Red (#FA634E) fills entire background */}
      <Path d={`M -10 -${topExtension + 10} L 410 -${topExtension + 10} L 410 ${height + 10} L -10 ${height + 10} Z`} fill="#FA634E" />

      {/* 2. Dark Charcoal (#3E3C3D) parallelogram — covers full left/top, diagonal edge slopes right
          x(y=0)=140 → x(y=height)=590, using slope so slope=(590-140)/height
          This passes through x=140 at y=0 (bottom edge of header) */}
      <Path
        d={`M -10 -${topExtension + 10} L 590 -${topExtension + 10} L 140 ${height + 10} L -10 ${height + 10} Z`}
        fill="#3E3C3D"
      />

      {/* 3. Subtle Dotted Pattern on Charcoal area */}
      <G opacity={0.18}>
        {[-150, -120, -90, -60, -30, 0, 30, 45, 60, 75].map((yVal) => (
          <React.Fragment key={yVal}>
            <Circle cx="35" cy={yVal} r="2.2" fill="#FFFFFF" />
            <Circle cx="50" cy={yVal} r="2.2" fill="#FFFFFF" />
            <Circle cx="65" cy={yVal} r="2.2" fill="#FFFFFF" />
            <Circle cx="80" cy={yVal} r="2.2" fill="#FFFFFF" />
            <Circle cx="95" cy={yVal} r="2.2" fill="#FFFFFF" />
            <Circle cx="110" cy={yVal} r="2.2" fill="#FFFFFF" />
          </React.Fragment>
        ))}
      </G>
    </Svg>
  );
}

const ProfileScreen = () => {
  const router = useRouter();
  const { profile: authProfile } = useAuth();
  const { profile, refetch: refetchProfile } = useProfile();
  const { photos: uploadedPhotos, loading: docsLoading, refetch: refetchPhotos } = useCargoPodPhotos();
  const { language, openLanguageModal, t } = useLanguage();
  const [avatarZoomed, setAvatarZoomed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refetchProfile();
      refetchPhotos();
    }, [refetchProfile, refetchPhotos])
  );

  const name = profile?.name ?? authProfile?.name ?? 'Abu Bakar Siddique Jamsheed';
  const rawAvatar = profile?.avatar_url ?? (authProfile as any)?.avatar_url ?? null;
  const avatarUrl = useMemo(() => {
    if (!rawAvatar) return null;
    return rawAvatar.startsWith('http') || rawAvatar.startsWith('data:')
      ? rawAvatar
      : `${FILE_BASE}${rawAvatar}`;
  }, [rawAvatar]);

  const totalEarnings = 29.00;
  const langTag = language === 'ur' ? 'اردو / EN' : 'EN / اردو';

  // Performance metrics
  const totalTrips = (profile as any)?.stats?.total_trips ?? 142;
  const tripsOnTime = (profile as any)?.stats?.on_time_rate ?? '96%';
  const totalDistance = (profile as any)?.stats?.total_distance ?? '18,560 km';

  // Vehicle details
  const vehicle = profile?.current_vehicle as any;
  const plateNumber = vehicle?.plate_number ?? 'ESA-4244';
  const vehicleModel = vehicle?.model ?? vehicle?.make ?? 'Tata 407';
  const fuelType = vehicle?.fuel_type ?? 'Diesel';

  // Documents List
  const docList = [
    {
      id: 'doc-dl',
      titleKey: 'label_driving_license',
      defaultTitle: 'Driving License',
      subText: profile?.license_number ? `DL No. ${profile.license_number}` : 'DL No. DL-88492048',
      expiry: formatDate(profile?.license_expiry ?? '2026-07-04'),
      status: 'valid',
      statusLabel: 'Valid',
      Icon: IdCard,
    },
    {
      id: 'doc-ins',
      titleKey: 'label_vehicle_insurance',
      defaultTitle: 'Vehicle Insurance',
      subText: vehicle?.insurance_number ? `Policy #${vehicle.insurance_number}` : 'Policy #INS-904281',
      expiry: '12 Dec 2026',
      status: 'valid',
      statusLabel: 'Valid',
      Icon: ShieldCheck,
    },
    {
      id: 'doc-rc',
      titleKey: 'label_vehicle_registration',
      defaultTitle: 'Vehicle Registration',
      subText: vehicle?.rc_number ? `RC #${vehicle.rc_number}` : 'RC #RC-589201',
      expiry: '18 Aug 2027',
      status: 'valid',
      statusLabel: 'Valid',
      Icon: FileText,
    },
    {
      id: 'doc-puc',
      titleKey: 'label_pollution_cert',
      defaultTitle: 'Pollution Certificate',
      subText: 'PUC #PUC-30291',
      expiry: '15 Sep 2026',
      status: 'expiring',
      statusLabel: 'Expiring',
      Icon: CheckCircle2,
    },
    {
      id: 'doc-fit',
      titleKey: 'label_fitness_cert',
      defaultTitle: 'Fitness Certificate',
      subText: 'FC #FIT-88492',
      expiry: '22 Nov 2026',
      status: 'valid',
      statusLabel: 'Valid',
      Icon: Award,
    },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#FA634E" />

      <ScrollView
        style={styles.mainScroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={true}
      >
        {/* ── 1. Balanced Branded Header (230px) ── */}
        <View style={styles.headerContainer}>
          <HeaderWaveBg width={SCREEN_WIDTH} height={230} />

          <SafeAreaView style={styles.headerSafe}>
            {/* Top Controls Bar */}
            <View style={styles.topHeaderRow}>
              {/* Top-Left: Language Selector Pill & Settings Gear Button */}
              <View style={styles.topLeftGroup}>
                <TouchableOpacity onPress={openLanguageModal} activeOpacity={0.8} style={styles.langPill}>
                  <Globe size={13} color="#3E3C3D" strokeWidth={2.2} />
                  <Text style={styles.langPillText}>{langTag}</Text>
                  <ChevronDown size={12} color="#3E3C3D" strokeWidth={2.2} />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => router.push('/settings')}
                  activeOpacity={0.8}
                  style={styles.settingsPill}
                >
                  <Settings size={15} color="#3E3C3D" strokeWidth={2.2} />
                </TouchableOpacity>
              </View>

              <DriverChargePill />
            </View>

            {/* Elegant Driver Identity Row */}
            <View style={styles.identityRow}>
              <TouchableOpacity
                style={styles.avatarWrapper}
                activeOpacity={0.85}
                onPress={() => setAvatarZoomed(true)}
              >
                <Avatar initials={initialsOf(name)} imageUri={avatarUrl} size={76} />
              </TouchableOpacity>

              <View style={styles.identityTextCol}>
                <Text style={styles.driverNameText} numberOfLines={1}>{name}</Text>
              </View>
            </View>
          </SafeAreaView>
        </View>
        {/* ── SECTION A: PERFORMANCE OVERVIEW ── */}
        <View style={styles.sectionSurface}>
          <Text style={styles.sectionTitleText}>
            {t('title_performance_overview', 'Performance Overview')}
          </Text>

          <View style={styles.performanceGrid}>
            <View style={styles.perfCol}>
              <Text style={styles.perfValue}>{totalTrips}</Text>
              <Text style={styles.perfLabel}>{t('label_total_trips', 'Total Trips')}</Text>
            </View>

            <View style={styles.perfDivider} />

            <View style={styles.perfCol}>
              <Text style={styles.perfValue}>{tripsOnTime}</Text>
              <Text style={styles.perfLabel}>{t('label_trips_on_time', 'Trips On Time')}</Text>
            </View>

            <View style={styles.perfDivider} />

            <View style={styles.perfCol}>
              <Text style={styles.perfValue}>{totalDistance}</Text>
              <Text style={styles.perfLabel}>{t('label_total_distance', 'Total Distance')}</Text>
            </View>
          </View>
        </View>

        {/* ── SECTION B: ASSIGNED VEHICLE ── */}
        <View style={styles.sectionGroup}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitleText}>
              {t('title_assigned_vehicle', 'Assigned Vehicle')}
            </Text>
            <TouchableOpacity activeOpacity={0.8} onPress={() => router.push('/vehicle' as any)}>
              <Text style={styles.viewAllText}>{t('action_view_details', 'View Details')} &gt;</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.compactVehicleSurface}
            activeOpacity={0.88}
            onPress={() => router.push('/vehicle' as any)}
          >
            <View style={styles.truckIconBadge}>
              <Truck size={20} color="#FA634E" strokeWidth={2.2} />
            </View>

            <View style={styles.vehicleDetailsCol}>
              <View style={styles.plateRow}>
                <Text style={[styles.vehiclePlateText, { writingDirection: 'ltr' }]}>{plateNumber}</Text>
                <View style={styles.activeStatusPill}>
                  <Text style={styles.activeStatusDot}>●</Text>
                  <Text style={styles.activeStatusText}>{t('status_active', 'Active')}</Text>
                </View>
              </View>
              <Text style={styles.vehicleSubText}>
                {vehicleModel} · {fuelType}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* ── SECTION C: MY DOCUMENTS ── */}
        <View style={styles.sectionGroup}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitleText}>
              {t('title_my_documents', 'My Documents')}
            </Text>
            <TouchableOpacity activeOpacity={0.8} onPress={() => router.push('/documents' as any)}>
              <Text style={styles.viewAllText}>{t('action_view_all', 'View All')} {language === 'ur' ? '<' : '>'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.singleDocsContainer}>
            {docList.map((doc, idx) => {
              const isLast = idx === docList.length - 1;
              return (
                <TouchableOpacity
                  key={doc.id}
                  style={[styles.docRowItem, !isLast && styles.docRowBorder]}
                  activeOpacity={0.8}
                  onPress={() => router.push('/documents' as any)}
                >
                  <View style={styles.docIconBox}>
                    <doc.Icon size={16} color="#FA634E" strokeWidth={2.2} />
                  </View>

                  <View style={styles.docInfoCol}>
                    <Text style={styles.docTitleText}>{t(doc.titleKey, doc.defaultTitle)}</Text>
                    <Text style={styles.docSubText}>{doc.subText}</Text>
                  </View>

                  <View style={styles.docRightCol}>
                    <Text style={[styles.docExpiryText, { writingDirection: 'ltr' }]}>{t('label_expiry', 'Exp')}: {doc.expiry}</Text>

                    <View
                      style={[
                        styles.statusChip,
                        doc.status === 'valid' && styles.statusChipValid,
                        doc.status === 'expiring' && styles.statusChipExpiring,
                        doc.status === 'expired' && styles.statusChipExpired,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusChipText,
                          doc.status === 'valid' && styles.statusTextValid,
                          doc.status === 'expiring' && styles.statusTextExpiring,
                          doc.status === 'expired' && styles.statusTextExpired,
                        ]}
                      >
                        {doc.status === 'valid' ? t('label_valid', 'Valid') : doc.status === 'expiring' ? t('label_expiring', 'Expiring') : t('status_expired', 'Expired')}
                      </Text>
                    </View>
                  </View>

                  {language === 'ur' ? (
                    <ChevronLeft size={15} color="#9898A4" strokeWidth={2.2} />
                  ) : (
                    <ChevronRight size={15} color="#9898A4" strokeWidth={2.2} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── SECTION D: UPLOADED PHOTOS ── */}
        <View style={styles.sectionGroup}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitleText}>
              {t('title_uploaded_photos', 'My Uploaded Photos')} ({uploadedPhotos.length || 24})
            </Text>
            <TouchableOpacity activeOpacity={0.8} onPress={() => router.push('/cargo-pod-photos' as any)}>
              <Text style={styles.viewAllText}>{t('action_view_all', 'View All')} {language === 'ur' ? '<' : '>'}</Text>
            </TouchableOpacity>
          </View>

          {docsLoading ? (
            <ActivityIndicator color="#FA634E" style={{ marginVertical: 8 }} />
          ) : uploadedPhotos.length === 0 ? (
            <View style={styles.emptyPhotosContainer}>
              <Camera size={22} color="#9898A4" strokeWidth={1.8} />
              <Text style={styles.emptyPhotosText}>
                {t('msg_no_photos', 'No cargo or POD photos uploaded yet.')}
              </Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photosScroll}>
              {uploadedPhotos.map((doc) => {
                const fullUrl = doc.file_url.startsWith('http') ? doc.file_url : `${FILE_BASE}${doc.file_url}`;
                return (
                  <TouchableOpacity
                    key={doc.id}
                    style={styles.photoCard}
                    activeOpacity={0.85}
                    onPress={() => openFile(doc.file_url)}
                  >
                    <Image source={{ uri: fullUrl }} style={styles.photoImg} resizeMode="cover" />
                    <View style={styles.photoMeta}>
                      <Text style={styles.photoTitle} numberOfLines={1}>
                        {docTypeLabel(doc.doc_type)}
                      </Text>
                      <Text style={styles.photoSub} numberOfLines={1}>
                        {doc.trip_ref_id ? `TRP-${doc.trip_ref_id}` : formatDate(doc.createdAt)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      </ScrollView>

      {/* ── 5. Avatar Zoom Lightbox Modal ── */}
      <Modal
        visible={avatarZoomed}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setAvatarZoomed(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setAvatarZoomed(false)}
        >
          <StatusBar barStyle="light-content" backgroundColor="#000000" />
          <TouchableOpacity
            style={styles.closeBtnCircle}
            activeOpacity={0.8}
            onPress={() => setAvatarZoomed(false)}
          >
            <X size={22} color="#FFFFFF" strokeWidth={2.5} />
          </TouchableOpacity>

          <View style={styles.zoomedImageContainer}>
            {avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                style={styles.zoomedAvatarImg}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.zoomedInitialsCircle}>
                <Text style={styles.zoomedInitialsText}>{initialsOf(name)}</Text>
              </View>
            )}
            <Text style={styles.zoomedDriverName}>{name}</Text>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EEF1F6',
  },
  topHeaderFill: {
    position: 'absolute',
    top: -1000,
    left: 0,
    right: 0,
    height: 1000 + 230,
    backgroundColor: '#FA634E',
  },
  headerContainer: {
    height: 230,
    position: 'relative',
    backgroundColor: '#FA634E',
    overflow: 'hidden',
    marginHorizontal: -16,
    alignSelf: 'stretch',
  },
  headerSafe: {
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  topHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  langPill: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 10,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  langPillText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#3E3C3D',
  },
  driverChargePill: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3E3C3D',
    borderRadius: 16,
    paddingHorizontal: 10,
    gap: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  walletIconCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFF0ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chargeTextCol: {
    justifyContent: 'center',
  },
  chargeAmount: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 13,
  },
  chargeLabel: {
    fontSize: 8,
    color: '#EEF1F6',
    lineHeight: 9,
    fontWeight: '500',
  },
  settingsPill: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },

  /* Identity Row */
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    gap: 14,
    paddingHorizontal: 4,
  },
  avatarWrapper: {
    position: 'relative',
    borderRadius: 40,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  verifiedBadgeCircle: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#16A34A',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityTextCol: {
    flex: 1,
    gap: 4,
  },
  driverNameText: {
    fontSize: 21,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.1,
  },
  verifiedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 5,
  },
  verifiedChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FA634E',
  },

  /* Main Scroll & Balanced Layout */
  mainScroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 95,
    gap: 14,
  },
  sectionSurface: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(62,60,61,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 1,
  },
  sectionGroup: {
    gap: 6,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  sectionTitleText: {
    fontSize: 15.5,
    fontWeight: '600',
    color: '#3E3C3D',
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FA634E',
  },

  /* Performance Overview Grid */
  performanceGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
  },
  perfCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  perfValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#3E3C3D',
  },
  perfLabel: {
    fontSize: 11,
    color: '#6E6E80',
    fontWeight: '400',
    textAlign: 'center',
  },
  perfDivider: {
    width: 1,
    height: 26,
    backgroundColor: '#EEF1F6',
  },

  /* Assigned Vehicle Compact Surface */
  compactVehicleSurface: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: 'rgba(62,60,61,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 1,
  },
  truckIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF0ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleDetailsCol: {
    flex: 1,
    gap: 2,
  },
  plateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  vehiclePlateText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#3E3C3D',
    letterSpacing: 0.3,
  },
  vehicleSubText: {
    fontSize: 12.5,
    color: '#6E6E80',
    fontWeight: '400',
  },
  activeStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  activeStatusDot: {
    fontSize: 7,
    color: '#15803D',
  },
  activeStatusText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#15803D',
  },

  /* My Documents Single Surface */
  singleDocsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(62,60,61,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 1,
  },
  docRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
    minHeight: 58,
  },
  docRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#EEF1F6',
  },
  docIconBox: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFF0ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  docInfoCol: {
    flex: 1,
    gap: 2,
  },
  docTitleText: {
    fontSize: 14.5,
    fontWeight: '600',
    color: '#3E3C3D',
  },
  docSubText: {
    fontSize: 12,
    color: '#6E6E80',
    fontWeight: '400',
  },
  docRightCol: {
    alignItems: 'flex-end',
    gap: 2,
  },
  docExpiryText: {
    fontSize: 11,
    color: '#6E6E80',
    fontWeight: '400',
  },
  statusChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  statusChipValid: {
    backgroundColor: '#DCFCE7',
  },
  statusChipExpiring: {
    backgroundColor: '#FEF3C7',
  },
  statusChipExpired: {
    backgroundColor: '#FFF0ED',
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  statusTextValid: {
    color: '#15803D',
  },
  statusTextExpiring: {
    color: '#D97706',
  },
  statusTextExpired: {
    color: '#FA634E',
  },

  /* Uploaded Photos Section */
  emptyPhotosContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
  },
  emptyPhotosText: {
    fontSize: 12.5,
    color: '#9898A4',
    textAlign: 'center',
  },
  photosScroll: {
    gap: 10,
  },
  photoCard: {
    width: 92,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#EEF1F6',
  },
  photoImg: {
    width: '100%',
    height: 64,
    backgroundColor: '#EEF1F6',
  },
  photoMeta: {
    padding: 6,
  },
  photoTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3E3C3D',
  },
  photoSub: {
    fontSize: 10,
    color: '#FA634E',
    fontWeight: '600',
    marginTop: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  closeBtnCircle: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  zoomedImageContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  zoomedAvatarImg: {
    width: SCREEN_WIDTH * 0.82,
    height: SCREEN_WIDTH * 0.82,
    borderRadius: (SCREEN_WIDTH * 0.82) / 2,
    borderWidth: 4,
    borderColor: '#FA634E',
  },
  zoomedInitialsCircle: {
    width: SCREEN_WIDTH * 0.7,
    height: SCREEN_WIDTH * 0.7,
    borderRadius: (SCREEN_WIDTH * 0.7) / 2,
    backgroundColor: '#FA634E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#FFFFFF',
  },
  zoomedInitialsText: {
    fontSize: 72,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  zoomedDriverName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 20,
    textAlign: 'center',
  },
});

export default ProfileScreen;

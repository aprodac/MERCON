import React, { useMemo, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar,
  ScrollView, ActivityIndicator, RefreshControl, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  ArrowLeft, Building2, Calendar, CheckCircle2, ChevronRight, ChevronLeft,
  Wallet, ArrowRight, CalendarClock, TriangleAlert,
} from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography, Shadows } from '../../theme/tokens';
import { useCurrentTrip } from '../../lib/use-current-trip';
import { useScheduledTrips } from '../../lib/use-scheduled-trips';
import { useTripHistory } from '../../lib/use-trip-history';
import { statusLabel, stopLabel, getTripChargeValue, getMonthlyDriverPayout, type MobileTrip, type TripStatus } from '../../lib/trips';
import { useLanguage, formatCurrency, LanguageMode } from '../../lib/language-context';
import { API_URL } from '../../lib/api';

const FILE_BASE = API_URL.replace(/\/api\/?$/, '');

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatRelativeDate(iso?: string | null, lang: LanguageMode = 'en'): string {
  if (!iso) return lang === 'ur' ? 'شیڈول شدہ' : 'Scheduled';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return lang === 'ur' ? 'شیڈول شدہ' : 'Scheduled';
  const now = new Date();
  const diffDays = Math.round((d.getTime() - now.getTime()) / (1000 * 3600 * 24));
  if (diffDays === 0) return lang === 'ur' ? 'آج' : 'Today';
  if (diffDays === 1) return lang === 'ur' ? 'کل، 09:00 AM' : 'Tomorrow, 09:00 AM';
  if (diffDays > 1 && diffDays <= 7) return lang === 'ur' ? `${diffDays} دنوں میں` : `In ${diffDays} days`;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function isValidUri(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (trimmed.length < 7) return false;
  return (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('file://') ||
    trimmed.startsWith('data:')
  );
}

function resolveLogoUrl(rawLogo?: string | null): string | null {
  if (!rawLogo || typeof rawLogo !== 'string') return null;
  const trimmed = rawLogo.trim();
  if (!trimmed) return null;
  let fullUrl = trimmed;
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://') && !trimmed.startsWith('file://') && !trimmed.startsWith('data:')) {
    const cleanPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    fullUrl = `${FILE_BASE}${cleanPath}`;
  }
  return isValidUri(fullUrl) ? fullUrl : null;
}

const ChargeRowItem = ({
  item,
  isUpcoming,
  onPress,
  t,
  language,
}: {
  item: MobileTrip;
  isUpcoming: boolean;
  onPress: () => void;
  t: any;
  language: LanguageMode;
}) => {
  const [imgError, setImgError] = useState(false);
  const pickup = item.stops?.find((s) => s.stop_type === 'Pickup');
  const dropoff = item.stops?.find((s) => s.stop_type === 'Dropoff');
  const fromCity = stopLabel(pickup) ?? 'Mercon Hub';
  const toCity = stopLabel(dropoff) ?? 'Destination';
  const dateSource = item.actual_end ?? item.planned_end ?? item.actual_start ?? item.planned_start ?? null;

  const rawLogo = item.customer?.logo_url || null;
  const logoUrl = resolveLogoUrl(rawLogo);
  const showLogo = logoUrl && !imgError;

  const chargeVal = getTripChargeValue(item);
  const chargeText = formatCurrency(chargeVal, language);
  const displayId = item.ref_id ?? item.id.slice(0, 8);

  return (
    <TouchableOpacity style={styles.rowWrapper} activeOpacity={0.85} onPress={onPress}>
      {/* Company Logo */}
      {showLogo ? (
        <View style={styles.rowLogoBoxClean}>
          <Image
            source={{ uri: logoUrl! }}
            style={styles.rowLogoImgClean}
            resizeMode="contain"
            fadeDuration={0}
            onError={() => setImgError(true)}
          />
        </View>
      ) : (
        <View style={styles.rowLogoBoxFallback}>
          <Building2 size={20} color="#FA634E" strokeWidth={2} />
        </View>
      )}

      {/* Main Details Column */}
      <View style={styles.rowContentCol}>
        <Text style={styles.rowCompanyName} numberOfLines={1}>
          {item.customer?.name ?? 'Mercon Logistics'}
        </Text>

        {/* Route */}
        <View style={styles.rowRouteLine}>
          <Text style={styles.rowCityText} numberOfLines={1}>{fromCity}</Text>
          {language === 'ur' ? (
            <ArrowLeft size={14} color="#FA634E" strokeWidth={2.5} style={styles.rowArrow} />
          ) : (
            <ArrowRight size={14} color="#FA634E" strokeWidth={2.5} style={styles.rowArrow} />
          )}
          <Text style={styles.rowCityText} numberOfLines={1}>{toCity}</Text>
        </View>

        {/* Trip ID & Date */}
        <View style={styles.rowMetaLine}>
          <Text style={[styles.rowMetaText, { writingDirection: 'ltr' }]}>TRP-{displayId}</Text>
          <Text style={styles.rowMetaDot}>·</Text>
          <Text style={[styles.rowMetaText, isUpcoming && styles.rowMetaTextUpcoming]}>
            {isUpcoming ? formatRelativeDate(dateSource, language) : formatDateTime(dateSource)}
          </Text>
        </View>
      </View>

      {/* Right Column: Driver Charge & Chevron */}
      <View style={styles.rowRightCol}>
        <Text style={[styles.rowChargeAmount, isUpcoming ? styles.rowChargeUpcoming : styles.rowChargeEarned, { writingDirection: 'ltr' }]}>
          {chargeText}
        </Text>
        {language === 'ur' ? (
          <ChevronLeft size={16} color="#9898A4" strokeWidth={2} />
        ) : (
          <ChevronRight size={16} color="#9898A4" strokeWidth={2} />
        )}
      </View>
    </TouchableOpacity>
  );
};

const DriverChargesScreen = ({ navigation }: any) => {
  const router = useRouter();
  const { t, language } = useLanguage();

  const { trip: currentTrip, loading: loadingCurrent, refetch: refetchCurrent } = useCurrentTrip();
  const { trips: scheduledList, loading: loadingScheduled, refetch: refetchScheduled } = useScheduledTrips();
  const { trips: historyList, loading: loadingHistory, refetch: refetchHistory } = useTripHistory();

  useFocusEffect(
    useCallback(() => {
      refetchCurrent();
      refetchScheduled();
      refetchHistory();
    }, [refetchCurrent, refetchScheduled, refetchHistory])
  );

  const loading = loadingCurrent || loadingScheduled || loadingHistory;

  // Filter Earned Trips (Completed / Invoiced)
  const earnedTrips = useMemo(() => {
    return historyList.filter((t) => t.status === 'Completed' || t.status === 'Invoiced');
  }, [historyList]);

  // Filter Upcoming Trips (Scheduled / Active)
  const upcomingTrips = useMemo(() => {
    const map = new Map<string, MobileTrip>();
    scheduledList.forEach((t) => {
      if (t.status !== 'Completed' && t.status !== 'Cancelled' && t.status !== 'Invoiced') {
        map.set(t.id, t);
      }
    });
    if (currentTrip && currentTrip.status !== 'Completed' && currentTrip.status !== 'Cancelled' && currentTrip.status !== 'Invoiced') {
      map.set(currentTrip.id, currentTrip);
    }
    return Array.from(map.values());
  }, [scheduledList, currentTrip]);

  // Calculations
  const monthlyEarnedTotal = useMemo(() => {
    return getMonthlyDriverPayout(historyList);
  }, [historyList]);

  const earnedTotal = useMemo(() => {
    return earnedTrips.reduce((sum, t) => sum + getTripChargeValue(t), 0);
  }, [earnedTrips]);

  const upcomingTotal = useMemo(() => {
    return upcomingTrips.reduce((sum, t) => sum + getTripChargeValue(t), 0);
  }, [upcomingTrips]);

  const totalCharges = earnedTotal + upcomingTotal;

  const onRefresh = () => {
    refetchCurrent();
    refetchScheduled();
    refetchHistory();
  };

  const handleCardPress = (tripId: string) => {
    router.push({ pathname: '/trip/details', params: { tripId } } as any);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#EEF1F6" />

      {/* 1. Header: Back Arrow + Page Title (NO balance pill, NO duplicate chip) */}
      <View style={styles.topHeaderBar}>
        <TouchableOpacity style={styles.backBtn} activeOpacity={0.8} onPress={() => router.back()}>
          <ArrowLeft size={22} color="#3E3C3D" strokeWidth={2.2} />
        </TouchableOpacity>
        <Text style={styles.screenTitle}>{t('title_driver_charges', 'Driver Charges')}</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor="#FA634E" />}
      >
        {/* 2. Total Charges Summary Card (Coral Red #FA634E card with filled gray watermark Wallet icon & white sub-container) */}
        <View style={styles.summaryCardOrange}>
          {/* Bright, bold, filled white watermark Wallet icon */}
          <View style={styles.watermarkIconBox} pointerEvents="none">
            <Wallet size={170} color="#FFFFFF" fill="rgba(255, 255, 255, 0.35)" opacity={0.55} strokeWidth={2.8} />
          </View>

          <Text style={styles.totalLabelOrange}>{t('label_total_driver_charges', 'Total Driver Charges')}</Text>
          <Text style={[styles.totalAmountOrange, { writingDirection: 'ltr' }]}>
            {formatCurrency(totalCharges, language)}
          </Text>

          {/* White Sub-container for Earned & Upcoming with Icons */}
          <View style={styles.whiteSubContainer}>
            {/* Earned Column */}
            <View style={styles.subColWithIcon}>
              <View style={[styles.subIconBadge, { backgroundColor: '#DCFCE7' }]}>
                <CheckCircle2 size={16} color="#15803D" strokeWidth={2.2} />
              </View>
              <View style={styles.subColTextCol}>
                <Text style={styles.subLabelWhiteBox}>{t('label_earned', 'Earned')}</Text>
                <Text style={[styles.earnedAmountWhiteBox, { writingDirection: 'ltr' }]}>
                  {formatCurrency(earnedTotal, language)}
                </Text>
              </View>
            </View>

            <View style={styles.whiteBoxDivider} />

            {/* Upcoming Column */}
            <View style={styles.subColWithIcon}>
              <View style={[styles.subIconBadge, { backgroundColor: '#FFF0ED' }]}>
                <CalendarClock size={16} color="#FA634E" strokeWidth={2.2} />
              </View>
              <View style={styles.subColTextCol}>
                <Text style={styles.subLabelWhiteBox}>{t('label_upcoming', 'Upcoming')}</Text>
                <Text style={[styles.upcomingAmountWhiteBox, { writingDirection: 'ltr' }]}>
                  {formatCurrency(upcomingTotal, language)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* 3. Section 1: Earned Driver Charges */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>{t('title_earned_driver_charges', 'Earned Driver Charges')}</Text>
          <TouchableOpacity onPress={() => router.push('/trips')} activeOpacity={0.8} style={styles.viewAllBtn}>
            <Text style={styles.viewAllText}>{t('action_view_all', 'View All')} {language === 'ur' ? '←' : '→'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.listContainerCard}>
          {earnedTrips.length === 0 ? (
            <View style={styles.emptyRowBox}>
              <View style={[styles.emptyIconCircle, { backgroundColor: '#DCFCE7' }]}>
                <CheckCircle2 size={26} color="#15803D" strokeWidth={2} />
              </View>
              <Text style={styles.emptyRowTitle}>{t('title_no_earned_charges', 'No Earned Charges Yet')}</Text>
              <Text style={styles.emptyRowSub}>{t('msg_no_earned_charges', 'Completed trip charges will appear here.')}</Text>
            </View>
          ) : (
            earnedTrips.slice(0, 5).map((trip, idx) => (
              <React.Fragment key={trip.id}>
                {idx > 0 && <View style={styles.rowDivider} />}
                <ChargeRowItem item={trip} isUpcoming={false} onPress={() => handleCardPress(trip.id)} t={t} language={language} />
              </React.Fragment>
            ))
          )}
        </View>

        {/* 4. Section 2: Upcoming Driver Charges */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>{t('title_upcoming_driver_charges', 'Upcoming Driver Charges')}</Text>
          <TouchableOpacity onPress={() => router.push('/trips')} activeOpacity={0.8} style={styles.viewAllBtn}>
            <Text style={styles.viewAllText}>{t('action_view_all', 'View All')} {language === 'ur' ? '←' : '→'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.listContainerCard}>
          {upcomingTrips.length === 0 ? (
            <View style={styles.emptyRowBox}>
              <View style={styles.emptyIconCircle}>
                <CalendarClock size={26} color="#FA634E" strokeWidth={2} />
              </View>
              <Text style={styles.emptyRowTitle}>{t('title_no_upcoming_charges', 'No Upcoming Charges')}</Text>
              <Text style={styles.emptyRowSub}>{t('msg_no_upcoming_charges', 'Your upcoming trip earnings will appear here.')}</Text>
            </View>
          ) : (
            upcomingTrips.slice(0, 5).map((trip, idx) => (
              <React.Fragment key={trip.id}>
                {idx > 0 && <View style={styles.rowDivider} />}
                <ChargeRowItem item={trip} isUpcoming={true} onPress={() => handleCardPress(trip.id)} t={t} language={language} />
              </React.Fragment>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EEF1F6',
  },
  topHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 14,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#3E3C3D',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 110,
    gap: 24,
    paddingTop: 8,
  },

  /* 1. Summary Card (Orange Surface with White Sub-container) */
  summaryCardOrange: {
    backgroundColor: '#FA634E',
    borderRadius: 22,
    padding: 20,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#FA634E',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 4,
  },
  watermarkIconBox: {
    position: 'absolute',
    right: -15,
    bottom: -20,
    transform: [{ rotate: '-10deg' }],
  },
  totalLabelOrange: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  totalAmountOrange: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 4,
    marginBottom: 16,
    writingDirection: 'ltr',
  },
  whiteSubContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  subColWithIcon: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  subIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subColTextCol: {
    flex: 1,
  },
  subLabelWhiteBox: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9898A4',
  },
  earnedAmountWhiteBox: {
    fontSize: 15.5,
    fontWeight: '700',
    color: '#15803D',
    marginTop: 1,
    writingDirection: 'ltr',
  },
  upcomingAmountWhiteBox: {
    fontSize: 15.5,
    fontWeight: '700',
    color: '#FA634E',
    marginTop: 1,
    writingDirection: 'ltr',
  },
  whiteBoxDivider: {
    width: 1,
    height: 34,
    backgroundColor: '#EEF1F6',
    marginHorizontal: 10,
  },

  /* Section Header */
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: -12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#3E3C3D',
  },
  viewAllBtn: {
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FA634E',
  },

  /* List Container Card Surface */
  listContainerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  rowWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowDivider: {
    height: 1,
    backgroundColor: '#EEF1F6',
    marginHorizontal: 16,
  },
  rowLogoBoxClean: {
    width: 42,
    height: 42,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLogoImgClean: {
    width: 42,
    height: 42,
    borderRadius: 8,
  },
  rowLogoBoxFallback: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#FFF0ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowContentCol: {
    flex: 1,
  },
  rowCompanyName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#3E3C3D',
  },
  rowRouteLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  rowCityText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3E3C3D',
    flexShrink: 1,
  },
  rowArrow: {
    marginHorizontal: 1,
  },
  rowMetaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  rowMetaText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#9898A4',
  },
  rowMetaTextUpcoming: {
    color: '#FA634E',
    fontWeight: '600',
  },
  rowMetaDot: {
    fontSize: 12,
    color: '#9898A4',
  },
  rowRightCol: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 8,
  },
  rowChargeAmount: {
    fontSize: 16,
    fontWeight: '700',
    writingDirection: 'ltr',
  },
  rowChargeEarned: {
    color: '#15803D',
  },
  rowChargeUpcoming: {
    color: '#FA634E',
  },

  /* Empty Row States */
  emptyRowBox: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  emptyIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFF0ED',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  emptyRowTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#3E3C3D',
  },
  emptyRowSub: {
    fontSize: 12.5,
    color: '#9898A4',
    marginTop: 3,
    textAlign: 'center',
  },
});

export default DriverChargesScreen;

import React, { useMemo, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar,
  FlatList, ActivityIndicator, RefreshControl, Dimensions, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  Building2, Calendar, CheckCircle2, ChevronRight, ChevronLeft, Wallet,
  ArrowRight, ArrowLeft, CalendarClock, TriangleAlert,
} from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography, Shadows } from '../../theme/tokens';
import { SearchInput, DriverChargePill } from '../../components';
import { useCurrentTrip } from '../../lib/use-current-trip';
import { useScheduledTrips } from '../../lib/use-scheduled-trips';
import { useTripHistory } from '../../lib/use-trip-history';
import { statusLabel, stopLabel, type MobileTrip, type TripStatus } from '../../lib/trips';
import { matchesSearch } from '../../lib/search';
import { useLanguage, formatCurrency, getLocalizedStatus, LanguageMode } from '../../lib/language-context';
import { API_URL } from '../../lib/api';

const FILE_BASE = API_URL.replace(/\/api\/?$/, '');

const TABS = ['Scheduled', 'Completed'] as const;
type Tab = typeof TABS[number];

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
  if (diffDays === 1) return lang === 'ur' ? 'کل' : 'Tomorrow';
  if (diffDays > 1 && diffDays <= 7) return lang === 'ur' ? `${diffDays} دنوں میں` : `In ${diffDays} days`;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function extractChargeNumber(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const parsed = parseFloat(val);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof val === 'object') {
    if (val.toNumber && typeof val.toNumber === 'function') {
      return val.toNumber();
    }
    const parsed = parseFloat(String(val));
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

export function getTripChargeValue(t: MobileTrip | any): number {
  if (!t) return 0;
  return extractChargeNumber(t.driver_payout ?? t.driver_charge ?? t.trip_charges ?? t.quotation?.driver_payout);
}

interface CardData {
  key: string;
  tripId: string;
  displayId: string;
  title: string;
  logoUrl: string | null;
  fromCity: string;
  toCity: string;
  statusText: string;
  rawStatus: TripStatus;
  isCompleted: boolean;
  dateFormatted: string;
  relativeDate: string;
  chargeText: string;
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

function toCard(t: MobileTrip, isCompletedTab: boolean, lang: LanguageMode = 'en', tr: any = (k: string, fb?: string) => fb || k): CardData {
  const dateSource = t.actual_end ?? t.planned_end ?? t.actual_start ?? t.planned_start ?? null;
  const pickup = t.stops?.find((s) => s.stop_type === 'Pickup');
  const dropoff = t.stops?.find((s) => s.stop_type === 'Dropoff');
  const fromCity = stopLabel(pickup, tr('label_pickup_point', 'Pickup Point')) ?? tr('label_pickup_point', 'Pickup Point');
  const toCity = stopLabel(dropoff, tr('label_delivery_point', 'Delivery Point')) ?? tr('label_delivery_point', 'Delivery Point');
  const isComp = t.status === 'Completed' || t.status === 'Invoiced' || isCompletedTab;
  const logoUrl = resolveLogoUrl(t.customer?.logo_url || null);
  const chargeValue = getTripChargeValue(t);

  return {
    key: t.id,
    tripId: t.id,
    displayId: t.ref_id ?? t.id.slice(0, 8),
    title: t.customer?.name ?? 'Mercon Logistics',
    logoUrl,
    fromCity,
    toCity,
    statusText: getLocalizedStatus(t.status, lang),
    rawStatus: t.status,
    isCompleted: isComp,
    dateFormatted: formatDateTime(dateSource),
    relativeDate: formatRelativeDate(dateSource, lang),
    chargeText: formatCurrency(chargeValue, lang),
  };
}

const TripCard = ({ item, onPress, t, language }: { item: CardData; onPress: () => void; t: any; language: LanguageMode }) => {
  const [imgError, setImgError] = useState(false);
  const showLogo = item.logoUrl && isValidUri(item.logoUrl) && !imgError;

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.88} onPress={onPress}>
      {/* 1. Card Header: Company Logo + Name on Left, Status Pill on Right */}
      <View style={styles.cardHeaderRow}>
        <View style={styles.companyInfoGroup}>
          {showLogo ? (
            <View style={styles.companyLogoBoxClean}>
              <Image
                source={{ uri: item.logoUrl! }}
                style={styles.companyLogoImgClean}
                resizeMode="contain"
                fadeDuration={0}
                onError={() => setImgError(true)}
              />
            </View>
          ) : (
            <View style={styles.companyLogoBoxFallback}>
              <Building2 size={22} color="#FA634E" strokeWidth={2} />
            </View>
          )}
          <View style={styles.companyTextCol}>
            <Text style={styles.companyNameText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
              {item.title}
            </Text>
            <Text style={styles.tripIdSubtext} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
              {t('label_trip_id', 'Trip ID')} · <Text style={{ writingDirection: 'ltr' }}>TRP-{item.displayId}</Text>
            </Text>
          </View>
        </View>

        {/* Status Pill */}
        {item.isCompleted ? (
          <View style={styles.completedStatusPill}>
            <CheckCircle2 size={13} color="#15803D" strokeWidth={2.5} />
            <Text style={styles.completedStatusText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {t('status_completed', 'Completed')}
            </Text>
          </View>
        ) : (
          <View style={styles.scheduledStatusPill}>
            <Text style={styles.scheduledStatusText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {item.relativeDate}
            </Text>
          </View>
        )}
      </View>

      {/* 2. Route Row */}
      <View style={styles.routeRow}>
        <Text style={styles.routeOriginText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{item.fromCity}</Text>
        {language === 'ur' ? (
          <ArrowLeft size={16} color="#FA634E" strokeWidth={2.5} style={styles.routeArrow} />
        ) : (
          <ArrowRight size={16} color="#FA634E" strokeWidth={2.5} style={styles.routeArrow} />
        )}
        <Text style={styles.routeDestText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{item.toCity}</Text>
      </View>

      {/* 3. Card Divider */}
      <View style={styles.cardDivider} />

      {/* 4. Footer Metadata Row: Date & Time + Driver Charge + Chevron */}
      <View style={styles.cardFooterRow}>
        {/* Date & Time */}
        <View style={styles.metaBlock}>
          <View style={styles.metaLabelRow}>
            <Calendar size={13} color="#9898A4" strokeWidth={2} />
            <Text style={styles.metaLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {t('label_date_time', 'Date & Time')}
            </Text>
          </View>
          <Text style={styles.metaValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{item.dateFormatted}</Text>
        </View>

        {/* Driver Charge */}
        <View style={styles.metaBlockRight}>
          <View style={styles.metaLabelRowRight}>
            <Wallet size={13} color={item.isCompleted ? '#15803D' : '#FA634E'} strokeWidth={2} />
            <Text style={styles.metaLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {t('label_driver_charge', 'Driver Charge')}
            </Text>
          </View>
          <Text style={[styles.chargeValue, item.isCompleted ? styles.chargeValueCompleted : styles.chargeValueScheduled, { writingDirection: 'ltr' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
            {item.chargeText}
          </Text>
        </View>

        {/* Action Chevron */}
        {language === 'ur' ? (
          <ChevronLeft size={18} color="#9898A4" strokeWidth={2.2} style={styles.cardChevron} />
        ) : (
          <ChevronRight size={18} color="#9898A4" strokeWidth={2.2} style={styles.cardChevron} />
        )}
      </View>
    </TouchableOpacity>
  );
};

const TripsScreen = ({ navigation }: any) => {
  const router = useRouter();
  const [selectedTab, setSelectedTab] = useState<Tab>('Scheduled');
  const [search, setSearch] = useState('');
  const { t, language } = useLanguage();

  const { trip: currentTrip, loading: loadingCurrent, refetch: refetchCurrent } = useCurrentTrip();
  const { trips: scheduledList, loading: loadingScheduled, error: errorScheduled, refetch: refetchScheduled } = useScheduledTrips();
  const { trips: historyList, loading: loadingHistory, error: errorHistory, refetch: refetchHistory } = useTripHistory();

  useFocusEffect(
    useCallback(() => {
      refetchCurrent();
      refetchScheduled();
      refetchHistory();
    }, [refetchCurrent, refetchScheduled, refetchHistory])
  );

  const loading = loadingCurrent || loadingScheduled || loadingHistory;
  const error = selectedTab === 'Scheduled' ? errorScheduled : errorHistory;

  // Compute Driver Charge total earnings from history (only completed/invoiced trips)
  const totalEarnings = useMemo(() => {
    return historyList.reduce((sum, t) => {
      if (t.status === 'Completed' || t.status === 'Invoiced') {
        return sum + getTripChargeValue(t);
      }
      return sum;
    }, 0);
  }, [historyList]);

  // Combine scheduled list with active trip
  const scheduledTripsCombined = useMemo(() => {
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

  const cards = useMemo(() => {
    const isCompTab = selectedTab === 'Completed';
    const source = isCompTab ? historyList : scheduledTripsCombined;
    return source
      .map((tripItem) => toCard(tripItem, isCompTab, language, t))
      .filter((c) => matchesSearch(search, [c.displayId, c.title, c.fromCity, c.toCity]));
  }, [selectedTab, scheduledTripsCombined, historyList, search, language, t]);

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

      {/* Top Header Row: "Trips" on Left, Driver Charge Pill on Right */}
      <View style={styles.topHeaderBar}>
        <Text style={styles.screenTitle}>{t('nav_trips', 'Trips')}</Text>

        {/* Driver Charge Pill matching Home and Profile screen exactly */}
        <DriverChargePill />
      </View>

      {/* Search Input Bar */}
      <SearchInput
        value={search}
        onChangeText={setSearch}
        placeholder={t('label_search_trips', 'Search trips by ID, city, customer...')}
        style={styles.searchContainer}
      />

      {/* Mutually Exclusive Segmented Tabs */}
      <View style={styles.segmentedContainer}>
        <TouchableOpacity
          style={[styles.segmentBtn, language === 'ur-en' && styles.segmentBtnBilingual, selectedTab === 'Scheduled' && styles.segmentBtnActive]}
          activeOpacity={0.85}
          onPress={() => setSelectedTab('Scheduled')}
        >
          <CalendarClock size={16} color={selectedTab === 'Scheduled' ? '#FA634E' : '#6E6E80'} strokeWidth={2.2} />
          {language === 'ur-en' ? (
            <View style={styles.segmentCol}>
              <Text style={[styles.segmentTextTop, selectedTab === 'Scheduled' && styles.segmentTextActive]} numberOfLines={1}>
                شیڈول شدہ
              </Text>
              <Text style={[styles.segmentTextSub, selectedTab === 'Scheduled' && styles.segmentTextActive]} numberOfLines={1}>
                Scheduled ({scheduledTripsCombined.length})
              </Text>
            </View>
          ) : (
            <Text
              style={[styles.segmentText, selectedTab === 'Scheduled' && styles.segmentTextActive]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {t('status_scheduled', 'Scheduled')} ({scheduledTripsCombined.length})
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentBtn, language === 'ur-en' && styles.segmentBtnBilingual, selectedTab === 'Completed' && styles.segmentBtnActive]}
          activeOpacity={0.85}
          onPress={() => setSelectedTab('Completed')}
        >
          <CheckCircle2 size={16} color={selectedTab === 'Completed' ? '#15803D' : '#6E6E80'} strokeWidth={2.2} />
          {language === 'ur-en' ? (
            <View style={styles.segmentCol}>
              <Text style={[styles.segmentTextTop, selectedTab === 'Completed' && styles.segmentTextActiveCompleted]} numberOfLines={1}>
                مکمل شدہ
              </Text>
              <Text style={[styles.segmentTextSub, selectedTab === 'Completed' && styles.segmentTextActiveCompleted]} numberOfLines={1}>
                Completed ({historyList.length})
              </Text>
            </View>
          ) : (
            <Text
              style={[styles.segmentText, selectedTab === 'Completed' && styles.segmentTextActiveCompleted]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {t('status_completed', 'Completed')} ({historyList.length})
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* FlatList for Selected Tab Trips */}
      <FlatList
        data={cards}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={loading && cards.length > 0} onRefresh={onRefresh} tintColor="#FA634E" />
        }
        renderItem={({ item }) => (
          <TripCard item={item} onPress={() => handleCardPress(item.tripId)} t={t} language={language} />
        )}
        ListEmptyComponent={
          loading ? (
            <View style={styles.emptyBox}>
              <ActivityIndicator color="#FA634E" size="large" />
              <Text style={styles.loadingText}>{t('msg_loading_trips', 'Loading trips…')}</Text>
            </View>
          ) : error ? (
            <View style={styles.emptyBox}>
              <View style={styles.emptyIconCircle}>
                <TriangleAlert size={30} color="#EAB308" strokeWidth={2} />
              </View>
              <Text style={styles.emptyTitle}>{t('err_cannot_reach_server', "Couldn't load trips")}</Text>
              <Text style={styles.emptySub}>{error}</Text>
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <View style={[styles.emptyIconCircle, selectedTab === 'Completed' && { backgroundColor: '#DCFCE7' }]}>
                {selectedTab === 'Scheduled' ? (
                  <CalendarClock size={32} color="#FA634E" strokeWidth={2} />
                ) : (
                  <CheckCircle2 size={32} color="#15803D" strokeWidth={2} />
                )}
              </View>
              <Text style={styles.emptyTitle}>
                {selectedTab === 'Scheduled' ? t('title_no_scheduled_trips', 'No Scheduled Trips') : t('title_no_completed_trips', 'No Completed Trips')}
              </Text>
              <Text style={styles.emptySub}>
                {selectedTab === 'Scheduled'
                  ? t('msg_no_scheduled_trips', "You don't have any upcoming trips.")
                  : t('msg_no_completed_trips', 'Your completed trips will appear here.')}
              </Text>
            </View>
          )
        }
      />
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
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
  },
  screenTitle: {
    fontSize: 27,
    fontWeight: '800',
    color: '#3E3C3D',
  },
  driverChargePill: {
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3E3C3D',
    borderRadius: 19,
    paddingHorizontal: 12,
    gap: 7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  walletIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFF0ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chargeTextCol: {
    justifyContent: 'center',
  },
  chargeAmount: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 15,
  },
  chargeLabel: {
    fontSize: 9.5,
    color: '#D8D8DC',
    lineHeight: 11,
    fontWeight: '500',
  },
  searchContainer: {
    marginHorizontal: 20,
    marginBottom: 12,
  },
  segmentedContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 4,
    marginHorizontal: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  segmentBtn: {
    flex: 1,
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    gap: 8,
    paddingHorizontal: 4,
  },
  segmentBtnBilingual: {
    height: 48,
  },
  segmentCol: {
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  segmentTextTop: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#6E6E80',
    lineHeight: 15,
  },
  segmentTextSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6E6E80',
    lineHeight: 13,
  },
  segmentBtnActive: {
    backgroundColor: '#FFF0ED',
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6E6E80',
  },
  segmentTextActive: {
    color: '#FA634E',
  },
  segmentTextActiveCompleted: {
    color: '#15803D',
  },
  listContainer: {
    paddingHorizontal: 20,
    paddingBottom: 110,
    gap: 14,
  },

  /* Card Styles */
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  companyInfoGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  companyLogoBoxClean: {
    width: 48,
    height: 48,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  companyLogoImgClean: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  companyLogoBoxFallback: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#FFF0ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  companyTextCol: {
    flex: 1,
  },
  companyNameText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#3E3C3D',
  },
  tripIdSubtext: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#9898A4',
    marginTop: 2,
  },
  scheduledStatusPill: {
    backgroundColor: '#FFF0ED',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  scheduledStatusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FA634E',
  },
  completedStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 4,
  },
  completedStatusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803D',
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    marginBottom: 2,
  },
  routeOriginText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#3E3C3D',
    flexShrink: 1,
  },
  routeArrow: {
    marginHorizontal: 2,
  },
  routeDestText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#3E3C3D',
    flexShrink: 1,
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#EEF1F6',
    marginVertical: 14,
  },
  cardFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metaBlock: {
    flex: 1,
  },
  metaBlockRight: {
    alignItems: 'flex-start',
    marginRight: 10,
  },
  metaLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaLabelRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaLabel: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#9898A4',
  },
  metaValue: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#3E3C3D',
    marginTop: 3,
  },
  chargeValue: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 3,
  },
  chargeValueScheduled: {
    color: '#FA634E',
  },
  chargeValueCompleted: {
    color: '#15803D',
  },
  cardChevron: {
    marginLeft: 4,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFF0ED',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#3E3C3D',
  },
  emptySub: {
    fontSize: 13,
    color: '#6E6E80',
    textAlign: 'center',
    marginTop: 6,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9898A4',
    marginTop: 12,
  },
});

export default TripsScreen;

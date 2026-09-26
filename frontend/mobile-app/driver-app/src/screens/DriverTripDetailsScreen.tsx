import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar,
  ScrollView, ActivityIndicator, Image, Linking, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeft, Building2, Calendar, MapPin, Navigation, Truck,
  CheckCircle2, Clock, Route, ShieldCheck, FileText, ChevronRight,
  House, Package, UserCheck, ChevronDown,
} from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography, Shadows } from '@mercon/mobile-shared/theme/tokens';
import { tripService, statusLabel, stopLabel, stopAddress, getTripChargeValue, getLegEndpoints, type MobileTrip, type TripStatus } from '@mercon/mobile-shared/lib/trips';
import { BilingualText } from '@mercon/mobile-shared/components/BilingualText';
import { useLanguage, formatCurrency, getLocalizedStatus } from '@mercon/mobile-shared/lib/language-context';
import { API_URL } from '@mercon/mobile-shared/lib/api';

import { parseTripRouteNodes } from '../utils/routeParser';

const FILE_BASE = API_URL.replace(/\/api\/?$/, '');

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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

export default function DriverTripDetailsScreen() {
  const router = useRouter();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const { t, language } = useLanguage();

  const [trip, setTrip] = useState<MobileTrip | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [logoError, setLogoError] = useState(false);

  const rawId = Array.isArray(tripId) ? tripId[0] : tripId;

  const fetchTrip = async () => {
    if (!rawId) {
      setLoading(false);
      return;
    }
    try {
      const data = await tripService.getTripDetails(rawId);
      setTrip(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTrip();
  }, [rawId]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchTrip();
  };

  const outboundEndpoints = getLegEndpoints(trip, 0);
  const pickupStop = outboundEndpoints.loading ?? null;
  const dropoffStop = outboundEndpoints.delivery ?? null;
  const intermediateStops = outboundEndpoints.intermediates;

  const rawLogo = trip?.customer?.logo_url || null;
  const logoUrl = resolveLogoUrl(rawLogo);
  const showLogo = logoUrl && !logoError;

  const isCompleted = trip?.status === 'Completed' || trip?.status === 'Invoiced';
  const chargeAmount = trip ? getTripChargeValue(trip) : 0;

  const openNavigation = (address?: string | null) => {
    if (!address) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    Linking.openURL(url);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#EEF1F6" />

      {/* Header */}
      <View style={styles.topHeaderBar}>
        <TouchableOpacity style={styles.backBtn} activeOpacity={0.8} onPress={() => router.back()}>
          <ArrowLeft size={22} color="#3E3C3D" strokeWidth={2.2} />
        </TouchableOpacity>
        <BilingualText
          ur="ٹرپ کی تفصیلات"
          en="Trip Details"
          primaryStyle={styles.headerTitleUrdu}
          subStyle={styles.headerTitleEn}
        />
      </View>

      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color="#FA634E" />
        </View>
      ) : !trip ? (
        <View style={styles.centerLoading}>
          <Text style={styles.errorText}>{t('err_trip_not_found', 'Trip not found.')}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FA634E" />}
        >
          {/* Card 1: Overview & Hero Surface */}
          <View style={styles.heroCard}>
            <View style={styles.heroHeaderRow}>
              {/* Customer Logo / Avatar */}
              {showLogo ? (
                <View style={styles.logoBox}>
                  <Image
                    source={{ uri: logoUrl! }}
                    style={styles.logoImg}
                    resizeMode="contain"
                    onError={() => setLogoError(true)}
                  />
                </View>
              ) : (
                <View style={styles.logoFallback}>
                  <Building2 size={24} color="#FA634E" strokeWidth={2} />
                </View>
              )}

              <View style={styles.heroCustomerCol}>
                <Text style={styles.customerName} numberOfLines={1}>
                  {trip.customer?.name ?? 'Mercon Logistics'}
                </Text>
                <Text style={[styles.tripRefId, { writingDirection: 'ltr' }]}>TRP-{trip.ref_id ?? trip.id.slice(0, 8)}</Text>
              </View>

              {/* Status Badge */}
              <View style={[styles.statusBadge, isCompleted ? styles.statusBadgeCompleted : styles.statusBadgeActive]}>
                <Text style={[styles.statusBadgeText, isCompleted ? styles.statusTextCompleted : styles.statusTextActive]}>
                  {getLocalizedStatus(trip.status, language)}
                </Text>
              </View>
            </View>

            <View style={styles.cardDivider} />

            {/* Charge & Vehicle Row */}
            <View style={styles.heroMetaGrid}>
              <View style={styles.metaCol}>
                <Text style={styles.metaLabel}>{t('label_driver_charge', 'Driver Charge')}</Text>
                <Text style={[styles.metaChargeVal, isCompleted ? styles.chargeValCompleted : styles.chargeValActive, { writingDirection: 'ltr' }]}>
                  {formatCurrency(chargeAmount, language)}
                </Text>
              </View>

              <View style={styles.metaVerticalLine} />

              <View style={styles.metaCol}>
                <Text style={styles.metaLabel}>{t('label_assigned_vehicle', 'Vehicle')}</Text>
                <View style={styles.vehicleRow}>
                  <Truck size={16} color="#3E3C3D" strokeWidth={2} />
                  <Text style={[styles.metaVehicleVal, { writingDirection: 'ltr' }]}>{trip.vehicle?.plate_number ?? 'Assigned Vehicle'}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Card 2: Complete Route & Timeline */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionTitleRow}>
              <Route size={18} color="#FA634E" strokeWidth={2.2} />
              <BilingualText
                ur="روٹ اور مقامات"
                en="Route & Locations"
                primaryStyle={styles.sectionTitleUrdu}
                subStyle={styles.sectionTitleEn}
              />
            </View>

            {/* Route & Locations Timeline */}
            {(() => {
              const timelineStops = parseTripRouteNodes(trip);

              return (
                <View style={styles.routeContainer}>
                  {/* Left Timeline Line */}
                  <View style={styles.timelineCol}>
                    {timelineStops.map((st, idx) => (
                      <React.Fragment key={`node-${st.id}-${idx}`}>
                        {idx === 0 ? (
                          <View style={styles.pickupNodeOuter}>
                            <View style={styles.pickupNodeInner} />
                          </View>
                        ) : (
                          <View style={styles.stopNodeDot} />
                        )}
                        {idx < timelineStops.length - 1 && <View style={styles.dashedLine} />}
                      </React.Fragment>
                    ))}
                  </View>

                  {/* Route Items */}
                  <View style={styles.routeItemsCol}>
                    {timelineStops.map((st) => (
                      <View key={`item-${st.id}`} style={styles.routeRowItem}>
                        <View style={styles.iconCircleBadge}>
                          {st.iconType === 'House' ? (
                            <House size={20} color="#FA634E" strokeWidth={2} />
                          ) : st.iconType === 'MapPin' ? (
                            <MapPin size={20} color="#FA634E" strokeWidth={2} />
                          ) : (
                            <Route size={20} color="#FA634E" strokeWidth={2} />
                          )}
                        </View>
                        <View style={styles.routeTextCol}>
                          <BilingualText
                            ur={st.typeUrdu}
                            en={st.typeEn}
                            primaryStyle={styles.stageUrduPrimary}
                            subStyle={styles.stageSubEn}
                          />
                          <Text style={styles.routePlaceName}>{st.name}</Text>
                          {st.address ? <Text style={styles.routeAddressText}>{st.address}</Text> : null}
                        </View>
                        <TouchableOpacity style={styles.navCircleBtn} onPress={() => openNavigation(st.address || st.name)}>
                          <Navigation size={16} color="#3E3C3D" strokeWidth={2.2} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })()}
          </View>

          {/* Card 3: Schedule & Times */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionTitleRow}>
              <Calendar size={18} color="#FA634E" strokeWidth={2.2} />
              <BilingualText
                ur="شیڈول کی تفصیلات"
                en="Schedule & Timings"
                primaryStyle={styles.sectionTitleUrdu}
                subStyle={styles.sectionTitleEn}
              />
            </View>

            <View style={styles.scheduleGrid}>
              {trip.planned_distance != null && (
                <View style={styles.scheduleRow}>
                  <Text style={styles.scheduleLabel}>{t('label_distance', 'Distance')}</Text>
                  <Text style={[styles.scheduleVal, { writingDirection: 'ltr' }]}>{trip.planned_distance.toLocaleString()} km</Text>
                </View>
              )}
              <View style={styles.scheduleRow}>
                <Text style={styles.scheduleLabel}>{t('label_planned_start', 'Planned Start')}</Text>
                <Text style={[styles.scheduleVal, { writingDirection: 'ltr' }]}>{formatDateTime(trip.planned_start)}</Text>
              </View>
              <View style={styles.scheduleRow}>
                <Text style={styles.scheduleLabel}>{t('label_planned_end', 'Planned End')}</Text>
                <Text style={[styles.scheduleVal, { writingDirection: 'ltr' }]}>{formatDateTime(trip.planned_end)}</Text>
              </View>
              {trip.actual_start && (
                <View style={styles.scheduleRow}>
                  <Text style={styles.scheduleLabel}>{t('label_actual_start', 'Actual Start')}</Text>
                  <Text style={[styles.scheduleVal, { writingDirection: 'ltr' }]}>{formatDateTime(trip.actual_start)}</Text>
                </View>
              )}
              {trip.actual_end && (
                <View style={styles.scheduleRow}>
                  <Text style={styles.scheduleLabel}>{t('label_actual_end', 'Actual End')}</Text>
                  <Text style={[styles.scheduleVal, { writingDirection: 'ltr' }]}>{formatDateTime(trip.actual_end)}</Text>
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

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
  headerTitleUrdu: {
    fontSize: 20,
    fontWeight: '700',
    color: '#3E3C3D',
  },
  headerTitleEn: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6E6E80',
  },
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 15,
    color: '#9898A4',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 110,
    gap: 16,
    paddingTop: 8,
  },

  /* Card 1: Hero Overview */
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  heroHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoBox: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImg: {
    width: 44,
    height: 44,
    borderRadius: 10,
  },
  logoFallback: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#FFF0ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCustomerCol: {
    flex: 1,
  },
  customerName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#3E3C3D',
  },
  tripRefId: {
    fontSize: 12.5,
    color: '#9898A4',
    marginTop: 2,
    fontWeight: '500',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  statusBadgeActive: {
    backgroundColor: '#FFF0ED',
  },
  statusBadgeCompleted: {
    backgroundColor: '#DCFCE7',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  statusTextActive: {
    color: '#FA634E',
  },
  statusTextCompleted: {
    color: '#15803D',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#EEF1F6',
    marginVertical: 16,
  },
  heroMetaGrid: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaCol: {
    flex: 1,
  },
  metaVerticalLine: {
    width: 1,
    height: 32,
    backgroundColor: '#EEF1F6',
    marginHorizontal: 16,
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9898A4',
  },
  metaChargeVal: {
    fontSize: 17,
    fontWeight: '800',
    marginTop: 2,
  },
  chargeValActive: {
    color: '#FA634E',
  },
  chargeValCompleted: {
    color: '#15803D',
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  metaVehicleVal: {
    fontSize: 14,
    fontWeight: '700',
    color: '#3E3C3D',
  },

  /* Section Cards */
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionTitleUrdu: {
    fontSize: 17,
    fontWeight: '700',
    color: '#3E3C3D',
  },
  sectionTitleEn: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#6E6E80',
  },

  /* Timeline */
  routeContainer: {
    flexDirection: 'row',
    gap: 14,
  },
  timelineCol: {
    alignItems: 'center',
    width: 20,
    paddingVertical: 4,
  },
  pickupNodeOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#FA634E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickupNodeInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FA634E',
  },
  dashedLine: {
    flex: 1,
    width: 2,
    backgroundColor: '#D1D5DB',
    marginVertical: 4,
  },
  stopNodeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#3E3C3D',
  },
  routeItemsCol: {
    flex: 1,
    gap: 20,
  },
  routeRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircleBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFF0ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeTextCol: {
    flex: 1,
  },
  stageUrduPrimary: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#3E3C3D',
  },
  stageSubEn: {
    fontSize: 10.5,
    fontWeight: '500',
    color: '#6E6E80',
  },
  routePlaceName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#3E3C3D',
    marginTop: 1,
  },
  routeAddressText: {
    fontSize: 12,
    color: '#9898A4',
    marginTop: 2,
  },
  navCircleBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EEF1F6',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Schedule */
  scheduleGrid: {
    gap: 10,
  },
  scheduleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF1F6',
  },
  scheduleLabel: {
    fontSize: 13,
    color: '#9898A4',
    fontWeight: '500',
  },
  scheduleVal: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#3E3C3D',
  },
});

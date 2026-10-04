import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, CheckCircle2, Clock, XCircle, Minus } from 'lucide-react-native';
import { useLanguage } from '@mercon/mobile-shared/lib/language-context';
import { formatDay } from '@mercon/mobile-shared/lib/dates';
import type { MobileTrip } from '@mercon/mobile-shared/lib/trips';
import { useProfile } from '../hooks/use-profile';
import { useTripHistory } from '../hooks/use-trip-history';

type Badge = { label: string; color: string; bg: string; Icon: typeof CheckCircle2 };

export default function PerformanceOverviewScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const { profile } = useProfile();

  const { trips, loading: tripsLoading } = useTripHistory();
  const recentTrips = trips.slice(0, 5);

  // Real numbers from the server (completed trips; on-time judged on the final
  // drop-off). There is no stored driven distance, so no distance is shown.
  const stats = profile?.stats;
  const completedTrips = stats?.completed_trips ?? 0;
  const onTimePct = stats?.on_time_percentage ?? null;
  const measured = stats?.on_time_measured_trips ?? 0;

  const badgeFor = (trip: MobileTrip): Badge | null => {
    if (trip.status === 'Cancelled') return { label: t('status_cancelled', 'Cancelled'), color: '#71717A', bg: '#F4F4F5', Icon: XCircle };
    if (trip.punctuality === 'on_time') return { label: t('status_on_time', 'On Time'), color: '#059669', bg: '#ECFDF5', Icon: CheckCircle2 };
    if (trip.punctuality === 'late') return { label: t('status_arrived_late', 'Late'), color: '#D97706', bg: '#FFFBEB', Icon: Clock };
    return null;
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} activeOpacity={0.8} onPress={() => router.back()}>
          <ArrowLeft size={22} color="#3E3C3D" strokeWidth={2.2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('title_performance_overview', 'Performance Overview')}</Text>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.scorecard}>
          <Text style={styles.scorecardTitle}>{t('title_total_trips_completed', 'Total Trips Completed')}</Text>
          <View style={styles.mainScoreRow}>
            <Text style={styles.mainScore}>{completedTrips}</Text>
          </View>
          <View style={styles.scorecardDivider} />
          <View style={styles.statsRow}>
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>{t('label_on_time_rating', 'On-Time Rating')}</Text>
              <Text style={styles.statValue}>{onTimePct === null ? '—' : `${onTimePct}%`}</Text>
              <Text style={styles.statCaption}>
                {onTimePct === null
                  ? t('msg_on_time_no_data', 'No delivery times yet')
                  : t('label_on_time_basis', 'From {count} completed trips with delivery times').replace('{count}', String(measured))}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>{t('title_recent_trip_history', 'Recent Trip History')}</Text>
        <View style={styles.tripsContainer}>
          {tripsLoading && recentTrips.length === 0 ? (
            <View style={{ padding: 24, alignItems: 'center' }}><Text style={{ color: '#A1A1AA' }}>{t('msg_loading_recent_trips', 'Loading recent trips...')}</Text></View>
          ) : recentTrips.length === 0 ? (
            <View style={{ padding: 24, alignItems: 'center' }}><Text style={{ color: '#A1A1AA' }}>{t('msg_no_recent_trips', 'No recent trips found.')}</Text></View>
          ) : (
            recentTrips.map((trip, index) => {
              const badge = badgeFor(trip);
              const Icon = badge?.Icon ?? Minus;

              let routeLabel = t('label_unknown_route', 'Unknown route');
              if (trip.stops && trip.stops.length >= 2) {
                const origin = trip.stops[0]?.location?.name || trip.stops[0]?.location_name || t('label_origin', 'Origin');
                const dest = trip.stops[trip.stops.length - 1]?.location?.name || trip.stops[trip.stops.length - 1]?.location_name || t('label_destination', 'Destination');
                routeLabel = `${origin} → ${dest}`;
              }
              const dateLabel = formatDay(trip.finished_at ?? trip.actual_end ?? trip.planned_start);

              return (
                <React.Fragment key={trip.id}>
                  <TouchableOpacity style={styles.tripRow} activeOpacity={0.7} onPress={() => router.push(`/trip/details?tripId=${trip.id}` as any)}>
                    <View style={[styles.statusIconBox, { backgroundColor: badge?.bg ?? '#F4F4F5' }]}>
                      <Icon size={20} color={badge?.color ?? '#A1A1AA'} />
                    </View>
                    <View style={styles.tripInfo}>
                      <Text style={styles.tripRoute}>{routeLabel}</Text>
                      <View style={styles.tripMetaRow}>
                        <Text style={styles.tripDate}>{dateLabel} • {trip.ref_id || trip.id}</Text>
                      </View>
                    </View>
                    {badge && (
                      <View style={styles.tripStatusCol}>
                        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                          <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
                        </View>
                      </View>
                    )}
                  </TouchableOpacity>
                  {index < recentTrips.length - 1 && <View style={styles.listDivider} />}
                </React.Fragment>
              );
            })
          )}
        </View>
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
  
  /* Hero Scorecard */
  scorecard: {
    backgroundColor: '#3E3C3D',
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  scorecardTitle: {
    color: '#A1A1AA',
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  mainScoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  mainScore: {
    fontSize: 56,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  mainScorePercent: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FA634E',
    marginLeft: 4,
  },
  scorecardDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginVertical: 20,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statCol: {
    flex: 1,
  },
  statLabel: {
    color: '#A1A1AA',
    fontSize: 13,
    marginBottom: 4,
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  statCaption: {
    color: '#A1A1AA',
    fontSize: 12,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginHorizontal: 16,
  },
  
  /* Duty Card */
  dutyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  dutyIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  dutyTextCol: {
    flex: 1,
  },
  dutyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#18181B',
    marginBottom: 2,
  },
  dutySub: {
    fontSize: 13,
    color: '#71717A',
  },

  /* Trips List */
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#18181B',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  tripsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  tripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  statusIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  tripInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  tripRoute: {
    fontSize: 15,
    fontWeight: '600',
    color: '#18181B',
    marginBottom: 4,
  },
  tripMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tripDate: {
    fontSize: 13,
    color: '#71717A',
  },
  tripStatusCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: 12,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  listDivider: {
    height: 1,
    backgroundColor: '#F4F4F5',
    marginLeft: 68,
  },
});

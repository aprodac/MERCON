import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, MapPin, CheckCircle2, Clock, Truck, ChevronRight } from 'lucide-react-native';
import { useLanguage } from '../../lib/language-context';
import { useProfile } from '../../lib/use-profile';

// Mock recent trips data for the UI
const RECENT_TRIPS = [
  { id: 'TRP-1042', route: 'Riyadh → Dammam', date: '21 Sep 2026', vehicle: 'NXA-8210', status: 'ON_TIME' },
  { id: 'TRP-1038', route: 'Jeddah → Riyadh', date: '18 Sep 2026', vehicle: 'NXA-8210', status: 'DELAYED' },
  { id: 'TRP-1031', route: 'Dammam → Jubail', date: '15 Sep 2026', vehicle: 'NXA-8210', status: 'ON_TIME' },
  { id: 'TRP-1025', route: 'Riyadh → Al Kharj', date: '12 Sep 2026', vehicle: 'NXA-8210', status: 'ON_TIME' },
];

export default function PerformanceOverviewScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const { profile } = useProfile();

  // Fallbacks
  const totalTrips = profile?.stats?.totalTrips ?? 142;
  const onTimePercentage = profile?.stats?.onTimePercentage ?? 98;
  const totalDistance = profile?.stats?.totalDistanceKm ?? 12500;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} activeOpacity={0.8} onPress={() => router.back()}>
          <ArrowLeft size={22} color="#3E3C3D" strokeWidth={2.2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('title_performance_overview', 'Performance Overview')}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* HERO SCORECARD */}
        <View style={styles.scorecard}>
          <Text style={styles.scorecardTitle}>On-Time Delivery Rate</Text>
          <View style={styles.mainScoreRow}>
            <Text style={styles.mainScore}>{onTimePercentage}</Text>
            <Text style={styles.mainScorePercent}>%</Text>
          </View>
          
          <View style={styles.scorecardDivider} />
          
          <View style={styles.statsRow}>
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>Total Trips</Text>
              <Text style={styles.statValue}>{totalTrips}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>Total Distance</Text>
              <Text style={styles.statValue}>{totalDistance.toLocaleString()} km</Text>
            </View>
          </View>
        </View>

        {/* DUTY STATUS (Optional mini-card) */}
        <View style={styles.dutyCard}>
          <View style={styles.dutyIconBox}>
            <Clock size={20} color="#059669" />
          </View>
          <View style={styles.dutyTextCol}>
            <Text style={styles.dutyTitle}>Duty Status: Active</Text>
            <Text style={styles.dutySub}>You have 42 hours logged this week.</Text>
          </View>
        </View>

        {/* RECENT TRIPS HISTORY */}
        <Text style={styles.sectionTitle}>Recent Trip History</Text>
        
        <View style={styles.tripsContainer}>
          {RECENT_TRIPS.map((trip, index) => {
            const isOnTime = trip.status === 'ON_TIME';
            return (
              <React.Fragment key={trip.id}>
                <TouchableOpacity style={styles.tripRow} activeOpacity={0.7}>
                  <View style={[styles.statusIconBox, { backgroundColor: isOnTime ? '#ECFDF5' : '#FFFBEB' }]}>
                    {isOnTime ? (
                      <CheckCircle2 size={20} color="#059669" />
                    ) : (
                      <Clock size={20} color="#D97706" />
                    )}
                  </View>
                  
                  <View style={styles.tripInfo}>
                    <Text style={styles.tripRoute}>{trip.route}</Text>
                    <View style={styles.tripMetaRow}>
                      <Text style={styles.tripDate}>{trip.date} • {trip.id}</Text>
                    </View>
                  </View>
                  
                  <View style={styles.tripStatusCol}>
                    <View style={[styles.badge, { backgroundColor: isOnTime ? '#ECFDF5' : '#FFFBEB' }]}>
                      <Text style={[styles.badgeText, { color: isOnTime ? '#059669' : '#D97706' }]}>
                        {isOnTime ? 'On Time' : 'Delayed'}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
                
                {index < RECENT_TRIPS.length - 1 && <View style={styles.listDivider} />}
              </React.Fragment>
            );
          })}
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

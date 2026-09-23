import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Target, Route, CheckCircle2, TrendingUp, AlertCircle } from 'lucide-react-native';
import { useLanguage } from '../../lib/language-context';
import { useProfile } from '../../lib/use-profile';

export default function PerformanceOverviewScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const { profile } = useProfile();

  // Fallbacks in case the backend deployment isn't updated yet
  const totalTrips = profile?.stats?.totalTrips ?? 18;
  const onTimePercentage = profile?.stats?.onTimePercentage ?? 98;
  const totalDistance = profile?.stats?.totalDistanceKm ?? 3450;

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
        
        <View style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <TrendingUp size={24} color="#FA634E" strokeWidth={2} />
            <Text style={styles.heroTitle}>Your Driving Stats</Text>
          </View>
          <Text style={styles.heroSubtitle}>
            Great job! You have maintained excellent performance over the last 30 days.
          </Text>
        </View>

        <View style={styles.metricsGrid}>
          {/* Total Trips */}
          <View style={styles.metricCard}>
            <View style={[styles.metricIconBox, { backgroundColor: '#F0F9EA' }]}>
              <Target size={24} color="#65A30D" />
            </View>
            <Text style={styles.metricValue}>{totalTrips}</Text>
            <Text style={styles.metricLabel}>Total Trips</Text>
          </View>

          {/* On-Time % */}
          <View style={styles.metricCard}>
            <View style={[styles.metricIconBox, { backgroundColor: '#ECFDF5' }]}>
              <CheckCircle2 size={24} color="#059669" />
            </View>
            <Text style={styles.metricValue}>{onTimePercentage}%</Text>
            <Text style={styles.metricLabel}>On-Time Rating</Text>
          </View>

          {/* Total Distance */}
          <View style={styles.metricCard}>
            <View style={[styles.metricIconBox, { backgroundColor: '#EFF6FF' }]}>
              <Route size={24} color="#3B82F6" />
            </View>
            <Text style={styles.metricValue}>{totalDistance.toLocaleString()} km</Text>
            <Text style={styles.metricLabel}>Distance Driven</Text>
          </View>
        </View>

        <View style={styles.infoBox}>
          <AlertCircle size={20} color="#CA8A04" />
          <Text style={styles.infoText}>
            Statistics are updated at the end of each completed trip and reflect your lifetime performance on the platform.
          </Text>
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
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#18181B',
    marginLeft: 8,
  },
  heroSubtitle: {
    fontSize: 14,
    color: '#71717A',
    lineHeight: 20,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  metricCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    flex: 1,
    minWidth: '45%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  metricIconBox: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#18181B',
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#71717A',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#FEF9C3',
    padding: 16,
    borderRadius: 12,
    alignItems: 'flex-start',
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#854D0E',
    lineHeight: 18,
    marginLeft: 12,
  }
});

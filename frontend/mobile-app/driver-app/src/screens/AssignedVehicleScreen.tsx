import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  StatusBar, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Truck, Wrench, Calendar } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography, Shadows } from '@mercon/mobile-shared/theme/tokens';
import { useAssignedVehicle } from '@mercon/mobile-shared/lib/vehicle';

import { useLanguage, getLocalizedStatus } from '@mercon/mobile-shared/lib/language-context';

const AssignedVehicleScreen = () => {
  const router = useRouter();
  const { vehicle, loading, error } = useAssignedVehicle();
  const { t, language } = useLanguage();

  const specs = vehicle
    ? [
        { labelKey: 'label_plate_number', defaultLabel: 'Plate', value: vehicle.plate_number },
        { labelKey: 'label_vehicle_type', defaultLabel: 'Type', value: vehicle.asset_type },
        { labelKey: 'label_status', defaultLabel: 'Status', value: getLocalizedStatus(vehicle.status, language) },
        { labelKey: 'label_capacity', defaultLabel: 'Capacity', value: `${vehicle.capacity_kg.toLocaleString()} kg` },
        { labelKey: 'label_odometer', defaultLabel: 'Odometer', value: `${Math.round(vehicle.current_odometer).toLocaleString()} km` },
        ...(vehicle.trailer_number
          ? [{ labelKey: 'label_trailer', defaultLabel: 'Trailer', value: `${vehicle.trailer_number}${vehicle.trailer_type ? ` (${vehicle.trailer_type})` : ''}` }]
          : []),
        ...(vehicle.trip_ref_id ? [{ labelKey: 'label_on_trip', defaultLabel: 'On Trip', value: `#${vehicle.trip_ref_id}` }] : []),
      ]
    : [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.gray100 }}>
      <StatusBar barStyle="light-content" backgroundColor="#1A1A1A" />
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Dark Header */}
        <View style={styles.darkHeader}>
          <TouchableOpacity style={styles.backBtn} activeOpacity={0.8} onPress={() => router.back()}>
            <ArrowLeft size={24} color={Colors.white} strokeWidth={2.2} />
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <View style={styles.vehicleIconBox}>
              <Truck size={30} color={Colors.white} strokeWidth={2} />
            </View>
            <Text style={styles.vehicleId}>
              {vehicle ? (vehicle.ref_id ? `#${vehicle.ref_id}` : vehicle.plate_number) : t('title_vehicle_details', 'Assigned Vehicle')}
            </Text>
            {vehicle && <Text style={styles.vehicleModel}>{vehicle.asset_type}</Text>}
            {vehicle && (
              <View style={styles.headerBadges}>
                <View style={styles.statusChip}>
                  <View style={styles.statusDot} />
                  <Text style={styles.statusChipText}>{getLocalizedStatus(vehicle.status, language)}</Text>
                </View>
                <View style={styles.plateChip}>
                  <Text style={[styles.plateText, { writingDirection: 'ltr' }]}>{vehicle.plate_number}</Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: Spacing['3xl'] }} />
        ) : !vehicle ? (
          <View style={styles.emptyCard}>
            <Truck size={48} color={Colors.gray400} strokeWidth={1.6} />
            <Text style={styles.emptyTitle}>{error ? t('err_could_not_load_vehicle', 'Could not load vehicle') : t('msg_no_vehicle_assigned', 'No vehicle assigned')}</Text>
            <Text style={styles.emptyText}>
              {error ?? t('msg_no_vehicle_assigned_desc', "You'll see your truck here once you're assigned to a trip.")}
            </Text>
          </View>
        ) : (
          <View style={styles.section}>
            {/* Maintenance Warning Card */}
            {vehicle.active_maintenance && (() => {
              const maint = vehicle.active_maintenance!;
              const fmtDate = (d: string) =>
                new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
              const dateRange = maint.end_date
                ? `${fmtDate(maint.start_date)} – ${fmtDate(maint.end_date)}`
                : `From ${fmtDate(maint.start_date)}`;
              const isActive = maint.status === 'In_Progress' || maint.status === 'In Progress';
              return (
                <View style={styles.maintenanceCard}>
                  <View style={styles.maintenanceIconRow}>
                    <View style={[styles.maintenanceIcon, isActive ? styles.maintenanceIconActive : styles.maintenanceIconScheduled]}>
                      {isActive ? (
                        <Wrench size={18} color="#FFFFFF" strokeWidth={2} />
                      ) : (
                        <Calendar size={18} color="#FFFFFF" strokeWidth={2} />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.maintenanceTitle}>
                        {isActive ? t('title_maintenance_active', 'Vehicle In Maintenance') : t('title_maintenance_scheduled', 'Scheduled Maintenance')}
                      </Text>
                      <Text style={styles.maintenanceDates}>{dateRange}</Text>
                      {maint.workshop_name ? (
                        <Text style={styles.maintenanceWorkshop}>{maint.workshop_name}</Text>
                      ) : null}
                    </View>
                  </View>
                  {!isActive && (
                    <Text style={styles.maintenanceNote}>
                      {t('msg_maintenance_block', 'This vehicle cannot be assigned on maintenance days.')}
                    </Text>
                  )}
                </View>
              );
            })()}

            <Text style={styles.sectionTitle}>{t('title_vehicle_details', 'Vehicle Details')}</Text>
            <View style={styles.specsGrid}>
              {specs.map((spec, i) => (
                <View
                  key={spec.labelKey}
                  style={[styles.specRow, i < specs.length - 1 ? styles.specRowBorder : null]}
                >
                  <Text style={styles.specLabel}>{t(spec.labelKey, spec.defaultLabel)}</Text>
                  <Text style={styles.specValue}>{spec.value}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  scroll: {
    paddingBottom: Spacing['3xl'],
    flexGrow: 1,
  },
  darkHeader: {
    backgroundColor: '#1A1A1A',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing['2xl'],
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  headerContent: {
    alignItems: 'center',
  },
  vehicleIconBox: {
    width: 72,
    height: 72,
    borderRadius: Radius.xl,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  vehicleId: {
    fontSize: Typography.xl,
    fontWeight: '800',
    color: Colors.white,
  },
  vehicleModel: {
    fontSize: Typography.sm,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  headerBadges: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(34,197,94,0.2)',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22C55E',
  },
  statusChipText: {
    fontSize: Typography.xs,
    color: Colors.white,
    fontWeight: '600',
  },
  plateChip: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  plateText: {
    fontSize: Typography.xs,
    color: Colors.white,
    fontWeight: '700',
  },
  section: {
    padding: Spacing.lg,
  },
  sectionTitle: {
    fontSize: Typography.base,
    fontWeight: '700',
    color: Colors.gray900,
    marginBottom: Spacing.md,
  },
  specsGrid: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    paddingHorizontal: Spacing.lg,
    ...Shadows.sm,
  },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  specRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  specLabel: {
    fontSize: Typography.sm,
    color: Colors.gray500,
  },
  specValue: {
    fontSize: Typography.sm,
    fontWeight: '700',
    color: Colors.gray900,
    flexShrink: 1,
    textAlign: 'right',
  },
  emptyCard: {
    backgroundColor: Colors.white,
    margin: Spacing.lg,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
    ...Shadows.sm,
  },
  emptyTitle: {
    fontSize: Typography.lg,
    fontWeight: '700',
    color: Colors.gray700,
  },
  emptyText: {
    fontSize: Typography.sm,
    color: Colors.gray500,
    textAlign: 'center',
  },
  maintenanceCard: {
    backgroundColor: '#FFF7ED',
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: '#FED7AA',
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadows.sm,
  },
  maintenanceIconRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  maintenanceIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    flexShrink: 0,
  },
  maintenanceIconActive: {
    backgroundColor: '#D97706',
  },
  maintenanceIconScheduled: {
    backgroundColor: '#F59E0B',
  },
  maintenanceTitle: {
    fontSize: Typography.sm,
    fontWeight: '800',
    color: '#92400E',
  },
  maintenanceDates: {
    fontSize: Typography.xs,
    fontWeight: '700',
    color: '#B45309',
    marginTop: 2,
  },
  maintenanceWorkshop: {
    fontSize: Typography.xs,
    color: '#B45309',
    opacity: 0.8,
    marginTop: 1,
  },
  maintenanceNote: {
    fontSize: Typography.xs,
    color: '#92400E',
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#FED7AA',
  },
});

export default AssignedVehicleScreen;

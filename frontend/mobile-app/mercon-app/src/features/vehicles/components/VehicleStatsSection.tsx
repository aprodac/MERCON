import React from 'react';
import { View } from 'react-native';
import { Truck, Wrench } from 'lucide-react-native';
import { VehicleStatCard } from './VehicleStatCard';
import { SkeletonVehicleStatCard } from './LoadingSkeleton';
import { ErrorState } from '@/shared/components';
import { useVehicleStats } from '../hooks';

/**
 * Two headline KPIs side by side (Total Vehicles, On Trip) backed by real
 * GET /vehicles?mode=kpi endpoint. Captions convey Available & Maintenance counts.
 */
export function VehicleStatsSection() {
  const stats = useVehicleStats();

  if (stats.loading) {
    return (
      <View className="flex-row gap-3">
        <SkeletonVehicleStatCard />
        <SkeletonVehicleStatCard />
      </View>
    );
  }

  if (stats.error) {
    return <ErrorState message={stats.error} onRetry={() => stats.refresh()} />;
  }

  return (
    <View className="flex-row gap-3">
      <VehicleStatCard
        label="Total Fleet"
        value={stats.totalVehicles}
        Icon={Truck}
        caption={`${stats.available} available`}
      />
      <VehicleStatCard
        label="On Trip"
        value={stats.onTrip}
        Icon={Wrench}
        caption={`${stats.maintenance} in maintenance`}
      />
    </View>
  );
}

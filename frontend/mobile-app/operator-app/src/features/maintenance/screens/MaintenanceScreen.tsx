import React, { useState } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, SafeAreaView, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Wrench, Menu, Truck } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography, Shadows } from '@mercon/mobile-shared/theme/tokens';
import { useOperatorMaintenanceRecords, type OperatorMaintenanceRecord } from '@/lib/operator';
import { EmptyState, ErrorState } from '@mercon/mobile-shared/ui';
import { OperatorSidebarDrawer } from '@/components/OperatorSidebarDrawer';
import { AppTopBar } from '@/components/AppTopBar';

export default function MaintenanceScreen() {
  const router = useRouter();
  const { records, loading, error, refetch } = useOperatorMaintenanceRecords();
  const [drawerVisible, setDrawerVisible] = useState(false);

  const renderItem = ({ item }: { item: OperatorMaintenanceRecord }) => (
    <View
      style={{
        backgroundColor: Colors.white,
        borderRadius: Radius.lg,
        padding: Spacing.md,
        marginBottom: Spacing.sm,
        borderWidth: 1,
        borderColor: Colors.gray100,
        ...Shadows.sm,
      }}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Truck size={16} color={Colors.primary} strokeWidth={2.2} />
          <Text style={{ fontSize: Typography.base, fontWeight: '700', color: Colors.charcoal }}>
            {item.vehicle?.plate_number ?? item.vehicle_plate ?? 'Vehicle'}
          </Text>
        </View>
        <View
          style={{
            paddingHorizontal: Spacing.sm,
            paddingVertical: 2,
            borderRadius: Radius.full,
            backgroundColor: item.status === 'Completed' ? '#ECFDF5' : '#FFFBEB',
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: '700', color: item.status === 'Completed' ? '#10B981' : '#F59E0B' }}>
            {item.status}
          </Text>
        </View>
      </View>

      <Text style={{ fontSize: Typography.xs, fontWeight: '600', color: Colors.gray700, marginTop: 6 }}>
        Type: {item.maintenance_type ?? 'Service'}
      </Text>

      {item.description && (
        <Text style={{ fontSize: Typography.xs, color: Colors.gray500, marginTop: 2 }} numberOfLines={2}>
          {item.description}
        </Text>
      )}

      <View className="mt-3 pt-2 border-t border-gray-100 flex-row items-center justify-between">
        <Text style={{ fontSize: 11, color: Colors.gray400 }}>
          {item.completed_date ? `Completed: ${new Date(item.completed_date).toLocaleDateString()}` : item.scheduled_date ? `Scheduled: ${new Date(item.scheduled_date).toLocaleDateString()}` : 'No date'}
        </Text>
        {item.cost != null && (
          <Text style={{ fontSize: Typography.sm, fontWeight: '800', color: Colors.charcoal }}>
            SAR {Number(item.cost).toLocaleString()}
          </Text>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F6F6F7' }}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />
      
      <AppTopBar title="Maintenance" />

      {error ? (
        <ErrorState message={error} onRetry={refetch} className="flex-1" />
      ) : (
        <FlatList
          data={records}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={Colors.primary} />}
          ListEmptyComponent={
            !loading ? (
              <EmptyState
                title="No maintenance records"
                subtitle="Vehicle service logs will be listed here."
                Icon={Wrench}
                className="mt-12"
              />
            ) : null
          }
        />
      )}

    </SafeAreaView>
  );
}

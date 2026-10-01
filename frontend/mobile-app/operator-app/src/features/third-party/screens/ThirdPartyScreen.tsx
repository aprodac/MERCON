import React, { useState } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, SafeAreaView, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Building2, Menu, Phone, User } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography, Shadows } from '@mercon/mobile-shared/theme/tokens';
import { useOperatorThirdPartyProviders, type OperatorThirdPartyProvider } from '@/lib/operator';
import { EmptyState, ErrorState } from '@mercon/mobile-shared/ui';
import { OperatorSidebarDrawer } from '@/components/OperatorSidebarDrawer';
import { AppTopBar } from '@/components/AppTopBar';

export default function ThirdPartyScreen() {
  const router = useRouter();
  const { providers, loading, error, refetch } = useOperatorThirdPartyProviders();
  const [drawerVisible, setDrawerVisible] = useState(false);

  const renderItem = ({ item }: { item: OperatorThirdPartyProvider }) => (
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
        <Text style={{ fontSize: Typography.base, fontWeight: '700', color: Colors.gray900 }} numberOfLines={1} className="flex-1 pr-2">
          {item.name}
        </Text>
        <View
          style={{
            paddingHorizontal: Spacing.sm,
            paddingVertical: 2,
            borderRadius: Radius.full,
            backgroundColor: item.isActive ?? true ? '#ECFDF5' : Colors.gray100,
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: '700', color: item.isActive ?? true ? '#10B981' : Colors.gray500 }}>
            {item.isActive ?? true ? 'Active' : 'Inactive'}
          </Text>
        </View>
      </View>

      {item.contact_person && (
        <View className="flex-row items-center gap-1.5 mt-2">
          <User size={13} color={Colors.gray400} strokeWidth={2} />
          <Text style={{ fontSize: Typography.xs, color: Colors.gray600 }}>{item.contact_person}</Text>
        </View>
      )}

      {item.phone && (
        <View className="flex-row items-center gap-1.5 mt-1">
          <Phone size={13} color={Colors.gray400} strokeWidth={2} />
          <Text style={{ fontSize: Typography.xs, color: Colors.gray600 }}>{item.phone}</Text>
        </View>
      )}

      {item._count?.subcontracts != null && (
        <View className="mt-3 pt-2 border-t border-gray-100 flex-row items-center justify-between">
          <Text style={{ fontSize: 11, color: Colors.gray500 }}>Assigned Subcontracts</Text>
          <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.primary }}>{item._count.subcontracts} trips</Text>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F6F6F7' }}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />
      
      <AppTopBar title="3rd party fleet" />

      {error ? (
        <ErrorState message={error} onRetry={refetch} className="flex-1" />
      ) : (
        <FlatList
          data={providers}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={Colors.primary} />}
          ListEmptyComponent={
            !loading ? (
              <EmptyState
                title="No 3rd party providers"
                subtitle="Subcontracted carriers will be listed here."
                Icon={Building2}
                className="mt-12"
              />
            ) : null
          }
        />
      )}

    </SafeAreaView>
  );
}

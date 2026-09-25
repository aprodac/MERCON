import React, { useState, useMemo } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, SafeAreaView, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Building2, Menu, Phone, User } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography, Shadows } from '@mercon/mobile-shared/theme/tokens';
import { useOperatorThirdPartyProviders, type OperatorThirdPartyProvider } from '@/lib/operator';
import { EmptyState, ErrorState } from '@mercon/mobile-shared/ui';
import { OperatorSidebarDrawer } from '@/components/OperatorSidebarDrawer';
import { SearchBar } from '@/features/dashboard/components/SearchBar';
import { SegmentControl } from '@/features/dashboard/components/SegmentControl';

export default function ThirdPartyScreen() {
  const router = useRouter();
  const { providers, loading, error, refetch } = useOperatorThirdPartyProviders();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  const filteredProviders = useMemo(() => {
    if (!providers) return [];
    return providers.filter((p) => {
      const isActive = p.isActive ?? true;
      if (statusFilter === 'ACTIVE' && !isActive) return false;
      if (statusFilter === 'INACTIVE' && isActive) return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchName = p.name?.toLowerCase().includes(q);
        const matchPerson = p.contact_person?.toLowerCase().includes(q);
        const matchPhone = p.phone?.toLowerCase().includes(q);
        if (!matchName && !matchPerson && !matchPhone) return false;
      }
      return true;
    });
  }, [providers, statusFilter, searchQuery]);

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
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.gray100 }}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />
      
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: Spacing.lg,
          paddingVertical: Spacing.md,
          backgroundColor: Colors.white,
          borderBottomWidth: 1,
          borderBottomColor: Colors.gray100,
        }}
      >
        <View className="flex-row items-center gap-3">
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} className="h-9 w-9 items-center justify-center rounded-xl bg-gray-100">
            <ArrowLeft size={18} color={Colors.gray800} strokeWidth={2.2} />
          </TouchableOpacity>
          <View>
            <Text style={{ fontSize: Typography.lg, fontWeight: '800', color: Colors.gray900 }}>3rd Party Fleet</Text>
            <Text style={{ fontSize: Typography.xs, color: Colors.gray500 }}>Subcontractors & 3PL carriers</Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => setDrawerVisible(true)}
          activeOpacity={0.75}
          style={{ width: 38, height: 38, borderRadius: Radius.md, backgroundColor: Colors.gray100, alignItems: 'center', justifyContent: 'center' }}
        >
          <Menu size={20} color={Colors.gray800} strokeWidth={2.2} />
        </TouchableOpacity>
      </View>

      {/* Filter and Search Bar */}
      <View style={{ paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, gap: Spacing.sm, backgroundColor: Colors.gray100 }}>
        <SearchBar 
          value={searchQuery} 
          onChangeText={setSearchQuery} 
          placeholder="Search by name, phone..." 
        />
        <View style={{ flexDirection: 'row', justifyContent: 'flex-start' }}>
          <SegmentControl
            options={[
              { label: 'All', value: 'ALL' },
              { label: 'Active', value: 'ACTIVE' },
              { label: 'Inactive', value: 'INACTIVE' },
            ]}
            value={statusFilter}
            onChange={setStatusFilter}
          />
        </View>
      </View>

      {error ? (
        <ErrorState message={error} onRetry={refetch} className="flex-1" />
      ) : (
        <FlatList
          data={filteredProviders}
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

      <OperatorSidebarDrawer visible={drawerVisible} onClose={() => setDrawerVisible(false)} />
    </SafeAreaView>
  );
}

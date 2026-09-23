import React, { useState } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, SafeAreaView, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, FolderOpen, Menu } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography, Shadows } from '@/theme/tokens';
import { useOperatorDocuments, type OperatorDocument } from '@/lib/operator';
import { EmptyState, ErrorState } from '@/shared/components';
import { OperatorSidebarDrawer } from '@/components/OperatorSidebarDrawer';

export default function DocumentsScreen() {
  const router = useRouter();
  const { documents, loading, error, refetch } = useOperatorDocuments();
  const [drawerVisible, setDrawerVisible] = useState(false);

  const renderItem = ({ item }: { item: OperatorDocument }) => (
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
        <Text style={{ fontSize: Typography.base, fontWeight: '700', color: Colors.gray900 }}>
          {item.doc_type ?? 'Document'}
        </Text>
        <View
          style={{
            paddingHorizontal: Spacing.sm,
            paddingVertical: 2,
            borderRadius: Radius.full,
            backgroundColor: item.status === 'Approved' || item.status === 'Verified' ? '#ECFDF5' : '#FFFBEB',
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: '700', color: item.status === 'Approved' || item.status === 'Verified' ? '#10B981' : '#F59E0B' }}>
            {item.status}
          </Text>
        </View>
      </View>

      <Text style={{ fontSize: Typography.xs, color: Colors.gray500, marginTop: 4 }}>
        Entity: {item.entity_type} ({item.entity_id ? item.entity_id.slice(0, 8) : 'General'})
      </Text>

      {item.expiry_date && (
        <View className="mt-3 pt-2 border-t border-gray-100 flex-row items-center justify-between">
          <Text style={{ fontSize: 11, color: Colors.gray400 }}>Expiry Date</Text>
          <Text style={{ fontSize: Typography.xs, fontWeight: '700', color: Colors.gray800 }}>
            {new Date(item.expiry_date).toLocaleDateString()}
          </Text>
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
            <Text style={{ fontSize: Typography.lg, fontWeight: '800', color: Colors.gray900 }}>Documents</Text>
            <Text style={{ fontSize: Typography.xs, color: Colors.gray500 }}>Driver & fleet document center</Text>
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

      {error ? (
        <ErrorState message={error} onRetry={refetch} className="flex-1" />
      ) : (
        <FlatList
          data={documents}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={Colors.primary} />}
          ListEmptyComponent={
            !loading ? (
              <EmptyState
                title="No documents found"
                subtitle="Fleet & driver documents will appear here."
                Icon={FolderOpen}
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

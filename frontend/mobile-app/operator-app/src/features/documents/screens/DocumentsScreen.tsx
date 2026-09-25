import React, { useState, useMemo } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, SafeAreaView, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, FolderOpen, Menu } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography, Shadows } from '@mercon/mobile-shared/theme/tokens';
import { useOperatorDocuments, type OperatorDocument } from '@/lib/operator';
import { EmptyState, ErrorState } from '@mercon/mobile-shared/ui';
import { OperatorSidebarDrawer } from '@/components/OperatorSidebarDrawer';

export default function DocumentsScreen() {
  const router = useRouter();
  const { documents, loading, error, refetch } = useOperatorDocuments();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);

  const folders = useMemo(() => {
    if (!documents) return [];
    const groups: Record<string, OperatorDocument[]> = {};
    
    documents.forEach(doc => {
      const type = doc.doc_type || 'General';
      if (!groups[type]) groups[type] = [];
      groups[type].push(doc);
    });
    
    return Object.keys(groups).map(key => ({
      name: key,
      count: groups[key].length,
      docs: groups[key]
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [documents]);

  const renderFolderItem = ({ item }: { item: typeof folders[0] }) => (
    <TouchableOpacity
      onPress={() => setActiveFolder(item.name)}
      activeOpacity={0.8}
      style={{
        flex: 1,
        backgroundColor: Colors.white,
        borderRadius: Radius.lg,
        padding: Spacing.md,
        margin: Spacing.xs,
        borderWidth: 1,
        borderColor: Colors.gray100,
        ...Shadows.sm,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 120,
      }}
    >
      <FolderOpen size={36} color={Colors.primary} strokeWidth={2} />
      <Text style={{ fontSize: Typography.base, fontWeight: '700', color: Colors.gray900, marginTop: 12, textAlign: 'center' }} numberOfLines={1}>
        {item.name}
      </Text>
      <Text style={{ fontSize: Typography.xs, color: Colors.gray500, marginTop: 4 }}>
        {item.count} files
      </Text>
    </TouchableOpacity>
  );

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
          <TouchableOpacity 
            onPress={() => {
              if (activeFolder) {
                setActiveFolder(null);
              } else {
                router.back();
              }
            }} 
            activeOpacity={0.7} 
            className="h-9 w-9 items-center justify-center rounded-xl bg-gray-100"
          >
            <ArrowLeft size={18} color={Colors.gray800} strokeWidth={2.2} />
          </TouchableOpacity>
          <View>
            <Text style={{ fontSize: Typography.lg, fontWeight: '800', color: Colors.gray900 }}>
              {activeFolder ? activeFolder : 'Documents'}
            </Text>
            <Text style={{ fontSize: Typography.xs, color: Colors.gray500 }}>
              {activeFolder ? `${folders.find(f => f.name === activeFolder)?.count || 0} files` : 'Driver & fleet document center'}
            </Text>
          </View>
        </View>
        
        {!activeFolder && (
          <TouchableOpacity
            onPress={() => setDrawerVisible(true)}
            activeOpacity={0.75}
            style={{ width: 38, height: 38, borderRadius: Radius.md, backgroundColor: Colors.gray100, alignItems: 'center', justifyContent: 'center' }}
          >
            <Menu size={20} color={Colors.gray800} strokeWidth={2.2} />
          </TouchableOpacity>
        )}
      </View>

      {error ? (
        <ErrorState message={error} onRetry={refetch} className="flex-1" />
      ) : activeFolder ? (
        <FlatList
          data={folders.find(f => f.name === activeFolder)?.docs || []}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={Colors.primary} />}
        />
      ) : (
        <FlatList
          data={folders}
          keyExtractor={(item) => item.name}
          renderItem={renderFolderItem}
          numColumns={2}
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={Colors.primary} />}
          ListEmptyComponent={
            !loading ? (
              <EmptyState
                title="No folders found"
                subtitle="Documents will be categorized here."
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

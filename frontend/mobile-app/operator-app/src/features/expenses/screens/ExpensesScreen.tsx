import React, { useState } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, SafeAreaView, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, CreditCard, Menu } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography, Shadows } from '@mercon/mobile-shared/theme/tokens';
import { useOperatorExpenses, type OperatorExpense } from '@/lib/operator';
import { EmptyState, ErrorState } from '@mercon/mobile-shared/ui';
import { OperatorSidebarDrawer } from '@/components/OperatorSidebarDrawer';

export default function ExpensesScreen() {
  const router = useRouter();
  const { expenses, loading, error, refetch } = useOperatorExpenses();
  const [drawerVisible, setDrawerVisible] = useState(false);

  const renderItem = ({ item }: { item: OperatorExpense }) => (
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
          {item.category ?? 'Operational Expense'}
        </Text>
        <Text style={{ fontSize: Typography.base, fontWeight: '800', color: Colors.primary }}>
          SAR {(item.amount ?? 0).toLocaleString()}
        </Text>
      </View>

      {item.description && (
        <Text style={{ fontSize: Typography.xs, color: Colors.gray500, marginTop: 4 }} numberOfLines={2}>
          {item.description}
        </Text>
      )}

      <View className="mt-3 pt-2 border-t border-gray-100 flex-row items-center justify-between">
        <Text style={{ fontSize: 11, color: Colors.gray400 }}>
          {item.expense_date ? new Date(item.expense_date).toLocaleDateString() : 'No date'}
        </Text>
        <View
          style={{
            paddingHorizontal: Spacing.sm,
            paddingVertical: 2,
            borderRadius: Radius.full,
            backgroundColor: '#ECFDF5',
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#10B981' }}>
            {item.status ?? 'Approved'}
          </Text>
        </View>
      </View>
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
            <Text style={{ fontSize: Typography.lg, fontWeight: '800', color: Colors.gray900 }}>Expenses</Text>
            <Text style={{ fontSize: Typography.xs, color: Colors.gray500 }}>Operational costs & receipts</Text>
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
          data={expenses}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={Colors.primary} />}
          ListEmptyComponent={
            !loading ? (
              <EmptyState
                title="No expenses logged"
                subtitle="Operational costs will be listed here."
                Icon={CreditCard}
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

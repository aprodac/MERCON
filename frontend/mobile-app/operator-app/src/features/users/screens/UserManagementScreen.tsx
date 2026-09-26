/**
 * User management — two tabs over every account on the platform:
 *   Drivers → driver profiles; tap one to edit details and set its app password.
 *   Users   → Admin / Operator logins; Admins can add and edit them, Operators
 *             only view (the backend enforces the same: POST/PUT /users are Admin-only).
 */
import React, { useMemo, useState } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, TextInput, SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight, KeyRound, Menu, Plus, Search, UserCog, Users } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography } from '@mercon/mobile-shared/theme/tokens';
import { useAuth } from '@mercon/mobile-shared/lib/auth-context';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { EmptyState, ErrorState } from '@mercon/mobile-shared/ui';
import { OperatorSidebarDrawer } from '@/components/OperatorSidebarDrawer';
import { operatorService, type OperatorDriver, type PlatformUser } from '@/lib/operator';

type Tab = 'drivers' | 'users';

export const USER_MANAGEMENT_KEYS = {
  drivers: ['user-management', 'drivers'] as const,
  users: ['user-management', 'users'] as const,
};

function matches(query: string, ...fields: (string | null | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => f?.toLowerCase().includes(q));
}

function Pill({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );
}

export default function UserManagementScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { role } = useAuth();
  const isAdmin = role === 'Admin';
  const [tab, setTab] = useState<Tab>(params.tab === 'users' ? 'users' : 'drivers');
  const [query, setQuery] = useState('');
  const [drawerVisible, setDrawerVisible] = useState(false);

  const drivers = useQuery({ queryKey: USER_MANAGEMENT_KEYS.drivers, queryFn: () => operatorService.driverAccounts() });
  const users = useQuery({ queryKey: USER_MANAGEMENT_KEYS.users, queryFn: () => operatorService.platformUsers() });

  const driverRows = useMemo(
    () => (drivers.data ?? []).filter((d) =>
      matches(query, `${d.first_name} ${d.last_name}`, d.phone_primary, d.license_number, d.ref_id)),
    [drivers.data, query],
  );
  const userRows = useMemo(
    () => (users.data ?? []).filter((u) => matches(query, u.name, u.username, u.phone, u.email, u.role)),
    [users.data, query],
  );

  const active = tab === 'drivers' ? drivers : users;

  const renderDriver = ({ item }: { item: OperatorDriver }) => {
    const hasLogin = !!item.user;
    return (
      <TouchableOpacity style={styles.row} activeOpacity={0.75} onPress={() => router.push(`/driver-edit?id=${item.id}`)}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(item.first_name[0] ?? '') + (item.last_name[0] ?? '')}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{`${item.first_name} ${item.last_name}`.trim()}</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {[item.phone_primary, item.license_number].filter(Boolean).join(' · ') || '—'}
          </Text>
        </View>
        {hasLogin
          ? <Pill label="App login" color="#047857" bg="#ECFDF5" />
          : <Pill label="No password" color="#B45309" bg="#FFFBEB" />}
        <ChevronRight size={18} color={Colors.gray400} />
      </TouchableOpacity>
    );
  };

  const renderUser = ({ item }: { item: PlatformUser }) => (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={isAdmin ? 0.75 : 1}
      disabled={!isAdmin}
      onPress={() => router.push(`/user-edit?id=${item.id}`)}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{item.name.slice(0, 2).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.sub} numberOfLines={1}>
          {[item.username, item.phone].filter(Boolean).join(' · ') || '—'}
        </Text>
      </View>
      <Pill label={item.role} color={item.role === 'Admin' ? '#6D28D9' : '#1D4ED8'} bg={item.role === 'Admin' ? '#F5F3FF' : '#EFF6FF'} />
      {item.status === 'Inactive' && <Pill label="Inactive" color={Colors.gray500} bg={Colors.gray100} />}
      {isAdmin && <ChevronRight size={18} color={Colors.gray400} />}
    </TouchableOpacity>
  );

  const listProps = {
    contentContainerStyle: { padding: Spacing.lg, paddingBottom: 120 },
    keyboardShouldPersistTaps: 'handled' as const,
    refreshControl: <RefreshControl refreshing={active.isRefetching} onRefresh={() => active.refetch()} tintColor={Colors.primary} />,
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.gray100 }}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />

      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.iconBtn}>
            <ArrowLeft size={18} color={Colors.gray800} strokeWidth={2.2} />
          </TouchableOpacity>
          <View>
            <Text style={styles.title}>User management</Text>
            <Text style={styles.subtitle}>Drivers and platform logins</Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => setDrawerVisible(true)} activeOpacity={0.75} style={styles.iconBtn}>
          <Menu size={20} color={Colors.gray800} strokeWidth={2.2} />
        </TouchableOpacity>
      </View>

      <View style={styles.toolbar}>
        <View style={styles.tabs}>
          {(['drivers', 'users'] as Tab[]).map((t) => {
            const count = t === 'drivers' ? drivers.data?.length : users.data?.length;
            return (
              <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} activeOpacity={0.8} onPress={() => setTab(t)}>
                <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                  {t === 'drivers' ? 'Drivers' : 'Users'}{count != null ? ` · ${count}` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.searchRow}>
          <View style={styles.search}>
            <Search size={16} color={Colors.gray400} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={tab === 'drivers' ? 'Search name, phone, license' : 'Search name, username, phone'}
              placeholderTextColor={Colors.gray400}
              style={styles.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>
          {(tab === 'drivers' || isAdmin) && (
            <TouchableOpacity
              style={styles.addBtn}
              activeOpacity={0.8}
              onPress={() => router.push(tab === 'drivers' ? '/driver-edit' : '/user-edit')}
            >
              <Plus size={16} color={Colors.white} strokeWidth={2.5} />
              <Text style={styles.addText}>Add</Text>
            </TouchableOpacity>
          )}
        </View>
        {tab === 'drivers' ? (
          <View style={styles.hint}>
            <KeyRound size={13} color={Colors.gray500} />
            <Text style={styles.hintText}>Tap a driver to edit details or set their app password.</Text>
          </View>
        ) : !isAdmin ? (
          <View style={styles.hint}>
            <UserCog size={13} color={Colors.gray500} />
            <Text style={styles.hintText}>Only Admins can add or edit platform users.</Text>
          </View>
        ) : null}
      </View>

      {active.error ? (
        <ErrorState message={getApiErrorMessage(active.error)} onRetry={() => active.refetch()} className="flex-1" />
      ) : tab === 'drivers' ? (
        <FlatList
          data={driverRows}
          keyExtractor={(d) => d.id}
          renderItem={renderDriver}
          {...listProps}
          ListEmptyComponent={!drivers.isLoading ? <EmptyState title={query ? 'No matching drivers' : 'No drivers yet'} Icon={Users} className="mt-12" /> : null}
        />
      ) : (
        <FlatList
          data={userRows}
          keyExtractor={(u) => u.id}
          renderItem={renderUser}
          {...listProps}
          ListEmptyComponent={!users.isLoading ? <EmptyState title={query ? 'No matching users' : 'No users yet'} Icon={UserCog} className="mt-12" /> : null}
        />
      )}

      <OperatorSidebarDrawer visible={drawerVisible} onClose={() => setDrawerVisible(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.white,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: Typography.lg, fontWeight: '800', color: Colors.gray900 },
  subtitle: { fontSize: Typography.xs, color: Colors.gray500 },
  toolbar: {
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: Colors.gray100,
    borderRadius: Radius.md,
    padding: 3,
  },
  tab: { flex: 1, paddingVertical: 8, borderRadius: Radius.md - 2, alignItems: 'center' },
  tabActive: { backgroundColor: Colors.white, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  tabText: { fontSize: Typography.sm, fontWeight: '600', color: Colors.gray500 },
  tabTextActive: { color: Colors.gray900 },
  searchRow: { flexDirection: 'row', gap: Spacing.sm },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.gray100,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: { flex: 1, fontSize: Typography.sm, color: Colors.gray900, paddingVertical: 0 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.gray900,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    height: 40,
  },
  addText: { color: Colors.white, fontWeight: '700', fontSize: Typography.sm },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hintText: { fontSize: 12, color: Colors.gray500 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.gray100,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 13, fontWeight: '700', color: Colors.gray700 },
  name: { fontSize: Typography.base, fontWeight: '700', color: Colors.gray900 },
  sub: { fontSize: 12, color: Colors.gray500, marginTop: 1 },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full },
  pillText: { fontSize: 11, fontWeight: '700' },
});

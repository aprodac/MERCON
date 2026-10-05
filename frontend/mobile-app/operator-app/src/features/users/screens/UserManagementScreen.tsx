/**
 * User management — every account on the platform, behind three pills:
 *   Drivers     → driver profiles; tap one to edit details and set its app password.
 *   Users       → Admin / Operator logins; Admins can add and edit them, Operators
 *                 only view (the backend enforces the same: POST/PUT /users are Admin-only).
 *   No password → the drivers who can't sign in to the driver app yet.
 *
 * Rows follow the other list pages: avatar, name, a status line, a detail line.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, StatusBar, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Plus, UserCog, Users } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { useAuth } from '@mercon/mobile-shared/lib/auth-context';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { EmptyState, ErrorState, SkeletonBlock } from '@mercon/mobile-shared/ui';
import { operatorService, type OperatorDriver, type PlatformUser } from '@/lib/operator';
import { AppTopBar } from '@/components/AppTopBar';
import { FilterChips } from '@/components/FilterChips';
import { ListSearch, listPage } from '@/components/ListSearch';
import { CompanyAvatar, niceName, shortName } from '@/features/trips/create/components/ui';

type Tab = 'drivers' | 'nologin' | 'users';

const INK = '#3E3C3D';
const MUTED = '#6B6B76';
const AMBER = '#F59E0B';


export const USER_MANAGEMENT_KEYS = {
  drivers: ['user-management', 'drivers'] as const,
  users: ['user-management', 'users'] as const,
};

function matches(query: string, ...fields: (string | null | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => f?.toLowerCase().includes(q));
}

export default function UserManagementScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { role } = useAuth();
  const isAdmin = role === 'Admin';
  const [tab, setTab] = useState<Tab>(params.tab === 'users' || params.tab === 'nologin' ? params.tab : 'drivers');
  const [query, setQuery] = useState('');

  const drivers = useQuery({ queryKey: USER_MANAGEMENT_KEYS.drivers, queryFn: () => operatorService.driverAccounts() });
  const users = useQuery({ queryKey: USER_MANAGEMENT_KEYS.users, queryFn: () => operatorService.platformUsers() });

  const driverRows = useMemo(
    () => (drivers.data ?? []).filter((d) =>
      (tab !== 'nologin' || !d.user)
      && matches(query, `${d.first_name} ${d.last_name}`, d.phone_primary, d.license_number, d.ref_id)),
    [drivers.data, query, tab],
  );
  const userRows = useMemo(
    () => (users.data ?? []).filter((u) => matches(query, u.name, u.username, u.phone, u.email, u.role)),
    [users.data, query],
  );

  const active = tab === 'users' ? users : drivers;

  // One short line under the name; a tag only when something needs doing.
  const renderDriver = ({ item }: { item: OperatorDriver }) => {
    const name = `${item.first_name} ${item.last_name}`.trim();
    return (
      <TouchableOpacity style={styles.row} activeOpacity={0.8} onPress={() => router.push(`/driver-edit?id=${item.id}`)} accessibilityRole="button" accessibilityLabel={`Edit ${name}${item.user ? '' : ', no app password'}`}>
        <CompanyAvatar name={name} url={item.avatar_url ?? item.photo_url} size={42} />
        <View style={styles.rowText}>
          <Text style={styles.name} numberOfLines={1}>{shortName(name)}</Text>
          <Text style={styles.meta} numberOfLines={1}>{item.phone_primary || item.ref_id || 'No phone'}</Text>
        </View>
        {item.user || tab === 'nologin' ? null : <View style={styles.tag}><Text style={styles.tagText}>No password</Text></View>}
        <ChevronRight size={18} color="#B4B4BD" />
      </TouchableOpacity>
    );
  };

  const renderUser = ({ item }: { item: PlatformUser }) => (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={isAdmin ? 0.8 : 1}
      disabled={!isAdmin}
      onPress={() => router.push(`/user-edit?id=${item.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${isAdmin ? 'Edit ' : ''}${item.name}, ${item.role}`}
    >
      <CompanyAvatar name={item.name} size={42} />
      <View style={styles.rowText}>
        <Text style={styles.name} numberOfLines={1}>{niceName(item.name)}</Text>
        <Text style={styles.meta} numberOfLines={1}>{[item.role, item.username || item.phone].filter(Boolean).join('  ·  ')}</Text>
      </View>
      {item.status === 'Inactive' ? <View style={[styles.tag, styles.tagGray]}><Text style={[styles.tagText, { color: MUTED }]}>Inactive</Text></View> : null}
      {isAdmin ? <ChevronRight size={18} color="#B4B4BD" /> : null}
    </TouchableOpacity>
  );

  const onDrivers = tab !== 'users';
  const shownCount = onDrivers ? driverRows.length : userRows.length;
  const noLogin = drivers.data?.filter((d) => !d.user).length;
  const header = (
    <View style={listPage.header}>
      <FilterChips<Tab>
        value={tab}
        onChange={setTab}
        items={[
          { key: 'drivers', label: 'Drivers', count: drivers.data?.length ?? '–' },
          { key: 'users', label: 'Users', count: users.data?.length ?? '–' },
          { key: 'nologin', label: 'No password', dot: AMBER, count: noLogin ?? '–' },
        ]}
      />
      <ListSearch
        value={query}
        onChangeText={setQuery}
        placeholder={onDrivers ? 'Search name, phone, license' : 'Search name, username, phone'}
      />
      {!active.isLoading ? (
        <Text style={listPage.count}>
          {shownCount} {onDrivers ? (shownCount === 1 ? 'driver' : 'drivers') : (shownCount === 1 ? 'user' : 'users')}
        </Text>
      ) : null}
    </View>
  );

  const skeleton = (
    <View style={{ gap: 8 }}>
      {[0, 1, 2, 3].map((i) => <SkeletonBlock key={i} height={66} radius={16} />)}
    </View>
  );

  const listProps = {
    contentContainerStyle: listPage.list,
    ListHeaderComponent: header,
    showsVerticalScrollIndicator: false,
    ItemSeparatorComponent: () => <View style={{ height: 8 }} />,
    keyboardShouldPersistTaps: 'handled' as const,
    refreshControl: <RefreshControl refreshing={active.isRefetching} onRefresh={() => active.refetch()} tintColor={Colors.primary} />,
  };

  return (
    <SafeAreaView style={listPage.page} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F6F6F7" />

      <AppTopBar
        title="Users"
        actions={onDrivers || isAdmin
          ? [{ icon: Plus, label: onDrivers ? 'Add driver' : 'Add user', onPress: () => router.push(onDrivers ? '/driver-edit' : '/user-edit') }]
          : []}
      />

      {active.error ? (
        <ErrorState message={getApiErrorMessage(active.error)} onRetry={() => active.refetch()} className="flex-1" />
      ) : onDrivers ? (
        <FlatList
          data={driverRows}
          keyExtractor={(d) => d.id}
          renderItem={renderDriver}
          {...listProps}
          ListEmptyComponent={drivers.isLoading ? skeleton : (
            <EmptyState
              title={query ? 'No matching drivers' : tab === 'nologin' ? 'Every driver has an app password' : 'No drivers yet'}
              subtitle={query ? 'Try another name, phone or license.' : tab === 'nologin' ? 'Nothing to set up here.' : 'Tap + to add the first driver.'}
              Icon={Users}
              className="mt-8"
            />
          )}
        />
      ) : (
        <FlatList
          data={userRows}
          keyExtractor={(u) => u.id}
          renderItem={renderUser}
          {...listProps}
          ListEmptyComponent={users.isLoading ? skeleton : <EmptyState title={query ? 'No matching users' : 'No users yet'} subtitle={query ? 'Try another name, username or phone.' : undefined} Icon={UserCog} className="mt-8" />}
        />
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E9E9EC', paddingVertical: 11, paddingHorizontal: 14 },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 16, fontWeight: '600', color: INK, letterSpacing: -0.2 },
  meta: { fontSize: 13, color: MUTED, fontVariant: ['tabular-nums'] },
  tag: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: '#FFF6E5' },
  tagGray: { backgroundColor: '#F1F1F3' },
  tagText: { fontSize: 12, fontWeight: '600', color: '#B45309' },
});

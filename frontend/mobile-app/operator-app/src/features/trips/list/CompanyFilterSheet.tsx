/**
 * Pick one customer to see only their trips (TestFlight 29 Oct: "filter company
 * wise"). The Trips screen shows the choice as its scope chip, the same as when
 * opened from a customer's page.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, FlatList, ActivityIndicator } from 'react-native';
import { Building2, Search, X } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { AppModal } from '@mercon/mobile-shared/components/common/AppModal';
import { useCustomers } from '../../customers/hooks';

export function CompanyFilterSheet({ visible, onPick, onClose }: {
  visible: boolean;
  onPick: (customer: { id: string; name: string }) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);
  const { customers, loading, fetchNextPage, hasNextPage, isFetchingNextPage } = useCustomers({ search, status: 'active' });

  return (
    <AppModal visible={visible} onClose={onClose} type="bottom-sheet" title="Trips of one company" maxHeight="85%">
      <View style={s.searchBar}>
        <Search size={16} color={Colors.gray500} />
        <TextInput
          style={s.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search customers"
          placeholderTextColor={Colors.gray400}
          autoCorrect={false}
        />
        {query ? (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Clear search">
            <X size={16} color={Colors.gray500} />
          </TouchableOpacity>
        ) : null}
      </View>
      <FlatList
        data={customers}
        keyExtractor={(c) => c.id}
        style={{ maxHeight: 460 }}
        keyboardShouldPersistTaps="handled"
        onEndReached={() => { if (hasNextPage && !isFetchingNextPage) fetchNextPage(); }}
        onEndReachedThreshold={0.4}
        renderItem={({ item }) => (
          <TouchableOpacity style={s.row} onPress={() => onPick({ id: item.id, name: item.name })} activeOpacity={0.7}>
            <View style={s.icon}>
              <Building2 size={15} color="#0C447C" />
            </View>
            <Text style={s.name} numberOfLines={1}>{item.name}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          loading ? <ActivityIndicator style={{ paddingVertical: 20 }} color={Colors.gray500} /> : <Text style={s.empty}>No customer matches.</Text>
        }
        ListFooterComponent={isFetchingNextPage ? <ActivityIndicator style={{ paddingVertical: 10 }} color={Colors.gray500} /> : null}
      />
    </AppModal>
  );
}

const s = StyleSheet.create({
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, paddingHorizontal: 12, borderRadius: 12, backgroundColor: Colors.gray100, marginBottom: 6 },
  searchInput: { flex: 1, fontSize: 15, color: Colors.gray900 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.gray200 },
  icon: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#E6F1FB', alignItems: 'center', justifyContent: 'center' },
  name: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.gray900 },
  empty: { textAlign: 'center', color: Colors.gray500, paddingVertical: 20 },
});

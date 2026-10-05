/**
 * The search field above a list. Every list page uses this one so the field
 * is the same height, shape and place everywhere (under the status pills).
 */
import React from 'react';
import { ActivityIndicator, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Search, X } from 'lucide-react-native';

const INK = '#3E3C3D';
const MUTED = '#6B6B76';

interface ListSearchProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  /** Shows a spinner while results load. */
  loading?: boolean;
}

export function ListSearch({ value, onChangeText, placeholder, loading }: ListSearchProps) {
  return (
    <View style={s.search}>
      <Search size={17} color={MUTED} />
      <TextInput
        style={s.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9898A4"
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        accessibilityLabel={placeholder}
      />
      {loading ? <ActivityIndicator size="small" color={MUTED} /> : null}
      {value ? (
        <TouchableOpacity onPress={() => onChangeText('')} hitSlop={10} accessibilityLabel="Clear search">
          <X size={17} color={MUTED} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/** Shared list-page measurements, so every list starts and spaces the same. */
export const listPage = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F6F6F7' },
  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120 },
  header: { gap: 12, marginBottom: 12 },
  count: { fontSize: 16, fontWeight: '700', color: INK },
});

const s = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E9E9EC', paddingHorizontal: 14 },
  input: { flex: 1, fontSize: 15, color: INK, paddingVertical: 0 },
});

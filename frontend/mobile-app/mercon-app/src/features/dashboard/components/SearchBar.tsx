import React from 'react';
import { ActivityIndicator, TextInput, TouchableOpacity, View } from 'react-native';
import { Search, X } from 'lucide-react-native';
import { Colors, Radius, Shadows } from '@mercon/mobile-shared/theme/tokens';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
  isLoading?: boolean;
  className?: string;
}

export function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search trips, drivers, vehicles…',
  onSubmit,
  isLoading = false,
  className,
}: SearchBarProps) {
  return (
    <View
      className={`flex-row items-center gap-2.5 border bg-white px-3.5 py-3 ${className ?? ''}`}
      style={{ borderRadius: Radius.lg, borderColor: Colors.coolGray, ...Shadows.sm }}
    >
      {isLoading ? (
        <ActivityIndicator size={16} color={Colors.primary} />
      ) : (
        <Search size={16} color={Colors.gray500} strokeWidth={2} />
      )}

      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.gray400}
        onSubmitEditing={onSubmit}
        returnKeyType="search"
        accessibilityRole="search"
        accessibilityLabel={placeholder}
        style={{ paddingVertical: 0, fontSize: 14, fontWeight: '500', color: Colors.charcoal }}
        className="flex-1"
      />

      {!!value && (
        <TouchableOpacity
          onPress={() => onChangeText('')}
          accessibilityRole="button"
          accessibilityLabel="Clear search query"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          className="items-center justify-center rounded-full bg-gray-100 p-1"
        >
          <X size={14} color={Colors.gray500} strokeWidth={2} />
        </TouchableOpacity>
      )}
    </View>
  );
}

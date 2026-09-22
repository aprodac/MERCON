import React from 'react';
import { TextInput, View } from 'react-native';
import { Search } from 'lucide-react-native';
import { Colors, Radius, Shadows } from '@/theme/tokens';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
  className?: string;
}

export function SearchBar({ value, onChangeText, placeholder = 'Search trips, drivers, vehicles…', onSubmit, className }: SearchBarProps) {
  return (
    <View
      className={`flex-row items-center gap-2.5 border bg-white px-3.5 py-3 ${className ?? ''}`}
      style={{ borderRadius: Radius.lg, borderColor: Colors.coolGray, ...Shadows.sm }}
    >
      <Search size={16} color={Colors.gray500} strokeWidth={2} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.gray400}
        onSubmitEditing={onSubmit}
        returnKeyType="search"
        style={{ paddingVertical: 0, fontSize: 14, fontWeight: '500', color: Colors.charcoal }}
        className="flex-1"
      />
    </View>
  );
}

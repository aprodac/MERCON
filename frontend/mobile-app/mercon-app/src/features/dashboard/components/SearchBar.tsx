import React from 'react';
import { TextInput, View } from 'react-native';
import { Search } from 'lucide-react-native';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
  className?: string;
}

export function SearchBar({ value, onChangeText, placeholder = 'Search trips, drivers, vehicles…', onSubmit, className }: SearchBarProps) {
  return (
    <View className={`flex-row items-center gap-2.5 rounded-xl border border-[#EEF1F6] bg-white px-3.5 py-2.5 shadow-sm ${className ?? ''}`}>
      <Search size={16} color="#71717A" strokeWidth={2} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#A1A1AA"
        onSubmitEditing={onSubmit}
        returnKeyType="search"
        style={{ paddingVertical: 0 }}
        className="flex-1 text-[14px] font-medium text-[#3E3C3D]"
      />
    </View>
  );
}
